import assert from 'node:assert/strict';
import { readdirSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { canonical,sha256,keys,validateLock } from './contract.mjs';
import { OND_NOTICE_FILES,requiresNotices } from './archive.mjs';
export function releaseMetadata(lock,target,notices) {
  validateLock(lock);const t=lock.targets.find(t=>t.target===target);assert(t,'Unknown target');
  const metadata={schemaVersion:3,version:lock.version,target,sha256:t.binary.sha256,lockSha256:sha256(canonical(lock)),source:{kind:'ond-release',repository:lock.repository,repositoryId:lock.repositoryId,tag:lock.tag,commit:lock.commit,releaseId:lock.releaseId,assetId:t.archive.id,asset:t.archive.name,archiveSha256:t.archive.sha256}};
  if(requiresNotices(lock.version)) { assert(notices,'Ond notices must be extracted from the locked archive');metadata.notices=Object.fromEntries(OND_NOTICE_FILES.map(name=>{const bytes=notices instanceof Map?notices.get(name):notices[name];assert(Buffer.isBuffer(bytes)&&bytes.length>0,`Missing Ond notice: ${name}`);return [name,sha256(bytes)];})); }
  else assert(!notices,'Unexpected notices for pre-contract Ond release');
  return metadata;
}
export function verifyServer(lock,target,metadata,binary,notices) {
  assert(requiresNotices(lock.version)?notices:!notices,'Ond notice files missing or unexpected');
  assert.equal(canonical(metadata),canonical(releaseMetadata(lock,target,notices)),'Server provenance differs from release lock');assert.equal(sha256(binary),metadata.sha256,'Bundled binary differs from lock');
  if(requiresNotices(lock.version))for(const name of OND_NOTICE_FILES)assert.equal(sha256(notices instanceof Map?notices.get(name):notices[name]),metadata.notices[name],`Ond notice differs from verified archive: ${name}`);
  return metadata;
}

export function checkServerEntries(paths,target,version='0.1.2') {
  const binary=target==='linux-x86_64'?'ond-lsp':target==='windows-x86_64'?'ond-lsp.exe':null;
  assert(binary,'Unknown target');const expected=[binary,'ond-lsp.json',...(requiresNotices(version)?OND_NOTICE_FILES:[])];assert.deepEqual([...paths].sort(),expected.sort(),'Unexpected server files or binaries');
}
export function cleanOppositeBinary(directory,target) {
  assert(['linux-x86_64','windows-x86_64'].includes(target),'Unknown target');
  rmSync(join(directory,target==='linux-x86_64'?'ond-lsp.exe':'ond-lsp'),{force:true});
}
export function checkServerDirectory(directory,target,version='0.1.2') {
  const entries=readdirSync(directory,{withFileTypes:true});
  assert(entries.every(e=>e.isFile()),'Unexpected server directory or link');
  checkServerEntries(entries.map(e=>e.name),target,version);
}
