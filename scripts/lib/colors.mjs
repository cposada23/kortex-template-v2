// scope: framework
// ANSI color helpers — no external deps (chalk avoided to keep deps minimal).
// Auto-disables when stdout is not a TTY or NO_COLOR is set, so logs piped
// into files or CI don't get cluttered with escape codes.

// Detect once: NO_COLOR convention (https://no-color.org/) wins, then TTY.
const ENABLED =
  !process.env.NO_COLOR &&
  (process.env.FORCE_COLOR === '1' || process.stdout.isTTY === true);

// Wrap a string in ANSI codes if colors are enabled, otherwise return as-is.
// Keeping this as a single helper keeps the public API tiny: callers just say
// `colors.red('foo')` and don't have to think about disabling.
function wrap(open, close) {
  return (s) => (ENABLED ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));
}

export const colors = {
  // Severity-tinted colors used by hook output.
  red: wrap(31, 39),       // hard failures / blocked
  yellow: wrap(33, 39),    // warnings / soft
  green: wrap(32, 39),     // success
  cyan: wrap(36, 39),      // info / file paths
  gray: wrap(90, 39),      // secondary detail
  // Type emphasis.
  bold: wrap(1, 22),
  dim: wrap(2, 22),
};

// Convenience prefix builders so every hook uses the same visual language.
// Centralizing means a future change to the prefix style is one edit, not six.
export const tag = {
  ok: () => colors.green('OK'),
  fail: () => colors.red('FAIL'),
  warn: () => colors.yellow('WARN'),
  info: () => colors.cyan('INFO'),
};
