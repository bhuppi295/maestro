import { useState } from 'react';
import { vscode } from '../vscode';
import type { Ticket } from '../types';
import StatusBadge from './StatusBadge';
import { renderMarkdown } from '../utils/markdown';

interface Props {
  tickets: Ticket[];
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
          <p>All tasks complete! 🎉</p>
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
          <span className="task-group__icon">{allDone ? '✅' : '📋'}</span>
          <span className="task-group__title">{groupTitle}</span>
        </div>
        <span className="task-group__progress">{doneCount}/{total}</span>
      </div>
      <div className="task-group__tickets">
        {tickets.map((ticket, index) => (
          <TicketCard
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

// ── Ticket Card ───────────────────────────────────────────────

interface CardProps {
  ticket: Ticket;
  isLast: boolean;
  allTickets: Ticket[];
  onDoWithAI: (id: string) => void;
  onApprovePlan: (id: string) => void;
  onRequestPlanChanges: (id: string, feedback: string) => void;
  onApproveTest: (id: string) => void;
  onRejectTest: (id: string, reason: string) => void;
  onUnblockManual: (id: string) => void;
}

function TicketCard({
  ticket,
  isLast,
  allTickets,
  onDoWithAI,
  onApprovePlan,
  onRequestPlanChanges,
  onApproveTest,
  onRejectTest,
  onUnblockManual,
}: CardProps) {
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [showChangesInput, setShowChangesInput] = useState(false);

  const blockers = ticket.dependsOn
    .map(depId => allTickets.find(t => t.id === depId))
    .filter((dep): dep is Ticket => !!dep && dep.status !== 'done');
  const isBlocked = ticket.status === 'todo' && blockers.length > 0;

  return (
    <div className={`ticket-card ticket-card--${ticket.status} ${isLast ? 'ticket-card--last' : ''} ${isBlocked ? 'ticket-card--blocked' : ''}`}>
      <div className="ticket-card__connector">
        <div className="ticket-card__connector-line" />
        <div className="ticket-card__connector-dot" />
      </div>

      <div className="ticket-card__content">
        <div className="ticket-card__header" onClick={() => setExpanded(!expanded)}>
          <div className="ticket-card__title-row">
            <span className="ticket-card__title">{ticket.title}</span>
            <div className="ticket-card__header-right">
              {ticket.status !== 'in_review' && (
                <button
                  className="btn-icon btn-icon--delete"
                  title="Delete ticket"
                  onClick={(e) => {
                    e.stopPropagation();
                    vscode.postMessage({ type: 'DELETE_TICKET', ticketId: ticket.id });
                  }}
                >🗑</button>
              )}
              <span className="ticket-card__chevron">{expanded ? '▲' : '▼'}</span>
            </div>
          </div>
          <div className="ticket-card__badges">
            <StatusBadge status={ticket.status} />
            {isBlocked && <span className="badge badge--blocked">🔒 Blocked</span>}
          </div>
        </div>

        {expanded && (
          <div className="ticket-card__body">
            {isBlocked && (
              <div className="ticket-card__blocked-warning">
                <span>🔒 Complete first:</span>
                <ul>{blockers.map(b => <li key={b.id}>{b.title}</li>)}</ul>
              </div>
            )}

            <p className="ticket-card__description">{ticket.description}</p>

            {ticket.implementationPlan && (
              <section className="ticket-card__section">
                <div className="ticket-card__section-header">
                  <h4>Implementation Plan</h4>
                  <div className="ticket-card__plan-actions">
                    <button className="btn-icon" title="Copy plan"
                      onClick={() => navigator.clipboard.writeText(ticket.implementationPlan!)}>📋</button>
                    <button className="btn-icon" title="Save plan"
                      onClick={() => vscode.postMessage({
                        type: 'SAVE_PLAN', ticketId: ticket.id,
                        ticketTitle: ticket.title, content: ticket.implementationPlan!,
                      })}>💾</button>
                  </div>
                </div>
                <div className="ticket-card__markdown"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(ticket.implementationPlan) }} />
              </section>
            )}

            {ticket.acceptanceCriteria && ticket.acceptanceCriteria.length > 0 && (
              <section className="ticket-card__section">
                <h4>Acceptance Criteria</h4>
                <ul>{ticket.acceptanceCriteria.map((c, i) => <li key={i}>{c}</li>)}</ul>
              </section>
            )}

            {ticket.affectedFiles && ticket.affectedFiles.length > 0 && (
              <section className="ticket-card__section">
                <h4>Affected Files</h4>
                <ul className="ticket-card__files">
                  {ticket.affectedFiles.map((f, i) => <li key={i} className="ticket-card__file">{f}</li>)}
                </ul>
              </section>
            )}

            {ticket.reviewerFeedback.length > 0 && (
              <section className="ticket-card__section">
                <h4>Feedback History</h4>
                {ticket.reviewerFeedback.map((f, i) => (
                  <p key={i} className="ticket-card__feedback">Attempt {i + 1}: {f}</p>
                ))}
              </section>
            )}

            {ticket.branchName && (
              <p className="ticket-card__branch">Branch: <code>{ticket.branchName}</code></p>
            )}

            {/* Actions */}
            <div className="ticket-card__actions">
              {ticket.status === 'todo' && !isBlocked && (
                <button className="btn btn--primary" onClick={() => onDoWithAI(ticket.id)}>
                  ⚡ Do with AI
                </button>
              )}

              {ticket.status === 'in_progress' && (
                <button className="btn btn--stop"
                  onClick={() => vscode.postMessage({ type: 'STOP_TASK', ticketId: ticket.id })}>
                  🛑 Stop
                </button>
              )}

              {ticket.status === 'plan_review' && (
                <>
                  <button className="btn btn--success" onClick={() => onApprovePlan(ticket.id)}>
                    ✅ Approve Plan
                  </button>
                  {!showChangesInput ? (
                    <button className="btn btn--secondary" onClick={() => setShowChangesInput(true)}>
                      ✏️ Request Changes
                    </button>
                  ) : (
                    <div className="ticket-card__input-group">
                      <textarea placeholder="What should be changed?" value={feedback}
                        onChange={(e) => setFeedback(e.target.value)} rows={2} />
                      <button className="btn btn--warning" onClick={() => {
                        if (feedback.trim()) {
                          onRequestPlanChanges(ticket.id, feedback);
                          setFeedback(''); setShowChangesInput(false);
                        }
                      }}>Send Feedback</button>
                    </div>
                  )}
                </>
              )}

              {ticket.status === 'ready_to_test' && (
                <>
                  <button className="btn btn--success" onClick={() => onApproveTest(ticket.id)}>
                    🚀 Looks Good
                  </button>
                  {!showRejectInput ? (
                    <button className="btn btn--danger" onClick={() => setShowRejectInput(true)}>
                      ❌ Reject
                    </button>
                  ) : (
                    <div className="ticket-card__input-group">
                      <textarea placeholder="What's wrong? (required)" value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)} rows={2} />
                      <button className="btn btn--danger" onClick={() => {
                        if (rejectReason.trim()) {
                          onRejectTest(ticket.id, rejectReason);
                          setRejectReason(''); setShowRejectInput(false);
                        }
                      }}>Submit Rejection</button>
                    </div>
                  )}
                </>
              )}

              {ticket.status === 'failed' && (
                <div className="ticket-card__actions">
                  <button className="btn btn--primary"
                    onClick={() => vscode.postMessage({ type: 'RETRY_TICKET', ticketId: ticket.id })}>
                    🔄 Retry with AI
                  </button>
                  <button className="btn btn--secondary" onClick={() => onUnblockManual(ticket.id)}>
                    🔧 Handle Manually
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}