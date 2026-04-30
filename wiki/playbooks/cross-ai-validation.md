---
title: Cross-AI Validation Playbook
type: playbook
layer: synthesis
language: en-es
tags:
  - cross-ai
  - validation
  - workflow
  - decision-making
  - audit
  - playbook
updated: 2026-04-24T00:00:00.000Z
distillation_level: 3
confidence: high
source_count: 6
last_verified: 2026-04-24T00:00:00.000Z
related_paths:
  - ../decisions/
  - ../../output/audits/milo-ia-ig-profile-validation-2026-04-18.md
  - ../../projects/example-project/inbox/processed/ig-validation-2026-04-18.md
mirror: both
---

# Cross-AI Validation Playbook

Pattern for pressure-testing significant decisions by asking 4 AIs
with specialized lenses to challenge them, then synthesizing a
verdict. Proven on brand identity (2026-04-17) and IG profile setup
(2026-04-18).

## When to use this

**Yes:** brand decisions, positioning moves, copy that will live on
many surfaces, architecture calls with irreversible-ish blast radius,
any decision where "I like it" is not sufficient evidence.

**No:** tactical choices editable in minutes (first-draft copy,
thumbnail variants, session-level implementation details), decisions
with a 5-minute revert cost. Cross-AI overhead is 30–60 minutes of
orchestration; the decision has to warrant it.

**Skip if:** the underlying positioning was already cross-AI validated
recently and the new decision is a tactical application (not a
strategic shift). Applying already-validated positioning to a new
surface doesn't need re-validation.

## The 4 AIs and their roles

| AI | Lens | Strength | Weakness | Operationalized by (skill cross-validate) |
|---|---|---|---|---|
| **ChatGPT (GPT-5.4)** | Brand strategy challenger + competitor-aware analyst | Best all-rounder + best for business/competitor research (GDPval 83%, líder Computer Use 75% OSWorld); ranks weaknesses by severity with trade-offs named; refuses to confirm | US-centric default; can over-optimize for "3-second conversion"; no live web (no inventar competidores específicos sin evidencia — eso es trabajo de Perplexity) | [chatgpt-prompt-template.md](../../wiki/playbooks/cross-ai-validation/templates/chatgpt-prompt-template.md) |
| **Gemini 3.1 Pro** | Abstract reasoning + structural integrity validator (sub-lens visual cuando aplique) | #1 GPQA Diamond (94.3%), #1 ARC-AGI-2 (77.1%), #1 MMMU-Pro multimodal. Detecta cuando una decisión "suena bien" pero no se sostiene cuando seguís la lógica end-to-end. Sub-lens visual: technical design findings (jerarquía, miniaturización), mockup reasoning | Copy suggestions drift toward stylistic preference, not evidence | [gemini-prompt-template.md](../../wiki/playbooks/cross-ai-validation/templates/gemini-prompt-template.md) |
| **Perplexity (Sonar Pro)** | Competitive intelligence (live web search) | Real URLs, real competitor data, territory-occupation claims. **Sonar Pro mejora vs Sonar básico:** 2x más search results y mejor F-score factual (0.858) — la "circular citations" weakness se diluye con Sonar Pro | Generic examples; handles often unverifiable (descontar más con Sonar básico que con Sonar Pro) | [perplexity-prompt-template.md](../../wiki/playbooks/cross-ai-validation/templates/perplexity-prompt-template.md) |
| **Grok** (legacy del flow manual) | Real-time social engagement | Timing signals, platform-algorithm shifts, current X/IG patterns | Specific account claims unverified; platform growth data plausible but hand-wave | (manual flow only — sin template; substitute en skill = Claude Opus, ver fila siguiente) |
| **Claude Opus 4.7** (skill cross-validate substitute por Grok) | Repo-context coherence checker | **Most consistent long-context performance of any model tested** (0.715 score). Best at "drawing connections across documents" + "precise attribution". Único validator con acceso completo al repo (decisions, otras piezas, playbooks, rules) | Sesgo del autor — Opus puede haber escrito el archivo que valida; debe declarar y compensar | [claude-prompt-template.md](../../wiki/playbooks/cross-ai-validation/templates/claude-prompt-template.md) |

**Calibration rule:** weight findings by each AI's actual signal
quality, not its prestige. A Gemini technical finding (40px avatar
miniaturization) can outweigh three AIs' stylistic consensus.
Perplexity and Grok often produce medium-weight output; don't
over-trust them.

**Roles validados 2026-04-24** contra capabilities documentadas
(GPT-5.4 model card + GDPval/OSWorld benchmarks; Gemini 3.1 Pro
GPQA/ARC-AGI-2/MMMU-Pro benchmarks; Perplexity Sonar Pro factuality
F-score; Claude Opus 4.7 long-context benchmarks). Re-validar cuando
algún model vendor publique major release o cuando el role asignado
deje de matchear la mejor capacidad documentada del modelo.

