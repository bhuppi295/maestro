import { describe, it, expect } from 'vitest';
import { describeEmptyOutput, stripAnsi } from './agent.service';
import { resolveEffectiveConfig } from './agent-providers';

const cfg = resolveEffectiveConfig('opencode', {});

describe('stripAnsi', () => {
  it('removes color codes', () => {
    expect(stripAnsi('\u001b[91m\u001b[1mError:\u001b[0m boom')).toBe('Error: boom');
  });
});

describe('describeEmptyOutput', () => {
  it('names provider-side server errors as transient with retry guidance', () => {
    const msg = describeEmptyOutput(
      '\u001b[91mError:\u001b[0m {"name":"UnknownError","data":{"message":"Unexpected server error.","ref":"err_36c730a7"}}',
      cfg
    );
    expect(msg).toContain('transient provider-side error');
    expect(msg).toContain('err_36c730a7');
    expect(msg).not.toContain('\u001b[');
  });

  it('names rate limits with wait guidance', () => {
    expect(describeEmptyOutput('HTTP 429 too many requests', cfg)).toContain('rate-limited');
  });

  it('still names auth failures directly', () => {
    expect(describeEmptyOutput('401 unauthorized', cfg)).toContain('credentials');
  });
});
