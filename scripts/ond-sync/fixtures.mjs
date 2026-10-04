import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { readFileSync,mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { canonical,sha256,parseLock,parseCanonical,validateLock,DISTRIBUTION } from './contract.mjs';
import { plan,treeHash,gitObject,LOCK_PATH,CHANGELOG_PATH,verifyEvidence } from './planner.mjs';
import { execution,ROOT,verifyExecution } from './bundle.mjs';
import { apply } from './apply.mjs';
import { resolveRelease,verifyReleaseState,verifyVisibility } from './release.mjs';
import { crc32,zipEntries,extractBinary } from './archive.mjs';
import { reconcileAssets,verifyCandidate } from './publication.mjs';
import { releaseMetadata,verifyServer } from './server.mjs';
export const clone=v=>structuredClone(v);
export const old=parseLock(readFileSync(join(ROOT,'scripts/ond-sync/fixtures/published-release.json')));
export const zero='0'.repeat(40);
export function tar(name,data,type=48){const header=Buffer.alloc(512);header.write(name);header.write('0000755',100);header.write('0000000',108);header.write('0000000',116);header.write(data.length.toString(8).padStart(11,'0'),124);header.write('00000000000',136);header.fill(32,148,156);header[156]=type;header.write('ustar',257);const sum=header.reduce((a,b)=>a+b,0);header.write(sum.toString(8).padStart(6,'0')+'\0 ',148);const archive=gzipSync(Buffer.concat([header,data,Buffer.alloc((512-data.length%512)%512+1024)]));archive[9]=3; // gzipのOS識別byteを固定し、hostに依存しないfixtureにする。
return archive;}
export function zip(files){const locals=[],central=[];let offset=0;for(const [name,data] of Object.entries(files)){const names=Buffer.from(name),crc=crc32(data),local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(names.length,26);locals.push(local,names,data);const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(names.length,28);entry.writeUInt32LE(offset,42);central.push(entry,names);offset+=local.length+names.length+data.length;}const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,directory,end]);}
export function candidate(){const lock=clone(old),evidence=[];lock.version=lock.tag='0.1.2';lock.contract='manifest-v1';lock.commit='a'.repeat(40);lock.releaseId++;let id=700;
const add=(name,bytes)=>{evidence.push({name,content:bytes.toString('base64')});return {name,id:++id,size:bytes.length,sha256:sha256(bytes)};};
for(const t of lock.targets){const binary=Buffer.from('fixture '+t.target);t.binary.sha256=sha256(binary);const name=t.archive.name.replace('0.1.1','0.1.2');const archive=t.target==='linux-x86_64'?tar(t.binary.name,binary):zip({[t.binary.name]:binary});t.archive=add(name,archive);t.checksum=add(name+'.sha256',Buffer.from(`${sha256(archive)}  ${name}\n`));}
const manifest={schemaVersion:1,repository:lock.repository,version:lock.version,commit:lock.commit,targets:lock.targets.map(t=>({target:t.target,rustTarget:t.rustTarget,archive:{name:t.archive.name,size:t.archive.size,sha256:t.archive.sha256},binary:t.binary}))};lock.manifest=add('ond-0.1.2-manifest.json',Buffer.from(JSON.stringify(JSON.parse(canonical(manifest)))+'\n'));return {lock,evidence};}
export function input(){const c=candidate(),runtime=execution(),baseFiles={[LOCK_PATH]:{mode:'100644',content:canonical(old)},[CHANGELOG_PATH]:{mode:'100644',content:'# 変更履歴\n\n## [未リリース]\n'}},baseTree=Object.entries(baseFiles).map(([path,f])=>({path,mode:f.mode,oid:gitObject('blob',f.content)}));return {schemaVersion:1,plannerDigest:sha256(canonical(runtime)),execution:runtime,base:{repository:'SUPER-SHRINE/ond-vscode-extension',repositoryId:1404564933,ref:'develop',commit:'b'.repeat(40),tree:treeHash(baseTree)},baseTree,baseFiles,candidate:c.lock,evidence:c.evidence};}
export function remote(input){const p=plan(input),state={base:{sha:p.base.commit,tree:p.base.tree},branch:null,prs:[],commits:0,creates:0};const r={identity:async()=>{},base:async()=>state.base,pullRequests:async()=>state.prs,branch:async()=>state.branch,createTree:async()=>p.tree,createCommit:async(message,tree,parent)=>{state.commits++;state.proposed={sha:'c'.repeat(40),message,tree,parents:[parent]};return state.proposed.sha;},createBranch:async()=>{state.branch=state.proposed;},createPR:async(head,title,body)=>{state.creates++;const pr={number:1,head,base:'develop',state:'open',merged:false,body,headSha:state.branch.sha,headRepository:p.base.repository,baseRepository:p.base.repository};state.prs.push(pr);return pr;}};return {r,state,p};}
