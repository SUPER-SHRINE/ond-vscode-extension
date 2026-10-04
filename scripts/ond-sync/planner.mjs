// 純粋なplanner。I/O・時計・乱数・環境変数・networkへの依存を持たない。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonical,sha256,parseLock,validateLock,compareVersions,commit,keys,base64,verifyBytes,DISTRIBUTION } from './contract.mjs';
import { extractBinary,extractNotices } from './archive.mjs';
export const LOCK_PATH='config/ond-release.lock.json';
export const CHANGELOG_PATH='CHANGELOG.md';
export const gitObject=(kind,data)=>createHash('sha1').update(`${kind} ${Buffer.byteLength(data)}\0`).update(data).digest('hex');
export function treeHash(entries) {
  const root=new Map();
  for(const e of entries) {
    keys(e,['path','mode','oid']);assert.match(e.path,/^[A-Za-z0-9_.@+/-]+$/);assert(!e.path.split('/').some(p=>p==='.'||p==='..'||p===''),'Invalid tree path');
    assert(['100644','100755','120000','160000'].includes(e.mode));commit(e.oid);
    const parts=e.path.split('/');let node=root;
    for(const dir of parts.slice(0,-1)){if(!node.has(dir))node.set(dir,new Map());assert(node.get(dir) instanceof Map,'File/directory collision');node=node.get(dir);}
    assert(!node.has(parts.at(-1)),'Duplicate tree path');node.set(parts.at(-1),e);
  }
  const digest=node=>{
    const entries=[...node].map(([name,value])=>value instanceof Map?{name,mode:'40000',oid:digest(value),sort:name+'/'}:{name,mode:value.mode,oid:value.oid,sort:name});
    entries.sort((a,b)=>Buffer.compare(Buffer.from(a.sort),Buffer.from(b.sort)));
    const bytes=Buffer.concat(entries.flatMap(e=>[Buffer.from(`${e.mode} ${e.name}\0`),Buffer.from(e.oid,'hex')]));return gitObject('tree',bytes);
  };return digest(root);
}
export function verifyEvidence(lock,evidence) {
  validateLock(lock);assert(Array.isArray(evidence));
  const descriptors=lock.targets.flatMap(t=>[t.archive,t.checksum]).concat(lock.manifest?[lock.manifest]:[]);
  assert.equal(evidence.length,descriptors.length);const blobs=new Map();
  for(const e of evidence){keys(e,['name','content']);assert(!blobs.has(e.name),'Duplicate evidence');const d=descriptors.find(a=>a.name===e.name);assert(d,'Unknown evidence');const bytes=base64(e.content);verifyBytes(bytes,d);blobs.set(e.name,bytes);}
  for(const t of lock.targets){assert.equal(blobs.get(t.checksum.name).toString('utf8').trim(),`${t.archive.sha256}  ${t.archive.name}`);const extension=t.archive.name.endsWith('.zip')?'zip':'tar.gz';assert.equal(sha256(extractBinary(blobs.get(t.archive.name),t.binary.name,extension)),t.binary.sha256,'Archive binary mismatch');extractNotices(blobs.get(t.archive.name),extension,lock.version);}
  if(lock.manifest){const expected={schemaVersion:1,repository:lock.repository,version:lock.version,commit:lock.commit,targets:lock.targets.map(t=>({target:t.target,rustTarget:t.rustTarget,archive:{name:t.archive.name,size:t.archive.size,sha256:t.archive.sha256},binary:t.binary}))};assert.equal(blobs.get(lock.manifest.name).toString('utf8'),JSON.stringify(JSON.parse(canonical(expected)))+'\n','Producer manifest mismatch');}
  return blobs;
}
export function normalizeInput(input) {
  return {...input,baseTree:[...input.baseTree].sort((a,b)=>Buffer.compare(Buffer.from(a.path),Buffer.from(b.path))),execution:{...input.execution,modules:[...input.execution.modules].sort((a,b)=>Buffer.compare(Buffer.from(a.path),Buffer.from(b.path)))},evidence:[...input.evidence].sort((a,b)=>Buffer.compare(Buffer.from(a.name),Buffer.from(b.name)))};
}
export function plan(input) {
  keys(input,['schemaVersion','plannerDigest','execution','base','baseTree','baseFiles','candidate','evidence']);assert.equal(input.schemaVersion,1);assert.match(input.plannerDigest,/^[0-9a-f]{64}$/);
  keys(input.execution,['nodeVersion','nodeSha256','modules']);assert.match(input.execution.nodeVersion,/^v22\.\d+\.\d+$/);assert.match(input.execution.nodeSha256,/^[0-9a-f]{64}$/);assert(Array.isArray(input.execution.modules)&&input.execution.modules.length===DISTRIBUTION.length);
  const modulePaths=new Set();for(const m of input.execution.modules){keys(m,['path','content','sha256']);assert.match(m.path,/^(scripts\/ond-sync\/[a-z-]+\.(mjs|ps1)|config\/ond-[a-z.-]+\.json|scripts\/platform\.mjs)$/);assert(!modulePaths.has(m.path),'Duplicate module');modulePaths.add(m.path);assert.equal(sha256(base64(m.content)),m.sha256,'Module checksum mismatch');}
  assert.deepEqual([...modulePaths].sort(),[...DISTRIBUTION].sort(),'Unknown/missing distribution module');
  assert(Array.isArray(input.baseTree)&&input.baseTree.length<=100000);assert(Array.isArray(input.evidence)&&input.evidence.length<=5);
  input=normalizeInput(input);assert.equal(input.plannerDigest,sha256(canonical(input.execution)),'Planner distribution mismatch');
  keys(input.base,['repository','repositoryId','ref','commit','tree']);assert.equal(input.base.repository,'SUPER-SHRINE/ond-vscode-extension');assert.equal(input.base.repositoryId,1403086732);assert.equal(input.base.ref,'develop');commit(input.base.commit);commit(input.base.tree);
  assert.equal(treeHash(input.baseTree),input.base.tree,'Base tree mismatch');
  keys(input.baseFiles,[LOCK_PATH,CHANGELOG_PATH]);
  for(const [path,file] of Object.entries(input.baseFiles)) {
    keys(file,['mode','content']);assert.equal(file.mode,'100644');assert.equal(typeof file.content,'string');
    const entry=input.baseTree.find(e=>e.path===path);assert(entry,'Missing base file');assert.equal(entry.mode,file.mode);assert.equal(entry.oid,gitObject('blob',file.content),'Base file differs from tree');
  }
  const old=parseLock(input.baseFiles[LOCK_PATH].content),next=validateLock(input.candidate);
  verifyEvidence(next,input.evidence);
  const relation=compareVersions(next.version,old.version);assert(relation>=0,'Version downgrade rejected');
  if(relation===0)assert.equal(canonical(next),canonical(old),'Same-version asset replacement rejected');
  const planID=sha256(canonical(input));
  const files=[];
  if(relation>0) {
    files.push({path:LOCK_PATH,mode:'100644',content:canonical(next)});
    const changelog=input.baseFiles[CHANGELOG_PATH].content, marker='## [未リリース]\n';assert.equal(changelog.split(marker).length,2,'Missing/duplicate changelog section');
    const entry=`\n- 同梱Ondを${next.version}へ更新（commit \`${next.commit}\`、lock SHA-256 \`${sha256(canonical(next))}\`）。\n`;
    files.push({path:CHANGELOG_PATH,mode:'100644',content:changelog.replace(marker,marker+entry)});
  }
  files.sort((a,b)=>Buffer.compare(Buffer.from(a.path),Buffer.from(b.path)));
  const generated=input.baseTree.map(e=>{const f=files.find(f=>f.path===e.path);return f?{path:f.path,mode:f.mode,oid:gitObject('blob',f.content)}:e;});
  return {schemaVersion:1,planID,inputHash:planID,base:input.base,plannerDigest:input.plannerDigest,lockHash:sha256(canonical(next)),files,tree:treeHash(generated),branch:`feature/ond-update-${next.version}-${planID.slice(0,16)}`,noop:files.length===0};
}
