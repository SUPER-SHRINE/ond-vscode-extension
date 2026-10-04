import assert from "node:assert/strict";
import test from "node:test";
import { getPlatform } from "./platform.mjs";

test("Windows keeps its existing binary, asset and Marketplace target names", () => {
    assert.deepEqual(getPlatform("win32", "x64", undefined), {
        target: "windows-x86_64", vsceTarget: "win32-x64", binary: "ond-lsp.exe"
    });
});
test("Linux uses an executable without the Windows suffix", () => {
    assert.deepEqual(getPlatform("linux", "x64", "2.35"), {
        target: "linux-x86_64", vsceTarget: "linux-x64", binary: "ond-lsp"
    });
});
test("unsupported architecture, OS and musl hosts fail before packaging", () => {
    for (const [os, arch, glibc] of [["linux", "arm64", "2.35"], ["win32", "arm64", null],
        ["darwin", "x64", null], ["linux", "x64", null]]) {
        assert.throws(() => getPlatform(os, arch, glibc), /Unsupported packaging host/);
    }
});
