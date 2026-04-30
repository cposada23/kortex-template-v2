// scope: framework
// Frontmatter parsing wrapper around `gray-matter`.
//
// Why a wrapper:
//   - Centralizes the choice of YAML parser so we can swap it later without
//     touching every hook.
//   - gray-matter preserves body bytes (per principle M§1.4 #6 — body is
//     never re-encoded), which is exactly the property we need: round-tripping
//     a parse → serialize cycle on a file that was NOT modified must produce
//     byte-identical output. We test this property in the unit suite.
//   - Handles the "no frontmatter at all" case so callers get a uniform shape
//     instead of two branches.

import matter from 'gray-matter';
import fs from 'node:fs';

// Parse a markdown file's frontmatter. Returns `{ data, content, hasFrontmatter, raw }`:
//   - data:            parsed YAML object (may be empty {} if missing or malformed)
//   - content:         the body (everything after the closing ---), unmodified
//   - hasFrontmatter:  true only if the file actually started with --- + a valid block
//   - raw:             original file contents (for byte-preservation checks)
//
// We deliberately don't throw on malformed YAML — hooks need to *report* the
// problem, not crash. Caller decides whether to block.
export function parseFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return parseString(raw);
}

// Same as parseFile but operates on an in-memory string. Used by tests so
// they don't have to write to /tmp.
export function parseString(raw) {
  // gray-matter accepts a string and returns { data, content, ... }.
  // It returns { data: {}, content: raw } when no frontmatter is present.
  const hasFrontmatter = raw.startsWith('---');
  let parsed;
  try {
    parsed = matter(raw);
  } catch (e) {
    // Malformed YAML — return an empty parse so the hook can still report the
    // file. We surface the error message via a `parseError` field so the hook
    // can show it to the user without re-parsing.
    return {
      data: {},
      content: raw,
      hasFrontmatter,
      raw,
      parseError: e.message,
    };
  }
  return {
    data: parsed.data || {},
    content: parsed.content,
    hasFrontmatter: hasFrontmatter && Object.keys(parsed.data || {}).length > 0,
    raw,
  };
}

// Round-trip safety check used by tests: serialize a parsed frontmatter back
// to a string. gray-matter.stringify rebuilds the YAML from `data`, so it
// will NOT preserve YAML comments or key ordering — but it WILL preserve the
// body bytes verbatim. That's the contract we care about: no hook ever
// rewrites markdown body content.
export function stringify(data, content) {
  return matter.stringify(content, data);
}
