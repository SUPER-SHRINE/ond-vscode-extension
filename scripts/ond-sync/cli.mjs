import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdirSync,chmodSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { canonical,parseCanonical,parseLock,sha256,commit,REPOSITORY } from './contract.mjs';
import { execution,verifyExecution,ROOT } from './bundle.mjs';
import { plan,verifyEvidence,LOCK_PATH,CHANGELOG_PATH,normalizeInput } from './planner.mjs';
import { GitHub } from './github.mjs';
import { resolveRelease,verifyReleaseState,materialize,verifyVisibility } from './release.mjs';
import { apply,githubRemote } from './apply.mjs';
import { releaseMetadata,cleanOppositeBinary,checkServerDirectory } from './server.mjs';
import { getPlatform } from '../platform.mjs';
const [command,...args]=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){assert(/^--[a-z-]+$/.test(args[i])&&args[i+1]&&!args[i+1].startsWith('--'),'Expected --key value');assert(!(args[i] in options),'Duplicate option');options[args[i]]=args[i+1];}
const allowed={resolve:['--tag','--base-sha','--out'],plan:['--input','--out'],apply:['--input','--plan','--input-sha','--plan-id'],acquire:['--lock','--out','--archives'],check:['--lock']};
assert(command in allowed,'Use resolve, plan, apply, acquire, or check');for(const key of Object.keys(options))assert(allowed[command].includes(key),'Unknown option');
const required=key=>{assert(options[key],`Missing ${key}`);return options[key];};
const ond=new GitHub(REPOSITORY,process.env.OND_RELEASE_TOKEN),extension=new GitHub('SUPER-SHRINE/ond-vscode-extension',process.env.GH_TOKEN||process.env.GITHUB_TOKEN);
if(command==='check'){const lock=parseLock(readFileSync(options['--lock']||join(ROOT,LOCK_PATH)));console.log(`Release lock valid: ${lock.version}`);}
if(command==='resolve'){
  const baseSHA=required('--base-sha');commit(baseSHA);
  const repository=await extension.call('');assert.equal(repository.id,1404564933);assert.equal(repository.full_name,'SUPER-SHRINE/ond-vscode-extension');
  const ref=await extension.call('/git/ref/heads/develop');assert.equal(ref.object.sha,baseSHA,'STALE_BASE');
  const baseCommit=await extension.call(`/git/commits/${baseSHA}`),tree=await extension.call(`/git/trees/${baseCommit.tree.sha}?recursive=1`);assert.equal(tree.truncated,false,'Truncated tree');
  const baseTree=tree.tree.filter(e=>e.type!=='tree').map(e=>({path:e.path,mode:e.mode,oid:e.sha})),baseFiles={};
  for(const path of [LOCK_PATH,CHANGELOG_PATH]){const entry=baseTree.find(e=>e.path===path);assert(entry,'Install bootstrap lock in develop before resolve');const blob=await extension.call(`/git/blobs/${entry.oid}`);assert.equal(blob.encoding,'base64');const bytes=Buffer.from(blob.content.replace(/\n/g,''),'base64');const content=bytes.toString('utf8');assert(bytes.equals(Buffer.from(content)),'Invalid UTF-8 base file');baseFiles[path]={mode:entry.mode,content};}
  await verifyVisibility(ond,extension);
  const candidate=await resolveRelease(ond,required('--tag')),runtime=execution();
  const input=normalizeInput({schemaVersion:1,plannerDigest:sha256(canonical(runtime)),execution:runtime,base:{repository:repository.full_name,repositoryId:repository.id,ref:'develop',commit:baseSHA,tree:baseCommit.tree.sha},baseTree,baseFiles,candidate:candidate.lock,evidence:candidate.evidence});
  plan(input);const bytes=canonical(input);writeFileSync(required('--out'),bytes);console.log(`SNAPSHOT_VERIFIED input SHA-256: ${sha256(bytes)}`);
}
if(command==='plan'||command==='apply'){
  const bytes=readFileSync(required('--input')),input=parseCanonical(bytes);verifyExecution(input);const result=plan(input);
  if(command==='plan'){writeFileSync(required('--out'),canonical(result));console.log(`PLANNED ${result.planID} tree ${result.tree}`);}
  else {await verifyVisibility(ond,extension);assert.equal(sha256(bytes),required('--input-sha'),'Unapproved input');assert.equal(result.planID,required('--plan-id'),'Unapproved plan');const supplied=parseCanonical(readFileSync(required('--plan')));const state=await apply(input,supplied,githubRemote(extension),lock=>verifyReleaseState(ond,lock));console.log(canonical(state));}
}
if(command==='acquire'){
  const lock=parseLock(readFileSync(options['--lock']||join(ROOT,LOCK_PATH))),platform=getPlatform(),target=lock.targets.find(t=>t.target===platform.target);
  let blobs;
  if(options['--archives']){const descriptors=lock.targets.flatMap(t=>[t.archive,t.checksum]).concat(lock.manifest?[lock.manifest]:[]);const evidence=descriptors.map(a=>({name:a.name,content:readFileSync(resolve(options['--archives'],a.name)).toString('base64')}));blobs=verifyEvidence(lock,evidence);}
  else {await verifyVisibility(ond,extension);const result=await materialize(ond,lock);blobs=new Map([...result].map(([key,v])=>[lock.targets.find(t=>t.target===key).archive.name,v.archive]));}
  const {extractBinary,extractNotices}=await import('./archive.mjs');const extension=platform.target==='linux-x86_64'?'tar.gz':'zip',archive=blobs.get(target.archive.name),notices=extractNotices(archive,extension,lock.version),output=resolve(required('--out'));mkdirSync(output,{recursive:true});writeFileSync(join(output,platform.binary),extractBinary(archive,platform.binary,extension));if(process.platform==='linux')chmodSync(join(output,platform.binary),0o755);
  if(notices)for(const [name,bytes] of Object.entries(notices))writeFileSync(join(output,name),bytes);
  cleanOppositeBinary(output,target.target);writeFileSync(join(output,'ond-lsp.json'),canonical(releaseMetadata(lock,target.target,notices)));checkServerDirectory(output,target.target,lock.version);console.log(`Verified release binary ${lock.version} ${target.target} ${target.binary.sha256}`);
}
