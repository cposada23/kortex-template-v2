---
title: Ultraplan — Cloud-based Planning para fases complejas
type: playbook
layer: synthesis
language: es
tags:
  - playbook
  - claude-code
  - ultraplan
  - planning
updated: 2026-04-27T00:00:00.000Z
status: active
related_paths:
  - browser-automation-playwright.md
  - superpowers-evaluation.md
confidence: high
source_count: 4
last_verified: 2026-04-26T00:00:00.000Z
---

# Ultraplan — Cloud-based Planning para fases complejas

> **Scope:** este playbook aplica a **cualquier proyecto con PRD por
> fases** (`docs/PRD.md` o equivalente) o refactors complejos
> cross-file. NO aplica a tareas chicas, hotfixes, ni a flows que
> necesiten correr el propio MCP/script local del proyecto (Ultraplan
> no transfiere local MCP servers, custom scripts, ni DBs locales).
>
> **Cross-project:** este playbook está intencionalmente escrito sin
> referencia a estructuras internas de un repo concreto. El ejemplo
> pedagógico §6 es un proyecto descartable que cualquier dev con
> cuenta GitHub puede construir para aprender la herramienta.

---

## §1 Por qué este playbook existe

Los proyectos serios suelen tener PRDs con fases marcadas como
"complexity 3-4h" que requieren web search obligatorio + exploración
del codebase + diseño de tipos + threat modeling + Testing Plan
detallado **antes** de escribir código. En el terminal, ese planning
sale como un wall of text difícil de revisar y comentar puntualmente.

**Ultraplan** (feature de Claude Code en research preview, requiere
v2.1.91+) delega esa fase de planning a una sesión de Claude Code
**on the web** corriendo en plan mode. El plan se redacta en la nube
mientras tu terminal queda libre, y después lo revisás en el browser
con inline comments antes de aprobarlo.

Este playbook fija:

1. **Cuándo conviene** Ultraplan vs. local plan mode vs. PRD manual.
2. **Cómo se invoca** desde el CLI dentro de un proyecto.
3. **Cómo se mapea el output** al formato Phase Journal del PRD del
   proyecto (el bridge crítico que Ultraplan no resuelve solo).
4. **Sharp edges** específicos al setup de Claude Code on the web.
5. **Cómo Claude Code lo encuentra** (skill + project memory).

---

## §2 TL;DR

```sh
( cd <ruta-al-proyecto> && \
  git status &&                    # 1. todo commiteado?
  git push &&                      # 2. cloud session ve solo lo pusheado
  claude )                         # 3. abrir Claude Code

# dentro de Claude Code:
/ultraplan <prompt detallado de la fase del PRD>

# polling status: ◇ ultraplan → ◆ ultraplan ready
# abrir link, comentar inline, aprobar
# elegir "teleport back to terminal" → "Implement here"
```

Después: mapear las decisiones del plan al Phase Journal de la fase,
arrancar las tasks T<N>.<X> definidas en el PRD.

---

## §3 Cuándo usar / cuándo NO

| Situación | ¿Ultraplan? |
|---|---|
| Fase del PRD con complexity ≥3h, requiere explorar arquitectura | ✅ Sí |
| Refactor cross-file que toca >5 módulos | ✅ Sí |
| Diseño de un proyecto/sub-proyecto nuevo con scope ambiguo | ✅ Sí |
| Querés diagramas Mermaid/ASCII en el plan (si te toca el `visual_plan` engine) | ✅ Sí |
| Querés liberar el terminal mientras se genera el plan | ✅ Sí |
| Bugfix en una función localizada | ❌ No (overhead innecesario) |
| Iteración prompt-respuesta rápida | ❌ No (terminal es más rápido) |
| Flow que necesita usar un MCP local del proyecto durante el plan | ❌ No (no transfiere) |
| Hay cambios sin commitear que el plan necesita ver | ❌ No (commit primero) |
| Estás usando Claude Code con backend Bedrock / Vertex / Foundry | ❌ No (no soportado) |
| Tarea de una oración | ❌ No (overkill) |

**Regla heurística:** si el task se puede describir en una línea y
ya sabés más o menos cómo va a ir, plan local. Si necesitás que
Claude explore el repo, considere alternativas, y produzca el
borrador de un Testing Plan — Ultraplan.

---

## §4 Pre-requisitos (verificar 1× por proyecto)

Checklist antes de la primera vez que usás Ultraplan en un proyecto:

