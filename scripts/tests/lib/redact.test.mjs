// scope: framework
// Tests for scripts/lib/redact.mjs
//
// The redactor is a pure transform. We hit each of the 5 mechanisms
// in isolation, plus a few interactions (literal + regex on the same
// text, backref filter respecting the sync set).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact, resolveRelative, buildPrivateProjectsRule } from '../../lib/redact.mjs';

// =====================================================================
// 1. Strip blocks
// =====================================================================

test('redact: strip-block markers remove the wrapped section', () => {
  const input = [
    '# Title',
    '',
    'Public prose.',
    '',
    '<!-- mirror:strip -->',
    '## Owner-only',
    'Hello Camilo.',
    '<!-- /mirror:strip -->',
    '',
    'More public prose.',
  ].join('\n');
  const { content, hits } = redact(input, {});
  assert.equal(hits.strip_blocks, 1);
  assert.match(content, /Public prose\./);
  assert.match(content, /More public prose\./);
  assert.doesNotMatch(content, /Owner-only/);
  assert.doesNotMatch(content, /Hello Camilo/);
});

test('redact: multiple strip-blocks all removed', () => {
  const input = '<!-- mirror:strip -->A<!-- /mirror:strip -->\nmiddle\n<!-- mirror:strip -->B<!-- /mirror:strip -->';
  const { content, hits } = redact(input, {});
  assert.equal(hits.strip_blocks, 2);
  assert.match(content, /middle/);
  assert.doesNotMatch(content, /A|B(?!ackref)/);
});

// =====================================================================
// 2. Literal substitutions
// =====================================================================

test('redact: literal substitutions replace every occurrence', () => {
  const input = 'Hello Camilo. Camilo is the owner. Goodbye Camilo.';
  const { content, hits } = redact(input, {
    literal: [['Camilo', '{{owner_name}}']],
  });
  assert.equal(hits.literal, 3);
  assert.equal(content, 'Hello {{owner_name}}. {{owner_name}} is the owner. Goodbye {{owner_name}}.');
});

test('redact: literal substitutions respect declaration order (longer first)', () => {
  // "Camilo Posada" must run before "Camilo" so the longer form wins.
  const input = 'I am Camilo Posada. I am Camilo.';
  const { content } = redact(input, {
    literal: [
      ['Camilo Posada', '{{owner_full_name}}'],
      ['Camilo', '{{owner_name}}'],
    ],
  });
  assert.equal(content, 'I am {{owner_full_name}}. I am {{owner_name}}.');
});

// =====================================================================
// 3. Regex substitutions
// =====================================================================

test('redact: regex substitutions match across multiple lines', () => {
  const input = [
    'Primary channel: **personal**',
    'Default response language: **es**',
    'Other: **personal** is fine here',
  ].join('\n');
  const { content } = redact(input, {
    regex: [
      ['^(Primary channel: \\*\\*)[^*]+(\\*\\*)$', '$1{{primary_channel}}$2'],
      ['^(Default response language: \\*\\*)[^*]+(\\*\\*)$', '$1{{default_language}}$2'],
    ],
  });
  // Regex flag handling: anchored regex + g mode means we only catch
  // line-starts, not arbitrary "personal" mentions.
  assert.match(content, /Primary channel: \*\*\{\{primary_channel\}\}\*\*/);
  assert.match(content, /Default response language: \*\*\{\{default_language\}\}\*\*/);
  assert.match(content, /Other: \*\*personal\*\* is fine here/);
});

// =====================================================================
// 4. Smart backref filter
// =====================================================================

test('redact: backref filter drops bullets pointing outside sync set', () => {
  const input = [
    '# Title',
    '',
    '## Backlinks',
    '<!-- backrefs:start -->',
    '- [public](public.md)',
    '- [private](projects/milo-ia/AGENTS.md)',
    '- [also-public](wiki/areas/foo.md)',
    '<!-- backrefs:end -->',
  ].join('\n');
  const syncSet = new Set(['public.md', 'wiki/areas/foo.md', 'AGENTS.md']);
  const { content, hits } = redact(input, {
    syncSet,
    fromPath: 'AGENTS.md',
  });
  assert.equal(hits.backrefs_dropped, 1);
  assert.match(content, /\[public\]/);
  assert.match(content, /\[also-public\]/);
  assert.doesNotMatch(content, /\[private\]/);
});

test('redact: backref filter leaves non-bullet lines alone', () => {
  // The backref block can contain comments, blank lines, etc. We must
  // not drop them — only filter bullets.
  const input = [
    '<!-- backrefs:start -->',
    '<!-- comment in middle -->',
    '',
    '- [keeper](keeper.md)',
    '<!-- backrefs:end -->',
  ].join('\n');
  const syncSet = new Set(['keeper.md', 'src.md']);
  const { content } = redact(input, { syncSet, fromPath: 'src.md' });
  assert.match(content, /<!-- comment in middle -->/);
  assert.match(content, /\[keeper\]/);
});

