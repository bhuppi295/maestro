import { spawn } from 'child_process';
import {
  resolveEffectiveConfig,
  effortMaxTokens,
  type AgentEffort,
  type AgentOptions,
  type EffectiveAgentConfig,
} from './agent-providers';
import { MAX_TOOL_STEPS, EDIT_LOOP_SYSTEM, parseToolCalls, executeToolCall } from './http-tools';
import type { AgentProviderId } from '../types';

export type { AgentEffort, AgentOptions };

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [2000, 4000];
const DEFAULT_TIMEOUT_MS = 3 * 60_000;

export interface AgentConfig {
  provider: AgentProviderId;
  /** Overrides — empty means provider default. */
  binaryPath: string;
  model: string;
  baseUrl: string;
  /** Optional API key. Empty means the CLI's own auth is used. */
  apiKey?: string;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  provider: 'claude',
  binaryPath: '',
  model: '',
  baseUrl: '',
};

/**
 * Pluggable agent backend for every Maestro role (#17).
 *
 * Two call shapes: read-only prompting for planning/review, and an
 * edit-enabled run for implementation (CLI providers only).
 */
export class AgentService {
  constructor(private _config: AgentConfig = DEFAULT_AGENT_CONFIG) {}

  setConfig(config: AgentConfig): void {
    this._config = config;
  }

  getConfig(): AgentConfig {
    return this._config;
  }

  effective(): EffectiveAgentConfig {
    return resolveEffectiveConfig(this._config.provider, {
      binaryPath: this._config.binaryPath,
      model: this._config.model,
      baseUrl: this._config.baseUrl,
    });
  }

  /** Read-only prompt. No tools — context must be in the prompt. */
  async run(prompt: string, cwd?: string, options: AgentOptions = {}): Promise<string> {
    const cfg = this.effective();
    if (cfg.provider.transport === 'http') {
      return this._runHttpWithRetry(prompt, cfg, options);
    }
    return this._runCliWithRetry(prompt, cwd, options, cfg, false);
  }

  async runForJson<T>(prompt: string, cwd?: string, options: AgentOptions = {}): Promise<T> {
    const output = await this.run(prompt, cwd, options);
    return extractJson<T>(output);
  }

  /**
   * Prompt with file-editing tools enabled, for the implementation step.
   * CLI providers use their own runtime; HTTP providers run Maestro's
   * built-in file-tool loop against cwd.
   */
  async runWithEdits(prompt: string, cwd: string, options: AgentOptions = {}): Promise<string> {
    const cfg = this.effective();
    if (cfg.provider.transport === 'http') {
      return this._runHttpEditLoop(prompt, cwd, cfg, options);
    }
    return this._runCliWithRetry(prompt, cwd, options, cfg, true);
  }

  // ── CLI transport ────────────────────────────────────────────

