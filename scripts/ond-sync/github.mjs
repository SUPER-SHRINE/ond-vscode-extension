// API呼出しはpure plannerから分離。外部応答本文やtokenはerror/logへ出さない。
export class GitHub {
  constructor(repository, token, request = fetch) { if(!['SUPER-SHRINE/ond','SUPER-SHRINE/ond-vscode-extension'].includes(repository))throw new Error('Unexpected repository');this.repository=repository;this.token=token;this.request=request; }
  async call(path, { method='GET', body, binary=false, optional=false }={}) {
    if (path !== '' && !path.startsWith('/')) throw new Error('Invalid API path');
    const response=await this.request(`https://api.github.com/repos/${this.repository}${path}`, {
      method,signal:AbortSignal.timeout(60000),headers:{Accept:binary?'application/octet-stream':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(this.token?{Authorization:`Bearer ${this.token}`}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})
    });
    if(optional && response.status===404)return null;
    if(!response.ok) { const error=new Error(`GitHub ${method} failed (${response.status})`);error.status=response.status;throw error; }
    if(response.status===204)return null;
    return binary?Buffer.from(await response.arrayBuffer()):response.json();
  }
  async all(path) {
    const output=[]; for(let page=1;page<=100;page++) { const a=await this.call(`${path}${path.includes('?')?'&':'?'}per_page=100&page=${page}`);output.push(...a);if(a.length<100)return output; }
    throw new Error('Pagination limit exceeded');
  }
}
