import type { TicketStatus } from '../types';

interface Props {
  status: TicketStatus;
}

const STATUS_CONFIG: Record<TicketStatus, { label: string; className: string }> = {
  todo: { label: 'Todo', className: 'badge--todo' },
  planning: { label: 'Planning', className: 'badge--planning' },
  plan_review: { label: 'Plan review', className: 'badge--plan-review' },
  in_progress: { label: 'In progress', className: 'badge--in-progress' },
  in_review: { label: 'In review', className: 'badge--in-review' },
  ready_to_test: { label: 'Ready to test', className: 'badge--ready' },
  done: { label: 'Done', className: 'badge--done' },
  failed: { label: 'Failed', className: 'badge--failed' },
};

export default function StatusBadge({ status }: Props) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={`badge ${config.className}`}>
      <span className="badge__dot" aria-hidden="true" />
      {config.label}
    </span>
  );
}