**Relación doctrina ↔ operacional.** Este playbook es la **capa
doctrina** — define qué validador hace qué a nivel concepto, when-to-use,
synthesis format, failure modes. Los templates en
.claude/skills/cross-validate/templates/
son la **capa operacional** — convierten cada rol en el prompt exacto
enviado al API correspondiente, con placeholders, output format
estructurado, y scoring dimensions per type. Cambios en una capa
**requieren sync manual con la otra** hasta que `/lint` automatice
detección de drift (TODO en v6 Tier 2 §T2.4 "Observability mínima").
La columna "Operationalized by" arriba es el ancla de cross-ref —
mantener actualizada cuando se agreguen o reemplacen templates.

**Default always 4.** Stations include all 4 validator roles. If one
AI is down the day you run validation, tell Claude.ai in the chat —
don't bake the exclusion into the station file. Stable template
session-to-session; availability is the operator's concern, not the
template's.

**Skill `cross-validate` — substitución del 4to validator.** El skill
[.claude/skills/cross-validate.md](../../.claude/skills/cross-validate.md)
automatiza este playbook end-to-end. Reemplaza Grok (4to validator del
flow manual) con **Claude Opus 4.7 nativo** corriendo en Claude Code,
con un nuevo lens: **Repo-context coherence checker** (único validator
con acceso al repo completo — chequea coherencia de la pieza/decisión
con decisions del wiki, otras piezas Milo IA, playbooks, framework
rules). El flow manual sigue usando Grok cuando se ejecuta sin el
skill; los 3 primeros validators (ChatGPT/Gemini/Perplexity) son los
mismos en ambos flows.

## Division of labor: Claude.ai vs Claude Code

**Claude.ai Project** (where brand context is already loaded):
- Generate + iteratively refine the 4 role-specialized prompts
- Receive and synthesize the 4 external AI responses
- Produce the verdict (consensus, disagreements, diffs, open decisions)

**Claude Code**:
- Create a **copy-paste station** file — structured blocks the human
  pastes sequentially into each external AI
- Receive the synthesized verdict from the human
- Apply verdict as file diffs via `/safe-change`
- File the audit report in `output/audits/`
- Move copy-paste station to `inbox/processed/`

**Why the split:** Claude.ai has the project context cached; the 4
target AIs (ChatGPT/Gemini/Perplexity/Grok) are chat interfaces
themselves, so the entire prompt+synthesis phase stays in chat.
Claude Code's job is files and git. Matches the rule in
project-brief.md §7-8: "Strategy → chat; File operations → Claude Code."

## Station file format (self-contained)

Claude Code creates a single `.md` file in `output/audits/` that **IS
the prompt** to Claude.ai. Pasting the whole file into a fresh chat
in the Claude.ai Project = the complete instruction. There is no
separate "what to do" block to paste after.

**Structure (in this order):**

1. **Frontmatter** — `type: audit`, `status: station`, `project:`,
   `related_paths:` pointing at the master/pieza file + this playbook.
2. **Imperative opening** — the first prose after the H1 title. State
   the action: "Generá 4 prompts cross-AI para [pieza / decisión X].
   Cada prompt debe [...]. Luego sintetizá los 4 verdicts en un
   veredicto único siguiendo la estructura del playbook." This is the
   only instruction in the file. Do not duplicate it elsewhere.
3. **Context** — what triggered this, history, pivots, prior rounds.
   The situational background validators need to understand the
   decision in situ.
4. **The thing being validated** — metadata, scoring, ángulo, decisions,
   hook. Everything the validators need inline — they don't see the
   repo, so no bare path references without the content alongside.
5. **Risks to challenge** — numbered list the validators must cover.
6. **Validator roles** — 4 roles always (ChatGPT / Gemini / Perplexity
   / Grok). Each gets one lens + which risks to focus on.
7. **Output format expected from each validator** — the exact shape
   they must return (verdict / score / ranked findings / rewrites /
   killer question). Keeps the 4 responses comparable.
8. **Synthesis guardrails** — how Claude.ai should weight the 4
   responses when producing the final verdict (convergent vs divergent
   edits, score honesty, validator-specific weighting).
9. **Pointers** — internal repo paths Claude.ai can expand inline into
   the prompts (the 4 validators don't have repo access; Claude.ai
   does, so it inlines content from these paths into each prompt).

**Do NOT:**

