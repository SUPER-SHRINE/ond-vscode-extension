const vscode = require('vscode');
exports.activate = async () => {
  try { await require('../suite.cjs').run(); }
  catch (error) { console.error(error); }
  finally { await vscode.commands.executeCommand('workbench.action.quit'); }
};
