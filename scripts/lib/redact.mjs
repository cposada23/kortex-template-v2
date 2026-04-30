// scope: framework
//
// Sync-time redaction. Strips personal data from a file's bytes before
// it reaches the public template repo. Operates as a pure transform —
// no IO — so it's trivially testable and the sync command can compose
// it with any other transform.
//
// The redactor implements six mechanisms, applied in this order:
//
//   1. Drop blocks between markers   (`<!-- mirror:strip -->...<!-- /mirror:strip -->`)
//   2. Literal substitutions         (e.g. "{{owner_name}}" → "{{owner_name}}")
//   3. Regex substitutions           (e.g. private-project paths → example-project)
//   4. Smart backref filter          (drop bullets in <!-- backrefs:start --> / <!-- backrefs:end -->
//                                     that point at files outside the sync set)
//   5. External link demotion        (any `[text](path)` pointing at a file
//                                     not in syncSet becomes plain `text` —
//                                     prevents broken-link errors in template
//                                     pre-commit hooks)
//   6. Drop-line patterns            (full-line regex match → line removed)
//
// Order matters: blocks first so substitutions don't operate on text we
// were going to remove anyway. Backref filter runs late because it needs
// the full sync-set context (which only the caller has).
//
// Why a pure transform: the sync flow is `walk → filter → redact → write`.
// Keeping redact() free of IO means we can run hundreds of unit tests
// against synthetic inputs without touching disk, and a future change
// (e.g. checksum-aware syncing) doesn't require rewriting the redactor.

const STRIP_BLOCK_RE = /<!--\s*mirror:strip\s*-->[\s\S]*?<!--\s*\/mirror:strip\s*-->\n?/g;
const BACKREFS_RE = /(<!--\s*backrefs:start\s*-->)([\s\S]*?)(<!--\s*backrefs:end\s*-->)/;
// Inline link parser kept local to avoid pulling in markdown-links.mjs (which
// also strips code fences — overkill for a backref bullet that's just
// `- [text](path)`).
const LINK_IN_BULLET_RE = /^-\s+\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/;

/**
 * Apply the full redaction pipeline to a file's content.
 *
 * @param {string} content     Raw file bytes.
 * @param {object} opts
 * @param {Array<[string,string]>}        [opts.literal]     Literal substitutions, applied in order.
 * @param {Array<[string|RegExp,string]>} [opts.regex]       Regex substitutions, applied in order. String form compiles with `g` flag.
 * @param {string[]}                      [opts.dropLines]   Full-line patterns (regex strings, NOT anchored — we anchor for you).
 * @param {Set<string>}                   [opts.syncSet]     Repo-relative paths of files being synced. Backrefs to anything not in this set get dropped. Pass `null` to disable.
 * @param {string}                        [opts.fromPath]    Repo-relative path of the file being redacted. Required when syncSet is provided so we can resolve backref targets.
 * @param {'md'|'code'}                   [opts.fileType]    'md' (default) applies all 6 mechanisms; 'code' applies only 2 (literal) and 3 (regex), since markdown-aware steps would corrupt JS template literals like `[${var}](${rel})` and HTML strings.
 * @returns {{ content: string, hits: { strip_blocks: number, literal: number, regex: number, drop_lines: number, backrefs_dropped: number } }}
 */
