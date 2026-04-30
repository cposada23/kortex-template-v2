---
title: Browser Automation con Playwright + Claude Code
type: playbook
layer: synthesis
language: es
tags:
  - playbook
  - claude-code
  - playwright
  - browser-automation
  - skills
updated: 2026-04-27T00:00:00.000Z
status: active
related_paths:
  - ultraplan-cloud-planning.md
  - superpowers-evaluation.md
confidence: medium
source_count: 5
last_verified: 2026-04-26T00:00:00.000Z
mirror: both
---

# Browser Automation con Playwright + Claude Code

> **Scope:** este playbook fija doctrina y workflows para usar
> **Claude Code + Playwright** en cualquier proyecto que necesite
> manejar un navegador (QA de web apps, scraping de datos públicos,
> automatización de tareas web recurrentes).
>
> **Cross-project:** intencionalmente generic — sin referencias a
> estructura interna de un repo concreto. Los 3 ejemplos pedagógicos
> §11 son proyectos descartables sobre GitHub.com + sitios públicos
> de práctica que cualquier dev puede construir para aprender la
> herramienta.

---

## TL;DR

1. **Para Claude Code, usar `@playwright/cli` (Microsoft, 2026)** —
   no Playwright MCP, no scripts manuales con `playwright` como
   library. CLI escribe snapshots a disco, no al context window;
   Microsoft / TestDino reportan ~75% menos tokens en flows
   idénticos vs MCP (ver §2.2 — claim secundaria, vale re-verificar
   en tu propio caso).
2. **Empaquetar workflows reusables como Claude Code Skills** —
   carpeta con `SKILL.md` + scripts auxiliares + ejemplos. Una vez
   tuneada, se invoca por nombre.
3. **Para sesiones autenticadas** — login una vez en headed, dump
   `storageState` a JSON, reuse en todos los runs siguientes.
   Headless por default después del primer login.
4. **Loops de iteración son el patrón** — Claude Code corre el
   workflow, screenshot, lee output, encuentra bug, fixea (la app
   o el script), re-corre. Hasta verde.
5. **`@playwright/test` clásico no muere** — sigue siendo lo
   correcto para suites E2E que viven en CI/CD con `.spec.ts`,
   reporter HTML, reintentos. CLI y Test son complementarios, no
   excluyentes.

---

## §1 Por qué este playbook existe

Cualquier proyecto serio que tenga UI web va a necesitar mover un
navegador desde Claude Code en algún momento: validar microsites
antes de deploy, scrapear datos públicos, automatizar tareas en
plataformas que no exponen API, generar tests E2E.

Sin un playbook, cada proyecto reinventa el approach: alguno usa
Playwright MCP (token-hungry), otro escribe scripts node sueltos sin
estructura, otro intenta usar Selenium "porque está en la cabeza".
Resultado: inconsistencia + token waste + ningún workflow se vuelve
reusable.

Este playbook fija:

1. **Cuál herramienta usar y por qué** (CLI vs MCP vs Test).
2. **Cómo correr 3 workflows core**: QA loop, scraping con learning
   loop, sesiones autenticadas vía storage state.
3. **Cómo empaquetar como skill** para invocación consistente.
4. **Cuándo headed y cuándo headless.**
5. **Cuándo construir un framework propio** vs seguir caso a caso.
6. **Ejemplos pedagógicos** (§11) para aprender los 3 workflows en
   proyectos descartables sin tocar producción.

---

## §2 Mapa del ecosistema Playwright 2026

