import { useEffect, useState } from 'react';
import Icon from './Icon';
import { vscode } from '../vscode';
import type { MaestroSettings } from '../types';

interface Props {
  settings: MaestroSettings;
  /** Whether an API key is stored. The key itself never reaches the webview. */
  hasApiKey: boolean;
  onClose: () => void;
}

const POPULAR_MODELS = ['sonnet', 'opus', 'haiku'];

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
    vscode.postMessage({ type: 'SET_API_KEY', apiKey: apiKeyDraft.trim() });
    setApiKeyDraft('');
  };

  const handleClearKey = () => {
    vscode.postMessage({ type: 'SET_API_KEY', apiKey: '' });
    setApiKeyDraft('');
  };

  const planMinutes = Math.round(form.claudeTimeoutMs / 60_000);
  const implMinutes = Math.round(form.implementationTimeoutMs / 60_000);

  return (
    <div className="settings">
      <div className="settings__header">
        <h2 className="settings__title"><Icon name="settings-gear" /> Settings</h2>
        <button className="settings__close" onClick={onClose}><Icon name="close" /></button>
      </div>

      <div className="settings__body">

        {/* Authentication */}
        <div className="settings__field">
          <label className="settings__label">Authentication</label>
          <p className="settings__hint">
            {hasApiKey
              ? 'Using the API key stored in your OS keychain.'
              : 'Using your Claude CLI login. Add an API key only if you prefer key-based billing.'}
          </p>
          <input
            className="settings__input"
            type="password"
            value={apiKeyDraft}
            onChange={(e) => setApiKeyDraft(e.target.value)}
            placeholder={hasApiKey ? '••••••••  (stored)' : 'sk-ant-...  (optional)'}
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
                Remove key — use CLI login
              </button>
            )}
          </div>
        </div>

        {/* Model */}
        <div className="settings__field">
          <label className="settings__label">Model</label>
          <p className="settings__hint">Claude model used for every Maestro step.</p>
          <input
            className="settings__input"
            value={form.agentModel}
            onChange={(e) => setForm(f => ({ ...f, agentModel: e.target.value }))}
            placeholder="sonnet"
          />
          <div className="settings__quick">
            {POPULAR_MODELS.map(m => (
              <button
                key={m}
                className={`settings__chip ${form.agentModel === m ? 'settings__chip--active' : ''}`}
                onClick={() => setForm(f => ({ ...f, agentModel: m }))}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Binary path */}
        <div className="settings__field">
          <label className="settings__label">Claude CLI Path</label>
          <p className="settings__hint">
            Leave as <code>claude</code> unless it is not on PATH — common when VS Code
            is launched from the Dock.
          </p>
          <input
            className="settings__input"
            value={form.agentBinaryPath}
            onChange={(e) => setForm(f => ({ ...f, agentBinaryPath: e.target.value }))}
            placeholder="claude"
          />
        </div>

        {/* Planning timeout */}
        <div className="settings__field">
          <label className="settings__label">
            Planning Timeout — <strong>{planMinutes} min</strong>
          </label>
          <p className="settings__hint">How long to wait for Planner / Reviewer AI.</p>
          <input
            className="settings__range"
            type="range"
            min={1} max={10} step={1}
            value={planMinutes}
            onChange={(e) =>
              setForm(f => ({ ...f, claudeTimeoutMs: Number(e.target.value) * 60_000 }))
            }
          />
          <div className="settings__range-labels">
            <span>1 min</span><span>10 min</span>
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
            min={2} max={30} step={1}
            value={implMinutes}
            onChange={(e) =>
              setForm(f => ({ ...f, implementationTimeoutMs: Number(e.target.value) * 60_000 }))
            }
          />
          <div className="settings__range-labels">
            <span>2 min</span><span>30 min</span>
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
            min={1} max={5} step={1}
            value={form.maxRetries}
            onChange={(e) => setForm(f => ({ ...f, maxRetries: Number(e.target.value) }))}
          />
          <div className="settings__range-labels">
            <span>1</span><span>5</span>
          </div>
        </div>

        {/* Branch Prefix */}
        <div className="settings__field">
          <label className="settings__label">Branch Prefix</label>
          <p className="settings__hint">Git branch prefix for ticket branches.</p>
          <input
            className="settings__input"
            value={form.branchPrefix}
            onChange={(e) => setForm(f => ({ ...f, branchPrefix: e.target.value }))}
            placeholder="maestro/"
          />
        </div>

      </div>

      <div className="settings__footer">
        <button className="btn btn--secondary settings__reset" onClick={handleReset}>
          Reset to defaults
        </button>
        <button className="btn btn--primary" onClick={handleSave}>
          {saved ? (<><Icon name="check" /> Saved!</>) : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
