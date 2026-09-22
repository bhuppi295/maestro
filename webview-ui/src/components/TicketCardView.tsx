import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { vscode } from '../vscode';
import type { Ticket, TicketProgress } from '../types';
import StatusBadge from './StatusBadge';
import ProgressStrip from './ProgressStrip';
import { renderMarkdown } from '../utils/markdown';
import Icon from './Icon';

interface CardProps {
  ticket: Ticket;
  isLast?: boolean;
  allTickets: Ticket[];
  progressById: Record<string, TicketProgress>;
  onDoWithAI: (id: string) => void;
  onApprovePlan: (id: string) => void;
  onRequestPlanChanges: (id: string, feedback: string) => void;
  onApproveTest: (id: string) => void;
  onRejectTest: (id: string, reason: string) => void;
  onUnblockManual: (id: string) => void;
}

export default function TicketCardView({
  ticket,
  isLast = false,
  allTickets,
  progressById,
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
  const [showPlan, setShowPlan] = useState(false);
  const [showPlanChanges, setShowPlanChanges] = useState(false);

  // Esc closes the plan modal even though it portals to document.body.
  useEffect(() => {
    if (!showPlan) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPlan(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showPlan]);

  const blockers = ticket.dependsOn
    .map((depId) => allTickets.find((t) => t.id === depId))
    .filter((dep): dep is Ticket => !!dep && dep.status !== 'done');
  const isBlocked = ticket.status === 'todo' && blockers.length > 0;
  const progress = progressById[ticket.id];

  return (
    <div
      className={`ticket-card ticket-card--${ticket.status} ${isLast ? 'ticket-card--last' : ''} ${isBlocked ? 'ticket-card--blocked' : ''}`}
    >
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
                >
                  <Icon name="trash" />
                </button>
              )}
              <Icon
                name={expanded ? 'chevron-up' : 'chevron-down'}
                className="ticket-card__chevron"
              />
            </div>
          </div>
          <div className="ticket-card__badges">
            <StatusBadge status={ticket.status} />
            {ticket.priority === 'high' && (
              <span className="badge badge--priority">
                <span className="badge__dot" aria-hidden="true" /> High
              </span>
            )}
            {isBlocked && (
              <span className="badge badge--blocked">
                <Icon name="lock" /> Blocked
              </span>
            )}
          </div>
        </div>

        {progress && <ProgressStrip progress={progress} />}

        {expanded && (
          <div className="ticket-card__body">
            {isBlocked && (
              <div className="ticket-card__blocked-warning">
                <span>
                  <Icon name="lock" /> Complete first:
                </span>
                <ul>
                  {blockers.map((b) => (
                    <li key={b.id}>{b.title}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="ticket-card__description">{ticket.description}</p>

            {ticket.implementationPlan && (
              <section className="ticket-card__section">
                <div className="ticket-card__section-header">
                  <h4>
                    <Icon name="lightbulb" /> Plan
                  </h4>
                  <div className="ticket-card__plan-actions">
                    <button
                      className="btn-icon"
                      title="View plan"
                      onClick={() => setShowPlan(true)}
                    >
                      <Icon name="eye" />
                    </button>
                    <button
                      className="btn-icon"
                      title="Copy plan"
                      onClick={() => navigator.clipboard.writeText(ticket.implementationPlan!)}
                    >
                      <Icon name="copy" />
                    </button>
                    <button
                      className="btn-icon"
                      title="Save plan"
                      onClick={() =>
                        vscode.postMessage({
                          type: 'SAVE_PLAN',
                          ticketId: ticket.id,
                          ticketTitle: ticket.title,
                          content: ticket.implementationPlan!,
                        })
                      }
                    >
                      <Icon name="save" />
                    </button>
                  </div>
                </div>
                <button className="plan-teaser" onClick={() => setShowPlan(true)}>
                  <Icon name="eye" /> View full plan
                </button>
              </section>
            )}

            {ticket.acceptanceCriteria && ticket.acceptanceCriteria.length > 0 && (
              <section className="ticket-card__section">
                <h4>
                  <Icon name="checklist" /> Acceptance
                </h4>
                <ul>
                  {ticket.acceptanceCriteria.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </section>
            )}

            {ticket.affectedFiles && ticket.affectedFiles.length > 0 && (
              <section className="ticket-card__section">
                <h4>
                  <Icon name="files" /> Files · {ticket.affectedFiles.length}
                </h4>
                <ul className="ticket-card__files">
                  {ticket.affectedFiles.map((f, i) => (
                    <li key={i} className="ticket-card__file">
                      {f}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {ticket.reviewerFeedback.length > 0 && (
              <section className="ticket-card__section">
                <h4>
                  <Icon name="comment" /> Feedback
                </h4>
                {ticket.reviewerFeedback.map((f, i) => (
                  <p key={i} className="ticket-card__feedback">
                    Attempt {i + 1}: {f}
                  </p>
                ))}
              </section>
            )}

            {ticket.branchName && (
              <p className="ticket-card__branch">
                <Icon name="git-branch" /> <code>{ticket.branchName}</code>
              </p>
            )}

            {/* Actions */}
            <div className="ticket-card__actions">
              {ticket.status === 'todo' && !isBlocked && (
                <button className="btn btn--primary" onClick={() => onDoWithAI(ticket.id)}>
                  <Icon name="zap" /> Do with AI
                </button>
              )}

              {ticket.status === 'in_progress' && (
                <button
                  className="btn btn--stop"
                  onClick={() => vscode.postMessage({ type: 'STOP_TASK', ticketId: ticket.id })}
                >
                  <Icon name="debug-stop" /> Stop
                </button>
              )}

              {ticket.status === 'plan_review' && (
                <>
                  <button className="btn btn--success" onClick={() => onApprovePlan(ticket.id)}>
                    <Icon name="check" /> Approve Plan
                  </button>
                  {!showChangesInput ? (
                    <button
                      className="btn btn--secondary"
                      onClick={() => setShowChangesInput(true)}
                    >
                      <Icon name="edit" /> Request Changes
                    </button>
                  ) : (
                    <div className="ticket-card__input-group">
                      <textarea
                        placeholder="What should be changed?"
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        rows={2}
                      />
                      <button
                        className="btn btn--warning"
                        onClick={() => {
                          if (feedback.trim()) {
                            onRequestPlanChanges(ticket.id, feedback);
                            setFeedback('');
                            setShowChangesInput(false);
                          }
                        }}
                      >
                        Send Feedback
                      </button>
                    </div>
                  )}
                </>
              )}

              {ticket.status === 'ready_to_test' && (
                <>
                  <button className="btn btn--success" onClick={() => onApproveTest(ticket.id)}>
                    <Icon name="rocket" /> Looks Good
                  </button>
                  {!showRejectInput ? (
                    <button className="btn btn--danger" onClick={() => setShowRejectInput(true)}>
                      <Icon name="close" /> Reject
                    </button>
                  ) : (
                    <div className="ticket-card__input-group">
                      <textarea
                        placeholder="What's wrong? (required)"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        rows={2}
                      />
                      <button
                        className="btn btn--danger"
                        onClick={() => {
                          if (rejectReason.trim()) {
                            onRejectTest(ticket.id, rejectReason);
                            setRejectReason('');
                            setShowRejectInput(false);
                          }
                        }}
                      >
                        Submit Rejection
                      </button>
                    </div>
                  )}
                </>
              )}

              {ticket.status === 'failed' && (
                <div className="ticket-card__actions">
                  <button
                    className="btn btn--primary"
                    onClick={() =>
                      vscode.postMessage({ type: 'RETRY_TICKET', ticketId: ticket.id })
                    }
                  >
                    <Icon name="refresh" /> Retry with AI
                  </button>
                  <button className="btn btn--secondary" onClick={() => onUnblockManual(ticket.id)}>
                    <Icon name="wrench" /> Handle Manually
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showPlan &&
        ticket.implementationPlan &&
        createPortal(
          <div
            className="plan-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Plan: ${ticket.title}`}
            onClick={() => setShowPlan(false)}
          >
            <div className="plan-modal__sheet" onClick={(e) => e.stopPropagation()}>
              <header className="plan-modal__head">
                <div className="plan-modal__title">
                  <Icon name="lightbulb" />
                  <div>
                    <strong>{ticket.title}</strong>
                    <span>Implementation plan</span>
                  </div>
                </div>
                <div className="plan-modal__actions">
                  <button
                    className="btn-icon"
                    title="Copy plan"
                    onClick={() => navigator.clipboard.writeText(ticket.implementationPlan!)}
                  >
                    <Icon name="copy" />
                  </button>
                  <button
                    className="btn-icon"
                    title="Save plan"
                    onClick={() =>
                      vscode.postMessage({
                        type: 'SAVE_PLAN',
                        ticketId: ticket.id,
                        ticketTitle: ticket.title,
                        content: ticket.implementationPlan!,
                      })
                    }
                  >
                    <Icon name="save" />
                  </button>
                  <button className="btn-icon" title="Close" onClick={() => setShowPlan(false)}>
                    <Icon name="close" />
                  </button>
                </div>
              </header>
              <div
                className="ticket-card__markdown plan-modal__body"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(ticket.implementationPlan) }}
              />
              {ticket.status === 'plan_review' && (
                <footer className="plan-modal__foot">
                  {!showPlanChanges ? (
                    <>
                      <button
                        className="btn btn--success"
                        onClick={() => {
                          onApprovePlan(ticket.id);
                          setShowPlan(false);
                        }}
                      >
                        <Icon name="check" /> Approve plan
                      </button>
                      <button
                        className="btn btn--secondary"
                        onClick={() => setShowPlanChanges(true)}
                      >
                        <Icon name="edit" /> Request changes
                      </button>
                    </>
                  ) : (
                    <div className="ticket-card__input-group">
                      <textarea
                        placeholder="What should be changed?"
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        rows={2}
                      />
                      <div className="plan-modal__foot-row">
                        <button
                          className="btn btn--warning"
                          onClick={() => {
                            if (feedback.trim()) {
                              onRequestPlanChanges(ticket.id, feedback);
                              setFeedback('');
                              setShowPlanChanges(false);
                              setShowPlan(false);
                            }
                          }}
                        >
                          Send feedback
                        </button>
                        <button
                          className="btn btn--secondary"
                          onClick={() => setShowPlanChanges(false)}
                        >
                          Back
                        </button>
                      </div>
                    </div>
                  )}
                </footer>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
