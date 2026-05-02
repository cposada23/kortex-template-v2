#!/usr/bin/env node
//
// Pre-commit hook: block API keys and other secrets from being committed.
//
// What it does:
//   1. Lists staged files (any extension — secrets aren't markdown-only).
//   2. Blocks any staged `.env`-family file outright (force-add bypass guard).
//   3. Reads only the ADDED lines from each file's diff and matches them
//      against canonical provider patterns + a generic `*_API_KEY = "..."`
//      heuristic.
//   4. Allowlists obvious placeholders and `.env.example`-style files.
//
// Why scan only added lines:
//   We don't want to block a commit because some legacy secret already
//   landed in the repo (separate cleanup problem). Looking at `git diff
//   --cached --unified=0` and only `+`-prefixed lines isolates "what is
//   this commit introducing" — which is the right scope for pre-commit.
//
// Why exit 1 + emergency-bypass note:
//   On a true positive the hook MUST block. On a false positive the user
//   has `git commit --no-verify` as an audited escape hatch (commit message
//   signals intent + the change is reviewable in PR).

import path from 'node:path';
import { stagedFiles, stagedAddedLines } from '../lib/git.mjs';
import { colors } from '../lib/colors.mjs';

// Canonical patterns for the providers Kortex actually uses.
// Each entry: { name, regex }. Patterns are tuned to require enough specific
// characters that they don't trigger on random strings — `\b` boundaries +
// the literal prefix is usually sufficient.
//
// NEW v2: Firecrawl pattern (`fc-` + 32 hex). Was added because Firecrawl
// joined Kortex's stack in v2 and its keys were not covered by the v1 hook.
const SECRET_PATTERNS = [
  { name: 'OpenAI (sk-proj-)', regex: /\bsk-proj-[A-Za-z0-9_-]{40,}\b/g },
  { name: 'OpenAI (sk-)',       regex: /\bsk-[A-Za-z0-9]{40,}\b/g },
  { name: 'Anthropic',          regex: /\bsk-ant-[A-Za-z0-9_-]{40,}\b/g },
  { name: 'OpenRouter',         regex: /\bsk-or-v1-[a-f0-9]{64}\b/g },
  { name: 'Google API',         regex: /\bAIza[A-Za-z0-9_-]{35}\b/g },
  { name: 'Perplexity',         regex: /\bpplx-[A-Za-z0-9]{40,}\b/g },
  { name: 'Firecrawl',          regex: /\bfc-[a-f0-9]{32}\b/g },          // NEW v2
  { name: 'GitHub PAT',         regex: /\bgh[pousr]_[A-Za-z0-9]{36}\b/g },
];

// Generic assignment heuristic. Catches `FOO_API_KEY = "abc..."` patterns for
// providers we don't have a canonical pattern for. The variable name on the
// LHS must look secret-ish — keeps this from firing on every long string.
const GENERIC_ASSIGNMENT =
  /\b([A-Z0-9_]*(API_KEY|SECRET|TOKEN|ACCESS_KEY|PRIVATE_KEY))\s*[:=]\s*["']?([A-Za-z0-9_\-.]{20,})["']?/g;

// Files that must never be committed regardless of contents.
// `.env.example` IS allowed — it's the documented placeholder file.
const BLOCKED_BASENAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
]);

// Files allowed to contain placeholder examples — useful for docs and the
// example env template.
const ALLOWED_SUFFIXES = [
  '.env.example',
  '.env.sample',
  '.env.template',
];

// Common placeholder values we want to allow through. Lowercased for easy
// comparison. Anything containing one of the marker substrings (xxxx, your-,
// etc.) also counts as a placeholder.
const PLACEHOLDER_VALUES = new Set([
  'xxx', 'your-key-here', 'your_key_here', 'placeholder', 'example',
  'sk-proj-xxx', 'sk-xxx', 'aiza-xxx', 'pplx-xxx', 'sk-ant-xxx',
  'changeme', 'todo', 'tbd', 'secret', 'token', 'key', 'redacted',
]);

const PLACEHOLDER_SUBSTRINGS = ['xxxxx', 'your-', 'your_', 'example', '<redacted>'];

