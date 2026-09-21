import * as vscode from 'vscode';

const SETTINGS_KEY = 'maestro.settings';
const API_KEY_SECRET = 'maestro.anthropicApiKey';

export interface MaestroSettings {
  agentModel: string;           // Claude model alias or full name
  agentBinaryPath: string;      // Claude CLI binary name or absolute path
  claudeTimeoutMs: number;      // Planner/Reviewer timeout in ms
  implementationTimeoutMs: number; // Implementer timeout — code writing runs longer
  maxRetries: number;           // Max implementation retries
  branchPrefix: string;         // Git branch prefix
}

export const DEFAULT_SETTINGS: MaestroSettings = {
  agentModel: 'sonnet',
  agentBinaryPath: 'claude',
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

  // ── API key (OS keychain, never globalState or the workspace) ──

  /** Empty string means no key — the CLI's own login is used instead. */
  async getApiKey(): Promise<string> {
    return (await this._context.secrets.get(API_KEY_SECRET)) ?? '';
  }

  async setApiKey(key: string): Promise<void> {
    if (key) {
      await this._context.secrets.store(API_KEY_SECRET, key);
    } else {
      await this._context.secrets.delete(API_KEY_SECRET);
    }
  }
}
