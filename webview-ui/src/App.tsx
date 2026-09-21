import { useState, useEffect } from 'react';
import { vscode } from './vscode';
import PrerequisitesCheck from './components/PrerequisitesCheck';
import SetupProject from './components/SetupProject';
import ProjectContextBanner from './components/ProjectContextBanner';
import TaskInput from './components/TaskInput';
import TicketList from './components/TicketList';
import TicketBoard from './components/TicketBoard';
import SettingsPanel from './components/SettingsPanel';
import type { Ticket, ExtensionMessage, ProjectContext, PrerequisitesStatus, MaestroSettings, TicketProgress } from './types';

const DEFAULT_SETTINGS: MaestroSettings = {
  agentModel: 'sonnet',
  agentBinaryPath: 'claude',
  claudeTimeoutMs: 180000,
  implementationTimeoutMs: 600000,
  maxRetries: 3,
  branchPrefix: 'maestro/',
};

export default function App() {
  const [prerequisites, setPrerequisites] = useState<PrerequisitesStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [projectContext, setProjectContext] = useState<ProjectContext | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [log, setLog] = useState<string>('');
  const [settings, setSettings] = useState<MaestroSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [progressById, setProgressById] = useState<Record<string, TicketProgress>>({});
  // Editor-tab surface is much wider than the sidebar; layout adapts to it.
  const [isWide, setIsWide] = useState(() => window.innerWidth >= 860);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data as ExtensionMessage;
      switch (message.type) {
        case 'PREREQUISITES_RESULT':
          setPrerequisites((message as any).status);
          setChecking(false);
          break;
        case 'SETTINGS_UPDATED':
          setSettings((message as any).settings);
          break;
        case 'API_KEY_STATUS':
          setHasApiKey(message.hasKey);
          break;
        case 'TICKET_PROGRESS':
          setProgressById(prev => {
            const next = { ...prev };
            if (message.progress) next[message.ticketId] = message.progress;
            else delete next[message.ticketId];
            return next;
          });
          break;
        case 'PROJECT_CONTEXT_READY':
          setProjectContext((message as any).context ?? null);
          setLog('');
          break;
        case 'TICKETS_UPDATED':
          setTickets(message.tickets);
          break;
        case 'TICKET_STATUS_CHANGED':
          setTickets((prev) =>
            prev.map((t) =>
              t.id === message.ticketId ? { ...t, status: message.status } : t
            )
          );
          break;
        case 'AI_LOG':
          setLog(message.message);
          break;
        case 'ERROR':
          setLog(`⚠️ ${message.error}`);
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 860);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const activeCount = tickets.filter(t => t.status !== 'done').length;

  const ticketActions = {
    onDoWithAI: (id: string) => vscode.postMessage({ type: 'DO_WITH_AI', ticketId: id }),
    onApprovePlan: (id: string) => vscode.postMessage({ type: 'APPROVE_PLAN', ticketId: id }),
    onRequestPlanChanges: (id: string, feedback: string) =>
      vscode.postMessage({ type: 'REQUEST_PLAN_CHANGES', ticketId: id, feedback }),
    onApproveTest: (id: string) => vscode.postMessage({ type: 'APPROVE_TEST', ticketId: id }),
    onRejectTest: (id: string, reason: string) =>
      vscode.postMessage({ type: 'REJECT_TEST', ticketId: id, reason }),
    onUnblockManual: (id: string) => vscode.postMessage({ type: 'UNBLOCK_MANUAL', ticketId: id }),
  };

  const header = (
    <header className="app-header">
      <span className="app-logo">🎼</span>
      <h1 className="app-title">Maestro</h1>
      {activeCount > 0 && (
        <span className="app-header__count" title={`${activeCount} active ticket(s)`}>
          {activeCount}
        </span>
      )}
      <div className="app-header__actions">
        <button
          className={`app-header__btn ${showSettings ? 'app-header__btn--active' : ''}`}
          title="Settings"
          onClick={() => {
            if (!showSettings) vscode.postMessage({ type: 'GET_API_KEY_STATUS' });
            setShowSettings(v => !v);
          }}
        >
          ⚙
        </button>
      </div>
    </header>
  );

  // Settings overlay
  if (showSettings) {
    return (
      <>
        {header}
        <SettingsPanel
          settings={settings}
          hasApiKey={hasApiKey}
          onClose={() => setShowSettings(false)}
        />
      </>
    );
  }

  if (checking) {
    return (
      <>
        {header}
        <div className="setup__loading" style={{ padding: '32px' }}>
          <div className="setup__spinner">⟳</div>
          <p className="setup__loading-msg">Checking prerequisites...</p>
        </div>
      </>
    );
  }

  if (prerequisites && !prerequisites.allGood) {
    return (
      <>
        {header}
        <PrerequisitesCheck status={prerequisites} onRecheck={() => setChecking(false)} />
      </>
    );
  }

  if (!projectContext) {
    return (
      <>
        {header}
        {log && <p className="app-log">{log}</p>}
        <SetupProject />
      </>
    );
  }

  // With no tickets the board has nothing to show, so the composer becomes the
  // page rather than a column beside an empty grid.
  const isFirstRun = isWide && tickets.length === 0;

  return (
    <div className={`app ${isWide ? 'app--wide' : ''} ${isFirstRun ? 'app--firstrun' : ''}`}>
      {header}
      <div className="app__workspace">
        <aside className="app__aside">
          <ProjectContextBanner
            context={projectContext}
            onReset={() => setProjectContext(null)}
          />
          <TaskInput onSubmit={(task: string) => {
            setLog('');
            vscode.postMessage({ type: 'SUBMIT_TASK', payload: task });
          }} />
          {log && <p className="app-log">{log}</p>}
        </aside>

        <main className="app__main">
          {isWide
            ? <TicketBoard tickets={tickets} progressById={progressById} {...ticketActions} />
            : <TicketList tickets={tickets} progressById={progressById} {...ticketActions} />}
        </main>
      </div>
    </div>
  );
}