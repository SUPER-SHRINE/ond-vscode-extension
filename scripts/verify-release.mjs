import { checkServerDirectory } from "./ond-sync/server.mjs";
import { getPlatform } from "./platform.mjs";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const platform = getPlatform();
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(scriptDirectory, "..");
const binaryPath = resolve(extensionRoot, "server", platform.binary);
const metadataPath = resolve(extensionRoot, "server", "ond-lsp.json");

for (const path of [resolve(extensionRoot, "dist", "extension.js"), binaryPath, metadataPath]) {
    if (!existsSync(path)) {
        throw new Error(`Release file is missing: ${path}`);
    }
}

const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
if(process.env.OND_TEST_SOURCE_LANE==='local') {
    checkServerDirectory(resolve(extensionRoot,"server"),platform.target);
    if(metadata.schemaVersion!==2||metadata.target!==platform.target||metadata.source.kind!=='local-build'||metadata.source.commit!==process.env.OND_SOURCE_SHA||metadata.version!==process.env.OND_SOURCE_VERSION) throw new Error('Local source lane provenance mismatch.');
    if(createHash('sha256').update(readFileSync(binaryPath)).digest('hex')!==metadata.sha256)throw new Error('Local binary checksum mismatch.');
} else {
    const {parseLock}=await import('./ond-sync/contract.mjs');const {verifyServer,checkServerDirectory}=await import('./ond-sync/server.mjs');const {OND_NOTICE_FILES,requiresNotices}=await import('./ond-sync/archive.mjs');
    const lock=parseLock(readFileSync(resolve(extensionRoot,'config/ond-release.lock.json')));checkServerDirectory(resolve(extensionRoot,"server"),platform.target,lock.version);
    const notices=requiresNotices(lock.version)?Object.fromEntries(OND_NOTICE_FILES.map(name=>[name,readFileSync(resolve(extensionRoot,'server',name))])):undefined;
    verifyServer(lock,platform.target,metadata,readFileSync(binaryPath),notices);
}
console.log(`Release files verified: ond-lsp ${metadata.version} (${metadata.sha256})`);
