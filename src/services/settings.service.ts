import * as vscode from 'vscode';
import type { AgentProviderId, MaestroSettings } from '../types';

export type { MaestroSettings };

const SETTINGS_KEY = 'maestro.settings';
const API_KEY_SECRET = 'maestro.anthropicApiKey';

/** Per-provider secret id. The legacy id stays as Claude's fallback. */
function keyId(provider: AgentProviderId): string {
  return `maestro.apiKey.${provider}`;
}

export const DEFAULT_SETTINGS: MaestroSettings = {
  agentProvider: 'claude',
  agentModel: 'sonnet',
  agentBinaryPath: 'claude',
  providerBaseUrl: '',
  claudeTimeoutMs: 3 * 60_000,
  implementationTimeoutMs: 10 * 60_000,
  maxRetries: 3,
  branchPrefix: 'maestro/',
};

export class SettingsService {
  constructor(private readonly _context: vscode.ExtensionContext) {}

  get(): MaestroSettings {
    const stored = this._context.globalState.get<Partial<MaestroSettings>>(SETTINGS_KEY);
    // Merge over defaults so settings saved by older versions stay usable.
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  save(settings: MaestroSettings): void {
    this._context.globalState.update(SETTINGS_KEY, settings);
  }

  update(patch: Partial<MaestroSettings>): void {
    this.save({ ...this.get(), ...patch });
  }

  reset(): void {
    this._context.globalState.update(SETTINGS_KEY, DEFAULT_SETTINGS);
  }

  // ── API keys (OS keychain, never globalState or the workspace) ──

  /** Empty string means no key — the CLI's own login is used instead. */
  async getApiKey(provider: AgentProviderId = 'claude'): Promise<string> {
    const key = await this._context.secrets.get(keyId(provider));
    if (key) return key;
    // Migrate the pre-provider single key for Claude users.
    if (provider === 'claude') {
      return (await this._context.secrets.get(API_KEY_SECRET)) ?? '';
    }
    return '';
  }

  async setApiKey(key: string, provider: AgentProviderId = 'claude'): Promise<void> {
    if (key) {
      await this._context.secrets.store(keyId(provider), key);
    } else {
      await this._context.secrets.delete(keyId(provider));
    }
  }
}
