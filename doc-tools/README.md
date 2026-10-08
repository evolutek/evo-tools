# doc-tools

Outils de la documentation Evolutek (vault Obsidian `evolutek/obsidian-vault`, dossier `Evolutek/Logiciel haut niveau 2026/`).

## `schemas/` : Mermaid vers Excalidraw

Les schémas du vault sont des dessins Excalidraw (`_schemas/evo-*.excalidraw.md`). Leur source est le fichier Mermaid du même nom, qui reste dans le vault : `Evolutek/Logiciel haut niveau 2026/_schemas/sources/<nom>.mmd`. Pour modifier un schéma, on édite son `.mmd` puis on régénère.

- **Organigrammes** : structure lue par Mermaid (épinglé sur 11.12.1), mise en page recalculée par ELK (routage orthogonal, groupes imbriqués), étiquettes placées à côté des flèches (`entry3.js`).
- **Diagrammes de séquence** : `@excalidraw/mermaid-to-excalidraw`, recoloré.
- Les diagrammes d'états et de classes ne sont pas gérés : les écrire en `flowchart`.

Prérequis : Node.js, Python 3, le Chromium de Playwright.

```bash
cd doc-tools/schemas
npm i && npx playwright install chromium
npm run build                                   # entry3.js -> bundle3.js (esbuild)
VAULT_SCHEMAS="<vault>/Evolutek/Logiciel haut niveau 2026/_schemas"
python3 extract.py "$VAULT_SCHEMAS/sources"     # -> diagrams.json
node convert2.mjs [nom…]                        # -> results2.json + aperçus prev2/<nom>.png
python3 write.py "$VAULT_SCHEMAS"               # écrit <nom>.excalidraw.md (défaut : ./out)
node roundtrip.mjs "$VAULT_SCHEMAS"             # contrôle les références internes des dessins
```

- **Toujours regarder les aperçus PNG de `prev2/` avant de committer.**
- **Fermer dans Obsidian les onglets Excalidraw des dessins régénérés** avant de lancer `write.py`. Sinon, le plugin fusionne sa version en mémoire avec le nouveau fichier et duplique les éléments.
- Un dessin retouché à la main est écrasé par une régénération : reporter les retouches dans le `.mmd`.

## `config-validation/` : validation des configs contre omnissiah

Rejoue `Robot._init` d'omnissiah sur un dossier de config sans s'arrêter à la première erreur, puis vérifie statiquement chaque commande d'action : périphérique existant pour chaque valeur d'entrée, commande déclarée par le driver, noms d'arguments. Résultats et méthode : page `configs/validation.md` du vault.

- `validate.py <config_dir> <robot> [--main-from <main.json5>]` : le validateur tolérant. Avec `--main-from`, il travaille sur une copie temporaire de la config.
- `val.sh <pin|master> <pc|rpi> <config_dir> <robot> [--main-from f]` : lance le validateur.
- `run.sh <pc|rpi> <config_dir> <robot> [args]` : lance le vrai `robot` (par exemple avec `--dry`), journaux dans `logs/`.
- `valall.sh`, `runall.sh [flag] [lignes]` : les mêmes sur toutes les configs 2026. Ils lisent `CONFIGS_DIR` (dossier des worktrees de `evo-robot-configs`) et, en option, `FIXCOLORS_DIR` (défaut : `$CONFIGS_DIR/fixcolors`).
- `tkstub/` : un faux `tkinter`, pour importer omnissiah sans Tk.
- `rpistub/sitecustomize.py` : en mode `rpi`, fait passer le PC pour une Raspberry Pi (`platform.release()`), pour que les drivers `rpi_*` soient enregistrés. Sur PC, toute config matérielle échoue sur `rpi_serial`.

Prérequis, à créer à côté des scripts (ignorés par git) :

- `venv/` : un venv contenant une copie d'omnissiah installée en editable (`pip install -e`), avec sa library épinglée (mode `pin`) ;
- `libmaster/` : une copie de la library sur `master`, pour le mode `master` (son `src/` passe devant la library épinglée).

```bash
cd doc-tools/config-validation
python3 -m venv venv && venv/bin/pip install -e <copie d'omnissiah>
git clone <library> libmaster                   # mode master seulement
./val.sh pin rpi <worktree evo-robot-configs> hololutek
CONFIGS_DIR=<worktrees evo-robot-configs> ./valall.sh
```
