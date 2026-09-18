import type { TicketStatus } from '../types';

interface Props {
  status: TicketStatus;
}

const STATUS_CONFIG: Record<TicketStatus, { label: string; className: string }> = {
  todo:           { label: '📝 Todo',            className: 'badge--todo' },
  planning:       { label: '🧠 Planning',         className: 'badge--planning' },
  plan_review:    { label: '👀 Plan Review',      className: 'badge--plan-review' },
  in_progress:    { label: '⚡ In Progress',      className: 'badge--in-progress' },
  in_review:      { label: '🔍 In Review',        className: 'badge--in-review' },
  ready_to_test:  { label: '✅ Ready to Test',    className: 'badge--ready' },
  done:           { label: '🚀 Done',             className: 'badge--done' },
  failed:         { label: '❌ Failed',           className: 'badge--failed' },
};

export default function StatusBadge({ status }: Props) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={`badge ${config.className}`}>
      {config.label}
    </span>
  );
}
