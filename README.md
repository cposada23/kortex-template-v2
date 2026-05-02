# Kortex

🧠 Un grafo de conocimiento personal que se compone con cada curso que
tomás, cada experimento que corrés, y cada conversación que tenés con
una IA.

Kortex es una plantilla markdown-first, AI-native para mantener el
conocimiento que construís a lo largo de los años en un solo lugar —
versionado con git, editable desde cualquier herramienta, legible por
cualquier modelo de IA frontier, y privado por default.

---

## ¿Qué problema resuelve?

- **Tus notas están dispersas.** Bookmarks, memos de voz, bases de
  Notion, docs a medio terminar, screenshots en el rollo de la cámara.
  Cada herramienta deja de servirte el momento en que cambiás de
  herramienta. Kortex es un solo repo de archivos `.md` planos —
  nada queda atado a un proveedor.
- **Los agentes IA pierden contexto entre sesiones.** Sin un sustrato
  compartido, cada conversación arranca de cero. Kortex es el sustrato
  compartido: cualquier agente puede leer cualquier página, seguir
  links, entender el schema, y escribir de vuelta a través de los
  comandos validados.
- **El conocimiento se degrada cuando no lo procesás.** Cursos que
  terminás pero nunca aplicás. Libros con notas que nunca releés.
  Kortex tiene zonas explícitas para input crudo (`inbox/`,
  `learnings/`), síntesis destilada (`wiki/`), y ejecución activa
  (`projects/`) — pasar de una zona a la siguiente es el trabajo, y
  el schema hace visibles los límites.

---

## Requisitos previos

Antes de clonar, verificá que tengas estas cosas en tu máquina:

- **Node.js 20 o más nuevo** — necesario para los scripts del CLI.
  Verificá con `node --version`.
- **pnpm** — el gestor de paquetes que usa Kortex. Instalalo con
  `npm install -g pnpm` si todavía no lo tenés.
