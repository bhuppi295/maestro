// Mirror of src/types/index.ts for WebView use

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
  groupId: string;
  groupTitle: string;
  groupBranchType: 'ft' | 'fix';
  implementationPlan?: string;
  affectedFiles?: string[];
  acceptanceCriteria?: string[];
  architectureNotes?: string;
  specialistType?: SpecialistType;
  attempts: number;
  reviewerFeedback: string[];
  branchName?: string;
  createdAt: string;
  updatedAt: string;
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
  projectTypes: string[];      // ['Flutter', 'Python'] — all detected types
  analyzeCommands: string[];   // ['flutter analyze', 'ruff check .'] — one per type
  testCommand: string;         // 'flutter test', 'npx jest', 'pytest'
  packageManager: string;      // 'pub', 'npm', 'yarn', 'pnpm', 'pip'
  entryPoint: string;          // 'lib/main.dart', 'src/index.ts', 'main.py'
}

export type ExtensionMessage =
  | { type: 'TICKETS_UPDATED'; tickets: Ticket[] }
  | { type: 'TICKET_STATUS_CHANGED'; ticketId: string; status: TicketStatus }
  | { type: 'AI_LOG'; ticketId: string; message: string }
  | { type: 'PROJECT_CONTEXT_READY'; context: ProjectContext | null }
  | { type: 'ERROR'; ticketId: string; error: string }
  | { type: 'PREREQUISITES_RESULT'; status: PrerequisitesStatus }
  | { type: 'SETTINGS_UPDATED'; settings: MaestroSettings }
  | { type: 'API_KEY_STATUS'; hasKey: boolean };

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
  | { type: 'SET_API_KEY'; apiKey: string }
  | { type: 'GET_API_KEY_STATUS' };

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


export interface MaestroSettings {
  agentModel: string;
  agentBinaryPath: string;
  claudeTimeoutMs: number;
  implementationTimeoutMs: number;
  maxRetries: number;
  branchPrefix: string;
}