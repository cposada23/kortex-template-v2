// scope: framework
//
// Unit tests for update-backrefs's rewriteBacklinks.
// Run with: `node --test scripts/tests/hooks/update-backrefs.test.mjs`
// (or repo-wide: `pnpm test`)
//
// Focus: the marker-detection path. The earlier implementation used
// `indexOf` and treated the first textual occurrence of the marker as the
// auto-block — including occurrences inside inline-code spans in docs that
// describe the hook itself. That corrupted real files (see commit 49ef4d5
// on .claude/commands/sync-to-template.md). The fix requires line-anchored
// matching and prefers the LAST hit, so prose mentions are ignored.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rewriteBacklinks } from '../../hooks/update-backrefs.mjs';

test('inline-code mention of markers is not treated as an auto-block', () => {
  // A doc describing the hook will reference the literal marker strings in
  // inline code. Those mentions are preceded by a backtick on the same line,
  // so they must not be picked up as the block start.
  const content = `# How update-backrefs works

The hook delimits its section with \`<!-- backrefs:start -->\` and
\`<!-- backrefs:end -->\` HTML comments.
`;
  // No referrers and no real backlinks block → content must be returned
  // verbatim. The pre-fix behavior would have spliced an empty block
  // mid-document because indexOf hit the inline-code marker.
  const out = rewriteBacklinks(content, [], 'docs/how-it-works.md');
  assert.equal(out, content);
});

test('inline-code mention coexists with a real block at the bottom', () => {
  // Mixed case: the doc explains the markers AND has a genuine auto-block
  // at the end. The rewriter must update the real block at the bottom and
  // leave the prose mention alone.
  const before = `# Doc

Markers look like \`<!-- backrefs:start -->\` and \`<!-- backrefs:end -->\`.

## Backlinks
<!-- backrefs:start -->
- [old](old.md)
<!-- backrefs:end -->
`;
  const after = rewriteBacklinks(before, ['wiki/new.md'], 'docs/doc.md');

  // The inline-code mentions must be untouched.
  assert.ok(
    after.includes('Markers look like `<!-- backrefs:start -->` and `<!-- backrefs:end -->`.'),
    'prose mention of markers must survive untouched',
  );
  // The real block must now reference the new referrer, not the old one.
  assert.ok(after.includes('](../wiki/new.md)'), 'new referrer link missing');
  assert.ok(!after.includes('](old.md)'), 'old referrer link should be gone');
  // Exactly one ## Backlinks heading.
  const headings = after.match(/^##\s+Backlinks\s*$/gm) || [];
  assert.equal(headings.length, 1, 'expected exactly one ## Backlinks heading');
});

test('regression: a normal page with one auto-block still updates in place', () => {
  // Sanity check the line-anchored helper doesn't regress the common case.
  const before = `---
title: Foo
---

# Foo

Body text.

## Backlinks
<!-- backrefs:start -->
- [bar](bar.md)
<!-- backrefs:end -->
`;
  const after = rewriteBacklinks(before, ['baz.md'], 'foo.md');
  assert.ok(after.includes('](baz.md)'));
  assert.ok(!after.includes('](bar.md)'));
  // Body text untouched.
  assert.ok(after.includes('Body text.'));
});

test('no referrers + no existing block + prose markers → no-op', () => {
  // Same shape as the first test but more explicit: confirms we don't
  // append a new section just because the markers appeared in prose.
  const content = `Some doc that mentions <!-- backrefs:start --> in prose.\n`;
  // The marker happens to be at the start of a line here. With the
  // last-line-anchored fix, lastLineStartIndexOf still finds it — but
  // BLOCK_END isn't present, so the rewriter falls through to Case 2
  // (no heading) and Case 3 (no referrers → no-op). End state: unchanged.
  const out = rewriteBacklinks(content, [], 'docs/x.md');
  assert.equal(out, content);
});
