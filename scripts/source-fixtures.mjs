// Node-only unit testsと明示実行の小Cargo fixtureで共有する隔離Git repository。
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync,mkdirSync,mkdtempSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export const fixtureProgram='fn main() { #[cfg(source_override)] println!("override"); #[cfg(not(source_override))] println!("committed exact SHA program"); }\n';
export const fixtureManifest='[package]\nname = "ond-lsp"\nversion.workspace = true\nedition = "2024"\n[workspace]\nmembers = ["."]\n[workspace.package]\nversion = "0.1.2"\n';
export function sourceFixture() {
  const directory=mkdtempSync(join(tmpdir(),'ond-object-fixture-'));
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key)));Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null'});
  const git=(args,input)=>{const result=spawnSync('git',['-C',directory,...args],{encoding:'utf8',input,env});assert.equal(result.status,0,result.stderr);return result.stdout.trim();};
  git(['init','--initial-branch=fixture']);git(['config','core.autocrlf','false']);git(['config','commit.gpgSign','false']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.invalid']);git(['config','core.hooksPath',join(directory,'.git/no-hooks')]);git(['commit','--allow-empty','-m','first commit']);
  const initial=git(['rev-parse','HEAD']);mkdirSync(join(directory,'src'));mkdirSync(join(directory,'scripts'));
  const files={'Cargo.toml':fixtureManifest,'Cargo.lock':'version = 4\n\n[[package]]\nname = "ond-lsp"\nversion = "0.1.2"\n','src/main.rs':fixtureProgram,'src/subst.txt':'$Format:%H$\n','scripts/tool.sh':'#!/bin/sh\nexit 0\n','.gitignore':'/target/\n/.cargo/\n','.gitattributes':'src/main.rs text eol=crlf export-ignore\nsrc/subst.txt export-subst\n'};
  for(const [path,bytes] of Object.entries(files))writeFileSync(join(directory,path),bytes);
  chmodSync(join(directory,'scripts/tool.sh'),0o755);
  git(['add','.']);git(['update-index','--chmod=+x','scripts/tool.sh']);git(['commit','-m','source fixture']);const sha=git(['rev-parse','HEAD']);return {directory,git,initial,sha,files};
}
