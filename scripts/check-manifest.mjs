import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(scriptDirectory, "..");
const manifest = JSON.parse(readFileSync(resolve(extensionRoot, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(resolve(extensionRoot, "package-lock.json"), "utf8"));

if (!SEMVER.test(manifest.version)) {
    throw new Error(`package.json version must be strict SemVer: ${manifest.version}`);
}
if (lock.version !== manifest.version || lock.packages?.[""]?.version !== manifest.version) {
    throw new Error("package.json and package-lock.json versions do not match.");
}
if (manifest.publisher === "kagura-local") {
    throw new Error("The development-only publisher must not be used for a release.");
}
for (const field of ["name", "displayName", "description", "publisher", "license", "repository", "bugs", "homepage", "icon"]) {
    if (!manifest[field]) {
        throw new Error(`Required extension manifest field is missing: ${field}`);
    }
}

const languageIconPaths = manifest.contributes.languages.flatMap((language) =>
    Object.values(language.icon ?? {})
);
for (const relativePath of new Set([
    "README.md",
    "CHANGELOG.md",
    "LICENSE.md",
    manifest.icon,
    ...languageIconPaths,
    "language-configuration.json",
    "syntaxes/ond.tmLanguage.json",
    "themes/ond-dark-color-theme.json",
    "THIRD_PARTY_NOTICES.md"
])) {
    readFileSync(resolve(extensionRoot, relativePath));
}

for (const relativePath of [
    "language-configuration.json",
    "syntaxes/ond.tmLanguage.json",
    "themes/ond-dark-color-theme.json"
]) {
    JSON.parse(readFileSync(resolve(extensionRoot, relativePath), "utf8"));
}

console.log(`Extension manifest is valid for release: ${manifest.name} ${manifest.version}`);

const {parseLock}=await import('./ond-sync/contract.mjs');
parseLock(readFileSync(resolve(extensionRoot,'config/ond-release.lock.json')));
