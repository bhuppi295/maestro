import type { Ticket, TicketStatus, TicketProgress } from '../types';
import TicketCardView from './TicketCardView';
import Logo from './Logo';
import Icon from './Icon';

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
  icon: string;
  statuses: TicketStatus[];
  accent: string;
}

/** Pipeline stages, collapsed into the columns a user actually reasons about. */
const COLUMNS: Column[] = [
  {
    id: 'backlog',
    title: 'Backlog',
    icon: 'circle-large-outline',
    statuses: ['todo'],
    accent: 'var(--mo-status-todo)',
  },
  {
    id: 'planning',
    title: 'Planning',
    icon: 'lightbulb',
    statuses: ['planning', 'plan_review'],
    accent: 'var(--mo-status-planning)',
  },
  {
    id: 'building',
    title: 'Building',
    icon: 'zap',
    statuses: ['in_progress', 'in_review'],
    accent: 'var(--mo-status-progress)',
  },
  {
    id: 'review',
    title: 'Your Review',
    icon: 'eye',
    statuses: ['ready_to_test', 'failed'],
    accent: 'var(--mo-status-ready)',
  },
  { id: 'done', title: 'Done', icon: 'check', statuses: ['done'], accent: 'var(--mo-status-done)' },
];

const EXAMPLES = [
  'Add a dark mode toggle to settings',
  'Fix the crash when the cart is empty',
  'Add pagination to the orders list',
];

/** First-run state: an empty five-column grid reads as broken, not as ready. */
function BoardZeroState() {
  return (
    <div className="zero">
      <div className="zero__glyph" aria-hidden="true">
        <Logo size={48} />
      </div>
      <p className="zero__kicker">Agent pipeline</p>
      <h2 className="zero__title">Describe what you want built</h2>
      <p className="zero__sub">
        Maestro slices it into tickets, plans each one, writes the code, and reviews its own work —
        gliding across this board as it goes.
      </p>

      <ul className="zero__examples">
        {EXAMPLES.map((e) => (
          <li key={e} className="zero__example">
            {e}
          </li>
        ))}
      </ul>

      <ol className="zero__flow">
        {['Backlog', 'Planning', 'Building', 'Your Review', 'Done'].map((s, i) => (
          <li key={s} className="zero__flow-step">
            <span className="zero__flow-dot" data-i={i} aria-hidden="true" />
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function TicketBoard({ tickets, ...rest }: Props) {
  if (tickets.length === 0) return <BoardZeroState />;

  return (
    <div className="board">
      {COLUMNS.map((col) => {
        const items = tickets.filter((t) => col.statuses.includes(t.status));
        return (
          <section
            key={col.id}
            className="board__col"
            style={{ ['--col-accent' as string]: col.accent }}
            aria-label={`${col.title}, ${items.length} ticket(s)`}
          >
            <header className="board__col-head">
              <span className="board__col-icon" aria-hidden="true">
                <Icon name={col.icon} />
              </span>
              <h3 className="board__col-title">{col.title}</h3>
              <span className="board__col-count">{items.length}</span>
            </header>

            <div className="board__col-body">
              {items.length === 0 ? (
                <div className="board__col-empty">
                  <Icon name="plus" /> Drop zone
                </div>
              ) : (
                items.map((ticket) => (
                  <TicketCardView key={ticket.id} ticket={ticket} allTickets={tickets} {...rest} />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
