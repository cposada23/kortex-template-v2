---
title: Kortex v2 — Greenfield rebuild en repos nuevos
type: adr
layer: synthesis
language: es
tags:
  - decision
  - kortex
  - framework
  - v2
updated: 2026-04-29T00:00:00.000Z
status: active
distillation_level: 3
related_paths:
  - ../../output/kortex-v2-ultraplan-prompt.md
  - ../../projects/kortex/framework-improvement-plan-v6.md
  - ../../.claude/rules/write-authority.md
---

# Decisión — Kortex v2 greenfield rebuild en repos nuevos

**Fecha:** 2026-04-29
**Status:** Active — prompt diseñado y committed (`30ddc75`); ejecución
de Ultraplan pendiente en sesión separada.

---

## §1 Decisión

Construir Kortex v2 desde cero en **repos nuevos**, no parchear el
Kortex actual. v2 sale como **dos repos hermanos**:

- `cposada23/kortex-template-v2` (público) — el framework limpio que
  se presenta al mundo. Es lo que cualquier persona clona para
  arrancar su propia instancia. Sucesor del actual `kortex-template/`.
- `cposada23/mykortex` (privado) — la nueva instancia personal del
  owner, cloneada del template, donde se migra el contenido de
  `AI_knowledge` (v1).

El repo actual `cposada23/AI_knowledge` (v1 personal) **queda intocable
forever** — ni un archivo se modifica, ni un commit se hace en este
proceso. v1 sirve como única fuente de verdad de qué hacer y qué
NO hacer en v2.

---

## §2 Por qué

El framework v1 acumuló deuda estructural que el plan incremental v6
no puede resolver completamente:

- **Performance:** `/bridge-out` toma ~5 minutos hoy. Target v2: <60s
  (ideal <30s). Sin perder información.
- **Indexes lineales:** cada archivo nuevo requiere update manual de
  algún `INDEX.md`. No escala.
- **Duplicación de conocimiento** entre archivos (el audit de v2 la
  va a mapear concretamente).
- **Hidden coupling** — schema docs ↔ validators ↔ templates: tocás
  uno y otros rompen silenciosamente.
- **`/handoff` mal diseñado** — fuerza al owner a copy-paste el
  output al siguiente chat. Cero automatización.
- **Comandos vs skills overlap** — patrón no decidido sistémicamente.
- **Branching sin estrategia** — todo va a `main`; sin rama de
  trabajo diaria; sin auto-merge protegido.
- **Token cost no medido** — decisiones arquitecturales no incluyen
  costo en tokens como criterio.
- **Lock-in implícito a Claude** — el data model usa convenciones
  Claude-específicas (`CLAUDE.md`, `.claude/`); migrar a Cursor /
  ChatGPT / Gemini requeriría reescritura no-trivial.
- **`sources/courses/` mal nombrado** — el nombre sugiere material
  inmutable, pero son notas vivas de cursos en curso.

v6 mejora algunas piezas (Tier 1 cerró 8/8 items 2026-04-24), pero
parchear v1 hereda el shape del data model y los anti-patterns
estructurales. Greenfield permite rediseñar desde cero con todos los
aprendizajes acumulados.

---

## §3 Qué afecta

- **Roadmap de framework:** v6 pasa de "plan activo independiente" a
  "input para v2 design" — los Tier 2/3 items pendientes se evalúan
  durante el PRD de v2, no se ejecutan directamente.
- **Trabajo del owner:** mientras v2 se construye, v1 sigue siendo el
  sistema de trabajo diario. v2 reemplaza v1 solo cuando todo el
  contenido migró + workflows funcionan sin regresión.
- **Active artifacts:** `mcp-github` (kortex-lab) + `playwright-learning`
  (playground) mantienen su patrón actual (repo externo + gitignored
  + clone local). v2 los re-clona, no toca los repos externos.
- **Public template:** `kortex-template/` actual se freezea. El
  sucesor público es `kortex-template-v2`.
- **Cursos en curso:** `sources/courses/` se renombra a `learnings/`
  (o lo que Ultraplan proponga) en v2 — son notas vivas, no fuentes
  inmutables.

---

## §4 Alternativas consideradas

### 4.1 Continuar v6 incrementalmente (descartada)

Tier 1 ya está completo; Tier 2/3 quedan ~15 items. Pero v6 no toca
el data model ni redesigna handoff/bridge desde cero. El ceiling de
mejora es bajo.

**Por qué descartada:** los pain points load-bearing (perf, lock-in,
duplicación, indexes lineales) requieren cambios estructurales que
v6 no aborda.

### 4.2 Rebuild parcial — mantener `AI_knowledge` y crear template-v2 sólo (descartada)

Solo crear el template público v2 limpio, mantener el personal v1
como está.

**Por qué descartada:** los pain points están en el personal también.
Y el split "framework v2 + instancia v1" crearía drift permanente
entre los dos.

### 4.3 Greenfield con rebrand (descartada)

Cambiar nombre del framework (ej: "Khora", "Krome") para marcar
discontinuidad fuerte.

**Por qué descartada:** v1 era exploración interna; v2 es la primera
versión que se presenta al mundo. Continuidad de brand = "Kortex" se
mantiene.

### 4.4 Greenfield en repos nuevos (elegida)

Dos repos nuevos (`kortex-template-v2` + `mykortex`), v1 read-only
forever. Migración de contenido v1 → v2 personal sin tocar v1.

**Por qué elegida:** preserva v1 como fallback completo (si v2 no
convence, se sigue trabajando en v1); permite rediseñar arquitectura
sin restricciones de retrocompatibilidad; separa cleanly el framework
público del contenido personal.

---

## §5 Outcome (rolling — actualizar al cierre)

**2026-04-29 — Ultraplan prompt diseñado.**

- Prompt completo en output/kortex-v2-ultraplan-prompt.md.
- 5 mejoras de feedback Gemini integradas (lectura iterativa,
  heurísticas vs inventario en migration plan, handoff cross-surface
  local-vs-web AI, mobile sync edge case en branching, wall-clock
  empírico en performance baseline).
- Commit `30ddc75` pushed a `origin/main`.
- Hard rules locked: v1 read-only, stack Node + pnpm, cross-tool
  portable, cross-AI portable, single source of truth, security
  zero-leak, agéntico end-to-end.

**Pendiente próxima sesión:**

1. Invocar `/ultraplan` en sesión Claude Code nueva pegando el prompt.
2. Iterar comments inline en browser hasta que el plan cubra los 5
   deliverables (audit + research + PRD + migration + execution).
3. Aprobar plan, teleport con "Cancel" para guardar a archivo.
4. Sesión nueva: ejecutar `05-execution-playbook.md` agénticamente.
5. Checkpoints obligatorios del owner: post-template-scaffold,
   post-migration.
6. Cutover cuando v2 personal pueda ejecutar bridge / bridge-out /
   ingest / query / handoff sin regresión.

---

## §6 Provenance

- **Sesión origen:** 2026-04-29 (ver
  output/sessions/2026-04-29.md).
- **Decisión gateada por:** discusión con Claude.ai (prompt original),
  iteración con Claude Code (12 preguntas + 4 finales + 5 mejoras
  Gemini), cross-validación pendiente vía sub-agents Claude
  post-PRD.
- **No supersede a:** v6 plan (queda como input al PRD v2, no
  archivado todavía — se archiva cuando v2 cierre cutover).

## Backlinks
<!-- backrefs:start -->
_No incoming links._
<!-- backrefs:end -->

