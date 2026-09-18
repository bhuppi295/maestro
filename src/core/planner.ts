import * as fs from 'fs';
import * as path from 'path';
import { Ticket, ProjectContext, SpecialistType } from '../types';
import { ClaudeCliService } from '../services/claude-cli.service';

export interface PlannerOutput {
  implementationPlan: string;
  affectedFiles: string[];
  acceptanceCriteria: string[];
  architectureNotes: string;
  specialistType: SpecialistType;
}

// Keywords to find relevant files by ticket topic
const TOPIC_KEYWORDS: Record<string, string[]> = {
  auth:        ['auth', 'login', 'signup', 'session', 'token'],
  purchase:    ['iap', 'purchase', 'payment', 'subscription', 'product'],
  deeplink:    ['deeplink', 'deep_link', 'link', 'universal', 'applink'],
  share:       ['share', 'sharing'],
  notification:['notification', 'push', 'fcm', 'firebase_messaging'],
  profile:     ['profile', 'user', 'account'],
  cart:        ['cart', 'basket', 'order'],
  search:      ['search', 'filter', 'query'],
  onboarding:  ['onboarding', 'intro', 'walkthrough'],
};

const MAX_FILE_READ = 10_000; // balanced quality + token usage
const MAX_FILES_TO_READ = 5;  // balanced quality + token usage

export class PlannerAI {
  constructor(private readonly _claudeCli: ClaudeCliService) {}

  async run(
    ticket: Ticket,
    projectContext: ProjectContext,
    workspacePath: string,
    options: { signal?: AbortSignal; timeoutMs?: number } = {}
  ): Promise<PlannerOutput> {
    // 1. Find and read relevant files
    const relevantFiles = await this._gatherRelevantFiles(
      ticket,
      projectContext,
      workspacePath
    );

    // 2. Build prompt and call Claude CLI
    const prompt = this._buildPrompt(ticket, projectContext, relevantFiles);
    const { signal, timeoutMs } = options;
    const output = await this._claudeCli.runForJson<PlannerOutput>(
      prompt,
      workspacePath,
      { effort: 'high', signal, timeoutMs }
    );

    return output;
  }

  // ── File Gathering ──────────────────────────────────────────

  private async _gatherRelevantFiles(
    ticket: Ticket,
    ctx: ProjectContext,
    workspacePath: string
  ): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    const libPath = path.join(workspacePath, 'lib');
    let count = 0;

    // 1. Always read CLAUDE.md — conventions are critical
    for (const name of ['CLAUDE.md', '.windsurfrules']) {
      const p = path.join(workspacePath, name);
      if (fs.existsSync(p)) {
        files[name] = this._readFileSafe(p);
        count++;
        break;
      }
    }

    if (!fs.existsSync(libPath)) return files;

    // 2. Detect which feature folder this ticket is about
    //    e.g. "Add loading state to HomeBloc" → lib/features/home/
    const featureFolder = this._detectFeatureFolder(
      ticket.title + ' ' + ticket.description,
      workspacePath
    );

    if (featureFolder) {
      // Read all files in the feature folder (presentation + domain layers)
      const featureFiles = this._readFeatureFolder(featureFolder, workspacePath);
      for (const [relPath, content] of Object.entries(featureFiles)) {
        if (count >= MAX_FILES_TO_READ) break;
        files[relPath] = content;
        count++;
      }
    }

    // 3. Fill remaining slots with keyword-matched files
    const topicText = `${ticket.title} ${ticket.description}`.toLowerCase();
    const keywords = this._extractKeywords(topicText);
    const found = this._findFilesByKeywords(libPath, keywords, workspacePath);

    for (const filePath of found) {
      if (count >= MAX_FILES_TO_READ) break;
      const relative = path.relative(workspacePath, filePath);
      if (!files[relative]) {
        files[relative] = this._readFileSafe(filePath);
        count++;
      }
    }

