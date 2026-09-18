import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const CHECK_TIMEOUT = 8_000;

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

export class PrerequisitesService {
  async check(): Promise<PrerequisitesStatus> {
    const [claude, opencode, deepseek, git, flutter] = await Promise.all([
      this._checkClaude(),
      this._checkOpenCode(),
      this._checkDeepSeek(),
      this._checkGit(),
      this._checkFlutter(),
    ]);

    const items = [claude, opencode, deepseek, git, flutter];
    return {
      allGood: items.every((i) => i.installed),
      items,
    };
  }

  // ── Individual checks ────────────────────────────────────────

  private async _checkClaude(): Promise<PrerequisiteItem> {
    try {
      const { stdout } = await execFileAsync('claude', ['--version'], {
        timeout: CHECK_TIMEOUT,
      });
      return {
        id: 'claude',
        name: 'Claude Code CLI',
        installed: true,
        version: stdout.trim().split('\n')[0],
        installNote: 'Required for Orchestrator, Planner and Reviewer AI.',
        installUrl: 'https://claude.ai/code',
      };
    } catch {
      return {
        id: 'claude',
        name: 'Claude Code CLI',
        installed: false,
        installNote: 'Required for Orchestrator, Planner and Reviewer AI.',
        installUrl: 'https://claude.ai/code',
      };
    }
  }

  private async _checkOpenCode(): Promise<PrerequisiteItem> {
    try {
      const { stdout } = await execFileAsync('opencode', ['--version'], {
        timeout: CHECK_TIMEOUT,
      });
      return {
        id: 'opencode',
        name: 'OpenCode CLI',
        installed: true,
        version: stdout.trim().split('\n')[0],
        installNote: 'Required for implementation agent.',
        installUrl: 'https://opencode.ai',
      };
    } catch {
      return {
        id: 'opencode',
        name: 'OpenCode CLI',
        installed: false,
        installNote: 'Required for implementation agent.',
        installUrl: 'https://opencode.ai',
      };
    }
  }

  private async _checkDeepSeek(): Promise<PrerequisiteItem> {
    try {
      const { stdout } = await execFileAsync('opencode', ['models'], {
        timeout: CHECK_TIMEOUT,
      });
      const hasDeepSeek = stdout.toLowerCase().includes('deepseek');
      return {
        id: 'deepseek',
        name: 'DeepSeek in OpenCode',
        installed: hasDeepSeek,
        version: hasDeepSeek ? 'Configured ✓' : undefined,
        installNote: 'Add DeepSeek API key in OpenCode providers.',
        installUrl: 'https://platform.deepseek.com',
      };
    } catch {
      return {
        id: 'deepseek',
        name: 'DeepSeek in OpenCode',
        installed: false,
        installNote: 'Add DeepSeek API key via: opencode providers',
        installUrl: 'https://platform.deepseek.com',
      };
    }
  }

  private async _checkGit(): Promise<PrerequisiteItem> {
    try {
      const { stdout } = await execFileAsync('git', ['--version'], {
        timeout: CHECK_TIMEOUT,
      });
      return {
        id: 'git',
        name: 'Git',
        installed: true,
        version: stdout.trim(),
        installNote: 'Required for branch management.',
        installUrl: 'https://git-scm.com',
      };
    } catch {
      return {
        id: 'git',
        name: 'Git',
        installed: false,
        installNote: 'Required for branch management.',
        installUrl: 'https://git-scm.com',
      };
    }
  }

  private async _checkFlutter(): Promise<PrerequisiteItem> {
    try {
      const { stdout } = await execFileAsync('flutter', ['--version'], {
        timeout: CHECK_TIMEOUT,
      });
      const versionLine = stdout.split('\n')[0];
      return {
        id: 'flutter',
        name: 'Flutter SDK',
        installed: true,
        version: versionLine,
        installNote: 'Required for flutter analyze.',
        installUrl: 'https://flutter.dev/docs/get-started/install',
      };
    } catch {
      return {
        id: 'flutter',
        name: 'Flutter SDK',
        installed: false,
        installNote: 'Required for flutter analyze.',
        installUrl: 'https://flutter.dev/docs/get-started/install',
      };
    }
  }
}