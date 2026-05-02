---
title: 'Herramienta: elegir estética para imagen con IA'
tags:
  - wiki/prompts
  - tipo/canon
layer: synthesis
category: prompts
type: concept
language: es
updated: 2026-04-28T00:00:00.000Z
distillation_level: 3
related_paths:
  - HERRAMIENTA_PROMPT_IMAGEN_IA.md
  - PROMPT_GUIA.md
  - >-
    ../../../sources/courses/ai-video-creators/notes/step-01-image-generation/1.4-aesthetic-types/README.md
  - >-
    ../../../sources/courses/ai-video-creators/notes/step-01-image-generation/1.3-visual-taste/README.md
---

# Herramienta: elegir estética para imagen con IA

**Propósito:** decidir **qué estética** (lenguaje visual) comunica tu intención **antes** de escribir el prompt largo. Complementa —no sustituye— `HERRAMIENTA_PROMPT_IMAGEN_IA.md`: primero **nombre la estética** y su vocabulario; luego arma sujeto, cámara y luz con la guía de imagen.

- **Teoría y los 7 tipos (aula):** `../../../sources/courses/ai-video-creators/notes/step-01-image-generation/1.4-aesthetic-types/README.md`.
- **Identidad repetible (taste sheet):** `../../../sources/courses/ai-video-creators/notes/step-01-image-generation/1.3-visual-taste/README.md`.
- **Prompts de texto general:** `PROMPT_GUIA.md`.

---

## Parte A — Elegir estética (español)

### A.1 Brief antes de preguntar al asistente

| Campo | Tu nota |
|--------|---------|
| **Objetivo del contenido** (thumbnail, anuncio, storytelling, producto…) | |
| **Audiencia** (quién debe entenderlo en 1 segundo) | |
| **Plataforma** (Reels, web, anuncio display, carrusel…) | |
| **Emoción que quieres** (confianza, drama, calma, poder, futuro…) | |
| **Qué NO quieres parecer** (stock genérico, infantil, corporativo frío…) | |
| **Referencias** (película, campaña, fotógrafo — opcional) | |
| **Restricciones** (sin texto en imagen, ratio, marca ya definida) | |

### A.2 Instrucciones para pegar en un chat (ChatGPT, Claude, etc.)

Copia el bloque como **primera instrucción**; luego pega el brief de **A.1** relleno (aunque sea incompleto).

```
You are a senior creative director. The user needs to CHOOSE a visual aesthetic for AI image generation (not write the full image prompt yet).

Use this taxonomy of PRIMARY aesthetics (pick exactly ONE as the lead, optionally ONE secondary at 20% influence):
1) Cinematic — story, drama, importance: dramatic light, depth, shallow DOF, film grading.
2) Minimalist — clarity, trust, premium: clean comp, neutral palette, soft diffused light, negative space.
3) Editorial / Fashion — confidence, luxury: bold pose, polished textures, studio lighting, campaign styling.
4) Dreamy / Soft — nostalgia, calm: pastels, glow/haze, gentle light, introspective mood.
5) Retro / Vintage — authenticity, memory: grain, warm tones, analog imperfections, candid feel.
6) Gritty / Dark — power, intensity: high contrast, deep shadows, rough textures, urban realism.
7) Futuristic / Tech — innovation, speed: neon/rim, chrome/glass, clean geometry, cool accents.

Tasks:
1) Recommend the PRIMARY aesthetic + optional substyle label if useful (e.g. cyberpunk, Y2K, dark academia — only if it fits).
2) Explain in 2 short sentences WHY it matches the user's goal (in Spanish).
3) Output a "style vocabulary block" in ENGLISH — exactly 5 labeled lines the user will paste into their image prompt:
   - COLOR: ...
   - LIGHT: ...
   - COMPOSITION: ...
   - TEXTURE: ...
   - MOOD: ...
4) List 4–6 words/phrases to AVOID so the image does not drift to the wrong aesthetic.
5) One line: how this pairs with the technical layers (subject, lens, lighting) without contradicting them.

Plain text only; no markdown headings in your output.
```

**Tu mensaje (usuario):**

```
Brief:
- Objetivo:
- Audiencia:
- Plataforma:
- Emoción deseada:
- Evitar parecer:
- Referencias:
- Restricciones:
```

