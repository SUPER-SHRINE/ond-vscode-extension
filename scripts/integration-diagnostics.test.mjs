import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { assertExpectedDiagnostic } = require("./integration/diagnostics.cjs");
const expected = {
    source: "ond-lsp",
    message: "boolean literal requires bool type",
    line: 3
};

function diagnostic(overrides = {}) {
    return {
        source: expected.source,
        message: expected.message,
        range: { start: { line: expected.line } },
        ...overrides
    };
}

test("accepts the expected source diagnostic at the changed fixture line", () => {
    assert.deepEqual(assertExpectedDiagnostic([diagnostic()], expected), {
        source: expected.source,
        message: expected.message,
        line: expected.line
    });
});

test("rejects unrelated Error diagnostics, including panic errors", () => {
    assert.throws(() => assertExpectedDiagnostic([
        diagnostic(), diagnostic({ message: "project metadata reload failed" })
    ], expected), /exactly one Error diagnostic/);
    assert.throws(() => assertExpectedDiagnostic([
        diagnostic({ message: "project metadata reload failed" })
    ], expected), /Unexpected diagnostic message/);
    assert.throws(() => assertExpectedDiagnostic([
        diagnostic({ message: "compiler panicked while validating the document" })
    ], expected), /Unexpected diagnostic message/);
});

test("rejects the wrong diagnostic source, location, kind and message", () => {
    assert.throws(() => assertExpectedDiagnostic(
        [diagnostic({ source: "other-server" })], expected), /Unexpected diagnostic source/);
    assert.throws(() => assertExpectedDiagnostic(
        [diagnostic({ range: { start: { line: 2 } } })], expected), /Unexpected diagnostic line/);
    assert.throws(() => assertExpectedDiagnostic(
        [diagnostic({ message: "expected expression" })], expected), /Unexpected diagnostic message/);
});

test("accepts the expected syntax diagnostic separately", () => {
    const syntax = { ...expected, message: "expected expression" };
    assert.equal(assertExpectedDiagnostic([diagnostic({ message: syntax.message })], syntax).message,
        "expected expression");
});
