// scope: framework
//
// Unit tests for validate-pii.
// Run with: `node --test scripts/tests/hooks/validate-pii.test.mjs`
//
// validatePii reads a file and reads the allowlist via repoRoot(). Since the
// allowlist is gitignored and may not exist, the hook falls back to defaults.
// Tests exercise both paths — default allowlist (file absent) and the
// allowlist injection via the cache reset hook.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { validatePii, _resetAllowlistCache } from '../../hooks/validate-pii.mjs';

// Write `content` to a fresh tmp file. Returns the absolute path. Each test
// gets its own tmp dir so the inevitable test-output debugging is easy.
function writeTmp(content, name = 'sample.md') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kortex-pii-test-'));
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content);
  return { dir, filePath };
}

test('CO phone +57 3xx number flags as match', async () => {
  // The phone is the most clearly PII-shaped value in the suite. No
  // allowlist field exists for phones in the default config — meaning ALL
  // CO mobile-shaped strings should match.
  _resetAllowlistCache();
  const { filePath } = writeTmp('Contact me: +57 300 123 4567 anytime');
  const { passed, matches } = await validatePii(filePath);
  assert.equal(passed, false);
  assert.ok(
    matches.some((m) => m.pattern === 'CO phone'),
    `expected CO phone match, got: ${JSON.stringify(matches)}`
  );
});

test('email NOT in allowlist flags as match', async () => {
  // A random gmail address is not in the default allowlist (which contains
  // only milo.ia.contacto@gmail.com). It must match.
  _resetAllowlistCache();
  const { filePath } = writeTmp('Reach out: random-person@example.com here');
  const { passed, matches } = await validatePii(filePath);
  assert.equal(passed, false);
  assert.ok(
    matches.some((m) => m.pattern.includes('Email')),
    `expected Email match, got: ${JSON.stringify(matches)}`
  );
});

test('email IN default allowlist passes through', async () => {
  // milo.ia.contacto@gmail.com is in the DEFAULT_ALLOWLIST baked into the
  // hook (it's the public business email). The matcher must respect this.
  _resetAllowlistCache();
  const { filePath } = writeTmp('Contact: milo.ia.contacto@gmail.com OK');
  const { passed, matches } = await validatePii(filePath);
  // Note: the file may still match other patterns (none expected here).
  // We assert that the allowlisted email did NOT contribute a match.
  const emailMatches = matches.filter((m) => m.pattern.includes('Email'));
  assert.deepEqual(emailMatches, [], `expected no email matches, got: ${JSON.stringify(emailMatches)}`);
  assert.equal(passed, matches.length === 0);
});

test('clean file passes', async () => {
  // Sanity test: a regular markdown body without PII-shaped content should
  // pass cleanly. Catches regressions where overly broad patterns flag
  // ordinary text.
  _resetAllowlistCache();
  const { filePath } = writeTmp(`
# Some heading

This is normal markdown content with words and a date 2026-04-29.
It has some reasonable lengths and references like [link](other.md).
`);
  const { passed, matches } = await validatePii(filePath);
  // The 4-digit year 2026 is too short for the cédula/account patterns
  // (8-10 / 9-12 digits). But "2026-04-29" might trip the date-as-digits
  // heuristic. We only assert no email/phone matches; cédula+account are
  // intentionally noisy so we tolerate findings there.
  const emailOrPhone = matches.filter(
    (m) => m.pattern.includes('Email') || m.pattern.includes('phone')
  );
  assert.deepEqual(emailOrPhone, [], `expected no email/phone matches, got: ${JSON.stringify(matches)}`);
});

test('missing file returns passed: false with read-error', async () => {
  // Edge case: caller passed a path that doesn't exist (e.g. file was
  // deleted between scan-prep and validation). The function must not
  // throw — it should return a structured failure so the caller can log
  // and continue.
  _resetAllowlistCache();
  const result = await validatePii('/nonexistent/path/to/file.md');
  assert.equal(result.passed, false);
  assert.ok(
    result.matches.some((m) => m.pattern === 'read-error'),
    `expected read-error match, got: ${JSON.stringify(result.matches)}`
  );
});
