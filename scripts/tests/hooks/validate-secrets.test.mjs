//
// Unit tests for validate-secrets.
// Run with: `node --test scripts/tests/hooks/validate-secrets.test.mjs`
//
// We test scanAddedLines() directly with synthetic "added line" text rather
// than going through git, because:
//   1. It isolates the matching logic from the git plumbing (which has its
//      own coverage in lib/git.mjs).
//   2. We can easily build adversarial inputs (a real-shaped key + a
//      placeholder + a regex literal in the same payload) without juggling
//      a fake git index.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanAddedLines } from '../../hooks/validate-secrets.mjs';

test('real OpenAI sk-proj key triggers a finding', () => {
  // 40-char alnum suffix matches the canonical OpenAI sk-proj pattern.
  // We include surrounding noise (an `OPENAI_API_KEY=` prefix) so the line
  // looks like a genuine config line — that's the attack surface.
  const added = 'OPENAI_API_KEY=sk-proj-a1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuVwXyZaBcDeFg';
  const findings = scanAddedLines(added);
  assert.ok(
    findings.some((f) => f.kind.includes('OpenAI')),
    `expected OpenAI finding, got: ${JSON.stringify(findings)}`
  );
});

test('placeholder "your-key-here" passes through', () => {
  // Documented placeholder must not trigger. This is the most common
  // false-positive vector — `.env.example` files routinely use this string.
  const added = 'OPENAI_API_KEY=your-key-here';
  const findings = scanAddedLines(added);
  assert.deepEqual(findings, [], `expected no findings, got: ${JSON.stringify(findings)}`);
});

test('placeholder with x-padded suffix passes through', () => {
  // `sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` is doc shorthand for "your
  // key here". The hook must not block on this.
  const added = 'OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  const findings = scanAddedLines(added);
  assert.deepEqual(findings, [], `expected no findings, got: ${JSON.stringify(findings)}`);
});

test('regex literal documenting the pattern passes through', () => {
  // Hook source code itself documents these patterns. A regex literal
  // mentioning `sk-proj-...` would otherwise self-match. The doc heuristic
  // detects "regex:" / "pattern" / backticks / regex literal context and
  // exempts the match.
  const added = '  { name: "OpenAI", regex: /sk-proj-[A-Za-z0-9_-]{40,}/g },';
  const findings = scanAddedLines(added);
  // The string is documenting the pattern — but it doesn't actually contain
  // a real-shaped key (the body is `{40,}`, a quantifier, not 40 chars of
  // payload). So this should NOT flag at all. Test asserts that.
  assert.deepEqual(findings, [], `expected no findings, got: ${JSON.stringify(findings)}`);
});

test('Firecrawl key (NEW v2 pattern) triggers a finding', () => {
  // 32-char hex after the `fc-` prefix is the canonical Firecrawl shape.
  // The whole point of adding this pattern in v2 was to cover Firecrawl
  // keys — regression test ensures we don't accidentally drop it later.
  const added = 'FIRECRAWL_API_KEY=fc-1234567890abcdef1234567890abcdef';
  const findings = scanAddedLines(added);
  assert.ok(
    findings.some((f) => f.kind.includes('Firecrawl')),
    `expected Firecrawl finding, got: ${JSON.stringify(findings)}`
  );
});

test('OpenRouter key triggers a finding', () => {
  // 64-char hex after `sk-or-v1-`. Sanity-check that v2 didn't break the
  // existing OpenRouter detection while adding Firecrawl.
  const added =
    'OPENROUTER_API_KEY=sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const findings = scanAddedLines(added);
  assert.ok(
    findings.some((f) => f.kind.includes('OpenRouter')),
    `expected OpenRouter finding, got: ${JSON.stringify(findings)}`
  );
});

test('multiple secrets on different lines all flagged', () => {
  // Combined real-world case: a careless commit leaks both OpenAI and
  // Anthropic in the same chunk. Both should surface.
  const added = [
    'OPENAI_API_KEY=sk-proj-a1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuVwXyZaBcDeFg',
    'ANTHROPIC_API_KEY=sk-ant-api03-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789',
  ].join('\n');
  const findings = scanAddedLines(added);
  assert.ok(findings.some((f) => f.kind.includes('OpenAI')));
  assert.ok(findings.some((f) => f.kind.includes('Anthropic')));
});

test('empty input yields zero findings', () => {
  // Edge case: empty diff (file staged but no added lines, e.g. mode-only
  // change). No matches expected.
  assert.deepEqual(scanAddedLines(''), []);
  assert.deepEqual(scanAddedLines(null), []);
});
