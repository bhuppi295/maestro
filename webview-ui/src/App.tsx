import { useState, useEffect } from 'react';
import { vscode } from './vscode';
import PrerequisitesCheck from './components/PrerequisitesCheck';
import SetupProject from './components/SetupProject';
import ProjectContextBanner from './components/ProjectContextBanner';
import TaskInput from './components/TaskInput';
import TicketList from './components/TicketList';
import SettingsPanel from './components/SettingsPanel';
import type { Ticket, ExtensionMessage, ProjectContext, PrerequisitesStatus, MaestroSettings } from './types';

const DEFAULT_SETTINGS: MaestroSettings = {
  implementationModel: 'opencode/deepseek-v4-flash-free',
  claudeTimeoutMs: 180000,
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

  const header = (
    <header className="app-header">
      <span className="app-logo">🎼</span>
      <h1 className="app-title">Maestro</h1>
      <button
        className="app-header__settings"
        title="Settings"
        onClick={() => setShowSettings(v => !v)}
      >
        ⚙
      </button>
    </header>
  );

  // Settings overlay
  if (showSettings) {
    return (
      <>
        {header}
        <SettingsPanel
          settings={settings}
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

  return (
    <div className="app">
      {header}
      <ProjectContextBanner
        context={projectContext}
        onReset={() => setProjectContext(null)}
      />
      <TaskInput onSubmit={(task: string) => {
        setLog('');
        vscode.postMessage({ type: 'SUBMIT_TASK', payload: task });
      }} />
      {log && <p className="app-log">{log}</p>}
      <TicketList
        tickets={tickets}
        onDoWithAI={(id: string) =>
          vscode.postMessage({ type: 'DO_WITH_AI', ticketId: id })}
        onApprovePlan={(id: string) =>
          vscode.postMessage({ type: 'APPROVE_PLAN', ticketId: id })}
        onRequestPlanChanges={(id: string, feedback: string) =>
          vscode.postMessage({ type: 'REQUEST_PLAN_CHANGES', ticketId: id, feedback })}
        onApproveTest={(id: string) =>
          vscode.postMessage({ type: 'APPROVE_TEST', ticketId: id })}
        onRejectTest={(id: string, reason: string) =>
          vscode.postMessage({ type: 'REJECT_TEST', ticketId: id, reason })}
        onUnblockManual={(id: string) =>
          vscode.postMessage({ type: 'UNBLOCK_MANUAL', ticketId: id })}
      />
    </div>
  );
}