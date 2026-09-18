import { useState } from 'react';

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
      <textarea
        className="task-input__textarea"
        placeholder="Describe your task... (e.g. Add in-app purchases, integrate deeplink)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
      />
      <button
        className="task-input__btn"
        onClick={handleSubmit}
        disabled={!value.trim()}
      >
        Create Tickets ✦
      </button>
      <p className="task-input__hint">⌘+Enter to submit</p>
    </div>
  );
}
