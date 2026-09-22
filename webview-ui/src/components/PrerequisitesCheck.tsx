import { vscode } from '../vscode';
import Icon from './Icon';
import type { PrerequisitesStatus } from '../types';

interface Props {
  status: PrerequisitesStatus;
  onRecheck: () => void;
}

export default function PrerequisitesCheck({ status, onRecheck }: Props) {
  const handleRecheck = () => {
    vscode.postMessage({ type: 'CHECK_PREREQUISITES' });
    onRecheck();
  };

  return (
    <div className="prereq">
      <div className="prereq__header">
        <Icon name={status.allGood ? 'pass-filled' : 'warning'} className="prereq__icon" />
        <div>
          <h2 className="prereq__title">{status.allGood ? 'All set!' : 'Setup Required'}</h2>
          <p className="prereq__subtitle">
            {status.allGood
              ? 'All prerequisites found. You can set up your project.'
              : 'Some required tools are missing.'}
          </p>
        </div>
      </div>

      <div className="prereq__list">
        {status.items.map((item) => (
          <div
            key={item.id}
            className={`prereq__item ${item.installed ? 'prereq__item--ok' : 'prereq__item--missing'}`}
          >
            <div className="prereq__item-left">
              <Icon name={item.installed ? 'pass-filled' : 'error'} className="prereq__item-icon" />
              <div>
                <strong className="prereq__item-name">{item.name}</strong>
                {item.installed && item.version && (
                  <p className="prereq__item-version">{item.version}</p>
                )}
                {!item.installed && <p className="prereq__item-note">{item.installNote}</p>}
              </div>
            </div>
            {!item.installed && (
              <a
                className="prereq__install-btn"
                href={item.installUrl}
                onClick={(e) => {
                  e.preventDefault();
                  vscode.postMessage({ type: 'OPEN_URL', url: item.installUrl });
                }}
              >
                Install ↗
              </a>
            )}
          </div>
        ))}
      </div>

      <div className="prereq__footer">
        <button className="task-input__btn" onClick={handleRecheck}>
          <Icon name="refresh" /> Re-check
        </button>
        {status.allGood && (
          <p className="prereq__continue">Click "Continue" below to set up your project.</p>
        )}
      </div>
    </div>
  );
}
