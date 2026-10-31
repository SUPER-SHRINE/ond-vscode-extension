import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const grammar = JSON.parse(readFileSync(new URL("../syntaxes/ond.tmLanguage.json", import.meta.url), "utf8"));

// Exercise ordered rules and begin/end state across lines without adding a test dependency.
// The grammar's regex subset is shared by JavaScript and Oniguruma; native TextMate QA
// separately checks the editor engine. This runner intentionally covers no other syntax.
function tokenize(source, root = grammar, states) {
    const frames = [{ rule: root }];
    function* expand(patterns) {
        for (const rule of patterns ?? []) {
            if (rule.include) {
                const target = rule.include === "$self" ? grammar : grammar.repository[rule.include.slice(1)];
                if (target.match || target.begin) yield target;
                else yield* expand(target.patterns);
            } else yield rule;
        }
    }
    const scopes = () => frames.flatMap(frame => frame.rule.name ? [frame.rule.name] : []);
    return source.map(line => {
        const result = Array.from({ length: line.length }, () => []);
        let offset = 0;
        let steps = 0;
        const paint = (start, end, names) => {
            for (let column = start; column < end; column++) result[column] = [...names];
        };
        while (offset <= line.length) {
            assert(++steps < 2000, "grammar must make progress");
            const current = frames.at(-1).rule;
            const candidates = current.end ? [{ regex: current.end, rule: current, kind: "end" }] : [];
            for (const rule of expand(current.patterns)) {
                candidates.push({ regex: rule.match ?? rule.begin, rule, kind: rule.match ? "match" : "begin" });
            }
            let next;
            for (const candidate of candidates) {
                const regex = new RegExp(candidate.regex, candidate.regex.includes("\\p{") ? "dgu" : "dg");
                regex.lastIndex = offset;
                const match = regex.exec(line);
                if (match && (!next || match.index < next.match.index)) next = { ...candidate, match };
            }
            if (!next) {
                paint(offset, line.length, scopes());
                break;
            }
            const { rule, match, kind } = next;
            paint(offset, match.index, scopes());
            if (kind === "begin") frames.push({ rule });
            const tokenScopes = [...scopes(), ...(kind === "match" && rule.name ? [rule.name] : [])];
            paint(match.index, match.index + match[0].length, tokenScopes);
            const captures = rule[kind === "begin" ? "beginCaptures" : kind === "end" ? "endCaptures" : "captures"];
            for (const [group, capture] of Object.entries(captures ?? {})) {
                const span = match.indices[Number(group)];
                if (span && capture.name) for (let column = span[0]; column < span[1]; column++) result[column].push(capture.name);
                if (span && capture.patterns) {
                    const captured = tokenize([line.slice(span[0], span[1])], capture)[0];
                    for (let column = span[0]; column < span[1]; column++) result[column].push(...captured[column - span[0]]);
                }
            }
            if (kind === "end") frames.pop();
            assert(match[0].length || kind !== "match", "empty match rules must make progress");
            offset = match.index + match[0].length;
        }
        states?.push(frames.length);
        return result;
    });
}

function check(source, expectations) {
    const lines = Array.isArray(source) ? source : [source];
    const tokens = tokenize(lines);
    for (const [row, word, scope, occurrence = 0] of expectations) {
        let column = -1;
        for (let index = 0; index <= occurrence; index++) column = lines[row].indexOf(word, column + 1);
        assert(column >= 0, `missing fixture token ${word}`);
        const actual = tokens[row][column];
        if (scope?.startsWith("!")) assert(!actual.includes(scope.slice(1)), `${word} leaked ${scope.slice(1)}: ${actual}`);
        else if (scope) assert(actual.includes(scope), `${word} in ${lines[row]}: expected ${scope}, got ${actual}`);
        else assert(!actual.some(name => /^(?:meta\.(?:asm|role)|variable\.other\.readwrite|keyword\.other)/.test(name)), `${word} leaked context: ${actual}`);
    }
}

const call = "entity.name.function.call.ond";
const keyword = "keyword.other.ond";
const register = "variable.other.readwrite.ond";
const type = "entity.name.type.ond";
const label = "entity.name.function.declaration.ond";

test("keeps the current declarations and builtin set", () => {
    const declaration = grammar.repository.declarations.patterns.find(pattern => pattern.match?.includes("const|func"));
    const pattern = new RegExp(declaration.match);
    for (const word of ["const", "func", "struct", "type", "var"]) assert(pattern.test(word));
    assert.equal(pattern.test("interface"), false);
    check("load32(0); store32(0, 1); sizeof(u32)", [[0, "load32", call], [0, "store32", call], [0, "sizeof", "support.function.builtin.ond"]]);
});

