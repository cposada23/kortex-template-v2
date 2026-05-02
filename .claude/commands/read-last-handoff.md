---
---

# /read-last-handoff

Print or copy the last `## Handoff HH:MM` section from the most recent
session file. Cross-surface gap fix (PRD §9): when the owner is in a
mobile or web AI chat with no filesystem access, this command lands the
RESUME PROMPT on the system clipboard so they can paste it.

## How to run

```bash
pnpm kortex read-last-handoff                 # print to stdout
pnpm kortex read-last-handoff --clipboard     # copy to system clipboard
pnpm kortex read-last-handoff --resume-only   # only the RESUME PROMPT subsection
```

Combine flags for the most common case:

```bash
pnpm kortex read-last-handoff --resume-only --clipboard
```

## Clipboard support

Probes in order: `pbcopy` (macOS), `xclip` / `xsel` / `wl-copy` (Linux),
`clip.exe` (Windows / WSL). First one that exits 0 wins. If none are
available, prints to stdout with a warning.

## Exit codes

- `0` — handoff found and printed/copied.
- `1` — error (missing clipboard helper, etc.).
- `2` — no session file or no handoff section in the latest session.

## What the model does

Run this when the owner is about to switch surfaces (laptop → mobile
chat) and needs to seed the new chat with the last handoff's RESUME
PROMPT. The model can also run it as part of a `/bridge-in` flow when
an open handoff is detected and the owner wants to read the prompt
inline.
