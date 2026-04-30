---
scope: framework
---

# Factual Verification Rules

Claims about fast-changing external facts must be verified with live
web search. Training data and memory go stale on these topics within
weeks, and flat assertions land in briefs or production artifacts
before the human catches them. These rules shift the friction of
"this changes fast" from human verification to agent workflow.

## Rule 1 — Categories that require live web search

Before asserting anything in these categories, run a web search
with results dated within the last 30 days:

- Features, models, pricing, rate limits, and plan availability of AI
  products (Anthropic, OpenAI, Google, Perplexity, xAI, etc.)
- Click-by-click setup steps on social platforms (IG, YT, TikTok,
  Meta, X) — UIs change month to month; show the date of the
  verification used
- Launch dates or availability of a specific feature
- Product status (beta, GA, research preview, deprecated)
- Recent legal events, lawsuits, regulations, platform policy changes
- Specific metrics (views, likes, followers, revenue) of any creator,
  competitor, or referent
- Any claim of the form "X is limited to Y" or "X only works on Z"
  about third-party products

Categories where memory is fine (no search needed):

- Prompting, copywriting, storytelling principles
- Marketing frameworks (JTBD, AIDA, etc.)
- Established technical concepts (SVG, markdown, git, HTTP)
- Content inside this repo (the owner is the authoritative source)
- Philosophy, psychology, pedagogy concepts

## Rule 2 — External AI output is a signal, not verification

When integrating information from Perplexity, ChatGPT, Gemini, Grok,
or any other external AI, that output is a secondary signal. It
must be cross-checked against a primary source via web search
before landing in a brief, spec, or decision.

## Rule 3 — Visible citation for critical claims

When a claim can change a production decision (title, required plan,
surface, technical spec, deploy target, purchase), attach a source
link AND the date of the page. No link + date = not a critical
claim; mark it as opinion or inference.

## Rule 4 — Re-verify sources older than 30 days

If the primary source is older than 30 days AND the topic falls
under Rule 1 categories, search again for a more recent source
before asserting.

## Rule 5 — Explicit confidence marking

When something was not verified, say so explicitly:

- "I recall that..." / "I haven't verified this, but..."
- "Per Perplexity, pending cross-check with another source..."

Never assert flatly with false confidence on Rule 1 topics.

## What these rules do not fix

These rules lower the hallucination rate. They do not eliminate it.

- Search may surface a contradictory source, and the wrong one may
  be weighted as authoritative.
- Search may return nothing clear, and the gap may be filled with
  inference without marking it.
- A result may be misread.

Owner judgment remains the last layer of verification on high-stakes
claims (production, purchases, irreversible decisions).

## Backlinks
<!-- backrefs:start -->
- [cross-validate](../skills/cross-validate.md)
- [AGENTS](../../AGENTS.md)
- [cross-ai-validation](../../wiki/playbooks/cross-ai-validation.md)
<!-- backrefs:end -->
