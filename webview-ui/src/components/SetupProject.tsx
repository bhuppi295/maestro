import { useState } from 'react';
import Icon from './Icon';
import Logo from './Logo';
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
      <Logo size={44} />
      <p className="setup__kicker">Maestro pipeline</p>
      <h2 className="setup__title">Teach Maestro your project</h2>
      <p className="setup__subtitle">
        One scan. Then every agent plans, builds and reviews inside your architecture.
      </p>

      <ol className="setup__steps">
        <li>
          <Icon name="search" /> Scan
        </li>
        <li>
          <Icon name="lightbulb" /> Plan
        </li>
        <li>
          <Icon name="zap" /> Build
        </li>
      </ol>

      <div className="setup__options">
        {/* Existing project */}
        <button className="setup__option" onClick={handleScanWorkspace}>
          <span className="setup__option-tile">
            <Icon name="folder-opened" className="setup__option-icon" />
          </span>
          <div className="setup__option-text">
            <strong>Existing Project</strong>
            <span>Scan current workspace folder</span>
          </div>
          <Icon name="arrow-right" className="setup__option-arrow" />
        </button>

        {/* New project */}
        <button className="setup__option" onClick={handleLoadFile}>
          <span className="setup__option-tile">
            <Icon name="new-file" className="setup__option-icon" />
          </span>
          <div className="setup__option-text">
            <strong>New Project</strong>
            <span>Load from PRD or MD file</span>
          </div>
          <Icon name="arrow-right" className="setup__option-arrow" />
        </button>
      </div>

      <p className="setup__note">
        Maestro detects your stack from manifests like <code>pubspec.yaml</code>,{' '}
        <code>package.json</code> or <code>pyproject.toml</code>, then reads <code>CLAUDE.md</code>{' '}
        and your source folder to understand the architecture.
      </p>
    </div>
  );
}