- [ ] **Claude Code v2.1.91+ instalado.** Verificar con `claude --version`.
- [ ] **Cuenta de Claude Code on the web activa.** Login en
      [https://claude.ai/code](https://claude.ai/code).
- [ ] **El proyecto tiene su repo GitHub conectado al claude.ai
      account.** El primer launch de Ultraplan crea el cloud
      environment automáticamente si no existe.
- [ ] **El proyecto tiene un PRD escrito y pusheado al remoto** en
      una ruta convencional (`docs/PRD.md`, `PRD.md`, `README.md`
      con sección "Roadmap" — el path exacto se referencia en el
      prompt). Sin esto, la cloud session no puede leerlo.
- [ ] **No estás usando Bedrock/Vertex/Foundry como backend.**
      Ultraplan corre solo en la cloud nativa de Anthropic.
- [ ] **Branches base existen en el remoto** (típicamente `main` y
      una branch de integración tipo `staging` o `develop`, según
      la convención del proyecto).

---

## §5 Workflow paso a paso

### Paso 1 — Pre-flight

Desde la raíz del proyecto, verificar estado limpio (regla: la cloud
session ve solo lo pusheado):

```sh
( cd <ruta-al-proyecto> && \
  git status &&                    # debe estar limpio
  git branch --show-current &&     # confirmar branch
  git push )                       # asegurar que remoto está al día
```

Si hay cambios sin commitear que el plan necesita ver, comitealos
en una branch dedicada antes de seguir:

```sh
( cd <ruta-al-proyecto> && \
  git checkout -b prep/ultraplan-context && \
  git add . && git commit -m "chore: snapshot for ultraplan context" && \
  git push -u origin prep/ultraplan-context )
```

(Después podés borrar esta branch o mergearla a tu integration branch
según el caso.)

### Paso 2 — Lanzar `/ultraplan`

Tres formas de invocarlo, en orden de claridad:

**Forma A — Slash command (recomendada para fases del PRD):**

```sh
( cd <ruta-al-proyecto> && claude )
```

Una vez en Claude Code:

```
/ultraplan <prompt detallado>
```

**Forma B — Keyword en prompt normal:**

```
necesito que ultraplan el diseño de la tool ...
```

Claude detecta la palabra "ultraplan" y propone lanzar la cloud
session.

**Forma C — Desde un local plan existente:**

Si ya estás en plan mode local (`Shift+Tab` o `/plan`) y al ver el
plan generado pensás "esto necesita más exploración del codebase",
en el approval dialog elegí **"No, refine with Ultraplan on Claude
Code on the web"**. El borrador se manda a la nube para iteración
profunda.

**Cómo escribir el prompt** (clave para que el plan salga útil):

1. Mencioná el archivo del PRD con path relativo:
   `según docs/PRD.md §"Fase N — <nombre>"`.
2. Listá la arquitectura existente que el plan debe respetar
   (stack, patrones, principios no-negociables).
3. Pedí explícitamente: tipos, edge cases, tests adversariales,
   audit log entries, errores idempotentes — lo que el PRD pida.
4. Cerrá con los principios de diseño no-negociables del proyecto
   (multi-tenant, path allowlist, validación en bordes, etc.)

### Paso 3 — Polling y status

El terminal muestra un indicador mientras la cloud session trabaja.
Estados posibles:

| Status | Significado | Acción |
|---|---|---|
| `◇ ultraplan` | Investigando codebase y redactando | Esperá; podés laburar en otro worktree |
| `◇ ultraplan needs your input` | Pregunta de clarificación | Abrí el link y respondé |
| `◆ ultraplan ready` | Plan listo para revisar | Abrí el link |

Si querés inspeccionar progreso:

```
/tasks
```

Y seleccioná la entrada de ultraplan para ver session link, agent
activity, y opción de **Stop ultraplan** (archiva la cloud session
sin guardar nada local).

Tiempo típico: la cloud session puede correr **hasta 30 minutos**.
Aprovechá para hacer otra cosa — abrir un worktree paralelo
(ver [browser-automation-playwright.md](browser-automation-playwright.md)
para casos donde aplica esa orquestación) o avanzar tareas no
relacionadas.

### Paso 4 — Revisar y refinar en el browser

Cuando aparece `◆ ultraplan ready`, abrí el link en el navegador.
Vas a ver el plan en una vista dedicada con:

- **Inline comments**: seleccioná cualquier pasaje y dejá un
  comentario para que Claude lo refine.
- **Emoji reactions**: marcá secciones con 👍 / 👎 / ❓ sin escribir
  comentario completo.
- **Outline sidebar**: saltar entre secciones rápido.

**Patrón efectivo de review** (basado en post-mortems de Steve
Kinney y la docs oficial):

1. Leé todo el plan una vez sin comentar.
2. Segunda pasada: comentá secciones específicas, no replies
   genéricos al plan completo. Especificidad gana.
3. Pedí lo que el PRD pide y no aparece: tests adversariales, audit
   entries, manejo de errores específicos, diagramas si no salieron.
4. Iterá hasta que sentís que el plan cubre lo que la fase
   necesita. No hay límite de iteraciones.

### Paso 5 — Decidir dónde ejecutar

Cuando el plan está listo, dos opciones desde el browser:

**Opción A — Execute on the web (PR remoto):**

> "Approve Claude's plan and start coding"

La misma cloud session implementa el plan, abre PR contra `main`
(o la branch que el cloud env tenga configurada). El terminal local
limpia el indicator. Después revisás el diff en la web y mergeás.

**Cuándo conviene:** quando podés delegar la implementación completa
y no necesitás tu environment local (ej. tasks que son puramente
lógica + tests sin dependencias raras).

**Opción B — Teleport back to terminal (implementación local):**

> "Approve plan and teleport back to terminal"

La cloud session se archiva. Tu terminal muestra un dialog
**"Ultraplan approved"** con tres opciones:

- **Implement here**: inyecta el plan en tu conversación actual y
  seguís desde ahí. Útil si ya tenías context cargado.
- **Start new session**: limpia la conversación y empieza fresh con
  solo el plan como context. Recomendado para fases largas — evita
  context rot.
- **Cancel**: guarda el plan a un archivo (Claude imprime el path)
  para referencia futura sin ejecutarlo.

**Cuándo conviene Opción B:** cuando necesitás tu environment local
(MCP servers, secrets en `.dev.vars`, scripts custom). Default para
proyectos que dependen de su propio stack local.

Si elegís "Start new session", Claude imprime un comando
`claude --resume <session-id>` para volver a la conversación previa
si la necesitás.

---

## §6 Ejemplo pedagógico — "Repo Stats Exporter"

Esta sección es un **mini-PRD** de un proyecto descartable diseñado
**específicamente para aprender Ultraplan**. El proyecto no tiene
valor productivo; su único propósito es darte un scaffold real donde
ejercitar el workflow del playbook end-to-end.

> **Tu rol al hacer este ejercicio:** seguir el step-by-step
> verbatim. NO improvisar el flujo. El objetivo es que termines con
> un sentido **calibrado** de cuánto valor aporta Ultraplan vs cuánto
> overhead introduce, para tu propio judgement futuro.

### §6.1 Qué vamos a construir

**Nombre:** Repo Stats Exporter
**Ubicación sugerida:** repo personal nuevo en GitHub, separado del
proyecto donde estás aprendiendo (ubicación final TBD — se decide
cuando se implementa por primera vez).

**Funcionalidad:**

- CLI tool en TypeScript que lee un archivo `repos.txt` (input).
- Para cada línea (formato `owner/repo`), consulta GitHub API y
  obtiene: stars count, forks count, open issues count, last commit
  date del default branch, license SPDX ID, primary language.
- Escribe los resultados a un archivo CSV `repos-stats-YYYY-MM-DD.csv`
  con una fila por repo + header.
- Reporta progreso en consola (`Procesando 3 de 12: vercel/next.js`).
- Si un repo individual falla, loggea el error pero continúa con los
  siguientes (no aborta el job entero).

**Out of scope explícito (NO se construye):**

- UI / dashboard.
- Persistencia en DB (solo CSV).
- Soporte a otras forges (GitLab, Bitbucket, Gitea).
- Watch mode / scheduled runs / cron.
- Datos históricos (solo snapshot al momento de correr).
- Exportar a otros formatos (JSON, Excel, Parquet).
- Webhook listening / push updates.

### §6.2 Por qué este proyecto demuestra Ultraplan

**Por qué Ultraplan SÍ aplica acá:**

1. **Complexity ~3h:** cumple el threshold del playbook §3 (≥3h).
2. **Requiere exploración del API:** Octokit tiene varios paquetes
   (`@octokit/rest`, `@octokit/graphql`, `@octokit/core`) y decidir
   cuál es la decisión de arquitectura más importante.
3. **Tradeoffs reales para el plan:**
   - REST vs GraphQL: REST = simple pero N+1 calls (uno por repo);
     GraphQL = 1 call para varios repos pero schema complexity.
   - Auth opcional: PAT da 5000 req/h vs 60 sin auth — afecta UX para
     listas grandes.
   - Retry strategy: exponential backoff vs simple retry vs fail-fast.
   - Concurrency: serial (predecible) vs `Promise.all` con
     concurrency limit (más rápido pero más rate-limit-prone).
4. **Edge cases no triviales** que un plan debe enumerar:
   - Repo no existe (404).
   - Repo privado sin permiso (404 también — GitHub esconde
     existencia).
   - Repo con 0 commits / branch vacío.
   - Rate limit hit (403 con header específico).
   - Network timeout.
   - Input file con líneas inválidas (formato no `owner/repo`).
   - Líneas duplicadas en el input.
   - Caracteres unicode en repo names.
5. **Tests adversariales relevantes:** GitHub permite caracteres
   inesperados en owner/repo names — un test adversarial worth
   pedir al plan.

**Por qué local plan NO bastaría:**

- El plan necesita decidir REST vs GraphQL después de leer la docs
  de ambos paquetes Octokit. Eso es ~10 min de exploration que hace
  mejor la cloud session que el terminal local.
- Edge cases del API GitHub (rate limit headers exactos, formato de
  errores 403 vs 404) son detalles técnicos que el plan debe
  enumerar — un local plan-mode tiende a saltar esos.

**Por qué NO es overkill:**

- 3h justifica los 15-25 min de overhead de Ultraplan.
- El output del plan es directamente accionable (vas a las tasks
  T1.1 a T1.N de la Fase 1 del PRD que vamos a crear).

### §6.3 Pre-requisitos del ejercicio

Antes de arrancar, verificá uno por uno (no asumas que están — en la
mitad del ejercicio descubrir un faltante mata el flow):

- [ ] **Cuenta GitHub** con permiso de crear repos públicos.
- [ ] **Node.js 20.x o 22.x.** Verificar: `node -v`.
- [ ] **pnpm** instalado. Verificar: `pnpm -v`. Si no:
  `npm install -g pnpm`.
- [ ] **Editor con soporte TypeScript** (VS Code, Cursor, Zed con
  LSP, etc.).
- [ ] **Claude Code v2.1.91+** instalado. Verificar:
  `claude --version`.
- [ ] **Cuenta Claude Code on the web activa.** Login una vez en
  [https://claude.ai/code](https://claude.ai/code).
- [ ] **(Opcional)** Personal Access Token de GitHub. Solo necesario
  si vas a probar con repos privados o querés correr con el rate
  limit alto (5000 vs 60 req/h). Para el ejercicio default
  (repos públicos), no es necesario.

Si alguno falta: instalar/crear ANTES de seguir. No empieces a
medias.

### §6.4 Setup del repo (Fase 0 del PRD)

Esta es la parte que **NO usa Ultraplan** — es scaffolding manual
plano. Solo después arrancás Ultraplan para Fase 1.

#### Paso 6.4.1 — Crear repo en GitHub

1. Abrir [https://github.com/new](https://github.com/new) en el
   navegador.
2. **Repository name:** `repo-stats-exporter` (o el nombre que
   prefieras — el resto del ejercicio asume `repo-stats-exporter`).
3. **Description:** "CLI tool to export GitHub repo stats to CSV
   (learning project for Claude Code Ultraplan workflow)".
4. **Visibility:** Public.
5. **Initialize this repository with:** marcar las 3 opciones:
   - ✅ Add a README file
   - ✅ Add .gitignore → seleccionar template **Node**
   - ✅ Choose a license → seleccionar **MIT License**
6. Click **Create repository**.

#### Paso 6.4.2 — Clonar localmente

Desde una terminal, en la carpeta donde guardás proyectos personales
(NO dentro de otro repo — debe ser standalone):

```sh
cd ~/projects   # o donde sea
git clone https://github.com/<tu-usuario>/repo-stats-exporter.git
cd repo-stats-exporter
```

Reemplazá `<tu-usuario>` por tu username GitHub.

#### Paso 6.4.3 — Inicializar TypeScript + tsx

```sh
pnpm init
pnpm add -D typescript @types/node tsx
pnpm exec tsc --init
```

Esto crea `package.json`, `node_modules/`, y `tsconfig.json`.

#### Paso 6.4.4 — Configurar `tsconfig.json`

Abrir `tsconfig.json` y reemplazar el contenido por:

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["es2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

#### Paso 6.4.5 — Configurar `package.json` scripts

Editar `package.json` y reemplazar la sección `scripts` por:

```json
"scripts": {
  "dev": "tsx src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js",
  "typecheck": "tsc --noEmit"
}
```

Y agregar:

```json
"type": "module"
```

al nivel raíz del JSON (para que TypeScript ESM funcione bien con
Node 20+).

#### Paso 6.4.6 — Crear estructura inicial

```sh
mkdir -p src docs
echo 'console.log("hello, repo-stats-exporter");' > src/index.ts
```

Verificar que corre:

```sh
pnpm dev
```

Debe imprimir `hello, repo-stats-exporter`. Si falla, revisar
`tsconfig.json` y `package.json` (el `"type": "module"` es typical
culpable).

#### Paso 6.4.7 — Crear el PRD esqueleto

Crear `docs/PRD.md` con este contenido **verbatim** (este es el PRD
que Ultraplan va a leer en Fase 1):

```markdown
---
title: "Repo Stats Exporter — PRD"
status: draft
phase: 0
updated: YYYY-MM-DD
---

# Repo Stats Exporter — PRD

## §1 Goal

CLI tool en TypeScript que lee un archivo de input con repos GitHub
y exporta un CSV con stats básicos (stars, forks, open issues, last
commit, license, primary language).

Proyecto de aprendizaje del workflow Ultraplan. NO está pensado para
producción. Out of scope explícito en §3.

## §2 Fases

- **Fase 0 — Setup** (scaffolding manual, completada al committear
  este PRD).
- **Fase 1 — Core** (LA QUE VAMOS A PLANEAR CON ULTRAPLAN):
  leer input, llamar API, escribir CSV, manejo de errores básico.
- **Fase 2 — Hardening** (post-Fase 1): rate limit handling, retry
  con backoff, validación de input.
- **Fase 3 — Tests** (opcional): unit tests + integration tests
  contra GitHub API real con repos conocidos.

## §3 Out of scope

- UI / dashboard.
- Persistencia en DB.
- Soporte a otras forges (GitLab, Bitbucket).
- Watch mode / scheduled runs.
- Datos históricos.
- Exportar a otros formatos.
- Webhook listening.

## §4 Fase 1 — Core (a planear con Ultraplan)

### §4.1 Goal

Implementar el flow happy-path completo: leer `repos.txt`, llamar
GitHub API por cada repo, escribir CSV, reportar progreso, loggear
errores individuales sin abortar el job.

### §4.2 Tasks (a llenar tras Ultraplan)

[Acá va el output del plan generado por Ultraplan, mappeado a tasks
T1.1, T1.2, ..., T1.N. Ultraplan rellena esta sección.]

### §4.3 Stack

- Node 20+ con TypeScript strict.
- Octokit como cliente GitHub (a decidir entre REST y GraphQL en el
  plan).
- Output CSV usando una librería ligera (a decidir en el plan, con
  preferencia por single dependency adicional).
- Sin DB, sin frameworks adicionales.

### §4.4 Principios no-negociables

- Si un repo individual falla, loggear y continuar (no abortar el
  job).
- Idempotencia: mismo input = mismo output.
- Order estable del CSV (no depender de orden de respuestas API).
- Output reproducible.

### §4.5 Testing Plan (a llenar tras Ultraplan)

[Edge cases identificados por Ultraplan + tests adversariales
sugeridos. Ultraplan rellena esta sección.]
```

Reemplazá `YYYY-MM-DD` por la fecha de hoy.

#### Paso 6.4.8 — Crear `repos.txt` de ejemplo

Para que el ejercicio sea real, necesitás un input file. Crear
`repos.txt` con 3-5 repos públicos conocidos:

```
microsoft/playwright
anthropics/claude-code
vercel/next.js
# Líneas con # son comentarios
nodejs/node
```

#### Paso 6.4.9 — Commit + push

```sh
git add .
git commit -m "chore: Fase 0 scaffold + PRD draft"
git push origin main
```

Verificar en GitHub que los archivos aparecen.

### §6.5 Invocar Ultraplan para Fase 1

Esta es la parte central del ejercicio. Acá ejercitás el playbook
§5 sobre un caso real.

#### Paso 6.5.1 — Pre-flight (re-confirmar)

```sh
cd ~/projects/repo-stats-exporter   # o donde lo clonaste
git status                          # debe estar limpio
git push                            # ya pusheaste, pero idempotente
```

Si `git status` muestra cambios, commitealos antes de seguir
(playbook §5 Paso 1).

#### Paso 6.5.2 — Abrir Claude Code

```sh
claude
```

Verás el prompt de Claude Code en tu terminal.

#### Paso 6.5.3 — Construir el prompt

Construir el prompt con los **4 elementos** del playbook §2 (forma A
del slash command). Usá este prompt **literal** la primera vez —
después podés tunear:

```
/ultraplan implementar la Fase 1 (Core) del PRD `docs/PRD.md` del
proyecto `repo-stats-exporter`. Esta fase construye un CLI tool en
TypeScript que lee `repos.txt`, consulta GitHub API por cada repo, y
escribe `repos-stats-YYYY-MM-DD.csv` con columnas: owner, repo, stars,
forks, open_issues, last_commit_date, license_spdx, primary_language.

Stack existente:
- Node 20+ con TypeScript strict (tsconfig.json ya configurado).
- pnpm para package management.
- tsx para correr TS directo.
- Sin DB, sin frameworks adicionales.

Decisiones que el plan debe tomar:
1. Cliente GitHub: `@octokit/rest` v22 vs `@octokit/graphql` v8. Con
   los siguientes ejes a comparar: número de requests por N repos,
   complejidad del schema, dificultad de retry granular,
   maintenance burden.
2. Librería CSV: comparar `csv-stringify` v6 vs string concatenation
   manual con escape básico. Trade-off: 1 dep más vs ~20 líneas de
   código custom.
3. Concurrencia: serial vs Promise.all con concurrency limit (ej.
   p-limit). Ejes: predictability, rate limit risk, throughput.
4. Auth: usar PAT desde env var `GITHUB_TOKEN` si existe; fallar a
   no-auth si no. Documentar el rate limit implication en el README.

Principios no-negociables (PRD §4.4):
- Si un repo individual falla, loggear y continuar.
- Idempotencia: mismo input = mismo output.
- Order estable del CSV (orden del input file, no orden de respuesta).
- Output reproducible.

Proponé:
1. Schema TypeScript de input (RepoSpec) y output (StatsRow).
2. La decisión de los 4 ejes anteriores con tradeoffs explícitos.
3. Algoritmo de procesamiento (pseudocódigo o flow detallado).
4. Manejo de errores por repo, con códigos HTTP específicos:
   - 404 (repo no existe O privado sin permiso): loggear y skipear.
   - 403 con header `X-RateLimit-Remaining: 0`: backoff y retry hasta 3
     veces, después fallar con mensaje claro.
   - 401: fallar el job entero (auth inválido).
   - Network timeout (default 10s): retry hasta 2 veces.
   - Otros 5xx: retry una vez, después loggear y skipear.
5. Edge cases en el input file:
   - Líneas vacías o whitespace puro.
   - Comments (`#` al inicio, ya en `repos.txt` de ejemplo).
   - Formato inválido (`owner/repo` strict — qué hacer si una línea
     tiene 3 slashes o 0).
   - Duplicados (deduplicar antes de procesar?).
6. Tests adversariales mínimos a escribir:
   - Repo names con caracteres unicode.
   - Owner names con guiones (válido en GitHub: `signal-noise/foo`).
   - Repo con 0 stars / 0 forks.
   - Repo sin commits (default branch vacío).
   - Repo con primary_language null (puro markdown).
7. Diseño de la entrada del progreso log a stdout (formato exacto, no
   solo "alguna info").
8. Mermaid diagram del flow happy-path + 2 error paths (404 + rate
   limit).

El plan debe quedar listo para implementar en la siguiente sesión
local. Mappear las tasks resultantes a §4.2 del PRD como T1.1, T1.2,
..., T1.N.
```

#### Paso 6.5.4 — Mostrar el prompt al usuario antes de ejecutar

Si estás siguiendo este ejercicio con un agente Claude Code (no
solo, sino con el agente que sigue este playbook), el agente DEBE
mostrarte el prompt completo y pedirte confirmación antes de ejecutar
`/ultraplan` (regla del playbook §5 Paso 2).

Si lo estás haciendo solo: leé el prompt arriba, asegurate que
tiene los 4 elementos del playbook (PRD ref, stack, principios,
entregables), y entonces dale enter.

#### Paso 6.5.5 — Polling

Mientras corre verás `◇ ultraplan` en el indicator del terminal.
Tiempo esperado para esta fase específica: **15-25 minutos**.

Cosas que podés hacer mientras tanto (sin bloquear):

- Leer el README de `@octokit/rest`:
  [https://github.com/octokit/rest.js](https://github.com/octokit/rest.js)
- Leer el README de `@octokit/graphql`:
  [https://github.com/octokit/graphql.js](https://github.com/octokit/graphql.js)
- Hacer `/tasks` en otra ventana de Claude Code para ver el session
  link del Ultraplan en curso.

**No abrir un worktree paralelo en este ejercicio** — el proyecto
es chico, no hay branches paralelas que justifiquen.

#### Paso 6.5.6 — Review del plan en el browser

Cuando aparece `◆ ultraplan ready` en el terminal:

1. Click el link que muestra el indicator (te lleva a
   claude.ai/code).
2. **Primera pasada — leer todo sin comentar.** Tomar notas mentales
   o en un archivo aparte de cosas que querés que cambien.
3. **Segunda pasada — comentar inline** específicamente. NO escribir
   "el plan se ve bien" o "le falta algo" en general. Específico:
   - Si decidió REST y vos esperabas GraphQL → comentar en esa
     sección con la pregunta concreta ("¿no sería 1 request en
     GraphQL vs N en REST?").
   - Si los edge cases del input file no incluyen líneas con BOM
     (ej. archivo guardado en Windows con UTF-8 BOM) → comentar y
     pedir agregar.
   - Si el Mermaid diagram muestra solo happy path → pedir los 2
     error paths del prompt.

4. **Cosas mínimas que el plan debe tener** (si faltan, pedirlas):
   - Schema TypeScript completo de RepoSpec y StatsRow (no solo
     "interface RepoSpec").
   - Decisión REST vs GraphQL con tradeoff cuantitativo (no solo
     "REST es más simple").
   - Los 5 edge cases de error HTTP del prompt (404, 403 rate limit,
     401, timeout, 5xx).
   - Pseudocódigo del happy path (no solo descripción narrativa).
   - Order del CSV explícito (orden del input, no orden de respuesta).

5. **Iterá las veces que necesites.** No hay límite. Cada
   comentario es un round trip de ~1-3 min con la cloud session.

#### Paso 6.5.7 — Decidir teleport

Cuando estás contento con el plan:

1. Click **"Approve plan and teleport back to terminal"**.
2. En el terminal, te aparece el dialog "Ultraplan approved" con 3
   opciones:
   - **Implement here** — útil si querés ejecutar de inmediato.
   - **Start new session** — recomendado para este ejercicio. La
     fase 1 va a generar bastante código + tests + el PRD update;
     mejor empezar fresh con solo el plan como context.
   - **Cancel** — si solo querés guardar el plan a archivo y no
     implementar todavía.
3. Para este ejercicio, elegí **Cancel** (guarda a archivo). El
   ejercicio termina acá — NO querés que el agente arranque a
   implementar la Fase 1 todavía.

   Claude imprime el path del archivo guardado (algo como
   `/tmp/ultraplan-output-1727..._.md` o similar).

### §6.6 Post-teleport — mapear el output al Phase Journal

Esta sección es **el bridge crítico** que Ultraplan no resuelve solo
(playbook §7).

#### Paso 6.6.1 — Mover el plan a `docs/journal/`

```sh
mkdir -p docs/journal
mv /tmp/ultraplan-output-<timestamp>.md docs/journal/phase-1-ultraplan-plan.md
```

(Reemplazá `<timestamp>` por el path real que imprimió Claude.)

#### Paso 6.6.2 — Crear el Phase Journal de la Fase 1

```sh
touch docs/journal/phase-1.md
```

Editá `docs/journal/phase-1.md` con este esqueleto:

```markdown
---
title: "Fase 1 — Core — Phase Journal"
status: planned
phase: 1
plan_source: phase-1-ultraplan-plan.md
created: YYYY-MM-DD
---

# Fase 1 — Core — Phase Journal

Esta página se llena EN VIVO mientras se implementa la fase. NO al
final. Ultraplan puebla "Decisiones tomadas" inicialmente; el resto
sale durante la implementación.

## Decisiones tomadas

[Pre-pobladas desde el plan Ultraplan — actualizar si cambian
durante implementación.]

- **Cliente GitHub:** [REST | GraphQL] — porque [razón].
  Alternativa descartada: [la otra] porque [razón].
- **Librería CSV:** [csv-stringify | string concat] — porque [razón].
- **Concurrencia:** [serial | Promise.all + p-limit con limit N] —
  porque [razón].
- **Auth:** PAT opcional via `GITHUB_TOKEN` env. Sin PAT = rate
  limit 60/h. Con PAT = 5000/h. Documentado en README.

## Sorpresas

[Llenar durante implementación: cosas que el plan no previó.]

## Bugs encontrados

[Llenar durante implementación: bugs propios + de Octokit/etc.]

## Insights de testing

[Llenar tras correr los tests adversariales: qué edge case rompió,
cómo se fixeó.]
```

#### Paso 6.6.3 — Pre-poblar la sección "Decisiones tomadas"

Abrir `docs/journal/phase-1-ultraplan-plan.md` (el output completo
del plan) y leer. Encontrar las 4 decisiones (cliente, CSV,
concurrencia, auth).

Para cada una, copiar al journal en formato:
`{Decisión}: {por qué} — {alternativa descartada y por qué}`.

Ejemplo si el plan eligió `@octokit/rest`:

> - **Cliente GitHub:** `@octokit/rest` v22 — porque el ejercicio
>   tiene listas pequeñas (<20 repos) donde N requests REST es
>   simpler que orquestar GraphQL queries con paginación. Alternativa
>   descartada: `@octokit/graphql` porque para el caso típico no
>   ahorra requests significativamente y agrega schema complexity.

#### Paso 6.6.4 — Mover edge cases al Testing Plan del PRD

Abrir `docs/PRD.md` §4.5 y reemplazar el placeholder con los edge
cases que el plan identificó. Ejemplo:

```markdown
### §4.5 Testing Plan

#### Tests unitarios

- [ ] T1.test.1 — Parse `repos.txt`: línea válida `owner/repo`.
- [ ] T1.test.2 — Parse `repos.txt`: línea con `#` se skipea.
- [ ] T1.test.3 — Parse `repos.txt`: línea vacía/whitespace se skipea.
- [ ] T1.test.4 — Parse `repos.txt`: formato inválido (`a/b/c`)
      lanza error claro.

#### Tests de integración (contra GitHub API real)

- [ ] T1.test.5 — Repo público existente devuelve stats correctos
      (usar `microsoft/playwright` como fixture estable).
- [ ] T1.test.6 — Repo no existente devuelve 404 → loggea + skipea
      (no aborta).
- [ ] T1.test.7 — Repo con primary_language null no rompe el CSV.
- [ ] T1.test.8 — Owner con guiones (`signal-noise/foo`) parsea OK.

#### Tests adversariales

- [ ] T1.test.9 — Repo names con caracteres unicode no rompen el
      parser ni el CSV.
- [ ] T1.test.10 — Input file con BOM UTF-8 al inicio se maneja.
- [ ] T1.test.11 — Mismo input corrido 2 veces produce CSVs idénticos
      (idempotencia).
```

#### Paso 6.6.5 — Mappear las tasks al PRD §4.2

Mirar el plan completo y extraer las tasks accionables. Tipicamente
quedan ~5-8 tasks. Reemplazar el placeholder de §4.2 del PRD:

```markdown
### §4.2 Tasks

- [ ] **T1.1** — Definir tipos `RepoSpec` y `StatsRow` en
      `src/types.ts`.
- [ ] **T1.2** — Implementar parser de `repos.txt` en
      `src/parse-input.ts` (con tests T1.test.1-4).
- [ ] **T1.3** — Implementar cliente GitHub en
      `src/github-client.ts` con la decisión REST/GraphQL del plan.
- [ ] **T1.4** — Implementar manejo de errores por repo (404 →
      skip, 401 → abort, etc.) según plan §<X>.
- [ ] **T1.5** — Implementar serializer CSV en `src/write-csv.ts`
      con la librería decidida en el plan.
- [ ] **T1.6** — Wire-together en `src/index.ts` con CLI args
      básicos: `tsx src/index.ts --input repos.txt --output
      repos-stats.csv`.
- [ ] **T1.7** — Documentar en README: install, usage, auth opcional,
      rate limits.
```

(El listado real depende del plan. Lo importante: cada task tiene
**path concreto** + **referencia al plan**.)

#### Paso 6.6.6 — Crear ADR si aplica

Si el plan tomó alguna decisión arquitectural significativa con
diagrama Mermaid (típicamente cliente GitHub REST vs GraphQL), crear
un ADR:

```sh
mkdir -p docs/adr
touch docs/adr/0001-github-client-choice.md
```

Editá con el formato ADR estándar:

```markdown
---
title: "ADR 0001 — GitHub Client Choice (REST vs GraphQL)"
status: accepted
date: YYYY-MM-DD
---

# ADR 0001 — GitHub Client Choice (REST vs GraphQL)

## Status

Accepted (decided in Ultraplan Fase 1, 2026-XX-XX).

## Context

[Copiar del plan: por qué este proyecto necesita un cliente GitHub
y qué opciones existen.]

## Decision

[Copiar la decisión del plan, con mermaid si aplica.]

## Consequences

[Trade-offs: qué ganamos, qué perdemos.]
```

#### Paso 6.6.7 — Commit del journal

```sh
git add docs/
git commit -m "docs(phase-1): map ultraplan output to PRD tasks + journal"
git push origin main
```

### §6.7 Qué esperar del plan (calibración)

Si el ejercicio salió bien, el plan que recibiste tiene:

- ✅ Schema TypeScript completo de los inputs y outputs (no solo
  prosa describiéndolos).
- ✅ Decisión REST vs GraphQL con tradeoffs cuantitativos (no
  cualitativos vagueante).
- ✅ Los 5+ edge cases HTTP especificados en el prompt.
- ✅ Pseudocódigo (o lo más parecido) del happy path.
- ✅ Tests adversariales del prompt + algún extra que se le ocurrió
  al engine.
- ⚠️ **Posible faltante:** Mermaid diagram. Si te tocó el engine
  `simple_plan`, no salen diagramas automáticamente. Si lo
  necesitás, pedirlo en el review (Paso 6.5.6 §3).
- ⚠️ **Posible faltante:** Unicode adversarial test. Casi siempre
  hay que pedirlo explícito (no es default).

Si el plan tiene **menos** que esto: el prompt fue muy abstracto.
Cancelar (`/tasks` → Stop ultraplan), reescribir el prompt con más
especificidad (mencionar paths concretos del repo, librerías
específicas, edge cases exactos), relanzar.

### §6.8 Gotchas comunes en este ejercicio

| Síntoma | Causa probable | Fix |
|---|---|---|
| El plan elige REST sin justificar vs GraphQL | El prompt no pidió comparación explícita en ese eje | Re-prompt en review: "compará REST vs GraphQL en estos 4 ejes específicamente: ..." |
| El plan no tiene Mermaid diagram | Engine asignado fue `simple_plan` | En review, pedir explícito: "agregá Mermaid diagram del flow happy-path" |
| `git push` falla en pre-flight | El repo no estaba conectado a tu cuenta GitHub en claude.ai/code | Verificar settings de Claude Code on the web → Connected repos |
| Cloud session timeout antes de los 30 min | Prompt muy ambiguo | Cancelar, reescribir prompt con paths/libs específicas, relanzar |
| Teleport no aparece como opción | Cerraste el terminal o el polling se murió | Solo queda Opción A (execute on the web) |
| El plan asume frameworks que no quería (Express, Vitest, etc.) | El prompt no listó "no agregar deps adicionales" explícito | Re-prompt: "el plan no debe agregar dependencias más allá de las listadas en el stack" |

### §6.9 Cuándo terminás el ejercicio

El ejercicio se considera **completo** cuando:

- [ ] Tenés un plan en `docs/journal/phase-1-ultraplan-plan.md`.
- [ ] El PRD §4.2 está rellenado con tasks T1.1-T1.N concretas
      (paths + referencias al plan).
- [ ] El PRD §4.5 está rellenado con tests específicos.
- [ ] El Phase Journal `docs/journal/phase-1.md` tiene la sección
      "Decisiones tomadas" pre-poblada.
- [ ] Si hay decisión arquitectural significativa, hay un ADR en
      `docs/adr/`.
- [ ] Todo eso commiteado y pusheado.

**No es necesario implementar la Fase 1.** El ejercicio enseña el
**workflow de Ultraplan**, no a construir el CLI tool. Si querés
implementar la Fase 1 después como práctica adicional de Claude
Code, hacelo en una sesión separada.

### §6.10 Después del ejercicio — calibración personal

Una vez completo el ejercicio, escribí 5 bullets en
`docs/journal/phase-1.md` §"Insights del workflow":

1. **¿Cuánto tiempo activo tomó?** (no la cloud session — tu tiempo
   real frente a la pantalla).
2. **¿Cuánto tiempo de cloud session?** (el polling).
3. **¿Cuántos rounds de comments en el browser hiciste?**
4. **¿Qué del plan habrías hecho diferente con local plan-mode?**
   (Esto te dice si Ultraplan agregó valor neto.)
5. **¿Vale la pena para tu próximo proyecto real?** (1-10 + razón).

Esto es **el deliverable que justifica** el ejercicio: una opinión
calibrada sobre Ultraplan basada en uso real, no en docs.

---

## §7 Mapear output al Phase Journal del PRD

**Esto es el bridge crítico que Ultraplan no resuelve solo.** El
output de Ultraplan es un plan estructurado; el Phase Journal del
PRD pide algo distinto.

### Qué Ultraplan da vs qué Phase Journal pide

| Output Ultraplan | Sección Phase Journal |
|---|---|
| Diseño de tipos / schemas | (no va al journal — va al código) |
| Algoritmos propuestos con tradeoffs | **Decisiones tomadas** (transcribir el tradeoff) |
| Edge cases identificados | (no va al journal — va a Testing Plan del PRD) |
| Tests adversariales propuestos | (no va al journal — va al Testing Plan + código) |
| Mermaid diagrams | (opcional: pegar al ADR si la decisión es arquitectural) |
| Comentarios inline que dejaste | (no se transfieren — perderías contexto si no los anotás) |

### Patrón recomendado

Al terminar Paso 4 (review en browser), antes de teleport, copiar a
un archivo local:

1. **El plan completo final** → `docs/journal/phase-N-ultraplan-plan.md`
   (referencia futura).
2. **Las decisiones de tradeoff** → entradas pre-pobladas en
   `docs/journal/phase-N.md` §"Decisiones tomadas" con formato:
   `{Decisión}: {por qué} — {alternativa descartada y por qué}`.
3. **Los edge cases** → tasks adicionales al Testing Plan del PRD
   (`docs/PRD.md` §"Testing Plan" de la fase) si no estaban.
4. **Los Mermaid diagrams** → si la decisión es arquitectural,
   nuevo ADR en `docs/adr/000N-<topic>.md`.

El **Phase Journal en sí** se sigue llenando **EN VIVO mientras
trabajás**, no al final. Ultraplan puebla el "antes de empezar" del
journal; el journal real se escribe durante la implementación.

---

## §8 Sharp edges

### §8.1 Local MCP servers no transfieren

Las cloud sessions de Ultraplan corren en la VM de Anthropic.
**Cualquier MCP server local, custom script, o DB local que tenés
configurado NO está disponible** ahí. Esto significa:

- ✅ Podés usar Ultraplan para planear features **del código** de un
  proyecto que tiene su propio MCP (es código en repo, sí transfiere).
- ❌ NO podés usar Ultraplan para planear flows que **usen** ese MCP
  como dependencia (no está conectado en la cloud session).

### §8.2 File sync es opaco

La docs no documenta exactamente qué del repo ve la cloud session.
Regla segura: **commit + push antes de lanzar**. Si no está
pusheado, asumí que no se ve.

### §8.3 Mata Remote Control

Si tenés Claude Code Remote Control activo (corriendo sesión local
desde claude.ai/code), Ultraplan lo desconecta porque ambos ocupan
la misma interfaz claude.ai/code. Solo uno puede estar conectado a
la vez. Guardá el state de Remote Control antes de lanzar si lo
usás.

### §8.4 Tres engines internos, asignados por A/B

Análisis post-leak (no documentado oficialmente) sugiere que
Ultraplan asigna server-side uno de tres planning engines:

- `simple_plan` — exploración liviana, plan bulleted corto sin
  diagramas. Adecuado pero no es lo que hace que valga la pena
  Ultraplan.
- `visual_plan` — exploración + Mermaid/ASCII diagrams de
  arquitectura, dependency graphs, data flow.
- (Tercero, no confirmado en docs públicos.)

**No hay UI para seleccionar.** Si te toca `simple_plan` y
necesitabas diagramas, pedilos explícitamente en el review (Paso
4) — Claude los puede agregar como revision.

### §8.5 Costo cognitivo del cambio de contexto

Cambiar entre terminal, browser, y de vuelta a terminal tiene
overhead. Para tasks chicas no vale. Reservalo para fases donde el
planning es la parte más cara.

---

## §9 Anti-patterns

### §9.1 Ultraplan para tareas triviales

❌ `/ultraplan corregí el typo en el README`. Overhead 10×. Local
plan o directo edit.

### §9.2 No commitear antes de lanzar

❌ Tener cambios uncommitted que el plan necesita ver. La cloud
session no los va a ver y va a planear contra una versión vieja del
codebase.

### §9.3 Aceptar el primer plan sin review

❌ Click "Approve" en el primer borrador sin leer. El valor de
Ultraplan está en la review. Sin review, es lo mismo que plan-mode
local pero más lento.

### §9.4 No mappear al Phase Journal

❌ Aprobar plan, implementar, y dejar el plan en el browser. Las
decisiones de tradeoff se pierden y el journal queda incompleto. Ver
§7 del playbook.

### §9.5 Usar Ultraplan para flows que dependen del propio MCP

❌ "ultraplan testeá el flujo end-to-end del MCP local del proyecto
desde el cliente". El MCP local no está disponible en la cloud
session. Esto es testing manual local, no Ultraplan.

---

## §10 Troubleshooting

### "Ultraplan needs your input" no se resuelve

Abrí el session link y respondé la pregunta. Si no aparece la
pregunta clara, comentá en el browser: "no entiendo qué necesitás
clarificar — proseguí con el plan asumiendo X" (donde X es tu
default razonable).

### El plan se ve genérico / no usa la arquitectura del repo

Tu prompt fue muy abstracto. Cancelar (`/tasks` → Stop ultraplan),
reescribir prompt mencionando paths específicos del repo
(`docs/PRD.md`, `src/lib/audit.ts`, `migrations/0001_*.sql`) y
relanzar.

### Cloud session timeout antes de los 30 min

Ocurre con prompts muy ambiguos. Mensaje "session archived" sin
plan. Cancelar y relanzar con prompt más específico (ver Paso 2
§ "Cómo escribir el prompt").

### Teleport no aparece como opción

Solo aparece si la session fue lanzada desde el CLI **y** el terminal
sigue polling. Si cerraste el terminal o el polling se murió, solo
queda Opción A (execute on the web).

---

## §11 Cómo Claude Code lo encuentra (ingest)

Tres niveles de integración, podés elegir uno o varios:

### Nivel A — Referencia desde project memory (CLAUDE.md)

Agregar a tu `CLAUDE.md` project-level (root o sub-proyecto) en la
sección de playbooks disponibles:

```markdown
- **`<ruta-relativa>/ultraplan-cloud-planning.md`** — Cuándo y cómo
  usar Ultraplan (cloud-based planning) para fases complejas del
  PRD del proyecto. Aplica a fases con complexity ≥3h, refactors
  cross-file, diseño de sub-proyectos nuevos. Incluye ejemplo
  pedagógico end-to-end.
```

**Pro:** aparece en el contexto cada vez que Claude Code abre el
proyecto.
**Con:** gasta tokens del context window al inicio de cada sesión.

### Nivel B — SKILL.md para auto-invocación

Crear `~/.claude/skills/ultraplan-<proyecto>.md` (global) o
`.claude/skills/ultraplan-<proyecto>.md` (project-scoped):

```markdown
---
---

# Ultraplan — <Tu Proyecto>

Cuando se invoca, seguir el playbook completo en
`<ruta>/ultraplan-cloud-planning.md`. Resumen:

1. Verificar pre-flight (git status limpio, push al día).
2. Construir prompt con: ref al PRD, stack del proyecto,
   principios de diseño no-negociables, lo que se pide producir.
3. Ejecutar `/ultraplan <prompt>`.
4. Polling status, hand-off al usuario para review en browser.
5. Cuando vuelve via teleport, mappear output al Phase Journal del
   proyecto (§7 del playbook).

NO ejecutar `/ultraplan` directamente sin construir prompt completo.
NO ejecutar si el repo tiene cambios sin pushear.
```

**Pro:** Claude Code la invoca automáticamente cuando detecta
contexto matcheante.
**Con:** tenés que crear el directorio + archivo manualmente.

### Nivel C — Slash command custom (opcional)

Si querés un atajo para el prompt de pre-flight + setup:

```sh
mkdir -p .claude/commands
cat > .claude/commands/plan-fase.md <<'EOF'
---
description: Pre-flight + lanzar Ultraplan para una fase del PRD del proyecto actual
---

Verificá que estamos dentro de un proyecto con PRD (cwd contiene
`docs/PRD.md` o equivalente). Confirmá que git status está limpio y
todo pusheado. Después leé el PRD del proyecto e identificá la fase
$ARGUMENTS. Construí un prompt para `/ultraplan` siguiendo el patrón
de `<ruta>/ultraplan-cloud-planning.md` §"Cómo escribir el prompt".
Mostrame el prompt antes de ejecutar para que lo apruebe.
EOF
```

Uso: `/plan-fase 1` (planea Fase 1 del PRD del proyecto actual).

**Recomendación combinada:** A + B. Nivel A garantiza que el playbook
esté siempre referenciable; Nivel B garantiza que Claude Code sepa
cuándo invocarlo sin que se lo pidás explícitamente. Nivel C es
azúcar sintáctico, opcional.

---

## §12 Referencias

- [Plan in the cloud with ultraplan — Claude Code Docs](https://code.claude.com/docs/en/ultraplan)
  (autoritativo, verificado 2026-04-26)
- [Claude Ultraplan: Planning in the Cloud, Executing Wherever — Steve Kinney](https://stevekinney.com/writing/claude-ultraplan)
  (post de práctica, abril 2026)
- [Claude Code Ultraplan: What the Docs Don't Tell You — AI-Native](https://ainative.to/p/claude-code-ultraplan)
  (sharp edges, análisis de los 3 engines internos)
- [Claude Code Skills docs](https://code.claude.com/docs/en/skills)
  (cómo se cargan skills + frontmatter spec)

Cross-refs internos a este wiki:

- [browser-automation-playwright.md](browser-automation-playwright.md)
  — workflows complementarios para testing web durante implementación.
- [superpowers-evaluation.md](superpowers-evaluation.md)
  — evaluación de plugin que automatiza disciplinas similares (TDD,
  worktrees, plans).

---

## §13 Cambios a este playbook

Este playbook evoluciona con la práctica. Cuando se cambia:

1. PR al repo donde vive este playbook.
2. Bump de `updated:` en frontmatter.
3. Si el cambio invalida prácticas previas, dejar nota en una
   sección "Migration notes".
4. Re-verificar §8 "Sharp edges" cada 2-3 meses contra docs oficiales
   de Anthropic — Ultraplan está en research preview y comportamiento
   puede cambiar.

### Changelog

- **2026-04-27 — v0.2.** Generalizado de versión kortex-lab-specific
  a wiki cross-project. Reemplazado §6 ejemplo end-to-end (era de un
  artifact MCP interno) por §6 ejemplo pedagógico "Repo Stats
  Exporter" — proyecto descartable diseñado específicamente para
  aprender el workflow.
- **2026-04-26 — v0.1 inicial.** Versión inicial del playbook con
  ejemplo end-to-end aplicado a un caso interno.

## Backlinks
<!-- backrefs:start -->
- [browser-automation-playwright](browser-automation-playwright.md)
- [superpowers-evaluation](superpowers-evaluation.md)
<!-- backrefs:end -->

