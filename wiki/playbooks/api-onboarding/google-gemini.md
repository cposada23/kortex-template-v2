---
title: API Onboarding — Google Gemini
type: playbook
layer: synthesis
language: es
tags:
  - api
  - gemini
  - google
  - cross-validate
  - onboarding
updated: 2026-04-23T00:00:00.000Z
confidence: high
source_count: 4
last_verified: 2026-04-23T00:00:00.000Z
related_paths:
  - README.md
  - ../../../.claude/hooks/validate-api-keys.py
mirror: both
---

# API Onboarding — Google Gemini

Objetivo: salir con una API key de Google Gemini activa, free tier
suficiente para tests iniciales, la key guardada en `.env` y el env
var `GEMINI_API_KEY` exportable en zsh.

Tiempo estimado: 3-5 minutos. Es el proveedor más rápido de los tres.

## Requisitos

- Cuenta de Google (Gmail) personal o Workspace.
- Para el free tier: nada más. Sin tarjeta.
- Para paid tier (si lo necesitás eventualmente): tarjeta + $10 USD
  mínimo en prepaid (cambios que Google activó 2026-03-23).

## Pasos

### 1. Iniciar sesión en Google AI Studio

1. Ir a [aistudio.google.com](https://aistudio.google.com).
2. Click en **Sign in** y usar tu cuenta de Google existente. No
   hay signup separado — AI Studio reutiliza tu Google account.
3. **Aceptar términos** — aparece un pop-up con Google APIs Terms of
   Service + Gemini API Additional Terms. Marcar el checkbox
   obligatorio, opcionales a gusto, click **Continue**.

### 2. Generar la API key

1. Desde el dashboard de AI Studio, localizar el botón **Get API key**
   en la barra lateral izquierda (o ícono de llave en la navegación).
   Link directo: [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).
2. Click en **Create API key**.
3. Dos opciones:
   - **Create key in new project** (recomendado si es tu primer
     contacto) — Google crea un Google Cloud project automático llamado
     algo como `Generative Language Client`.
   - **Create key in existing project** — si ya tenés un proyecto GCP
     para Kortex.
4. La key se genera automáticamente. Formato: `AIza...` (39 caracteres).
5. **Copiá la key inmediatamente.** AI Studio la muestra clara una sola
   vez; después queda oculta parcialmente (los últimos 4 caracteres
   visibles).

### 3. Entender qué modelos tenés disponibles (free vs paid)

Cambios importantes que Google activó el 1 de abril de 2026: los
modelos **Pro series** fueron removidos del free tier. Consecuencia
directa para `cross-validate`:

| Modelo | Free tier (API)? | Uso recomendado |
|---|---|---|
| **Gemini 3.1 Pro** (preview) | ❌ Paid-only | Validador serio — default del skill cross-validate |
| Gemini 3 Pro | ❌ Descontinuado preview | Migrar a 3.1 Pro |
| Gemini 2.5 Pro | ❌ Paid-only por API | Fallback si 3.1 no está disponible |
| **Gemini 3 Flash** | ✅ Free con quota diaria reducida | Testing rápido del skill |
| **Gemini 2.5 Flash** | ✅ Free con quota baseline más alta | Testing rápido del skill — flag `--model gemini-2.5-flash` |

**Flag en el skill:**
- Default (sin flag): `gemini-3.1-pro` (paid, validación seria)
- Testing barato: `--gemini-model gemini-2.5-flash` (free tier)
- Prompt menu interactivo: `--ask-model` (muestra los del enum)

**Implicación operativa:**
- **Testing inicial** del skill cross-validate → flag `--gemini-model
  gemini-2.5-flash`. Gratis, no hace falta billing activado. Permite
  validar el flow del skill sin gastar.
- **Validación real** de ideas → default del skill = Gemini 3.1 Pro,
  requiere billing activado (ver sección 4).

Fuentes:
- [Google Blog — anuncio Gemini 3.1 Pro](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-pro/)
- [Gemini API release notes](https://ai.google.dev/gemini-api/docs/changelog)
- [Rate limits por modelo](https://ai.google.dev/gemini-api/docs/rate-limits)

Rate limits del free tier varían por modelo — consultar link de arriba
para los caps actuales. Al 2026-04-23 alcanzan cómodo para ~50-100
validaciones de testing.

### 4. (Necesario para usar Pro) Vincular billing + setear spend cap bajo

Saltear si vas a testear sólo con Flash. **Hacelo si querés usar
Gemini 3.1 Pro como validador del skill.**

**4.1 — Crear billing account + vincular tarjeta**

1. Ir a [console.cloud.google.com/billing](https://console.cloud.google.com/billing).
2. Crear una **Billing Account** + vincular tarjeta.
3. Linkear la billing account al proyecto Google Cloud asociado a tu
   API key.
4. **Modo prepaid (default para cuentas nuevas desde 2026-03-23)** —
   comprar créditos prepaid, mínimo **$10 USD**, máximo $5000, expiran
   a los 12 meses.
5. Tu proyecto pasa a **Tier 1** automáticamente al vincular billing.

**4.2 — Setear tu propio spend cap por debajo del tier cap (crítico)**

Google tiene dos niveles de cap. Entender los dos evita sustos:

- **Tier cap (mandatorio, no se puede desactivar)** — Tier 1 = $250/mes.
  Es el techo DURO de seguridad impuesto por Google.
- **Project-level spend cap (tu control)** — feature que Google agregó
  en marzo/abril 2026. Podés setear tu propio cap **por debajo** del
  tier cap. Ejemplo: $10/mes.

Cuando se llega a cualquiera de los dos (el que golpee primero), la
API pausa hasta el próximo ciclo de billing.

**Pasos para setear spend cap personal (ej. $10/mes):**

1. Ir a [aistudio.google.com](https://aistudio.google.com) con billing
   ya activado.
2. Abrir la página **Spend** (barra lateral izquierda).
3. Sección **Monthly spend cap** → click **Edit spend cap**.
4. Ingresar el monto (ej. `10`) → guardar.

Permiso requerido: rol **Editor / Owner / Admin** del proyecto GCP
(lo tenés automático si creaste el proyecto desde AI Studio).

**Caveat — delay de enforcement:** Google tiene un delay de ~10
minutos entre el momento que se llega al cap y la pausa efectiva.
Pueden colarse $0.50-$1 de overage. Recomendación: setear el cap
5-10% debajo del techo real (ej. si tu tope son $10, setealo en $9).

**Alternativa más defensiva (overkill para testing):** Budget Alerts
de Cloud Billing sólo notifican (email/webhook), **no frenan la API**.
Existe un patrón "kill switch" que pausa el billing del proyecto al
llegar al budget: [Medium — Fully Automated Kill Switch](https://medium.com/google-cloud/how-to-avoid-a-massive-cloud-bill-41a76251caba).
Para cross-validate con cap $10 el spend cap nuevo alcanza.

Fuentes oficiales:
- [Docs — Gemini API Billing](https://ai.google.dev/gemini-api/docs/billing) (sección Monthly spend cap)
- [Anuncio oficial — "More control over Gemini API costs"](https://blog.google/innovation-and-ai/technology/developers-tools/more-control-over-gemini-api-costs/)

### 5. Guardar la key en `.env`

Desde la raíz del repo de Kortex:

```bash
# Confirmar que .env está en .gitignore
grep -q "^\.env$" .gitignore && echo "OK" || echo "AGREGAR .env a .gitignore"
```

Si OK:

```bash
# Agregar a .env (reemplazar AIzaXXX con la key real)
echo 'GEMINI_API_KEY="AIzaXXX"' >> .env
```

### 6. Exportar en zsh y validar

```bash
export GEMINI_API_KEY="AIzaXXX"

# Test rápido — listar modelos disponibles
curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY" | head -c 300
```

Si devuelve JSON con un array `models`, la key funciona. Si devuelve
`{"error": ...}` con `403 PERMISSION_DENIED`, revisar que la Generative
Language API esté habilitada en el proyecto GCP asociado (a veces hay
que ir a Cloud Console y habilitarla manualmente).

## Costos típicos para `cross-validate`

Cap mensual del skill para Gemini: **$3 USD** (parte del cap total de
$10, split $4/$3/$3 según plan v6). Protección adicional: el
project-level spend cap de $10 que seteás en AI Studio (sección 4.2)
actúa como segundo gate duro.

**Por modo de uso:**
- **Testing del skill** (flag `--model gemini-2.5-flash`) → $0, corre
  en free tier. Usarlo mientras se itera sobre el prompt / scoring /
  format del skill.
- **Validación real** (default `--model gemini-3.1-pro`) → paid tier.
  Con el cap del skill ($3/mes) + spend cap de proyecto ($10/mes),
  ambos límites son seguros para testing extenso del primer mes.

Pricing actual: [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing).
Verificar antes de depender, especialmente porque el pricing de Gemini
Pro cambia frecuentemente (y 3.1 Pro está en preview — pricing sujeto
a cambios al GA).

## Rotación y seguridad

- Si sospechás que la key se expuso: ir a [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey),
  click en la key comprometida, **Delete API key**.
- Crear nueva con el mismo proyecto (o nuevo si querés aislamiento).
- Actualizar `.env`.

**Nota de quota compartida:** todas las keys de un mismo proyecto GCP
comparten quota. Si generás 3 keys "separadas" para 3 apps distintas
bajo el mismo proyecto, todas comparten el mismo rate limit. Para
aislamiento real: un proyecto GCP por app.

## Troubleshooting

**"API key not valid"** — typo, o la key fue deleted. Regenerar.

**"Permission denied" (403)** — Generative Language API no habilitada
en el proyecto GCP. Ir a Cloud Console → APIs → enable.

**"Quota exceeded" (429)** — pasaste el rate limit del free tier.
Esperar al reset de 60 segundos, o vincular billing para saltar a
Tier 1.

**Billing account linked pero siguen los errores** — puede tardar
hasta 10 minutos en propagar. Si después de eso sigue fallando, ir
a Cloud Console → IAM → verificar que la billing account está linked
al proyecto correcto.

## Referencias

- Docs oficiales: [ai.google.dev/gemini-api/docs/quickstart](https://ai.google.dev/gemini-api/docs/quickstart)
- API keys dashboard: [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- Billing: [ai.google.dev/gemini-api/docs/billing](https://ai.google.dev/gemini-api/docs/billing)
- Rate limits: [ai.google.dev/gemini-api/docs/rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- Pricing: [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing)

Verificado: 2026-04-23.

## Backlinks
<!-- backrefs:start -->
_No incoming links._
<!-- backrefs:end -->

