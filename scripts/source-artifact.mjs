import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstatSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename,delimiter,dirname,isAbsolute,join,relative } from 'node:path';
import { TARGETS } from './ond-sync/contract.mjs';
export function selectSourceArtifact(stdout,binary,outputDirectory) {
  const messages=stdout.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  const finished=messages.filter(m=>m.reason==='build-finished');
  assert.equal(finished.length,1,'Cargo build completion missing');assert.equal(finished[0].success,true,'Cargo build did not succeed');
  const matches=messages.filter(m=>m.reason==='compiler-artifact'&&m.target?.name==='ond-lsp'&&m.target.kind?.includes('bin')&&m.executable!==null);
  assert.equal(matches.length,1,'Cargo must report exactly one ond-lsp executable');
  assert.equal(matches[0].fresh,false,'Cached Cargo executable cannot prove source provenance');
  const executable=matches[0].executable;assert.equal(typeof executable,'string');assert(isAbsolute(executable),'Cargo executable must be absolute');assert.equal(basename(executable),binary,'Cargo executable target mismatch');
  assert(lstatSync(executable).isFile(),'Cargo executable must be a regular file');
  if(outputDirectory){const path=relative(realpathSync(outputDirectory),realpathSync(executable));assert(path!==''&&!path.split(/[\\/]/).includes('..')&&!isAbsolute(path),'Cargo executable escaped isolated output');}
  return executable;
}
export function rejectAncestorCargoConfig(directory) {
  for(let current=realpathSync(directory);;current=dirname(current)) {
    for(const name of ['config','config.toml']) {
      let present=false;try{lstatSync(join(current,'.cargo',name));present=true;}catch(error){if(error.code!=='ENOENT')throw error;}
      assert(!present,'Ancestor Cargo config is unsupported in source lane');
    }
    if(dirname(current)===current)break;
  }
}
function baseEnvironment() {
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!(/^(?:CARGO(?:_|$)|RUST|GIT_)/i.test(key))));
  if(process.env.RUSTUP_HOME)env.RUSTUP_HOME=process.env.RUSTUP_HOME;
  return env;
}
export function installedSourceToolchain(env,run=spawnSync) {
  const locate=name=>{const result=run('rustup',['which','--toolchain','1.91.1',name],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']});assert(!result.error&&result.status===0,'Installed Rust 1.91.1 is required for private source lane');const file=result.stdout.trim();assert(isAbsolute(file)&&lstatSync(file).isFile(),'Installed Rust tool must be a regular absolute file');return realpathSync(file);};
  const cargo=locate('cargo'),rustc=locate('rustc');assert.equal(dirname(cargo),dirname(rustc),'Installed Cargo/Rustc toolchain differs');return {cargo,rustc};
}
export function buildSourceArtifact(repository,manifest,platform,runCargo=spawnSync,toolchain=installedSourceToolchain) {
  const target=TARGETS[platform.target];assert(target,'Unsupported native source target');
  // source snapshotのcwdと、毎回新規のprivate Cargo home/outputだけを使う。
  const container=mkdtempSync(join(tmpdir(),'ond-source-build-')),output=join(container,'target'),home=join(container,'cargo-home');
  try {
    rejectAncestorCargoConfig(repository);assert.equal(realpathSync(manifest),join(realpathSync(repository),'Cargo.toml'),'Source manifest must belong to snapshot root');
    mkdirSync(output);mkdirSync(home);const env=baseEnvironment();env.CARGO_HOME=home;
    const tools=toolchain(env);env.RUSTC=tools.rustc;const inheritedPath=Object.entries(env).find(([key])=>key.toUpperCase()==='PATH')?.[1]??'';
    for(const key of Object.keys(env))if(key.toUpperCase()==='PATH')delete env[key];env.PATH=dirname(tools.cargo)+delimiter+inheritedPath;
    const result=runCargo(tools.cargo,['build','--manifest-path',manifest,'--locked','--release','--target',target.rustTarget,'--target-dir',output,'-p','ond-lsp','--bin','ond-lsp','--message-format=json-render-diagnostics'],{cwd:repository,env,stdio:['ignore','pipe','inherit'],encoding:'utf8',maxBuffer:32*1024*1024});
    if(result.error)throw result.error;assert.equal(result.status,0,'Cargo source build failed');
    const executable=selectSourceArtifact(result.stdout,platform.binary,output);
    return readFileSync(executable);
  } finally {rmSync(container,{recursive:true,force:true});}
}
