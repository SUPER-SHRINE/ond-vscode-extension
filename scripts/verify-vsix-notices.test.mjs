import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { verifyNoticeDocument } from "./verify-vsix-notices.mjs";

const notices = readFileSync(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8");

test("third-party notice contains complete licenses for all locked runtime packages", () => {
    assert.doesNotThrow(() => verifyNoticeDocument(notices));
});

test("third-party notice rejects a missing copyright or license body", () => {
    const shortened = notices.replace("Copyright (c) 2011-2023 Isaac Z. Schlueter and Contributors", "");
    assert.throws(() => verifyNoticeDocument(shortened), /complete minimatch license text/);
});

test("third-party notice requires the ond-lsp version from the release lock", () => {
    assert.throws(() => verifyNoticeDocument(notices.replace("Ond Language Server 0.1.3", "Ond Language Server 0.1.2")), /version differs from the release lock/);
});
