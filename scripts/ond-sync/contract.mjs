import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export const REPOSITORY = 'SUPER-SHRINE/ond';
export const REPOSITORY_ID = 1401374287;
export const TARGETS = {
  'linux-x86_64': { rustTarget: 'x86_64-unknown-linux-gnu', extension: 'tar.gz', binary: 'ond-lsp' },
  'windows-x86_64': { rustTarget: 'x86_64-pc-windows-msvc', extension: 'zip', binary: 'ond-lsp.exe' }
};
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export function canonical(value) {
  const sort = v => Array.isArray(v) ? v.map(sort) : v !== null && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])])) : v;
  return JSON.stringify(sort(value), null, 2) + '\n';
}
export function keys(value, expected) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Expected object');
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), 'Unknown or missing fields');
}
export const hash = x => assert.match(x, /^[0-9a-f]{64}$/);
export const commit = x => assert.match(x, /^[0-9a-f]{40}$/);
export const version = x => assert.match(x, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
export const positive = x => assert(Number.isSafeInteger(x) && x > 0, 'Expected positive safe integer');
function asset(a, name) { keys(a, ['id', 'name', 'size', 'sha256']); positive(a.id); positive(a.size); assert(a.size<=100*1024*1024,'Asset too large'); hash(a.sha256); assert.equal(a.name, name); }
export function validateLock(lock) {
  keys(lock, ['schemaVersion','contract','repository','repositoryId','version','tag','commit','releaseId','manifest','targets']);
  assert.equal(lock.schemaVersion, 1); assert.equal(lock.repository, REPOSITORY); assert.equal(lock.repositoryId, REPOSITORY_ID);
  version(lock.version);assert(lock.version.split('.').every(n=>n.length<=9),'Version component too large'); assert.equal(lock.tag, lock.version); commit(lock.commit); positive(lock.releaseId);
  assert(['legacy-v1','manifest-v1'].includes(lock.contract));
  if (lock.contract === 'legacy-v1') {
    // 唯一の移行例外。新しいReleaseがmanifest無しで採用されることを防ぐ。
    assert.equal(lock.version, '0.1.1'); assert.equal(lock.manifest, null);
  } else { assert(compareVersions(lock.version,'0.1.2')>=0,'Manifest contract requires 0.1.2+'); asset(lock.manifest, `ond-${lock.version}-manifest.json`); }
  assert(Array.isArray(lock.targets)); assert.deepEqual(lock.targets.map(t => t.target), Object.keys(TARGETS));
  for (const t of lock.targets) {
    keys(t, ['target','rustTarget','archive','checksum','binary']); const p = TARGETS[t.target];
    assert.equal(t.rustTarget, p.rustTarget);
    const name = `ond-${lock.version}-${t.target}.${p.extension}`;
    asset(t.archive, name); asset(t.checksum, name + '.sha256');
    keys(t.binary, ['name','sha256']); assert.equal(t.binary.name,p.binary); hash(t.binary.sha256);
  }
  const ids = lock.targets.flatMap(t => [t.archive.id,t.checksum.id]).concat(lock.manifest ? [lock.manifest.id] : []);
  assert.equal(new Set(ids).size, ids.length, 'Duplicate asset IDs');
  return lock;
}
export function parseLock(bytes) {
  const lock = JSON.parse(String(bytes)); validateLock(lock);
  assert.equal(String(bytes), canonical(lock), 'Lock must be canonical JSON (duplicates/noncanonical bytes rejected)');
  return lock;
}
export function verifyBytes(bytes, expected) { assert.equal(bytes.length,expected.size,'Asset size mismatch'); assert.equal(sha256(bytes),expected.sha256,'Asset checksum mismatch'); }
export function compareVersions(a,b) { version(a);version(b); const x=a.split('.').map(BigInt),y=b.split('.').map(BigInt);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]<y[i]?-1:1;}return 0; }

export function parseCanonical(bytes) {
  const text=Buffer.isBuffer(bytes)?bytes.toString('utf8'):String(bytes),value=JSON.parse(text);
  assert.equal(text,canonical(value),'Canonical JSON required (duplicate keys rejected)');return value;
}
export function base64(text) {
  assert.equal(typeof text,'string');assert(text.length%4===0 && !/[^A-Za-z0-9+/=]/.test(text),'Invalid base64');
  const bytes=Buffer.from(text,'base64');assert.equal(bytes.toString('base64'),text);return bytes;
}

export const DISTRIBUTION=[
  'config/ond-release.schema.json','config/ond-test-policy.json',
  'scripts/ond-sync/apply.mjs','scripts/ond-sync/archive.mjs','scripts/ond-sync/bundle.mjs',
  'scripts/ond-sync/cli.mjs','scripts/ond-sync/contract.mjs','scripts/ond-sync/github.mjs',
  'scripts/ond-sync/planner.mjs','scripts/ond-sync/release.mjs','scripts/ond-sync/server.mjs','scripts/platform.mjs'
];
