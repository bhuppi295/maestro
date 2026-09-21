import { useState } from 'react';
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
          <div className="setup__spinner">⟳</div>
          <p className="setup__loading-msg">{loadingMsg}</p>
          <p className="setup__hint">Scanning your project files...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="setup">
      <div className="setup__icon">🎼</div>
      <h2 className="setup__title">Welcome to Maestro</h2>
      <p className="setup__subtitle">
        First, let Maestro understand your project so the AI agent can work correctly.
      </p>

      <div className="setup__options">
        {/* Existing project */}
        <button className="setup__option" onClick={handleScanWorkspace}>
          <span className="setup__option-icon">📁</span>
          <div className="setup__option-text">
            <strong>Existing Project</strong>
            <span>Scan current workspace folder</span>
          </div>
        </button>

        {/* New project */}
        <button className="setup__option" onClick={handleLoadFile}>
          <span className="setup__option-icon">📄</span>
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
