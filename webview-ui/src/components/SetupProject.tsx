import { useState } from 'react';
import Icon from './Icon';
import { vscode } from '../vscode';

export default function SetupProject() {
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');

  const handleScanWorkspace = () => {
    setLoading(true);
    setLoadingMsg('Starting scan...');
    vscode.postMessage({ type: 'SETUP_SCAN_WORKSPACE' });
  };

  const handleLoadFile = () => {
    setLoading(true);
    setLoadingMsg('Opening file picker...');
    vscode.postMessage({ type: 'SETUP_LOAD_FILE' });
  };

  if (loading) {
    return (
      <div className="setup">
        <div className="setup__loading">
          <Icon name="loading" spin className="setup__spinner" />
          <p className="setup__loading-msg">{loadingMsg}</p>
          <p className="setup__hint">Scanning your project files...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="setup">
      <Icon name="music" className="setup__icon" />
      <h2 className="setup__title">Welcome to Maestro</h2>
      <p className="setup__subtitle">
        First, let Maestro understand your project so the AI agent can work correctly.
      </p>

      <div className="setup__options">
        {/* Existing project */}
        <button className="setup__option" onClick={handleScanWorkspace}>
          <Icon name="folder-opened" className="setup__option-icon" />
          <div className="setup__option-text">
            <strong>Existing Project</strong>
            <span>Scan current workspace folder</span>
          </div>
        </button>

        {/* New project */}
        <button className="setup__option" onClick={handleLoadFile}>
          <Icon name="new-file" className="setup__option-icon" />
          <div className="setup__option-text">
            <strong>New Project</strong>
            <span>Load from PRD or MD file</span>
          </div>
        </button>
      </div>

      <p className="setup__note">
        Maestro detects your stack from manifests like <code>pubspec.yaml</code>,{' '}
        <code>package.json</code> or <code>pyproject.toml</code>, then reads{' '}
        <code>CLAUDE.md</code> and your source folder to understand the architecture.
      </p>
    </div>
  );
}
