import { spawn } from 'child_process';

const MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 3 * 60_000;

export type ClaudeEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ClaudeCliOptions {
  effort?: ClaudeEffort;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class ClaudeCliService {
  async run(
    prompt: string,
    cwd?: string,
    options: ClaudeCliOptions = {}
  ): Promise<string> {
    const { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (signal?.aborted) throw new Error('Cancelled by user');
      try {
        const output = await this._spawnClaude(prompt, cwd, options);
        return output;
      } catch (err) {
        lastError = err as Error;
        if ((err as Error).message === 'Cancelled by user') throw err;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    throw new Error(
      `ClaudeCliService: all ${MAX_RETRIES} attempts failed. Last error: ${lastError?.message}`
    );
  }

  async runForJson<T>(
    prompt: string,
    cwd?: string,
    options: ClaudeCliOptions = {}
  ): Promise<T> {
    const output = await this.run(prompt, cwd, options);
    return this._extractJson<T>(output);
  }

  private _spawnClaude(
    prompt: string,
    cwd?: string,
    options: ClaudeCliOptions = {}
  ): Promise<string> {
    const { effort = 'high', timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options;

    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('Cancelled by user'));

      const args = [
        '--print',
        '--model', 'sonnet',           // Claude Sonnet — fast + smart
        '--effort', effort,            // per-agent effort level
        '--no-session-persistence',    // don't pollute session history
        '--tools', '',                 // no file tools — we pass context in prompt
      ];

      const child = spawn('claude', args, {
        cwd: cwd ?? process.cwd(),
      });

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
        reject(new Error(`ClaudeCliService: timed out after ${timeoutMs}ms`));
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
          reject(new Error(`claude produced no output. stderr: ${stderr.slice(0, 300)}`));
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

  private _extractJson<T>(output: string): T {
    try {
      return JSON.parse(output) as T;
    } catch {
      const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try { return JSON.parse(jsonMatch[1].trim()) as T; } catch { }
      }
      const objectMatch = output.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (objectMatch) {
        try { return JSON.parse(objectMatch[1]) as T; } catch { }
      }
      throw new Error(
        `ClaudeCliService: Could not extract JSON.\n\nOutput:\n${output.slice(0, 500)}`
      );
    }
  }
}