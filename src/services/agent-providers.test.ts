import { describe, it, expect } from 'vitest';
import {
  AGENT_PROVIDER_IDS,
  getProvider,
  resolveEffectiveConfig,
  effortMaxTokens,
} from './agent-providers';

describe('provider registry', () => {
  it('covers claude, codex, gemini, opencode, deepseek, glm and custom', () => {
    expect([...AGENT_PROVIDER_IDS].sort()).toEqual(
      ['claude', 'codex', 'custom', 'deepseek', 'gemini', 'glm', 'opencode'].sort()
    );
  });

  it('falls back to claude for unknown ids', () => {
    expect(getProvider('nope' as never).id).toBe('claude');
  });

  it('gives every provider the full pipeline (HTTP via built-in file tools)', () => {
    for (const id of AGENT_PROVIDER_IDS) {
      expect(getProvider(id).supportsEdits).toBe(true);
    }
  });
});

describe('resolveEffectiveConfig', () => {
  it('prefers user overrides over provider defaults', () => {
    const cfg = resolveEffectiveConfig('claude', {
      binaryPath: '/opt/claude',
      model: 'opus',
    });
    expect(cfg.binary).toBe('/opt/claude');
    expect(cfg.model).toBe('opus');
  });

  it('falls back to provider defaults on empty overrides', () => {
    const cfg = resolveEffectiveConfig('codex', {
      binaryPath: '  ',
      model: '',
      baseUrl: '',
    });
    expect(cfg.binary).toBe('codex');
    expect(cfg.model).toBe('gpt-5');
    expect(cfg.baseUrl).toBe('');
  });

  it('resolves HTTP endpoint defaults', () => {
    const cfg = resolveEffectiveConfig('deepseek', {});
    expect(cfg.baseUrl).toBe('https://api.deepseek.com/chat/completions');
  });
});

describe('CLI arg builders', () => {
  it('claude keeps its print/effort/edit flags', () => {
    const p = getProvider('claude');
    expect(p.buildRunArgs('sonnet', 'high', 'hi')).toEqual([
      '--print',
      '--model',
      'sonnet',
      '--effort',
      'high',
      '--no-session-persistence',
    ]);
    const edit = p.buildEditArgs('sonnet', 'high', '/repo', 'hi');
    expect(edit).toContain('--permission-mode');
    expect(edit).toContain('acceptEdits');
  });

  it('omits --model when empty (provider default)', () => {
    expect(getProvider('claude').buildRunArgs('', 'high', 'hi')).not.toContain('--model');
    expect(getProvider('codex').buildRunArgs('', 'high', 'hi')).not.toContain('--model');
  });

  it('codex appends the prompt last with full-auto edits', () => {
    const p = getProvider('codex');
    const args = p.buildEditArgs('gpt-5', 'high', '/repo', 'do it');
    expect(args[0]).toBe('exec');
    expect(args).toContain('--full-auto');
    expect(args[args.length - 1]).toBe('do it');
  });

  it('opencode routes edits through the build agent', () => {
    const p = getProvider('opencode');
    expect(p.buildRunArgs('', 'high', 'hi')).toEqual(['run', 'hi']);
    expect(p.buildEditArgs('openai/gpt-5', 'high', '/repo', 'hi')).toEqual([
      'run',
      '--model',
      'openai/gpt-5',
      '--agent',
      'build',
      'hi',
    ]);
  });
});

describe('effortMaxTokens', () => {
  it('grows monotonically with effort', () => {
    const steps = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
    const tokens = steps.map(effortMaxTokens);
    expect([...tokens].sort((a, b) => a - b)).toEqual(tokens);
  });
});