test("highlights complete integer literals in Ond expressions", () => {
    const valid = ["0xFF", "0Xff", "0b1010", "0B1010", "0o755", "0O755", "0x_FF", "0b_101", "0o_17", "0755", "0_600", "1_000", "0", "42"];
    const source = `func values() { var value: u32 = ${valid.join(" + ")}; }`;
    const tokens = tokenize([source])[0];
    let cursor = source.indexOf("= ") + 2;
    for (const literal of valid) {
        const column = source.indexOf(literal, cursor);
        assert(column >= 0, `missing fixture literal ${literal}`);
        for (let offset = 0; offset < literal.length; offset++) {
            assert(tokens[column + offset].includes("constant.numeric.integer.ond"), `${literal} was not fully highlighted`);
        }
        cursor = column + literal.length;
    }
    check("var 日本0xFF: u32 = 0xFF; var text: string = \"0o755\"", [
        [0, "0xFF", "!constant.numeric.integer.ond"],
        [0, "0xFF", "constant.numeric.integer.ond", 1],
        [0, "0o755", "!constant.numeric.integer.ond"],
    ]);
    for (const invalid of ["0x", "0b_", "0o__7", "1_", "1__0"]) {
        const result = tokenize([`var value: u32 = ${invalid};`])[0];
        const column = `var value: u32 = ${invalid};`.indexOf(invalid);
        assert(!result.slice(column, column + invalid.length).every(scopes => scopes.includes("constant.numeric.integer.ond")), `${invalid} was fully highlighted`);
    }
    check("var ratio: f32 = 1.25", [[0, "1.25", "constant.numeric.float.ond"]]);
});

test("preserves builtin and control precedence in root, role, and nested blocks", () => {
    for (const prefix of ["", "role Debug { ", "role Debug { if true { "]) {
        check(`${prefix}sizeof(u32); alloc[u32](1); if (true) {}`, [
            [0, "sizeof", "support.function.builtin.ond"],
            [0, "alloc", "support.function.builtin.ond"],
            [0, "if (", "keyword.control.ond"],
        ]);
    }
});

test("keeps ordinary asm and role calls and function declarations", () => {
    for (const source of ["_ = asm() + 1", "_ = asm[u32](1)", "asm()", "asm /* call */ () + 1"]) {
        // Existing generic calls accept spaces; comment-separated calls stay ordinary identifiers.
        check(source, [[0, "asm", source.includes("/*") ? null : call]]);
    }
    check("func asm() {}", [[0, "asm", label]]);
    check("func role() {}", [[0, "role", label]]);
    check("role()", [[0, "role", call]]);
    for (const source of ["role /* call */()", "role /* call */(value)"]) check(source, [[0, "role", null]]);
    check("var role: u32 = 1; var noreturn: u32 = 2; var r1: u32 = 3", [[0, "role", null], [0, "noreturn", null], [0, "r1", null]]);
    check("value.method[u32](1)", [[0, "method", "entity.name.function.method.ond"]]);
});

test("progresses through commented and multiline asm headers to the body", () => {
    for (const source of [
        ["asm (r1 <- value) /* input */ { ADD r2,r1,r0,0 }"],
        ["asm /* inputs */ (r1 <- value) { ADD r2,r1,r0,0 }"],
        ["asm (r1 <- value)", "/* input */", "{ ADD r2,r1,r0,0 }"],
        ["asm /* inputs", " */ (r1 <- value) { ADD r2,r1,r0,0 }"],
        ["asm(", " r1 <- compute(grouped(value, nested(2))),", " r2 -> output,", ") // inputs", "{ ADD r2,r1,r0,0 }"],
        ["asm noreturn /* inputs */ (r1 <- target) { ADD r2,r1,r0,0 }"],
        ["asm () /* empty */ { ADD r2,r1,r0,0 }"],
    ]) {
        // A line ending in asm( is also an ordinary call prefix. TextMate cannot
        // recolor that earlier line when a later binding or body resolves the header.
        check(source, [[0, "asm", source[0] === "asm(" ? call : keyword], [source.length - 1, "ADD", keyword], [source.length - 1, "r2", register]]);
    }
});

test("progresses through role headers and restores scope after nested bodies", () => {
    check(["role Debug,", " Release {", " if true { role 日本語 { asm { ADD r1,r0,r0,1 } } }", "}", "var ADD: u32 = 1"], [
        [0, "role", keyword], [0, "Debug", type], [1, "Release", type],
        [2, "role", keyword], [2, "日本語", type], [2, "ADD", keyword], [4, "ADD", null],
    ]);
    check("role /* choose */ Debug { func value() {} }", [[0, "role", keyword], [0, "Debug", type], [0, "value", label]]);
    check(["role /* choose", " */ 日本語 {", "}", "role()"], [[0, "role", keyword], [1, "日本語", type], [3, "role", call]]);
});

