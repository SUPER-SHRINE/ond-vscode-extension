import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const grammar = JSON.parse(readFileSync(new URL("../syntaxes/ond.tmLanguage.json", import.meta.url), "utf8"));
const declaration = grammar.repository.declarations.patterns.find(pattern => pattern.match?.includes("const|func"));
const builtins = grammar.repository["builtin-functions"].patterns.map(pattern => new RegExp(pattern.match));

test("highlights current declarations and builtins without reserving removed names", () => {
    const declarationPattern = new RegExp(declaration.match);
    for (const word of ["const", "func", "struct", "type", "var"]) assert(declarationPattern.test(word));
    assert.equal(declarationPattern.test("interface"), false);
    assert.equal(builtins.some(pattern => pattern.test("load32(")), false);
    assert.equal(builtins.some(pattern => pattern.test("store32(")), false);
    assert(builtins.some(pattern => pattern.test("sizeof(")));
});