- **Git 2.x** — incluye también el entorno `bash` que los hooks
  necesitan.
  - **Linux / macOS:** git y bash vienen preinstalados normalmente.
  - **Windows:** instalá [Git for Windows](https://git-scm.com/download/win),
    que incluye un entorno bash que Husky usa para correr los hooks.
    WSL funciona igual de bien. Sin Git for Windows ni WSL, los hooks
    no se disparan en los commits — los commits siguen funcionando
    pero perdés los validadores automáticos de frontmatter / links /
    caché. Mirá [wiki/references/husky.md](wiki/references/husky.md)
    para el setup completo de hooks.

Opcional pero recomendado:

- **VS Code** con el preview de markdown — Kortex es markdown-first y
  la experiencia de IDE está construida alrededor de eso.
- **GitHub Desktop** si preferís una UI antes que el CLI para
  operaciones de git.

## Arranque en 5 minutos

```bash
git clone https://github.com/<tu-usuario>/tu-mykortex
cd tu-mykortex
pnpm install          # también instala los hooks de husky
pnpm kortex setup     # interactivo — define dueño, canal, idioma
pnpm kortex daily     # abre la entrada del journal de hoy
```

Listo. Desde ahí:

- Tirá ideas en `inbox/`. Corré `pnpm kortex ingest` semanalmente
  para triar.
- Agregá un curso a `learnings/` cuando arrancás uno. Promové los
  insights a `wiki/` cuando terminás un módulo.
- Abrí un proyecto bajo `projects/` cuando algo tiene meta y fecha
  de cierre.
- Corré `pnpm kortex health` mensualmente para atrapar páginas
  obsoletas, links rotos y drift de frontmatter.

---

## Las cinco zonas

```
inbox/      Zona de captura     Input crudo. Cero fricción. La IA puede escribir aquí.
wiki/       Zona de síntesis    Páginas atómicas destiladas. Con cross-references.
projects/   Zona de proyectos   Ejecución activa por proyecto.
learnings/  Zona de aprendizaje Input estructurado — cursos, libros, charlas.
output/     Zona efímera        Notas de sesión, reportes de lint, logs de costo.
```

Las reglas completas de cada zona viven en
[AGENTS.md](AGENTS.md) — ese archivo es el manual operativo tanto
para vos como para cualquier agente IA trabajando en este repo.
(`CLAUDE.md` es un symlink a `AGENTS.md`, ambos nombres resuelven al
mismo contenido.)

---

## Tu primer playbook

Un playbook es un procedimiento de varios pasos que codificaste — el
tipo de cosa que de otro modo redescubrirías de cero cada seis meses.
Tres pasos para escribir uno:

1. **Copiá la plantilla.**
   ```bash
   cp .claude/templates/concept.md wiki/playbooks/<tu-slug>.md
   ```
   Abrí el archivo, cambiá `type: concept` por `type: playbook`,
   editá título y tags.

2. **Escribí el procedimiento.** Un paso por heading. Incluí comandos,
   rutas de archivos, y puntos de decisión. Apuntá al largo que le
   permita a vos-del-futuro re-ejecutar el procedimiento sin
   reconstruir contexto.

3. **Hacé commit.**
   ```bash
   pnpm kortex safe-change "add <slug> playbook"
   ```
   El hook de pre-commit valida frontmatter y links. Si algo está mal,
   te dice exactamente qué arreglar antes de que el commit pase.

El ejemplo en [wiki/playbooks/example-playbook.md](wiki/playbooks/example-playbook.md)
recorre esto end-to-end con contenido real.

---

## Git para no-developers (opcional, Capítulo 2)

Si nunca usaste git: los comandos de arriba (`pnpm kortex
safe-change`, etc.) se encargan de la mayoría del trabajo del día a
día por vos. Cuando quieras una interfaz visual, instalá
[GitHub Desktop](https://desktop.github.com/) — muestra los mismos
commits y branches que el CLI pero con UI. Cualquiera de los dos
enfoques funciona; agarrá el que no se te meta en el camino.

---

## Tabla rápida — qué comando usar

| Querés... | Corré |
|---|---|
| Abrir el journal de hoy | `pnpm kortex daily` |
| Triar todo en `inbox/` | `pnpm kortex ingest` |
| Buscar en la base de conocimiento | `pnpm kortex query "<términos>"` |
| Hacer un cambio multi-archivo seguro | `pnpm kortex safe-change "<mensaje>"` |
| Chequear la salud del repo | `pnpm kortex health` |
| Retomar después de una sesión perdida | `pnpm kortex read-last-handoff` |
| Guardar un puente de sesión | `pnpm kortex bridge` |

Documentación completa por comando: .claude/commands/.

---

## ¿Problemas?

- **¿El hook de pre-commit te bloqueó el commit?** Leé el mensaje —
  lista los archivos y reglas exactas que fallaron. Arreglalos y
  commiteá de nuevo.
- **¿Un comando se comporta raro?** Corré `pnpm kortex health` — hace
  un barrido de los patrones de drift más comunes y reporta lo que
  encuentra.
- **¿Algo está roto a nivel schema?** Abrí un issue en el repo del
  template. Los cambios de schema son el tipo de cosa que el framework
  necesita arreglar una vez para todos.

---

## Licencia y contribuciones

MIT. Forkealo, customizalo, shipea el tuyo. El template es el punto de
partida — tu versión te pertenece a vos.

Si encontrás un bug en el framework (comandos, hooks, schema, el
scaffold del template), los pull requests son bienvenidos. Si
construís un nuevo playbook o workflow encima del framework que pensás
que a otros les serviría, abrí un issue describiéndolo antes de
mandar un PR — el objetivo es mantener el framework chico y dejar que
los playbooks individuales vivan en forks personales.

## Backlinks
<!-- backrefs:start -->
- [AGENTS](AGENTS.md)
- [example-playbook](wiki/playbooks/example-playbook.md)
- [husky](wiki/references/husky.md)
<!-- backrefs:end -->

