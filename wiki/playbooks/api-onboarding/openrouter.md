---
title: API Onboarding — OpenRouter (gateway para Perplexity + fallback multi-modelo)
type: playbook
layer: synthesis
language: es
tags:
  - api
  - openrouter
  - perplexity
  - cross-validate
  - onboarding
updated: 2026-04-23T00:00:00.000Z
confidence: high
source_count: 5
last_verified: 2026-04-23T00:00:00.000Z
related_paths:
  - README.md
  - ../../../.claude/hooks/validate-api-keys.py
---

# API Onboarding — OpenRouter

OpenRouter es un **gateway unificado** que expone 300+ modelos LLM
(OpenAI, Gemini, Perplexity, Anthropic, Meta, xAI, DeepSeek, etc.) a
través de una sola API key. Pagás pass-through (sin markup sobre el
inference) + un fee de 5.5% sobre compras de crédito.

## Por qué OpenRouter en el stack de Kortex

**Primario:** acceso a **Perplexity Sonar Pro** — la API directa de
Perplexity pide un mínimo alto (observado ~$50 USD en sign-up
2026-04-23), incompatible con el $10 cap de cross-validate. Vía
OpenRouter: **sin mínimo + budget cap nativo por key + mismo precio
que Perplexity directo**.

**Secundario (opcional, no usado por default):** fallback si OpenAI
o Gemini cambian sus mínimos o políticas. Un solo OpenRouter key
puede servir los tres proveedores si se quisiera. Cross-validate
sigue usando keys directas para OpenAI y Gemini por default (costo
auditing más limpio por proveedor), OpenRouter se reserva para
Perplexity.

## Requisitos

- Cuenta de Google / GitHub / email para signup.
- Tarjeta de crédito o USDC (crypto) para cargar créditos.
- Sin minimum mensual, sin subscription.

## Pasos

### 1. Crear cuenta + obtener $1 de crédito gratis

