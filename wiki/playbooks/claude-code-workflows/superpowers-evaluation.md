---
title: Evaluación y adopción de Superpowers (plugin Claude Code)
type: playbook
layer: synthesis
language: es
tags:
  - playbook
  - claude-code
  - superpowers
  - agentic-skills
  - evaluation
updated: 2026-04-27T00:00:00.000Z
status: active
related_paths:
  - ultraplan-cloud-planning.md
  - browser-automation-playwright.md
confidence: medium
source_count: 4
last_verified: 2026-04-26T00:00:00.000Z
mirror: both
---

# Evaluación y adopción de Superpowers (plugin Claude Code)

> **Scope:** este playbook guía la **evaluación** y **decisión de
> adopción** del plugin
> [Superpowers](https://github.com/obra/superpowers) de Jesse
> Vincent / Prime Radiant para Claude Code, dentro de cualquier
> proyecto que ya tenga sus propias reglas operativas (CLAUDE.md,
> hooks, write-authority rules, etc.). Cubre desde pre-flight
> research hasta verdict documentado y propagación (o rechazo
> informado).
>
> **No** cubre: tutorial básico de Claude Code plugins (asume que
> ya sabés usar `/plugin`), ni la implementación detallada de
> skills custom (ver §Decision Tree, rama A.5 si terminás
> escribiendo skills propios).
>
> **Tiempo total estimado:** ~3h activos (1 tarde concentrada) o 2
> noches de 1.5h. Dividido en 5 checkpoints con gates explícitos.
>
> **Cross-project:** este playbook está escrito sin referencia a
> estructura interna de un proyecto concreto. El ejemplo pedagógico
> §11 es un proyecto descartable que cualquier dev con cuenta
> GitHub puede construir para evaluar.

---

## §1 Por qué este playbook existe

Superpowers es un workflow agéntico open-source (MIT) que **inyecta
una metodología estructurada de desarrollo de software en Claude
Code** vía skills auto-activantes.

Conceptualmente tiene **alto solapamiento con disciplinas que
muchos proyectos serios ya escriben a mano**: worktrees, phase
journals, definition-of-done por fase, regla de web-search
obligatorio antes de afirmar facts cambiantes, TDD enforcement.

| Disciplina típica de proyecto | Skill Superpowers equivalente |
|---|---|
| Worktrees para sub-agentes paralelos | `using-git-worktrees` |
| Phase journals + tasks numeradas (T0.1, T1.1, …) | `writing-plans` + `executing-plans` |
| Definition-of-done por fase con checkboxes | `verification-before-completion` |
| Regla "web search obligatorio antes de afirmar features de productos AI" | `verification-before-completion` (parcial) |
| TDD aplicado en fases de implementación | `test-driven-development` (con enforcement duro) |

La pregunta no es si Superpowers tiene valor — el solapamiento
demuestra que la disciplina que enforce ya la consideramos correcta.
La pregunta es **si lo adoptamos como reemplazo, como complemento, o
si solo lo usamos de inspiración para fortalecer nuestros playbooks
propios**. Este playbook produce esa decisión documentada.

---

## §2 Tensiones identificadas (a confirmar/refutar en CP4)

Tres puntos donde Superpowers puede no calzar trivialmente con
proyectos que ya tienen sus propias reglas y necesitan decisión
consciente:

### §2.1 Scope de instalación (global vs project-level)

Superpowers se instala global por default — toda sesión de Claude
Code lo ve. Si el proyecto donde lo evaluás tiene `.claude/rules/`
propias (write-authority, verification rules, etc.), esos defaults
del plugin pueden colisionar. **Default recomendado de este
playbook: instalación project-level en sandbox aislado primero**,
propagación global solamente post-verdict positivo.

### §2.2 Worktrees (skill propio vs convención propia)

`using-git-worktrees` de Superpowers gestiona sus worktrees
internamente. Si tu proyecto ya tiene una convención de worktrees
(ej. ubicación específica de `.worktrees/`, naming
`<artifact>-feature-<slug>`), en CP4 hay que verificar si el skill
respeta convenciones existentes o impone las suyas. Si las impone:
decidir cuál gana y documentarlo.

### §2.3 Patrón de "infraestructura del entorno" vs "artifact del
proyecto"

Si tu proyecto distingue artifacts (deliverables versionables) de
infraestructura del entorno de desarrollo, **Superpowers cae en la
segunda categoría** — vive en `~/.claude/plugins/` o equivalente, no
es un artifact. Por lo tanto:

- **NO** entra en tu registro de artifacts (si tenés uno).
- **SÍ** amerita un playbook propio (este, una vez post-verdict).
- **SÍ** amerita override en `CLAUDE.md` raíz del proyecto si las
  reglas existentes deben prevalecer sobre defaults de skills.

---

## §3 Pre-requisitos

Antes de arrancar el CP1, verificá que tenés:

- [ ] Claude Code instalado y funcionando (cualquier interfaz: CLI,
      VS Code extension, o Desktop tab).
- [ ] Suscripción Claude Pro o Max activa (no obligatorio pero
      recomendable — Superpowers gasta más tokens en
      brainstorming/planning).
- [ ] El proyecto donde vas a evaluar en estado limpio: `git status`
      sin uncommitted changes (vamos a tocar `.gitignore` raíz en
      CP2).
- [ ] Acceso al repo de Superpowers en GitHub para consulta:
      <https://github.com/obra/superpowers>.
- [ ] 3h consecutivas o 2 ventanas de 1.5h reservadas. **No partir
      en sesiones de 30 min** — perdés contexto entre checkpoints.

---

## §4 Los 5 checkpoints

Cada checkpoint tiene un **gate explícito**: una condición binaria
que debe cumplirse para avanzar al siguiente. Si el gate falla,
**parar**, documentar por qué, y decidir si ajustás el plan o
abortás la evaluación.

### Checkpoint 1 — Pre-flight + research (30 min)

**Objetivo:** entender qué hace cada skill antes de instalar nada.
Sin esto, CP3 va a parecer magia y no vamos a poder evaluar
fricción real en CP4.

**Tasks:**

- [ ] **T1.1** — Crear scratch file en una ubicación clara del
      proyecto (sugerencia:
      `<proyecto>/inbox/superpowers-eval-YYYY-MM-DD.md`,
      reemplazando `YYYY-MM-DD` por la fecha real). Ahí van todas
      las notas de la evaluación.
- [ ] **T1.2** — Releer el README oficial del repo:
      <https://github.com/obra/superpowers>. Anotar **versión
      actual**, contar de stars, y comparar con la última
      verificada en este playbook (ver `last_verified` del
      frontmatter).
- [ ] **T1.3** — Leer `skills/using-superpowers/SKILL.md` directo
      en el repo. Es el dispatcher master. Entender cómo se gatillan
      los otros skills.
- [ ] **T1.4** — Leer `skills/writing-plans/SKILL.md` y
      `skills/test-driven-development/SKILL.md`. Son los dos más
      invasivos — los que más colisionan con workflow propio del
      proyecto.
- [ ] **T1.5** — Skim de `CHANGELOG.md` y `RELEASE-NOTES.md` —
      detectar cambios breaking recientes.
- [ ] **T1.6** — Skim del top 10 de issues abiertos por reactions:
      <https://github.com/obra/superpowers/issues?q=is%3Aissue+is%3Aopen+sort%3Areactions-%2B1-desc>.
      Te dice qué se rompe en producción real.
- [ ] **T1.7** — En el scratch file, escribir 3 bullets por skill
      leído: qué hace, qué gatilla la transición al siguiente, qué
      output produce.

**Gate (G1):** podés explicar en voz alta, sin mirar el README, qué
hace cada skill del workflow básico (brainstorming →
using-git-worktrees → writing-plans → executing-plans → TDD →
code-review → finishing). Si no, leer más antes de instalar.

---

### Checkpoint 2 — Instalación en sandbox aislado (15 min)

**Objetivo:** instalar Superpowers en un repo descartable. **No
instalar en el repo principal del proyecto todavía.**

**Tasks:**

- [ ] **T2.1** — Crear sandbox como repo separado:

      ```bash
      mkdir -p <ruta-de-sandbox>/superpowers-sandbox
      cd <ruta-de-sandbox>/superpowers-sandbox
      git init
      cat > README.md <<'EOF'
      # superpowers-sandbox

      Throwaway sandbox para evaluar Superpowers plugin.
      Si ves este repo y no estás en evaluación activa, borralo.
      EOF
      git add . && git commit -m "chore: scaffold sandbox"
      ```

      Donde `<ruta-de-sandbox>` puede ser una carpeta personal de
      proyectos (ej. `~/projects/`) o, si querés mantener todo
      junto al proyecto donde vas a evaluar, una ubicación
      gitignored dentro de él.

- [ ] **T2.2** — Si el sandbox está dentro del proyecto principal:
      gitignorearlo. Agregar a `.gitignore` raíz del proyecto:

      ```
      <ruta-relativa-al-sandbox>/
      ```

- [ ] **T2.3** — Verificar gitignore: `git status` desde raíz del
      proyecto **no debe listar** archivos del sandbox.
- [ ] **T2.4** — (Opcional, si tu proyecto lleva registry de
      sandboxes / artifacts) registrar en ese registry con
      `status: evaluating` y nota explícita "throwaway, borrar al
      cerrar evaluación". Esto NO viola la regla "Superpowers no es
      artifact" — el sandbox SÍ es artifact descartable, Superpowers
      es la dependencia que vamos a probar adentro.
- [ ] **T2.5** — Abrir Claude Code dentro del sandbox y ejecutar:

      ```
      /plugin marketplace add obra/superpowers-marketplace
      /plugin install superpowers@superpowers-marketplace
      ```

      Alternativa (marketplace oficial Anthropic):

      ```
      /plugin install superpowers@claude-plugins-official
      ```

      Recomendado el del autor (`obra/superpowers-marketplace`)
      durante evaluación — latest sin esperar al sync del oficial.

- [ ] **T2.6** — Confirmar instalación: `/plugins` debe listar
      superpowers como activo. Reiniciar Claude Code (cerrar y
      reabrir sesión).

**Gate (G2):** `/plugins` muestra superpowers activo + sesión
reiniciada limpia + `git status` desde el repo principal sigue
limpio (sandbox bien gitignored si aplica).

---

### Checkpoint 3 — Smoke test (30 min)

**Objetivo:** confirmar que el dispatcher gatilla el workflow básico
sin override manual.

**Tasks:**

- [ ] **T3.1** — En sesión nueva de Claude Code dentro del sandbox,
      pedir:

      > "Quiero construir un script Python que liste las branches
      > stale de un repo GitHub usando la API. Empezá."

      (Este es el ejemplo pedagógico canónico — ver §11 para PRD
      detallado del proyecto que vas a construir.)

- [ ] **T3.2** — Observar y registrar en scratch file qué pasa en
      orden. **Lo esperado:**

      1. Claude **NO** empieza a codear.
      2. Activa `brainstorming` — preguntas: qué cuenta como stale,
         qué auth, output format, etc.
      3. Tras aprobar diseño: activa `using-git-worktrees` (o
         pregunta si saltarlo en sandbox).
      4. Activa `writing-plans` — muestra plan en tasks de 2–5 min
         con paths exactos.
      5. Tras aprobar plan: ejecuta. Si arranca implementación,
         escribe test antes que código (TDD enforcement).

- [ ] **T3.3** — Cronometrar cada fase. Anotar tokens si Claude
      Code lo expone (útil para evaluar costo del overhead).
- [ ] **T3.4** — Si **algún paso no ocurre** o el orden cambia
      significativamente: documentar en scratch file qué pasó. No
      abortar todavía — puede ser version drift o feature nuevo.
      Reportar al menos 2 anomalías → considerar abortar evaluación
      (probable instalación incompleta o cambio breaking).

**Gate (G3):** los 5 pasos ocurren en orden razonable + tenés
timing real documentado de cada fase.

---

### Checkpoint 4 — Stress test contra workflow propio (60 min)

**Objetivo:** detectar concretamente qué tensiones de §2 son reales
y cuáles son hipótesis sin sustento.

**Tasks:**

- [ ] **T4.1 — Test A: colisión con reglas propias del proyecto.**
      En el sandbox (que no tiene tus `.claude/rules/`), pedir:

      > "Implementá una tool MCP en TypeScript que valide schemas
      > Zod. Cero dependencias salvo Zod. Empezá."

      Observar:

      - ¿Pide hacer web search antes de afirmar features de
        librerías? **Probable que no** — no conoce tu Rule 1.
        Anotar.
      - ¿Respeta zero-dependency más allá de Zod? **Probable que
        sí** si lo dijiste explícito; **probable que no** si lo
        dejaste implícito. Anotar.
      - ¿Su `using-git-worktrees` arma worktree donde él decida?
        Anotar el path real.

- [ ] **T4.2 — Test B: colisión con TDD enforcement.** Pedir un
      cambio chico que NO amerita TDD:

      > "Agregá un README con instrucciones de install."

      Observar:

      - ¿El dispatcher es smart y skipea TDD?
      - ¿O lo fuerza igual y se vuelve fricción innecesaria?
      - ¿Cómo lo bypaseás si querés? (algunos plugins respetan
        prefijos como "skip clarify" o "quick task").

- [ ] **T4.3 — Test C: simular flow real de tu proyecto.** Pedir
      un task que se parezca a una fase real de tu PRD habitual:

      > "Inicializá un MCP server mínimo en Cloudflare Workers con
      > una tool `ping`. Stack: TypeScript, wrangler, Vitest.
      > Aplicá TDD desde el primer commit."

      Observar:

      - ¿El plan que genera se parece al que vos escribirías
        manualmente para una fase típica?
      - ¿Mejor, peor, o equivalente?
      - ¿Qué decisiones toma diferente a las del PRD que escribirías
        a mano? (esto te da insight de qué patrones tuyos están
        bien y qué están mal calibrados).

- [ ] **T4.4** — Documentar en scratch file 3 cosas medibles:

      a. **Fricción agregada vs valor entregado** — ratio
         cualitativo, pero específico (ej: "30 min de brainstorming
         evitó 2h de refactor previsible").
      b. **Reglas propias que skills sobreescriben** — lista
         concreta con nombre del skill + nombre de la regla.
      c. **Necesidad de CLAUDE.md propio del proyecto** que
         extienda u override Superpowers — sí/no + qué reglas
         mínimas debería tener.

**Gate (G4):** scratch file tiene los 3 puntos medibles documentados
con evidencia (no opinión vibey).

---

### Checkpoint 5 — Verdict + propagación (45 min)

**Objetivo:** decisión documentada + acciones de propagación o
cleanup según el verdict.

**Tasks:**

- [ ] **T5.1** — Escribir verdict en scratch file con uno de tres
      labels:

      - `ADOPT_AS_IS`
      - `ADOPT_WITH_OVERRIDES`
      - `REJECT_HARVEST_IDEAS`

- [ ] **T5.2** — Ejecutar la rama del Decision Tree (§5) que
      corresponda al verdict.
- [ ] **T5.3** — Hacer commit en el repo principal con el verdict
      + todos los archivos creados/modificados (playbook
      personalizado, CLAUDE.md updates, etc.). Mensaje sugerido:
      `docs: superpowers eval verdict — <LABEL>`.
- [ ] **T5.4** — Cleanup del sandbox según rama (ver §6).

**Gate (G5):** verdict commiteado + sandbox cerrado/promovido +
playbook(s) resultante(s) en su lugar definitivo.

---

## §5 Decision Tree post-CP5

Las tres ramas tienen estructura idéntica: **doc + integration +
follow-ups**. Solo cambia el contenido.

### Rama A — `ADOPT_AS_IS`

> Verdict: Superpowers funciona out-of-the-box, sus defaults son
> compatibles con (o superiores a) las disciplinas propias del
> proyecto. No requiere overrides significativos.

**Probabilidad estimada:** baja (~15%). Las disciplinas propias de
proyectos serios tienen opiniones específicas que probablemente
colisionen en algún punto. Si esta es la rama real, sospechá doble
— re-leer findings de CP4.

**Acciones:**

- **A.1** Promover este playbook (renombrar el archivo de scratch
  de evaluación a algo como `superpowers-workflow.md` en tu
  carpeta de playbooks/) y actualizar §1–4 con findings reales.
  Las §5 y §6 quedan como apéndice histórico.
- **A.2** Instalar Superpowers global (no project-level):

      ```
      claude plugin install superpowers --global
      ```

      (verificar comando exacto en docs vigentes — puede haber
      cambiado).
- **A.3** Agregar entry en `CLAUDE.md` raíz del proyecto declarando
  Superpowers como dependencia de hecho del workflow.
- **A.4** Considerar si el playbook personalizado puede compartirse
  (mirror a un template público, repo de documentación de equipo,
  etc.) bajo el mismo criterio de generalidad que cualquier
  playbook reutilizable.
- **A.5** Follow-up parking lot: usar la skill `writing-skills`
  para portar las reglas propias del proyecto como skills nativos
  del framework Superpowers. Esto da máximo leverage pero es
  proyecto separado — registrarlo en tu backlog/registry como
  trabajo futuro.

---

### Rama B — `ADOPT_WITH_OVERRIDES` (probable outcome)

> Verdict: Superpowers agrega valor real pero algunos defaults
> chocan con reglas propias del proyecto. Adoptar con override
> explícito en el CLAUDE.md / hooks.

**Probabilidad estimada:** alta (~65%). Es el outcome esperado dado
el solapamiento parcial detectado en §1.

**Acciones:**

- **B.1** Promover este playbook y expandir con sección "Overrides
  propios" que liste, regla por regla, cuál de las dos gana y por
  qué.
- **B.2** Instalación project-level por ahora (no global). Repos
  que quieran usar Superpowers lo declaran explícito.
- **B.3** Crear/extender `CLAUDE.md` raíz del proyecto con bloque
  como:

      ```markdown
      ## Reglas propias sobre Superpowers (override)

      Cuando Superpowers esté instalado en este repo, las
      siguientes reglas propias prevalecen sobre defaults del
      plugin:

      - <Regla 1: ej. web search obligatorio antes de afirmar
        features de productos AI> > skill defaults.
      - <Regla 2: ej. único escritor estructural del repo> >
        cualquier skill que sugiera commits desde sub-agentes
        paralelos sin review.
      - <Regla 3: ej. zero-dependency build priority> > defaults
        de TDD que sugieran agregar testing libs pesadas.
      - <Regla 4: ej. patrón "artifact = carpeta + git repo
        propio + entry en registry"> > workflows de Superpowers
        que asuman monorepo.
      ```

      Reemplazá `<Regla N: ...>` por las reglas concretas de tu
      proyecto que prevalezcan.

- **B.4** Para CADA override: verificar que el skill de Superpowers
  efectivamente respeta el override (no asumirlo). Si no respeta,
  documentarlo como "limitación conocida" y considerar si el
  override necesita enforcement adicional vía hook.
- **B.5** Mismo follow-up que A.5 (writing-skills propio) —
  relevancia mayor en esta rama porque te ahorra escribir
  overrides ad-hoc.

---

### Rama C — `REJECT_HARVEST_IDEAS`

> Verdict: Superpowers no calza estructuralmente con el proyecto
> pero los patterns que enforce son valiosos. No instalar; portar
> las ideas a playbooks/rules propias.

**Probabilidad estimada:** media (~20%). Posible si la fricción
detectada en CP4 es excesiva o si los defaults son demasiado
opinionados para encajar incluso con overrides.

**Acciones:**

- **C.1** Renombrar este playbook (en tu copia de evaluación) a
  algo como `superpowers-rejected-with-rationale.md` y dejar §5
  rama C como la parte canónica.
- **C.2** Para CADA skill de Superpowers que probaste, decidir:
  "vale la pena portar como playbook/rule propia" sí/no + por qué.
  Tabla recomendada:

      | Skill SP | Vale portar | Forma | Owner |
      |---|---|---|---|
      | brainstorming | sí | rule en `.claude/rules/brainstorm-before-code.md` | esta semana |
      | writing-plans | parcial | extender PRD template existente | next sprint |
      | TDD enforcement | no | ya cubierto en PRDs por fase | — |
      | … | | | |

- **C.3** Para cada "sí" o "parcial": crear ticket / inbox entry
  para implementarlo. No mezclar con este playbook.
- **C.4** Sandbox: borrar (ver §6 cleanup rama C).
- **C.5** Si tu proyecto lleva registry de sandboxes, marcar el
  sandbox como `status: archived` (o removerlo si fue throwaway
  puro) y dejar link a este playbook como justificación.

---

## §6 Cleanup del sandbox

Según rama elegida en CP5:

### Cleanup rama A (`ADOPT_AS_IS`)

- Sandbox cumplió su propósito y no es base de nada productivo.
  Borrar:

      ```bash
      rm -rf <ruta-al-sandbox>/superpowers-sandbox
      ```

- Quitar entry de `.gitignore` raíz si aplicaba (ya no es
  necesario).
- Quitar entry de tu registry de artifacts/sandboxes si aplicaba.
- Commit: `chore: remove superpowers-sandbox post-eval`.

### Cleanup rama B (`ADOPT_WITH_OVERRIDES`)

- Mismo cleanup que rama A — el sandbox era throwaway.
- **Pero antes de borrar:** capturar 2-3 ejemplos concretos del
  workflow Superpowers (transcripts, plans generados) en tu
  playbook personalizado como evidencia anchor para futuros
  usuarios.

### Cleanup rama C (`REJECT_HARVEST_IDEAS`)

- Borrar plugin del entorno Claude Code (project-level, no afecta
  global):

      ```
      /plugin uninstall superpowers
      ```

- Borrar sandbox + cleanup `.gitignore` + registry, igual que A.
- Conservar el scratch file de CP4 con findings — es input para
  los tickets de C.3.

---

## §7 Cuándo NO usar este playbook

- **Si Superpowers cambia mayor versión** (ej: v6.x.x). Re-evaluar
  desde CP1 — los gates pueden estar mal calibrados para una
  versión muy diferente.
- **Si ya hay un verdict reciente** documentado (<6 meses) y no
  hubo cambios significativos en tu proyecto tampoco. Revisar el
  verdict existente primero, no re-evaluar from scratch.
- **Si el problema real es otro** (ej: necesitás más velocidad y
  la raíz es procrastinación, no falta de framework). Superpowers
  no resuelve disciplina humana — solo enforce disciplina de
  Claude Code.

---

## §8 Re-verificación pendiente

Estos facts del playbook tienen lifetime de verificación corto.
Re-verificar antes de ejecutar si pasaron >30 días desde
`updated:` del frontmatter:

- Versión actual de Superpowers (ver `last_verified` del frontmatter
  para la última cifra confirmada).
- Comandos exactos de instalación (`/plugin marketplace add` y
  `/plugin install`).
- Lista de skills del workflow básico.
- URLs de marketplaces (oficial Anthropic + obra).
- Existencia y nombre del marketplace oficial
  (`claude-plugins-official`).

Coherente con la disciplina genérica de "features y disponibilidad
de productos AI requieren web search reciente" — practica que
muchos proyectos serios tienen como regla escrita.

---

## §9 Anti-patterns

### §9.1 Saltar CP1 (research) e ir directo a CP2 (instalación)

❌ Instalar el plugin sin entender qué hacen los skills. CP4 va a
parecer mágico y no vas a poder evaluar fricción real. Re-leer §4
gate G1.

### §9.2 Evaluar en el repo principal del proyecto

❌ Instalar Superpowers en el repo principal "para probarlo
rápido". Side effects (worktrees creadas, commits desde
sub-agentes, archivos auto-generados) pueden ensuciar el repo y son
difíciles de revertir. Sandbox aislado siempre.

### §9.3 Decidir el verdict por vibes

❌ Cerrar CP5 con "se sintió bien" o "fue molesto". Sin los 3
puntos medibles del gate G4 (fricción vs valor, reglas
sobreescritas, necesidad de overrides), el verdict no es
defendible 6 meses después cuando releyés.

### §9.4 Adoptar AS_IS sin verificar overrides necesarios

❌ Click "instalar global" en CP5 rama A sin haber chequeado en
CP4 si tus reglas propias se respetan. Probable rama real era B
con overrides; saltar a A te garantiza descubrir las colisiones en
producción.

### §9.5 Rechazar sin harvest

❌ Cerrar CP5 con `REJECT` y desinstalar sin extraer las ideas
buenas. Las disciplinas que el plugin enforce son valiosas
independientemente de si lo adoptás como plugin. Hacer el ejercicio
de §C.2 antes de cerrar.

---

## §10 Cómo Claude Code lo encuentra (post-verdict)

Si el verdict es A o B (adoptado en alguna forma), tres niveles de
integración:

### Nivel A — Referencia desde project memory (CLAUDE.md)

Agregar al `CLAUDE.md` raíz del proyecto (en la sección de
playbooks o herramientas disponibles):

```markdown
- **Superpowers** — plugin de Claude Code adoptado <fecha>.
  Verdict: <ADOPT_AS_IS | ADOPT_WITH_OVERRIDES>. Reglas que
  prevalecen sobre defaults del plugin: ver `<ruta-al-playbook>`
  §"Overrides propios".
```

### Nivel B — SKILL.md custom (Rama B con overrides)

Si el verdict fue B, escribir un SKILL.md propio que documente
**cuándo el override propio gana** sobre el default del plugin.
Ejemplo de estructura:

```markdown
---
scope: project:<nombre-proyecto>
---

# Override de Superpowers para <nombre-proyecto>

Cuando Superpowers `verification-before-completion` se active en
este repo, AGREGAR el siguiente check antes del que el skill
nativo hace:

- Si la afirmación es sobre features/precios/UI de productos AI
  (Anthropic, OpenAI, etc.) → web search obligatorio con date
  anchor de los últimos 30 días, citation visible.

Cuando Superpowers `using-git-worktrees` proponga ubicación de
worktree, FORZAR la ubicación a `<convención-del-proyecto>/`
si el proyecto tiene esa convención.
```

### Nivel C — Hooks de override (enforcement duro)

Si el override es crítico y no podés confiar en el skill, escribir
un hook en `.claude/hooks/` que enforce la regla independientemente
de qué haga Superpowers. Ej. pre-commit hook que rechace commits
hechos desde sub-agente paralelo si tu regla es "único escritor
estructural".

---

## §11 Ejemplo pedagógico — "GitHub Stale Branches Lister"

Esta sección es un **mini-PRD** del proyecto descartable que vas a
usar como **smoke test** en CP3 + **stress test** en CP4 del
playbook. El proyecto no tiene valor productivo; su único propósito
es darte un caso real donde ejercitar el workflow Superpowers
end-to-end.

> **Tu rol al hacer este ejercicio:** seguir el step-by-step. NO
> improvisar el flujo. El objetivo NO es construir el script
> perfecto, es **observar cómo Superpowers conduce el proceso** y
> tomar notas para los gates de §4.

### §11.1 Qué vamos a construir

**Nombre:** `stale-branches-lister`
**Ubicación sugerida:** dentro del sandbox de CP2
(`<sandbox>/superpowers-sandbox/stale-branches/` o equivalente).

**Funcionalidad:**

- Script Python que toma un repo GitHub (formato `owner/repo`) como
  argumento.
- Consulta GitHub API para listar todas las branches del repo.
- Para cada branch, obtiene el último commit + su fecha.
- Filtra branches con último commit más viejo que un threshold
  (default: 90 días).
- Imprime tabla a stdout: `branch_name`, `last_commit_date`,
  `last_commit_author`, `days_since`.
- Output opcional a CSV con flag `--output csv-path`.

**Out of scope:**

- No borra branches automáticamente (solo lista — destructive
  actions están fuera del scope pedagógico).
- No soporta GitHub Enterprise.
- No paginación más allá de la primera página de 100 branches
  (suficiente para 99% de repos personales).
- No detección de branches "merged" vs "diverged" — solo edad.

### §11.2 Por qué este proyecto demuestra Superpowers

**Por qué Superpowers SÍ aplica acá:**

1. **Complexity ~2-3h:** suficiente para que el plugin ejerza
   `brainstorming` + `writing-plans` + `executing-plans` en orden,
   sin ser tan trivial que el dispatcher salte fases.
2. **Decisiones reales para `brainstorming`:**
   - ¿Qué cuenta como "stale"? (90d default es arbitrario — debe
     ser configurable).
   - ¿Auth opcional o obligatoria? (sin auth: 60 req/h, suele
     fallar para repos con muchas branches).
   - ¿Output format default — tabla pretty o CSV?
   - ¿Manejo de repos sin commits / branches sin commits?
3. **TDD enforcement aplicable:** parsing de `repos.txt`, formateo
   de tabla, cálculo de `days_since` — funciones puras
   testeables.
4. **`verification-before-completion` aplicable:** el plugin debería
   chequear que la API call que el código hace existe en docs
   actuales de GitHub (no inventar endpoints).

**Por qué NO es overkill:**

- El sandbox es throwaway — si Superpowers genera worktrees, branches,
  commits raros, no importa.
- 2-3h justifica el overhead de aprender el dispatcher, brainstorm,
  plan flow.

### §11.3 Pre-requisitos del ejercicio

- [ ] Sandbox de CP2 creado y Superpowers instalado (G2 verde).
- [ ] Python 3.10+ instalado. Verificar: `python3 --version`.
- [ ] `pip` o `uv` instalado para deps.
- [ ] Cuenta GitHub con un repo que tenga branches viejas (si no
  tenés, podés usar un repo público popular como
  `microsoft/vscode` que tiene cientos de branches).
- [ ] (Opcional) GitHub Personal Access Token con scope `repo:read`
  para usar auth (5000 req/h vs 60 sin auth).

### §11.4 Step-by-step

#### Paso 11.4.1 — Posicionarse en el sandbox

```sh
cd <sandbox>/superpowers-sandbox
mkdir stale-branches
cd stale-branches
git init   # sub-repo dentro del sandbox; opcional pero ordenado
```

#### Paso 11.4.2 — Abrir Claude Code

```sh
claude
```

Verás el prompt de Claude Code en tu terminal. Confirmá que
Superpowers está activo:

```
/plugins
```

Debe listar `superpowers` como activo.

#### Paso 11.4.3 — Pedir el proyecto al dispatcher

Tipear (verbatim, este es el smoke test del CP3 §T3.1):

```
Quiero construir un script Python que liste las branches stale de
un repo GitHub usando la API. Empezá.
```

#### Paso 11.4.4 — Observar el dispatcher (CP3 §T3.2)

Lo que **debería** pasar (en orden):

##### A. `brainstorming` se activa

Claude **NO arranca a codear**. Pregunta cosas como:

- "¿Qué cuenta como stale? ¿Días desde el último commit, o desde
  el último merge?"
- "¿Querés filtrar también por autor del último commit?"
- "¿Auth con PAT o sin auth?"
- "¿Output: stdout pretty, JSON, o CSV?"

**Tu rol:** responder con criterio. Para el ejercicio usá:

- Stale = >90 días desde último commit en la branch.
- No filtrar por autor.
- Sin auth por default; auth opcional via `GITHUB_TOKEN` env var.
- Output stdout pretty con flag `--csv <path>` para alternativa.

**Anotá en el scratch file** (T3.2): cuántas preguntas hizo, si
fueron buenas o redundantes, cuánto tardó esta fase.

##### B. `using-git-worktrees` se activa (o pregunta saltarlo)

Como estamos en sandbox y el proyecto es chico, posiblemente el
dispatcher pregunte si crear worktree o trabajar directo. Decidí
**directo en main** para simplificar (el ejercicio NO es sobre
worktrees, ese es otro skill).

**Anotá:** ¿el dispatcher es smart suficiente para preguntar, o
arranca worktree sin preguntar? Eso te dice si respeta tu
contexto.

##### C. `writing-plans` se activa

Claude muestra un plan estructurado. Esperás algo como:

```
Plan: stale-branches-lister

Fase 1 — Setup (T1.1, T1.2)
  T1.1 — Crear pyproject.toml con deps: requests, python-dateutil
  T1.2 — Crear src/__init__.py + src/main.py vacíos

Fase 2 — Core API client (T2.1 - T2.3)
  T2.1 — Función get_branches(repo) que paginate GitHub API
  T2.2 — Función get_last_commit(repo, branch) ...
  T2.3 — Manejo de auth opcional via GITHUB_TOKEN

Fase 3 — Filtering (T3.1, T3.2)
  T3.1 — Función is_stale(commit_date, threshold_days)
  T3.2 — Función filter_stale_branches

Fase 4 — Output (T4.1 - T4.3)
  T4.1 — Pretty print a stdout (rich? tabulate?)
  T4.2 — CSV writer
  T4.3 — CLI args parsing

Fase 5 — Tests (T5.1 - T5.4)
  T5.1 - T5.4 — TDD para cada función pura
```

(El plan exacto que recibas va a diferir — anotá las diferencias en
scratch file.)

**Aprobá el plan** o pedí ajustes. Para el ejercicio, aprobalo
incluso si no es perfecto — el objetivo es ver el flow completo.

##### D. `executing-plans` + `test-driven-development` se activan

Claude empieza a implementar. Esperado: **escribe el test antes
que el código** (TDD enforcement). Para cada función:

1. Escribe `test_<funcion>` con casos esperados (incluyendo edge
   cases).
2. Corre los tests → fallan (red).
3. Escribe la implementación.
4. Corre los tests → pasan (green).
5. (Opcional) refactor.

**Anotá:** ¿el TDD se respeta? ¿O en algún momento Claude saltó al
código sin test?

##### E. `code-review` + `finishing` (cuando el plan está completo)

Cuando todas las tasks T*.* están done, los skills de cierre se
activan:

- `code-review`: revisión final, busca bugs obvios.
- `finishing`: posiblemente sugiere README, posibles mejoras
  futuras.

#### Paso 11.4.5 — Cronometrar y anotar (CP3 §T3.3)

A lo largo del flow, llevar tiempo:

- Tiempo de `brainstorming`: ___ min.
- Tiempo de `writing-plans`: ___ min.
- Tiempo de `executing-plans + TDD`: ___ min.
- Total activo (sin contar coffee breaks): ___ min.
- Tokens consumidos (si Claude Code los expone): ___.

Anotar en el scratch file de la evaluación.

#### Paso 11.4.6 — Stress test variations (CP4)

Después del smoke test exitoso, repetir con variaciones para CP4:

##### Variation A (T4.1) — Reglas propias del proyecto

En el mismo sandbox, pedir:

> "Implementá una tool MCP en TypeScript que valide schemas Zod.
> Cero dependencias salvo Zod. Empezá."

Observar si:

- Pide web search antes de afirmar features de Zod (típica regla
  Rule 1 de proyectos serios).
- Respeta zero-dependency.
- `using-git-worktrees` arma worktree donde él decida (anotá el
  path real).

##### Variation B (T4.2) — TDD para tarea trivial

Pedir:

> "Agregá un README con instrucciones de install para
> stale-branches-lister."

Observar si:

- El dispatcher es smart y skipea TDD (es solo prosa).
- O lo fuerza igual (fricción innecesaria).

##### Variation C (T4.3) — Flow real complejo

Pedir:

> "Inicializá un MCP server mínimo en Cloudflare Workers con una
> tool `ping`. Stack: TypeScript, wrangler, Vitest. Aplicá TDD
> desde el primer commit."

Observar:

- ¿El plan se parece al que vos escribirías a mano?
- ¿Mejor, peor, equivalente?
- ¿Qué decisiones distintas toma?

#### Paso 11.4.7 — Documentar findings (T4.4)

En el scratch file, escribir 3 puntos medibles:

- a. **Fricción vs valor** — ratio cualitativo con ejemplo concreto.
- b. **Reglas propias sobreescritas** — lista con nombre del skill +
  nombre de la regla.
- c. **¿Necesita override CLAUDE.md?** — sí/no + qué reglas.

Estos son los inputs del Gate G4 (§4 CP4).

### §11.5 Cuándo terminás el ejercicio

El ejercicio se considera **completo** cuando:

- [ ] El smoke test (§11.4.4) corrió end-to-end (con o sin pequeños
      ajustes).
- [ ] Las 3 variations (§11.4.6) corrieron y están documentadas.
- [ ] El scratch file tiene los 3 puntos medibles del §11.4.7.
- [ ] Tenés un sentido **calibrado** de qué hace Superpowers, qué
      bien y qué mal, y dónde colisiona con tus reglas.

**No es necesario que el script `stale-branches-lister` sea
production-ready.** El ejercicio enseña **el workflow Superpowers**,
no a construir un CLI tool perfecto.

### §11.6 Después del ejercicio — verdict

Con los findings de §11.5, escribir el verdict en el scratch file:

- `ADOPT_AS_IS` (probabilidad 15%)
- `ADOPT_WITH_OVERRIDES` (probabilidad 65%)
- `REJECT_HARVEST_IDEAS` (probabilidad 20%)

Y ejecutar la rama correspondiente del Decision Tree (§5).

---

## §12 Referencias

- [Repo oficial Superpowers — obra/superpowers](https://github.com/obra/superpowers)
- [Página marketplace Anthropic](https://claude.com/plugins/superpowers)
- [Release announcement — blog Jesse Vincent](https://blog.fsck.com/2025/10/09/superpowers/)

Cross-refs internos a este wiki:

- [ultraplan-cloud-planning.md](ultraplan-cloud-planning.md) —
  workflow paralelo (cloud planning) que cubre parcialmente lo que
  `writing-plans` de Superpowers hace local.
- [browser-automation-playwright.md](browser-automation-playwright.md)
  — los skills Playwright propios pueden combinarse con Superpowers
  o vivir aparte; este playbook informa la decisión.

---

## §13 Cambios a este playbook

Este playbook evoluciona con la práctica. Cuando se cambia:

1. PR al repo donde vive este playbook.
2. Bump de `updated:` en frontmatter.
3. Si la versión upstream de Superpowers cambia mayor versión
   (ej. v6.x.x), re-evaluar gates desde CP1 — pueden estar mal
   calibrados.
4. Bump de `last_verified:` cada vez que se re-corre la
   evaluación.

### Changelog

- **2026-04-27 — v0.2.** Generalizado de versión kortex-lab-specific
  a wiki cross-project. Reemplazadas todas las referencias a
  estructura interna (PRD `kortex-github-mcp`, `projects/example-project/`,
  `.claude/rules/` propias) por placeholders genéricos. Agregada
  §11 "Ejemplo pedagógico" que detalla el smoke test (CLI tool
  Python para listar branches stale) en formato PRD step-by-step.
- **2026-04-26 — v0.1 inicial.** Versión inicial del playbook con
  estructura 5-checkpoint específica al ecosistema interno.

## Backlinks
<!-- backrefs:start -->
- [browser-automation-playwright](browser-automation-playwright.md)
- [ultraplan-cloud-planning](ultraplan-cloud-planning.md)
<!-- backrefs:end -->

