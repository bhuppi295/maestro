// agent-providers.ts — Pluggable agent backends (see #17).
//
// Every provider is a pure descriptor: default binary/model/endpoint plus
// arg builders for the two call shapes (read-only prompt, edit-enabled
// run). All process spawning and HTTP stays in AgentService; everything
// here is unit-testable without side effects.

import type { AgentProviderId } from '../types';

export type AgentEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AgentOptions {
  effort?: AgentEffort;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export type ProviderTransport = 'cli' | 'http';

export interface AgentProviderDef {
  id: AgentProviderId;
  label: string;
  /** One-liner for the settings panel. */
  hint: string;
  transport: ProviderTransport;
  /** CLI binary default ('' = user must configure). */
  defaultBinary: string;
  defaultModel: string;
  /** Full chat-completions URL default for HTTP providers. */
  defaultBaseUrl: string;
  /** Env var carrying the key when the user stores one. */
  apiKeyEnvVar: string;
  versionArgs: string[];
  installUrl: string;
  installNote: string;
  /** HTTP providers can't apply file edits — planning/review only. */
  supportsEdits: boolean;
  /** True when the CLI reads the prompt from stdin (prompt also in argv otherwise). */
  readsStdin: boolean;
  buildRunArgs(model: string, effort: AgentEffort, prompt: string): string[];
  buildEditArgs(model: string, effort: AgentEffort, cwd: string, prompt: string): string[];
}

const CLAUDE: AgentProviderDef = {
  id: 'claude',
  label: 'Claude',
  hint: 'Anthropic via Claude Code CLI. Full pipeline.',
  transport: 'cli',
  defaultBinary: 'claude',
  defaultModel: 'sonnet',
  defaultBaseUrl: '',
  apiKeyEnvVar: 'ANTHROPIC_API_KEY',
  versionArgs: ['--version'],
  installUrl: 'https://claude.ai/code',
  installNote:
    'Required for all Maestro AI steps. Run `claude login`, or add an API key in Settings.',
  supportsEdits: true,
  readsStdin: true,
  buildRunArgs: (model, effort) => [
    '--print',
    ...modelFlag(model),
    '--effort',
    effort,
    '--no-session-persistence',
  ],
  buildEditArgs: (model, effort, cwd) => [
    '--print',
    ...modelFlag(model),
    '--effort',
    effort,
    '--no-session-persistence',
    '--allowedTools',
    'Edit',
    'Write',
    'Read',
    'Glob',
    'Grep',
    '--permission-mode',
    'acceptEdits',
    '--add-dir',
    cwd,
  ],
};

const CODEX_EFFORT: Record<AgentEffort, string> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'xhigh',
};

const CODEX: AgentProviderDef = {
  id: 'codex',
  label: 'Codex',
  hint: 'OpenAI via Codex CLI. Full pipeline.',
  transport: 'cli',
  defaultBinary: 'codex',
  defaultModel: 'gpt-5',
  defaultBaseUrl: '',
  apiKeyEnvVar: 'OPENAI_API_KEY',
  versionArgs: ['--version'],
  installUrl: 'https://developers.openai.com/codex/cli',
  installNote:
    'Required for all Maestro AI steps. Run `codex login`, or add an API key in Settings.',
  supportsEdits: true,
  readsStdin: false,
  buildRunArgs: (model, effort, prompt) => [
    'exec',
    ...modelFlag(model),
    '--sandbox',
    'read-only',
    '-c',
    `model_reasoning_effort="${CODEX_EFFORT[effort]}"`,
    prompt,
  ],
  buildEditArgs: (model, effort, cwd, prompt) => [
    'exec',
    ...modelFlag(model),
    '--full-auto',
    '--cd',
    cwd,
    '-c',
    `model_reasoning_effort="${CODEX_EFFORT[effort]}"`,
    prompt,
  ],
};

const GEMINI: AgentProviderDef = {
  id: 'gemini',
  label: 'Gemini',
  hint: 'Google via Gemini CLI. Full pipeline.',
  transport: 'cli',
  defaultBinary: 'gemini',
  defaultModel: 'gemini-2.5-pro',
  defaultBaseUrl: '',
  apiKeyEnvVar: 'GEMINI_API_KEY',
  versionArgs: ['--version'],
  installUrl: 'https://geminicli.com',
  installNote:
    'Required for all Maestro AI steps. Run `gemini` once to log in, or add an API key in Settings.',
  supportsEdits: true,
  readsStdin: false,
  buildRunArgs: (model, _effort, prompt) => [
    '--prompt',
    prompt,
    ...modelFlag(model),
    '--output-format',
    'text',
  ],
  buildEditArgs: (model, _effort, _cwd, prompt) => [
    '--prompt',
    prompt,
    ...modelFlag(model),
    '--output-format',
    'text',
    '--approval-mode',
    'auto_edit',
  ],
};

