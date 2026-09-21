import { Ticket, ProjectContext, CompletionReport } from '../types';
import { AgentService } from '../services/agent.service';
import { AnalyzeResult } from '../services/analyze.service';
import { resolveStackProfile, describeStack } from './stack-profile';

export interface CriteriaResult {
  criteria: string;
  passed: boolean;
  reason: string;
}

export interface ReviewerOutput {
  approved: boolean;
  criteriaResults: CriteriaResult[];
  feedback: string;
  missingItems: string[];
}

const MAX_DIFF_SIZE = 8000; // chars — cap diff to avoid huge prompts
const MAX_ANALYZE_OUTPUT = 1500;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '\n... [truncated]' : text;
}

export class ReviewerAI {
  constructor(private readonly _agent: AgentService) {}

  async run(
    ticket: Ticket,
    projectContext: ProjectContext,
    completionReport: CompletionReport,
    analyzeResult: AnalyzeResult,
    codeDiff: string,
    workspacePath: string
  ): Promise<ReviewerOutput> {

    // Layer 1 — No completion report = auto reject
    if (
      !completionReport ||
      (completionReport.completed.length === 0 &&
        completionReport.incomplete.length > 0)
    ) {
      return {
        approved: false,
        criteriaResults: (ticket.acceptanceCriteria ?? []).map((c) => ({
          criteria: c,
          passed: false,
          reason: 'Agent did not submit a completion report.',
        })),
        feedback: completionReport?.stoppedReason ?? 'Agent stopped mid-way without completing.',
        missingItems: ticket.acceptanceCriteria ?? [],
      };
    }

    // Layer 2 — Analyze errors = auto reject
    if (!analyzeResult.passed) {
      const commandLabel = analyzeResult.commands.join(', ') || 'static analysis';
      return {
        approved: false,
        criteriaResults: (ticket.acceptanceCriteria ?? []).map((c) => ({
          criteria: c,
          passed: false,
          reason: `${commandLabel} failed — code has errors.`,
        })),
        feedback: `${commandLabel} reported errors:\n${truncate(analyzeResult.output, MAX_ANALYZE_OUTPUT)}`,
        missingItems: ticket.acceptanceCriteria ?? [],
      };
    }

    // Layer 3 — Claude CLI checks criteria vs code diff
    const prompt = this._buildPrompt(
      ticket,
      projectContext,
      completionReport,
      analyzeResult,
      codeDiff
    );

    const output = await this._agent.runForJson<ReviewerOutput>(
      prompt,
      workspacePath,
      { effort: 'xhigh' } // reviewer needs deep analysis to catch subtle issues
    );

    return output;
  }

  private _buildPrompt(
    ticket: Ticket,
    ctx: ProjectContext,
    report: CompletionReport,
    analyze: AnalyzeResult,
    diff: string
  ): string {
    const criteria = (ticket.acceptanceCriteria ?? [])
      .map((c, i) => `${i + 1}. ${c}`)
      .join('\n');

    const cappedDiff = diff.length > MAX_DIFF_SIZE
      ? diff.slice(0, MAX_DIFF_SIZE) + '\n... [diff truncated]'
      : diff;

    const completedList = report.completed.join('\n') || 'None reported';
    const incompleteList = report.incomplete.join('\n') || 'None';

    const profile = resolveStackProfile(ctx);
    const stackLabel = describeStack(ctx);

    return `You are Maestro's Reviewer AI — a senior ${profile.label} developer doing a code review.

PROJECT: ${ctx.appName}
STACK: ${stackLabel}
ARCHITECTURE: ${ctx.architecture}

TICKET: ${ticket.title}
DESCRIPTION: ${ticket.description}

ACCEPTANCE CRITERIA TO VERIFY:
${criteria}

IMPLEMENTER'S COMPLETION REPORT:
Completed:
${completedList}

Incomplete:
${incompleteList}

STATIC ANALYSIS (${analyze.commands.join(', ') || 'none configured'}):
${analyze.passed ? '✅ No errors found' : '⚠️ Analysis reported problems'}
${truncate(analyze.output, MAX_ANALYZE_OUTPUT)}

CODE DIFF (what was changed):
\`\`\`diff
${cappedDiff}
\`\`\`

YOUR JOB:
1. Check each acceptance criteria against the actual code diff
2. Verify the implementation follows the project architecture
3. Check for obvious missing edge cases
4. Decide: approve or reject

APPROVAL RULES:
- Approve if ALL core criteria are met (minor warnings ok)
- Reject if ANY core criteria are missing from the diff
- Reject if implementation breaks existing patterns

Respond with ONLY this JSON:
{
  "approved": true or false,
  "criteriaResults": [
    {
      "criteria": "exact criteria text",
      "passed": true or false,
      "reason": "1 sentence explanation"
    }
  ],
  "feedback": "Overall feedback for the implementer if rejected. Empty string if approved.",
  "missingItems": ["list of criteria that were NOT met. Empty array if approved."]
}`;
  }
}