export function redact(content, opts = {}) {
  const hits = { strip_blocks: 0, literal: 0, regex: 0, drop_lines: 0, backrefs_dropped: 0, links_demoted: 0 };
  // fileType controls which mechanisms apply. Code files (.mjs/.js/.ts/...)
  // only get literal + regex substitutions because the markdown-aware
  // mechanisms (strip blocks, backref filter, link demoter) match patterns
  // that legitimately appear in source code (e.g. JS template literals
  // containing `[${var}](${url})`, JSX, HTML strings) and would corrupt
  // the file. Default 'md' applies all six.
  const isMd = (opts.fileType || 'md') === 'md';

  // 1. Drop strip-blocks. We replace with the empty string and trust the
  // caller to have chosen marker placement that doesn't leave dangling
  // newlines. The trailing `\n?` in the regex handles the common case
  // where a marker ends a line.
  if (isMd) {
    content = content.replace(STRIP_BLOCK_RE, () => {
      hits.strip_blocks++;
      return '';
    });
  }

  // 2. Literal substitutions. We build a single combined regex per call
  // so the worst-case cost is O(content) regardless of how many rules
  // are configured. Order matters when one literal is a prefix of
  // another ("{{owner_full_name}}" must run before "{{owner_name}}") — we honor
  // declaration order by replacing each in turn rather than alternating
  // them in a single regex.
  if (opts.literal && opts.literal.length) {
    for (const [from, to] of opts.literal) {
      if (!from) continue;
      const re = new RegExp(escapeRegExp(from), 'g');
      content = content.replace(re, () => {
        hits.literal++;
        return to;
      });
    }
  }

  // 3. Regex substitutions. The redactor wraps string patterns with `gm`
  // flags so anchored line patterns (`^...$`) work across multiline
  // content — the most common shape for field-style substitutions like
  // `^(Primary channel: \\*\\*)[^*]+(\\*\\*)$`. RegExp objects keep their
  // own flags but we ensure the `g` flag is set so .replace iterates.
  //
  // We count hits via .match() before replacing because `.replace(re, fn)`
  // would either let us count OR use $1/$2 captures, not both.
  if (opts.regex && opts.regex.length) {
    for (const [pattern, replacement] of opts.regex) {
      const re = pattern instanceof RegExp
        ? ensureGlobal(pattern)
        : new RegExp(pattern, 'gm');
      const matches = content.match(re);
      if (matches) hits.regex += matches.length;
      content = content.replace(re, replacement);
    }
  }

  // 4. Smart backref filter. Scoped to the auto-managed block; everything
  // outside the markers is left alone. The check resolves each bullet's
  // link target against `fromPath` and drops it if the resolved path is
  // not in `syncSet`. Markdown-only.
  if (isMd && opts.syncSet && opts.fromPath) {
    content = content.replace(BACKREFS_RE, (_full, start, body, end) => {
      const filtered = body.split('\n').filter((line) => {
        const m = line.match(LINK_IN_BULLET_RE);
        if (!m) return true;                // not a bullet — keep verbatim
        const target = m[1];
        if (target.startsWith('http://') || target.startsWith('https://')) return true;
        if (target.startsWith('#')) return true;
        const resolved = resolveRelative(opts.fromPath, target);
        if (opts.syncSet.has(resolved)) return true;
        hits.backrefs_dropped++;
        return false;
      }).join('\n');
      return start + filtered + end;
    });
  }

  // 5. External link demotion. Markdown-only — the regex matches
  // legitimate code patterns like `[${var}](${url})` template literals,
  // and demoting those would corrupt the source file.
  // whose resolved target is not in syncSet gets demoted to plain text
  // — the link text survives, the broken target is removed. This
  // prevents the template's validate-links hook from blocking the sync
  // commit on links to owner-only files (sessions, audits, learnings)
  // that the framework docs legitimately reference in mykortex but
  // can't carry into the public template.
  //
  // We skip:
  //   - external URLs (http://, https://, mailto:)
  //   - anchor-only links (#section)
  //   - links inside fenced code blocks (the snapshot of fences is rough
  //     — three-backticks toggle a flag — but it covers ~99% of cases)
  if (isMd && opts.syncSet && opts.fromPath) {
    let inFence = false;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/^```/.test(lines[i])) { inFence = !inFence; continue; }
      if (inFence) continue;
      lines[i] = lines[i].replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (full, text, target) => {
        if (target.startsWith('http://') || target.startsWith('https://')) return full;
        if (target.startsWith('mailto:')) return full;
        if (target.startsWith('#')) return full;
        const resolved = resolveRelative(opts.fromPath, target);
        if (opts.syncSet.has(resolved)) return full;
        if (process.env.KORTEX_REDACT_DEBUG) {
          console.error(`[demote] ${opts.fromPath}: ${target} → resolved ${resolved} not in syncSet`);
        }
        hits.links_demoted = (hits.links_demoted || 0) + 1;
        return text;
      });
    }
    content = lines.join('\n');
  }

  // 6. Drop-line patterns. Each pattern matches a full line; we anchor
  // automatically so callers don't have to remember `^...$`. Empty lines
  // after a drop are preserved — the redactor doesn't try to be clever
  // about whitespace because that's the kind of cleverness that bites
  // you later.
  if (opts.dropLines && opts.dropLines.length) {
    const compiled = opts.dropLines.map((p) => new RegExp(`^${p}$`));
    const out = [];
    for (const line of content.split('\n')) {
      let dropped = false;
      for (const re of compiled) {
        if (re.test(line)) { dropped = true; hits.drop_lines++; break; }
      }
      if (!dropped) out.push(line);
    }
    content = out.join('\n');
  }

  return { content, hits };
}

// Resolve a relative link target against the source file's path, returning
// a repo-relative POSIX path with no leading `./`. We intentionally do not
// use node:path here so this module stays runnable in any JS environment
// (the test fixtures mock paths as plain strings).
export function resolveRelative(fromPath, target) {
  // Drop any anchor — we only care about file matching.
  const noAnchor = target.split('#')[0];
  const fromParts = fromPath.split('/').slice(0, -1);     // dir of fromPath
  const targetParts = noAnchor.split('/');
  const out = [...fromParts];
  for (const part of targetParts) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

// Strict regex escape. We don't try to be smart about word boundaries —
// callers pass exact literal strings and expect every occurrence to match.
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Make sure a RegExp has the `g` flag so .replace iterates. We never strip
// other flags (i, u, etc.) because the caller may have set them
// intentionally.
function ensureGlobal(re) {
  if (re.flags.includes('g')) return re;
  return new RegExp(re.source, re.flags + 'g');
}

/**
 * Build a regex substitution that maps `projects/<private>/` → `projects/example-project/`
 * for every name in `privateNames`. Returned as a `[pattern, replacement]`
 * pair so it slots into the regex array of redact()'s opts. We anchor on
 * `projects/` so the rule doesn't accidentally rewrite mentions outside
 * the path-like context.
 *
 * Why we expose this as a builder rather than letting callers write the
 * regex by hand: the list of private project names changes every time the
 * owner adds a project, and a missed name = a leak. Deriving the list
 * from `readdir('projects/')` and feeding it into this builder keeps the
 * config drift-free.
 */
export function buildPrivateProjectsRule(privateNames, replacement = 'example-project') {
  if (!privateNames || privateNames.length === 0) return null;
  const escaped = privateNames.map(escapeRegExp).join('|');
  // Match `projects/<name>` followed by `/` or end-of-word so we don't
  // half-rename things like `projects/milo-ia-something`.
  const pattern = new RegExp(`projects/(${escaped})(?=[/\\s)\\]\`'"]|$)`, 'g');
  return [pattern, `projects/${replacement}`];
}
