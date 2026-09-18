import { useState } from 'react';
import { vscode } from '../vscode';
import type { ProjectContext } from '../types';

interface Props {
  context: ProjectContext;
  onReset: () => void;
}

export default function ProjectContextBanner({ context, onReset }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleRefresh = () => {
    setMenuOpen(false);
    vscode.postMessage({ type: 'REFRESH_CONTEXT' });
  };

  const handleReset = () => {
    setMenuOpen(false);
    vscode.postMessage({ type: 'CLEAR_CONTEXT' });
    onReset();
  };

  return (
    <div className="context-banner">
      <div className="context-banner__info">
        <span className="context-banner__dot" />
        <div>
          <strong>{context.appName}</strong>
          <p>{context.techStack.slice(0, 3).join(' · ')}</p>
        </div>
      </div>

      <div className="context-banner__menu-wrap">
        <button
          className="context-banner__btn"
          onClick={() => setMenuOpen((v) => !v)}
          title="Context options"
        >
          ⚙
        </button>

        {menuOpen && (
          <div className="context-banner__dropdown">
            <button className="context-banner__dropdown-item" onClick={handleRefresh}>
              🔄 Refresh Context
            </button>
            <button
              className="context-banner__dropdown-item context-banner__dropdown-item--danger"
              onClick={handleReset}
            >
              🗑 Reset Project
            </button>
          </div>
        )}
      </div>
    </div>
  );
}