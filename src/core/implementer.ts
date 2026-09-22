import { Ticket, ProjectContext, CompletionReport } from '../types';
import { AgentService } from '../services/agent.service';
import { describeStack } from './stack-profile';

export class ImplementerAI {
  constructor(private readonly _agent: AgentService) {}

  async run(
    ticket: Ticket,
    projectContext: ProjectContext,
    workspacePath: string,
    signal?: AbortSignal,
    timeoutMs?: number
  ): Promise<CompletionReport> {
    const prompt = this._buildPrompt(ticket, projectContext);

    try {
      const output = await this._agent.runWithEdits(prompt, workspacePath, {
        effort: 'high',
        signal,
        timeoutMs,
      });
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

  private _buildPrompt(ticket: Ticket, ctx: ProjectContext): string {
    const criteria = (ticket.acceptanceCriteria ?? []).map((c, i) => `${i + 1}. ${c}`).join('\n');
    const files = (ticket.affectedFiles ?? []).join('\n');

    const stackLabel = describeStack(ctx);

    return `You are implementing a ${stackLabel} ticket. Follow the plan EXACTLY.

PROJECT: ${ctx.appName}
STACK: ${stackLabel}
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
- Write the changes to disk with your Edit/Write tools — do not print code back
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
      try {
        return JSON.parse(reportMatch[1].trim()) as CompletionReport;
      } catch {}
    }
    return {
      completed: [],
      incomplete: ticket.acceptanceCriteria ?? ['Implementation not confirmed'],
      stoppedReason: 'Agent did not submit a completion report.',
    };
  }
}
