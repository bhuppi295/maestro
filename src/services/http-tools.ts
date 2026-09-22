// http-tools.ts — Minimal file-editing tool loop for HTTP-only providers
// (DeepSeek, GLM). CLI providers get tools from their own runtime; here
// Maestro executes a small JSON tool protocol against the workspace so API
// providers can run the full pipeline too.

import * as fs from 'fs';
import * as path from 'path';

export const MAX_TOOL_STEPS = 30;

type ToolName = 'read_file' | 'write_file' | 'edit_file' | 'list_files';

export interface ToolCall {
  tool: ToolName;
  path?: string;
  content?: string;
  old?: string;
  replacement?: string;
  pattern?: string;
}

export interface ToolResult {
  ok: boolean;
  output: string;
}

const TOOL_NAMES: ToolName[] = ['read_file', 'write_file', 'edit_file', 'list_files'];

/**
 * Extract ```tool {json} blocks from a model reply. Pure — tested.
 * Tolerates surrounding prose and multiple blocks per message.
 */
export function parseToolCalls(reply: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const fence = /```tool\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(reply)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim()) as Partial<ToolCall>;
      if (parsed && typeof parsed.tool === 'string' && TOOL_NAMES.includes(parsed.tool)) {
        calls.push(parsed as ToolCall);
      }
    } catch {
      // Malformed block — surface it so the model can self-correct.
      calls.push({ tool: 'read_file', path: `__malformed__:${match[1].trim().slice(0, 80)}` });
    }
  }
  return calls;
}

/** Resolve a tool path strictly inside cwd. Returns null on escape. Pure — tested. */
export function resolveInRoot(cwd: string, target: string): string | null {
  const resolved = path.resolve(cwd, target);
  const root = path.resolve(cwd) + path.sep;
  if (resolved === path.resolve(cwd) || resolved.startsWith(root)) return resolved;
  return null;
}

export function executeToolCall(cwd: string, call: ToolCall): ToolResult {
  switch (call.tool) {
    case 'read_file': {
      if (!call.path) return fail('read_file needs "path".');
      if (call.path.startsWith('__malformed__:')) {
        return fail(
          `Malformed tool block, not valid JSON: ${call.path.slice('__malformed__:'.length)}`
        );
      }
      const abs = resolveInRoot(cwd, call.path);
      if (!abs) return fail(`Path escapes workspace: ${call.path}`);
      try {
        const stat = fs.statSync(abs);
        if (stat.size > 200_000) return fail(`File too large (${stat.size} bytes), refusing.`);
        return { ok: true, output: fs.readFileSync(abs, 'utf8') };
      } catch (err) {
        return fail(`Cannot read ${call.path}: ${(err as Error).message}`);
      }
    }
    case 'write_file': {
      if (!call.path || call.content === undefined)
        return fail('write_file needs "path" and "content".');
      const abs = resolveInRoot(cwd, call.path);
      if (!abs) return fail(`Path escapes workspace: ${call.path}`);
      try {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, call.content, 'utf8');
        return { ok: true, output: `Wrote ${call.content.length} chars to ${call.path}` };
      } catch (err) {
        return fail(`Cannot write ${call.path}: ${(err as Error).message}`);
      }
    }
    case 'edit_file': {
      if (!call.path || call.old === undefined || call.replacement === undefined) {
        return fail('edit_file needs "path", "old" and "replacement".');
      }
      const abs = resolveInRoot(cwd, call.path);
      if (!abs) return fail(`Path escapes workspace: ${call.path}`);
      try {
        const current = fs.readFileSync(abs, 'utf8');
        if (!current.includes(call.old)) return fail(`"old" block not found in ${call.path}.`);
        fs.writeFileSync(abs, current.replace(call.old, call.replacement), 'utf8');
        return { ok: true, output: `Edited ${call.path}` };
      } catch (err) {
        return fail(`Cannot edit ${call.path}: ${(err as Error).message}`);
      }
    }
    case 'list_files': {
      const abs = resolveInRoot(cwd, call.path ?? '.');
      if (!abs) return fail(`Path escapes workspace: ${call.path}`);
      try {
        const entries = fs.readdirSync(abs, { withFileTypes: true }).slice(0, 100);
        const lines = entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
        const pattern = call.pattern;
        const filtered = pattern
          ? lines.filter((l) => l.toLowerCase().includes(pattern.toLowerCase()))
          : lines;
        return { ok: true, output: filtered.join('\n') || '(empty)' };
      } catch (err) {
        return fail(`Cannot list ${call.path ?? '.'}: ${(err as Error).message}`);
      }
    }
  }
}

function fail(output: string): ToolResult {
  return { ok: false, output };
}

export const EDIT_LOOP_SYSTEM = `You are a coding agent with file tools. Work inside the current directory only.

Call tools with fenced blocks like:
\`\`\`tool
{"tool": "read_file", "path": "src/index.ts"}
\`\`\`

Available tools:
- {"tool": "read_file", "path": "..."}
- {"tool": "write_file", "path": "...", "content": "..."}
- {"tool": "edit_file", "path": "...", "old": "exact block", "replacement": "new block"}
- {"tool": "list_files", "path": "dir", "pattern": "optional filter"}

Rules: one task per reply, then wait for tool results. Never invent file contents — read first. When finished, reply with prose only (no tool blocks) summarizing the change.`;
