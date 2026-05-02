---
title: 'Herramienta: prompts para definir e iterar nichos (IA)'
tags:
  - wiki/prompts
  - tipo/prompt
layer: synthesis
category: prompts
type: reference
language: es
updated: 2026-04-28T00:00:00.000Z
distillation_level: 3
related_paths:
  - ../../concepts/strategy/FICHA_NICHO.md
  - ../../concepts/strategy/MARKETING_FUNDAMENTOS.md
  - PROMPT_GUIA.md
---

# Herramienta: prompts para definir e iterar nichos (IA)

**Para qué sirve:** usar ChatGPT, Claude, Gemini, etc. para **generar ideas de nicho**, **comparar variantes**, **rellenar la ficha** o **criticar** si un nicho es vago o demasiado amplio.

**Documento vivo (tu nicho elegido):** `../../concepts/strategy/FICHA_NICHO.md` — copia ahí lo que valides; esta herramienta no sustituye la ficha, la alimenta.

**Marco de oferta / precio:** `../../concepts/strategy/MARKETING_FUNDAMENTOS.md`.

**Prompts en general:** `PROMPT_GUIA.md`.

---

## A. Brief rápido (rellena antes de abrir el chat)

| Campo | Tu nota |
|--------|---------|
| **Quién eres tú** (skills, credenciales, tiempo/semana) | |
| **Mercado / idioma** (ej. LATAM español, US inglés) | |
| **Formato de contenido** (faceless, cámara, B-roll, mix) | |
| **Temas que te interesan** (3–5 bullets) | |
| **Temas que NO quieres** | |
| **Nivel de la audiencia** (principiante / intermedio) | |
| **Restricciones** (sin aparecer, solo X red, nicho “family safe”, etc.) | |

---

## B. Bloque sistema — lluvia de nichos (5–10 ideas)

Pégalo como instrucción de sistema o primer mensaje.

```
You are a direct-response marketer and niche strategist. The user will describe their skills, interests, and constraints (Spanish or English).

Task: propose 8 DISTINCT niche ideas for content + digital products/affiliate paths. Each idea must include:
1) One-line niche label (specific, not "motivation" generic)
2) Target avatar (age range, situation, main pain in one sentence)
3) Promise in one sentence (outcome in 30–90 days style)
4) Why it fits THIS user (based on what they told you)
5) Difficulty 1–5 and saturation 1–5 (honest)

Rules:
- Avoid illegal/unethical niches.
- Prefer niches with clear search intent or strong emotion.
- Write section titles in Spanish if the user writes in Spanish; keep labels scannable.
- End with: "Top 2 to validate this week" with reasoning.
```

**Usuario (ejemplo):**

```
Soy ingeniero, quiero faceless, español LATAM, 5–8h/semana. Me interesan fitness, IA para crear contenido, y hábitos. No quiero aparecer en cámara.
```

---

## C. Bloque sistema — expandir UNA idea a ficha completa

```
You are a niche strategist. The user chose ONE niche idea.

Output a complete "Ficha de Nicho" in Spanish using EXACTLY these Markdown sections and headings:

## Nicho
## Avatar (audiencia)
## Dolor (microproblema)
## Promesa (resultado deseado)
## Angulo (para diferenciarte)
## Estilo de comunicacion
## Pilares de contenido (para no quedarte sin ideas)
## 10 ideas de contenido (con enfoque directo + accion)

Rules:
- Be specific; ban words like "everyone", "success", "transform your life" without mechanics.
- Pilares: exactly 5 numbered items.
- Content ideas: 10 numbered items; each with Hook + Idea + Acción (short).
- Tone: direct, actionable, no fluff.
```

**Usuario:** pega la idea elegida + el brief de la tabla A.

---

## D. Bloque sistema — crítica de nicho (sanity check)

```
You are a skeptical growth advisor. Critique the niche the user pasted.

Checklist (answer each briefly):
1) Is the avatar too broad? Who exactly pays?
2) Is the pain acute enough that they search or save content?
3) Is the promise measurable?
4) Competition: how to differentiate in 1 sentence?
5) One risk (legal, burnout, platform ban) if any.

Finish with: "Veredicto: Ajustar / Pivotar / Validar con 5 posts" and 3 concrete edits to the wording.
```

---

## E. Bloque sistema — subnicho desde categoría grande

```
The user gives a BROAD category (e.g. "fitness", "IA", "finanzas personales").

Generate 6 SUBNICHES that are:
- Specific situation or identity + one clear pain
- Suitable for short-form video + eventual infoproduct or affiliate

Format as a table: Subnicho | Avatar | Dolor | Promesa en una línea | Ejemplo de hook para Short.

Language: match the user's language.
```

---

## F. Bucle práctico

1. Ejecuta **B** → elige 2 ideas.  
2. Para la favorita, ejecuta **D** (crítica) y ajusta.  
3. Ejecuta **C** → pega el resultado en `../../concepts/strategy/FICHA_NICHO.md` (edita a mano lo que no encaje).  
4. Cruza promesa y precio con `../../concepts/strategy/MARKETING_FUNDAMENTOS.md`.

---

*Itera la ficha cuando cambies de vertical o de avatar; guarda versiones en git o copia la sección antigua al final de `FICHA_NICHO.md` comentada.*

## Backlinks
<!-- backrefs:start -->
_No incoming links._
<!-- backrefs:end -->

