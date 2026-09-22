import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface AnalyzeResult {
  passed: boolean;
  output: string;
  commands: string[];
}

/**
 * Analyzer binaries Maestro may launch.
 *
 * analyzeCommands are persisted to .maestro/context.json inside the opened
 * workspace, so they are attacker-controllable by any repo a user opens.
 * Commands run without a shell, and only these binaries are permitted.
 */
const ALLOWED_BINARIES = new Set([
  'flutter',
  'dart',
  'npx',
  'npm',
  'pnpm',
  'yarn',
  'node',
  'tsc',
  'eslint',
  'ruff',
  'pylint',
  'mypy',
  'python',
  'python3',
  'go',
  'cargo',
  'dotnet',
]);

/** Shell metacharacters — their presence means the string is not a plain command. */
const SHELL_METACHARACTERS = /[;&|`$(){}<>\n\r\\!*?~[\]'"]/;

export interface ParsedCommand {
  bin: string;
  args: string[];
}

/**
 * Splits a command into argv, rejecting anything that is not a bare
 * whitespace-separated invocation of an allow-listed binary.
 */
export function parseAnalyzeCommand(command: string): ParsedCommand | { error: string } {
  const trimmed = command.trim();
  if (!trimmed) return { error: 'empty command' };

  if (SHELL_METACHARACTERS.test(trimmed)) {
    return { error: 'contains shell metacharacters' };
  }

  const parts = trimmed.split(/\s+/);
  const bin = parts[0];

  // A path separator would let context.json point at an arbitrary executable.
  if (bin.includes('/') || bin.includes('\\')) {
    return { error: 'must be a bare binary name, not a path' };
  }
  if (!ALLOWED_BINARIES.has(bin)) {
    return { error: `"${bin}" is not an allowed analyzer` };
  }

  return { bin, args: parts.slice(1) };
}

export class AnalyzeService {
  /**
   * Runs all analyze commands from project context sequentially.
   * If no commands provided, skips analysis (returns passed).
   */
  async run(workspacePath: string, analyzeCommands: string[] = []): Promise<AnalyzeResult> {
    if (analyzeCommands.length === 0) {
      return { passed: true, output: 'No analyze commands configured — skipped.', commands: [] };
    }

    const outputs: string[] = [];
    let allPassed = true;

    for (const command of analyzeCommands) {
      const parsed = parseAnalyzeCommand(command);
      if ('error' in parsed) {
        outputs.push(`[${command}]\nSkipped — ${parsed.error}.`);
        allPassed = false;
        continue;
      }

      try {
        const { stdout, stderr } = await execFileAsync(parsed.bin, parsed.args, {
          cwd: workspacePath,
          timeout: 60_000,
          shell: false,
        });
        const output = (stdout + stderr).trim();
        outputs.push(`[${command}]\n${output}`);

        // Check for errors in output
        const hasErrors = this._hasErrors(command, output);
        if (hasErrors) allPassed = false;
      } catch (err: any) {
        // Non-zero exit = errors found
        const output = ((err.stdout ?? '') + (err.stderr ?? '')).trim();
        outputs.push(`[${command}]\n${output || err.message}`);
        allPassed = false;
      }
    }

    return {
      passed: allPassed,
      output: outputs.join('\n\n'),
      commands: analyzeCommands,
    };
  }

  /**
   * Per-tool error detection — each tool has different output format.
   */
  private _hasErrors(command: string, output: string): boolean {
    return hasAnalyzeErrors(command, output);
  }
}

/**
 * Per-tool error detection. Exported for unit tests.
 *
 * Flutter/Dart used to be:
 *   output.includes('error •') || output.includes('No issues found') === false && output.includes('error')
 * Because `&&` binds tighter than `||`, any output containing the substring
 * "error" (e.g. `lib/error_handler.dart`) failed when "No issues found" was
 * absent. Match analyzer diagnostic lines or a numeric error summary instead.
 */
export function hasAnalyzeErrors(command: string, output: string): boolean {
  if (command.includes('flutter analyze') || command.includes('dart analyze')) {
    return hasFlutterDartAnalyzerErrors(output);
  }
  if (command.includes('tsc')) {
    return output.includes('error TS');
  }
  if (command.includes('eslint')) {
    return output.includes(' error ') || /\d+ error/.test(output);
  }
  if (command.includes('ruff') || command.includes('pylint')) {
    return output.length > 0 && !output.includes('All checks passed');
  }
  // Generic: non-empty output = possible errors
  return output.toLowerCase().includes('error');
}

/**
 * dart/flutter analyze lines look like:
 *   `  error • Undefined name 'foo' • lib/main.dart:10:3 • undefined_identifier`
 * Older dart analyzer used `error -`. Summaries look like:
 *   `2 issues found. (1 error, 1 warning).`
 */
function hasFlutterDartAnalyzerErrors(output: string): boolean {
  const hasDiagnosticError = output.split(/\r?\n/).some((line) => /^\s*error\s*[•-]/.test(line));
  if (hasDiagnosticError) {
    return true;
  }

  const summary = /\((\d+)\s+errors?\b/i.exec(output);
  return Boolean(summary && Number(summary[1]) > 0);
}
