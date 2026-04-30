---
scope: framework
---

# /cross-validate — Multi-LLM Cross-Validation (wrapper)

This skill is a **thin wrapper** that points at the canonical
playbook:
[wiki/playbooks/cross-ai-validation.md](../../wiki/playbooks/cross-ai-validation.md).

The playbook describes the full multi-AI validation flow — extract
risks from an input, generate four role-specialized prompts, send
them to four validators in parallel (OpenAI / Gemini / Perplexity /
Claude), collect raw verdicts, synthesize a six-section summary, and
log costs. This wrapper exists so the slash command `/cross-validate`
keeps working as the entry point for invocation, while the
implementation details live in one canonical place under `wiki/`.

> **Note:** the playbook itself is not shipped pre-populated in the
> template. It is migrated in during the v1 → v2 transition. If you
> are scaffolding a fresh Kortex from this template, the playbook
> file does not yet exist — that's expected. Either copy it from
> your existing v1 repo or skip this skill until you need it.

---

## When to use

Same criterion as the playbook's *When to use this* section:

- **Yes:** brand / positioning decisions, copy that runs across
  multiple surfaces, architecture changes with high blast radius,
  content pieces moving from `in-validation` → `in-testing`,
  decisions of record (ADRs in `wiki/decisions/`), product sales
  scripts.
- **No:** draft copy, thumbnails, decisions with a 5-minute revert.

The cost cap (default $10/month) and budget-aware behavior are
defined in the playbook, not this wrapper.

---

## Invocation

```bash
# Default — all 4 validators with Pro models
pnpm kortex cross-validate <path-to-input-file>

# Or invoke as a slash command in Claude Code:
/cross-validate <path-to-input-file>

# Limit to specific external validators (Claude Opus always runs)
pnpm kortex cross-validate <file> --gemini-model gemini-2.5-flash
pnpm kortex cross-validate <file> --openai-model gpt-5.4 --gemini-model gemini-3.1-pro

# Interactive per-provider menu
pnpm kortex cross-validate <file> --ask-model
```

### Flag rules

- **0 flags** → all four defaults (`gpt-5.4`, `gemini-3.1-pro`,
  `perplexity/sonar-pro`, native Claude Opus).
- **1+ flags** → only the named providers + Claude Opus always.
  (Filter, not additive.)
- **`--ask-model`** → interactive menu per provider (Pro / cheap /
  skip).

Validate any model flag against the enum in the matching API
onboarding playbook (`wiki/playbooks/api-onboarding/<provider>.md`).
Unknown values abort with the list of valid models.

---

## Templates

The four role-specialized prompt templates live next to the
canonical playbook:

- [chatgpt-prompt-template.md](../../wiki/playbooks/cross-ai-validation/templates/chatgpt-prompt-template.md)
  — Brand Strategy Challenger
- [gemini-prompt-template.md](../../wiki/playbooks/cross-ai-validation/templates/gemini-prompt-template.md)
  — Abstract Reasoning + Structural Integrity Validator
- [perplexity-prompt-template.md](../../wiki/playbooks/cross-ai-validation/templates/perplexity-prompt-template.md)
  — Competitive Intelligence
- [claude-prompt-template.md](../../wiki/playbooks/cross-ai-validation/templates/claude-prompt-template.md)
  — Repo-Context Coherence Checker

Each template uses the placeholders described in the playbook
procedure (Step 4). When new models are added to provider enums, the
templates do not need updates — only the model flags accept new
values.

---

## Output structure

All outputs live next to the input file in
`<input-dir>/cross-validations/YYYY-MM-DD/`:

```
<input-dir>/
├── <input-file>.md
└── cross-validations/
    └── YYYY-MM-DD/
        ├── risks.md
        ├── prompts/
        │   ├── chatgpt-prompt.md
        │   ├── gemini-prompt.md
        │   ├── perplexity-prompt.md
        │   └── claude-prompt.md
        ├── chatgpt-raw.md
        ├── gemini-raw.md
        ├── perplexity-raw.md
        ├── claude-raw.md
        └── summary.md
```

The cost log is global, at
output/costs/cross-validate-log.md.

Multiple runs on the same day on the same input get suffixed dates:
`YYYY-MM-DD-2`, `YYYY-MM-DD-3`, etc.

---

## Related

- Canonical playbook: [wiki/playbooks/cross-ai-validation.md](../../wiki/playbooks/cross-ai-validation.md)
- API onboarding: `wiki/playbooks/api-onboarding/`
- Cost log: output/costs/cross-validate-log.md
- Verification rule (factual claims): [.claude/rules/verification.md](../rules/verification.md)
- Pre-commit API key validator: scripts/hooks/

## Backlinks
<!-- backrefs:start -->
- [verification](../rules/verification.md)
- [cross-validate-log](../../output/costs/cross-validate-log.md)
- [cross-ai-validation](../../wiki/playbooks/cross-ai-validation.md)
- [chatgpt-prompt-template](../../wiki/playbooks/cross-ai-validation/templates/chatgpt-prompt-template.md)
- [claude-prompt-template](../../wiki/playbooks/cross-ai-validation/templates/claude-prompt-template.md)
- [gemini-prompt-template](../../wiki/playbooks/cross-ai-validation/templates/gemini-prompt-template.md)
- [perplexity-prompt-template](../../wiki/playbooks/cross-ai-validation/templates/perplexity-prompt-template.md)
<!-- backrefs:end -->

