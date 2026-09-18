import * as vscode from 'vscode';

const SETTINGS_KEY = 'maestro.settings';

export interface MaestroSettings {
  implementationModel: string;  // OpenCode model for implementation
  claudeTimeoutMs: number;      // Planner/Reviewer timeout in ms
  maxRetries: number;           // Max implementation retries
  branchPrefix: string;         // Git branch prefix
}

export const DEFAULT_SETTINGS: MaestroSettings = {
  implementationModel: 'opencode/deepseek-v4-flash-free',
  claudeTimeoutMs: 3 * 60_000,
  maxRetries: 3,
  branchPrefix: 'maestro/',
};

export class SettingsService {
  constructor(private readonly _context: vscode.ExtensionContext) {}

  get(): MaestroSettings {
    return this._context.globalState.get<MaestroSettings>(
      SETTINGS_KEY,
      DEFAULT_SETTINGS
    );
  }

  save(settings: MaestroSettings): void {
    this._context.globalState.update(SETTINGS_KEY, settings);
  }

  update(patch: Partial<MaestroSettings>): void {
    const current = this.get();
    this.save({ ...current, ...patch });
  }

  reset(): void {
    this._context.globalState.update(SETTINGS_KEY, DEFAULT_SETTINGS);
  }
}