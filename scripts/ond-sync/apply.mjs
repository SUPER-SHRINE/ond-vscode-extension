import assert from 'node:assert/strict';
import { canonical } from './contract.mjs';
import { verifyExecution } from './bundle.mjs';
import { plan } from './planner.mjs';
// 各境界で再読取りして変更を検出する。GitHubの複数resourceを原子的には固定できない。
export async function apply(input, suppliedPlan, remote, verifyRelease) {
  verifyExecution(input);
  await remote.identity();
  const expected=plan(input);
  assert.equal(canonical(suppliedPlan),canonical(expected),'Plan was modified');
  const marker=`<!-- ond-sync:${expected.planID} -->`;
  const message=`Ond ${input.candidate.version}の同梱入力を固定\n\n${marker}`;
  const validBranch=c=>c&&c.tree===expected.tree&&c.parents.length===1&&c.parents[0]===expected.base.commit&&c.message===message;
  const checkBase=async()=>{const current=await remote.base();assert.equal(current.sha,expected.base.commit,'STALE_BASE');assert.equal(current.tree,expected.base.tree,'STALE_BASE');};
  const checkPR=(p,ref)=>{
    assert(Number.isSafeInteger(p.number)&&p.number>0,'Invalid PR number');
    assert.equal(p.head,expected.branch,'PR_BRANCH_CHANGED');assert.equal(p.base,'develop','PR_BASE_CHANGED');
    assert(p.body.includes(marker),'MANUAL_PR');
    assert.equal(p.headRepository,'SUPER-SHRINE/ond-vscode-extension','FOREIGN_PR');
    assert.equal(p.baseRepository,'SUPER-SHRINE/ond-vscode-extension','FOREIGN_PR');
    assert(ref,'PR_BRANCH_MISSING');assert.equal(p.headSha,ref.sha,'PR_HEAD_CHANGED');
  };
  const inspect=async observedHead=>{
    await checkBase();
    const ref=await remote.branch(expected.branch);
    if(ref)assert(validBranch(ref),'MANUAL_BRANCH');
    if(observedHead!==undefined){assert(ref,'PR_BRANCH_MISSING');assert.equal(ref.sha,observedHead,'BRANCH_HEAD_CHANGED');}
    const prs=await remote.pullRequests();
    assert(!prs.some(p=>p.state==='open'&&p.head.startsWith('feature/ond-update-')&&p.head!==expected.branch),'CONFLICTING_PR');
    const matching=prs.filter(p=>p.head===expected.branch);
    assert(matching.length<=1,'DUPLICATE_PR');
    if(matching.length)checkPR(matching[0],ref);
    await checkBase();
    const finalRef=await remote.branch(expected.branch);
    assert.equal(finalRef?.sha,ref?.sha,'BRANCH_HEAD_CHANGED');
    if(finalRef)assert(validBranch(finalRef),'MANUAL_BRANCH');
    return {ref:finalRef,pr:matching[0]};
  };
  await verifyRelease(input.candidate);
  await checkBase();
  if(expected.noop)return {state:'NOOP',planID:expected.planID};
  let current=await inspect();
  if(current.pr?.state==='closed')return {state:current.pr.merged?'MERGED':'CLOSED',pr:current.pr.number,planID:expected.planID};
  if(!current.ref) {
    const tree=await remote.createTree(expected.base.tree,expected.files);
    assert.equal(tree,expected.tree,'Generated tree mismatch');
    const created=await remote.createCommit(message,tree,expected.base.commit);
    await checkBase();
    try {await remote.createBranch(expected.branch,created);}catch(e){if(![409,422].includes(e.status))throw e;}
    current=await inspect();assert(current.ref,'PR_BRANCH_MISSING');
  }
  // scalarとして記録し、adapterの共有objectが書換わっても観測headを変えない。
  const observedHead=current.ref.sha;
  await verifyRelease(input.candidate);
  current=await inspect(observedHead);
  if(current.pr?.state==='closed')return {state:current.pr.merged?'MERGED':'CLOSED',pr:current.pr.number,planID:expected.planID};
  let createdPR;
  if(!current.pr) {
    try {
      createdPR=await remote.createPR(expected.branch,`Ond ${input.candidate.version}の同梱入力を更新`,`${marker}\n\n固定base: ${expected.base.commit}\n生成tree: ${expected.tree}\nlock SHA-256: ${expected.lockHash}\n\nCIと人のレビューが必要です。版選択・merge・tag・公開は自動化しません。`);
      checkPR(createdPR,current.ref);assert.equal(createdPR.state,'open','PR_STATE_CHANGED');
    } catch(e) {if(![409,422].includes(e.status))throw e;}
  }
  const final=await inspect(observedHead);
  assert(final.pr,'PR_MISSING');assert.equal(final.pr.state,'open','PR_STATE_CHANGED');
  if(createdPR)assert.equal(final.pr.number,createdPR.number,'PR_REPLACED');
  return {state:'PR_OPEN',pr:final.pr.number,head:observedHead,planID:expected.planID};
}
function pullRequest(p){return {number:p.number,head:p.head.ref,base:p.base.ref,state:p.state,merged:!!p.merged_at,body:p.body||'',headSha:p.head.sha,headRepository:p.head.repo?.full_name,baseRepository:p.base.repo?.full_name};}
export function githubRemote(api) {
  return {
    async identity(){const r=await api.call('');assert.equal(r.id,1404564933);assert.equal(r.full_name,'SUPER-SHRINE/ond-vscode-extension');},
    async base(){const r=await api.call('/git/ref/heads/develop'),c=await api.call(`/git/commits/${r.object.sha}`);return {sha:r.object.sha,tree:c.tree.sha};},
    async branch(name){const r=await api.call(`/git/ref/heads/${name}`,{optional:true});if(!r)return null;const c=await api.call(`/git/commits/${r.object.sha}`);return {sha:r.object.sha,tree:c.tree.sha,parents:c.parents.map(p=>p.sha),message:c.message};},
    async pullRequests(){return (await api.all('/pulls?state=all')).map(pullRequest);},
    async createTree(base_tree,files){return (await api.call('/git/trees',{method:'POST',body:{base_tree,tree:files.map(f=>({path:f.path,mode:f.mode,type:'blob',content:f.content}))}})).sha;},
    async createCommit(message,tree,parent){return (await api.call('/git/commits',{method:'POST',body:{message,tree,parents:[parent],author:{name:'Aoi',email:'337560299+super-shrine-share@users.noreply.github.com'},committer:{name:'Aoi',email:'337560299+super-shrine-share@users.noreply.github.com'}}})).sha;},
    createBranch:(branch,sha)=>api.call('/git/refs',{method:'POST',body:{ref:`refs/heads/${branch}`,sha}}),
    async createPR(head,title,body){return pullRequest(await api.call('/pulls',{method:'POST',body:{base:'develop',head,title,body,draft:true}}));}
  };
}
