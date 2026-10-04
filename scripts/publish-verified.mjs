// 明示のpublish commandで実行する。workflowの承認はGitHubのnative environment設定に委ねる。
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { join,basename,resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './ond-sync/bundle.mjs';
import { canonical,parseCanonical,parseLock,sha256,commit,version } from './ond-sync/contract.mjs';
import { verifyCandidate,reconcileAssets } from './ond-sync/publication.mjs';
import { testPolicy } from './ond-sync/test-policy.mjs';
import { GitHub } from './ond-sync/github.mjs';
import { materialize,verifyVisibility } from './ond-sync/release.mjs';
const [destination,directory,target]=process.argv.slice(2);assert(['marketplace','github'].includes(destination));assert(directory);assert(destination==='github'||['linux-x86_64','windows-x86_64'].includes(target));
const root=resolve(directory),manifest=JSON.parse(readFileSync(join(ROOT,'package.json'))),lock=parseLock(readFileSync(join(ROOT,'config/ond-release.lock.json'))),tag=process.env.GITHUB_REF_NAME,sha=process.env.GITHUB_SHA;
version(tag);commit(sha);assert.equal(tag,manifest.version);
// 今回承認したrelease準備の受入条件。bootstrap候補を0.1.3として公開しない。
if(tag==='0.1.3')assert.equal(lock.version,'0.1.2','BLOCKED: extension 0.1.3 requires published Ond 0.1.2 adoption');
const api=new GitHub('SUPER-SHRINE/ond-vscode-extension',process.env.GITHUB_TOKEN||process.env.GH_TOKEN);
const repository=await api.call('');assert.equal(repository.id,1403086732);assert.equal(repository.full_name,'SUPER-SHRINE/ond-vscode-extension');
let tagObject=(await api.call(`/git/ref/tags/${tag}`)).object;for(let n=0;tagObject.type==='tag'&&n<5;n++)tagObject=(await api.call(`/git/tags/${tagObject.sha}`)).object;assert.equal(tagObject.type,'commit');assert.equal(tagObject.sha,sha,'Extension tag moved');
const comparison=await api.call(`/compare/${sha}...main`);assert(['identical','ahead'].includes(comparison.status),'Tag outside main');
// メタデータのkindだけで認定せず、ここでもlockの全assetを独立に取得・検証。
const ond=new GitHub(lock.repository,process.env.OND_RELEASE_TOKEN);await verifyVisibility(ond,api);await materialize(ond,lock);
const {policy,digest:policySha256}=testPolicy(),targets=destination==='github'?policy.targets:[target],desired=[];
for(const t of targets){const name=`ond-vscode-extension-${tag}-${t}.vsix`,bytes=readFileSync(join(root,name)),evidence=parseCanonical(readFileSync(join(root,`${name}.verified.json`)));verifyCandidate({lock,target:t,version:tag,extensionCommit:sha,policy,policySha256,vsix:bytes,evidence});const checksum=Buffer.from(`${sha256(bytes)}  ${name}\n`);assert(readFileSync(join(root,`${name}.sha256`)).equals(checksum));desired.push({name,bytes},{name:`${name}.sha256`,bytes:checksum},{name:`${name}.verified.json`,bytes:Buffer.from(canonical(evidence))});}
async function marketplaceBytes(name){
  const body={filters:[{criteria:[{filterType:7,value:'super-shrine.ond-vscode-ext'}],pageNumber:1,pageSize:1}],flags:1|2|16|128};
  const response=await fetch('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json;api-version=7.2-preview.1'},body:JSON.stringify(body)});assert(response.ok,'Marketplace state unavailable');const value=await response.json();assert(Array.isArray(value.results)&&value.results.length===1&&Array.isArray(value.results[0].extensions),'Marketplace state invalid');const extensions=value.results[0].extensions;assert(extensions.length<=1);
  if(!extensions.length)return null;assert.equal(extensions[0].publisher.publisherName,'super-shrine');assert.equal(extensions[0].extensionName,'ond-vscode-ext');assert(Array.isArray(extensions[0].versions));
  const platform=target==='linux-x86_64'?'linux-x64':'win32-x64',versions=extensions[0].versions.filter(v=>v.version===tag&&v.targetPlatform===platform);assert(versions.length<=1);if(!versions.length)return null;
  const file=versions[0].files?.find(f=>f.assetType==='Microsoft.VisualStudio.Services.VSIXPackage');assert(file&&/^https:\/\//.test(file.source),'Existing Marketplace digest unavailable; human decision required');const download=await fetch(file.source);assert(download.ok,'Existing Marketplace package unavailable');return Buffer.from(await download.arrayBuffer());
}
if(destination==='marketplace'){
  const file=desired.find(f=>f.name.endsWith('.vsix')),state=await reconcileAssets([file],marketplaceBytes);writeFileSync(join(root,`publication-${target}.json`),canonical(state));
  if(state.assets[0].state==='MISSING'){
    const result=spawnSync(process.execPath,[join(ROOT,'node_modules/@vscode/vsce/vsce'),'publish','--azure-credential','--packagePath',join(root,file.name)],{stdio:'inherit',env:{...process.env,OND_RELEASE_TOKEN:'',GH_TOKEN:'',GITHUB_TOKEN:''}});
    if(result.error||result.status!==0)throw new Error('PARTIALLY_PUBLISHED: confirm Marketplace state before retry');
    const confirmed=await reconcileAssets([file],marketplaceBytes);assert.equal(confirmed.state,'PUBLISHED_TARGETS_ALL','Marketplace publication not yet verifiable; retry same artifact');writeFileSync(join(root,`publication-${target}.json`),canonical(confirmed));
  }
}else{
  let release=await api.call(`/releases/tags/${tag}`,{optional:true});
  const read=async name=>{if(!release)return null;const matches=release.assets.filter(a=>a.name===name);assert(matches.length<=1,'Duplicate remote asset');if(!matches.length)return null;return api.call(`/releases/assets/${matches[0].id}`,{binary:true});};
  const initial=await reconcileAssets(desired,read);writeFileSync(join(root,'publication-github.json'),canonical(initial));
  if(!release)release=await api.call('/releases',{method:'POST',body:{tag_name:tag,target_commitish:sha,name:`Ond VS Code Extension ${tag}`,draft:true,generate_release_notes:true}});
  for(const file of desired){if(await read(file.name)!==null)continue;const response=await fetch(`https://uploads.github.com/repos/${api.repository}/releases/${release.id}/assets?name=${encodeURIComponent(file.name)}`,{method:'POST',headers:{Authorization:`Bearer ${api.token}`,'Content-Type':'application/octet-stream','X-GitHub-Api-Version':'2022-11-28'},body:file.bytes});if(!response.ok&&![409,422].includes(response.status))throw new Error(`PARTIALLY_PUBLISHED: GitHub upload failed (${response.status})`);release=await api.call(`/releases/${release.id}`);await reconcileAssets([file],read);}
  const confirmed=await reconcileAssets(desired,read);assert.equal(confirmed.state,'PUBLISHED_TARGETS_ALL');writeFileSync(join(root,'publication-github.json'),canonical(confirmed));if(release.draft)await api.call(`/releases/${release.id}`,{method:'PATCH',body:{draft:false}});
}