  private async _runCliWithRetry(
    prompt: string,
    cwd: string | undefined,
    options: AgentOptions,
    cfg: EffectiveAgentConfig,
    withEdits: boolean
  ): Promise<string> {
    const { signal } = options;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (signal?.aborted) throw new Error('Cancelled by user');
      try {
        return await this._spawn(prompt, cwd, options, cfg, withEdits);
      } catch (err) {
        lastError = err as Error;
        if (lastError.message === 'Cancelled by user') throw err;
        if (isMissingBinary(err)) throw new Error(missingBinaryMessage(cfg));
        // Back off before retrying — transient provider blips (Zen 500s,
        // rate limits) often clear within seconds.
        const delay = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
        await new Promise((r) => setTimeout(r, delay));
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
    cfg: EffectiveAgentConfig,
    withEdits: boolean
  ): Promise<string> {
    const { effort = 'high', timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options;
    const { provider, binary, model } = cfg;
    const { apiKey } = this._config;

    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('Cancelled by user'));
      if (!binary) {
        return reject(
          new Error(
            `AgentService: provider "${provider.label}" needs a binary path. Set it in Maestro settings.`
          )
        );
      }

      const args = withEdits
        ? provider.buildEditArgs(model, effort, cwd ?? process.cwd(), prompt)
        : provider.buildRunArgs(model, effort, prompt);

      // Only override auth when a key is configured; otherwise inherit the
      // environment so a logged-in CLI keeps working for subscription users.
      const env =
        apiKey && provider.apiKeyEnvVar
          ? { ...process.env, [provider.apiKeyEnvVar]: apiKey }
          : process.env;

      const child = spawn(binary, args, { cwd: cwd ?? process.cwd(), env });

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

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('close', () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (timedOut || signal?.aborted) return;

        if (stdout.trim()) {
          resolve(stdout.trim());
        } else {
          reject(new Error(describeEmptyOutput(stderr, cfg)));
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(err);
      });

      if (provider.readsStdin) {
        child.stdin.write(prompt, 'utf8');
      }
      child.stdin.end();
    });
  }

  // ── HTTP transport (OpenAI-compatible chat completions) ──────
  private async _runHttpWithRetry(
    prompt: string,
    cfg: EffectiveAgentConfig,
    options: AgentOptions
  ): Promise<string> {
    const { signal } = options;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (signal?.aborted) throw new Error('Cancelled by user');
      try {
        return await this._postChat(prompt, cfg, options);
      } catch (err) {
        lastError = err as Error;
        if (lastError.message === 'Cancelled by user') throw err;
        const delay = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw new Error(
      `AgentService: all ${MAX_RETRIES} attempts failed. Last error: ${lastError?.message}`
    );
  }

  private async _postChat(
    prompt: string,
    cfg: EffectiveAgentConfig,
    options: AgentOptions
  ): Promise<string> {
    return this._postChatMessages([{ role: 'user', content: prompt }], cfg, options);
  }

  /**
   * Agentic file-editing loop for HTTP providers: the model issues
   * ```tool calls, Maestro executes them against cwd and feeds results
   * back until the model replies with prose (done).
   */
  private async _runHttpEditLoop(
    prompt: string,
    cwd: string,
    cfg: EffectiveAgentConfig,
    options: AgentOptions
  ): Promise<string> {
    const history: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: EDIT_LOOP_SYSTEM },
      { role: 'user', content: prompt },
    ];

    let lastText = '';
    for (let step = 1; step <= MAX_TOOL_STEPS; step++) {
      if (options.signal?.aborted) throw new Error('Cancelled by user');
      const reply = await this._postChatMessages(history, cfg, options);
      lastText = reply;
      const calls = parseToolCalls(reply);
      if (calls.length === 0) return reply;

      const results = calls.map((call) => {
        const r = executeToolCall(cwd, call);
        return `- ${call.tool} ${call.path ?? ''}: ${r.ok ? 'OK' : 'FAILED'}\n${r.output}`;
      });
      history.push({ role: 'assistant', content: reply });
      history.push({
        role: 'user',
        content: `Tool results (step ${step}/${MAX_TOOL_STEPS}):\n${results.join('\n')}\n\nContinue, or reply with prose only when finished.`,
      });
    }

    return `${lastText}\n\n[Stopped after ${MAX_TOOL_STEPS} tool steps — review the workspace.]`;
  }

  private async _postChatMessages(
    messages: Array<{ role: string; content: string }>,
    cfg: EffectiveAgentConfig,
    options: AgentOptions
  ): Promise<string> {
    const { effort = 'high', timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options;
    const { provider, model, baseUrl } = cfg;
    const { apiKey } = this._config;

    if (!baseUrl) {
      throw new Error(
        `AgentService: provider "${provider.label}" needs an endpoint URL. Set it in Maestro settings.`
      );
    }
    if (!apiKey) {
      throw new Error(
        `AgentService: provider "${provider.label}" needs an API key. Add one in Maestro settings.`
      );
    }

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: effortMaxTokens(effort),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        throw new Error(`AgentService: ${provider.label} API error ${res.status}. ${detail}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error(`AgentService: ${provider.label} returned no content.`);
      return content;
    } catch (err) {
      if (signal?.aborted || (err as Error).name === 'AbortError') {
        throw new Error(
          signal?.aborted ? 'Cancelled by user' : `AgentService: timed out after ${timeoutMs}ms`
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

function isMissingBinary(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === 'ENOENT';
}

function missingBinaryMessage(cfg: EffectiveAgentConfig): string {
  const { provider, binary } = cfg;
  if (provider.installUrl) {
    return (
      `Could not run "${binary || provider.defaultBinary || 'agent binary'}". ` +
      `Install ${provider.label} (${provider.installUrl}), or set its full ` +
      `path in Maestro settings (VS Code launched from the Dock may not see your shell PATH).`
    );
  }
  return (
    `Could not run "${binary}". Set the binary path for provider ` +
    `"${provider.label}" in Maestro settings.`
  );
}

/** Auth failures are the most common empty-output cause; name them directly. */
export function describeEmptyOutput(stderr: string, cfg: EffectiveAgentConfig): string {
  const clean = stripAnsi(stderr);
  const detail = clean.slice(0, 300);
  const label = cfg.provider.label;
  if (/api[- ]?key|unauthor|authentic|forbidden|401|403/i.test(clean)) {
    return (
      `${label} rejected the credentials. Add an API key in Maestro settings. ` +
      `Details: ${detail}`
    );
  }
  if (/rate.?limit|429|too many requests/i.test(clean)) {
    return (
      `${label} rate-limited the request. Wait a minute and retry, or pick a ` +
      `fallback model in Settings. Details: ${detail}`
    );
  }
  if (/server error|5\d\d|overloaded|try again|unexpected.*error/i.test(clean)) {
    return (
      `${label} hit a transient provider-side error (already retried). Retry the ` +
      `ticket, or switch to a fallback model in Settings. Details: ${detail}`
    );
  }
  return `${label} produced no output. stderr: ${detail}`;
}

export function stripAnsi(text: string): string {
  return text.replace(/\[[0-9;]*m/g, '');
}

export function extractJson<T>(output: string): T {
  try {
    return JSON.parse(output) as T;
  } catch {
    const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim()) as T;
      } catch {}
    }
    const bare = output.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (bare) {
      try {
        return JSON.parse(bare[1]) as T;
      } catch {}
    }
    throw new Error(`AgentService: could not extract JSON.\n\nOutput:\n${output.slice(0, 500)}`);
  }
}