1. Ir a [openrouter.ai](https://openrouter.ai).
2. Click en **Sign in** → elegir Google o GitHub (más rápido) o email.
3. Verificar email si aplica. Tras verificación: **$1 de crédito
   automático** aparece en la cuenta.
4. $1 alcanza para ~70 validaciones con Sonar Pro — suficiente para
   smoke test antes de cargar más.

### 2. Generar API key

1. Abrir [openrouter.ai/keys](https://openrouter.ai/keys) (o desde
   dashboard: avatar → **Keys**).
2. Click **Create Key**.
3. (Opcional pero recomendado) Nombre descriptivo: `kortex-cross-validate`.
4. **Budget cap por key (recomendado)** — en el mismo diálogo de
   creación podés asignar un spending cap al key. Ejemplo: `$10
   monthly`. Es hard cap: cuando se llega, requests con este key se
   rechazan hasta el reset. Más detalles en sección 4 abajo.
5. **Copiá la key inmediatamente.** Formato: `sk-or-v1-...`.
   OpenRouter la muestra una vez; después queda oculta.

### 3. Cargar créditos

1. Ir a [openrouter.ai/credits](https://openrouter.ai/credits) (o
   desde dashboard: avatar → **Credits**).
2. Click **Add credits**.
3. Ingresar monto. **No hay mínimo** — podés cargar $5, $10, $100.
4. Revisar el fee en el checkout antes de pagar:
   - **Tarjeta de crédito:** 5.5% fee, mínimo $0.80 por transacción.
     Ejemplo: cargás $10 → fee $0.80 (el 5.5% daría $0.55 pero el mín
     es $0.80) → recibís $9.20 de crédito usable.
   - **USDC (crypto):** 5% fee, mismo mínimo $0.80.
5. Confirmar pago. El saldo aparece en la cuenta.

**Nota sobre auto-recharge:** OpenRouter tiene opción de auto-top-up
(configurable en Credits settings). Para testing lo recomiendo
**desactivado** — forzás decisión manual cada vez que se agota.

### 4. Setear budget cap por key (Guardrails)

OpenRouter tiene un sistema de **Guardrails** que permite asignar
spending caps a API keys individuales. Esto es tu cap principal —
más preciso que depender del saldo total.

**Pasos:**

1. Ir a [openrouter.ai/keys](https://openrouter.ai/keys).
2. Click en el key que querés capear (o al crearlo en el paso 2).
3. Sección **Spending limit** o **Budget cap**:
   - Monto: `$10`
   - Reset cycle: `monthly` (también podés `daily` o `weekly`)
4. Guardar.

**Resultado:** cuando ese key alcance los $10 en el mes, OpenRouter
responde con error (típicamente `402` o equivalente). Otros keys de
la misma cuenta no se ven afectados — así podés tener múltiples keys
con caps distintos (ej. uno para cross-validate, otro para
experimentos, cada uno con su propio presupuesto).

**Doble protección:** saldo total de la cuenta actúa como cap
superior absoluto. Si cargás $10 y el key tiene cap $10, ambos
coinciden y tenés garantía dura de no gastar más.

### 5. Guardar la key en `.env`

Desde la raíz del repo de Kortex:

```bash
# Confirmar .env en .gitignore
grep -q "^\.env$" .gitignore && echo "OK" || echo "AGREGAR .env a .gitignore"
```

Si OK:

```bash
# Agregar a .env (reemplazar sk-or-v1-XXX con la key real)
echo 'OPENROUTER_API_KEY="sk-or-v1-XXX"' >> .env
```

### 6. Exportar en zsh y validar

```bash
export OPENROUTER_API_KEY="sk-or-v1-XXX"

# Test rápido — chat completion con Sonar Pro vía OpenRouter
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "perplexity/sonar-pro",
    "messages": [{"role": "user", "content": "ping"}]
  }' | head -c 400
```

Si devuelve JSON con `choices[0].message.content`, la key funciona.

Errores típicos:
- `401 Unauthorized` — key inválida.
- `402 Payment Required` — saldo o budget cap agotado.
- `400 Bad Request` con `"model not found"` — el model ID
  `perplexity/sonar-pro` cambió o es incorrecto (verificar en
  [openrouter.ai/perplexity](https://openrouter.ai/perplexity)).

## Modelos disponibles — enum para `cross-validate`

`cross-validate` usa OpenRouter exclusivamente para **Perplexity**.
Los demás proveedores (OpenAI, Gemini) van directo con sus keys
propias. Esta tabla es el enum del flag `--perplexity-model` — los
IDs incluyen el namespace `perplexity/` que OpenRouter requiere.

Estado al 2026-04-23 (verificar [openrouter.ai/perplexity](https://openrouter.ai/perplexity)):

| Model ID (OpenRouter) | Pricing in/out (USD per 1M tokens) | Uso en cross-validate |
|---|---|---|
| `perplexity/sonar` | $1 / $1 | **Testing** — iterar flow |
| **`perplexity/sonar-pro`** | $3 / $15 | **Default** — validación seria |
| `perplexity/sonar-reasoning` | $2 / $8 | Cuando querés reasoning visible |
| `perplexity/sonar-reasoning-pro` | $2 / $8 | Ideas muy analíticas |
| `perplexity/sonar-deep-research` | $2 / $8 + $5/1K searches + $3/1M reasoning tokens | Long-form — no recomendado para validación corta |
| `perplexity/sonar-pro-search` | $3 / $15 + $18 per 1K requests | Search-heavy con queries frescas |

**Flag en el skill:**
- Default (sin flag): `perplexity/sonar-pro`
- Testing barato: `--perplexity-model perplexity/sonar`
- Prompt menu interactivo: `--ask-model`

## Costos típicos para `cross-validate`

Cap mensual del skill para Perplexity vía OpenRouter: **$5 USD**
(parte del cap total de $10 con split $5 OpenAI / $5 Gemini — con
Perplexity como tercer proveedor extra, podés decidir el split que
te haga sentido; ver §T1.2 del plan v6 al updating).

Protecciones apiladas:
1. **Budget cap del key en OpenRouter** ($10/mes) — hard stop a
   nivel gateway.
2. **Saldo cargado** ($10) — hard stop a nivel cuenta.
3. **Cap del skill** ($5 lógico, tracked en `output/costs/cross-validate-log.md`)
   — soft check dentro del skill antes de cada call.

Con Sonar Pro a $3/$15 y una validación típica (~2K input + ~500
output), el costo por call es ~$0.013. $9.20 de saldo usable
después del fee = ~700 calls/mes — muy sobrado.

## Rotación y seguridad

- Si sospechás que la key se expuso: ir a
  [openrouter.ai/keys](https://openrouter.ai/keys), click en la key
  comprometida, **Revoke**.
- Crear nueva con el mismo budget cap.
- Actualizar `.env`.

El key en OpenRouter es más seguro que un key directo de Perplexity
porque el blast radius en caso de expose está limitado por el budget
cap del key, no por el saldo total.

## BYOK (Bring Your Own Key) — opcional, no usado por default

OpenRouter permite usar keys propias de otros proveedores
(Anthropic, OpenAI, etc.) ruteando por su gateway. Primeros 1M
requests BYOK gratis, luego 5% de lo que costaría en OpenRouter.
**Kortex no usa esto** — OpenAI y Gemini se llaman directo. BYOK
sólo aplica si alguna vez querés centralizar todos los gateways en
una sola interfaz.

## Troubleshooting

**`402 Payment Required` pero saldo > 0** — probablemente el budget
cap del key se agotó (no el saldo total de la cuenta). Verificar en
[openrouter.ai/keys](https://openrouter.ai/keys) → click en el key →
spending this month.

**Modelo cambió de nombre** — OpenRouter a veces renombra/versiona
modelos. Si un call falla con "model not found", revisar el catálogo
live: [openrouter.ai/perplexity](https://openrouter.ai/perplexity).

**Latencia más alta que Perplexity directo** — OpenRouter añade un
hop de red. Diferencia típica es 100-300ms. Irrelevante para
cross-validate (no es real-time).

**Citación / metadata de búsqueda missing** — algunos campos que
Perplexity devuelve directo pueden no propagarse via OpenRouter.
Verificar el shape de la respuesta antes de depender. Sonar Pro
citations suelen venir bien.

## Referencias

- Docs oficiales: [openrouter.ai/docs](https://openrouter.ai/docs)
- Perplexity catalog en OpenRouter: [openrouter.ai/perplexity](https://openrouter.ai/perplexity)
- Pricing general: [openrouter.ai/pricing](https://openrouter.ai/pricing)
- Guardrails (budget cap per key): [openrouter.ai/docs/guides/features/guardrails](https://openrouter.ai/docs/guides/features/guardrails)
- FAQ oficial: [openrouter.ai/docs/faq](https://openrouter.ai/docs/faq)

Verificado: 2026-04-23.

## Backlinks
<!-- backrefs:start -->
_No incoming links._
<!-- backrefs:end -->

