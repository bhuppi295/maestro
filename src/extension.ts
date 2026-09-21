import * as vscode from 'vscode';
import { MaestroViewProvider } from './webview/MaestroViewProvider';
import { ContextService } from './services/context.service';

export function activate(context: vscode.ExtensionContext) {
  console.log('Maestro is now active');

  const provider = new MaestroViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('maestro.mainView', provider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('maestro.openPanel', () => {
      vscode.commands.executeCommand('maestro.mainView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('maestro.openInEditor', () => {
      provider.openInEditor();
    })
  );

  // Auto-onboard on activation (folder already open)
  _tryAutoOnboard(context);

  // Auto-onboard when a new folder is opened mid-session
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      _tryAutoOnboard(context);
    })
  );
}

async function _tryAutoOnboard(extContext: vscode.ExtensionContext): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return;

  const svc = new ContextService(extContext);

  // Already onboarded — skip silently
  if (svc.hasContext()) return;

  try {
    await svc.generateFromWorkspace((_msg) => { /* silent background scan */ });
  } catch (err) {
    console.error('[Maestro] Auto-onboarding failed:', err);
  }
}

export function deactivate() {}