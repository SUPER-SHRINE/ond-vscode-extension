import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname,join } from 'node:path';
import { commit } from './ond-sync/contract.mjs';
import { gitObject,treeHash } from './ond-sync/planner.mjs';

function objectReader(directory) {
  // Git環境による別repository/index/configへの差替えと欠損objectの自動fetchを防ぐ。
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key)));
  Object.assign(env,{GIT_NO_REPLACE_OBJECTS:'1',GIT_NO_LAZY_FETCH:'1',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null'});
  return (args,maxBuffer=128*1024*1024)=>{
    const result=spawnSync('git',['--no-replace-objects','--no-lazy-fetch','-C',directory,...args],{env,maxBuffer});
    assert(!result.error&&result.status===0,'Cannot read exact Ond Git objects');return result.stdout;
  };
}
function checkedCommit(git,sha) {
  commit(sha);assert.equal(git(['rev-parse','HEAD']).toString().trim(),sha,'Explicit Ond source SHA differs');
  const bytes=git(['cat-file','commit',sha],1024*1024);assert.equal(gitObject('commit',bytes),sha,'Ond commit object hash differs');
  const tree=/^tree ([0-9a-f]{40})\n/.exec(bytes.toString('utf8'));assert(tree,'Missing Ond commit tree');return tree[1];
}
// HEAD一致だけを確認する。worktree/indexのclean判定はsource provenanceに使わない。
export function verifySourceCommit(directory,sha) {checkedCommit(objectReader(directory),sha);}

function safePath(path) {
  assert.match(path,/^[A-Za-z0-9_.@+/-]+$/,'Unsupported Ond source path');
  for(const part of path.split('/')) {
    assert(part!==''&&part!=='.'&&part!=='..'&&part.toLowerCase()!=='.git'&&!part.endsWith('.'),'Unsafe Ond source path');
    assert(!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),'Nonportable Ond source path');
  }
  assert(!/(^|\/)\.cargo\/config(?:\.toml)?$/i.test(path),'Committed Cargo config is unsupported in source lane');
}
function snapshotTree(directory) {
  assert(lstatSync(directory).isDirectory(),'Nonregular snapshot root rejected');
  const entries=[];
  const walk=(relative='')=>{for(const name of readdirSync(join(directory,relative))){const path=relative?`${relative}/${name}`:name;safePath(path);const file=join(directory,path),stat=lstatSync(file);
    if(stat.isDirectory())walk(path);
    else {assert(stat.isFile(),'Nonregular snapshot source rejected');entries.push({path,mode:process.platform==='win32'?null:(stat.mode&0o111)?'100755':'100644',oid:gitObject('blob',readFileSync(file))});}
  }};walk();return entries;
}
function verifySnapshot(directory,expected,tree) {
  const actual=snapshotTree(directory);assert.equal(actual.length,expected.length,'Snapshot file set changed');
  for(const entry of actual){const recorded=expected.find(e=>e.path===entry.path);assert(recorded,'Unexpected snapshot source');assert.equal(entry.oid,recorded.oid,'Snapshot source bytes changed');if(entry.mode!==null)assert.equal(entry.mode,recorded.mode,'Snapshot source mode changed');entry.mode=recorded.mode;}
  assert.equal(treeHash(actual),tree,'Materialized Ond tree differs');
}
export function withSourceSnapshot(directory,sha,action) {
  const git=objectReader(directory),tree=checkedCommit(git,sha),container=mkdtempSync(join(tmpdir(),'ond-source-snapshot-')),source=join(container,'source');
  try {
    const listing=git(['ls-tree','-rz','--full-tree',sha],32*1024*1024).toString('utf8');assert(listing.endsWith('\0')||listing==='','Malformed Ond source tree');
    const entries=listing.split('\0').filter(Boolean).map(record=>{const match=/^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/.exec(record);assert(match,'Unsupported Ond source symlink/submodule/mode');const entry={mode:match[1],oid:match[2],path:match[3]};safePath(entry.path);return entry;});
    assert(entries.length<=100000,'Ond source tree too large');assert.equal(treeHash(entries),tree,'Ond source tree object differs');
    const portable=new Map();for(const entry of entries){const parts=entry.path.split('/');for(let n=1;n<=parts.length;n++){const prefix=parts.slice(0,n).join('/'),key=prefix.toLowerCase();assert(!portable.has(key)||portable.get(key)===prefix,'Case-colliding Ond source paths');portable.set(key,prefix);}}
    mkdirSync(source);let total=0;
    for(const entry of entries){const bytes=git(['cat-file','blob',entry.oid]);assert.equal(gitObject('blob',bytes),entry.oid,'Ond blob object differs');total+=bytes.length;assert(total<=128*1024*1024,'Ond source bytes too large');const file=join(source,entry.path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,bytes,{flag:'wx'});chmodSync(file,entry.mode==='100755'?0o755:0o644);}
    verifySnapshot(source,entries,tree);
    const result=action({directory:source,commit:sha,tree});assert(!result||typeof result.then!=='function','Source snapshot callback must be synchronous');
    verifySnapshot(source,entries,tree);assert.equal(checkedCommit(git,sha),tree,'Ond source commit changed');return result;
  } finally {rmSync(container,{recursive:true,force:true});}
}
