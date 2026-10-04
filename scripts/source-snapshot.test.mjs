import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync,existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { withSourceSnapshot,verifySourceCommit } from './source-checkout.mjs';
import { buildSourceArtifact,installedSourceToolchain,rejectAncestorCargoConfig } from './source-artifact.mjs';
import { getPlatform } from './platform.mjs';
import { sourceFixture,fixtureProgram } from './source-fixtures.mjs';
import { ROOT } from './ond-sync/bundle.mjs';

test('exact Git objects ignore dirty index/worktree, assume/skip flags and fsmonitor',()=>{
  const f=sourceFixture();let snapshot;
  const check=()=>{withSourceSnapshot(f.directory,f.sha,value=>{snapshot=value.directory;assert.notEqual(snapshot,f.directory);assert.equal(readFileSync(join(snapshot,'src/main.rs'),'utf8'),fixtureProgram);assert.equal(readFileSync(join(snapshot,'Cargo.toml'),'utf8'),f.files['Cargo.toml']);assert(!existsSync(join(snapshot,'untracked.rs')));assert(!existsSync(join(snapshot,'target')));});assert(!existsSync(dirname(snapshot)),'Snapshot must be removed after success');};
  try {
    check();mkdirSync(join(f.directory,'target'));writeFileSync(join(f.directory,'target/cache'),'ignored');writeFileSync(join(f.directory,'untracked.rs'),'untracked source');check();rmSync(join(f.directory,'untracked.rs'));
    writeFileSync(join(f.directory,'src/main.rs'),'ordinary dirty source');check();f.git(['add','src/main.rs']);check();f.git(['restore','--staged','--worktree','src/main.rs']);
    for(const flags of [['--assume-unchanged'],['--skip-worktree'],['--assume-unchanged','--skip-worktree']]) {
      for(const flag of flags)f.git(['update-index',flag,'src/main.rs']);writeFileSync(join(f.directory,'src/main.rs'),'hidden changed source');assert.equal(f.git(['status','--porcelain=v1','--untracked-files=all']),'');check();
      f.git(['update-index','--no-assume-unchanged','src/main.rs']);f.git(['update-index','--no-skip-worktree','src/main.rs']);f.git(['restore','src/main.rs']);
    }
    const hook=join(f.directory,'.git/fsmonitor-hook');writeFileSync(hook,'#!/usr/bin/env node\nprocess.stdout.write("fixture-token\\0");\n');chmodSync(hook,0o755);f.git(['config','core.fsmonitor',hook.replace(/\\/g,'/')]);f.git(['config','core.fsmonitorHookVersion','2']);f.git(['update-index','--fsmonitor']);f.git(['update-index','--fsmonitor-valid','src/main.rs']);
    writeFileSync(join(f.directory,'src/main.rs'),'hidden fsmonitor source');assert.equal(f.git(['status','--porcelain=v1','--untracked-files=all']),'');check();
    writeFileSync(join(f.directory,'Cargo.toml'),'not the committed manifest');check();verifySourceCommit(f.directory,f.sha);
  } finally {rmSync(f.directory,{recursive:true,force:true});}
});
test('object materialization ignores Git replace refs, filters and export attributes',()=>{
  const f=sourceFixture();
  try {
    const originalBlob=f.git(['rev-parse',`${f.sha}:src/main.rs`]),originalTree=f.git(['rev-parse',`${f.sha}^{tree}`]);
    writeFileSync(join(f.directory,'src/main.rs'),'replacement source');f.git(['add','src/main.rs']);f.git(['commit','-m','replacement fixture']);const replacement=f.git(['rev-parse','HEAD']),replacementTree=f.git(['rev-parse','HEAD^{tree}']),replacementBlob=f.git(['rev-parse','HEAD:src/main.rs']);
    f.git(['update-ref','refs/heads/fixture',f.sha]);f.git(['replace',f.sha,replacement]);f.git(['replace',originalTree,replacementTree]);f.git(['replace',originalBlob,replacementBlob]);assert.equal(f.git(['show',`${f.sha}:src/main.rs`]),'replacement source');
    f.git(['config','filter.untrusted.smudge','invalid-fixture-smudge-command']);f.git(['config','filter.untrusted.required','true']);writeFileSync(join(f.directory,'.git/info/attributes'),'src/main.rs filter=untrusted\n');
    const previous=process.env.GIT_DIR;process.env.GIT_DIR=join(f.directory,'not-the-repository');
    try {withSourceSnapshot(f.directory,f.sha,snapshot=>{assert.equal(readFileSync(join(snapshot.directory,'src/main.rs'),'utf8'),fixtureProgram);assert.equal(readFileSync(join(snapshot.directory,'src/subst.txt'),'utf8'),'$Format:%H$\n');if(process.platform!=='win32')assert.equal(lstatSync(join(snapshot.directory,'scripts/tool.sh')).mode&0o777,0o755);});}
    finally {if(previous===undefined)delete process.env.GIT_DIR;else process.env.GIT_DIR=previous;}
  } finally {rmSync(f.directory,{recursive:true,force:true});}
});
test('wrong SHA, unsupported tree modes/paths/config and callback failures stop and clean snapshots',()=>{
  for(const variant of ['wrong-sha','symlink','gitlink','case-collision','cargo-config','unsafe-path','callback','mutation','head-change']) {
    const f=sourceFixture(),scratch=join(f.directory,'scratch');mkdirSync(scratch);const tempKeys=process.platform==='win32'?['TEMP','TMP']:['TMPDIR'],saved=new Map(tempKeys.map(key=>[key,process.env[key]]));let source;
    try {
      let sha=f.sha;
      if(variant==='symlink'){const oid=f.git(['hash-object','-w','--stdin'],'outside');f.git(['update-index','--add','--cacheinfo',`120000,${oid},link`]);}
      if(variant==='gitlink')f.git(['update-index','--add','--cacheinfo',`160000,${sha},submodule`]);
      if(variant==='case-collision'){const oid=f.git(['rev-parse',`${sha}:src/main.rs`]);for(const path of ['Case/a.rs','case/b.rs'])f.git(['update-index','--add','--cacheinfo',`100644,${oid},${path}`]);}
      if(variant==='cargo-config'){const oid=f.git(['hash-object','-w','--stdin'],'[build]\nrustflags=["--cfg","source_override"]\n');f.git(['update-index','--add','--cacheinfo',`100644,${oid},.cargo/config.toml`]);}
      if(['symlink','gitlink','case-collision','cargo-config'].includes(variant)){f.git(['commit','-m','unsupported tree fixture']);sha=f.git(['rev-parse','HEAD']);}
      if(variant==='unsafe-path'){const oid=f.git(['rev-parse',`${sha}:src/main.rs`]),tree=f.git(['hash-object','--literally','-w','-t','tree','--stdin'],Buffer.concat([Buffer.from('100644 AUX.txt\0'),Buffer.from(oid,'hex')])),raw=f.git(['cat-file','commit',sha]).replace(/^tree [0-9a-f]{40}/,`tree ${tree}`)+'\n';sha=f.git(['hash-object','-w','-t','commit','--stdin'],raw);f.git(['update-ref','refs/heads/fixture',sha]);}
      for(const key of tempKeys)process.env[key]=scratch;
      assert.throws(()=>withSourceSnapshot(f.directory,variant==='wrong-sha'?f.initial:sha,snapshot=>{source=snapshot.directory;if(variant==='callback')throw new Error('callback failure');if(variant==='mutation')writeFileSync(join(source,'src/main.rs'),'changed inside snapshot');if(variant==='head-change')f.git(['update-ref','refs/heads/fixture',f.initial]);}),/source SHA differs|symlink\/submodule\/mode|Case-colliding|Cargo config|Nonportable|callback failure|bytes changed/);
      assert.deepEqual(readdirSync(scratch),[],'Failure must remove private snapshot');if(source)assert(!existsSync(source));
    } finally {for(const [key,value] of saved)if(value===undefined)delete process.env[key];else process.env[key]=value;rmSync(f.directory,{recursive:true,force:true});}
  }
});
test('source build entrypoint reads version from committed snapshot before invoking Cargo',()=>{
  const f=sourceFixture(),scratch=join(f.directory,'scratch');mkdirSync(scratch);
  try {
    writeFileSync(join(f.directory,'Cargo.toml'),'[workspace.package]\nversion="9.9.9"\n');
    const env={...process.env,OND_TEST_SOURCE_LANE:'local',OND_REPOSITORY_PATH:f.directory,OND_SOURCE_SHA:f.sha,OND_SOURCE_VERSION:'9.9.9',TMPDIR:scratch,TEMP:scratch,TMP:scratch};
    const result=spawnSync(process.execPath,[join(ROOT,'scripts/build-server.mjs')],{env,encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/Explicit Ond source version mismatch/);assert.deepEqual(readdirSync(scratch),[],'Version failure must clean source snapshot');assert(readFileSync(join(f.directory,'Cargo.toml'),'utf8').includes('9.9.9'));
  } finally {rmSync(f.directory,{recursive:true,force:true});}
});
test('private source lane blocks temporary ancestor Cargo config and resolves installed tools explicitly',()=>{
  const f=sourceFixture();
  try {
    mkdirSync(join(f.directory,'.cargo'));for(const name of ['config','config.toml']){writeFileSync(join(f.directory,'.cargo',name),'[build]\n');assert.throws(()=>rejectAncestorCargoConfig(join(f.directory,'src')),/Ancestor Cargo config/);rmSync(join(f.directory,'.cargo',name));}
    rejectAncestorCargoConfig(join(f.directory,'src'));
    const tools=join(f.directory,'tools');mkdirSync(tools);const cargo=join(tools,'cargo'),rustc=join(tools,'rustc');writeFileSync(cargo,'fixture');writeFileSync(rustc,'fixture');const calls=[];
    const resolved=installedSourceToolchain({CARGO_HOME:'private'},(command,args,options)=>{calls.push([command,args,options.env]);return {status:0,stdout:join(tools,args.at(-1))+'\n'};});assert.equal(resolved.cargo,cargo);assert.equal(resolved.rustc,rustc);assert.deepEqual(calls.map(c=>c.slice(0,2)),[['rustup',['which','--toolchain','1.91.1','cargo']],['rustup',['which','--toolchain','1.91.1','rustc']]]);
    assert.throws(()=>installedSourceToolchain({},()=>({status:1,stdout:''})),/Installed Rust 1.91.1/);
  } finally {rmSync(f.directory,{recursive:true,force:true});}
});
test('snapshot Cargo build excludes ambient overrides and cleans home/output on success and failure',()=>{
  const f=sourceFixture(),platform=getPlatform(),overrides={CARGO_HOME:join(f.directory,'ambient-home'),CARGO_BUILD_TARGET:'cross',CARGO_TARGET_DIR:'stale',CARGO_BUILD_RUSTC_WRAPPER:'wrapper',CARGO_ENCODED_RUSTFLAGS:'--cfg\x1fsource_override',CARGO_ALIAS_BUILD:'unapproved',RUSTFLAGS:'--cfg source_override',RUSTDOCFLAGS:'flags',RUSTC:'unapproved',RUSTC_WRAPPER:'wrapper',RUSTC_WORKSPACE_WRAPPER:'wrapper',RUSTUP_TOOLCHAIN:'unapproved',GIT_DIR:'unapproved'},saved=new Map(Object.keys(overrides).map(key=>[key,process.env[key]]));
  let home,output;
  const tools={cargo:join(f.directory,'installed','cargo'),rustc:join(f.directory,'installed','rustc')};
  try {
    Object.assign(process.env,overrides);
    for(const failure of [false,true]) {
      const toolchain=env=>{home=env.CARGO_HOME;assert.notEqual(home,overrides.CARGO_HOME);assert.deepEqual(readdirSync(home),[]);for(const key of Object.keys(overrides))if(key!=='CARGO_HOME')assert.equal(env[key],undefined);return tools;};
      const build=()=>withSourceSnapshot(f.directory,f.sha,snapshot=>buildSourceArtifact(snapshot.directory,join(snapshot.directory,'Cargo.toml'),platform,(command,args,options)=>{
        assert.equal(command,tools.cargo);assert.equal(options.env.RUSTC,tools.rustc);assert(options.env.PATH.startsWith(dirname(tools.cargo)));assert.notEqual(options.cwd,f.directory);assert.equal(readFileSync(join(options.cwd,'src/main.rs'),'utf8'),fixtureProgram);output=args[args.indexOf('--target-dir')+1];assert.deepEqual(readdirSync(output),[]);
        if(failure)return {status:1,stdout:''};
        const executable=join(output,platform.binary);writeFileSync(executable,'exact committed source executable');return {status:0,stdout:JSON.stringify({reason:'compiler-artifact',target:{name:'ond-lsp',kind:['bin']},executable,fresh:false})+'\n'+JSON.stringify({reason:'build-finished',success:true})};
      },toolchain));
      if(failure)assert.throws(build,/Cargo source build failed/);else assert.equal(build().toString(),'exact committed source executable');
      assert(!existsSync(home));assert(!existsSync(output));
    }
  } finally {for(const [key,value] of saved)if(value===undefined)delete process.env[key];else process.env[key]=value;rmSync(f.directory,{recursive:true,force:true});}
});
