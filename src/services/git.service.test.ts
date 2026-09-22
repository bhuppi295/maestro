import { describe, it, expect } from 'vitest';
import { makeBranchName, resolveGroupBranch } from './git.service';

describe('makeBranchName', () => {
  it('slugifies a title with ft prefix by default', () => {
    // Note: hyphens are stripped, not preserved: "In-App" -> "inapp".
    expect(makeBranchName('Add In-App Purchases')).toBe('ft/add-inapp-purchases');
  });

  it('honors the fix branch type', () => {
    expect(makeBranchName('Fix crash on empty cart', 'fix')).toBe('fix/fix-crash-on-empty-cart');
  });

  it('strips punctuation and collapses whitespace', () => {
    expect(makeBranchName('  Refactor: auth!!!   flow?? ')).toBe('ft/refactor-auth-flow');
  });

  it('lowercases and truncates the slug to 50 chars', () => {
    const slug = makeBranchName('A'.repeat(80));
    expect(slug.startsWith('ft/')).toBe(true);
    expect(slug.slice('ft/'.length).length).toBeLessThanOrEqual(50);
  });

  it('drops non-ascii characters', () => {
    expect(makeBranchName('Add Über mode')).toBe('ft/add-ber-mode');
  });
});

describe('resolveGroupBranch', () => {
  it('reuses a sibling ticket branch when one exists', () => {
    const tickets = [{ groupId: 'g1', branchName: 'ft/existing-work' }, { groupId: 'g1' }];
    expect(resolveGroupBranch('g1', 'Something Else', 'ft', tickets)).toBe('ft/existing-work');
  });

  it('ignores branches from other groups', () => {
    const tickets = [{ groupId: 'g2', branchName: 'ft/other-group' }];
    expect(resolveGroupBranch('g1', 'New Feature', 'ft', tickets)).toBe('ft/new-feature');
  });

  it('creates a fresh name when no sibling has one', () => {
    expect(resolveGroupBranch('g1', 'Dark Mode Toggle', 'fix', [])).toBe('fix/dark-mode-toggle');
  });
});
