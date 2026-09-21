// types/index.ts — All Maestro interfaces

import type { MaestroSettings } from '../services/settings.service';

export type { MaestroSettings };

export type TicketStatus =
  | 'todo'
  | 'planning'
  | 'plan_review'
  | 'in_progress'
  | 'in_review'
  | 'ready_to_test'
  | 'done'
  | 'failed';

export type TicketPriority = 'high' | 'medium' | 'low';
export type SpecialistType = 'logic' | 'ui' | 'both' | 'general';

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  dependsOn: string[];

  // Grouping — links ticket back to user's original task
  groupId: string;
  groupTitle: string;
  groupBranchType: 'ft' | 'fix';  // feature or fix branch prefix

  // AI-facing
  implementationPlan?: string;
  affectedFiles?: string[];
  acceptanceCriteria?: string[];
  architectureNotes?: string;
  specialistType?: SpecialistType;

  // Execution
  attempts: number;
  reviewerFeedback: string[];
  completionReport?: CompletionReport;
  branchName?: string;

  createdAt: string;
  updatedAt: string;
}

export interface CompletionReport {
  completed: string[];
  incomplete: string[];
  stoppedReason?: string;
}

export interface ProjectContext {
  appName: string;
  appPurpose: string;
  techStack: string[];
  architecture: string;
  folderStructure: string;
  codingConventions: string;
  existingFeatures: string[];
  keyFiles: Record<string, string>;
  rawContent: string;

  // Stack-agnostic detection results
  projectTypes: string[];
  analyzeCommands: string[];
  testCommand: string;
  packageManager: string;
  entryPoint: string;
}

// WebView → Extension
export type WebViewMessage =
  | { type: 'SUBMIT_TASK'; payload: string }
  | { type: 'DO_WITH_AI'; ticketId: string }
  | { type: 'APPROVE_PLAN'; ticketId: string }
  | { type: 'REQUEST_PLAN_CHANGES'; ticketId: string; feedback: string }
  | { type: 'APPROVE_TEST'; ticketId: string }
  | { type: 'REJECT_TEST'; ticketId: string; reason: string }
  | { type: 'UNBLOCK_MANUAL'; ticketId: string }
  | { type: 'SETUP_SCAN_WORKSPACE' }
  | { type: 'SETUP_LOAD_FILE' }
  | { type: 'CLEAR_CONTEXT' }
  | { type: 'REFRESH_CONTEXT' }
  | { type: 'SAVE_PLAN'; ticketId: string; ticketTitle: string; content: string }
  | { type: 'STOP_TASK'; ticketId: string }
  | { type: 'DELETE_TICKET'; ticketId: string }
  | { type: 'RETRY_TICKET'; ticketId: string }
  | { type: 'GET_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; settings: MaestroSettings }
  | { type: 'RESET_SETTINGS' }
  | { type: 'CHECK_PREREQUISITES' }
  | { type: 'OPEN_URL'; url: string }
  | { type: 'SET_API_KEY'; apiKey: string }
  | { type: 'GET_API_KEY_STATUS' };

// Extension → WebView
export type ExtensionMessage =
  | { type: 'TICKETS_UPDATED'; tickets: Ticket[] }
  | { type: 'TICKET_STATUS_CHANGED'; ticketId: string; status: TicketStatus }
  | { type: 'AI_LOG'; ticketId: string; message: string }
  | { type: 'PROJECT_CONTEXT_READY'; context: ProjectContext | null }
  | { type: 'ERROR'; ticketId: string; error: string }
  | { type: 'SETTINGS_UPDATED'; settings: MaestroSettings }
  | { type: 'PREREQUISITES_RESULT'; status: PrerequisitesStatus }
  | { type: 'API_KEY_STATUS'; hasKey: boolean };

// Prerequisites
export interface PrerequisiteItem {
  id: string;
  name: string;
  installed: boolean;
  version?: string;
  installNote: string;
  installUrl: string;
}

export interface PrerequisitesStatus {
  allGood: boolean;
  items: PrerequisiteItem[];
}