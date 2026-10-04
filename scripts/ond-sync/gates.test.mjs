import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync,mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './bundle.mjs';
import { canonical,sha256 } from './contract.mjs';
import { candidate,clone,zip } from './fixtures.mjs';
import { extractBinary } from './archive.mjs';
import { releaseMetadata } from './server.mjs';
import { testPolicy } from './test-policy.mjs';

const extension='https://api.github.com/repos/SUPER-SHRINE/ond-vscode-extension',ond='https://api.github.com/repos/SUPER-SHRINE/ond';
const head='b'.repeat(40),base='c'.repeat(40),merge='d'.repeat(40),other='e'.repeat(40),tag='0.1.3';
const names=['installed_lsp_sha256','installed_vsix','activation','document_symbols','healthy_file_errors','completion_sumTo','hover','type_error','type_error_cleared','syntax_error','syntax_error_cleared'];
const review=(id=1,state='APPROVED',user=1,submitted_at='2026-10-04T00:00:00Z')=>({id,state,user:{id:user,type:'User'},commit_id:head,submitted_at});
const reviewsPath=`${extension}/pulls/13/reviews?per_page=100&page=1`;
function fixture(kind){
  const {lock,evidence:releaseEvidence}=candidate(),{policy,digest:policySha256}=testPolicy(),routes={},packages=[];
  const set=(repository,path,json)=>routes[repository+path]=[{json}],binary=(repository,path,bytes)=>routes[repository+path]=[{binary:bytes.toString('base64')}];
  set(extension,'',{id:1403086732,full_name:'SUPER-SHRINE/ond-vscode-extension',private:true});
  for(const t of lock.targets){
    const archive=Buffer.from(releaseEvidence.find(e=>e.name===t.archive.name).content,'base64');
    const server=extractBinary(archive,t.binary.name,t.target==='linux-x86_64'?'tar.gz':'zip');
    const bytes=zip({'extension.vsixmanifest':Buffer.from(`<InstallationTarget TargetPlatform="${t.target==='linux-x86_64'?'linux-x64':'win32-x64'}" />`),'extension/package.json':Buffer.from(JSON.stringify({version:tag,publisher:'super-shrine',name:'ond-vscode-ext'})),'extension/config/ond-release.lock.json':Buffer.from(canonical(lock)),[`extension/server/${t.binary.name}`]:server,'extension/server/ond-lsp.json':Buffer.from(canonical(releaseMetadata(lock,t.target)))});
    const extensionCommit=kind==='merge'?merge:head;
    const evidence={schemaVersion:1,extensionCommit,headCommit:head,baseCommit:kind==='merge'?base:head,extensionVersion:tag,target:t.target,vsixSha256:sha256(bytes),lockSha256:sha256(canonical(lock)),binarySha256:t.binary.sha256,policySha256,vscodeVersion:policy.vscodeVersion,vscodeArchiveSha256:'f'.repeat(64),hostRuns:['1','2'].map(run=>({run,success:true,trusted:true,vscode:policy.vscodeVersion,tests:names.map(name=>({name,value:name==='installed_lsp_sha256'?t.binary.sha256:true}))}))};
    packages.push({name:`ond-vscode-extension-${tag}-${t.target}.vsix`,bytes,evidence});
  }
  const pr={state:'open',base:{ref:'develop',sha:base,repo:{id:1403086732}},head:{sha:head,repo:{id:1403086732}},mergeable:true,mergeable_state:'clean',merge_commit_sha:merge};
  if(kind==='merge'){
    set(extension,'/pulls/13',pr);set(extension,'/git/ref/heads/develop',{object:{sha:base}});
    set(extension,'/pulls/13/reviews?per_page=100&page=1',[review()]);
    set(extension,'/actions/runs/42',{path:'.github/workflows/quality.yml',event:'pull_request',conclusion:'success',status:'completed',pull_requests:[{number:13}],head_sha:merge});
    set(extension,`/contents/config/ond-release.lock.json?ref=${head}`,{encoding:'base64',content:Buffer.from(canonical(lock)).toString('base64')});
    set(extension,`/contents/package.json?ref=${head}`,{encoding:'base64',content:Buffer.from(JSON.stringify({version:tag})).toString('base64')});
    set(extension,'/actions/runs/42/artifacts?per_page=100',{total_count:2,artifacts:[{id:1,name:'vscode-integration-Linux',expired:false},{id:2,name:'vscode-integration-Windows',expired:false}]});
  }else{
    set(extension,`/git/ref/tags/${tag}`,{object:{type:'tag',sha:other}});set(extension,`/git/tags/${other}`,{object:{type:'commit',sha:head}});set(extension,`/compare/${head}...main`,{status:'ahead'});
    set(ond,'',{id:lock.repositoryId,full_name:lock.repository,private:true});
    set(ond,`/git/ref/tags/${lock.tag}`,{object:{type:'commit',sha:lock.commit}});set(ond,`/compare/${lock.commit}...main`,{status:'identical'});
    const descriptors=lock.targets.flatMap(t=>[t.archive,t.checksum]).concat(lock.manifest);
    set(ond,`/releases/tags/${lock.tag}`,{id:lock.releaseId,tag_name:lock.tag,published_at:'2026-10-04T00:00:00Z',draft:false,prerelease:false,assets:descriptors.map(a=>({...a,state:'uploaded',digest:`sha256:${a.sha256}`}))});
    for(const a of descriptors)binary(ond,`/releases/assets/${a.id}`,Buffer.from(releaseEvidence.find(e=>e.name===a.name).content,'base64'));
  }
  return {kind,lock,routes,packages,set,binary};
}
function run(f){
  const directory=mkdtempSync(join(tmpdir(),'ond-gate-'));
  try{
    // ROOTをisolated fixtureへ向け、正式lockやcheckoutを変更せずCLI本体を実行する。
    cpSync(join(ROOT,'scripts'),join(directory,'scripts'),{recursive:true});cpSync(join(ROOT,'config'),join(directory,'config'),{recursive:true});
    writeFileSync(join(directory,'package.json'),JSON.stringify({version:tag}));writeFileSync(join(directory,'config/ond-release.lock.json'),canonical(f.lock));
    const artifacts=join(directory,'artifacts');mkdirSync(artifacts);
    const releaseAssets=[];
    for(const [index,p] of f.packages.entries()){
      const files={[p.name]:p.bytes,[`${p.name}.verified.json`]:Buffer.from(canonical(p.evidence)),[`${p.name}.sha256`]:Buffer.from(`${sha256(p.bytes)}  ${p.name}\n`)};
      for(const [name,bytes] of Object.entries(files)){writeFileSync(join(artifacts,name),bytes);const id=100+releaseAssets.length;releaseAssets.push({id,name});f.binary(extension,`/releases/assets/${id}`,bytes);}
      if(f.kind==='merge'&&!f.routes[`${extension}/actions/artifacts/${index+1}/zip`])f.binary(extension,`/actions/artifacts/${index+1}/zip`,zip(files));
    }
    if(f.kind==='publish'&&!f.routes[`${extension}/releases/tags/${tag}`])f.set(extension,`/releases/tags/${tag}`,{id:90,draft:false,assets:releaseAssets});
    if(f.mutateRoutes)f.mutateRoutes(f.routes);
    const routeFile=join(directory,'routes.json'),requestsFile=join(directory,'requests.jsonl');writeFileSync(routeFile,JSON.stringify(f.routes));writeFileSync(requestsFile,'');
    const command=f.kind==='merge'?['scripts/ond-sync/merge-gate.mjs','13','42']:['scripts/publish-verified.mjs','github',artifacts];
    const result=spawnSync(process.execPath,['--import',new URL('./fixtures/gate-fetch.mjs',import.meta.url).href,...command],{cwd:directory,encoding:'utf8',timeout:15000,env:{...process.env,GITHUB_TOKEN:'',GH_TOKEN:'',OND_RELEASE_TOKEN:'',GITHUB_REF_NAME:tag,GITHUB_SHA:head,OND_GATE_ROUTES:routeFile,OND_GATE_REQUESTS:requestsFile}});
    assert.ifError(result.error);
    const requests=readFileSync(requestsFile,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
    assert(requests.length>0,`CLI did not issue requests: ${result.stderr}`);assert(requests.every(r=>r.method==='GET'&&!/\/branches\/[^/]+\/protection|\/environments\//.test(r.address)),'CLI requested settings audit or network write');
    return {...result,publication:f.kind==='publish'&&result.status===0?JSON.parse(readFileSync(join(artifacts,'publication-github.json'),'utf8')):null};
  }finally{rmSync(directory,{recursive:true,force:true});}
}
test('merge CLI verifies both OS artifacts without access to settings endpoints',()=>{
  const result=run(fixture('merge'));assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/CI_VERIFIED head .* base .*human merge required/);
});
test('merge CLI uses latest decisive human review per stable identity independent of response order',()=>{
  const cases=[
    [review(1),review(2,'COMMENTED'),review(3,'PENDING')],
    [review(2,'CHANGES_REQUESTED',2),review(1)],
    [review(2,'APPROVED',1,'2026-10-04T00:00:01Z'),review(1,'CHANGES_REQUESTED')],
    // 古いpending reviewを後からsubmitした場合はIDよりsubmit時刻を優先する。
    [review(1,'APPROVED',1,'2026-10-04T00:00:01Z'),review(2,'CHANGES_REQUESTED')]
  ];
  for(const reviews of cases){const f=fixture('merge');f.routes[reviewsPath][0].json=reviews;const result=run(f);assert.equal(result.status,0,result.stderr);}
});
test('merge CLI rejects bot, unknown identity, withdrawn or superseded approval and malformed review metadata',()=>{
  const cases=[
    [[{...review(),user:{id:1,type:'Bot'}}],/exact-head human review missing/],
    [[{...review(),user:null}],/review identity unavailable/],
    [[{...review(),user:{type:'User'}}],/review identity unavailable/],
    [[review(2,'CHANGES_REQUESTED'),review(1)],/exact-head human review missing/],
    [[review(2,'DISMISSED'),review(1)],/exact-head human review missing/],
    [[review(1,'DISMISSED')],/exact-head human review missing/],
    [[{...review(),commit_id:other}],/exact-head human review missing/],
    [[{...review(),id:0}],/invalid review ID/],
    [[review(),review()],/invalid review ID/],
    [[{...review(),submitted_at:null}],/review chronology unavailable/]
  ];
  for(const [reviews,error] of cases){const f=fixture('merge');f.routes[reviewsPath][0].json=reviews;const result=run(f);assert.notEqual(result.status,0);assert.match(result.stderr,error);}
});
test('merge CLI revalidates PR and human approval after artifact verification',()=>{
  const cases=[
    [pr=>pr.base.ref='main',/AssertionError/],
    [pr=>pr.state='closed',/AssertionError/],
    [pr=>pr.base.repo.id++,/AssertionError/],
    [pr=>pr.head.repo.id++,/AssertionError/],
    [pr=>pr.base.sha=other,/PR changed during verification/],
    [pr=>pr.merge_commit_sha=other,/PR changed during verification/],
    [pr=>pr.mergeable=null,/mergeability unavailable/],
    [pr=>pr.mergeable_state='blocked',/latest-base checks\/reviews incomplete/]
  ];
  for(const [mutate,error] of cases){const f=fixture('merge'),final=clone(f.routes[`${extension}/pulls/13`][0]);mutate(final.json);f.routes[`${extension}/pulls/13`].push(final);const result=run(f);assert.notEqual(result.status,0);assert.match(result.stderr,error);}
  const f=fixture('merge');f.routes[reviewsPath].push({json:[review(1,'DISMISSED')]});const result=run(f);assert.notEqual(result.status,0);assert.match(result.stderr,/exact-head human review missing/);
});
test('merge CLI still fails closed on actual review, latest base/head, run and artifact evidence',()=>{
  const cases=[
    [f=>f.routes[`${extension}/pulls/13`][0].json.mergeable=null,/mergeability unavailable/],
    [f=>f.routes[`${extension}/pulls/13`][0].json.mergeable_state='blocked',/latest-base checks\/reviews incomplete/],
    [f=>f.routes[`${extension}/git/ref/heads/develop`][0].json.object.sha=other,/STALE_BASE/],
    [f=>f.routes[`${extension}/pulls/13/reviews?per_page=100&page=1`][0].json[0].commit_id=other,/exact-head human review missing/],
    [f=>f.routes[`${extension}/actions/runs/42`][0].json.head_sha=other,/Wrong CI head/],
    [f=>f.routes[`${extension}/actions/runs/42`][0].status=503,/GitHub GET failed \(503\)/],
    [f=>f.routes[`${extension}/actions/runs/42/artifacts?per_page=100`][0].json.artifacts[0].expired=true,/CI artifact expired/],
    [f=>f.packages[0].evidence.extensionCommit=other,/CI did not test the current merge tree/],
    [f=>f.packages[0].evidence.vsixSha256='0'.repeat(64),/AssertionError/],
    [f=>f.packages[0].evidence.hostRuns[0].tests.pop(),/Incomplete host suite/],
    [f=>{const changed=clone(f.routes[`${extension}/pulls/13`][0]);changed.json.head.sha=other;f.routes[`${extension}/pulls/13`].push(changed);},/AssertionError/],
    [f=>f.routes[`${extension}/git/ref/heads/develop`].push({json:{object:{sha:other}}}),/STALE_BASE/]
  ];
  for(const [mutate,error] of cases){const f=fixture('merge');mutate(f);const result=run(f);assert.notEqual(result.status,0);assert.match(result.stderr,error);}
});
test('publisher CLI independently verifies release and skips identical assets without settings access or writes',()=>{
  const result=run(fixture('publish'));assert.equal(result.status,0,result.stderr);assert.equal(result.publication.state,'PUBLISHED_TARGETS_ALL');assert.equal(result.publication.assets.length,6);assert(result.publication.assets.every(a=>a.state==='SAME_HASH_SKIP'));
});
test('publisher CLI still fails closed on tag, ancestry, adopted assets, VSIX evidence and differing publication',()=>{
  const cases=[
    [f=>f.routes[`${extension}/git/tags/${other}`][0].json.object.sha=other,/Extension tag moved/],
    [f=>f.routes[`${extension}/compare/${head}...main`][0].json.status='behind',/Tag outside main/],
    [f=>f.routes[`${ond}/releases/assets/${f.lock.manifest.id}`][0].status=503,/GitHub GET failed \(503\)/],
    [f=>f.routes[`${ond}/releases/assets/${f.lock.targets[0].archive.id}`][0].binary=Buffer.from('changed').toString('base64'),/AssertionError/],
    [f=>f.packages[0].evidence.vsixSha256='0'.repeat(64),/AssertionError/],
    [f=>f.packages[0].evidence.hostRuns[0].success=false,/AssertionError/],
    [f=>f.mutateRoutes=routes=>routes[`${extension}/releases/assets/100`][0].binary=Buffer.from('other VSIX').toString('base64'),/Existing publication differs; replacement forbidden/]
  ];
  for(const [mutate,error] of cases){const f=fixture('publish');mutate(f);const result=run(f);assert.notEqual(result.status,0);assert.match(result.stderr,error);}
});
