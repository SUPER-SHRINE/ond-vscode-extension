const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { assertExpectedDiagnostic } = require('./diagnostics.cjs');
const root = process.env.OND_TEST_ROOT;
assert(root, 'OND_TEST_ROOT is required');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label) {
  const start = Date.now();
  while (Date.now() - start < 20000) { const result = await fn(); if (result) return result; await wait(200); }
  throw new Error(`Timed out: ${label}`);
}
exports.run = async () => {
  const results = { vscode: vscode.version, run: process.env.OND_HOST_RUN || '1', tests: [], trusted: vscode.workspace.isTrusted };
  const record = (name, value) => { results.tests.push({name, value}); console.log('OND_HOST_TEST',name,JSON.stringify(value)); };
  const uri = vscode.Uri.file(path.join(root,'project/main.ond'));
  const original = fs.readFileSync(uri.fsPath,'utf8');
  let doc;
  try {
    assert(vscode.workspace.isTrusted, 'Generated fixture must have been trusted through the normal editor dialog');
    const ext = vscode.extensions.getExtension('super-shrine.ond-vscode-ext');
    assert(ext,'Installed extension must be discoverable');
    assert.equal(ext.packageJSON.version,process.env.OND_EXPECTED_EXTENSION_VERSION);
    const binary = path.join(ext.extensionPath,'server',process.platform === 'win32' ? 'ond-lsp.exe' : 'ond-lsp');
    assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(binary)).digest('hex'), process.env.OND_EXPECTED_LSP_SHA256);
    record('installed_lsp_sha256',process.env.OND_EXPECTED_LSP_SHA256);
    const installedRelative = path.relative(path.join(root,'extensions'),ext.extensionPath);
    assert(!installedRelative.startsWith('..') && !path.isAbsolute(installedRelative),'Test must use installed VSIX, not source checkout');
    record('installed_vsix',ext.extensionPath);
    doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    await ext.activate(); assert(ext.isActive); assert.equal(doc.languageId,'ond');
    record('activation',true);
    const symbols = await until(async()=>{
      const s=await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider',uri);return s?.length?s:null;
    },'document symbols');
    record('document_symbols',symbols.map(s=>s.name));
    await wait(1500);
    assert.equal(vscode.languages.getDiagnostics(uri).filter(d=>d.severity===vscode.DiagnosticSeverity.Error).length,0);
    record('healthy_file_errors',0);
    const line=original.split('\n').findIndex(l=>l.includes('sumTo(10'));
    const column=original.split('\n')[line].indexOf('sumTo');
    const completions=await vscode.commands.executeCommand('vscode.executeCompletionItemProvider',uri,new vscode.Position(line,column+3));
    const labels=completions?.items.map(i=>typeof i.label==='string'?i.label:i.label.label)||[];
    assert(labels.includes('sumTo'),'sumTo completion missing');record('completion_sumTo',true);
    const hover=await vscode.commands.executeCommand('vscode.executeHoverProvider',uri,new vscode.Position(line,column+1));
    assert(hover?.length);record('hover',hover.length);
    const edit = async text => {
      const change=new vscode.WorkspaceEdit();change.replace(uri,new vscode.Range(doc.positionAt(0),doc.positionAt(doc.getText().length)),text);
      assert(await vscode.workspace.applyEdit(change));await doc.save();
    };
    for(const [name,text,message] of [
      ['type_error',original.replace('sumTo(10 as u32)','true'),'boolean literal requires bool type'],
      ['syntax_error',original.replace('sumTo(10 as u32)',')'),'expected expression']
    ]) {
      await edit(text);
      const errors=await until(()=>{const d=vscode.languages.getDiagnostics(uri).filter(d=>d.severity===0);return d.length?d:null;},name);
      const diagnosis=assertExpectedDiagnostic(errors,{source:'ond-lsp',message,line:3});
      record(name,{uri:uri.toString(),...diagnosis});
      await edit(original);
      await until(()=>vscode.languages.getDiagnostics(uri).filter(d=>d.severity===0).length===0,name+' cleared');
      record(name+'_cleared',true);
    }
    results.success=true;
  } catch(error) { results.success=false;results.error=error.stack;throw error; }
  finally {
    fs.writeFileSync(path.join(root,`host-results-${results.run}.json`),JSON.stringify(results,null,2));
    fs.writeFileSync(uri.fsPath,original);
  }
};
