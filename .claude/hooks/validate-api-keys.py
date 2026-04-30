#!/usr/bin/env python3
# scope: framework
"""
Pre-commit hook: block API keys from being committed.

Scans all staged files (any extension, not just .md) for known API key
patterns from providers Kortex uses. Also blocks staging of .env files
even if a user tries to force-add one past .gitignore.

Runs fast — only looks at staged hunks, not full file contents.

Patterns covered:
  - OpenAI:     sk-...           sk-proj-...
  - Anthropic:  sk-ant-...
  - Google:     AIza... (Gemini, Maps, etc.)
  - Perplexity: pplx-...
  - OpenRouter: sk-or-v1-...
  - Generic:    high-entropy tokens labeled *_API_KEY / *_SECRET /
                *_TOKEN in added lines (catches custom providers too)

Exit code 0 = OK, 1 = secret found (blocks commit).
"""
import re
import subprocess
import sys

# Known provider key patterns. Tuned to minimize false positives by
# requiring the full prefix + length range typical of real keys.
PROVIDER_PATTERNS = [
    ("OpenAI (sk-proj-)",   re.compile(r"\bsk-proj-[A-Za-z0-9_\-]{40,}\b")),
    ("OpenAI (sk-)",        re.compile(r"\bsk-[A-Za-z0-9]{40,}\b")),
    ("Anthropic",           re.compile(r"\bsk-ant-[A-Za-z0-9_\-]{40,}\b")),
    ("Google/Gemini",       re.compile(r"\bAIza[A-Za-z0-9_\-]{35}\b")),
    ("Perplexity",          re.compile(r"\bpplx-[A-Za-z0-9]{40,}\b")),
    ("OpenRouter",          re.compile(r"\bsk-or-v1-[A-Za-z0-9_\-]{40,}\b")),
]

# Generic assignment patterns — catches `FOO_API_KEY = "xxx"` where xxx
# looks like a non-trivial token (>=20 chars, mostly alphanumeric).
# Requires a suspicious name on the left side so we don't flag every
# long string.
GENERIC_ASSIGNMENT = re.compile(
    r"(?i)\b([A-Z0-9_]*(API_KEY|SECRET|TOKEN|ACCESS_KEY|PRIVATE_KEY))\s*"
    r"[:=]\s*[\"']?([A-Za-z0-9_\-\.]{20,})[\"']?"
)

# Values that are obviously placeholders — allow them through.
PLACEHOLDER_VALUES = {
    "xxx", "your-key-here", "your_key_here", "placeholder", "example",
    "sk-proj-xxx", "sk-xxx", "aiza-xxx", "pplx-xxx", "sk-ant-xxx",
    "changeme", "todo", "tbd", "secret", "token", "key",
}

# Files/dirs that are allowed to contain placeholder examples.
ALLOWED_PATHS = (
    ".env.example",
    "/.env.example",
    ".env.sample",
    ".env.template",
)

# Files we never want committed, regardless of content.
BLOCKED_FILENAMES = {
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
}


def get_staged_files():
    """Return list of staged files (added, copied, modified, renamed)."""
    result = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR"],
        capture_output=True, text=True
    )
    return [f for f in result.stdout.strip().split("\n") if f]


def get_staged_diff(path):
    """Return only the added lines (starting with '+') for a staged file."""
    result = subprocess.run(
        ["git", "diff", "--cached", "--no-color", "--unified=0", "--", path],
        capture_output=True, text=True
    )
    added = []
    for line in result.stdout.splitlines():
        if line.startswith("+++") or line.startswith("---"):
            continue
        if line.startswith("+"):
            added.append(line[1:])
    return "\n".join(added)


def is_placeholder(value):
    v = value.strip().strip("\"'").lower()
    if v in PLACEHOLDER_VALUES:
        return True
    if any(marker in v for marker in ("xxxxx", "your-", "your_", "example")):
        return True
    return False


def scan_file(path):
    """Return list of (pattern_name, match_snippet) findings."""
    findings = []
    added = get_staged_diff(path)
    if not added:
        return findings

    for name, pattern in PROVIDER_PATTERNS:
        for match in pattern.finditer(added):
            snippet = match.group(0)
            # Skip obvious doc placeholders (all x's/0's after the prefix).
            prefix = snippet.split('-')[0] + '-'
            suffix = snippet[len(prefix):] if snippet.startswith(prefix) else snippet
            if re.fullmatch(r"[xX0]+", suffix):
                continue
            findings.append((name, snippet))

    for match in GENERIC_ASSIGNMENT.finditer(added):
        var_name = match.group(1)
        value = match.group(3)
        if is_placeholder(value):
            continue
        findings.append((f"Generic ({var_name})", value[:12] + "..."))

    return findings


def main():
    staged = get_staged_files()
    if not staged:
        return 0

    problems = []

    for path in staged:
        basename = path.rsplit("/", 1)[-1]
        if basename in BLOCKED_FILENAMES:
            problems.append((path, "blocked filename",
                             f"{basename} must never be committed"))

    for path in staged:
        if any(problem[0] == path for problem in problems):
            continue
        if any(path.endswith(suffix) for suffix in ALLOWED_PATHS):
            continue
        if path.endswith("validate-api-keys.py"):
            continue

        findings = scan_file(path)
        for name, snippet in findings:
            problems.append((path, name, snippet))

    if not problems:
        return 0

    print("\nCommit blocked — possible API keys or secrets detected:\n", file=sys.stderr)
    for path, kind, snippet in problems:
        print(f"  {path}", file=sys.stderr)
        print(f"    -> {kind}: {snippet}", file=sys.stderr)
    print("", file=sys.stderr)
    print("Fix options:", file=sys.stderr)
    print("  1. Move secrets to .env (already in .gitignore).", file=sys.stderr)
    print("  2. If this is a placeholder, use a form the hook accepts:", file=sys.stderr)
    print("     VAR=\"xxx\"  or  VAR=\"your-key-here\"  or put it in .env.example", file=sys.stderr)
    print("  3. False positive? Loosen the pattern in", file=sys.stderr)
    print("     .claude/hooks/validate-api-keys.py with owner approval.", file=sys.stderr)
    print("", file=sys.stderr)
    print("Emergency bypass (audit trail left):", file=sys.stderr)
    print("  git commit --no-verify", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