test("gives asm labels priority over register and mnemonic spellings", () => {
    check("asm { r1: ADD: ADD r2,r0,r0,0 }", [[0, "r1", label], [0, "ADD", label], [0, "ADD", keyword, 1], [0, "r2", register]]);
});

test("limits registers and binding directions to their asm contexts", () => {
    check(["asm(", " r1 <- choose((r1 + 1), a<-b),", " r2 -> output,", " r3 <-> value,", ") {", " ADD r2,r1,r0,0x_FF", "}", "var ADD: u32 = r1"], [
        [1, "r1", register], [1, "r1", "!variable.other.readwrite.ond", 1], [1, "choose", call], [1, "<-", "keyword.operator.ond"],
        [2, "r2", register], [3, "r3", register], [3, "<->", "keyword.operator.ond"],
        [5, "ADD", keyword], [5, "0x_FF", "constant.numeric.integer.ond"], [7, "ADD", null], [7, "r1", null],
    ]);
    for (const literal of ["0", "0755", "0_600", "0x_FF", "0b_101", "0o_17", "1_000"]) {
        check(`asm { ADD r1,r0,r0,${literal} }`, [[0, literal, "constant.numeric.integer.ond", literal === "0" ? 2 : 0]]);
    }
});

test("ordinary multiline asm calls do not affect following Ond code", () => {
    for (const first of ["_ = asm(", "asm("]) {
        check([first, " 1)", "var y: u32 = sizeof(u32)", "if true {", " var ADD: u32 = 1", "}"], [
            [0, "asm", call], [1, "1", "constant.numeric.integer.ond"],
            [2, "var", "storage.type.declaration.ond"], [2, "sizeof", "support.function.builtin.ond"],
            [3, "if", "keyword.control.ond"], [4, "ADD", null],
        ]);
    }
});

test("binding comments are whitespace and RHS comparisons stay ordinary", () => {
    for (const header of [
        "asm(/* input */ r1 <- value, /* output */ r2 -> output)",
        "asm(r1 /* input */ <- value, r2 /* output */ -> output)",
    ]) {
        check(header + " { ADD r2,r1,r0,0 }", [[0, "r1", register], [0, "r2", register], [0, "<-", "keyword.operator.ond"], [0, "/*", "comment.block.ond"], [0, "ADD", keyword]]);
    }
    check(["asm(", " /* input */ r1 /* direction */ <- r1<-rhs,", " /* output */ r2 /* direction */ -> output,", ") { ADD r2,r1,r0,0 }"], [
        [0, "asm", call], [1, "r1", register], [1, "r1", "!variable.other.readwrite.ond", 1],
        [1, "/*", "comment.block.ond"], [1, "/*", "comment.block.ond", 1],
        [2, "r2", register], [3, "ADD", keyword],
    ]);
    check(["asm(r1 <- value +", " r1<-rhs) { ADD r2,r1,r0,0 }"], [[1, "r1", "!variable.other.readwrite.ond"], [1, "ADD", keyword]]);
});

test("ordinary role variables keep conversion and subsequent declarations", () => {
    for (const separator of [" ", " /* conversion */ "]) {
        check(["var role: u8 = 1", "var converted: u32 = role" + separator + "as u32", "var next: u32 = sizeof(u32)"], [
            [1, "role", null], [1, "as", "keyword.operator.word.ond"],
            [2, "var", "storage.type.declaration.ond"], [2, "sizeof", "support.function.builtin.ond"],
        ]);
    }
    check("role asMode { var value: u32 = 1 }", [[0, "role", keyword], [0, "asMode", type]]);
});

test("ordinary asm calls close before an independent block", () => {
    for (const prefix of ["", "_ = "]) {
        for (const args of ["()", "(1)", "(value, nested(1))", "(/* ordinary */ 1)", "(\n 1)", "(\n value, nested(1))", "(\n /* ordinary */ 1)"]) {
            const callLines = (prefix + "asm" + args).split("\n");
            // Ordinary arguments resolve the prefix as a call. No provisional frame
            // may remain after its closing parenthesis to capture a later block.
            const states = [];
            tokenize(callLines, grammar, states);
            assert.equal(states.at(-1), 1, `ordinary call left an open grammar frame: ${callLines}`);
            const block = callLines.length;
            check([...callLines, "/* independent block */", "{ var ADD: u32 = sizeof(u32) }", "if true { var next: u32 = 1 }"], [
                [0, "asm", call], [block + 1, "var", "storage.type.declaration.ond"],
                [block + 1, "sizeof", "support.function.builtin.ond"], [block + 1, "ADD", null], [block + 2, "if", "keyword.control.ond"],
            ]);
        }
    }
});

