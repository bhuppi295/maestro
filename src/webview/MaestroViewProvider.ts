import * as vscode from 'vscode';
import { WebViewMessage, ExtensionMessage, Ticket } from '../types';
import { TicketStore } from '../store/ticket.store';
import { ContextService } from '../services/context.service';
import { ClaudeCliService } from '../services/claude-cli.service';
import { GitService, resolveGroupBranch } from '../services/git.service';
import { AnalyzeService } from '../services/analyze.service';
import { OrchestratorAI } from '../core/orchestrator';
import { PrerequisitesService } from '../services/prerequisites.service';
import { SettingsService } from '../services/settings.service';
import { PlannerAI } from '../core/planner';
import { ImplementerAI } from '../core/implementer';
import { ReviewerAI } from '../core/reviewer';

const MAX_ATTEMPTS = 3;

export class MaestroViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _ticketStore: TicketStore;
  private _contextService: ContextService;
  private _claudeCli: ClaudeCliService;
  private _prerequisites: PrerequisitesService;
  private _settings: SettingsService;
  private _orchestrator: OrchestratorAI;
  private _planner: PlannerAI;
  private _implementer: ImplementerAI;
  private _reviewer: ReviewerAI;
  private _analyze: AnalyzeService;
  // Tracks cancellation requests per ticket
  private _cancelFlags = new Map<string, boolean>();
  // Stores AbortControllers to kill running processes on delete/stop
  private _abortControllers = new Map<string, AbortController>();

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._ticketStore = new TicketStore(_context);
    this._claudeCli = new ClaudeCliService();
    this._contextService = new ContextService(_context);
    this._orchestrator = new OrchestratorAI(this._claudeCli);
    this._prerequisites = new PrerequisitesService();
    this._settings = new SettingsService(_context);
    this._planner = new PlannerAI(this._claudeCli);
    this._implementer = new ImplementerAI();
    this._reviewer = new ReviewerAI(this._claudeCli);
    this._analyze = new AnalyzeService();
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._context.extensionUri, 'webview-ui', 'dist'),
      ],
    };
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) this._sendInitialState();
    });
    webviewView.webview.onDidReceiveMessage(
      (message: WebViewMessage) => this._handleMessage(message),
      undefined,
      this._context.subscriptions
    );

    // Run prerequisites check on first open
    this._runPrerequisitesCheck();
    // Send current settings to WebView
    this._view?.webview.postMessage({ type: 'SETTINGS_UPDATED', settings: this._settings.get() });
  }

  // ── Private ──────────────────────────────────────────────────

  private async _runPrerequisitesCheck() {
    try {
      const status = await this._prerequisites.check();
      this._view?.webview.postMessage({ type: 'PREREQUISITES_RESULT', status });
    } catch (err) {
      console.error('Prerequisites check failed:', err);
    }
  }

  private _postMessage(message: ExtensionMessage) {
    this._view?.webview.postMessage(message);
  }

  private _log(ticketId: string, msg: string) {
    this._postMessage({ type: 'AI_LOG', ticketId, message: msg });
  }

  private _sendInitialState() {
    const ctx = this._contextService.getContext();
    this._postMessage({ type: 'PROJECT_CONTEXT_READY', context: ctx ?? null } as any);
    this._postMessage({ type: 'TICKETS_UPDATED', tickets: this._ticketStore.getAll() });
    this._view?.webview.postMessage({ type: 'SETTINGS_UPDATED', settings: this._settings.get() });
  }

  private _getWorkspacePath(): string {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) throw new Error('No workspace folder open.');
    return folders[0].uri.fsPath;
  }

  private _refreshTickets() {
    this._postMessage({ type: 'TICKETS_UPDATED', tickets: this._ticketStore.getAll() });
  }

  // ── Implementation Loop (Implement → Analyze → Review → Retry) ──

  private async _runImplementationLoop(
    ticket: Ticket,
    workspacePath: string
  ): Promise<void> {
    const ctx = this._contextService.getContext()!;
    const settings = this._settings.get();
    const git = new GitService(workspacePath);
    let previousFeedback = '';

    // Reset cancel flag for this ticket
    this._cancelFlags.set(ticket.id, false);

    for (let attempt = 1; attempt <= settings.maxRetries; attempt++) {
      // ── Check cancellation ─────────────────────────────
      if (this._cancelFlags.get(ticket.id)) {
        this._ticketStore.updateStatus(ticket.id, 'todo');
        this._refreshTickets();
        this._log(ticket.id, '🛑 Stopped by user — ticket reset to Todo.');
        this._cancelFlags.delete(ticket.id);
        return;
      }

      const isRetry = attempt > 1;

      // ── Step A: Implement ──────────────────────────────────
      this._ticketStore.updateStatus(ticket.id, 'in_progress');
      this._refreshTickets();

      if (isRetry) {
        this._log(ticket.id, `🔄 Retry ${attempt}/${MAX_ATTEMPTS} — applying reviewer feedback...`);
      } else {
        this._log(ticket.id, '⚡ OpenCode is implementing...');
      }

      // Pass previous feedback into ticket description for retry
      const ticketForImplementer = isRetry
        ? {
            ...ticket,
            description: `${ticket.description}\n\nPrevious attempt failed. Reviewer feedback:\n${previousFeedback}`,
          }
        : ticket;

      // Create abort controller for this implementation run
      const implController = new AbortController();
      this._abortControllers.set(ticket.id, implController);

      const report = await this._implementer.run(
        ticketForImplementer,
        ctx,
        workspacePath,
        implController.signal,
        settings.implementationModel
      );
      this._abortControllers.delete(ticket.id);
      this._ticketStore.update(ticket.id, {
        completionReport: report,
        attempts: attempt,
      });

      // ── Step B: Flutter Analyze ────────────────────────────
      this._log(ticket.id, '🔍 Running flutter analyze...');
      const ctx = this._contextService.getContext()!;
      const analyzeResult = await this._analyze.run(workspacePath, ctx.analyzeCommands ?? []);

      // ── Step C: Reviewer AI ────────────────────────────────
      this._ticketStore.updateStatus(ticket.id, 'in_review');
      this._refreshTickets();
      this._log(ticket.id, '🧠 Reviewer AI checking implementation...');

      const diff = await git.getDiff();
      const review = await this._reviewer.run(
        ticket,
        ctx,
        report,
        analyzeResult,
        diff,
        workspacePath
      );

      if (review.approved) {
        // ✅ Approved
        this._ticketStore.updateStatus(ticket.id, 'ready_to_test');
        this._refreshTickets();
        this._log(ticket.id, '✅ Reviewer approved — ready for your manual test!');
        const testAction = await vscode.window.showInformationMessage(
          `🎼 Maestro: "${ticket.title}" is ready to test!`,
          'Open Maestro'
        );
        if (testAction === 'Open Maestro') {
          vscode.commands.executeCommand('maestro.mainView.focus');
        }
        return;
      }

      // ❌ Rejected
      previousFeedback = review.feedback;
      this._ticketStore.addReviewerFeedback(ticket.id, review.feedback);
      this._refreshTickets();
      this._log(
        ticket.id,
        `❌ Reviewer rejected (attempt ${attempt}/${MAX_ATTEMPTS}): ${review.feedback.slice(0, 120)}`
      );

      if (attempt >= MAX_ATTEMPTS) {
        // Escalate to user after max retries
        this._ticketStore.updateStatus(ticket.id, 'failed');
        this._refreshTickets();
        this._log(
          ticket.id,
          `⚠️ Max attempts reached. Please review manually or click "Handle Manually".`
        );
        vscode.window.showWarningMessage(
          `Maestro: "${ticket.title}" failed after ${MAX_ATTEMPTS} attempts. Manual review needed.`
        );
        return;
      }

      // Continue loop for next attempt
    }
  }

  // ── Message Handler ──────────────────────────────────────────

  private async _handleMessage(message: WebViewMessage) {
    switch (message.type) {

      case 'SETUP_SCAN_WORKSPACE': {
        await this._runWithProgress(async (onProgress) => {
          try {
            const ctx = await this._contextService.generateFromWorkspace(onProgress);
            this._postMessage({ type: 'PROJECT_CONTEXT_READY', context: ctx } as any);
            vscode.window.showInformationMessage('✅ Maestro: Project context ready!');
          } catch (err) {
            this._postMessage({ type: 'ERROR', ticketId: 'setup', error: (err as Error).message });
          }
        });
        break;
      }

      case 'SETUP_LOAD_FILE': {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { 'Markdown / PRD': ['md', 'txt'] },
          title: 'Select your PRD or project description file',
        });
        if (!uris || uris.length === 0) break;
        await this._runWithProgress(async (onProgress) => {
          try {
            const ctx = await this._contextService.generateFromFile(uris[0].fsPath, onProgress);
            this._postMessage({ type: 'PROJECT_CONTEXT_READY', context: ctx } as any);
            vscode.window.showInformationMessage('✅ Maestro: Project context ready!');
          } catch (err) {
            this._postMessage({ type: 'ERROR', ticketId: 'setup', error: (err as Error).message });
          }
        });
        break;
      }

      case 'CLEAR_CONTEXT': {
        this._contextService.clearContext();
        this._ticketStore.clear();
        this._postMessage({ type: 'PROJECT_CONTEXT_READY', context: null } as any);
        this._postMessage({ type: 'TICKETS_UPDATED', tickets: [] });
        break;
      }

      case 'GET_SETTINGS': {
        this._view?.webview.postMessage({ type: 'SETTINGS_UPDATED', settings: this._settings.get() });
        break;
      }

      case 'SAVE_SETTINGS': {
        this._settings.save((message as any).settings);
        this._view?.webview.postMessage({ type: 'SETTINGS_UPDATED', settings: this._settings.get() });
        vscode.window.showInformationMessage('✅ Maestro: Settings saved!');
        break;
      }

      case 'RESET_SETTINGS': {
        this._settings.reset();
        this._view?.webview.postMessage({ type: 'SETTINGS_UPDATED', settings: this._settings.get() });
        break;
      }

      case 'CHECK_PREREQUISITES': {
        const status = await this._prerequisites.check();
        this._view?.webview.postMessage({ type: 'PREREQUISITES_RESULT', status });
        break;
      }

      case 'OPEN_URL': {
        vscode.env.openExternal(vscode.Uri.parse((message as any).url));
        break;
      }

      case 'REFRESH_CONTEXT': {
        await this._runWithProgress(async (onProgress) => {
          try {
            const ctx = await this._contextService.refreshContext(onProgress);
            this._postMessage({ type: 'PROJECT_CONTEXT_READY', context: ctx } as any);
            vscode.window.showInformationMessage('✅ Maestro: Context refreshed!');
          } catch (err) {
            this._postMessage({ type: 'ERROR', ticketId: 'setup', error: (err as Error).message });
          }
        });
        break;
      }

      case 'SAVE_PLAN': {
        const saveUri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(
            `${message.ticketTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_plan.md`
          ),
          filters: { 'Markdown': ['md'], 'Text': ['txt'] },
          title: 'Save Implementation Plan',
        });
        if (saveUri) {
          const fs = await import('fs');
          fs.writeFileSync(saveUri.fsPath, message.content, 'utf-8');
          vscode.window.showInformationMessage('📄 Plan saved!');
        }
        break;
      }

      case 'SUBMIT_TASK': {
        const ctx = this._contextService.getContext();
        if (!ctx) {
          this._postMessage({ type: 'ERROR', ticketId: 'system', error: 'Set up project context first.' });
          break;
        }
        await this._runWithProgress(async (onProgress) => {
          try {
            onProgress('🧠 Orchestrator analyzing task...');
            const newTickets = await this._orchestrator.run(message.payload, ctx, this._getWorkspacePath());
            for (const t of newTickets) this._ticketStore.add(t);
            this._refreshTickets();
            onProgress(`✅ ${newTickets.length} ticket${newTickets.length > 1 ? 's' : ''} created`);
          } catch (err) {
            this._postMessage({ type: 'ERROR', ticketId: 'system', error: (err as Error).message });
          }
        });
        break;
      }

      case 'DO_WITH_AI': {
        const ctx = this._contextService.getContext();
        const ticket = this._ticketStore.getAll().find(t => t.id === message.ticketId);
        if (!ctx || !ticket) break;

        // ── Dependency check ──────────────────────────────
        if (ticket.dependsOn.length > 0) {
          const allTickets = this._ticketStore.getAll();
          const blockers = ticket.dependsOn
            .map(depId => allTickets.find(t => t.id === depId))
            .filter((dep): dep is typeof ticket => !!dep && dep.status !== 'done');

          if (blockers.length > 0) {
            const titles = blockers.map(b => `"${b.title}"`).join(', ');
            this._postMessage({
              type: 'ERROR',
              ticketId: ticket.id,
              error: `Complete ${titles} first before starting this ticket.`,
            });
            break;
          }
        }
        // ── Proceed with planning ─────────────────────────
        await this._runWithProgress(async (onProgress) => {
          try {
            this._ticketStore.updateStatus(ticket.id, 'planning');
            this._refreshTickets();
            onProgress('🧠 Planner reading codebase...');

            // Create abort controller for this planning run
            const controller = new AbortController();
            this._abortControllers.set(ticket.id, controller);

            const s = this._settings.get();
            const plan = await this._planner.run(ticket, ctx, this._getWorkspacePath(), { signal: controller.signal, timeoutMs: s.claudeTimeoutMs });
            this._abortControllers.delete(ticket.id);
            this._ticketStore.update(ticket.id, {
              implementationPlan: plan.implementationPlan,
              affectedFiles: plan.affectedFiles,
              acceptanceCriteria: plan.acceptanceCriteria,
              architectureNotes: plan.architectureNotes,
              specialistType: plan.specialistType,
              status: 'plan_review',
            });
            this._refreshTickets();
            onProgress('👀 Plan ready — please review and approve');
            const planAction = await vscode.window.showInformationMessage(
              `🎼 Maestro: Plan ready for "${ticket.title}"`,
              'Review Plan'
            );
            if (planAction === 'Review Plan') {
              vscode.commands.executeCommand('maestro.mainView.focus');
            }
          } catch (err) {
            this._ticketStore.updateStatus(ticket.id, 'todo');
            this._refreshTickets();
            this._postMessage({ type: 'ERROR', ticketId: ticket.id, error: (err as Error).message });
          }
        });
        break;
      }

      case 'APPROVE_PLAN': {
        const ctx = this._contextService.getContext();
        const ticket = this._ticketStore.getAll().find(t => t.id === message.ticketId);
        if (!ctx || !ticket) break;

        // ── Implementation lock — only one at a time ──────────
        const allTickets = this._ticketStore.getAll();
        const runningTicket = allTickets.find(
          t => t.id !== ticket.id && (t.status === 'in_progress' || t.status === 'in_review')
        );

        if (runningTicket) {
          this._postMessage({
            type: 'ERROR',
            ticketId: ticket.id,
            error: `"${runningTicket.title}" is already running. Wait for it to finish before starting another.`,
          });
          break;
        }
        // ─────────────────────────────────────────────────────

        try {
          const workspacePath = this._getWorkspacePath();
          const git = new GitService(workspacePath);

          // Create branch once before loop starts
          // All tickets in the same group share one branch
          const branchName = resolveGroupBranch(
            ticket.groupId,
            ticket.groupTitle,
            ticket.groupBranchType ?? 'ft',
            this._ticketStore.getAll()
          );
          this._log(ticket.id, `🌿 Branch: ${branchName}`);
          await git.createBranch(branchName);
          // Save branch name to ALL tickets in this group
          const groupTickets = this._ticketStore.getAll().filter(t => t.groupId === ticket.groupId);
          for (const gt of groupTickets) {
            this._ticketStore.update(gt.id, { branchName });
          }

          // Run full implement → analyze → review → retry loop
          await this._runImplementationLoop(ticket, workspacePath);

        } catch (err) {
          this._ticketStore.updateStatus(ticket.id, 'todo');
          this._postMessage({ type: 'ERROR', ticketId: ticket.id, error: (err as Error).message });
        }
        break;
      }

      case 'REQUEST_PLAN_CHANGES': {
        const ctx2 = this._contextService.getContext();
        const ticket2 = this._ticketStore.getAll().find(t => t.id === message.ticketId);
        if (!ctx2 || !ticket2) break;
        await this._runWithProgress(async (onProgress) => {
          try {
            this._ticketStore.updateStatus(ticket2.id, 'planning');
            this._refreshTickets();
            const updatedTicket = {
              ...ticket2,
              description: `${ticket2.description}\n\nDeveloper feedback: ${message.feedback}`,
            };
            onProgress('🔄 Replanning with your feedback...');
            const s2 = this._settings.get();
            const plan = await this._planner.run(updatedTicket, ctx2, this._getWorkspacePath(), { timeoutMs: s2.claudeTimeoutMs });
            this._ticketStore.update(ticket2.id, {
              implementationPlan: plan.implementationPlan,
              affectedFiles: plan.affectedFiles,
              acceptanceCriteria: plan.acceptanceCriteria,
              architectureNotes: plan.architectureNotes,
              specialistType: plan.specialistType,
              status: 'plan_review',
            });
            this._refreshTickets();
            onProgress('👀 Updated plan ready — please review');
          } catch (err) {
            this._postMessage({ type: 'ERROR', ticketId: message.ticketId, error: (err as Error).message });
          }
        });
        break;
      }

      case 'APPROVE_TEST': {
        const doneTicket = this._ticketStore.getAll().find(t => t.id === message.ticketId);
        this._ticketStore.updateStatus(message.ticketId, 'done');
        // Auto-update project context with completed feature
        if (doneTicket) {
          this._contextService.addCompletedFeature(doneTicket.title);
        }
        this._refreshTickets();
        vscode.window.showInformationMessage('🚀 Ticket completed!');
        break;
      }

      case 'REJECT_TEST': {
        this._ticketStore.addReviewerFeedback(message.ticketId, message.reason);
        this._ticketStore.updateStatus(message.ticketId, 'failed');
        this._refreshTickets();
        break;
      }

      case 'STOP_TASK': {
        // Kill running process immediately
        this._abortControllers.get(message.ticketId)?.abort();
        this._abortControllers.delete(message.ticketId);
        this._cancelFlags.set(message.ticketId, true);
        this._ticketStore.updateStatus(message.ticketId, 'todo');
        this._refreshTickets();
        this._log(message.ticketId, '🛑 Stopped — ticket reset to Todo.');
        break;
      }

      case 'DELETE_TICKET': {
        this._abortControllers.get(message.ticketId)?.abort();
        this._abortControllers.delete(message.ticketId);
        this._cancelFlags.delete(message.ticketId);
        this._ticketStore.remove(message.ticketId);
        this._refreshTickets();
        break;
      }

      case 'RETRY_TICKET': {
        // Re-run implementation for a failed ticket
        const ctx = this._contextService.getContext();
        const retryTicket = this._ticketStore.getAll().find(t => t.id === message.ticketId);
        if (!ctx || !retryTicket) break;

        // Check implementation lock
        const running = this._ticketStore.getAll().find(
          t => t.id !== retryTicket.id && (t.status === 'in_progress' || t.status === 'in_review')
        );
        if (running) {
          this._postMessage({
            type: 'ERROR',
            ticketId: retryTicket.id,
            error: `"${running.title}" is already running. Wait for it to finish.`,
          });
          break;
        }

        try {
          const workspacePath = this._getWorkspacePath();
          await this._runImplementationLoop(retryTicket, workspacePath);
        } catch (err) {
          this._ticketStore.updateStatus(message.ticketId, 'failed');
          this._refreshTickets();
          this._postMessage({ type: 'ERROR', ticketId: message.ticketId, error: (err as Error).message });
        }
        break;
      }

      case 'UNBLOCK_MANUAL': {
        this._ticketStore.updateStatus(message.ticketId, 'todo');
        this._refreshTickets();
        break;
      }
    }
  }

  private async _runWithProgress(fn: (onProgress: (msg: string) => void) => Promise<void>) {
    const onProgress = (msg: string) => {
      this._postMessage({ type: 'AI_LOG', ticketId: 'system', message: msg });
    };
    await fn(onProgress);
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const distUri = vscode.Uri.joinPath(this._context.extensionUri, 'webview-ui', 'dist');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'assets', 'index.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'assets', 'index.css'));
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>Maestro</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}