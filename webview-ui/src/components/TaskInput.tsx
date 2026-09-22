import { useState } from 'react';
import Icon from './Icon';

interface Props {
  onSubmit: (task: string) => void;
}

export default function TaskInput({ onSubmit }: Props) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  };

  return (
    <div className="task-input">
      <div className="task-input__label-row">
        <span className="task-input__label">
          <Icon name="sparkle" /> New task
        </span>
        <kbd className="kbd">⌘↵</kbd>
      </div>
      <textarea
        className="task-input__textarea"
        placeholder="Describe what to build… Maestro slices it into tickets."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
      />
      <div className="task-input__footer">
        <p className="task-input__hint">⌘+Enter to send</p>
        <button className="task-input__btn" onClick={handleSubmit} disabled={!value.trim()}>
          Create tickets <Icon name="arrow-right" />
        </button>
      </div>
    </div>
  );
}