// True if `value` is obviously a placeholder/sentinel rather than a real key.
function isPlaceholder(value) {
  const v = value.trim().replace(/^["']|["']$/g, '').toLowerCase();
  if (PLACEHOLDER_VALUES.has(v)) return true;
  if (PLACEHOLDER_SUBSTRINGS.some((s) => v.includes(s))) return true;
  // All-x or all-zero suffix after the prefix: a key documentation pattern
  // like `sk-xxxxxxxxxxxxxxxxxxxxxxxx`.
  if (/^[a-z]+-[x0]+$/i.test(v)) return true;
  return false;
}

// Heuristic: a regex like `/sk-proj-.../g` documented in source code is not
// a real key. We detect documentation context by looking at the line itself —
// if the match is preceded by a backtick, the words "pattern" / "regex" /
// "format" / `re.compile`, or appears inside a JS regex literal (slash,
// regex source, slash + flags), treat it as documentation.
function isDocumentation(line, matchIndex) {
  // Look at up to 40 chars before the match for context cues.
  const ctxStart = Math.max(0, matchIndex - 40);
  const ctxBefore = line.slice(ctxStart, matchIndex).toLowerCase();
  if (ctxBefore.includes('pattern')) return true;
  if (ctxBefore.includes('regex')) return true;
  if (ctxBefore.includes('format:')) return true;
  if (ctxBefore.includes('re.compile')) return true;
  // Backtick immediately before the match → inline code span.
  if (line[matchIndex - 1] === '`') return true;
  // Inside a regex literal: there's an unescaped `/` somewhere before with
  // a `regex:` or `=` keyword before that. Cheaper heuristic: if the line
  // contains `regex:` or `: re.compile(`, treat all matches on that line
  // as documentation.
  const lower = line.toLowerCase();
  if (lower.includes('regex:') || lower.includes('regex =')) return true;
  return false;
}

// Scan a file's staged additions. Returns `[{ kind, snippet }]` of findings.
// Exported so tests can call it directly with synthetic input.
export function scanAddedLines(addedText) {
  const findings = [];
  if (!addedText) return findings;

  // We process line-by-line because the documentation heuristic needs the
  // line's context (and per-line is plenty fast for typical diffs).
  const lines = addedText.split('\n');
  for (const line of lines) {
    for (const { name, regex } of SECRET_PATTERNS) {
      regex.lastIndex = 0;
      let m;
      while ((m = regex.exec(line)) !== null) {
        if (isPlaceholder(m[0])) continue;
        if (isDocumentation(line, m.index)) continue;
        findings.push({ kind: name, snippet: redact(m[0]) });
      }
    }
    GENERIC_ASSIGNMENT.lastIndex = 0;
    let g;
    while ((g = GENERIC_ASSIGNMENT.exec(line)) !== null) {
      const varName = g[1];
      const value = g[3];
      if (isPlaceholder(value)) continue;
      if (isDocumentation(line, g.index)) continue;
      findings.push({ kind: `Generic (${varName})`, snippet: redact(value) });
    }
  }
  return findings;
}

// Redact the body of a secret for display. Keeps the prefix and last 4
// chars so the user can confirm it's the right one without exposing it
// further in terminal scrollback / CI logs.
function redact(s) {
  if (s.length <= 12) return s.slice(0, 4) + '***';
  return s.slice(0, 8) + '...' + s.slice(-4);
}

async function main() {
  const staged = stagedFiles();
  if (staged.length === 0) process.exit(0);

  const problems = [];

  // Pass 1: blocked filenames (force-added past .gitignore).
  for (const rel of staged) {
    const basename = path.basename(rel);
    if (BLOCKED_BASENAMES.has(basename)) {
      problems.push({
        path: rel,
        kind: 'blocked filename',
        snippet: `${basename} must never be committed`,
      });
    }
  }

  // Pass 2: scan diffs for secret patterns.
  for (const rel of staged) {
    // Skip files already flagged in pass 1 — no point double-reporting.
    if (problems.some((p) => p.path === rel)) continue;

    // Allowlisted .env.example-style files: skip pattern scan.
    if (ALLOWED_SUFFIXES.some((suf) => rel.endsWith(suf))) continue;

    // The hook file itself contains the patterns it checks for — skip to
    // avoid self-flagging.
    if (rel.endsWith('validate-secrets.mjs')) continue;
    // The test file contains intentional secret-shaped strings to verify
    // detection works. Same exemption.
    if (rel.endsWith('validate-secrets.test.mjs')) continue;

    const added = stagedAddedLines(rel);
    const findings = scanAddedLines(added);
    for (const { kind, snippet } of findings) {
      problems.push({ path: rel, kind, snippet });
    }
  }

  if (problems.length === 0) process.exit(0);

  console.error(
    colors.red(colors.bold('\nCommit blocked — possible secrets detected:'))
  );
  for (const { path: p, kind, snippet } of problems) {
    console.error('  ' + colors.cyan(p));
    console.error(`    ${colors.gray('->')} ${kind}: ${snippet}`);
  }
  console.error(colors.gray('\n  Fix options:'));
  console.error('    1. Move secret to .env (already in .gitignore).');
  console.error('    2. If placeholder: use "your-key-here" or commit to .env.example.');
  console.error('    3. False positive? Adjust pattern in scripts/hooks/validate-secrets.mjs.');
  console.error(colors.gray('\n  Emergency bypass (audit trail left): git commit --no-verify\n'));
  process.exit(1);
}

const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('validate-secrets.mjs');

if (isDirectInvocation) {
  main().catch((e) => {
    console.error(colors.red('validate-secrets crashed:'), e);
    process.exit(1);
  });
}

export { SECRET_PATTERNS, GENERIC_ASSIGNMENT, isPlaceholder, isDocumentation };
