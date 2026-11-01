import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

const entrypoint = readFileSync(new URL("../src/extension.ts", import.meta.url), "utf8");

test("activation does not create filename-specific status UI", () => {
    assert.doesNotMatch(entrypoint, /createTestFileStatus|createStatusBarItem|testFileStatus/);
    assert.equal(existsSync(new URL("../src/testFileStatus.ts", import.meta.url)), false);
});
