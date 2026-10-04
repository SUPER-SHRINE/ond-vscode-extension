import { getPlatform } from "./platform.mjs";
import { spawnSync } from "node:child_process";
import { readFileSync,rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyVsixNotices } from "./verify-vsix-notices.mjs";

const platform = getPlatform();
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(scriptDirectory, "..");
const manifest = JSON.parse(readFileSync(resolve(extensionRoot, "package.json"), "utf8"));
const outputName = `ond-vscode-extension-${manifest.version}-${platform.target}.vsix`;
// rebuildは既存host証拠を失効させる。公開先のassetはこのscriptで扱わない。
rmSync(resolve(extensionRoot,`${outputName}.verified.json`),{force:true});
const vsce = resolve(extensionRoot, "node_modules", "@vscode", "vsce", "vsce");

const packageResult = spawnSync(
    process.execPath,
    [vsce, "package", "--target", platform.vsceTarget, "--out", outputName],
    { cwd: extensionRoot, stdio: "inherit" }
);
if (packageResult.error) {
    throw packageResult.error;
}
if (packageResult.status !== 0) {
    throw new Error(`vsce package failed with exit code ${packageResult.status ?? "unknown"}.`);
}

const vsixPath = resolve(extensionRoot, outputName);
verifyVsixNotices(readFileSync(vsixPath));
console.log("VSIX third-party notices verified.");

const checksumResult = spawnSync(
    process.execPath,
    [resolve(scriptDirectory, "checksum-file.mjs"), outputName],
    { cwd: extensionRoot, stdio: "inherit" }
);
if (checksumResult.error) {
    throw checksumResult.error;
}
if (checksumResult.status !== 0) {
    throw new Error(`checksum generation failed with exit code ${checksumResult.status ?? "unknown"}.`);
}
