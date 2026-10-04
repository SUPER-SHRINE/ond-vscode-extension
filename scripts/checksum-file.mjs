import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const input = process.argv[2];
if (!input) {
    throw new Error("usage: node scripts/checksum-file.mjs <file>");
}

const path = resolve(input);
if (!existsSync(path)) {
    throw new Error(`File was not found: ${path}`);
}

const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
const checksumPath = `${path}.sha256`;
writeFileSync(checksumPath, `${sha256}  ${basename(path)}\n`, "utf8");
console.log(`SHA-256: ${sha256}`);
console.log(`Checksum file: ${checksumPath}`);
