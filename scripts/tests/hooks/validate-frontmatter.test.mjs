//
// Unit tests for validate-frontmatter.
// Run with: `node --test scripts/tests/hooks/validate-frontmatter.test.mjs`
// (or repo-wide: `pnpm test`)
//
// Each test writes a synthetic .md file to a unique tmpdir so the tests are
// hermetic and can run in parallel without collisions. We use os.tmpdir() +
// a process-unique suffix rather than mocking fs because the validator
// reads files via fs.readFileSync — easier to use real files than mock.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { validateFile } from '../../hooks/validate-frontmatter.mjs';
import { parseString, stringify } from '../../lib/frontmatter.mjs';

// Helper: write `content` to a fresh tmp file, return its absolute path.
// Files are placed under a per-test directory so they're easy to inspect on
// failure (the path is included in assertion messages by default).
function writeTmp(content, name = 'test.md') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kortex-fm-test-'));
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

test('missing title field fails', () => {
  // Frontmatter is well-formed YAML but lacks `title`. We expect at least one
  // error mentioning the missing field. We don't pin the exact wording — the
  // contract is "errors[*].text contains 'title'" so we can refine messages
  // without breaking tests.
  const md = `---
type: concept
layer: synthesis
language: en
tags: [foo]
updated: 2026-04-29
---

body
`;
  const f = writeTmp(md);
  const errors = validateFile(f, 'test.md');
  assert.ok(errors.some((e) => e.includes('title')), `expected title error, got: ${errors.join('; ')}`);
});

test('invalid type enum value fails', () => {
  // `type: foo` is not in the ENUMS list. The hook should flag the value
  // explicitly so the user knows what's wrong + what's allowed.
  const md = `---
title: "T"
type: foo
layer: synthesis
language: en
tags: [foo]
updated: 2026-04-29
---

body
`;
  const f = writeTmp(md);
  const errors = validateFile(f, 'test.md');
  assert.ok(
    errors.some((e) => e.includes('type') && e.includes('foo')),
    `expected enum error mentioning "type" and "foo", got: ${errors.join('; ')}`
  );
});

test('type: idea without target_channel fails', () => {
  // The base required fields are present, but `type: idea` triggers the
  // extra requirement set (status/angle/target_channel). Missing
  // target_channel should be reported; status + angle are also missing
  // here so we expect ALL three errors.
  const md = `---
title: "Idea title"
type: idea
layer: project
language: es
tags: [capa/3-proyecto]
updated: 2026-04-29
---

body
`;
  const f = writeTmp(md);
  const errors = validateFile(f, 'test.md');
  assert.ok(
    errors.some((e) => e.includes('target_channel')),
    `expected target_channel error, got: ${errors.join('; ')}`
  );
  assert.ok(
    errors.some((e) => e.includes('status')),
    `expected status error, got: ${errors.join('; ')}`
  );
  assert.ok(
    errors.some((e) => e.includes('angle')),
    `expected angle error, got: ${errors.join('; ')}`
  );
});

test('valid file with all required fields passes', () => {
  // Sanity: a fully-formed file MUST pass with zero errors. Without this
  // test, any change that accidentally requires an extra field would slip
  // past the other tests (which only assert specific error presence).
  const md = `---
title: "Valid Page"
type: concept
layer: synthesis
language: en
tags: [example, capa/2-wiki]
updated: 2026-04-29
---

body
`;
  const f = writeTmp(md);
  const errors = validateFile(f, 'test.md');
  assert.deepEqual(errors, [], `expected no errors, got: ${errors.join('; ')}`);
});

test('valid idea with all extra fields passes', () => {
  // Same sanity check for idea-type files. Status/angle/target_channel are
  // all present and use enum-valid values.
  const md = `---
title: "Idea X"
type: idea
layer: project
language: es
tags: [capa/3-proyecto]
updated: 2026-04-29
status: inbox
angle: "single-sentence angle"
target_channel: milo-ia
---

body
`;
  const f = writeTmp(md);
  const errors = validateFile(f, 'test.md');
  assert.deepEqual(errors, [], `expected no errors, got: ${errors.join('; ')}`);
});

test('gray-matter preserves body bytes round-trip', () => {
  // Parse → re-serialize must NOT mutate the body content. This is the
  // core safety property: hooks may rewrite frontmatter, but never the
  // body. Without this guarantee, every commit could subtly drift the
  // markdown body (trailing whitespace, line endings, etc).
  //
  // Note: we compare BODIES, not the full file. gray-matter normalizes the
  // frontmatter block on serialize (key ordering, comment loss) — that's
  // expected and acceptable.
  const body = '\nLine 1\nLine 2 with trailing spaces   \n\n# Heading\n\n- list\n  - nested\n\n```js\nconst x = 1;\n```\n';
  const md = `---
title: "T"
type: concept
layer: synthesis
language: en
tags: [foo]
updated: 2026-04-29
---
${body}`;
  const parsed = parseString(md);
  // Body in `parsed.content` should equal `body` minus the leading newline
  // that gray-matter strips (gray-matter normalizes the boundary newline).
  // The contract we test is: re-serialize produces a file whose body is
  // identical to the original body when split at the closing ---.
  const reconstructed = stringify(parsed.data, parsed.content);
  const reBody = reconstructed.split('---').slice(2).join('---');
  const origBody = md.split('---').slice(2).join('---');
  // Allow a single leading-newline difference (gray-matter strips and
  // re-emits a single `\n` after the closing `---`).
  assert.equal(reBody.replace(/^\n+/, ''), origBody.replace(/^\n+/, ''));
});

test('YAML comments are tolerated by parser', () => {
  // gray-matter loses YAML comments on round-trip — that's expected. What
  // we DO require is that comments don't make parsing FAIL. This test
  // catches regressions where someone swaps gray-matter for a stricter
  // YAML parser that rejects comments.
  const md = `---
# this is a comment
title: "T"
type: concept
layer: synthesis
language: en
tags: [foo]
updated: 2026-04-29
---

body
`;
  const f = writeTmp(md);
  const errors = validateFile(f, 'test.md');
  assert.deepEqual(errors, [], `expected no errors, got: ${errors.join('; ')}`);
});
