import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hasAnalyzeErrors } from './analyze.service';

const flutter = 'flutter analyze';
const dart = 'dart analyze';

describe('hasAnalyzeErrors (flutter/dart)', () => {
  it('fails on a real analyzer `error •` diagnostic line', () => {
    const output = [
      'Analyzing myapp...',
      "  error • Undefined name 'foo' • lib/main.dart:10:3 • undefined_identifier",
    ].join('\n');
    assert.equal(hasAnalyzeErrors(flutter, output), true);
    assert.equal(hasAnalyzeErrors(dart, output), true);
  });

  it('passes on clean "No issues found" output', () => {
    const output = 'Analyzing myapp...\nNo issues found!';
    assert.equal(hasAnalyzeErrors(flutter, output), false);
  });

  it('does not fail when a path merely contains the substring "error"', () => {
    // Before the fix, `&&` bound tighter than `||`:
    //   includes('error •') || (!includes('No issues found') && includes('error'))
    // so this info-only output was a false-positive failure.
    const output = [
      'Analyzing myapp...',
      '   info • Unused import • lib/error_handler.dart:1:8 • unused_import',
    ].join('\n');
    assert.equal(hasAnalyzeErrors(flutter, output), false);
    assert.equal(hasAnalyzeErrors(dart, output), false);
  });

  it('fails when the analyzer summary reports a non-zero error count', () => {
    const output = '2 issues found. (1 error, 1 warning).';
    assert.equal(hasAnalyzeErrors(flutter, output), true);
  });

  it('passes when only warnings/info are present (zero errors)', () => {
    const output = [
      '   info • Unused import • lib/foo.dart:1:8 • unused_import',
      'warning • Dead code • lib/foo.dart:4:3 • dead_code',
      '2 issues found. (0 errors, 2 warnings).',
    ].join('\n');
    assert.equal(hasAnalyzeErrors(flutter, output), false);
  });
});