- Duplicate the instruction at the end of the file (a "handoff /
  what to do" section). Pasting the file is the handoff; a second
  instruction block is redundant and makes the operator guess which
  to paste.
- Bake AI availability into the station ("Grok skipped today —
  unavailable"). Always 4 validators. If one is down, the operator
  tells Claude.ai manually in the chat. Keeps the template stable
  session-to-session.
- Create "Respuesta" placeholder sections — responses live in
  Claude.ai, not in the station file. Keeping them out enforces the
  division of labor.

## Prompt design rules

- **Scope-lock:** every prompt must state what's LOCKED vs candidate.
  Without this, AIs will challenge decisions that aren't up for
  debate and waste the validation budget.
- **Anti-confirmation framing:** explicitly reject "se ve bien" /
  "looks good" answers. Ask for the weakest decision, ranked.
- **Role-specialization:** each AI gets the one lens it's best at.
  Asking all 4 AIs the same question produces 4 versions of the
  dominant-framing answer.
- **Trade-off requirement:** each critique must name what you'd lose
  if you change. "This is bad" without trade-off is useless.
- **Entrega structure:** specify the output shape (ranked list,
  table, binary verdict) so responses are comparable.

## Synthesis format

The synthesis Claude.ai returns should have these exact sections:

```
## Consensus
Decisions the 4 AIs (or 3-of-4) converged on. What to change (if
anything) or "no change."

## Disagreements resolved
Decisions where AIs contradicted each other. What each said. Which
lens is more relevant for this specific decision. Resolution + reason.

## Decisions to apply (diffs for Claude Code)
Concrete file + section + diff. E.g.:
"INSTAGRAM.md §3 link: replace 'github.com/...' with 'empty (Path A)'"

## Open decisions (user's call)
Decisions AIs didn't converge on. Options + trade-offs + recommendation.

## Risks flagged
Non-decision observations worth recording for future context.

## Meta
Which prompts were well-scoped, which produced weak signal, notes
for improving future validations.
```

## Human judgment filter (don't skip)

The synthesis is input to your decision, not the decision itself.
Expect to **reject 10–30% of AI recommendations on brand instinct**.
Document the rejections in the affected file so they don't get
silently re-added later.

Common rejection patterns observed:
- **Explaining the joke** — AIs add parenthetical annotations to
  wordplay. "Confident brands don't caption their own names."
- **Solving fake problems** — AIs sometimes invent problems to
  justify a recommendation. Verify the problem exists before fixing.
- **Pattern-breaking for preference** — stylistic swaps (middot →
  pipe) framed as evidence-based when they're just preference.
- **Resume vs posture** — AIs optimize for semantic density (87-char
  keyword-dense bio); brands often win on posture (52-char confident
  bio matching other-surface copy).

## Failure modes to watch

- **Source quality drift.** Treat Perplexity claims with URL-or-it-
  didn't-happen suspicion. Grok's specific account names often don't
  exist. Validate before citing.
- **Prompt bleed.** Reading one AI's response before writing the next
  AI's prompt contaminates the next round. Complete the 4 parallel
  before synthesis.
- **Premature convergence.** If 4 AIs rapidly agree, check whether the
  prompts were leading. Dissent is the signal; unanimity needs
  examination.
- **Scope creep in the audit.** The audit should only address the
  decisions the prompts asked about. If it starts recommending
  content strategy when asked about profile setup, cut that scope.

## Output artifacts

Each cross-AI validation produces two persistent files in `output/audits/`:

1. **Station file** — `output/audits/<topic>-station-<date>.md`. The
   self-contained prompt described in §Station file format. Frontmatter:
   `type: audit, status: station`. Stays where it was created; no move
   after use.
2. **Audit report** — `output/audits/<project>-<topic>-<date>.md`.
   Contains findings, decisions applied, decisions rejected with
   reasoning, open threads. Frontmatter: `type: audit, layer: output,
   status: applied`. Written by Claude Code after receiving the
   synthesized verdict from Claude.ai.

## Examples in this repo

- 2026-04-17 brand identity validation → findings integrated into
  projects/example-project/references/brand-identity.md §13
- 2026-04-18 IG profile setup validation →
  output/audits/milo-ia-ig-profile-validation-2026-04-18.md
  (2 changes applied + 1 clarification + 3 rejections preserved)

## Related

- Schema: frontmatter rules in .claude/rules/frontmatter.md
- Workflow: [.claude/commands/safe-change.md](../../.claude/commands/safe-change.md) applies the synthesized verdict

## Backlinks
<!-- backrefs:start -->
- [verification](../../.claude/rules/verification.md)
- [cross-validate](../../.claude/skills/cross-validate.md)
- [cross-validate-log](../../output/costs/cross-validate-log.md)
- [chatgpt-prompt-template](cross-ai-validation/templates/chatgpt-prompt-template.md)
- [claude-prompt-template](cross-ai-validation/templates/claude-prompt-template.md)
- [gemini-prompt-template](cross-ai-validation/templates/gemini-prompt-template.md)
- [perplexity-prompt-template](cross-ai-validation/templates/perplexity-prompt-template.md)
<!-- backrefs:end -->

