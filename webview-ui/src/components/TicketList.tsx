import { useState } from 'react';
import type { Ticket, TicketProgress } from '../types';
import TicketCardView from './TicketCardView';
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

export default function TicketList({ tickets, ...actions }: Props) {
  const [archiveOpen, setArchiveOpen] = useState(false);

  if (tickets.length === 0) {
    return (
      <div className="ticket-list__empty">
        <p>No tickets yet.</p>
        <p>Write a task above to get started.</p>
      </div>
    );
  }

  // Split into active and archived (done) groups
  const activeTickets = tickets.filter(t => t.status !== 'done');
  const archivedTickets = tickets.filter(t => t.status === 'done');

  const buildGroups = (ticketList: Ticket[]) => {
    const groups = new Map<string, { title: string; tickets: Ticket[] }>();
    for (const ticket of ticketList) {
      const key = ticket.groupId ?? 'ungrouped';
      if (!groups.has(key)) {
        groups.set(key, { title: ticket.groupTitle ?? 'Tasks', tickets: [] });
      }
      groups.get(key)!.tickets.push(ticket);
    }
    return groups;
  };

  const activeGroups = buildGroups(activeTickets);
  const archivedGroups = buildGroups(archivedTickets);

  return (
    <div className="ticket-list">
      {/* Active tickets */}
      {activeTickets.length === 0 && archivedTickets.length > 0 && (
        <div className="ticket-list__empty">
          <p>All tasks complete! <Icon name="verified-filled" /></p>
        </div>
      )}

      {[...activeGroups.entries()].map(([groupId, group]) => (
        <TaskGroup
          key={groupId}
          groupTitle={group.title}
          tickets={group.tickets}
          allTickets={tickets}
          {...actions}
        />
      ))}

      {/* Archive section */}
      {archivedTickets.length > 0 && (
        <div className="archive">
          <button
            className="archive__toggle"
            onClick={() => setArchiveOpen(v => !v)}
          >
            <span>{archiveOpen ? '▾' : '▸'}</span>
            <span>Archive</span>
            <span className="archive__count">{archivedTickets.length}</span>
          </button>

          {archiveOpen && (
            <div className="archive__content">
              {[...archivedGroups.entries()].map(([groupId, group]) => (
                <TaskGroup
                  key={groupId}
                  groupTitle={group.title}
                  tickets={group.tickets}
                  allTickets={tickets}
                  archived
                  {...actions}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Task Group ───────────────────────────────────────────────

interface GroupProps {
  groupTitle: string;
  tickets: Ticket[];
  allTickets: Ticket[];
  progressById: Record<string, TicketProgress>;
  archived?: boolean;
  onDoWithAI: (id: string) => void;
  onApprovePlan: (id: string) => void;
  onRequestPlanChanges: (id: string, feedback: string) => void;
  onApproveTest: (id: string) => void;
  onRejectTest: (id: string, reason: string) => void;
  onUnblockManual: (id: string) => void;
}

function TaskGroup({ groupTitle, tickets, allTickets, archived = false, ...actions }: GroupProps) {
  const doneCount = tickets.filter(t => t.status === 'done').length;
  const total = tickets.length;
  const allDone = doneCount === total;

  return (
    <div className={`task-group ${allDone ? 'task-group--done' : ''} ${archived ? 'task-group--archived' : ''}`}>
      <div className="task-group__header">
        <div className="task-group__header-left">
          <Icon name={allDone ? "pass-filled" : "checklist"} className="task-group__icon" />
          <span className="task-group__title">{groupTitle}</span>
        </div>
        <span className="task-group__progress">{doneCount}/{total}</span>
      </div>
      <div className="task-group__tickets">
        {tickets.map((ticket, index) => (
          <TicketCardView
            key={ticket.id}
            ticket={ticket}
            isLast={index === tickets.length - 1}
            allTickets={allTickets}
            {...actions}
          />
        ))}
      </div>
    </div>
  );
}

