import type { Ticket, TicketStatus, TicketProgress } from '../types';
import TicketCardView from './TicketCardView';

interface Props {
  tickets: Ticket[];
  progressById: Record<string, TicketProgress>;
  onDoWithAI: (id: string) => void;
  onApprovePlan: (id: string) => void;
  onRequestPlanChanges: (id: string, feedback: string) => void;
  onApproveTest: (id: string) => void;
  onRejectTest: (id: string, reason: string) => void;
  onUnblockManual: (id: string) => void;
}

interface Column {
  id: string;
  title: string;
  statuses: TicketStatus[];
  accent: string;
}

/** Pipeline stages, collapsed into the columns a user actually reasons about. */
const COLUMNS: Column[] = [
  { id: 'backlog', title: 'Backlog', statuses: ['todo'], accent: 'var(--mo-status-todo)' },
  {
    id: 'planning',
    title: 'Planning',
    statuses: ['planning', 'plan_review'],
    accent: 'var(--mo-status-planning)',
  },
  {
    id: 'building',
    title: 'Building',
    statuses: ['in_progress', 'in_review'],
    accent: 'var(--mo-status-progress)',
  },
  {
    id: 'review',
    title: 'Your Review',
    statuses: ['ready_to_test', 'failed'],
    accent: 'var(--mo-status-ready)',
  },
  { id: 'done', title: 'Done', statuses: ['done'], accent: 'var(--mo-status-done)' },
];

export default function TicketBoard({ tickets, ...rest }: Props) {
  return (
    <div className="board">
      {COLUMNS.map(col => {
        const items = tickets.filter(t => col.statuses.includes(t.status));
        return (
          <section
            key={col.id}
            className="board__col"
            style={{ ['--col-accent' as string]: col.accent }}
            aria-label={`${col.title}, ${items.length} ticket(s)`}
          >
            <header className="board__col-head">
              <span className="board__col-dot" aria-hidden="true" />
              <h3 className="board__col-title">{col.title}</h3>
              <span className="board__col-count">{items.length}</span>
            </header>

            <div className="board__col-body">
              {items.length === 0 ? (
                <p className="board__col-empty">Nothing here</p>
              ) : (
                items.map(ticket => (
                  <TicketCardView
                    key={ticket.id}
                    ticket={ticket}
                    allTickets={tickets}
                    {...rest}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
