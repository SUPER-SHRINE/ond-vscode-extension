// 読取専用。設定/mergeを変更せず、最新base・head・CI artifactを照合する。
import assert from 'node:assert/strict';
import { GitHub } from './github.mjs';
import { parseCanonical,parseLock,commit } from './contract.mjs';
import { zipEntries } from './archive.mjs';
import { verifyCandidate } from './publication.mjs';
import { testPolicy } from './test-policy.mjs';
const [number,runID]=process.argv.slice(2);assert.match(number||'',/^[1-9][0-9]*$/);assert.match(runID||'',/^[1-9][0-9]*$/);
const api=new GitHub('SUPER-SHRINE/ond-vscode-extension',process.env.GITHUB_TOKEN||process.env.GH_TOKEN),repository=await api.call('');assert.equal(repository.id,1403086732);
function checkPR(value){
  assert.equal(value.state,'open');assert.equal(value.base.ref,'develop');assert.equal(value.head.repo.id,repository.id);assert.equal(value.base.repo.id,repository.id);assert.equal(value.mergeable,true,'BLOCKED: mergeability unavailable');assert.equal(value.mergeable_state,'clean','BLOCKED: latest-base checks/reviews incomplete');
  commit(value.head.sha);commit(value.base.sha);commit(value.merge_commit_sha);
  return {head:value.head.sha,base:value.base.sha,merge:value.merge_commit_sha};
}
function checkReviews(reviews,head){
  const latest=new Map(),ids=new Set();
  for(const review of reviews){
    assert(Number.isSafeInteger(review.id)&&review.id>0&&!ids.has(review.id),'BLOCKED: invalid review ID');ids.add(review.id);
    assert(Number.isSafeInteger(review.user?.id)&&review.user.id>0&&['User','Bot'].includes(review.user.type),'BLOCKED: review identity unavailable');
    assert(['APPROVED','CHANGES_REQUESTED','DISMISSED','COMMENTED','PENDING'].includes(review.state),'BLOCKED: invalid review state');
    if(['COMMENTED','PENDING'].includes(review.state))continue;
    commit(review.commit_id);
    assert(typeof review.submitted_at==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(review.submitted_at)&&Number.isFinite(Date.parse(review.submitted_at)),'BLOCKED: review chronology unavailable');
    if(review.user.type!=='User')continue;
    const previous=latest.get(review.user.id);
    if(!previous||review.submitted_at>previous.submitted_at||(review.submitted_at===previous.submitted_at&&review.id>previous.id))latest.set(review.user.id,review);
  }
  assert([...latest.values()].some(r=>r.state==='APPROVED'&&r.commit_id===head),'BLOCKED: exact-head human review missing');
}
const pr=await api.call(`/pulls/${number}`),snapshot=checkPR(pr);
const base=(await api.call('/git/ref/heads/develop')).object.sha;assert.equal(pr.base.sha,base,'STALE_BASE');
checkReviews(await api.all(`/pulls/${number}/reviews`),pr.head.sha);
const run=await api.call(`/actions/runs/${runID}`);assert.equal(run.path,'.github/workflows/quality.yml');assert.equal(run.event,'pull_request');assert.equal(run.conclusion,'success');assert.equal(run.status,'completed');assert(run.pull_requests.some(p=>p.number===Number(number)));assert([pr.head.sha,pr.merge_commit_sha].includes(run.head_sha),'Wrong CI head');
const content=await api.call(`/contents/config/ond-release.lock.json?ref=${pr.head.sha}`);assert.equal(content.encoding,'base64');const lock=parseLock(Buffer.from(content.content.replace(/\n/g,''),'base64'));
const packageContent=await api.call(`/contents/package.json?ref=${pr.head.sha}`);const version=JSON.parse(Buffer.from(packageContent.content.replace(/\n/g,''),'base64').toString('utf8')).version;
const artifacts=await api.call(`/actions/runs/${runID}/artifacts?per_page=100`);assert(artifacts.total_count<=100);const {policy,digest:policySha256}=testPolicy();
for(const [target,os] of [['linux-x86_64','Linux'],['windows-x86_64','Windows']]){
  const matches=artifacts.artifacts.filter(a=>a.name===`vscode-integration-${os}`);assert.equal(matches.length,1);assert.equal(matches[0].expired,false,'BLOCKED: CI artifact expired');
  const bytes=await api.call(`/actions/artifacts/${matches[0].id}/zip`,{binary:true}),files=zipEntries(bytes),name=`ond-vscode-extension-${version}-${target}.vsix`,evidence=parseCanonical(files.get(`${name}.verified.json`));
  assert.equal(evidence.extensionCommit,pr.merge_commit_sha,'CI did not test the current merge tree');
  verifyCandidate({lock,target,version,extensionCommit:evidence.extensionCommit,headCommit:pr.head.sha,baseCommit:base,policy,policySha256,vsix:files.get(name),evidence});
}
const final=await api.call(`/pulls/${number}`);assert.deepEqual(checkPR(final),snapshot,'BLOCKED: PR changed during verification');checkReviews(await api.all(`/pulls/${number}/reviews`),pr.head.sha);assert.equal((await api.call('/git/ref/heads/develop')).object.sha,base,'STALE_BASE');
console.log(`CI_VERIFIED head ${pr.head.sha} base ${base}; human merge required (no atomic merge performed)`);