Verificación hecha 2026-04-26 contra
[playwright.dev/docs/getting-started-cli](https://playwright.dev/docs/getting-started-cli)
y [github.com/microsoft/playwright-cli](https://github.com/microsoft/playwright-cli).

### §2.1 Tres sabores, tres propósitos distintos

| Herramienta | Paquete npm | Para qué | Cuándo usar |
|---|---|---|---|
| **Playwright CLI** | `@playwright/cli` | Comandos shell directos: `playwright-cli open`, `click`, `type`, `screenshot`. Snapshots se escriben a disco, NO al context window. | **Default para Claude Code.** Workflows ad-hoc, scripts skill-friendly, exploración. |
| **Playwright Test** | `@playwright/test` | Test framework con `.spec.ts`, `expect()`, fixtures, reporter HTML, traces. | Suites E2E formales que corren en CI/CD. |
| **Playwright MCP** | `@playwright/mcp` | MCP server que expone tools de browser a un agente. Cada turn carga accessibility tree completo. | Solo cuando se necesita persistent state + introspection rica + loops autónomos largos. **Default NO.** |

### §2.2 Por qué CLI > MCP para Claude Code (claim a verificar en tu caso)

> "playwright-cli is best for coding agents (Claude Code, GitHub
> Copilot, etc.) that favor token-efficient, skill-based workflows.
> CLI commands avoid loading large tool schemas and verbose
> accessibility trees into the model context, allowing agents to
> act through concise, purpose-built commands."

Benchmark publicado por Microsoft / TestDino (abril 2026): en un
flow idéntico de 30 acciones (abrir docs site, click 10 sidebars,
screenshot + snapshot en cada uno), **"~115,000 tokens with MCP vs
~25,000 with CLI for identical tasks, leaving 75%+ of the context
window free for actual coding work"**.

> ⚠️ **Re-verificación recomendada:** este benchmark viene de una
> fuente secundaria (TestDino blog post, no Anthropic ni Microsoft
> directo). Vale correr tu propio test antes de tomarlo como
> decisión arquitectural — `playwright-cli open <url> + 10 click +
> 10 screenshot` y comparar tokens consumidos vs el mismo flow con
> `@playwright/mcp`. Si tu medición confirma 4× o más de eficiencia,
> CLI default está justificado para tu caso.

La razón mecánica del approach: el CLI escribe los snapshots a
archivos en `.playwright-cli/page-<timestamp>.yml` y devuelve al
agente solo el path del archivo. El agente lee el archivo solo
cuando lo necesita. MCP, en cambio, manda el tree completo en el
response de cada herramienta.

### §2.3 Cuándo MCP sigue ganando

> "MCP is best for specialized agentic loops that benefit from
> persistent state and iterative reasoning over page structure,
> such as exploratory automation or long-running autonomous workflows."

Caso típico: bot que corre 24/7 en background haciendo tareas en
una plataforma con UI cambiante. Ahí el MCP justifica el costo en
tokens porque la persistencia y la introspección rica están
haciendo trabajo real.

Para el 80% de los casos típicos — validar un microsite antes de
ship, scrapear una landing, correr smoke tests post-deploy — **CLI
gana** (sujeto a la verificación de §2.2).

---

## §3 Stack recomendado

### §3.1 Default stack

| Capa | Herramienta | Cuándo |
|---|---|---|
| **Browser commands ad-hoc** | `@playwright/cli` | Exploración, debugging, one-shots, workflows que el agente compone en vivo |
| **Workflows reusables** | Scripts `.ts` con `playwright` library + Claude Code Skill | Cuando el mismo flujo se va a correr 5+ veces |
| **Test suites E2E** | `@playwright/test` con `.spec.ts` | Cuando el proyecto ya tiene CI/CD y los tests son contrato |
| **Estado autenticado** | `storageState.json` + `playwright/.auth/` (gitignored) | Cualquier flujo que necesita login |

### §3.2 Setup mínimo en un proyecto nuevo

Asumo que estás en el root del proyecto donde vas a usar Playwright
(podés crear uno descartable con `mkdir -p ~/projects/playwright-tests
&& cd $_ && git init` si es solo para aprender).

```sh
# 1. Inicializar package.json si no existe
pnpm init

# 2. Instalar la trinidad Playwright relevante
pnpm add -D @playwright/cli @playwright/test playwright

# 3. Bajar los browsers (Chromium suele alcanzar)
pnpm exec playwright install chromium

# 4. Carpeta para storage state (gitignored desde día uno)
mkdir -p playwright/.auth
echo "playwright/.auth" >> .gitignore
echo ".playwright-cli" >> .gitignore

# 5. Verificar que CLI responde
pnpm exec playwright-cli --version
```

**Nota sobre versiones:** según [docs oficiales](https://playwright.dev/docs/intro),
Playwright requiere **Node.js 20.x, 22.x o 24.x** + Windows 11+,
WSL, Debian 12/13, o Ubuntu 22.04/24.04 (x86-64 o arm64). Verificar
con `node -v` antes de instalar.

### §3.3 Estructura interna del proyecto

```
<tu-proyecto>/
├── package.json
├── playwright.config.ts            # solo si se usa @playwright/test
├── .gitignore                      # incluye playwright/.auth y .playwright-cli
├── src/
│   └── ...
├── scripts/                        # workflows reusables (lo que va en skills)
│   ├── qa-form-flow.ts
│   ├── scrape-listings.ts
│   └── login-and-dump-state.ts
├── tests/
│   └── e2e/
│       └── *.spec.ts               # @playwright/test suites formales
├── playwright/
│   └── .auth/                      # gitignored — storage state JSONs
│       └── <session-name>.json
└── .playwright-cli/                # gitignored — snapshots auto-generados
```

### §3.4 Justificación zero-dependency

Stack core son **3 paquetes** todos del mismo ecosistema oficial
Microsoft. Sin librerías de terceros, sin frameworks adicionales.
Alineado con regla común "zero-dependency build priority": si el
problema se resuelve con stdlib + 1-3 paquetes oficiales, no traer
un cuarto.

Cualquier dep adicional (ej. `dotenv` para gestión de credenciales,
`csv-parse` si scrapeás a CSV) requiere justificación en el README
del proyecto.

---

## §4 Workflow #1 — QA loop (test → bug → fix → re-test)

Patrón estrella para validar UIs. El humano describe el flujo a
testear, Claude Code lo ejecuta con un browser, encuentra bugs,
fixea (la app o el script de test) y vuelve a correr. Hasta verde.

### §4.1 Flujo paso a paso

**Caso de ejemplo (genérico):** validar que un form multi-paso de
una web app funciona end-to-end.

#### Paso 1 — Plan mode en Claude Code

Desde el proyecto, abrir Claude Code y entrar en plan mode:

```
Plan: necesito validar el form de onboarding de mi web app local
en http://localhost:3000. Tiene 8 páginas, una pregunta por página,
navegación con Enter o botón Next. Quiero que vos:

1. Levantes Playwright CLI en headed mode.
2. Llenes los 8 campos con datos de prueba realistas.
3. Tomes screenshot en cada paso (carpeta screenshots/qa-run-N/).
4. Si encontrás un bug (botón que no responde, validación que falla
   cuando no debería, página que no carga), DOCUMENTÁ el bug en
   bugs.md con: paso, comportamiento esperado, comportamiento real,
   screenshot.
5. Después de la corrida, propongas un plan de fix para los bugs
   encontrados.

NO arregles nada todavía. Primero corramos el test y veamos qué sale.
```

Plan mode importa porque sin él, Claude Code arranca a hacer todo
junto y perdés el control sobre qué decisiones toma.

#### Paso 2 — Aceptar el plan, dejarlo correr

Claude Code va a:

- Escribir un script (o componer comandos `playwright-cli`).
- Levantar Chromium en headed.
- Iterar por los 8 pasos.
- Capturar screenshots con `playwright-cli screenshot --filename=...`.
- Documentar bugs en `bugs.md`.

**Vos mirás la pantalla mientras corre.** Esto es importante en la
primera iteración — vas a notar cosas que el agente no nota
("ah, el botón sí responde pero el spinner queda colgado 3
segundos").

#### Paso 3 — Review humano + plan de fix

Una vez termina:

- Leer `bugs.md`.
- Mirar screenshots.
- Decidir cuáles bugs son reales y cuáles son falsos positivos
  (Claude a veces marca "bug" cuando es comportamiento esperado).
- Volver a plan mode: "fixeá bugs A, B y C. D no es bug, es by
  design — actualizá el script para no flaggearlo."

#### Paso 4 — Apply + re-run

Claude Code aplica los fixes (en código de la app o en el script
de QA). Después corre el test de nuevo. Loop hasta que `bugs.md`
esté vacío o solo tenga items aceptados como wontfix.

### §4.2 Comandos Playwright CLI relevantes

```sh
# Abrir browser (headed para debugging, agregar --headed)
playwright-cli open http://localhost:3000 --headed

# Llenar input por accessibility ref (lo que devuelven los snapshots)
playwright-cli type "{{owner_name}}"
playwright-cli press Tab
playwright-cli type "Posada"

# Click por selector o por accessibility ref (e.g. "e21")
playwright-cli click "role=button[name=Next]"

# Screenshot de toda la página o de un elemento
playwright-cli screenshot --filename=screenshots/qa-run-1/step-1.png
playwright-cli screenshot e34 --filename=screenshots/qa-run-1/step-1-button.png

# Snapshot estructurado (accessibility tree) — más útil que screenshot para que el agente razone
playwright-cli snapshot --filename=after-step-1.yaml

# Ver dashboard de todas las sesiones corriendo (útil cuando hay varios runs en paralelo)
playwright-cli show
```

Para descubrir todos los comandos:

```sh
playwright-cli --help
```

### §4.3 Cuándo escribir script `.ts` en vez de comandos sueltos

Cuando el flujo tiene >5 pasos secuenciales con assertions
intermedias, conviene escribir un script:

```ts
// scripts/qa-onboarding-form.ts
import { chromium, expect } from '@playwright/test';
import * as fs from 'node:fs';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const bugs: string[] = [];

  await page.goto('http://localhost:3000');

  // Paso 1 — first name
  await page.getByRole('textbox', { name: /first name/i }).fill('{{owner_name}}');
  await page.getByRole('button', { name: /next/i }).click();
  await page.screenshot({ path: 'screenshots/qa-run/step-1.png' });

  // ... pasos 2-8

  // Verificación final
  try {
    await expect(page.getByText(/thank you/i)).toBeVisible({ timeout: 5000 });
  } catch (e) {
    bugs.push('Step 8: thank-you page never loaded');
    await page.screenshot({ path: 'screenshots/qa-run/step-8-fail.png' });
  }

  fs.writeFileSync('bugs.md', bugs.length
    ? bugs.map(b => `- [ ] ${b}`).join('\n')
    : '# No bugs encountered ✓');

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

Correr: `pnpm exec tsx scripts/qa-onboarding-form.ts`.

Una vez probado, este script se vuelve un **skill** (ver §7).

---

## §5 Workflow #2 — Web scraping con learning loop

Use case: scrapear info pública. Lo interesante no es scraping en
sí — es el **learning loop**: cuando el primer approach falla
(bloqueado por anti-bot), el agente aprende y prueba otro.

### §5.1 Cuándo usar este patrón

- Datos públicos de un sitio que no expone API (directorio de
  empresas, listings, precios, contactos).
- Sitios anti-bot moderados (sitios de nicho son permisivos).
- Datos donde "good enough" alcanza — no necesitás 100% de los
  registros.

### §5.2 Cuándo NO usar este patrón

- Datos detrás de paywall o login con TOS que prohíben scraping.
- Volúmenes industriales (1000s de páginas/min) — eso requiere
  proxies, rotación de IPs, infrastructure dedicada. No es un
  workflow ad-hoc.
- Datos personales sensibles (PII de individuos sin consentimiento
  explícito).

### §5.3 Patrón del learning loop

```
1. El agente intenta el approach default (ej. buscador #1).
2. Si falla (CAPTCHA, bloqueo, layout cambió), el agente:
   a. Captura un screenshot del fallo.
   b. Razona sobre la causa.
   c. Propone un approach alternativo (ej. buscador #2, fuente
      directa).
   d. Reintenta.
3. Cuando funciona, EXTRAE el script funcional como skill.
4. Documentar en el skill: "this approach failed: X. This worked: Y."
```

### §5.4 Prompt template para el agente

```
Tarea: necesito una lista de los <N> <items> con <campos>. Salida:
CSV en data/<dataset>-YYYY-MM-DD.csv.

Reglas:
1. Usar Playwright CLI en headed la primera vez (quiero verlo).
2. Empezá con el approach que creas mejor. Si falla (CAPTCHA,
   bloqueo, layout no parseable), DOCUMENTÁ qué pasó en
   logs/scrape-attempt-N.md y probá otro approach.
3. NO te detengas hasta tener los <N> registros completos o
   demostrar que es imposible. Máx 3 approaches distintos.
4. Si scrapeás resultados de buscador, validá los datos visitando
   la fuente real (no confíes en el snippet del buscador — suele
   tener data desactualizada).
5. Antes de escribir el CSV, mostrame los <N> registros para
   approval.
```

### §5.5 Anti-patterns a evitar

- **Confiar en el snippet del buscador.** Casi siempre está
  desactualizado. Visitar el sitio real.
- **No documentar los fallos.** Si no escribís en
  `logs/scrape-attempt-N.md` por qué Approach A falló, la próxima
  vez que corras el skill, el agente repite el mismo error.
- **Hardcodear selectores frágiles.** Mejor usar `getByRole`,
  `getByText`, `getByLabel` (semantic) que selectores CSS tipo
  `.css-1abc2def`.

---

## §6 Workflow #3 — Sesiones autenticadas (storage state pattern)

Use case: automatizar tareas en plataformas donde Claude Code
necesita estar logueado (likes, respuestas a comentarios, posts
diarios, listar tus repos privados, etc.).

El approach oficial 2026 de Playwright es **storage state JSON**.
El approach alternativo de "persistent browser profile" tiene
problemas (ver §6.1) y no se recomienda.

### §6.1 Por qué storage state > persistent profile

El persistent profile (carpeta entera de Chrome user data) tiene 3
problemas:

1. **Pesa MB-GB** — tu repo se llena de basura.
2. **Trae cosas que no querés** — historial de browsing, preferencias,
   extensiones, pasitos a sitios no relacionados.
3. **Frágil entre versiones de Chromium** — si el browser se
   actualiza, el profile puede romperse.

Storage state es un **JSON pequeño** (~5-50KB) con cookies +
localStorage + IndexedDB del dominio que te interesa. Reusable,
inspectable, fácil de gitignore (que igual hay que hacer porque
contiene tokens).

### §6.2 Setup paso a paso

#### Paso 1 — Login script (corre 1 vez por mes-ish)

```ts
// scripts/login-and-dump-state.ts
import { chromium } from 'playwright';
import * as path from 'node:path';

const TARGET_DOMAIN = 'https://example.com';   // reemplazá por el sitio
const AUTH_FILE = path.join('playwright', '.auth', 'example.json');

async function main() {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(TARGET_DOMAIN + '/login');

  console.log('\n→ Loggeate manualmente en el browser que se abrió.');
  console.log('→ Cuando estés en el dashboard, presioná Enter acá.\n');

  // Pause para que el humano logee
  await new Promise<void>(resolve => {
    process.stdin.once('data', () => resolve());
  });

  // Dump storage state
  await ctx.storageState({ path: AUTH_FILE });
  console.log(`✓ State guardado en ${AUTH_FILE}`);

  await browser.close();
}

main();
```

Correr una vez:

```sh
pnpm exec tsx scripts/login-and-dump-state.ts
```

Te abre Chromium, te logeás vos, presionás Enter en la terminal,
guarda el JSON, cierra. **El JSON tiene cookies de sesión — es
sensitivity high.** Verificar que `playwright/.auth/` está en
`.gitignore` (ya lo está si seguiste §3.2).

#### Paso 2 — Workflows usan ese state, headless por default

```ts
// scripts/do-authenticated-task.ts
import { chromium } from 'playwright';

const AUTH_FILE = 'playwright/.auth/example.json';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: AUTH_FILE });
  const page = await ctx.newPage();

  await page.goto('https://example.com/dashboard');

  // ... tu lógica autenticada acá

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

#### Paso 3 — Refresh del state cuando expira

Sessions expiran. Cuando el script empiece a fallar con redirects
a `/login`, re-correr el script de Paso 1. Documentar este
"keep-alive" en el SKILL.md del workflow.

### §6.3 Reglas de oro para sesiones autenticadas

1. **`playwright/.auth/` SIEMPRE en `.gitignore`.** Sin excepción.
   El JSON contiene tokens válidos.
2. **Una sesión = un archivo.** No mezclar cuentas distintas en el
   mismo JSON.
3. **NO commitear scripts de login con credenciales hardcoded.** Si
   necesitás credenciales programáticas (no manual login), leer de
   variables de entorno + `.env` también gitignored.
4. **Headless por default en producción.** Headed solo para
   debugging y para el primer login manual.
5. **Documentar TOS del sitio.** Si automatizás un sitio donde
   tenés cuenta comercial, anotar en el README si la actividad
   puede violar TOS y a qué nivel. Decisión consciente, no implícita.
6. **TTL declarado por sesión (recomendado).** En el SKILL.md del
   workflow que usa el state, agregar metadata
   `auth-ttl: <N>d`. Si pasan N días sin re-login, el script falla
   closed con mensaje claro pidiendo refresh. Evita que un state
   stale corra silencioso 3 meses + reduce blast radius si el
   archivo se filtra.

### §6.4 Citas relevantes

> "Authentication state in Playwright saves your logged-in
> session—including cookies, local storage, and IndexedDB—to a
> file. Tests then load this file instead of logging in again. This
> approach reduces test execution time by 60-80% compared to
> authenticating in every test."

> "The browser state file may contain sensitive cookies and headers
> that could be used to impersonate you or your test account. We
> strongly discourage checking them into private or public
> repositories."

---

## §7 Patrón skill — empaquetar workflows reusables

Una vez un workflow está debuggeado y corre limpio, hay que
empaquetarlo como **Claude Code Skill** para que se invoque por
nombre y nunca más haya que re-explicarlo.

### §7.1 Qué es un skill exactamente

Verificación 2026-04-26 contra
[code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills) y
[github.com/anthropics/skills](https://github.com/anthropics/skills):

> "Skills are folders of instructions, scripts, and resources that
> Claude loads dynamically to improve performance on specialized
> tasks. Skills teach Claude how to complete specific tasks in a
> repeatable way."

Estructura mínima:

```
~/.claude/skills/<skill-name>/
├── SKILL.md            # frontmatter + instrucciones
├── scripts/            # opcional — scripts auxiliares
│   └── *.ts
└── examples/           # opcional — ejemplos de input/output
```

### §7.2 SKILL.md template para workflows Playwright

```markdown
---
name: github-list-trending
description: Lista los top N repos trending de GitHub esta semana en
  el lenguaje especificado. Output a CSV. Usa Playwright CLI con
  fallback automático si la página primaria falla.
auth-ttl: n/a (data pública, no requiere login)
---

# GitHub — listar trending repos de la semana

## Cuándo invocar este skill

Cuando el usuario pide:
- "listame los trending repos de Python esta semana"
- "exportá los top 20 trending repos a CSV"

## Pre-requisitos

- `@playwright/cli`, `@playwright/test`, `playwright` instalados.
- Sin auth requerida (data pública).

## Cómo correr

\```sh
pnpm exec tsx scripts/scrape-github-trending.ts \\
  --language python \\
  --since weekly \\
  --output data/github-trending-python-YYYY-MM-DD.csv
\```

## Output esperado

- Console log con N repos extraídos.
- CSV en el path especificado.
- Exit code 0 si todo OK.

## Gotchas conocidas

- Si GitHub trending UI cambia el selector de "stars this week",
  el script falla. Verificar visualmente el primer run post-cambio.
- Output difiere por geografía — GitHub muestra trending según el
  IP del que corre. Documentado, no es bug.
- Rate limit no aplica (es web scraping, no API), pero correr más
  de 1 vez/min puede gatillar Cloudflare challenge.
```

### §7.3 Cuándo crear skill vs script suelto

| Criterio | Script en `scripts/` | Skill |
|---|---|---|
| Lo voy a correr 1-2 veces total | ✓ | ✗ |
| Lo voy a correr 5+ veces o lo va a correr otra persona/agente | ✗ | ✓ |
| Tiene lógica condicional compleja que el agente debe parametrizar | ✗ | ✓ |
| Es one-shot exploratory | ✓ | ✗ |
| Quiero invocarlo por nombre desde Claude Code | ✗ | ✓ |

Regla práctica: arrancar como script, **promover a skill cuando el
script ya corrió 3 veces sin cambios estructurales**.

### §7.4 Mantenimiento de skills

Skills se rotten. UI cambia, selectores se rompen, la plataforma
agrega un step. Cuando un skill falla:

1. **NO lo borres.** El script funcional + las gotchas son
   conocimiento.
2. **Actualizá la sección Gotchas** del SKILL.md con lo que pasó.
3. **Versioná el skill.** Si el cambio es estructural, guardar el
   viejo SKILL.md en `archived/` y reescribir.

---

## §8 Headed vs headless — cuándo cada uno

| Modo | Cuándo usar |
|---|---|
| **Headed** (`--headed` o `headless: false`) | Primera vez que escribís un script. Debugging. Login manual para dump de storage state. Demos en vivo. |
| **Headless** (default) | Producción. Scripts en CI. Background tasks (scheduled). Cualquier corrida >2 minutos. Cualquier corrida en una máquina remota. |

**Default oficial Playwright 2026:** "Playwright CLI is headless by
default. If you'd like to see the browser, pass --headed to open".

**Anti-patrón:** dejar headed en producción "para poder ver si algo
falla". Eso pierde sentido en cuanto el script corre en una VM
remota o en CI. Mejor: screenshots automáticos en cada paso crítico
+ traces de Playwright cuando hay error.

---

## §9 Cuándo SÍ aplica este playbook / Cuándo NO

### §9.1 SÍ aplica

- Cualquier proyecto que necesite manejar un browser:
  - QA de microsites pre-deploy.
  - Validación E2E de flows que tocan UI.
  - Smoke tests post-deploy de cualquier web app.
  - Scrapers de datos públicos para alimentar otros sistemas.
  - Bots de engagement personal en plataformas con UI.
- Skills personales en `~/.claude/skills/` que automaticen tareas
  recurrentes web.

### §9.2 NO aplica

- **Tests unitarios** — usá Vitest / Jest / etc.
- **Tests de API REST/GraphQL** — usá `supertest`/`undici` o
  framework de tests + fetch directo. Browser es overkill.
- **Scraping a escala industrial** (>1000 páginas/día sostenido) —
  eso requiere infrastructure distinta (proxies rotativos, queue
  de jobs, anti-detection avanzado). No es un workflow ad-hoc;
  sería su propio proyecto.
- **Automation que viole TOS** de plataformas de las que dependés
  comercialmente. Costo > beneficio si te banean.
- **Procesamiento de PDFs / imágenes / Excel** — usá las skills
  oficiales de Anthropic (`pdf`, `xlsx`, etc.). Browser solo si el
  documento está detrás de auth en una web.

---

## §10 Cuándo construir un framework de automation propio

Un proyecto serio puede llegar a un punto donde tiene 5+ skills
Playwright funcionando, y querés extraerlas a un framework
reutilizable: scaffolds de scripts comunes, presets de
`playwright.config.ts`, skills empaquetados para distribución.

**Síntomas de que llegó el momento:**

- Tenés ≥5 skills Playwright funcionando bien.
- Estás copy-pasteando setup boilerplate entre proyectos.
- Querés compartir los skills con otros (equipo, comunidad).

**Síntomas de que NO llegó:**

- Tenés 0-2 workflows funcionando — todavía estás aprendiendo el
  patrón. No te apures.
- Cada workflow es muy diferente del anterior — no hay patrón
  común que extraer.
- No hay segundo proyecto que reuse nada — premature.

**Si decidís construir el framework:**

- Repo separado, gitignored del proyecto principal (mismo patrón
  de "artifact = carpeta + git repo propio" que se aplica a
  cualquier deliverable distribuible).
- Stack idéntico al §3.1 de este playbook.
- Mínimo: `/skills/` (con tus skills migrados), `/templates/`
  (scaffolds para `login-and-dump`, `qa-loop`, `scraper`),
  `/playwright-config-presets/` (configs pre-tuneados para 3
  escenarios: local dev, CI/CD, scraping).
- Antes de arrancarlo: probá los 3 workflows §4-§6 de este
  playbook en al menos 2 casos reales. Si después de eso sigue
  habiendo patrón común — entonces sí, framework.

---

## §11 Ejemplos pedagógicos

Esta sección contiene **3 mini-PRDs** de proyectos descartables
diseñados específicamente para aprender los 3 workflows del
playbook (§4 QA loop, §5 scraping con learning, §6 storage state).

> **Tu rol al hacer estos ejercicios:** seguir el step-by-step
> verbatim. NO improvisar el flujo. El objetivo es que termines con
> un sentido **calibrado** de cuándo Playwright + Claude Code es la
> herramienta correcta y cuándo es overkill.
>
> **Ubicación de los proyectos:** TBD — se decide cuando se
> implementan por primera vez. Sugerencia opcional: repo personal
> nuevo en GitHub (uno por ejercicio o uno solo con tres scripts).

### §11.0 Setup base compartido (vale para los 3 ejercicios)

Si vas a hacer los 3 ejercicios, te conviene un solo proyecto que
los contenga. Si vas a hacer 1-2, repetí este setup en un proyecto
descartable independiente.

#### Paso 11.0.1 — Crear repo en GitHub

1. Abrir [https://github.com/new](https://github.com/new).
2. **Repository name:** `playwright-learning` (sugerencia).
3. **Description:** "Personal sandbox for Playwright + Claude Code
   workflows (QA, scraping, auth)."
4. **Visibility:** Public (no hay secrets en este proyecto si
   seguís el playbook).
5. ✅ Add README + ✅ .gitignore (Node) + ✅ MIT License.
6. Click **Create repository**.

#### Paso 11.0.2 — Clonar localmente

```sh
cd ~/projects   # o donde sea
git clone https://github.com/<tu-usuario>/playwright-learning.git
cd playwright-learning
```

#### Paso 11.0.3 — Inicializar TypeScript + Playwright

```sh
pnpm init
pnpm add -D typescript @types/node tsx
pnpm add -D @playwright/cli @playwright/test playwright
pnpm exec tsc --init
pnpm exec playwright install chromium
mkdir -p playwright/.auth scripts data screenshots logs
```

#### Paso 11.0.4 — Configurar `tsconfig.json`

Reemplazar contenido por:

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["es2022", "dom"],
    "outDir": "./dist",
    "rootDir": "./scripts",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["scripts/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

#### Paso 11.0.5 — Configurar `package.json`

Agregar `"type": "module"` al nivel raíz + sección scripts:

```json
"scripts": {
  "qa": "tsx scripts/qa-form.ts",
  "scrape": "tsx scripts/scrape-trending.ts",
  "login": "tsx scripts/login-and-dump-state.ts",
  "list-private": "tsx scripts/list-private-repos.ts"
}
```

#### Paso 11.0.6 — `.gitignore` extendido

Agregar al `.gitignore` que GitHub creó:

```
playwright/.auth/
.playwright-cli/
screenshots/
data/
logs/
```

(`screenshots/`, `data/` y `logs/` también se ignoran porque son
output de los ejercicios — querés que cada run sea reproducible
desde cero.)

#### Paso 11.0.7 — Commit inicial

```sh
git add .
git commit -m "chore: initial playwright sandbox scaffold"
git push origin main
```

#### Paso 11.0.8 — Verificar setup

```sh
pnpm exec playwright-cli --version       # debe imprimir versión
pnpm exec playwright --version           # debe imprimir versión
node -v                                  # debe ser ≥20.0.0
```

Si todo OK, listo para arrancar cualquiera de los 3 ejercicios.

---

### §11.1 Ejercicio QA Loop — "Form Validator de practice.expandtesting.com"

#### A. Qué vamos a construir

**Nombre:** `qa-form.ts`
**Objetivo:** validar el form de signup de
[https://practice.expandtesting.com/notes/app/register](https://practice.expandtesting.com/notes/app/register) —
un sitio público específicamente diseñado para que la gente
practique automation. Sin TOS issues.

**Funcionalidad:**

- Levantar Chromium en headed la primera vez.
- Llenar form con datos de test (nombre, email, password,
  password-confirm).
- Tomar screenshot en cada step.
- Verificar happy path: form se acepta + landing page aparece.
- Verificar 3 edge cases:
  - Submit con email inválido → muestra error.
  - Submit con password débil (`123`) → muestra error.
  - Submit con password-confirm distinta a password → muestra error.
- Documentar resultados en `bugs.md` (vacío si todo OK).

**Out of scope:**

- No probar login después del signup (ese sería otro ejercicio).
- No probar TODOS los edge cases — solo los 3 listados.
- No automatizar el cleanup de la cuenta creada (el sitio la deja
  morir sola o vos podés borrarla manual).

#### B. Por qué este ejemplo demuestra QA Loop

- **Form real con validación real** — no es un mock.
- **Sitio público de práctica** — no hay riesgo legal ni
  reputational. El sitio existe para esto.
- **Edge cases concretos** — el form tiene reglas verificables
  (email regex, password strength, confirmación de password).
- **Patrón de fix loop** — si tu primer script tiene un bug
  (selector incorrecto, timeout corto), Claude lo identifica y
  fixea en el mismo ejercicio.

#### C. Pre-requisitos del ejercicio

- [ ] Setup §11.0 completo.
- [ ] Conexión a internet (el sitio es público, no requiere
  cuenta previa).
- [ ] (Opcional) Cuenta personal en
  [https://practice.expandtesting.com/](https://practice.expandtesting.com/)
  si querés ver el dashboard después del signup.

#### D. Step-by-step

##### Paso 11.1.D.1 — Crear el archivo de spec

Crear `docs/qa-form-spec.md` con:

```markdown
# QA Form Validator — Spec

## Target
https://practice.expandtesting.com/notes/app/register

## Happy path
1. Abrir la URL.
2. Llenar:
   - First Name: "Test"
   - Last Name: "User"
   - Email: <generar email único, ej. "test-<timestamp>@example.com">
   - Password: "TestPass123!"
   - Confirm Password: "TestPass123!"
3. Click "Register".
4. Verificar redirect a /notes/app/login (o landing similar).
5. Tomar screenshot de la landing.

## Edge cases
- Email inválido (sin @): debe mostrar error inline, no submitear.
- Password débil ("123"): debe mostrar error de strength, no
  submitear.
- Password-confirm distinta: debe mostrar error, no submitear.

## Resultados
- Si los 3 edge cases muestran error correctamente Y el happy path
  funciona → bugs.md vacío con mensaje "All checks passed ✓".
- Si alguno falla → bugs.md con detalle (qué se esperaba, qué pasó,
  screenshot).
```

##### Paso 11.1.D.2 — Pedir a Claude Code que escriba el script

Abrir Claude Code en el proyecto:

```sh
cd ~/projects/playwright-learning
claude
```

Entrar plan mode (`Shift+Tab`) y pedir:

```
Plan: necesito un script Playwright en TypeScript que valide el form
de signup de https://practice.expandtesting.com/notes/app/register
según el spec en docs/qa-form-spec.md.

Requirements:
- Path del script: scripts/qa-form.ts
- Headed mode (querés ver el browser).
- Generar email único cada run (usá Date.now() suffix).
- Screenshot por cada paso a screenshots/qa-form/<step>.png.
- bugs.md al final con resultados de los 4 checks (1 happy path + 3
  edge cases).
- Script que sale con exit code 0 si todo OK, 1 si hay bug.
- Usar getByRole / getByLabel (semantic selectors), no CSS classes.
- Timeout de 5s por interacción, 10s para espera de redirect.

NO ejecutar el script todavía. Mostrame el código primero.
```

Aceptá el plan, dejá que Claude escriba `scripts/qa-form.ts`.

##### Paso 11.1.D.3 — Review del script

Antes de correr, leer el script. Cosas mínimas a verificar:

- [ ] Selectores son `getByRole`, `getByLabel`, `getByPlaceholder`
  o similar — NO `page.locator('.css-xyz')`.
- [ ] Cada `await` que hace I/O tiene un timeout explícito.
- [ ] El email se genera dinámicamente cada run (no hardcoded).
- [ ] Los 3 edge cases están en bloques try/catch (un fallo no
  aborta los siguientes).
- [ ] `bugs.md` se escribe al final, incluso si hay bugs.

Si falta algo, pedirle a Claude:

> "Ajustá X — [especificá]. Mostrame el diff antes de aplicar."

##### Paso 11.1.D.4 — Primera corrida

```sh
pnpm qa
```

Mirá el browser que se abre. Tomá nota mental de:

- ¿La página tarda mucho en cargar? (puede que necesites timeout
  más alto)
- ¿El form se llena bien?
- ¿Los errores aparecen como esperabas en los edge cases?

##### Paso 11.1.D.5 — Review del output

Después de la corrida:

- Abrir `bugs.md` y leer.
- Mirar `screenshots/qa-form/` — debe haber screenshots de cada
  paso + un screenshot por edge case fallido (si aplica).

##### Paso 11.1.D.6 — Loop de fix (si hay bugs)

Si `bugs.md` tiene items:

- Decidir: ¿bug real o falso positivo?
  - Real: pedir a Claude "fixeá el script: [describir el bug]".
  - Falso positivo: pedir a Claude "el comportamiento X es by
    design — ajustá el script para no flaggearlo".
- Re-correr `pnpm qa`.
- Loop hasta `bugs.md` vacío.

##### Paso 11.1.D.7 — Promover a skill (opcional)

Si te gustó el script y querés invocarlo por nombre:

```sh
mkdir -p ~/.claude/skills/qa-form-expandtesting/scripts
cp scripts/qa-form.ts ~/.claude/skills/qa-form-expandtesting/scripts/
```

Crear `~/.claude/skills/qa-form-expandtesting/SKILL.md`:

```markdown
---
name: qa-form-expandtesting
description: Validate the signup form on
  practice.expandtesting.com (happy path + 3 edge cases). Useful
  for practicing Playwright QA loops.
---

# QA Form — practice.expandtesting.com

## Run
\```sh
pnpm exec tsx ~/.claude/skills/qa-form-expandtesting/scripts/qa-form.ts
\```

## Output
- Console: pass/fail summary.
- bugs.md in cwd.
- Screenshots in ./screenshots/qa-form/.
```

#### E. Qué esperar (calibration)

Si el ejercicio salió bien, vas a tener:

- ✅ Un `qa-form.ts` que corre limpio.
- ✅ `bugs.md` vacío después de 1-3 iteraciones de fix.
- ✅ Screenshots de cada step en `screenshots/qa-form/`.
- ✅ Sentido empírico de cuánto tarda la primera corrida (typical
  ~30-60 segundos).
- ✅ Sentido empírico de cuántas iteraciones de fix tomó (typical 1-3).

Si tomó >5 iteraciones de fix, probable que el spec inicial estaba
muy ambiguo. Próxima vez: spec más detallado.

#### F. Gotchas comunes

| Síntoma | Causa probable | Fix |
|---|---|---|
| Email "ya existe" en signup | El sitio guarda emails entre runs | Usar timestamp suffix (`test-${Date.now()}@...`) |
| Click en "Register" no responde | Botón está disabled hasta validation pass | Esperar `await page.waitForFunction(() => !btn.disabled)` antes del click |
| Screenshot vacío / negro | Tomado antes que la página cargue | Agregar `await page.waitForLoadState('networkidle')` antes |
| `getByRole('button', { name: /register/i })` no encuentra | El botón es input type="submit", no button | Usar `getByRole('button', { name: /register/i })` o `locator('input[type="submit"]')` como fallback |

---

### §11.2 Ejercicio Scraping con Learning Loop — "GitHub Trending Scraper"

#### A. Qué vamos a construir

**Nombre:** `scrape-trending.ts`
**Objetivo:** scrapear los top 10 trending repos de GitHub esta
semana en un lenguaje específico (default: TypeScript).

**Funcionalidad:**

- Approach 1 (default): scrapear
  [github.com/trending/typescript?since=weekly](https://github.com/trending/typescript?since=weekly).
  Extraer: nombre del repo, descripción, language, stars total,
  stars este período.
- Approach 2 (fallback si Approach 1 falla): scrapear desde
  [trendshift.io](https://trendshift.io/) o equivalente.
- Approach 3 (fallback si los dos anteriores fallan): consultar
  GitHub Search API (`/search/repositories`) ordenando por stars
  con filtro de fecha — esto NO es scraping pero es válido si los
  primeros 2 fallan.
- Output: `data/github-trending-typescript-YYYY-MM-DD.csv` con
  10 filas + header.
- Log: `logs/scrape-attempt-N.md` por cada approach (success o
  fail con razón).

**Out of scope:**

- No scrapear lenguajes múltiples en un run (un run = un lenguaje).
- No agendar runs recurrentes (eso sería `cron` + skill).
- No deduplicar contra runs anteriores.

#### B. Por qué este ejemplo demuestra Learning Loop

- **GitHub trending UI puede cambiar** — históricamente cambia 1-2
  veces por año, lo que da chance de que el script de mañana falle.
- **Approach 1 puede fallar de forma "esperada"** — Cloudflare
  challenge si corres muchas veces, layout change, etc.
- **Tres approaches con tradeoffs distintos** — ejercita la
  capacidad de Claude de razonar "este approach falló, probemos
  otro".
- **Fallback a API** — enseña que scraping no es siempre la mejor
  opción; a veces hay un endpoint API que sirve mejor.

#### C. Pre-requisitos del ejercicio

- [ ] Setup §11.0 completo.
- [ ] Conexión a internet.
- [ ] (Opcional) GitHub Personal Access Token para Approach 3 (API
  search). Sin token, GitHub API permite 60 req/h sin auth — para
  un run aislado, alcanza.

#### D. Step-by-step

##### Paso 11.2.D.1 — Crear el archivo de spec

Crear `docs/scrape-trending-spec.md` con:

```markdown
# GitHub Trending Scraper — Spec

## Goal
Lista de top 10 trending repos para un lenguaje en una ventana de
tiempo. Output CSV.

## Input args
- `--language` (default: typescript). Acepta: typescript, python,
  rust, go, javascript, all.
- `--since` (default: weekly). Acepta: daily, weekly, monthly.
- `--output` (default: data/github-trending-<language>-<date>.csv).

## Output CSV columns
1. rank (1-10)
2. owner
3. repo
4. description
5. language
6. stars_total
7. stars_period (stars en la ventana --since)
8. url

## Approaches (en orden)

### Approach 1 — github.com/trending
URL: https://github.com/trending/<language>?since=<since>
Selectores semánticos:
- Lista de repos: `article.Box-row`
- Owner/repo: `h2.h3 > a` con href como /owner/repo
- Description: `p.col-9`
- Language: `[itemprop="programmingLanguage"]`
- Stars total: link a `/stargazers` con número
- Stars period: span con texto "X stars this <period>"

### Approach 2 — fallback scraper (trendshift.io o similar)
Si Approach 1 falla 2 veces consecutivas (con detail en log):
intentar trendshift.io o sitio similar. Documentar selectores
después del primer run exitoso (UI puede cambiar).

### Approach 3 — GitHub Search API
Si Approach 1 y 2 fallan:
GET https://api.github.com/search/repositories?q=language:<lang>+created:>=<fecha-de-cutoff>&sort=stars&order=desc&per_page=10
Auth opcional (env GITHUB_TOKEN). Sin auth: 60 req/h.
NOTA: este approach no devuelve "stars period" (solo stars total).
Fila CSV: stars_period queda vacío.

## Logging
Por cada approach intentado:
- logs/scrape-attempt-N.md con:
  - Approach number
  - Timestamp
  - Result: success | fail
  - Si fail: error message + screenshot (si fue Playwright)
  - Si success: número de filas extraídas
```

##### Paso 11.2.D.2 — Pedir a Claude Code que escriba el script

```
Plan: necesito un script Playwright + GitHub API en TypeScript que
implemente el scraper definido en docs/scrape-trending-spec.md.

Requirements:
- Path: scripts/scrape-trending.ts
- Args parsing: usar process.argv directo (no agregar dep como
  yargs). Aceptar --language, --since, --output.
- Headed mode SOLO si pasás --headed flag (default headless).
- Approach 1 (Playwright sobre github.com/trending) primero.
- Si Approach 1 falla → log + Approach 2.
- Si Approach 2 falla → log + Approach 3 (fetch a GitHub API).
- Si los 3 fallan → exit code 1 con mensaje claro.
- Logging según spec §"Logging".
- Output CSV con header en la primera línea.

Validá: si el primer approach funciona en primera corrida, no
intentes los otros 2 (no son necesarios). El learning loop solo se
ejercita cuando un approach falla.

NO ejecutar todavía. Mostrame el código primero.
```

##### Paso 11.2.D.3 — Review

Verificar:

- [ ] El script tiene 3 funciones separadas: `tryApproach1()`,
  `tryApproach2()`, `tryApproach3()`.
- [ ] Cada una retorna `{ success: true, repos: [...] }` o
  `{ success: false, error: '...' }`.
- [ ] Los logs se escriben a `logs/scrape-attempt-N.md` con timestamp.
- [ ] El CSV se escribe SOLO si un approach tuvo success.

##### Paso 11.2.D.4 — Primera corrida (happy path)

```sh
pnpm scrape -- --language typescript --since weekly
```

Esperás:

- Approach 1 funciona en primera corrida.
- `data/github-trending-typescript-YYYY-MM-DD.csv` aparece con 10 filas.
- `logs/scrape-attempt-1.md` documenta success.
- Approaches 2 y 3 NO se invocan.
- Exit code 0.

##### Paso 11.2.D.5 — Forzar el learning loop (manual fault injection)

Para ejercitar el learning loop, vas a romper Approach 1 a
propósito.

Editá `scripts/scrape-trending.ts`:

- En la URL de Approach 1, cambiar `github.com/trending` a
  `github.com/trendingxxx` (URL inválida).

Correr de nuevo:

```sh
pnpm scrape -- --language typescript --since weekly
```

Esperás:

- Approach 1 falla (404 o navegación rota).
- `logs/scrape-attempt-1.md` documenta el fail.
- Approach 2 se invoca.
- Si Approach 2 también falla (porque trendshift.io tiene CSS
  distinto, etc.), se invoca Approach 3.
- Approach 3 (API) probablemente funciona.
- Output CSV se genera con `stars_period` vacío.
- Exit code 0.

Después: revertí el cambio de URL.

##### Paso 11.2.D.6 — Verificar output

```sh
head -5 data/github-trending-typescript-*.csv
cat logs/scrape-attempt-1.md
```

Esperás ver: header + 4 filas de datos en el CSV; log con detalle
del approach que funcionó.

##### Paso 11.2.D.7 — Promover a skill (opcional)

Si querés invocarlo por nombre:

```sh
mkdir -p ~/.claude/skills/github-trending/scripts
cp scripts/scrape-trending.ts ~/.claude/skills/github-trending/scripts/
```

`~/.claude/skills/github-trending/SKILL.md`:

```markdown
---
name: github-trending
description: Lista los top 10 trending repos de GitHub esta semana
  para un lenguaje específico. Output CSV. Tiene 3 approaches con
  fallback automático.
---

# GitHub Trending — listar top 10

## Run
\```sh
pnpm exec tsx ~/.claude/skills/github-trending/scripts/scrape-trending.ts \\
  --language typescript --since weekly
\```

## Args
- --language: typescript | python | rust | go | javascript | all
- --since: daily | weekly | monthly
- --output: path al CSV (default genera por fecha)
- --headed: opcional, abre Chromium en headed para debugging
```

#### E. Qué esperar (calibration)

Después del ejercicio:

- ✅ Tenés un script con learning loop real implementado.
- ✅ Tenés evidencia (logs/) de los 3 approaches.
- ✅ Sentido empírico de cuándo conviene Approach 1 (HTML scraping)
  vs Approach 3 (API directa).

#### F. Gotchas comunes

| Síntoma | Causa probable | Fix |
|---|---|---|
| Approach 1 funciona local pero falla en CI | GitHub puede servir HTML distinto a IPs cloud | Approach 3 (API) gana en CI; documentar en SKILL.md |
| Selectores CSS de github.com/trending cambian | GitHub redesign | Re-extraer selectores manualmente, o usar `getByRole` cuando posible |
| GitHub API 403 con "rate limit exceeded" | Sin auth, son 60 req/h | Setear `GITHUB_TOKEN` env var (PAT con scope `public_repo`) |
| Output CSV con caracteres raros (descripciones con emojis) | Encoding | Asegurar UTF-8 en `fs.writeFileSync(path, csv, 'utf-8')` |

---

### §11.3 Ejercicio Storage State — "GitHub Private Repos Lister"

#### A. Qué vamos a construir

**Nombre:** `login-and-dump-state.ts` + `list-private-repos.ts`
**Objetivo:** demonstrar el patrón storage state.

- Script 1 (`login-and-dump-state.ts`): abrir Chromium en headed,
  pausar mientras vos hacés login a GitHub manualmente, dumpar el
  state a `playwright/.auth/github.json`.
- Script 2 (`list-private-repos.ts`): cargar el state JSON, ir a
  [github.com/settings/repositories](https://github.com/settings/repositories)
  o similar, listar tus repos privados sin re-login. Output JSON a
  `data/private-repos.json`.

**Out of scope:**

- No automatizar el login (no manejamos password programáticamente).
- No hacer cambios en los repos (solo lectura).
- No manejar 2FA — el approach asume que vos lo resolvés en el
  login manual.

#### B. Por qué este ejemplo demuestra Storage State

- **GitHub login es real** — no es un sandbox.
- **Listar repos privados requiere auth** — sin storage state,
  habría que re-login cada vez.
- **El TTL del state es observable** — GitHub session dura ~14
  días; podés ver el script fallar después de ese período y
  ejercitar el "refresh".
- **Cualquiera tiene cuenta GitHub** — barrier to entry mínimo.

#### C. Pre-requisitos del ejercicio

- [ ] Setup §11.0 completo.
- [ ] Cuenta GitHub propia con al menos 1 repo privado (si no
  tenés, creá uno descartable: `gh repo create test-private
  --private` o desde la UI).
- [ ] Si tenés 2FA activo: app authenticator a mano (vas a hacer
  el segundo factor durante el login manual del Script 1).

#### D. Step-by-step

##### Paso 11.3.D.1 — Crear el archivo de spec

Crear `docs/storage-state-spec.md`:

```markdown
# Storage State — GitHub Private Repos Lister — Spec

## Two scripts

### Script 1: login-and-dump-state.ts
- Path: scripts/login-and-dump-state.ts
- Abrir Chromium headed.
- Navegar a github.com/login.
- Pausar (esperar Enter en stdin) mientras el usuario hace login
  manual + 2FA si aplica.
- Validar que el usuario está logueado verificando que
  github.com/settings es accesible (no redirige a /login).
- Dumpar storageState a playwright/.auth/github.json.
- Cerrar browser.
- Imprimir confirmación + path del archivo.

### Script 2: list-private-repos.ts
- Path: scripts/list-private-repos.ts
- Cargar storageState desde playwright/.auth/github.json.
- Si el archivo no existe → exit 1 con mensaje "run pnpm login first".
- Levantar Chromium HEADLESS.
- Navegar a https://github.com/<username>/?tab=repositories
  (necesita el username — leer de env GITHUB_USERNAME, fallar si
  no está definido).
- Filtrar por repos con badge "Private".
- Extraer: nombre, descripción, last update.
- Si la página redirige a /login → state expiró. Exit 2 con
  mensaje "state expired, run pnpm login again".
- Output: data/private-repos.json con array de objetos.
- Imprimir N repos en consola.

## Auth-TTL convention
- En SKILL.md (si se promueve), declarar auth-ttl: 14d (GitHub
  session típica).
- list-private-repos.ts loggea warning si el archivo del state
  tiene más de 7d (mtime check).
```

##### Paso 11.3.D.2 — Pedir a Claude Code que escriba los 2 scripts

```
Plan: necesito 2 scripts Playwright en TypeScript siguiendo el spec
en docs/storage-state-spec.md.

Script 1: scripts/login-and-dump-state.ts
- Headed mode obligatorio.
- Pausa real para que humano logee + 2FA.
- Validación post-login: navegar a /settings y confirmar HTTP 200
  + URL no es /login.
- Dumpa state a playwright/.auth/github.json.

Script 2: scripts/list-private-repos.ts
- Headless por default.
- Cargar state, fallar limpio si no existe.
- Username desde env GITHUB_USERNAME, fallar limpio si falta.
- Detectar redirect a /login → exit 2 con mensaje claro.
- Output JSON a data/private-repos.json.
- mtime check del state file → warning si >7d (no error).

NO ejecutar todavía. Mostrame el código primero.
```

##### Paso 11.3.D.3 — Review

Verificar:

- [ ] `login-and-dump-state.ts` usa `process.stdin.once('data', ...)`
  para pausar (no `setTimeout`).
- [ ] La validación post-login chequea URL O contenido (`/settings`
  contiene "Public profile" o similar).
- [ ] `list-private-repos.ts` chequea `fs.existsSync(AUTH_FILE)`
  antes de cargarlo.
- [ ] El error de state expirado es exit code distinto del de
  state ausente (ej. 1 vs 2).
- [ ] Selectores son semantic (`getByRole('link', ...)`), no
  CSS classes.

##### Paso 11.3.D.4 — Primera corrida del Script 1 (login)

```sh
pnpm login
```

Esperado:

- Chromium abre en headed.
- Te lleva a github.com/login.
- Loggeás manualmente (incluyendo 2FA si tenés).
- Cuando estés en el dashboard de GitHub, volvés a la terminal y
  presionás Enter.
- El script valida (navega a /settings, verifica login OK).
- Dumpa state a `playwright/.auth/github.json`.
- Imprime: `✓ State guardado en playwright/.auth/github.json`.
- Browser cierra.

Verificar:

```sh
ls -la playwright/.auth/
cat playwright/.auth/github.json | head -20
```

El archivo debe existir, debe pesar ~5-50KB, debe tener JSON con
`cookies` y `origins`.

**Confirmar gitignore funciona:**

```sh
git status
```

NO debe listar `playwright/.auth/github.json` como untracked.

##### Paso 11.3.D.5 — Primera corrida del Script 2 (list)

Setear el env var:

```sh
export GITHUB_USERNAME=<tu-usuario-github>
pnpm list-private
```

Esperado:

- Chromium abre headless (no se ve).
- Carga state.
- Va a `github.com/<tu-usuario>?tab=repositories`.
- Filtra repos con "Private" badge.
- Imprime: `Found N private repos.`
- Genera `data/private-repos.json`.

Verificar:

```sh
cat data/private-repos.json
```

Debe ser un array de objetos con `name`, `description`,
`last_update`.

##### Paso 11.3.D.6 — Probar el caso "state expirado" (manual fault injection)

Para ver qué pasa cuando el state expira:

```sh
# Borrar el state
rm playwright/.auth/github.json

pnpm list-private
```

Esperado: exit code 1, mensaje "run pnpm login first".

Recuperar:

```sh
pnpm login   # re-loggeás
pnpm list-private   # vuelve a funcionar
```

##### Paso 11.3.D.7 — Verificar mtime warning

Para simular state viejo (sin esperar 7 días):

```sh
# Cambiar mtime a 10 días atrás
touch -d '10 days ago' playwright/.auth/github.json

pnpm list-private
```

Esperado: warning en consola tipo `⚠️ State file is 10 days old.
Consider running 'pnpm login' to refresh.`, pero el script igual
corre (no error).

##### Paso 11.3.D.8 — Promover a skill (opcional)

```sh
mkdir -p ~/.claude/skills/github-private-repos/scripts
cp scripts/login-and-dump-state.ts \
   scripts/list-private-repos.ts \
   ~/.claude/skills/github-private-repos/scripts/
```

`~/.claude/skills/github-private-repos/SKILL.md`:

```markdown
---
name: github-private-repos
description: List your GitHub private repos to JSON without
  re-login. Uses storage state pattern. First run requires manual
  GitHub login; subsequent runs are headless.
auth-ttl: 14d
---

# GitHub Private Repos Lister

## First run (login)
\```sh
pnpm exec tsx ~/.claude/skills/github-private-repos/scripts/login-and-dump-state.ts
\```

Logueate manualmente en el browser que abre. Presioná Enter cuando
estés en el dashboard.

## Subsequent runs (list)
\```sh
export GITHUB_USERNAME=<tu-usuario>
pnpm exec tsx ~/.claude/skills/github-private-repos/scripts/list-private-repos.ts
\```

## Refresh
Cuando el script falla con exit 2 (state expirado), correr el
login script de nuevo. Esperable cada ~14 días.
```

#### E. Qué esperar (calibration)

Después del ejercicio:

- ✅ Tenés `playwright/.auth/github.json` en disco (gitignored).
- ✅ Podés correr `pnpm list-private` 5+ veces sin re-login.
- ✅ Sabés cómo se ve el archivo de state por dentro (es JSON
  legible — abrílo con un editor para ver cookies + localStorage).
- ✅ Sentido empírico de la diferencia entre login (headed,
  manual, 1×) vs uso (headless, automático, N×).

#### F. Gotchas comunes

| Síntoma | Causa probable | Fix |
|---|---|---|
| Después del login manual, el script no detecta que estás logueado | La validación URL es por substring y `/settings` matchea con `/notifications/settings` (raro, pero posible) | Usar `expect(page).toHaveURL(/\/settings$/)` con regex stricter |
| Storage state guardado pero `list-private-repos.ts` redirige a /login | Cookies de session GitHub son `Secure; HttpOnly; SameSite=Lax` y a veces no persisten correctamente entre browsers | Verificar que estás usando el MISMO browser engine (chromium + chromium) en login y list |
| `git status` muestra `playwright/.auth/github.json` | `.gitignore` no se aplica retroactivamente si el archivo se commiteó antes | `git rm --cached playwright/.auth/github.json` + commit el `.gitignore` |
| 2FA falla en login manual | TOTP code expiró antes de submitear | Empezar el flow de login con la app authenticator ya abierta |

---

## §12 Referencias y reading list

### Docs oficiales (verificadas 2026-04-26)

- [Playwright — Coding agents getting started](https://playwright.dev/docs/getting-started-cli) — la página canónica que distingue CLI vs MCP.
- [microsoft/playwright-cli en GitHub](https://github.com/microsoft/playwright-cli) — README con benchmarks de tokens.
- [Playwright — Authentication](https://playwright.dev/docs/auth) — storage state pattern oficial.
- [Playwright — Browsers](https://playwright.dev/docs/browsers) — install, channels, dependencies.
- [Claude Code — Extend with skills](https://code.claude.com/docs/en/skills) — docs oficiales de skills.
- [anthropics/skills en GitHub](https://github.com/anthropics/skills) — repo con skills de referencia.

### Análisis y benchmarks

- [Playwright CLI: Every Command & Setup Guide (2026)](https://testdino.com/blog/playwright-cli/) — benchmark CLI vs MCP (115K vs 25K tokens, claim secundaria — re-verificar para tu caso).
- [Skills for Claude Code — Anthropic Engineer Guide](https://medium.com/@tort_mario/skills-for-claude-code-the-ultimate-guide-from-an-anthropic-engineer-bcd66faaa2d6) — patterns y categorías de skills.

### Sitios públicos de práctica

- [practice.expandtesting.com](https://practice.expandtesting.com/) — diseñado para practicar test automation.
- [the-internet.herokuapp.com](https://the-internet.herokuapp.com/) — alternativa con varios escenarios de práctica.

### Cross-refs internos a este wiki

- [ultraplan-cloud-planning.md](ultraplan-cloud-planning.md) —
  cuando una fase de testing E2E es lo bastante compleja para
  justificar planning con Ultraplan.
- [superpowers-evaluation.md](superpowers-evaluation.md) —
  evaluación de plugin que automatiza disciplinas similares (TDD,
  worktrees, plans).

---

## §13 Cambios a este playbook

Este playbook evoluciona con la práctica. Cuando se cambia:

1. PR al repo donde vive este playbook.
2. Bump de `updated:` en frontmatter.
3. Si el cambio invalida prácticas previas, dejar nota en una
   sección "Migration notes" o equivalente.
4. Si el cambio viene de una corrección de docs oficiales
   Playwright/Anthropic, citar la fuente y la fecha del check.

### Changelog

- **2026-04-27 — v0.2.** Generalizado de versión kortex-lab-specific
  a wiki cross-project. Reemplazado §10 (era propuesta de un
  artifact framework interno) por §10 más generic ("Cuándo construir
  tu propio framework"). Agregada §11 con 3 ejemplos pedagógicos
  PRD-style (QA loop, scraping con learning, storage state) sobre
  GitHub.com + sitios públicos de práctica.
- **2026-04-26 — v0.1 inicial.** Ingest de transcripción de video
  YouTube + verificación contra docs oficiales 2026 + corrección de
  la herramienta recomendada (CLI dedicado vs scripts manuales).

## Backlinks
<!-- backrefs:start -->
- [superpowers-evaluation](superpowers-evaluation.md)
- [ultraplan-cloud-planning](ultraplan-cloud-planning.md)
<!-- backrefs:end -->

