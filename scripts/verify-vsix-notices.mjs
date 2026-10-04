import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zipEntries } from "./ond-sync/archive.mjs";

const extensionRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const bundledPackages = [
    ["vscode-languageclient", "License.txt"],
    ["vscode-languageserver-protocol", "License.txt"],
    ["vscode-languageserver-types", "License.txt"],
    ["vscode-jsonrpc", "License.txt"],
    ["minimatch", "LICENSE"],
    ["semver", "LICENSE"],
    ["balanced-match", "LICENSE.md"],
    ["brace-expansion", "LICENSE"]
];

const normalized = (text) => text.replace(/\s+/g, " ").trim();

export function verifyNoticeDocument(notices) {
    const lock = JSON.parse(readFileSync(resolve(extensionRoot, "package-lock.json"), "utf8"));
    const ondLock = JSON.parse(readFileSync(resolve(extensionRoot, "config/ond-release.lock.json"), "utf8"));
    const noticeText = normalized(notices);
    assert(noticeText.includes(`Ond Language Server ${ondLock.version}`), "Ond Language Server notice version differs from the release lock.");
    for (const [name, licenseFile] of bundledPackages) {
        const packageLock = lock.packages[`node_modules/${name}`];
        assert(packageLock, `Bundled runtime package is missing from package-lock.json: ${name}`);
        assert(noticeText.includes(`${name} ${packageLock.version}`), `Third-party notice is missing ${name} ${packageLock.version}.`);
        const licensePath = resolve(extensionRoot, "node_modules", name, licenseFile);
        const licenseText = normalized(readFileSync(licensePath, "utf8"));
        assert(noticeText.includes(licenseText), `Third-party notice does not include the complete ${name} license text.`);
    }
    const ondLicense = normalized(readFileSync(resolve(extensionRoot, "LICENSE.md"), "utf8"));
    assert(noticeText.includes(ondLicense), "Third-party notice does not include the complete Ond MIT license text.");
}

export function verifyVsixNotices(vsixBytes) {
    const entries = zipEntries(vsixBytes);
    const path = "extension/THIRD_PARTY_NOTICES.md";
    assert(entries.has(path), `VSIX is missing ${path}.`);
    const notices = entries.get(path).toString("utf8");
    assert.equal(notices, readFileSync(resolve(extensionRoot, "THIRD_PARTY_NOTICES.md"), "utf8"), "Packaged third-party notice differs from the reviewed source file.");
    verifyNoticeDocument(notices);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const vsixPath = process.argv[2];
    assert(vsixPath, "Usage: node scripts/verify-vsix-notices.mjs <file.vsix>");
    verifyVsixNotices(readFileSync(resolve(vsixPath)));
    console.log("VSIX third-party notices verified.");
}