### A.3 Cadena de decisión (sin asistente)

**Objetivo → emoción → estética → paleta y luz → referencias**

Si dudas entre dos, elige la que mejor responda: *“¿qué debe sentir alguien en el primer segundo?”*

### A.4 Después de elegir

1. Copia el **bloque de vocabulario** (COLOR / LIGHT / …) a tu prompt maestro o a **Parte A** de `HERRAMIENTA_PROMPT_IMAGEN_IA.md`.  
2. Mantén **la misma estética** en variaciones; si cambias solo un pilar (p. ej. luz), revisa si sigue alineada con la estética elegida.  
3. Opcional: documenta en tu **taste sheet** (1.3) la estética principal + subestilo.

---

## Parte B — Referencia rápida de estéticas (inglés para pegar en prompts)

*Misma lógica que Step 1.4; en inglés para coincidir con prompts de modelo y comunidad Skool.*

### B.1 Seven aesthetics — meta-message + prompt levers

| Aesthetic | Meta-message | Add to prompts (examples) |
|-----------|--------------|---------------------------|
| **Cinematic** | Story, emotion, importance | dramatic side or back light, shallow depth of field, film color grade, atmospheric haze, widescreen mood |
| **Minimalist** | Clarity, trust, modern premium | neutral palette, soft diffused light, generous negative space, single focal subject, no clutter |
| **Editorial / Fashion** | Confidence, trend, luxury | studio key + fill + rim, bold pose, campaign polish, controlled highlights, high-end retouch language (not plastic) |
| **Dreamy / Soft** | Nostalgia, calm, vulnerability | pastel or desaturated palette, bloom, gentle window light, low contrast, soft grain |
| **Retro / Vintage** | Authenticity, memory | visible film grain, warm cast, slight halation, analog lens character, candid framing |
| **Gritty / Dark** | Power, intensity, rebellion | low-key lighting, crushed blacks (where appropriate), rough material texture, urban realism, high contrast |
| **Futuristic / Tech** | Innovation, speed | rim and accent neons, chrome or glass, geometric environment, cool base with sharp accent color, crisp edges |

### B.2 Substyles (micro-aesthetics)

Use **one label** plus **one line** of cultural anchor when it helps the model:

| Substyle | Suggests |
|----------|----------|
| Cyberpunk / neo-noir | Teal-magenta, rain, neon, night city |
| Y2K / early digital | Gloss, chrome, playful saturation, flash |
| Dark academia | Muted earth, libraries, chiaroscuro, texture |
| Indie sleaze | Flash, grain, messy glamour, 2000s party |
| Barbiecore / pop pastel | High saturation pastels, playful, studio bright |

Substyles **refine** a primary aesthetic; they are not a substitute for naming light and palette.

### B.3 Director checklist (recognize any reference)

Ask: **dominant colors?** **How lit?** **Mood?** **Textures?** **Clean or busy frame?**  
If two answers conflict with your chosen aesthetic, **fix the prompt** before regenerating.

### B.4 Goal → aesthetic (shortcut)

| Goal | Lead aesthetic |
|------|----------------|
| Trailer beat, emotional ad | Cinematic |
| SaaS, skincare, clarity | Minimalist |
| High-end campaign, beauty | Editorial / Fashion |
| Lifestyle, memory, wellness calm | Dreamy / Soft |
| Heritage, documentary truth | Retro / Vintage |
| Sports, street, raw discipline | Gritty / Dark |
| AI product, futurist offer | Futuristic / Tech |

### B.5 Integration with the full image prompt

Order that works well in practice:

1. **Subject + action** (who / what)  
2. **Environment**  
3. **Camera** (shot, lens, aperture)  
4. **Lighting** (direction, quality, K if useful)  
5. **Aesthetic vocabulary** (this file — COLOR, LIGHT, COMPOSITION, TEXTURE, MOOD)  
6. **Constraints** (no text, ratio, no logos)

If the render looks “random,” check whether **aesthetic lines contradict** technical light (e.g. “minimalist” + “hard neon rim everywhere”).

---

*Skool Classroom: fechas y entregas oficiales. Esta herramienta es la referencia del repo para **elegir y nombrar** estética antes del prompt completo.*

## Backlinks
<!-- backrefs:start -->
_No incoming links._
<!-- backrefs:end -->

