---
title: "Cross-AI validation — playbook (stub)"
type: playbook
layer: synthesis
language: en-es
tags: [cross-validate, multi-llm, validation, stub]
updated: 2026-04-30
mirror: framework
status: draft
distillation_level: 0
---

# Cross-AI Validation — playbook (stub)

This file is a **placeholder**. The full playbook is migrated in from
v1 during the v1 → v2 transition; the template ships this stub so the
[`/cross-validate` skill wrapper](../../.claude/skills/cross-validate.md)
and the four prompt templates under
[cross-ai-validation/templates/](cross-ai-validation/templates/) have
a target to link to. Without this file the link validator would block
any commit that touches them.

If you are scaffolding a fresh Kortex from this template and you want
to use cross-validation, you have two options:

1. **Copy the canonical playbook from a v1 Kortex repo.** The v1 path
   is `wiki/playbooks/cross-ai-validation.md`. Drop the contents into
   this file and update the frontmatter to drop the `stub` tag and
   set `distillation_level: 4`.
2. **Write your own from scratch** using the four prompt templates
   here as the role definitions and the
   [`/cross-validate` skill wrapper](../../.claude/skills/cross-validate.md)
   as the procedure spec.

---

## Expected sections (when this stub is replaced)

The full playbook covers:

1. **When to use this** — criteria for invoking cross-validation
   (high-blast-radius decisions, brand/positioning, multi-surface
   copy, ADRs, sales scripts).
2. **The 4 AIs and their roles** — canonical role definitions for
   each of the four validators (Brand Strategy Challenger, Abstract
   Reasoning, Competitive Intelligence, Repo-Context Coherence
   Checker). The four prompt templates under
   [templates/](cross-ai-validation/templates/) operationalize these
   roles.
3. **Risk extraction** — how the pre-pass identifies 5–8 risks and
   assigns each to the validator best positioned to catch it.
4. **Prompt generation** — placeholders, how the skill fills them.
5. **Synthesis format** — the six-section summary the synthesizer
   produces from the four raw verdicts.
6. **Cost cap behavior** — default $10/month MTD cap, hard stop on
   excess, manual fallback when the cap is reached.

---

## Related

- Skill wrapper: [.claude/skills/cross-validate.md](../../.claude/skills/cross-validate.md)
- Prompt templates: [templates/](cross-ai-validation/templates/)
- Cost log: [output/costs/cross-validate-log.md](../../output/costs/cross-validate-log.md)
- Verification rule: [.claude/rules/verification.md](../../.claude/rules/verification.md)

## Backlinks
<!-- backrefs:start -->
- [cross-validate](../../.claude/skills/cross-validate.md)
- [chatgpt-prompt-template](cross-ai-validation/templates/chatgpt-prompt-template.md)
- [claude-prompt-template](cross-ai-validation/templates/claude-prompt-template.md)
- [gemini-prompt-template](cross-ai-validation/templates/gemini-prompt-template.md)
- [perplexity-prompt-template](cross-ai-validation/templates/perplexity-prompt-template.md)
<!-- backrefs:end -->
