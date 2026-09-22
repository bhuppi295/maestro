import { useEffect, useState } from 'react';
import type { TicketProgress, TicketPhase } from '../types';
import Icon from './Icon';

const PHASES: { id: TicketPhase; label: string; icon: string }[] = [
  { id: 'planning', label: 'Planning', icon: 'lightbulb' },
  { id: 'implementing', label: 'Implementing', icon: 'zap' },
  { id: 'analyzing', label: 'Analyzing', icon: 'search' },
  { id: 'reviewing', label: 'Reviewing', icon: 'eye' },
];

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function ProgressStrip({ progress }: { progress: TicketProgress }) {
  const [now, setNow] = useState(() => Date.now());

  // The backend sends a start time, not ticks — the timer runs locally.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [progress.phase, progress.startedAt]);

  const activeIndex = PHASES.findIndex((p) => p.id === progress.phase);
  const showRetry = progress.maxAttempts > 1 && progress.attempt > 1;

  return (
    <div className="progress" role="status" aria-live="polite">
      <div className="progress__head">
        <Icon name="loading" spin className="progress__spinner" />
        <span className="progress__phase">{PHASES[activeIndex]?.label ?? 'Working'}</span>
        <span className="progress__elapsed">{formatElapsed(now - progress.startedAt)}</span>
        {showRetry && (
          <span className="progress__retry">
            Retry {progress.attempt}/{progress.maxAttempts}
          </span>
        )}
      </div>

      <ol className="progress__steps">
        {PHASES.map((p, i) => {
          const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending';
          return (
            <li key={p.id} className={`progress__step progress__step--${state}`}>
              <Icon name={state === 'done' ? 'check' : p.icon} className="progress__step-icon" />
              <span className="progress__step-label">{p.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
