import { useState } from 'react';
import { vscode } from '../vscode';
import type { MaestroSettings } from '../types';

interface Props {
  settings: MaestroSettings;
  onClose: () => void;
}

const POPULAR_MODELS = [
  'opencode/deepseek-v4-flash-free',
  'opencode/deepseek-v4-flash',
  'opencode/claude-sonnet-4-6',
  'opencode/claude-haiku-4-5',
  'opencode/minimax-m2.5',
];

export default function SettingsPanel({ settings, onClose }: Props) {
  const [form, setForm] = useState<MaestroSettings>({ ...settings });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    vscode.postMessage({ type: 'SAVE_SETTINGS', settings: form });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    vscode.postMessage({ type: 'RESET_SETTINGS' });
  };

  const timeoutMinutes = Math.round(form.claudeTimeoutMs / 60_000);

  return (
    <div className="settings">
      <div className="settings__header">
        <h2 className="settings__title">⚙ Settings</h2>
        <button className="settings__close" onClick={onClose}>✕</button>
      </div>

      <div className="settings__body">

        {/* Implementation Model */}
        <div className="settings__field">
          <label className="settings__label">Implementation Model</label>
          <p className="settings__hint">OpenCode model used for writing code.</p>
          <input
            className="settings__input"
            value={form.implementationModel}
            onChange={(e) => setForm(f => ({ ...f, implementationModel: e.target.value }))}
            placeholder="opencode/deepseek-v4-flash-free"
          />
          <div className="settings__quick">
            {POPULAR_MODELS.map(m => (
              <button
                key={m}
                className={`settings__chip ${form.implementationModel === m ? 'settings__chip--active' : ''}`}
                onClick={() => setForm(f => ({ ...f, implementationModel: m }))}
              >
                {m.split('/')[1]}
              </button>
            ))}
          </div>
        </div>

        {/* Claude Timeout */}
        <div className="settings__field">
          <label className="settings__label">
            Planning Timeout — <strong>{timeoutMinutes} min</strong>
          </label>
          <p className="settings__hint">How long to wait for Planner / Reviewer AI.</p>
          <input
            className="settings__range"
            type="range"
            min={1} max={10} step={1}
            value={timeoutMinutes}
            onChange={(e) =>
              setForm(f => ({ ...f, claudeTimeoutMs: Number(e.target.value) * 60_000 }))
            }
          />
          <div className="settings__range-labels">
            <span>1 min</span><span>10 min</span>
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
          {saved ? '✅ Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}