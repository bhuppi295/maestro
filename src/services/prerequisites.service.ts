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

/** Toolchain required per detected project type. */
const STACK_TOOLCHAINS: Record<string, ToolchainCheck> = {
  flutter: {
    id: 'flutter',
    name: 'Flutter SDK',
    bin: 'flutter',
    args: ['--version'],
    installNote: 'Required to run flutter analyze.',
    installUrl: 'https://flutter.dev/docs/get-started/install',
  },
  dart: {
    id: 'dart',
    name: 'Dart SDK',
    bin: 'dart',
    args: ['--version'],
    installNote: 'Required to run dart analyze.',
    installUrl: 'https://dart.dev/get-dart',
  },
  typescript: {
    id: 'node',
    name: 'Node.js',
    bin: 'node',
    args: ['--version'],
    installNote: 'Required to run tsc and npm-based tooling.',
    installUrl: 'https://nodejs.org',
  },
  javascript: {
    id: 'node',
    name: 'Node.js',
    bin: 'node',
    args: ['--version'],
    installNote: 'Required to run npm-based tooling.',
    installUrl: 'https://nodejs.org',
  },
  python: {
    id: 'python',
    name: 'Python',
    bin: 'python3',
    args: ['--version'],
    installNote: 'Required to run linters and tests.',
    installUrl: 'https://www.python.org/downloads',
  },
};

interface ToolchainCheck {
  id: string;
  name: string;
  bin: string;
  args: string[];
  installNote: string;
  installUrl: string;
}

export class PrerequisitesService {
  /**
   * @param projectTypes Detected project types; only their toolchains are
   *   required. Omitted means agent tooling only.
   */
  async check(projectTypes: string[] = []): Promise<PrerequisitesStatus> {
    const [claude, git] = await Promise.all([
      this._checkClaude(),
      this._checkGit(),
    ]);

    const stackChecks = await Promise.all(
      this._toolchainsFor(projectTypes).map((t) => this._checkToolchain(t))
    );

    const items = [claude, git, ...stackChecks];
    return {
      allGood: items.every((i) => i.installed),
      items,
    };
  }

  private _toolchainsFor(projectTypes: string[]): ToolchainCheck[] {
    const seen = new Set<string>();
    const result: ToolchainCheck[] = [];
    for (const type of projectTypes) {
      const toolchain = STACK_TOOLCHAINS[type.toLowerCase()];
      if (toolchain && !seen.has(toolchain.id)) {
        seen.add(toolchain.id);
        result.push(toolchain);
      }
    }
    return result;
  }

  private async _checkToolchain(t: ToolchainCheck): Promise<PrerequisiteItem> {
    try {
      const { stdout } = await execFileAsync(t.bin, t.args, {
        timeout: CHECK_TIMEOUT,
      });
      return {
        id: t.id,
        name: t.name,
        installed: true,
        version: stdout.trim().split('\n')[0],
        installNote: t.installNote,
        installUrl: t.installUrl,
      };
    } catch {
      return {
        id: t.id,
        name: t.name,
        installed: false,
        installNote: t.installNote,
        installUrl: t.installUrl,
      };
    }
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
        installNote: 'Required for all Maestro AI steps. Run `claude login`, or add an API key in Settings.',
        installUrl: 'https://claude.ai/code',
      };
    } catch {
      return {
        id: 'claude',
        name: 'Claude Code CLI',
        installed: false,
        installNote: 'Required for all Maestro AI steps. Run `claude login`, or add an API key in Settings.',
        installUrl: 'https://claude.ai/code',
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

}