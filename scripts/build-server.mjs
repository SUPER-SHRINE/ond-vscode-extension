import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSourceArtifact } from "./source-artifact.mjs";
import { withSourceSnapshot } from "./source-checkout.mjs";
import { cleanOppositeBinary,checkServerDirectory } from "./ond-sync/server.mjs";
import { getPlatform } from "./platform.mjs";

const platform = getPlatform();
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(scriptDirectory, "..");
const destinationDirectory = resolve(extensionRoot, "server");
const destination = resolve(destinationDirectory, platform.binary);
const metadataPath = resolve(destinationDirectory, "ond-lsp.json");

if(process.env.OND_TEST_SOURCE_LANE==='local') {
    const server=buildLocalServer();mkdirSync(destinationDirectory,{recursive:true});writeFileSync(destination,server.binary);if(process.platform==='linux')chmodSync(destination,0o755);
    rmSync(resolve(destinationDirectory,platform.binary==='ond-lsp'?'ond-lsp.exe':'ond-lsp'),{force:true});
    writeFileSync(metadataPath,JSON.stringify({schemaVersion:2,version:server.version,target:platform.target,sha256:createHash('sha256').update(readFileSync(destination)).digest('hex'),source:server.sourceMetadata},null,2)+'\n');
} else {
    const {parseLock}=await import('./ond-sync/contract.mjs');const {verifyServer}=await import('./ond-sync/server.mjs');
    const {OND_NOTICE_FILES,requiresNotices}=await import('./ond-sync/archive.mjs');
    const lock=parseLock(readFileSync(resolve(extensionRoot,'config/ond-release.lock.json')));
    // Host jobs consume the separately verified server artifact and do not receive Ond credentials.
    if(!existsSync(destination)||!existsSync(metadataPath)||requiresNotices(lock.version)&&OND_NOTICE_FILES.some(name=>!existsSync(resolve(destinationDirectory,name)))) {
        const acquire=spawnSync(process.execPath,[resolve(scriptDirectory,'ond-sync/cli.mjs'),'acquire','--out',destinationDirectory],{stdio:'inherit'});
        if(acquire.error||acquire.status!==0)throw new Error('Locked release acquisition failed.');
    }
    cleanOppositeBinary(destinationDirectory,platform.target);checkServerDirectory(destinationDirectory,platform.target,lock.version);
    const notices=requiresNotices(lock.version)?Object.fromEntries(OND_NOTICE_FILES.map(name=>[name,readFileSync(resolve(destinationDirectory,name))])):undefined;
    verifyServer(lock,platform.target,JSON.parse(readFileSync(metadataPath,'utf8')),readFileSync(destination),notices);
    console.log(`Bundled verified Ond release ${lock.version} (${platform.target})`);
}

function buildLocalServer() {
    const configuredOndRepository = process.env.OND_REPOSITORY_PATH;
    const ondRepository = configuredOndRepository
        ? isAbsolute(configuredOndRepository)
            ? configuredOndRepository
            : resolve(extensionRoot, configuredOndRepository)
        : resolve(extensionRoot, "..", "ond");
    return withSourceSnapshot(ondRepository,process.env.OND_SOURCE_SHA,snapshot=>{
        const manifest=resolve(snapshot.directory,'Cargo.toml'),version=readWorkspaceVersion(manifest);
        if(version!==process.env.OND_SOURCE_VERSION)throw new Error('Explicit Ond source version mismatch.');
        const binary=buildSourceArtifact(snapshot.directory,manifest,platform);
        return {binary,version,sourceMetadata:{kind:'local-build',commit:snapshot.commit}};
    });
}

function readWorkspaceVersion(manifestPath) {
    const manifest = readFileSync(manifestPath, "utf8");
    const workspacePackage = manifest.match(
        /^\[workspace\.package\][\s\S]*?^version\s*=\s*"([^"]+)"/m
    );
    if (!workspacePackage) {
        throw new Error(`Could not read workspace package version from ${manifestPath}.`);
    }
    return workspacePackage[1];
}
