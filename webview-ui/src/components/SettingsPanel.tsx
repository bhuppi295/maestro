import { useEffect, useState } from 'react';
import Icon from './Icon';
import { vscode } from '../vscode';
import type { AgentProviderId, MaestroSettings } from '../types';
import { AGENT_PROVIDERS, AGENT_PROVIDER_IDS } from '../../../src/services/agent-providers';

interface Props {
  settings: MaestroSettings;
  /** Whether an API key is stored for the selected provider. The key itself never reaches the webview. */
  hasApiKey: boolean;
  onClose: () => void;
}

const PROVIDER_KEY_HINT: Record<AgentProviderId, string> = {
  claude: 'sk-ant-... (optional)',
  codex: 'sk-... (optional, login works too)',
  gemini: 'AIza... (optional, login works too)',
  opencode: 'zen key (optional, auth login works too)',
  deepseek: 'sk-... (required)',
  glm: 'your Zhipu key (required)',
  custom: 'key (if your binary needs one)',
};
const PROVIDER_MODELS: Record<AgentProviderId, string[]> = {
  claude: ['sonnet', 'opus', 'haiku'],
  codex: ['gpt-5', 'gpt-5-mini', 'o3'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  opencode: [
    'opencode/muse-spark-1-3-contributor-free',
    'anthropic/claude-sonnet-4-5',
    'openai/gpt-5',
    'google/gemini-2.5-pro',
    'zai/glm-4.6',
    'deepseek/deepseek-chat',
  ],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  glm: ['glm-4', 'glm-4-flash'],
  custom: [],
};

export default function SettingsPanel({ settings, hasApiKey, onClose }: Props) {
  const [form, setForm] = useState<MaestroSettings>({ ...settings });
  const [saved, setSaved] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState('');

  useEffect(() => setForm({ ...settings }), [settings]);

  const handleSave = () => {
    vscode.postMessage({ type: 'SAVE_SETTINGS', settings: form });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => vscode.postMessage({ type: 'RESET_SETTINGS' });

  const handleSaveKey = () => {
    vscode.postMessage({
      type: 'SET_API_KEY',
      apiKey: apiKeyDraft.trim(),
      provider: form.agentProvider,
    });
    setApiKeyDraft('');
  };

  const handleClearKey = () => {
    vscode.postMessage({ type: 'SET_API_KEY', apiKey: '', provider: form.agentProvider });
    setApiKeyDraft('');
  };

  // Key status is per-provider — refresh when the selection changes.
  useEffect(() => {
    vscode.postMessage({ type: 'GET_API_KEY_STATUS', provider: form.agentProvider });
  }, [form.agentProvider]);

  const activeProvider = AGENT_PROVIDERS[form.agentProvider] ?? AGENT_PROVIDERS.claude;
  const popularModels = PROVIDER_MODELS[form.agentProvider] ?? [];

  const planMinutes = Math.round(form.claudeTimeoutMs / 60_000);
  const implMinutes = Math.round(form.implementationTimeoutMs / 60_000);

  return (
    <div className="settings">
      <div className="settings__header">
        <h2 className="settings__title">
          <Icon name="settings-gear" /> Settings
        </h2>
        <button className="settings__close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="settings__body">
        {/* Provider */}
        <div className="settings__field">
          <label className="settings__label">Provider</label>
          <p className="settings__hint">{activeProvider.hint}</p>
          <div className="settings__quick settings__quick--lg">
            {AGENT_PROVIDER_IDS.map((id) => (
              <button
                key={id}
                className={`settings__chip ${form.agentProvider === id ? 'settings__chip--active' : ''}`}
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    agentProvider: id,
                    // Stale per-provider values reset so hints/placeholders
                    // always describe the selected provider.
                    agentModel: '',
                    agentBinaryPath: '',
                    providerBaseUrl: '',
                  }))
                }
              >
                {AGENT_PROVIDERS[id].label}
              </button>
            ))}
          </div>
          {!activeProvider.supportsEdits && (
            <p className="settings__warn">
              Planning and review only — implementation needs a CLI provider or manual handling.
            </p>
          )}
        </div>

        {/* Authentication */}
        <div className="settings__field">
          <label className="settings__label">Authentication</label>
          <p className="settings__hint">
            {activeProvider.transport === 'http'
              ? `${activeProvider.label} needs an API key, stored in your OS keychain.`
              : hasApiKey
                ? `Using the API key stored in your OS keychain for ${activeProvider.label}.`
                : `Using your ${activeProvider.label} CLI login (subscription friendly). Add an API key only if you prefer key-based billing.`}
          </p>
          <input
            className="settings__input"
            type="password"
            value={apiKeyDraft}
            onChange={(e) => setApiKeyDraft(e.target.value)}
            placeholder={hasApiKey ? '••••••••  (stored)' : PROVIDER_KEY_HINT[form.agentProvider]}
            autoComplete="off"
          />
          <div className="settings__quick">
            <button
              className="settings__chip"
              onClick={handleSaveKey}
              disabled={!apiKeyDraft.trim()}
            >
              Save key
            </button>
            {hasApiKey && (
              <button className="settings__chip" onClick={handleClearKey}>
                {activeProvider.transport === 'http' ? 'Remove key' : 'Remove key — use CLI login'}
              </button>
            )}
          </div>
        </div>

        {/* Model */}
        <div className="settings__field">
          <label className="settings__label">Model</label>
          <p className="settings__hint">
            {activeProvider.label} model for every Maestro step. Empty uses the provider default
            {activeProvider.defaultModel ? ` (${activeProvider.defaultModel})` : ''}.
          </p>
          <input
            className="settings__input"
            value={form.agentModel}
            onChange={(e) => setForm((f) => ({ ...f, agentModel: e.target.value }))}
            placeholder={activeProvider.defaultModel || 'model id'}
          />
          {popularModels.length > 0 && (
            <div className="settings__quick settings__quick--lg">
              {popularModels.map((m) => (
                <button
                  key={m}
                  className={`settings__chip ${form.agentModel === m ? 'settings__chip--active' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, agentModel: m }))}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Binary path (CLI providers only) */}
        {activeProvider.transport === 'cli' && (
          <div className="settings__field">
            <label className="settings__label">{activeProvider.label} CLI Path</label>
            <p className="settings__hint">
              Leave empty for <code>{activeProvider.defaultBinary || 'PATH lookup'}</code> unless it
              is not on PATH — common when VS Code is launched from the Dock.
            </p>
            <input
              className="settings__input"
              value={form.agentBinaryPath}
              onChange={(e) => setForm((f) => ({ ...f, agentBinaryPath: e.target.value }))}
              placeholder={activeProvider.defaultBinary || 'binary name or absolute path'}
            />
          </div>
        )}

        {/* Endpoint (HTTP providers only) */}
        {activeProvider.transport === 'http' && (
          <div className="settings__field">
            <label className="settings__label">API Endpoint</label>
            <p className="settings__hint">
              OpenAI-compatible chat-completions URL. Empty uses the provider default.
            </p>
            <input
              className="settings__input"
              value={form.providerBaseUrl}
              onChange={(e) => setForm((f) => ({ ...f, providerBaseUrl: e.target.value }))}
              placeholder={activeProvider.defaultBaseUrl}
            />
          </div>
        )}

        {/* Planning timeout */}
        <div className="settings__field">
          <label className="settings__label">
            Planning Timeout — <strong>{planMinutes} min</strong>
          </label>
          <p className="settings__hint">How long to wait for Planner / Reviewer AI.</p>
          <input
            className="settings__range"
            type="range"
            min={1}
            max={10}
            step={1}
            value={planMinutes}
            onChange={(e) =>
              setForm((f) => ({ ...f, claudeTimeoutMs: Number(e.target.value) * 60_000 }))
            }
          />
          <div className="settings__range-labels">
            <span>1 min</span>
            <span>10 min</span>
          </div>
        </div>

        {/* Implementation timeout */}
        <div className="settings__field">
          <label className="settings__label">
            Implementation Timeout — <strong>{implMinutes} min</strong>
          </label>
          <p className="settings__hint">Writing code usually needs longer than planning.</p>
          <input
            className="settings__range"
            type="range"
            min={2}
            max={30}
            step={1}
            value={implMinutes}
            onChange={(e) =>
              setForm((f) => ({ ...f, implementationTimeoutMs: Number(e.target.value) * 60_000 }))
            }
          />
          <div className="settings__range-labels">
            <span>2 min</span>
            <span>30 min</span>
          </div>
        </div>

        {/* Max Retries */}
        <div className="settings__field">
          <label className="settings__label">
            Max Retries — <strong>{form.maxRetries}</strong>
          </label>
          <p className="settings__hint">Implementation retry attempts before escalating.</p>
          <input
            className="settings__range"
            type="range"
            min={1}
            max={5}
            step={1}
            value={form.maxRetries}
            onChange={(e) => setForm((f) => ({ ...f, maxRetries: Number(e.target.value) }))}
          />
          <div className="settings__range-labels">
            <span>1</span>
            <span>5</span>
          </div>
        </div>

        {/* Branch Prefix */}
        <div className="settings__field">
          <label className="settings__label">Branch Prefix</label>
          <p className="settings__hint">Git branch prefix for ticket branches.</p>
          <input
            className="settings__input"
            value={form.branchPrefix}
            onChange={(e) => setForm((f) => ({ ...f, branchPrefix: e.target.value }))}
            placeholder="maestro/"
          />
        </div>
      </div>

      <div className="settings__footer">
        <button className="btn btn--secondary settings__reset" onClick={handleReset}>
          Reset to defaults
        </button>
        <button className="btn btn--primary" onClick={handleSave}>
          {saved ? (
            <>
              <Icon name="check" /> Saved!
            </>
          ) : (
            'Save Settings'
          )}
        </button>
      </div>
    </div>
  );
}
