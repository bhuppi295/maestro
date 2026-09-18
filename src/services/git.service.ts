import simpleGit, { SimpleGit } from 'simple-git';

export class GitService {
  private _git: SimpleGit;

  constructor(workspacePath: string) {
    this._git = simpleGit(workspacePath);
  }

  /**
   * Create a new branch for a ticket and check it out.
   * If branch already exists, just check it out.
   */
  async createBranch(branchName: string): Promise<void> {
    const branches = await this._git.branch();
    const exists = branches.all.includes(branchName);

    if (exists) {
      await this._git.checkout(branchName);
    } else {
      await this._git.checkoutLocalBranch(branchName);
    }
  }

  /**
   * Get the current branch name.
   */
  async getCurrentBranch(): Promise<string> {
    const status = await this._git.status();
    return status.current ?? 'unknown';
  }

  /**
   * Get git diff for the current branch vs main/master.
   */
  async getDiff(baseBranch = 'main'): Promise<string> {
    try {
      const diff = await this._git.diff([baseBranch]);
      return diff || '[No changes detected]';
    } catch {
      // Try master if main not found
      try {
        const diff = await this._git.diff(['master']);
        return diff || '[No changes detected]';
      } catch {
        return '[Could not get diff]';
      }
    }
  }

  /**
   * Check if the workspace is a git repo.
   */
  async isGitRepo(): Promise<boolean> {
    try {
      await this._git.status();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stage and commit all changes (optional — for clean history).
   */
  async commitAll(message: string): Promise<void> {
    await this._git.add('.');
    await this._git.commit(message);
  }
}

/**
 * Generate a git-safe branch name from a ticket id and title.
 * e.g. "maestro/t_123_abc-add-in-app-purchases"
 */
/**
 * Generate branch name from group info.
 * Format: ft/feature-name or fix/feature-name
 * Uses groupTitle (original user task) not ticket title.
 */
export function makeBranchName(
  groupTitle: string,
  branchType: 'ft' | 'fix' = 'ft'
): string {
  const slug = groupTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50);
  return `${branchType}/${slug}`;
}

/**
 * Find the shared branch name for all tickets in a group.
 * Returns existing branch if already set, otherwise creates a new name.
 */
export function resolveGroupBranch(
  groupId: string,
  groupTitle: string,
  branchType: 'ft' | 'fix',
  allTickets: { groupId: string; branchName?: string }[]
): string {
  // Check if any sibling ticket already has a branch set
  const existing = allTickets.find(
    t => t.groupId === groupId && t.branchName
  );
  if (existing?.branchName) return existing.branchName;

  // Create new branch name from group title
  return makeBranchName(groupTitle, branchType);
}