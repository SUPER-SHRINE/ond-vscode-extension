const assert = require('node:assert/strict');

function assertExpectedDiagnostic(diagnostics, expected) {
  assert.equal(diagnostics.length, 1,
    `Expected exactly one Error diagnostic, received ${diagnostics.length}`);
  const diagnostic = diagnostics[0];
  const actual = {
    source: diagnostic.source,
    message: diagnostic.message,
    line: diagnostic.range.start.line
  };
  assert.equal(actual.source, expected.source, `Unexpected diagnostic source: ${JSON.stringify(actual)}`);
  assert.equal(actual.message, expected.message, `Unexpected diagnostic message: ${JSON.stringify(actual)}`);
  assert.equal(actual.line, expected.line, `Unexpected diagnostic line: ${JSON.stringify(actual)}`);
  return actual;
}

module.exports = { assertExpectedDiagnostic };
