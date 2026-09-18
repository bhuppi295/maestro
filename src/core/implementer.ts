import { spawn } from 'child_process';
import { Ticket, ProjectContext, CompletionReport } from '../types';

const TIMEOUT_MS = 5 * 60_000;

export class ImplementerAI {
  async run(
    ticket: Ticket,
    projectContext: ProjectContext,
    workspacePath: string,
    signal?: AbortSignal,
    model = 'opencode/deepseek-v4-flash-free'
  ): Promise<CompletionReport> {
    const prompt = this._buildPrompt(ticket, projectContext);

    try {
      const output = await this._spawnOpenCode(prompt, workspacePath, signal, model);
      return this._parseCompletionReport(output, ticket);
    } catch (err) {
      const msg = (err as Error).message;
      return {
        completed: [],
        incomplete: ticket.acceptanceCriteria ?? ['Implementation not confirmed'],
        stoppedReason: msg,
      };
    }
  }

  private _spawnOpenCode(prompt: string, cwd: string, signal?: AbortSignal, model = 'opencode/deepseek-v4-flash-free'): Promise<string> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        return reject(new Error('Cancelled by user'));
      }

      const child = spawn(
        'opencode',
        ['run', '-m', model],
        { cwd }
      );

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Abort signal — kill process immediately
      const onAbort = () => {
        child.kill('SIGTERM');
        reject(new Error('Cancelled by user'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
        reject(new Error(`OpenCode timed out after ${TIMEOUT_MS / 1000}s`));
      }, TIMEOUT_MS);

      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      child.on('close', () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (timedOut || signal?.aborted) return;

        if (stdout.trim()) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`OpenCode exited with no output. stderr: ${stderr.slice(0, 300)}`));
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(err);
      });

      child.stdin.write(prompt, 'utf8');
      child.stdin.end();
    });
  }

  private _buildPrompt(ticket: Ticket, ctx: ProjectContext): string {
    const criteria = (ticket.acceptanceCriteria ?? []).map((c, i) => `${i + 1}. ${c}`).join('\n');
    const files = (ticket.affectedFiles ?? []).join('\n');

    return `You are implementing a Flutter feature ticket. Follow the plan EXACTLY.

PROJECT: ${ctx.appName}
ARCHITECTURE: ${ctx.architecture}
CONVENTIONS: ${ctx.codingConventions}

TICKET: ${ticket.title}
DESCRIPTION: ${ticket.description}

IMPLEMENTATION PLAN:
${ticket.implementationPlan ?? 'See description above.'}

ARCHITECTURE NOTES:
${ticket.architectureNotes ?? 'Follow existing project patterns.'}

FILES TO CREATE/MODIFY:
${files || 'Determine from plan above.'}

ACCEPTANCE CRITERIA (must all be met):
${criteria}

CRITICAL RULES:
- Follow the existing architecture EXACTLY
- Do NOT change unrelated files
- Do NOT remove existing functionality

After completing ALL implementation, output this JSON report as the LAST thing:
MAESTRO_REPORT_START
{
  "completed": ["list each acceptance criterion you fulfilled"],
  "incomplete": ["list any criteria you could NOT complete"],
  "stoppedReason": null
}
MAESTRO_REPORT_END

Now implement the ticket.`;
  }

  private _parseCompletionReport(output: string, ticket: Ticket): CompletionReport {
    const reportMatch = output.match(/MAESTRO_REPORT_START\s*([\s\S]*?)\s*MAESTRO_REPORT_END/);
    if (reportMatch) {
      try { return JSON.parse(reportMatch[1].trim()) as CompletionReport; } catch { }
    }
    return {
      completed: [],
      incomplete: ticket.acceptanceCriteria ?? ['Implementation not confirmed'],
      stoppedReason: 'Agent did not submit a completion report.',
    };
  }
}