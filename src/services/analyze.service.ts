import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface AnalyzeResult {
  passed: boolean;
  output: string;
  commands: string[];
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
      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: workspacePath,
          timeout: 60_000,
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
  const hasDiagnosticError = output
    .split(/\r?\n/)
    .some((line) => /^\s*error\s*[•-]/.test(line));
  if (hasDiagnosticError) {
    return true;
  }

  const summary = /\((\d+)\s+errors?\b/i.exec(output);
  return Boolean(summary && Number(summary[1]) > 0);
}