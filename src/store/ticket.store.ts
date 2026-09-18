import * as vscode from 'vscode';
import { Ticket, TicketStatus } from '../types';

const STORAGE_KEY = 'maestro.tickets';

export class TicketStore {
  constructor(private readonly _context: vscode.ExtensionContext) {}

  getAll(): Ticket[] {
    return this._context.workspaceState.get<Ticket[]>(STORAGE_KEY, []);
  }

  save(tickets: Ticket[]): void {
    this._context.workspaceState.update(STORAGE_KEY, tickets);
  }

  add(ticket: Ticket): void {
    const tickets = this.getAll();
    tickets.push(ticket);
    this.save(tickets);
  }

  update(id: string, patch: Partial<Ticket>): void {
    const tickets = this.getAll();
    const index = tickets.findIndex((t) => t.id === id);
    if (index !== -1) {
      tickets[index] = {
        ...tickets[index],
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      this.save(tickets);
    }
  }

  updateStatus(id: string, status: TicketStatus): void {
    this.update(id, { status });
  }

  addReviewerFeedback(id: string, feedback: string): void {
    const tickets = this.getAll();
    const ticket = tickets.find((t) => t.id === id);
    if (ticket) {
      this.update(id, {
        reviewerFeedback: [...ticket.reviewerFeedback, feedback],
        attempts: ticket.attempts + 1,
      });
    }
  }

  remove(id: string): void {
    const tickets = this.getAll().filter((t) => t.id !== id);
    this.save(tickets);
  }

  clear(): void {
    this.save([]);
  }
}
