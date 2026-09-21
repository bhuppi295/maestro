import { spawn } from 'child_process';

const MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 3 * 60_000;

export type AgentEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AgentOptions {
  effort?: AgentEffort;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AgentConfig {
  /** Binary name or absolute path. Bare name resolves via PATH. */
  binaryPath: string;
  model: string;
  /**
   * Optional API key. Empty means the CLI's own auth is used, which covers
   * subscription users who ran `claude login`.
   */
  apiKey?: string;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  binaryPath: 'claude',
  model: 'sonnet',
};

/**
 * Single agent backend for every Maestro role.
 *
 * Two call shapes: read-only prompting for planning/review, and an
 * edit-enabled run for implementation.
 */
export class AgentService {
  constructor(private _config: AgentConfig = DEFAULT_AGENT_CONFIG) {}

  setConfig(config: AgentConfig): void {
    this._config = config;
  }

  getConfig(): AgentConfig {
    return this._config;
  }

  /** Read-only prompt. No tools — context must be in the prompt. */
  async run(prompt: string, cwd?: string, options: AgentOptions = {}): Promise<string> {
    return this._runWithRetry(prompt, cwd, options, []);
  }

  async runForJson<T>(prompt: string, cwd?: string, options: AgentOptions = {}): Promise<T> {
    const output = await this.run(prompt, cwd, options);
    return extractJson<T>(output);
  }

  /**
   * Prompt with file-editing tools enabled, for the implementation step.
   * Edits are auto-accepted; Bash is withheld because a permission prompt
   * would hang a non-interactive spawn.
   */
  async runWithEdits(prompt: string, cwd: string, options: AgentOptions = {}): Promise<string> {
    return this._runWithRetry(prompt, cwd, options, [
      '--allowedTools', 'Edit', 'Write', 'Read', 'Glob', 'Grep',
      '--permission-mode', 'acceptEdits',
      '--add-dir', cwd,
    ]);
  }

  private async _runWithRetry(
    prompt: string,
    cwd: string | undefined,
    options: AgentOptions,
    extraArgs: string[]
  ): Promise<string> {
    const { signal } = options;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (signal?.aborted) throw new Error('Cancelled by user');
      try {
        return await this._spawn(prompt, cwd, options, extraArgs);
      } catch (err) {
        lastError = err as Error;
        if (lastError.message === 'Cancelled by user') throw err;
        if (isMissingBinary(err)) throw new Error(missingBinaryMessage(this._config.binaryPath));
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    throw new Error(
      `AgentService: all ${MAX_RETRIES} attempts failed. Last error: ${lastError?.message}`
    );
  }

  private _spawn(
    prompt: string,
    cwd: string | undefined,
    options: AgentOptions,
    extraArgs: string[]
  ): Promise<string> {
    const { effort = 'high', timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options;
    const { binaryPath, model, apiKey } = this._config;

    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('Cancelled by user'));

      const args = [
        '--print',
        '--model', model,
        '--effort', effort,
        '--no-session-persistence',
        ...extraArgs,
      ];

      // Only override auth when a key is configured; otherwise inherit the
      // environment so a logged-in CLI keeps working for subscription users.
      const env = apiKey
        ? { ...process.env, ANTHROPIC_API_KEY: apiKey }
        : process.env;

      const child = spawn(binaryPath, args, { cwd: cwd ?? process.cwd(), env });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const onAbort = () => {
        child.kill('SIGTERM');
        reject(new Error('Cancelled by user'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
        reject(new Error(`AgentService: timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      child.on('close', () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (timedOut || signal?.aborted) return;

        if (stdout.trim()) {
          resolve(stdout.trim());
        } else {
          reject(new Error(describeEmptyOutput(stderr)));
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
}

function isMissingBinary(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === 'ENOENT';
}

function missingBinaryMessage(binaryPath: string): string {
  return (
    `Could not run "${binaryPath}". Install the Claude CLI, or set its full ` +
    `path in Maestro settings (VS Code launched from the Dock may not see your shell PATH).`
  );
}

/** Auth failures are the most common empty-output cause; name them directly. */
function describeEmptyOutput(stderr: string): string {
  const detail = stderr.slice(0, 300);
  if (/api[- ]?key|unauthor|authentic|forbidden|401|403/i.test(stderr)) {
    return (
      'Claude CLI rejected the credentials. Add an API key in Maestro settings, ' +
      `or run "claude login" if you have a subscription. Details: ${detail}`
    );
  }
  return `Claude CLI produced no output. stderr: ${detail}`;
}

export function extractJson<T>(output: string): T {
  try {
    return JSON.parse(output) as T;
  } catch {
    const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      try { return JSON.parse(fenced[1].trim()) as T; } catch { }
    }
    const bare = output.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (bare) {
      try { return JSON.parse(bare[1]) as T; } catch { }
    }
    throw new Error(`AgentService: could not extract JSON.\n\nOutput:\n${output.slice(0, 500)}`);
  }
}
