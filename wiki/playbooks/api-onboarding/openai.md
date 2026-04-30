---
title: API Onboarding — OpenAI
type: playbook
layer: synthesis
language: es
tags:
  - api
  - openai
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

# API Onboarding — OpenAI

Objetivo: salir con una API key de OpenAI activa, $5 USD de saldo
prepaid, la key guardada en `.env` y el env var `OPENAI_API_KEY`
exportable en zsh.

Tiempo estimado: 10-15 minutos (incluye verificación SMS).

## Requisitos

- Cuenta de Google / Microsoft / Apple (o email + SMS para signup).
- Tarjeta de crédito o débito internacional que acepte cobros en USD.
- Número de teléfono para verificación SMS (obligatorio).

## Pasos

### 1. Crear cuenta en OpenAI Platform

1. Ir a [platform.openai.com](https://platform.openai.com).
2. Click en **Sign up** (o **Log in** si ya tenés cuenta de ChatGPT —
   la misma credencial funciona).
3. Completar signup con Google / Microsoft / Apple, o email + password.
4. Verificar el email (link al buzón).
5. **Verificación por SMS** — obligatoria. Proveer número telefónico,
   recibir código SMS, ingresarlo. Sin este paso no se puede generar
   API key.

### 2. Configurar billing prepaid

OpenAI opera hoy con **prepaid billing por default** (depósito antes
de usar). No hay pay-as-you-go estilo factura mensual para cuentas
nuevas.

1. Desde el dashboard, abrir **Settings** → **Billing** (barra lateral
   izquierda) o ir directo a
   [platform.openai.com/settings/organization/billing](https://platform.openai.com/settings/organization/billing).
2. Click en **Add payment method** → ingresar tarjeta.
3. Click en **Add to credit balance**.
4. Ingresar monto: **mínimo $5 USD**, recomendado para tests iniciales
   del skill `cross-validate`. Máximo depende del Trust Tier de tu
   cuenta (inicia en Tier 1 con caps bajos).
5. **Dejar Auto recharge DESACTIVADO** — crítico para cappear el gasto.
   OpenAI removió el hard-cap de spending en 2026: el "Monthly budget
   limit" ahora es sólo un alert, no frena la API. La única forma de
   limitar gasto duro es **saldo prepaid sin auto-recharge** — cuando
   el balance llega a $0, la API se detiene.
6. Confirmar pago. El saldo aparece en el dashboard.

**Spend cap efectivo para cross-validate:**
- Cargá exactamente lo que querés gastar máximo (ej. **$10**) y
  **desactivá auto-recharge**. Cuando los $10 se agoten, el skill
  falla con 429/quota exceeded y tenés que decidir conscientemente
  si recargás.
- Alerts adicionales opcionales: **Settings → Limits** → setear "email
  alert" al 50/80/95% del saldo. Solo notifica, no frena.

**Notas de billing:**
- Créditos expiran a los 12 meses, no son reembolsables.
- El mínimo de auto-recharge también es $5.
- El Trust Tier sube automáticamente con uso y antigüedad — más
  tier = rate limits más altos + acceso a más modelos.

### 3. Generar la API key

1. Ir a [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
2. Click en **Create new secret key**.
3. En el diálogo:
   - **Name:** `kortex-cross-validate` (descriptivo — facilita rotar
     keys después si se compromete).
   - **Project:** dejar en default (o crear uno llamado `kortex` si
     querés aislamiento contable).
   - **Permissions:** All (para testing). Podés restringir después.
4. Click **Create secret key**.
5. **Copiá la key inmediatamente.** OpenAI la muestra una sola vez.
   Si la perdés tenés que generar otra.
   Formato: `sk-proj-...` (proyecto scoped) o `sk-...` (legacy).

### 4. Guardar la key en `.env`

Desde la raíz del repo de Kortex:

```bash
# Verificar que .env está en .gitignore primero
grep -q "^\.env$" .gitignore && echo "OK" || echo "AGREGAR .env a .gitignore"
```

Si el check dice OK:

```bash
# Si no existe .env, crearlo
touch .env

# Agregar la key (reemplazar sk-proj-XXX con la key real)
echo 'OPENAI_API_KEY="sk-proj-XXX"' >> .env
```

**Nunca** pongas la key directo en un script, en un commit, o en un
archivo markdown. El hook [.claude/hooks/validate-api-keys.py](../../../.claude/hooks/validate-api-keys.py)
bloquea commits que la incluyan.

### 5. Exportar en zsh para pruebas rápidas

Para usar en la shell actual:

```bash
export OPENAI_API_KEY="sk-proj-XXX"
```

Para persistir en sesiones futuras — agregarlo a `~/.zshrc` **solo si
querés que esté disponible fuera de este repo**. Lo recomendado es
dejarlo sólo en `.env` del repo y que el skill lo lea desde ahí.

### 6. Validar que funciona

```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY" | head -c 300
```

Si ves JSON con modelos disponibles (empezando por `{"object":"list"`),
la key funciona. Si ves `{"error": ...}` con 401, revisar copia/pega
de la key.

## Modelos disponibles — enum para `cross-validate`

`cross-validate` lee esta tabla para validar el flag
`--openai-model <name>`. Cuando salgan modelos nuevos, actualizar
esta sección (y el skill lo toma automático sin cambio de código).

Estado al 2026-04-23 (verificar [platform.openai.com/docs/models](https://platform.openai.com/docs/models)
para catálogo actualizado):

| Model ID | Rol | Pricing tier | Uso en cross-validate |
|---|---|---|---|
| **`gpt-5.4`** | Frontier reasoning + coding | Alto | **Default** — validación seria |
| `gpt-5.4-mini` | Capacidades de 5.4 a menor latencia/costo | Medio | Alternativa mid-range |
| `gpt-5.4-nano` | High-volume / tareas simples | Bajo | **Testing** — iterar flow del skill |
| `gpt-5.4-pro` | Responses API only — problemas más duros | Más alto | Para ideas particularmente complejas |
| `gpt-5.3-codex` | Agentic coding specialist | Alto | No aplica — es para código, no ideación |
| `gpt-5` / `gpt-5.1` / `gpt-5.2` / `gpt-5.3` | Legacy frontier tiers | Variable | Fallback si un 5.4 está deprecado |

**Flag en el skill:**
- Default (sin flag): `gpt-5.4`
- Testing barato: `--openai-model gpt-5.4-nano`
- Prompt menu interactivo: `--ask-model` (muestra los del enum)

Fuentes:
- [OpenAI Model Release Notes](https://help.openai.com/en/articles/9624314-model-release-notes) (oficial)
- [Models dashboard](https://platform.openai.com/docs/models) (live)

## Costos típicos para `cross-validate`

El cap mensual del skill `cross-validate` es **$4 USD** para OpenAI
(parte del cap total de $10, split $4/$3/$3 según plan v6).

Con $5 de saldo inicial tenés ~1 mes completo de uso normal del skill
+ margen. Si rompés el cap por uso intenso, el skill aborta antes de
gastar.

Precios de referencia (consultar pricing actual en
[openai.com/api/pricing](https://openai.com/api/pricing) antes de
depender):

- El costo exacto depende del modelo seleccionado en el plan v6
  (§T1.2). Cross-validate hace ~1 request por idea validada.
- Plan v6 estima ~$0.50-$1.00 por idea a precios actuales.

## Rotación y seguridad

- Si sospechás que la key se expuso: **revocarla inmediatamente** en
  [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
  (click en la key → Revoke).
- Crear nueva con el mismo nombre.
- Actualizar `.env`.
- Si la key apareció en un commit que pusheaste: revocar + rotar +
  `git filter-repo` o equivalente para limpiar historia (contactar
  soporte si hay abuse).

## Troubleshooting

**"Billing account not ready"** — saldo en $0. Cargar más créditos.

**"You exceeded your current quota"** — saldo agotado. Cargar más o
esperar reset del Trust Tier.

**"Invalid API key"** — typo en copia, o key revocada. Regenerar.

**Rate limit hit muy temprano** — Trust Tier bajo. Se sube con uso +
tiempo; para testing 5-10 requests/min alcanza incluso en Tier 1.

## Referencias

- Docs oficiales: [platform.openai.com/docs/quickstart](https://platform.openai.com/docs/quickstart)
- API keys dashboard: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- Billing help: [help.openai.com — prepaid billing](https://help.openai.com/en/articles/8264644-how-can-i-set-up-prepaid-billing)
- Pricing: [openai.com/api/pricing](https://openai.com/api/pricing)

Verificado: 2026-04-23.

## Backlinks
<!-- backrefs:start -->
_No incoming links._
<!-- backrefs:end -->

