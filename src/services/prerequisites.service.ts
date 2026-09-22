import { execFile } from 'child_process';
import { promisify } from 'util';
import type { PrerequisiteItem, PrerequisitesStatus } from '../types';

export type { PrerequisiteItem, PrerequisitesStatus };

const execFileAsync = promisify(execFile);
const CHECK_TIMEOUT = 8_000;

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

export interface AgentPrerequisite {
  binary: string;
  name: string;
  installNote: string;
  installUrl: string;
}

export class PrerequisitesService {
  /**
   * @param projectTypes Detected project types; only their toolchains are
   *   required. Omitted means agent tooling only.
   * @param agent The active provider's CLI. HTTP-only providers skip this.
   */
  async check(
    projectTypes: string[] = [],
    agent?: AgentPrerequisite | null
  ): Promise<PrerequisitesStatus> {
    const checks: Promise<PrerequisiteItem>[] = [this._checkGit()];
    if (agent) checks.unshift(this._checkAgent(agent));

    const agentAndGit = await Promise.all(checks);

    const stackChecks = await Promise.all(
      this._toolchainsFor(projectTypes).map((t) => this._checkToolchain(t))
    );

    const items = [...agentAndGit, ...stackChecks];
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

  private async _checkAgent(agent: AgentPrerequisite): Promise<PrerequisiteItem> {
    try {
      const { stdout } = await execFileAsync(agent.binary, ['--version'], {
        timeout: CHECK_TIMEOUT,
      });
      return {
        id: 'agent',
        name: agent.name,
        installed: true,
        version: stdout.trim().split('\n')[0],
        installNote: agent.installNote,
        installUrl: agent.installUrl,
      };
    } catch {
      return {
        id: 'agent',
        name: agent.name,
        installed: false,
        installNote: agent.installNote,
        installUrl: agent.installUrl,
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
