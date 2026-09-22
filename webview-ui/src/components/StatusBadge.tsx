import type { TicketStatus } from '../types';
import Icon from './Icon';

interface Props {
  status: TicketStatus;
}

const STATUS_CONFIG: Record<TicketStatus, { label: string; icon: string; className: string; spin?: boolean }> = {
  todo:           { label: 'Todo',           icon: 'circle-large-outline', className: 'badge--todo' },
  planning:       { label: 'Planning',       icon: 'lightbulb',    className: 'badge--planning' },
  plan_review:    { label: 'Plan Review',    icon: 'eye',          className: 'badge--plan-review' },
  in_progress:    { label: 'In Progress',    icon: 'sync',         className: 'badge--in-progress', spin: true },
  in_review:      { label: 'In Review',      icon: 'search',       className: 'badge--in-review' },
  ready_to_test:  { label: 'Ready to Test',  icon: 'pass',         className: 'badge--ready' },
  done:           { label: 'Done',           icon: 'rocket',       className: 'badge--done' },
  failed:         { label: 'Failed',         icon: 'error',        className: 'badge--failed' },
};

export default function StatusBadge({ status }: Props) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={`badge ${config.className}`}>
      <Icon name={config.icon} spin={config.spin} />
      {config.label}
    </span>
  );
}
