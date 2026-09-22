import { useState } from 'react';
import Icon from './Icon';
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

  const initial = (context.appName?.trim()?.[0] ?? 'M').toUpperCase();

  return (
    <div className="context-banner">
      <div className="context-banner__info">
        <span className="context-banner__avatar" aria-hidden="true">
          {initial}
        </span>
        <div className="context-banner__text">
          <strong>{context.appName}</strong>
          <div className="context-banner__stack">
            {context.techStack.slice(0, 3).map((s) => (
              <span key={s} className="stack-pill">
                {s}
              </span>
            ))}
          </div>
        </div>
        <span className="context-banner__dot" title="Context loaded" />
      </div>

      <div className="context-banner__menu-wrap">
        <button
          className="context-banner__btn"
          onClick={() => setMenuOpen((v) => !v)}
          title="Context options"
        >
          <Icon name="settings-gear" />
        </button>

        {menuOpen && (
          <div className="context-banner__dropdown">
            <button className="context-banner__dropdown-item" onClick={handleRefresh}>
              <Icon name="refresh" /> Refresh Context
            </button>
            <button
              className="context-banner__dropdown-item context-banner__dropdown-item--danger"
              onClick={handleReset}
            >
              <Icon name="trash" /> Reset Project
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
