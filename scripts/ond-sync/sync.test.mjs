import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { readFileSync,mkdtempSync,writeFileSync,rmSync,mkdirSync,existsSync,readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { canonical,sha256,parseLock,parseCanonical,validateLock,DISTRIBUTION } from './contract.mjs';
import { plan,treeHash,gitObject,LOCK_PATH,CHANGELOG_PATH,verifyEvidence } from './planner.mjs';
import { execution,ROOT,verifyExecution } from './bundle.mjs';
import { buildSourceArtifact,selectSourceArtifact } from '../source-artifact.mjs';
import { apply,githubRemote } from './apply.mjs';
import { resolveRelease,verifyReleaseState,verifyVisibility } from './release.mjs';
import { crc32,zipEntries,extractBinary,extractNotices,OND_NOTICE_FILES,requiresNotices } from './archive.mjs';
import { reconcileAssets,verifyCandidate } from './publication.mjs';
import { getPlatform } from '../platform.mjs';
import { releaseMetadata,verifyServer,cleanOppositeBinary,checkServerDirectory,checkServerEntries } from './server.mjs';
import { clone,old,zero,tar,zip,candidate,input,remote } from './fixtures.mjs';
test('Git checkout preserves canonical lock and hashed input bytes with core.autocrlf=true',()=>{
  const dir=mkdtempSync(join(tmpdir(),'ond-checkout-bytes-')),source=join(dir,'source'),checkout=join(dir,'checkout');
  const git=(cwd,args)=>{const result=spawnSync('git',['-C',cwd,...args],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout;};
  try {
    const paths=git(ROOT,['ls-files','-z','--','config','scripts','icons']).split('\0').filter(Boolean),bytes=new Map(paths.map(path=>[path,readFileSync(join(ROOT,path))]));
    assert(DISTRIBUTION.every(path=>bytes.has(path)),'Fixture must cover every planner module');
    mkdirSync(source);git(source,['init','--initial-branch=fixture']);git(source,['config','core.autocrlf','false']);
    git(source,['config','user.name','Fixture']);git(source,['config','user.email','fixture@example.invalid']);git(source,['config','core.hooksPath',join(dir,'no-hooks')]);
    // 新規の隔離 fixture だけに空の初回 commit を作成する。
    git(source,['commit','--allow-empty','-m','first commit']);
    for(const [path,content] of bytes){mkdirSync(join(source,path,'..'),{recursive:true});writeFileSync(join(source,path),content);}
    writeFileSync(join(source,'.gitattributes'),Buffer.concat([readFileSync(join(ROOT,'.gitattributes')),Buffer.from('\ncontrol.txt !text !eol\n')]));
    writeFileSync(join(source,'control.txt'),'autocrlf control\n');git(source,['add','.']);git(source,['commit','-m','checkout fixture']);
    git(dir,['-c','core.autocrlf=true','clone','--no-checkout','--local',source,checkout]);git(checkout,['config','core.autocrlf','true']);git(checkout,['checkout','HEAD','--','.']);
    assert.equal(readFileSync(join(checkout,'control.txt'),'utf8'),'autocrlf control\r\n','Control proves checkout actually enables CRLF conversion');
    for(const [path,content] of bytes)assert(readFileSync(join(checkout,path)).equals(content),`Checkout changed bytes: ${path}`);
    const lock=readFileSync(join(checkout,LOCK_PATH));assert.deepEqual(parseLock(lock),parseLock(bytes.get(LOCK_PATH)));parseCanonical(readFileSync(join(checkout,'config/ond-test-policy.json')));
    assert.throws(()=>parseLock(lock.toString().replace(/\n/g,'\r\n')),/canonical JSON/,'Canonical validation must still reject CRLF');
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('canonical lock rejects duplicate keys, unknown fields, unsafe integers, targets, contract fallback',()=>{assert.equal(parseLock(canonical(old)).version,'0.1.1');assert.throws(()=>parseLock(canonical(old).replace('"commit":','"commit": "'+old.commit+'",\n  "commit":')));for(const change of [v=>v.unknown=true,v=>v.releaseId=Number.MAX_SAFE_INTEGER+1,v=>v.targets.reverse(),v=>v.targets[0].archive.id=v.targets[1].archive.id,v=>v.targets[0].binary.name='other',v=>v.targets[0].archive.size=101*1024*1024]){const v=clone(old);change(v);assert.throws(()=>validateLock(v));}const v=candidate().lock;v.manifest=null;assert.throws(()=>validateLock(v));v.contract='legacy-v1';assert.throws(()=>validateLock(v));});
test('closed planner is canonical and stable across input order and independent processes',()=>{const i=input(),a=plan(i),j=clone(i);j.baseTree.reverse();j.evidence.reverse();j.execution.modules.reverse();assert.equal(canonical(plan(j)),canonical(a));assert.deepEqual(a.files.map(f=>f.path),[CHANGELOG_PATH,LOCK_PATH]);assert(a.files.every(f=>f.mode==='100644'));const dir=mkdtempSync(join(tmpdir(),'ond-plan-test-'));try{writeFileSync(join(dir,'input.json'),canonical(i));for(const name of ['a','b']){const p=spawnSync(process.execPath,[join(ROOT,'scripts/ond-sync/cli.mjs'),'plan','--input',join(dir,'input.json'),'--out',join(dir,name)],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);}assert(readFileSync(join(dir,'a')).equals(readFileSync(join(dir,'b'))));}finally{rmSync(dir,{recursive:true,force:true});}});
test('wrong asset, binary, manifest, runtime, tree, unknown module and downgrade fail closed',()=>{for(const change of [i=>i.candidate.targets[0].binary.sha256='0'.repeat(64),i=>i.evidence[0].content=Buffer.from('wrong').toString('base64'),i=>i.base.tree=zero,i=>i.baseFiles[CHANGELOG_PATH].content+='manual',i=>i.execution.modules[0].sha256='0'.repeat(64),i=>i.execution.modules[0].path='config/ond-unknown.json',i=>i.schemaVersion=2,i=>i.candidate.version=i.candidate.tag='0.1.0',i=>i.candidate.targets.push(i.candidate.targets[0])]){const i=input();change(i);assert.throws(()=>plan(i));}const i=input();i.execution.nodeSha256='0'.repeat(64);i.plannerDigest=sha256(canonical(i.execution));assert.throws(()=>verifyExecution(i));});
test('same adopted lock is NOOP; same version replacement stops',()=>{const i=input();i.baseFiles[LOCK_PATH].content=canonical(i.candidate);i.baseTree.find(e=>e.path===LOCK_PATH).oid=gitObject('blob',i.baseFiles[LOCK_PATH].content);i.base.tree=treeHash(i.baseTree);assert.equal(plan(i).noop,true);i.candidate.releaseId++;assert.throws(()=>plan(i),/Same-version/);});
test('archive rejects path traversal, symlink, duplicate binary, corrupted ZIP CRC',()=>{assert.throws(()=>extractBinary(tar('../ond-lsp',Buffer.from('x')),'ond-lsp','tar.gz'));assert.throws(()=>extractBinary(tar('ond-lsp',Buffer.from('x'),50),'ond-lsp','tar.gz'));const bytes=zip({'ond-lsp.exe':Buffer.from('test')});assert.equal(extractBinary(bytes,'ond-lsp.exe','zip').toString(),'test');bytes[42]^=1;assert.throws(()=>zipEntries(bytes));});
test('Ond 0.1.3 notices pass through verified archives byte-for-byte and are mandatory',()=>{
  assert.equal(requiresNotices('0.1.2'),false);assert.equal(requiresNotices('0.1.3'),true);assert.equal(requiresNotices('0.10.0'),true);
  const notices={'THIRD-PARTY-NOTICES.txt':Buffer.from('third-party\r\n'),'COPYRIGHT-library.html':Buffer.from('<p>copyright</p>\n')},archive=zip({'ond-lsp.exe':Buffer.from('binary'),...notices});
  const extracted=extractNotices(archive,'zip','0.1.3');for(const name of OND_NOTICE_FILES)assert(extracted[name].equals(notices[name]));
  assert.throws(()=>extractNotices(zip({'ond-lsp.exe':Buffer.from('binary')}),'zip','0.1.3'),/Missing Ond archive notice/);
  assert.equal(extractNotices(zip({'ond-lsp.exe':Buffer.from('binary')}),'zip','0.1.2'),null);
  const c=candidate(),lock=c.lock;lock.version=lock.tag='0.1.3';lock.manifest.name='ond-0.1.3-manifest.json';for(const t of lock.targets){t.archive.name=t.archive.name.replace('0.1.2','0.1.3');t.checksum.name=t.checksum.name.replace('0.1.2','0.1.3');}
  const target='linux-x86_64',t=lock.targets.find(t=>t.target===target),binary=Buffer.from('new locked binary');t.binary.sha256=sha256(binary);const metadata=releaseMetadata(lock,target,notices);
  verifyServer(lock,target,metadata,binary,notices);const changed={...notices,'COPYRIGHT-library.html':Buffer.from('rewritten')};assert.throws(()=>verifyServer(lock,target,metadata,binary,changed),/provenance differs/);
  assert.doesNotThrow(()=>checkServerEntries(['ond-lsp.exe','ond-lsp.json',...OND_NOTICE_FILES],'windows-x86_64','0.1.3'));
  assert.throws(()=>checkServerEntries(['ond-lsp.exe','ond-lsp.json'],'windows-x86_64','0.1.3'),/Unexpected server files/);
});
test('apply reuses exact branch and PR after interrupted creation and repeated same plan',async()=>{const i=input(),{r,state,p}=remote(i);const first=await apply(i,p,r,async()=>{});assert.equal(first.state,'PR_OPEN');const second=await apply(i,p,r,async()=>{});assert.equal(second.head,first.head);assert.equal(state.commits,1);assert.equal(state.creates,1);state.prs=[];const third=await apply(i,p,r,async()=>{});assert.equal(third.state,'PR_OPEN');assert.equal(state.commits,1);});
test('apply rejects stale base, manual branch, conflicting PR, foreign PR and changed release',async()=>{for(const change of [s=>s.base.sha=zero,s=>s.base.tree=zero,s=>s.branch={tree:zero,parents:[],message:''},s=>s.prs=[{state:'open',head:'feature/ond-update-other',base:'develop'}]]){const i=input(),{r,state,p}=remote(i);change(state);await assert.rejects(apply(i,p,r,async()=>{}));assert.equal(state.creates,0);}const i=input(),{r,state,p}=remote(i);await apply(i,p,r,async()=>{});state.prs[0].headRepository='attacker/fork';await assert.rejects(apply(i,p,r,async()=>{}),/FOREIGN_PR/);const other=remote(i);await assert.rejects(apply(i,p,other.r,async()=>{throw new Error('Asset replaced');}),/Asset replaced/);assert.equal(other.state.commits,0);});
test('apply handles 422 concurrent exact branch/PR and stops closed/manual PRs',async()=>{const i=input(),{r,state,p}=remote(i),createBranch=r.createBranch,createPR=r.createPR;r.createBranch=async(...args)=>{await createBranch(...args);throw Object.assign(new Error('race'),{status:422});};r.createPR=async(...args)=>{await createPR(...args);throw Object.assign(new Error('race'),{status:422});};assert.equal((await apply(i,p,r,async()=>{})).state,'PR_OPEN');state.prs[0].state='closed';assert.equal((await apply(i,p,r,async()=>{})).state,'CLOSED');state.prs[0].body='manual';await assert.rejects(apply(i,p,r,async()=>{}),/MANUAL_PR/);});
test('asset publication reconciles partial success and never replaces differing bytes',async()=>{const files=[{name:'a',bytes:Buffer.from('a')},{name:'b',bytes:Buffer.from('b')}];assert.equal((await reconcileAssets(files,async()=>null)).state,'UNPUBLISHED');assert.equal((await reconcileAssets(files,async name=>name==='a'?Buffer.from('a'):null)).state,'PARTIALLY_PUBLISHED');assert.equal((await reconcileAssets(files,async name=>Buffer.from(name))).state,'PUBLISHED_TARGETS_ALL');await assert.rejects(reconcileAssets(files,async()=>Buffer.from('other')),/replacement forbidden/);});
test('self-declared release metadata cannot pass lock verification',()=>{const c=candidate(),t=c.lock.targets[0],binary=extractBinary(Buffer.from(c.evidence[0].content,'base64'),t.binary.name,'tar.gz'),metadata=releaseMetadata(c.lock,t.target);verifyServer(c.lock,t.target,metadata,binary);for(const change of [m=>m.source.kind='local-build',m=>m.source.assetId++,m=>m.lockSha256='0'.repeat(64),m=>m.source.commit=zero]){const m=clone(metadata);change(m);assert.throws(()=>verifyServer(c.lock,t.target,m,binary));}});
test('visibility refuses private-source disclosure to public extension',async()=>{const ond={call:async()=>({id:1404563628,full_name:'SUPER-SHRINE/ond',private:true})},extension={call:async()=>({id:1404564933,full_name:'SUPER-SHRINE/ond-vscode-extension',private:false})};await assert.rejects(verifyVisibility(ond,extension),/disclosure approval/);});

test('fixed golden file bytes, modes and tree detect generator changes',()=>{const result=plan(input()),expected=parseCanonical(readFileSync(join(ROOT,'scripts/ond-sync/fixtures/golden-plan.json')));assert.equal(canonical({files:result.files,tree:result.tree}),canonical(expected));});
test('publication evidence binds the exact VSIX, lock, target, policy and both actual host runs',()=>{
  const c=candidate(),target='linux-x86_64',t=c.lock.targets[0],binary=extractBinary(Buffer.from(c.evidence[0].content,'base64'),t.binary.name,'tar.gz'),extensionCommit='d'.repeat(40),policySha256='e'.repeat(64),policy={hostRuns:2,vscodeVersion:'1.108.0'};
  const files={'extension.vsixmanifest':Buffer.from('<InstallationTarget TargetPlatform="linux-x64" />'),'extension/package.json':Buffer.from(JSON.stringify({version:'0.1.3',publisher:'super-shrine',name:'ond-vscode-ext'})),'extension/config/ond-release.lock.json':Buffer.from(canonical(c.lock)),'extension/server/ond-lsp':binary,'extension/server/ond-lsp.json':Buffer.from(canonical(releaseMetadata(c.lock,target)))};
  const vsix=zip(files),names=['installed_lsp_sha256','installed_vsix','activation','document_symbols','healthy_file_errors','completion_sumTo','hover','type_error','type_error_cleared','syntax_error','syntax_error_cleared'];
  const evidence={schemaVersion:1,extensionCommit,headCommit:extensionCommit,baseCommit:extensionCommit,extensionVersion:'0.1.3',target,vsixSha256:sha256(vsix),lockSha256:sha256(canonical(c.lock)),binarySha256:t.binary.sha256,policySha256,vscodeVersion:'1.108.0',vscodeArchiveSha256:'f'.repeat(64),hostRuns:['1','2'].map(run=>({run,success:true,trusted:true,vscode:'1.108.0',tests:names.map(name=>({name,value:name==='installed_lsp_sha256'?t.binary.sha256:true}))}))};
  const args={lock:c.lock,target,version:'0.1.3',extensionCommit,policy,policySha256,vsix,evidence};assert.equal(verifyCandidate(args),sha256(vsix));
  const modernLock=clone(c.lock),notices={'THIRD-PARTY-NOTICES.txt':Buffer.from('root notice\r\n'),'COPYRIGHT-library.html':Buffer.from('<p>source notice</p>\n')};modernLock.version=modernLock.tag='0.1.3';modernLock.manifest.name='ond-0.1.3-manifest.json';for(const item of modernLock.targets){item.archive.name=item.archive.name.replace('0.1.2','0.1.3');item.checksum.name=item.checksum.name.replace('0.1.2','0.1.3');}
  const modernFiles={...files,'extension/config/ond-release.lock.json':Buffer.from(canonical(modernLock)),'extension/server/ond-lsp.json':Buffer.from(canonical(releaseMetadata(modernLock,target,notices))),'extension/server/THIRD-PARTY-NOTICES.txt':notices['THIRD-PARTY-NOTICES.txt'],'extension/server/COPYRIGHT-library.html':notices['COPYRIGHT-library.html']};
  const modernVsix=zip(modernFiles),modernEvidence={...evidence,vsixSha256:sha256(modernVsix),lockSha256:sha256(canonical(modernLock))},modernArgs={...args,lock:modernLock,vsix:modernVsix,evidence:modernEvidence};assert.equal(verifyCandidate(modernArgs),sha256(modernVsix));
  const missingNotice=zip(Object.fromEntries(Object.entries(modernFiles).filter(([path])=>path!=='extension/server/COPYRIGHT-library.html')));assert.throws(()=>verifyCandidate({...modernArgs,vsix:missingNotice,evidence:{...modernEvidence,vsixSha256:sha256(missingNotice)}}),/Unexpected server files/);
  const changedNotice=zip({...modernFiles,'extension/server/COPYRIGHT-library.html':Buffer.from('rewritten')});assert.throws(()=>verifyCandidate({...modernArgs,vsix:changedNotice,evidence:{...modernEvidence,vsixSha256:sha256(changedNotice)}}),/provenance differs/);
  for(const change of [a=>a.vsix=Buffer.concat([vsix,Buffer.from('changed')]),a=>a.evidence.hostRuns.pop(),a=>a.evidence.hostRuns[0].tests.pop(),a=>a.evidence.hostRuns[0].success=false,a=>a.evidence.policySha256='0'.repeat(64),a=>a.evidence.binarySha256='0'.repeat(64),a=>a.evidence.target='windows-x86_64',a=>a.extensionCommit=zero]){const mutated=clone(args);mutated.vsix=Buffer.from(mutated.vsix);change(mutated);assert.throws(()=>verifyCandidate(mutated));}
  for(const path of ['extension/server/ond-lsp.exe','extension/server/debug.pdb','extension/server/nested/ond-lsp']) {
    const leaked=zip({...files,[path]:Buffer.from('unapproved bytes')});
    assert.throws(()=>verifyCandidate({...args,vsix:leaked,evidence:{...evidence,vsixSha256:sha256(leaked)}}),/Unexpected server files/);
  }
  files['extension/server/ond-lsp']=Buffer.from('self-declared release');const altered=zip(files);assert.throws(()=>verifyCandidate({...args,vsix:altered,evidence:{...evidence,vsixSha256:sha256(altered)}}));
});

test('resolver requires actual stable release and peels tag; mutations invalidate the same lock',async()=>{
  const c=candidate(),descriptors=c.lock.targets.flatMap(t=>[t.archive,t.checksum]).concat(c.lock.manifest),bytes=new Map(c.evidence.map(e=>[e.name,Buffer.from(e.content,'base64')]));
  const state={commit:c.lock.commit,release:{id:c.lock.releaseId,tag_name:'0.1.2',published_at:'2026-10-04T00:00:00Z',draft:false,prerelease:false,assets:descriptors.map(a=>({...a,state:'uploaded',digest:`sha256:${a.sha256}`}))}};
  const api={call:async path=>{if(path==='')return {id:c.lock.repositoryId,full_name:c.lock.repository};if(path==='/releases/tags/0.1.2')return clone(state.release);if(path==='/git/ref/tags/0.1.2')return {object:{type:'tag',sha:'f'.repeat(40)}};if(path===`/git/tags/${'f'.repeat(40)}`)return {object:{type:'commit',sha:state.commit}};if(path.startsWith('/compare/'))return {status:'identical'};if(path.startsWith('/releases/assets/')){const a=state.release.assets.find(a=>String(a.id)===path.split('/').at(-1));assert(a);return bytes.get(a.name);}throw new Error('Unexpected API request');}};
  const result=await resolveRelease(api,'0.1.2');assert.equal(canonical(result.lock),canonical(c.lock));
  state.commit=zero;await assert.rejects(verifyReleaseState(api,c.lock),/Tag moved/);state.commit=c.lock.commit;
  state.release.id++;await assert.rejects(verifyReleaseState(api,c.lock),/Release replaced/);state.release.id--;
  state.release.assets[0].id++;await assert.rejects(verifyReleaseState(api,c.lock),/Asset replaced/);state.release.assets[0].id--;
  const a=state.release.assets[0],original=bytes.get(a.name);bytes.set(a.name,Buffer.alloc(original.length));await assert.rejects(verifyReleaseState(api,c.lock),/checksum mismatch/);bytes.set(a.name,original);
  state.release.draft=true;await assert.rejects(resolveRelease(api,'0.1.2'),/Stable published/);state.release.draft=false;state.release.assets=state.release.assets.filter(a=>a.name!==c.lock.manifest.name);await assert.rejects(resolveRelease(api,'0.1.2'),/Missing\/duplicate asset/);
});

test('apply detects branch/base/conflicting PR changes during final release verification',async()=>{
  for(const existing of [false,true])for(const mutation of ['branch-tree','branch-head','base','conflict']) {
    const i=input(),{r,state,p}=remote(i);if(existing)await apply(i,p,r,async()=>{});
    const initialCreates=state.creates;let calls=0;
    await assert.rejects(apply(i,p,r,async()=>{
      if(++calls!==2)return;
      if(mutation==='branch-tree')state.branch={...state.branch,tree:zero,sha:'e'.repeat(40)};
      if(mutation==='branch-head')state.branch={...state.branch,sha:'e'.repeat(40)};
      if(mutation==='base')state.base={...state.base,sha:zero};
      if(mutation==='conflict')state.prs.push({number:99,state:'open',head:'feature/ond-update-other',base:'develop'});
    }),/MANUAL_BRANCH|BRANCH_HEAD_CHANGED|STALE_BASE|CONFLICTING_PR/);
    assert.equal(state.creates,initialCreates,'Changed final preflight must not create a PR');
  }
});
test('apply validates createPR response and rereads every success boundary',async()=>{
  for(const mutation of ['head','foreign','marker','late-branch','late-conflict']) {
    const i=input(),{r,state,p}=remote(i),createPR=r.createPR;
    r.createPR=async(...args)=>{const created=await createPR(...args);if(mutation==='head')return {...created,headSha:zero};if(mutation==='foreign')return {...created,headRepository:'attacker/fork'};if(mutation==='marker')return {...created,body:'manual'};if(mutation==='late-branch')state.branch={...state.branch,sha:'e'.repeat(40)};if(mutation==='late-conflict')state.prs.push({number:99,state:'open',head:'feature/ond-update-other',base:'develop'});return created;};
    await assert.rejects(apply(i,p,r,async()=>{}),/PR_HEAD_CHANGED|FOREIGN_PR|MANUAL_PR|BRANCH_HEAD_CHANGED|CONFLICTING_PR/);
  }
});
test('locked acquisition removes the stale opposite binary and rejects extra server content',()=>{
  const c=candidate(),dir=mkdtempSync(join(tmpdir(),'ond-acquire-fixture-')),platform=getPlatform(),other=platform.binary==='ond-lsp'?'ond-lsp.exe':'ond-lsp';
  try {const archives=join(dir,'archives'),output=join(dir,'output');mkdirSync(archives);mkdirSync(output);writeFileSync(join(dir,'lock.json'),canonical(c.lock));for(const e of c.evidence)writeFileSync(join(archives,e.name),Buffer.from(e.content,'base64'));writeFileSync(join(output,other),'stale private build');
    const result=spawnSync(process.execPath,[join(ROOT,'scripts/ond-sync/cli.mjs'),'acquire','--lock',join(dir,'lock.json'),'--archives',archives,'--out',output],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert(!existsSync(join(output,other)));checkServerDirectory(output,platform.target);
    writeFileSync(join(output,'private.pdb'),'private debug');assert.throws(()=>checkServerDirectory(output,platform.target),/Unexpected server files/);
    const opposite=platform.target==='linux-x86_64'?'windows-x86_64':'linux-x86_64';cleanOppositeBinary(output,opposite);assert(!existsSync(join(output,platform.binary)));
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('online acquisition checks repository identities before release resolution without TDZ shadowing',()=>{
  const run=extensionID=>{
    const dir=mkdtempSync(join(tmpdir(),'ond-online-acquire-')),routesFile=join(dir,'routes.json'),requestsFile=join(dir,'requests.jsonl'),output=join(dir,'output'),lock=join(ROOT,LOCK_PATH);
    const extensionAPI='https://api.github.com/repos/SUPER-SHRINE/ond-vscode-extension',ondAPI='https://api.github.com/repos/SUPER-SHRINE/ond';
    const routes={
      [ondAPI]:[{json:{id:1404563628,full_name:'SUPER-SHRINE/ond',private:true}}],
      [extensionAPI]:[{json:{id:extensionID,full_name:'SUPER-SHRINE/ond-vscode-extension',private:true}}],
      [`${ondAPI}/releases/tags/0.1.3`]:[{status:404,json:{message:'fixture release unavailable'}}]
    };
    writeFileSync(routesFile,JSON.stringify(routes));writeFileSync(requestsFile,'');
    try {
      const result=spawnSync(process.execPath,['--import',new URL('./fixtures/gate-fetch.mjs',import.meta.url).href,join(ROOT,'scripts/ond-sync/cli.mjs'),'acquire','--lock',lock,'--out',output],{encoding:'utf8',env:{...process.env,GH_TOKEN:'',GITHUB_TOKEN:'',OND_RELEASE_TOKEN:'',OND_GATE_ROUTES:routesFile,OND_GATE_REQUESTS:requestsFile}});
      assert.ifError(result.error);
      const requests=readFileSync(requestsFile,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line).address);
      return {dir,output,result,requests,releaseURL:`${ondAPI}/releases/tags/0.1.3`};
    } catch(error) {rmSync(dir,{recursive:true,force:true});throw error;}
  };
  const valid=run(1404564933);
  try {
    assert.notEqual(valid.result.status,0);
    assert.match(valid.result.stderr,/GitHub GET failed \(404\)/);
    assert.doesNotMatch(valid.result.stderr,/ReferenceError|Cannot access 'extension'/);
    assert.equal(valid.requests.filter(url=>url==='https://api.github.com/repos/SUPER-SHRINE/ond').length,2);
    assert(valid.requests.includes('https://api.github.com/repos/SUPER-SHRINE/ond-vscode-extension'));
    assert(valid.requests.includes(valid.releaseURL));
    assert(!existsSync(join(valid.output,getPlatform().binary)),'A rejected release must not write an executable');
  } finally {rmSync(valid.dir,{recursive:true,force:true});}
  const wrong=run(1404564999);
  try {
    assert.notEqual(wrong.result.status,0);
    assert.match(wrong.result.stderr,/AssertionError/);
    assert(!wrong.requests.includes(wrong.releaseURL),'Wrong repository identity must stop before release access');
    assert(!existsSync(join(wrong.output,getPlatform().binary)),'A wrong repository must not write an executable');
  } finally {rmSync(wrong.dir,{recursive:true,force:true});}
});
test('same-head PR retargeting stops retries and final validation without replacement PR creation',async()=>{
  for(const timing of ['before-retry','during-release','after-create']) {
    const i=input(),{r,state,p}=remote(i);await apply(i,p,r,async()=>{});const createdCount=state.creates;
    if(timing==='before-retry')state.prs[0].base='main';
    if(timing==='after-create'){state.prs=[];const createPR=r.createPR;r.createPR=async(...args)=>{const pr=await createPR(...args);state.prs[0].base='main';return pr;};}
    let calls=0;await assert.rejects(apply(i,p,r,async()=>{if(++calls===2&&timing==='during-release')state.prs[0].base='main';}),/PR_BASE_CHANGED/);
    assert.equal(state.creates,timing==='after-create'?createdCount+1:createdCount);
    assert.equal(state.prs.length,1,'Retargeted PR must not be replaced');
  }
});
test('GitHub PR adapter acquires all bases so manual retargeting cannot disappear',async()=>{
  const requested=[];const api={all:async path=>{requested.push(path);return [{number:1,head:{ref:'feature/ond-update-test',sha:zero,repo:{full_name:'SUPER-SHRINE/ond-vscode-extension'}},base:{ref:'main',repo:{full_name:'SUPER-SHRINE/ond-vscode-extension'}},state:'open',body:'fixture'}];}};
  const prs=await githubRemote(api).pullRequests();assert.deepEqual(requested,['/pulls?state=all']);assert.equal(prs[0].base,'main');
});
test('source build ignores replaced cached executables and uses a fresh isolated output',()=>{
  const dir=mkdtempSync(join(tmpdir(),'ond-cargo-output-fixture-')),platform=getPlatform(),oldTarget=process.env.CARGO_BUILD_TARGET,oldDirectory=process.env.CARGO_TARGET_DIR;
  const outputs=[],homes=[],toolchain=env=>{assert.deepEqual(readdirSync(env.CARGO_HOME),[]);return {cargo:'cargo',rustc:join(dir,'installed-toolchain','rustc')};};
  try {
    const defaultPath=join(dir,'target','release',platform.binary),cached=join(dir,'custom-output','native','release',platform.binary);mkdirSync(join(dir,'target','release'),{recursive:true});mkdirSync(join(dir,'custom-output','native','release'),{recursive:true});writeFileSync(defaultPath,'stale default binary');writeFileSync(cached,'replacement same-version LSP');
    writeFileSync(join(dir,'Cargo.toml'),'fixture manifest');process.env.CARGO_BUILD_TARGET='unapproved-cross-target';process.env.CARGO_TARGET_DIR=join(dir,'custom-output');
    const report=(executable,fresh)=>JSON.stringify({reason:'compiler-artifact',target:{name:'ond-lsp',kind:['bin']},executable,fresh})+'\n'+JSON.stringify({reason:'build-finished',success:true})+'\n';
    const runCargo=(command,args,options)=>{
      assert.equal(command,'cargo');assert.equal(args[args.indexOf('--target')+1],platform.target==='linux-x86_64'?'x86_64-unknown-linux-gnu':'x86_64-pc-windows-msvc');assert(args.includes('--message-format=json-render-diagnostics'));assert.equal(options.cwd,dir);
      assert.equal(options.env.CARGO_BUILD_TARGET,undefined);assert.equal(options.env.CARGO_TARGET_DIR,undefined);assert.equal(options.env.RUSTC,join(dir,'installed-toolchain','rustc'));homes.push(options.env.CARGO_HOME);assert.deepEqual(readdirSync(options.env.CARGO_HOME),[]);
      const output=args[args.indexOf('--target-dir')+1];outputs.push(output);assert.notEqual(output,process.env.CARGO_TARGET_DIR);assert.deepEqual(readdirSync(output),[]);
      const executable=join(output,'native','release',platform.binary);mkdirSync(join(output,'native','release'),{recursive:true});writeFileSync(executable,'fresh exact-SHA binary');return {status:0,stdout:report(executable,false)};
    };
    for(let run=0;run<2;run++){const binary=buildSourceArtifact(dir,join(dir,'Cargo.toml'),platform,runCargo,toolchain);assert.equal(binary.toString(),'fresh exact-SHA binary');assert(!existsSync(outputs.at(-1)),'Isolated output must be cleaned');assert(!existsSync(homes.at(-1)),'Private Cargo home must be cleaned');}
    assert.notEqual(outputs[0],outputs[1]);assert.equal(readFileSync(defaultPath,'utf8'),'stale default binary');assert.equal(readFileSync(cached,'utf8'),'replacement same-version LSP');
    assert.throws(()=>buildSourceArtifact(dir,join(dir,'Cargo.toml'),platform,()=>({status:0,stdout:report(cached,true)}),toolchain),/Cached Cargo executable/);
    assert.throws(()=>buildSourceArtifact(dir,join(dir,'Cargo.toml'),platform,()=>({status:0,stdout:report(cached,false)}),toolchain),/escaped isolated output/);
    assert.throws(()=>buildSourceArtifact(dir,join(dir,'Cargo.toml'),platform,()=>({status:0,stdout:JSON.stringify({reason:'build-finished',success:true})}),toolchain),/exactly one/);
    assert.throws(()=>selectSourceArtifact(report(null,false),platform.binary),/exactly one/);
  } finally {if(oldTarget===undefined)delete process.env.CARGO_BUILD_TARGET;else process.env.CARGO_BUILD_TARGET=oldTarget;if(oldDirectory===undefined)delete process.env.CARGO_TARGET_DIR;else process.env.CARGO_TARGET_DIR=oldDirectory;rmSync(dir,{recursive:true,force:true});}
});
