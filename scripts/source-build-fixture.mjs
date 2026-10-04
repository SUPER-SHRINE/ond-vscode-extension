// 明示的なlocal検証専用。npm check/正式release packageはRustを要求しない。
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync,existsSync,mkdirSync,readFileSync,rmSync,writeFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { sourceFixture,fixtureProgram } from './source-fixtures.mjs';
import { withSourceSnapshot } from './source-checkout.mjs';
import { buildSourceArtifact } from './source-artifact.mjs';
import { getPlatform } from './platform.mjs';
import { sha256 } from './ond-sync/contract.mjs';
const f=sourceFixture(),platform=getPlatform(),ambient=join(f.directory,'ambient-cargo-home'),config='[build]\nrustflags=["--cfg","source_override"]\nrustc="must-not-run-original-config-rustc"\n';
const overrides={CARGO_HOME:ambient,CARGO_BUILD_TARGET:'unapproved-cross-target',CARGO_TARGET_DIR:join(f.directory,'stale-output'),CARGO_BUILD_RUSTC_WRAPPER:'must-not-run-wrapper',CARGO_ENCODED_RUSTFLAGS:'--cfg\x1fsource_override',RUSTFLAGS:'--cfg source_override',RUSTC:'must-not-run-ambient-rustc',RUSTC_WRAPPER:'must-not-run-wrapper',RUSTC_WORKSPACE_WRAPPER:'must-not-run-wrapper',RUSTUP_TOOLCHAIN:'must-not-run-toolchain'},saved=new Map(Object.keys(overrides).map(key=>[key,process.env[key]]));
const outputs=[],homes=[],snapshots=[];
try {
  mkdirSync(ambient);writeFileSync(join(ambient,'config.toml'),config);mkdirSync(join(f.directory,'.cargo'));writeFileSync(join(f.directory,'.cargo/config.toml'),config);
  mkdirSync(join(f.directory,'target/release'),{recursive:true});writeFileSync(join(f.directory,'target/release',platform.binary),'stale executable');
  f.git(['update-index','--assume-unchanged','src/main.rs']);writeFileSync(join(f.directory,'src/main.rs'),'fn main() { println!("working tree impostor"); }\n');writeFileSync(join(f.directory,'Cargo.toml'),'[workspace.package]\nversion="9.9.9"\n');Object.assign(process.env,overrides);
  const binary=withSourceSnapshot(f.directory,f.sha,snapshot=>{
    snapshots.push(snapshot.directory);assert.equal(readFileSync(join(snapshot.directory,'src/main.rs'),'utf8'),fixtureProgram);assert.match(readFileSync(join(snapshot.directory,'Cargo.toml'),'utf8'),/version = "0\.1\.2"/);
    return buildSourceArtifact(snapshot.directory,join(snapshot.directory,'Cargo.toml'),platform,(command,args,options)=>{outputs.push(args[args.indexOf('--target-dir')+1]);homes.push(options.env.CARGO_HOME);assert(!command.includes('ambient'));assert.notEqual(options.env.RUSTC,overrides.RUSTC);assert.equal(options.env.RUSTFLAGS,undefined);return spawnSync(command,args,options);});
  });
  const executable=join(f.directory,platform.binary);writeFileSync(executable,binary);chmodSync(executable,0o755);const result=spawnSync(executable,[],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'committed exact SHA program');
  assert(readFileSync(join(f.directory,'src/main.rs'),'utf8').includes('working tree impostor'));assert(readFileSync(join(f.directory,'Cargo.toml'),'utf8').includes('9.9.9'));assert.equal(readFileSync(join(ambient,'config.toml'),'utf8'),config);assert.equal(readFileSync(join(f.directory,'target/release',platform.binary),'utf8'),'stale executable');
  assert(snapshots.every(path=>!existsSync(dirname(path))));assert(homes.concat(outputs).every(path=>!existsSync(path)));
  const evidence={fixtureCommit:f.sha,nativeTarget:platform.target,binarySha256:sha256(binary),actualProgram:result.stdout.trim(),snapshotSourceMatchesCommit:true,versionFromCommittedManifest:'0.1.2',originalVersion:'9.9.9',ambientOverridesIgnored:Object.keys(overrides),originalCargoConfigIgnored:true,ambientCargoHomeConfigIgnored:true,originalFilesPreserved:true,temporaryDirectoriesCleaned:true,toolchain:'1.91.1',trustBoundary:'Installed toolchain and OS/native environment remain trusted; no hermetic binary claim'};
  if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
} finally {for(const [key,value] of saved)if(value===undefined)delete process.env[key];else process.env[key]=value;rmSync(f.directory,{recursive:true,force:true});}
