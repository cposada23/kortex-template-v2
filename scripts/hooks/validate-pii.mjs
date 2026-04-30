#!/usr/bin/env node
// scope: framework
//
// PII validator — invoked ONLY by `/sync-to-template`, never by pre-commit.
//
// Why not pre-commit:
//   The owner's personal Kortex repo (`mykortex`) is private and may legally
//   contain PII (their own phone, email, names, medical notes if it's their
//   journal). Pre-commit-blocking PII would prevent legitimate captures and
//   make capture friction-heavy. Instead PII validation runs at the publish
//   boundary — the moment content leaves the personal repo for the public
//   template. That's where the threat model actually changes.
//
// Public surface:
//   `validatePii(filepath) -> { passed, matches }`
//   Called per-file from sync-to-template. Returns a structured report so
//   the caller can decide blocking, prompting the user, or bulk-redacting.
//
// Allowlist:
//   Loaded from `.kortex/pii-allowlist.json` (gitignored — owner-customized).
//   When the file is missing or malformed we fall back to a small default
//   allowlist and warn — soft-fail, because a corrupted allowlist file
//   shouldn't break the publish path.

import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from './../lib/git.mjs';

// Pattern set. Boundary handling matters here: phone/account numbers can sit
// inside larger numeric strings (timestamps, hashes), so we anchor on the
// `+57` country code for phone, and use word-boundaries for account/cédula
// — the latter two are intentionally CONTEXTUAL (they will produce false
// positives on dates and hashes; the caller is expected to flag-for-review,
// not auto-reject, on those types).
const PII_PATTERNS = [
  // Colombian mobile: +57 then a 10-digit number starting with 3.
  // Allows whitespace or hyphen separators in the typical groupings.
  { name: 'CO phone', regex: /\+57\s*3\d{2}[\s-]?\d{3}[\s-]?\d{4}/g },
  // Generic email — the allowlist filters owner emails and team emails.
  { name: 'Email (non-allowlisted)', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  // Bank account: 9-12 digits surrounded by word boundary. CONTEXTUAL —
  // the caller should treat these as "review needed" not auto-reject.
  { name: 'Bank account CO', regex: /\b\d{9,12}\b/g },
  // Cédula: 8-10 digits. CONTEXTUAL, same caveat as bank account.
  { name: 'Cédula CO', regex: /\b\d{8,10}\b/g },
];

// Default allowlist used when `.kortex/pii-allowlist.json` is missing.
// `milo.ia.contacto@gmail.com` is the public business email so it's safe to
// have published.
const DEFAULT_ALLOWLIST = {
  emails: ['milo.ia.contacto@gmail.com'],
  names: [],
  medical_terms: [],
};

// Cache the allowlist read across multiple validatePii() calls in the same
// process. Sync-to-template typically processes hundreds of files in one run,
// and re-reading the JSON every time would be wasteful.
let _allowlistCache = null;
function getAllowlist() {
  if (_allowlistCache) return _allowlistCache;
  const allowlistPath = path.join(repoRoot(), '.kortex', 'pii-allowlist.json');
  if (!fs.existsSync(allowlistPath)) {
    _allowlistCache = DEFAULT_ALLOWLIST;
    return _allowlistCache;
  }
  try {
    const raw = fs.readFileSync(allowlistPath, 'utf8');
    const parsed = JSON.parse(raw);
    // Merge with defaults so partial files don't drop fields entirely.
    _allowlistCache = {
      emails: parsed.emails || DEFAULT_ALLOWLIST.emails,
      names: parsed.names || DEFAULT_ALLOWLIST.names,
      medical_terms: parsed.medical_terms || DEFAULT_ALLOWLIST.medical_terms,
    };
  } catch (e) {
    // Soft-fail: warn but don't abort. The threat model is "no PII leaks";
    // a malformed allowlist makes the matcher MORE strict (defaults only),
    // not less, so it's safe to continue.
    console.warn(
      `validate-pii: malformed .kortex/pii-allowlist.json — using defaults (${e.message})`
    );
    _allowlistCache = DEFAULT_ALLOWLIST;
  }
  return _allowlistCache;
}

// True if a matched value is on the allowlist. Each pattern dispatches to a
// pattern-specific allowlist field — emails to `emails`, etc. CO phone +
// account/cédula numbers don't have allowlist fields by default; if a use
// case emerges, add them to DEFAULT_ALLOWLIST + this function together.
function isAllowlisted(patternName, value) {
  const allow = getAllowlist();
  if (patternName === 'Email (non-allowlisted)') {
    return allow.emails.includes(value.toLowerCase());
  }
  // CO phone, bank, cédula: no built-in allowlist. Caller can extend.
  return false;
}

// Validate a single file. Returns `{ passed, matches }`:
//   - passed: true when no non-allowlisted matches were found
//   - matches: [{ pattern, line, snippet }] for every non-allowlisted match
// Async signature so callers can chain Promise.all over many files.
export async function validatePii(filepath) {
  const matches = [];
  let content;
  try {
    content = await fs.promises.readFile(filepath, 'utf8');
  } catch (e) {
    // Missing/unreadable file — return passed: false with the read error so
    // the caller can decide whether to abort or skip.
    return {
      passed: false,
      matches: [{ pattern: 'read-error', line: 0, snippet: e.message }],
    };
  }

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { name, regex } of PII_PATTERNS) {
      regex.lastIndex = 0;
      let m;
      while ((m = regex.exec(line)) !== null) {
        const value = m[0];
        if (isAllowlisted(name, value)) continue;
        matches.push({
          pattern: name,
          line: i + 1,
          // Trim long snippets so output stays readable; show enough context
          // (~20 chars either side) for a reviewer to spot the match.
          snippet: snippetWithContext(line, m.index, value.length),
        });
      }
    }
  }

  return { passed: matches.length === 0, matches };
}

// Build a small context snippet around the match position.
function snippetWithContext(line, idx, len) {
  const start = Math.max(0, idx - 20);
  const end = Math.min(line.length, idx + len + 20);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < line.length ? '...' : '';
  return prefix + line.slice(start, end) + suffix;
}

// Reset the allowlist cache. Test-only API; sync-to-template doesn't need
// this because it runs in a fresh process.
export function _resetAllowlistCache() {
  _allowlistCache = null;
}

// CLI mode: `node validate-pii.mjs <file> [<file> ...]` — prints findings
// per file and exits non-zero if any file has matches. Useful for local
// debugging (e.g. "what would sync-to-template flag in this file?") without
// running the full sync command.
async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error('usage: validate-pii.mjs <file> [<file> ...]');
    process.exit(2);
  }
  let anyFailed = false;
  for (const file of argv) {
    const { passed, matches } = await validatePii(file);
    if (!passed) {
      anyFailed = true;
      console.error(`\n${file}:`);
      for (const { pattern, line, snippet } of matches) {
        console.error(`  line ${line} [${pattern}]: ${snippet}`);
      }
    }
  }
  process.exit(anyFailed ? 1 : 0);
}

const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('validate-pii.mjs');

if (isDirectInvocation) {
  main().catch((e) => {
    console.error('validate-pii crashed:', e);
    process.exit(1);
  });
}

export { PII_PATTERNS, DEFAULT_ALLOWLIST };