/** Omit `--model ''` — empty means "provider default". */
function modelFlag(model: string): string[] {
  return model ? ['--model', model] : [];
}

const DEEPSEEK: AgentProviderDef = {
  id: 'deepseek',
  label: 'DeepSeek',
  hint: 'DeepSeek API (OpenAI-compatible). Full pipeline via built-in file tools.',
  transport: 'http',
  defaultBinary: '',
  defaultModel: 'deepseek-chat',
  defaultBaseUrl: 'https://api.deepseek.com/chat/completions',
  apiKeyEnvVar: 'DEEPSEEK_API_KEY',
  versionArgs: [],
  installUrl: 'https://platform.deepseek.com',
  installNote: 'Needs a DeepSeek API key in Settings.',
  supportsEdits: true,
  readsStdin: true,
  buildRunArgs: () => [],
  buildEditArgs: () => [],
};

const GLM: AgentProviderDef = {
  id: 'glm',
  label: 'GLM',
  hint: 'Zhipu GLM API (OpenAI-compatible). Full pipeline via built-in file tools.',
  transport: 'http',
  defaultBinary: '',
  defaultModel: 'glm-4',
  defaultBaseUrl: 'https://openapi.z.ai/api/paas/v4/chat/completions',
  apiKeyEnvVar: 'ZAI_API_KEY',
  versionArgs: [],
  installUrl: 'https://open.bigmodel.cn',
  installNote: 'Needs a Zhipu API key in Settings.',
  supportsEdits: true,
  readsStdin: true,
  buildRunArgs: () => [],
  buildEditArgs: () => [],
};

const OPENCODE: AgentProviderDef = {
  id: 'opencode',
  label: 'OpenCode',
  hint: 'Any model via OpenCode router — Muse, GPT, Gemini, GLM, DeepSeek. Login or key.',
  transport: 'cli',
  defaultBinary: 'opencode',
  defaultModel: '',
  defaultBaseUrl: '',
  apiKeyEnvVar: '',
  versionArgs: ['--version'],
  installUrl: 'https://opencode.ai',
  installNote:
    'Required for all Maestro AI steps. Run `opencode auth login` (subscription friendly), or add an API key in Settings.',
  supportsEdits: true,
  readsStdin: false,
  buildRunArgs: (model, _effort, prompt) => ['run', ...modelFlag(model), prompt],
  buildEditArgs: (model, _effort, _cwd, prompt) => [
    'run',
    ...modelFlag(model),
    '--agent',
    'build',
    prompt,
  ],
};

const CUSTOM: AgentProviderDef = {
  id: 'custom',
  label: 'Custom CLI',
  hint: 'Any binary: prompt on stdin, reply on stdout. Flags are yours.',
  transport: 'cli',
  defaultBinary: '',
  defaultModel: '',
  defaultBaseUrl: '',
  apiKeyEnvVar: '',
  versionArgs: ['--version'],
  installUrl: '',
  installNote: 'Set the binary path in Settings. Prompt goes to stdin.',
  supportsEdits: true,
  readsStdin: true,
  buildRunArgs: () => [],
  buildEditArgs: () => [],
};

export const AGENT_PROVIDERS: Record<AgentProviderId, AgentProviderDef> = {
  claude: CLAUDE,
  codex: CODEX,
  gemini: GEMINI,
  opencode: OPENCODE,
  deepseek: DEEPSEEK,
  glm: GLM,
  custom: CUSTOM,
};

export const AGENT_PROVIDER_IDS = Object.keys(AGENT_PROVIDERS) as AgentProviderId[];

export function getProvider(id: AgentProviderId): AgentProviderDef {
  return AGENT_PROVIDERS[id] ?? CLAUDE;
}

export interface EffectiveAgentConfig {
  provider: AgentProviderDef;
  binary: string;
  model: string;
  baseUrl: string;
}

/**
 * Resolve user overrides over provider defaults. Pure — covered by tests.
 * Empty binary on a CLI provider is a configuration error surfaced by
 * AgentService before spawning.
 */
export function resolveEffectiveConfig(
  providerId: AgentProviderId,
  overrides: { binaryPath?: string; model?: string; baseUrl?: string }
): EffectiveAgentConfig {
  const provider = getProvider(providerId);
  return {
    provider,
    binary: overrides.binaryPath?.trim() || provider.defaultBinary,
    model: overrides.model?.trim() || provider.defaultModel,
    baseUrl: overrides.baseUrl?.trim() || provider.defaultBaseUrl,
  };
}

/** Reasoning budget per effort step for HTTP providers. */
export function effortMaxTokens(effort: AgentEffort): number {
  switch (effort) {
    case 'low':
      return 1024;
    case 'medium':
      return 4096;
    case 'high':
      return 8192;
    case 'xhigh':
      return 16384;
    case 'max':
      return 32768;
  }
}
