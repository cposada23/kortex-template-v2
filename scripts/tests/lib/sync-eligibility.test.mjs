// scope: framework
// Tests for scripts/lib/sync-eligibility.mjs
//
// Covers the eligibility matrix:
//   - .md outside .claude/        → mirror: framework | both
//   - .md inside .claude/          → scope: framework
//   - .mjs / .js / .ts / .py / .sh → top-of-file `scope: framework` comment
//   - .claude/templates/*          → framework by convention

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEligibility } from '../../lib/sync-eligibility.mjs';

// Helper: shape of a parseFile result the eligibility check expects.
function parsed(data, raw = '') {
  return { data, content: '', hasFrontmatter: !!Object.keys(data).length, raw };
}

// =====================================================================
// .md outside .claude/
// =====================================================================

test('eligibility: wiki/.md with mirror: framework is eligible', () => {
  const r = checkEligibility('wiki/concepts/foo.md', parsed({ mirror: 'framework' }));
  assert.equal(r.eligible, true);
});

test('eligibility: wiki/.md with mirror: both is eligible', () => {
  const r = checkEligibility('wiki/concepts/foo.md', parsed({ mirror: 'both' }));
  assert.equal(r.eligible, true);
});

test('eligibility: wiki/.md with mirror: personal is NOT eligible', () => {
  const r = checkEligibility('wiki/concepts/foo.md', parsed({ mirror: 'personal' }));
  assert.equal(r.eligible, false);
});

test('eligibility: wiki/.md with no mirror field defaults to NOT eligible', () => {
  const r = checkEligibility('wiki/concepts/foo.md', parsed({}));
  assert.equal(r.eligible, false);
});

// =====================================================================
// .md inside .claude/
// =====================================================================

test('eligibility: .claude/commands/.md with scope: framework is eligible', () => {
  const r = checkEligibility('.claude/commands/foo.md', parsed({ scope: 'framework' }));
  assert.equal(r.eligible, true);
});

test('eligibility: .claude/rules/.md with scope: personal is NOT eligible', () => {
  const r = checkEligibility('.claude/rules/foo.md', parsed({ scope: 'personal' }));
  assert.equal(r.eligible, false);
});

test('eligibility: .claude/.md falls back to mirror field too', () => {
  // Back-compat: if a file inside .claude/ uses mirror: framework instead
  // of scope: framework, accept it. Migration period.
  const r = checkEligibility('.claude/commands/foo.md', parsed({ mirror: 'framework' }));
  assert.equal(r.eligible, true);
});

// =====================================================================
// Code files
// =====================================================================

test('eligibility: .mjs with `// scope: framework` comment is eligible', () => {
  const code = [
    '#!/usr/bin/env node',
    '// scope: framework',
    '',
    'export function foo() {}',
  ].join('\n');
  const r = checkEligibility('scripts/commands/foo.mjs', parsed({}, code));
  assert.equal(r.eligible, true);
});

test('eligibility: .py with `# scope: framework` comment is eligible', () => {
  const code = [
    '#!/usr/bin/env python3',
    '# scope: framework',
    '',
    'def foo(): pass',
  ].join('\n');
  const r = checkEligibility('scripts/foo.py', parsed({}, code));
  assert.equal(r.eligible, true);
});

test('eligibility: .mjs with no scope comment is NOT eligible', () => {
  const code = 'export function foo() {}';
  const r = checkEligibility('scripts/commands/foo.mjs', parsed({}, code));
  assert.equal(r.eligible, false);
});

test('eligibility: .mjs with `scope: framework-private` is NOT a match', () => {
  // The regex anchors on framework end-of-line. "framework-private" or
  // "framework-only" should NOT pass.
  const code = '// scope: framework-private\n';
  const r = checkEligibility('scripts/foo.mjs', parsed({}, code));
  assert.equal(r.eligible, false);
});

test('eligibility: .ts with scope:framework comment is eligible', () => {
  const code = '// scope: framework\nexport const x = 1;';
  const r = checkEligibility('scripts/foo.ts', parsed({}, code));
  assert.equal(r.eligible, true);
});

test('eligibility: code scope must be in the first 30 lines', () => {
  // 50 lines of fluff, then the scope declaration. Should not match.
  const lines = Array(50).fill('// filler').concat(['// scope: framework']);
  const r = checkEligibility('scripts/foo.mjs', parsed({}, lines.join('\n')));
  assert.equal(r.eligible, false, 'declaration past line 30 should not count');
});

// =====================================================================
// .claude/templates/
// =====================================================================

test('eligibility: .claude/templates/ files are framework regardless of frontmatter', () => {
  // The template body is the FRONTMATTER OF THE FUTURE FILE, not metadata
  // about the template. We must not read it for eligibility.
  const r = checkEligibility('.claude/templates/concept.md', parsed({ mirror: 'personal' }));
  assert.equal(r.eligible, true);
  assert.match(r.reason, /templates\//);
});

// =====================================================================
// Unsupported extensions
// =====================================================================

test('eligibility: .json files are not eligible', () => {
  const r = checkEligibility('scripts/foo.json', parsed({}, '{}'));
  assert.equal(r.eligible, false);
});

test('eligibility: dotfiles are not eligible', () => {
  const r = checkEligibility('.gitignore', parsed({}, '*.tmp'));
  assert.equal(r.eligible, false);
});