test("empty multiline asm bindings enter a same-line body after the closing parenthesis", () => {
    for (const close of [") { ADD r2,r1,r0,0 }", ") /* body */ { ADD r2,r1,r0,0 }"]) {
        check(["asm(", " /* empty bindings */", close, "var next: u32 = sizeof(u32)"], [
            [0, "asm", call], [2, "ADD", keyword], [2, "r2", register],
            [3, "var", "storage.type.declaration.ond"], [3, "sizeof", "support.function.builtin.ond"],
        ]);
    }
});

test("asm comparisons in member and expression calls do not create assembly state", () => {
    for (const callee of ["obj.asm", "obj . asm", "obj. asm", "_ = asm", "return asm"]) {
        for (const args of ["(r1<-rhs)", "(\n r1<-rhs)", "(/* input */ r1<-rhs)"]) {
            const source = (callee + args).split("\n");
            const states = [];
            tokenize(source, grammar, states);
            assert.equal(states.at(-1), 1, "expression call left an open grammar frame: " + source);
            check([...source, "{ var ADD: u32 = sizeof(u32) }"], [
                [source.length - 1, "r1", "!variable.other.readwrite.ond"],
                [source.length, "var", "storage.type.declaration.ond"],
                [source.length, "sizeof", "support.function.builtin.ond"], [source.length, "ADD", null],
            ]);
        }
    }
    for (const source of ["asm { ADD r2,r1,r0,0 }", "func f() { asm { ADD r2,r1,r0,0 } }", "var x: u32 = 1; asm { ADD r2,r1,r0,0 }"]) {
        check(source, [[0, "asm", keyword], [0, "ADD", keyword], [0, "r2", register]]);
    }
});

test("statement comments preserve asm promotion without opening expression contexts", () => {
    for (const source of [
        ["func f() { /* comment */ asm(r1 <- value) { ADD r2,r1,r0,0 } }"],
        ["func f() {/*comment*/asm(r1 <- value) { ADD r2,r1,r0,0 } }"],
        ["role Debug {/*comment*/asm(r1 <- value) { ADD r2,r1,r0,0 } }"],
        ["var x: u32 = 1;/*comment*/asm(r1 <- value) { ADD r2,r1,r0,0 }"],
        ["/* comment */ asm(", " r1 <- value,", ") { ADD r2,r1,r0,0 }"],
        ["func f() { /* spanning", " comment */ asm(r1 <- value) { ADD r2,r1,r0,0 } }"],
        ["/* spanning", " comment */ asm(", " r1 <- value,", ") { ADD r2,r1,r0,0 }"],
        ["// statement comment", "asm(r1 <- value) { ADD r2,r1,r0,0 }"],
    ]) {
        const body = source.findIndex(line => line.includes("ADD"));
        check([...source, "var next: u32 = sizeof(u32)"], [
            [body, "ADD", keyword], [body, "r2", register],
            [source.length, "var", "storage.type.declaration.ond"], [source.length, "sizeof", "support.function.builtin.ond"],
        ]);
    }
    for (const source of [
        ["_ = /*comment*/ asm(r1<-rhs)"],
        ["obj./*comment*/asm(r1<-rhs)"],
        ["_ = /* spanning", " comment */ asm(r1<-rhs)"],
        ["obj./* spanning", " comment */asm(r1<-rhs)"],
        ["/* statement comment */ _ = asm(r1<-rhs)"],
    ]) {
        const states = [];
        tokenize(source, grammar, states);
        assert.equal(states.at(-1), 1, "ordinary commented call left an open grammar frame");
        check([...source, "{ var ADD: u32 = sizeof(u32) }"], [
            [source.length - 1, "r1", "!variable.other.readwrite.ond"],
            [source.length, "ADD", null], [source.length, "sizeof", "support.function.builtin.ond"],
        ]);
    }
});

test("comments inside an ambiguous asm argument list wait for a real binding", () => {
    for (const source of [
        ["asm( /* call comment", " */ 1)"],
        ["asm( // call comment", " 1)"],
    ]) {
        const states = [];
        tokenize(source, grammar, states);
        assert.equal(states.at(-1), 1, "ordinary commented argument left an open grammar frame");
        check([...source, "{ var ADD: u32 = sizeof(u32) }"], [
            [0, "asm", call], [1, "1", "constant.numeric.integer.ond"],
            [source.length, "ADD", null], [source.length, "var", "storage.type.declaration.ond"],
            [source.length, "sizeof", "support.function.builtin.ond"],
        ]);
    }
    for (const source of [
        ["asm( /* binding comment", " */ r1 <- value) { ADD r2,r1,r0,0 }"],
        ["asm( // binding comment", " r1 <- value) { ADD r2,r1,r0,0 }"],
    ]) {
        check(source, [[0, "asm", call], [1, "r1", register], [1, "ADD", keyword], [1, "r2", register]]);
    }
});