    return files;
  }

  /**
   * Detect the most relevant feature folder from the ticket text.
   * e.g. "HomeBloc loading state" → lib/features/home/
   */
  private _detectFeatureFolder(
    text: string,
    workspacePath: string
  ): string | null {
    const featuresPath = path.join(workspacePath, 'lib', 'features');
    if (!fs.existsSync(featuresPath)) return null;

    const featureDirs = fs.readdirSync(featuresPath, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);

    const lower = text.toLowerCase().replace(/_/g, ' ');

    // Score each feature folder by how many words from the text match
    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const dir of featureDirs) {
      const dirWords = dir.replace(/_/g, ' ').split(' ');
      const score = dirWords.filter(w => w.length > 2 && lower.includes(w)).length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = dir;
      }
    }

    if (bestMatch && bestScore > 0) {
      return path.join(featuresPath, bestMatch);
    }

    return null;
  }

  /**
   * Read the most useful files from a feature folder:
   * BLoC, state, events, screen, repository.
   */
  private _readFeatureFolder(
    featurePath: string,
    workspacePath: string
  ): Record<string, string> {
    const result: Record<string, string> = {};
    const PRIORITY_PATTERNS = [
      '_bloc.dart', '_state.dart', '_event.dart',
      '_cubit.dart', '_screen.dart', '_repository.dart',
      '_repository_impl.dart', '_page.dart',
    ];

    const files = this._findAllDartFiles(featurePath);

    // Prioritise by pattern order
    const sorted = files.sort((a, b) => {
      const aScore = PRIORITY_PATTERNS.findIndex(p => a.endsWith(p));
      const bScore = PRIORITY_PATTERNS.findIndex(p => b.endsWith(p));
      const aIdx = aScore === -1 ? 99 : aScore;
      const bIdx = bScore === -1 ? 99 : bScore;
      return aIdx - bIdx;
    });

    for (const file of sorted.slice(0, MAX_FILES_TO_READ)) {
      const relative = path.relative(workspacePath, file);
      result[relative] = this._readFileSafe(file);
    }

    return result;
  }

  private _findAllDartFiles(dirPath: string, depth = 0): string[] {
    if (depth > 4) return [];
    const results: string[] = [];
    try {
      for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isFile() && entry.name.endsWith('.dart') && !entry.name.endsWith('.g.dart') && !entry.name.endsWith('.freezed.dart')) {
          results.push(fullPath);
        } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
          results.push(...this._findAllDartFiles(fullPath, depth + 1));
        }
      }
    } catch { }
    return results;
  }

  private _extractKeywords(text: string): string[] {
    const keywords: string[] = [];

    // Add topic keywords that match the text
    for (const [, words] of Object.entries(TOPIC_KEYWORDS)) {
      for (const word of words) {
        if (text.includes(word)) {
          keywords.push(...words);
          break;
        }
      }
    }

    // Add words from ticket directly
    const words = text.split(/\s+/).filter((w) => w.length > 3);
    keywords.push(...words);

    return [...new Set(keywords)]; // deduplicate
  }

  private _findFilesByKeywords(
    dirPath: string,
    keywords: string[],
    workspacePath: string,
    depth = 0
  ): string[] {
    const found: string[] = [];
    if (depth > 6) return found;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (found.length >= MAX_FILES_TO_READ) break;
        if (entry.name.startsWith('.')) continue;
        if (entry.name === 'generated') continue;

        const fullPath = path.join(dirPath, entry.name);

        if (entry.isFile() && entry.name.endsWith('.dart')) {
          const nameLower = entry.name.toLowerCase();
          if (keywords.some((kw) => nameLower.includes(kw))) {
            found.push(fullPath);
          }
        } else if (entry.isDirectory()) {
          found.push(
            ...this._findFilesByKeywords(fullPath, keywords, workspacePath, depth + 1)
          );
        }
      }
    } catch {
      // Ignore unreadable directories
    }

    return found;
  }

  private _readFileSafe(filePath: string): string {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return content.length > MAX_FILE_READ
        ? content.slice(0, MAX_FILE_READ) + '\n... [truncated]'
        : content;
    } catch {
      return '[could not read]';
    }
  }

  // ── Prompt Building ─────────────────────────────────────────

  private _buildPrompt(
    ticket: Ticket,
    ctx: ProjectContext,
    relevantFiles: Record<string, string>
  ): string {
    const filesSection = Object.entries(relevantFiles)
      .map(([filePath, content]) => `### ${filePath}\n\`\`\`\n${content}\n\`\`\``)
      .join('\n\n');

    return `You are Maestro's Planner AI for a Flutter project.

PROJECT CONTEXT:
- App: ${ctx.appName}
- Tech stack: ${ctx.techStack.join(', ')}
- Architecture: ${ctx.architecture}
- Coding conventions: ${ctx.codingConventions}

TICKET TO PLAN:
Title: ${ticket.title}
Description: ${ticket.description}
Priority: ${ticket.priority}

RELEVANT CODEBASE FILES:
${filesSection || 'No relevant files found — use project context to infer.'}

YOUR JOB:
Create a detailed, accurate implementation plan for this Flutter ticket.
The plan must follow the existing project architecture and conventions exactly.

RULES:
- Reference real file paths from the codebase
- Follow existing patterns (BLoC, clean arch, GetIt, Freezed, etc.) as seen in the files
- specialistType: use "ui" for Flutter widget/screen work, "logic" for BLoC/repository/data layer, "both" if needed, "general" if unsure
- acceptanceCriteria: write 3-6 specific, testable criteria
- affectedFiles: list ALL files that need to be created or modified

Respond with ONLY this JSON, no explanation:
{
  "implementationPlan": "Step-by-step plan as a detailed string. Use numbered steps.",
  "affectedFiles": ["lib/features/...", "lib/core/..."],
  "acceptanceCriteria": [
    "Specific testable criterion 1",
    "Specific testable criterion 2"
  ],
  "architectureNotes": "Key architecture rules to follow for this ticket",
  "specialistType": "logic|ui|both|general"
}`;
  }
}