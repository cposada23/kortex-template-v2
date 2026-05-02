---
title: "Husky — Gestor de Git Hooks"
type: reference
layer: synthesis
language: es
tags: [husky, git, hooks, infraestructura, framework]
updated: 2026-05-02
distillation_level: 3
confidence: high
---

# Husky — Gestor de Git Hooks

Husky es la herramienta de terceros que Kortex usa para versionar y
distribuir git hooks junto con el repo. Es la razón por la que los
validadores (frontmatter, links, secrets, backrefs) y el regenerador del
caché de status corren automáticamente en cada commit, sin que cada
usuario tenga que instalar o configurar nada a mano.

## Qué es Husky

Git ya soporta **hooks**: scripts que se disparan automáticamente en
puntos clave del workflow (antes de un commit, después de un commit,
antes de un push, etc.). La carpeta nativa donde viven es `.git/hooks/`
— pero git deliberadamente **no versiona** esa carpeta. Es un detalle
local de cada clon.

Husky resuelve el problema de "los hooks no viajan con el repo" así:

1. Guarda los scripts en `.husky/` — una carpeta normal, versionada
   como cualquier otro directorio.
2. Cuando alguien corre `pnpm install`, Husky registra `.husky/` como
   el directorio activo de hooks (vía `git config core.hooksPath`,
   manejado automáticamente por su script `prepare`).
3. Desde ese momento, cada operación de git que dispararía un hook
   ejecuta el script correspondiente en `.husky/`.

Resultado neto: los hooks pasan a ser propiedad **del repositorio**,
no de la máquina de cada developer.

## Por qué Kortex lo usa

Hay tres guardrails que Kortex necesita y que se degradarían sin Husky:

- **Validación de frontmatter.** Sin un pre-commit hook, YAML mal
  formado entra al índice. El schema en
  [schema/frontmatter.json](../../schema/frontmatter.json) sólo es
  exigible si cada commit pasa por el validador.
- **Integridad de links.** Los links internos de markdown se rompen
  silenciosamente cuando los archivos se mueven. La
  [regla de links](../../.claude/rules/links.md) exige que cada
  mención en prosa de un archivo sea un link funcional — sólo un
  pre-commit hook atrapa las roturas antes de que aterricen.
- **Frescura del caché de status.** El post-commit hook regenera
  `.cache/status.json` para que `pnpm kortex bridge` tenga un snapshot
  actualizado en cada arranque de sesión. Sin él, bridge-in cae en
  modo degradado y pinta un WARN.

Estos son justo el tipo de invariantes de corrección que se erosionan
en cuanto dependen de la disciplina manual de cada usuario. Husky
elimina esa dependencia.

## Lo que Kortex envía en `.husky/`

| Hook | Cuándo dispara | Qué hace |
|---|---|---|
| `pre-commit` | Antes de que aterrice cada commit | Corre validate-secrets, validate-frontmatter, validate-links, validate-symlink, y luego update-backrefs (suave). El primer fallo duro aborta el commit. |
| `pre-push` | Antes de cada push a un remoto | Hoy es un placeholder no-op. Espacio reservado para smoke tests futuros. |
| `post-commit` | Después de que cada commit se completa | Regenera `.cache/status.json` vía `pnpm kortex regen-status --quiet`. Si falla, se ignora (`|| true`) — un caché desactualizado es recuperable; un hook ruidoso después de cada commit no lo es. |

Los cuerpos de los hooks son envoltorios delgados de shell
(`#!/usr/bin/env sh`) que invocan scripts de Node bajo
`scripts/hooks/` o `scripts/commands/`. La capa de shell es plomería;
toda la lógica vive en Node para que sea testeable y multiplataforma.

## Comportamiento multiplataforma

Husky funciona en Linux, macOS y Windows. La ruta de Windows requiere
un prerequisito que es estándar entre developers de Windows:

- **Linux / macOS:** `sh` y `node` están instalados por defecto. Los
  hooks corren nativamente.
- **Windows + Git for Windows:** El instalador de
  [Git for Windows](https://git-scm.com/download/win) trae bundled un
  entorno bash (Git Bash / MSYS2). Git mismo usa ese bash para
  ejecutar los hooks sin importar desde qué terminal (cmd, PowerShell,
  Git Bash, IDE) se haya disparado el comando git. Los hooks corren
  normal.
- **Windows + WSL:** Comportamiento Linux. Los hooks corren normal.
- **Windows sin Git for Windows ni WSL:** Caso raro. Los hooks no se
  disparan, pero los commits siguen funcionando — Kortex degrada a
  "sin validación automática, sin regen automático del caché". No se
  rompe nada; el usuario sólo pierde la red de seguridad.

El manejo de paths dentro de los scripts usa las APIs `path.*` de Node
(`path.join`, `path.dirname`, etc.), que eligen el separador correcto
por SO. No hay separadores `/` o `\\` hardcoded en el código de hooks
de Kortex.

## Cómo saltarse un hook (cuando de verdad querés)

Dos escapes intencionales, raramente usados:

```bash
# Saltarse TODOS los hooks de pre-commit y pre-push para un commit:
git commit --no-verify -m "<mensaje>"

# Deshabilitar Husky completo para la sesión actual del shell:
HUSKY=0 git commit -m "<mensaje>"
```

Usalos sólo para overrides de emergencia. Los validadores existen
porque los modos de falla que atrapan son silenciosos y compounden —
saltárselos casualmente derrota el propósito de tenerlos versionados.
Si te encontrás queriendo saltearte un hook en cada commit, arreglá el
validador en lugar de evadirlo.

## Instalación fresca en un clon nuevo

El script `prepare` en `package.json` corre `husky` cuando hacés
`pnpm install`, lo que setea `core.hooksPath` a `.husky/`. Desde un
clon limpio:

```bash
git clone <repo>
cd <repo>
pnpm install   # esto dispara el setup de husky automáticamente
```

No hay paso manual de instalación de hooks. Si por alguna razón los
hooks no se disparan después del install, corré `pnpm prepare` para
re-disparar el setup, o verificá que `git config core.hooksPath`
devuelva `.husky`.

## Referencias

- Sitio oficial de Husky: <https://typicode.github.io/husky/>
- Git hooks (doc canónico): <https://git-scm.com/docs/githooks>
- Hooks de Kortex: .husky/
- Validadores pre-commit: scripts/hooks/
- Regenerador del caché de status: [scripts/commands/regen-status.mjs](../../scripts/commands/regen-status.mjs)

## Backlinks
<!-- backrefs:start -->
- [README](../../README.md)
<!-- backrefs:end -->

