---
---

# /bridge

Session start (default), session end (`--out`), mid-session compaction
(`--handoff`), or post-crash reconstruction (`--recovery`).

In v2, all four flows live in one Node script: `scripts/commands/bridge.mjs`.
This slash wrapper invokes it; the model fills in the human/conversation
parts (the four field bodies, the RESUME PROMPT, the recovery synthesis).

## How to run

```bash
pnpm kortex bridge              # bridge-in (default)
pnpm kortex bridge --out        # bridge-out — commits + pushes
pnpm kortex bridge --handoff    # mid-session — no commit, no push
pnpm kortex bridge --recovery   # reconstruct from git when last session ended cold
```

## What the script does (Node side)

- **bridge-in:** detects open handoffs, reads `.cache/status.json` (~1 KB)
  and `AGENTS.md`, prints a structured state block. Targets <60-second
  orientation.
- **bridge-out:** writes a 4-field block (STATE / DECISIONS / NEXT /
  BLOCKERS) into `output/sessions/YYYY-MM-DD.md`, appends to `log.md`,
  commits, pushes. Fidelity > token reduction — expand if 15 lines hides
  load-bearing context.
- **handoff:** writes a `## Handoff HH:MM` section with STATE / CONTEXT /
  DECISIONS / REJECTED / FILES TOUCHED / OPEN QUESTIONS / NEXT / RESUME
  PROMPT. Detects MID-SAFE-CHANGE and warns the new chat. **Never
  commits** — owner reviews the working tree in the IDE.
- **recovery:** dumps `git log --stat` since the last session, writes a
  best-effort 4-field block with a ⚠️ warning, then runs bridge-in.

## What the model does (this side)

For `--out` and `--handoff`, the script writes a TEMPLATE with markers
like `<one sentence — where things stand right now>`. After running the
script, **edit the file in place** to fill those markers from the
conversation history. Keep STATE and DECISIONS specific and concrete.

For `--recovery`, read the inline `git log --stat` and translate
commits → STATE / DECISIONS / NEXT / BLOCKERS bullets in the same file.

For default `bridge-in`, read the printed state block, then read
`AGENTS.md` and any open handoff file before answering "what's next?".

## Hard rules

- Bridge-out always commits and pushes. If `git push` fails, surface it
  loudly — session closure is not closure until origin has it.
- Handoff never commits. All edits stay uncommitted in the working tree.
- Recovery is a best-effort reconstruction, not a substitute for
  bridge-out. The ⚠️ warning must remain in the session file.
