import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseToolCalls, resolveInRoot, executeToolCall } from './http-tools';

describe('parseToolCalls', () => {
  it('extracts a single tool block', () => {
    const calls = parseToolCalls(
      'Let me read it:\n```tool\n{"tool": "read_file", "path": "a.ts"}\n```'
    );
    expect(calls).toEqual([{ tool: 'read_file', path: 'a.ts' }]);
  });

  it('extracts multiple blocks among prose', () => {
    const reply = [
      'First:',
      '```tool',
      '{"tool": "list_files", "path": "src"}',
      '```',
      'Then:',
      '```tool',
      '{"tool": "read_file", "path": "src/x.ts"}',
      '```',
    ].join('\n');
    expect(parseToolCalls(reply)).toHaveLength(2);
  });

  it('ignores unknown tools and prose without fences', () => {
    expect(parseToolCalls('just prose')).toEqual([]);
    expect(parseToolCalls('```tool\n{"tool": "nuke", "path": "/"}\n```')).toEqual([]);
  });

  it('surfaces malformed JSON instead of throwing', () => {
    const calls = parseToolCalls('```tool\n{not json\n```');
    expect(calls).toHaveLength(1);
    expect(calls[0].path?.startsWith('__malformed__:')).toBe(true);
  });
});

describe('resolveInRoot', () => {
  it('allows paths inside cwd', () => {
    const cwd = path.join(os.tmpdir(), 'maestro-test-root');
    expect(resolveInRoot(cwd, 'src/a.ts'))?.toBe(path.join(cwd, 'src/a.ts'));
    expect(resolveInRoot(cwd, '.'))?.toBe(cwd);
  });

  it('blocks directory escape', () => {
    const cwd = path.join(os.tmpdir(), 'maestro-test-root');
    expect(resolveInRoot(cwd, '../evil.ts')).toBeNull();
    expect(resolveInRoot(cwd, '/etc/passwd')).toBeNull();
  });
});

describe('executeToolCall', () => {
  let dir = '';
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-tools-'));
    fs.writeFileSync(path.join(dir, 'hello.txt'), 'old content', 'utf8');
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads, writes and edits files', () => {
    expect(executeToolCall(dir, { tool: 'read_file', path: 'hello.txt' })).toMatchObject({
      ok: true,
      output: 'old content',
    });
    expect(executeToolCall(dir, { tool: 'write_file', path: 'new.txt', content: 'hi' }).ok).toBe(
      true
    );
    expect(
      executeToolCall(dir, {
        tool: 'edit_file',
        path: 'hello.txt',
        old: 'old content',
        replacement: 'new content',
      }).ok
    ).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'hello.txt'), 'utf8')).toBe('new content');
  });

  it('fails cleanly on missing anchor and escaping paths', () => {
    expect(
      executeToolCall(dir, {
        tool: 'edit_file',
        path: 'hello.txt',
        old: 'nope',
        replacement: 'x',
      }).ok
    ).toBe(false);
    expect(executeToolCall(dir, { tool: 'read_file', path: '../evil' }).ok).toBe(false);
    expect(executeToolCall(dir, { tool: 'write_file', path: '../evil', content: 'x' }).ok).toBe(
      false
    );
  });

  it('lists directory entries', () => {
    const r = executeToolCall(dir, { tool: 'list_files', path: '.' });
    expect(r.ok).toBe(true);
    expect(r.output).toContain('hello.txt');
  });
});