// =====================================================================
// 5. External link demotion
// =====================================================================

test('redact: link demotion drops [text](target) when target is outside sync set', () => {
  const input = [
    '# Title',
    '',
    'See [the spec](spec.md) and [private notes](notes/private.md) for details.',
    '',
    'External: [website](https://example.com) and anchor [intro](#intro).',
  ].join('\n');
  const syncSet = new Set(['src.md', 'spec.md']);
  const { content, hits } = redact(input, { syncSet, fromPath: 'src.md' });
  assert.equal(hits.links_demoted, 1);
  assert.match(content, /\[the spec\]\(spec\.md\)/);            // keep — in syncSet
  assert.match(content, /private notes for details/);            // demoted — text preserved
  assert.doesNotMatch(content, /\[private notes\]/);             // link gone
  assert.match(content, /\[website\]\(https:\/\/example\.com\)/); // keep — external
  assert.match(content, /\[intro\]\(#intro\)/);                  // keep — anchor
});

test('redact: link demotion ignores links inside fenced code blocks', () => {
  const input = [
    'Real link [foo](foo.md).',
    '',
    '```',
    'Code link: [bar](bar.md)',
    '```',
    '',
    'Another [baz](baz.md).',
  ].join('\n');
  const syncSet = new Set(['src.md']);                            // none of foo/bar/baz are in syncSet
  const { content, hits } = redact(input, { syncSet, fromPath: 'src.md' });
  assert.equal(hits.links_demoted, 2, 'only the two non-fenced links should be demoted');
  // The link inside the fence survives verbatim.
  assert.match(content, /Code link: \[bar\]\(bar\.md\)/);
});

// =====================================================================
// 6. Drop-line patterns
// =====================================================================

test('redact: drop-line patterns remove full-line matches only', () => {
  const input = [
    '- [keep](keep.md)',
    '- [drop](projects/private/AGENTS.md)',
    'projects/private/AGENTS.md is mentioned in prose',
  ].join('\n');
  const { content, hits } = redact(input, {
    dropLines: ['- \\[drop\\]\\(projects/private/AGENTS\\.md\\)'],
  });
  assert.equal(hits.drop_lines, 1);
  assert.match(content, /\[keep\]/);
  assert.doesNotMatch(content, /\[drop\]/);
  // The prose mention survives because it's not a full-line match.
  assert.match(content, /is mentioned in prose/);
});

// =====================================================================
// 6. resolveRelative helper
// =====================================================================

test('resolveRelative: handles ../ and dot segments', () => {
  assert.equal(resolveRelative('AGENTS.md', 'README.md'), 'README.md');
  assert.equal(resolveRelative('wiki/INDEX.md', '../README.md'), 'README.md');
  assert.equal(resolveRelative('wiki/INDEX.md', './concepts/foo.md'), 'wiki/concepts/foo.md');
  assert.equal(resolveRelative('a/b/c.md', '../../d.md'), 'd.md');
  assert.equal(resolveRelative('a/b.md', 'b.md#anchor'), 'a/b.md');
});

// =====================================================================
// 7. buildPrivateProjectsRule
// =====================================================================

test('buildPrivateProjectsRule: regex catches projects/<name>/ paths', () => {
  const rule = buildPrivateProjectsRule(['milo-ia', 'kortex-lab']);
  assert.ok(rule, 'returns a rule when given names');
  const [pattern, replacement] = rule;
  const input = 'See projects/milo-ia/foo.md and projects/kortex-lab/bar.md and projects/example-project/baz.md';
  const out = input.replace(pattern, replacement);
  assert.match(out, /projects\/example-project\/foo\.md/);
  assert.match(out, /projects\/example-project\/bar\.md/);
  assert.match(out, /projects\/example-project\/baz\.md/);   // already example
});

test('buildPrivateProjectsRule: does not half-rename projects/milo-ia-something', () => {
  const rule = buildPrivateProjectsRule(['milo-ia']);
  const [pattern, replacement] = rule;
  // The negative lookahead in the rule should reject this — if it
  // matched, "projects/milo-ia-something" would become "projects/example-project-something".
  const input = 'projects/milo-ia-something/foo.md';
  const out = input.replace(pattern, replacement);
  assert.equal(out, 'projects/milo-ia-something/foo.md', 'should not partial-match');
});

test('buildPrivateProjectsRule: returns null for empty names list', () => {
  assert.equal(buildPrivateProjectsRule([]), null);
  assert.equal(buildPrivateProjectsRule(null), null);
});

// =====================================================================
// 8. fileType: 'code' skips markdown-only mechanisms
// =====================================================================

test('redact: fileType=code does not strip mirror:strip blocks', () => {
  // Source code may contain literal strings that look like strip markers
  // (e.g. test fixtures, generated docs). When redacting code we must
  // leave them alone.
  const input = "const marker = '<!-- mirror:strip -->';\nfunction body() { return marker; }\n// <!-- /mirror:strip -->\n";
  const { content, hits } = redact(input, { fileType: 'code' });
  assert.equal(hits.strip_blocks, 0);
  assert.match(content, /mirror:strip/);
});

test('redact: fileType=code does not demote markdown link patterns inside source', () => {
  // The classic bug: an .mjs file like update-backrefs.mjs contains a
  // template literal `\`- [\${display}\](\${rel})\`` which matches the
  // markdown link regex. Demoting it would corrupt the function.
  const input = "function format(display, rel) { return `- [${display}](${rel})`; }\n";
  const syncSet = new Set(['some.md']);
  const { content, hits } = redact(input, {
    syncSet,
    fromPath: 'scripts/foo.mjs',
    fileType: 'code',
  });
  assert.equal(hits.links_demoted, 0);
  assert.match(content, /\[\$\{display\}\]\(\$\{rel\}\)/);
});

test('redact: fileType=code still applies literal substitutions', () => {
  // Code redaction is opt-in for the meaningful work — substituting
  // literal owner identifiers in comments and strings.
  const input = "// Owner: Camilo\nconst email = 'cposadaa@gmail.com';\n";
  const { content, hits } = redact(input, {
    literal: [['Camilo', '{{owner_name}}'], ['cposadaa@gmail.com', '{{owner_email}}']],
    fileType: 'code',
  });
  assert.equal(hits.literal, 2);
  assert.match(content, /\{\{owner_name\}\}/);
  assert.match(content, /\{\{owner_email\}\}/);
});

test('redact: fileType=md (default) applies all mechanisms', () => {
  const input = "<!-- mirror:strip -->secret<!-- /mirror:strip -->\n[link](nowhere.md)\n";
  const { hits } = redact(input, {
    syncSet: new Set(['src.md']),
    fromPath: 'src.md',
  });
  assert.equal(hits.strip_blocks, 1);
  assert.equal(hits.links_demoted, 1);
});

// =====================================================================
// 9. Integration: real-world AGENTS.md leak scenario
// =====================================================================

test('redact: end-to-end scrubbing of an AGENTS.md-shaped input', () => {
  const input = [
    '---',
    'mirror: framework',
    '---',
    '',
    '# Kortex — Agent Context',
    '',
    'Hello Camilo — this is your Kortex instance.',
    'Primary channel: **personal**.',
    'Default response language: **es**.',
    '',
    'See projects/milo-ia/README.md for an example.',
    '',
    '<!-- mirror:strip -->',
    '## Owner-specific context',
    'Camilo is the owner. Email: cposadaa@gmail.com.',
    '<!-- /mirror:strip -->',
    '',
    '## Backlinks',
    '<!-- backrefs:start -->',
    '- [README](README.md)',
    '- [AGENTS](projects/milo-ia/AGENTS.md)',
    '- [AGENTS](projects/example-project/AGENTS.md)',
    '<!-- backrefs:end -->',
  ].join('\n');

  const syncSet = new Set([
    'AGENTS.md',
    'README.md',
    'projects/example-project/AGENTS.md',
  ]);

  const { content, hits } = redact(input, {
    literal: [
      ['cposadaa@gmail.com', '{{owner_email}}'],
      ['Camilo', '{{owner_name}}'],
    ],
    regex: [
      ['^(Primary channel: \\*\\*)[^*]+(\\*\\*)\\.$', '$1{{primary_channel}}$2.'],
      ['^(Default response language: \\*\\*)[^*]+(\\*\\*)\\.$', '$1{{default_language}}$2.'],
    ],
    syncSet,
    fromPath: 'AGENTS.md',
  });

  assert.equal(hits.strip_blocks, 1, 'one strip block removed');
  assert.ok(hits.literal >= 1, 'at least one literal hit (Camilo before strip-block was already stripped)');
  assert.equal(hits.backrefs_dropped, 1, 'private project backref removed');

  assert.doesNotMatch(content, /Owner-specific context/);
  assert.doesNotMatch(content, /cposadaa/);
  assert.match(content, /Hello \{\{owner_name\}\}/);
  assert.match(content, /Primary channel: \*\*\{\{primary_channel\}\}\*\*/);
  assert.match(content, /Default response language: \*\*\{\{default_language\}\}\*\*/);
  assert.doesNotMatch(content, /\[AGENTS\]\(projects\/milo-ia\/AGENTS\.md\)/);
  assert.match(content, /\[AGENTS\]\(projects\/example-project\/AGENTS\.md\)/);
});
