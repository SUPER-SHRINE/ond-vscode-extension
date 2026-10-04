import assert from 'node:assert/strict';
import { extractBinary } from './archive.mjs';
export { extractBinary } from './archive.mjs';
import { REPOSITORY,REPOSITORY_ID,TARGETS,canonical,sha256,validateLock,verifyBytes,version,keys } from './contract.mjs';
export async function releaseFacts(api,tag) {
  version(tag); const repo=await api.call(''); assert.equal(repo.id,REPOSITORY_ID);assert.equal(repo.full_name,REPOSITORY);
  const release=await api.call(`/releases/tags/${tag}`);assert(!release.draft&&!release.prerelease,'Stable published Release required');assert.equal(release.tag_name,tag);assert(release.published_at,'Published Release required');
  let ref=await api.call(`/git/ref/tags/${tag}`);let object=ref.object;
  for(let n=0;object.type==='tag' && n<5;n++)object=(await api.call(`/git/tags/${object.sha}`)).object;
  assert.equal(object.type,'commit','Tag must resolve to commit');
  const comparison=await api.call(`/compare/${object.sha}...main`);assert(['identical','ahead'].includes(comparison.status),'Release commit is not in main');
  return {release,commit:object.sha};
}
function findAsset(release,name) { const a=release.assets.filter(a=>a.name===name);assert.equal(a.length,1,`Missing/duplicate asset: ${name}`);return a[0]; }
async function getAsset(api,release,name) {
  const a=findAsset(release,name), bytes=await api.call(`/releases/assets/${a.id}`,{binary:true});
  assert.equal(bytes.length,a.size);const digest=sha256(bytes);if(a.digest)assert.equal(a.digest,`sha256:${digest}`);
  return {descriptor:{id:a.id,name:a.name,size:a.size,sha256:digest},bytes};
}
export async function resolveRelease(api,tag) {
  const facts=await releaseFacts(api,tag); const lock={schemaVersion:1,contract:tag==='0.1.1'?'legacy-v1':'manifest-v1',repository:REPOSITORY,repositoryId:REPOSITORY_ID,version:tag,tag,commit:facts.commit,releaseId:facts.release.id,manifest:null,targets:[]};
  const blobs=new Map(),evidence=[];
  for(const [target,p] of Object.entries(TARGETS)) {
    const name=`ond-${tag}-${target}.${p.extension}`;
    const archive=await getAsset(api,facts.release,name),checksum=await getAsset(api,facts.release,name+'.sha256');
    evidence.push({name,content:archive.bytes.toString('base64')},{name:name+'.sha256',content:checksum.bytes.toString('base64')});
    assert.equal(checksum.bytes.toString('utf8').trim(),`${archive.descriptor.sha256}  ${name}`,'Checksum file mismatch');
    const binary=extractBinary(archive.bytes,p.binary,p.extension);
    lock.targets.push({target,rustTarget:p.rustTarget,archive:archive.descriptor,checksum:checksum.descriptor,binary:{name:p.binary,sha256:sha256(binary)}});
    blobs.set(target,{archive:archive.bytes,binary});
  }
  if(lock.contract==='manifest-v1') {
    const m=await getAsset(api,facts.release,`ond-${tag}-manifest.json`);lock.manifest=m.descriptor;evidence.push({name:m.descriptor.name,content:m.bytes.toString('base64')});
    const value=JSON.parse(m.bytes.toString('utf8'));
    const expected={schemaVersion:1,repository:REPOSITORY,version:tag,commit:facts.commit,targets:lock.targets.map(t=>({target:t.target,rustTarget:t.rustTarget,archive:{name:t.archive.name,sha256:t.archive.sha256,size:t.archive.size},binary:t.binary}))};
    assert.deepEqual(value,expected,'Producer manifest mismatch');
    const compact=JSON.stringify(JSON.parse(canonical(expected)))+'\n';assert.equal(m.bytes.toString('utf8'),compact,'Noncanonical producer manifest');
  }
  validateLock(lock);
  assert.deepEqual(facts.release.assets.map(a=>a.name).sort(),evidence.map(e=>e.name).sort(),'Release contract asset set mismatch');
  // resolver途中でrelease/tag/asset metadataが変化していないことも確認。
  await verifyReleaseState(api,lock);
  return {lock,blobs,evidence:evidence.sort((a,b)=>Buffer.compare(Buffer.from(a.name),Buffer.from(b.name)))};
}
export async function verifyReleaseState(api,lock) {
  validateLock(lock);const f=await releaseFacts(api,lock.tag);assert.equal(f.commit,lock.commit,'Tag moved');assert.equal(f.release.id,lock.releaseId,'Release replaced');
  assert.deepEqual(f.release.assets.map(a=>a.name).sort(),lock.targets.flatMap(t=>[t.archive.name,t.checksum.name]).concat(lock.manifest?[lock.manifest.name]:[]).sort(),'Release contract asset set mismatch');
  for(const a of lock.targets.flatMap(t=>[t.archive,t.checksum]).concat(lock.manifest?[lock.manifest]:[])) {
    const current=findAsset(f.release,a.name);assert.equal(current.state,'uploaded','Asset not uploaded');assert.equal(current.id,a.id,'Asset replaced');assert.equal(current.size,a.size);if(current.digest)assert.equal(current.digest,`sha256:${a.sha256}`);
    verifyBytes(await api.call(`/releases/assets/${a.id}`,{binary:true}),a);
  }
}
export async function materialize(api,lock) {
  const result=await resolveRelease(api,lock.tag);assert.equal(canonical(result.lock),canonical(lock),'Release differs from adopted lock');return result.blobs;
}

export async function verifyVisibility(ond,extension) {
  const source=await ond.call(''),target=await extension.call('');
  assert.equal(source.id,REPOSITORY_ID);assert.equal(target.id,1403086732);assert.equal(source.full_name,REPOSITORY);assert.equal(target.full_name,'SUPER-SHRINE/ond-vscode-extension');
  assert.equal(typeof source.private,'boolean');assert.equal(typeof target.private,'boolean');
  assert(!(source.private&&!target.private),'BLOCKED: private Ond binaries need explicit public disclosure approval');
}
