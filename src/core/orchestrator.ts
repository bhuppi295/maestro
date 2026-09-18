import { Ticket, TicketStatus, ProjectContext } from '../types';
import { ClaudeCliService } from '../services/claude-cli.service';

interface OrchestratorOutput {
  tickets: RawTicket[];
  branchType: 'ft' | 'fix';
  circularDependencyWarning?: string;
}

interface RawTicket {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  dependsOn: string[];
}

export class OrchestratorAI {
  constructor(private readonly _claudeCli: ClaudeCliService) {}

  async run(
    rawTask: string,
    projectContext: ProjectContext,
    workspacePath: string
  ): Promise<Ticket[]> {
    const prompt = this._buildPrompt(rawTask, projectContext);
    const output = await this._claudeCli.runForJson<OrchestratorOutput>(
      prompt,
      workspacePath,
      { effort: 'high' }    // good ticket quality needs careful reasoning
    );

    return this._mapToTickets(output, rawTask);
  }

  private _buildPrompt(rawTask: string, ctx: ProjectContext): string {
    return `You are Maestro's Orchestrator AI for a Flutter project.

PROJECT CONTEXT:
- App: ${ctx.appName} — ${ctx.appPurpose}
- Tech stack: ${ctx.techStack.join(', ')}
- Architecture: ${ctx.architecture}
- Existing features: ${ctx.existingFeatures.join(', ') || 'none listed'}

DEVELOPER'S RAW TASK:
"${rawTask}"

YOUR JOB:
1. Decide if this is one task or multiple independent tasks
2. Break it into clear, actionable todos
3. Detect dependencies between todos (e.g. deeplink must be done before share)
4. Detect any circular dependencies and warn about them
5. Assign priority based on dependencies and importance

RULES:
- Keep titles short (max 6 words)
- Description should be 1-2 sentences, specific to this Flutter project
- dependsOn contains titles of OTHER tickets in this same list that must be done first
- If all tasks are independent, dependsOn is empty for all
- Maximum 6 tickets per request

Classify the task:
- Use "ft" if it's a new feature, enhancement, or addition
- Use "fix" if it's a bug fix, error correction, or patch

Respond with ONLY this JSON, no explanation:
{
  "branchType": "ft|fix",
  "tickets": [
    {
      "title": "Short ticket title",
      "description": "Specific 1-2 sentence description",
      "priority": "high|medium|low",
      "dependsOn": []
    }
  ],
  "circularDependencyWarning": null
}`;
  }

  private _mapToTickets(output: OrchestratorOutput, rawTask: string): Ticket[] {
    const branchType = output.branchType ?? 'ft';
    const now = new Date().toISOString();
    const groupId = generateId(); // same for all tickets in this batch

    // First pass — create tickets with temp IDs
    const tickets: Ticket[] = output.tickets.map((raw) => ({
      id: generateId(),
      title: raw.title,
      description: raw.description,
      status: 'todo' as TicketStatus,
      priority: raw.priority ?? 'medium',
      dependsOn: [],
      groupId,
      groupTitle: rawTask,
      groupBranchType: branchType,
      attempts: 0,
      reviewerFeedback: [],
      createdAt: now,
      updatedAt: now,
    }));

    // Second pass — resolve dependsOn titles → IDs
    for (let i = 0; i < tickets.length; i++) {
      const rawDeps = output.tickets[i].dependsOn ?? [];
      tickets[i].dependsOn = rawDeps
        .map((depTitle) => {
          const match = tickets.find(
            (t) => t.title.toLowerCase() === depTitle.toLowerCase()
          );
          return match?.id ?? null;
        })
        .filter((id): id is string => id !== null);
    }

    return tickets;
  }
}

function generateId(): string {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}