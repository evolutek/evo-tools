"""Write results2.json drawings as Obsidian Excalidraw files.

usage: write.py [out_dir]   (default: ./out; the vault expects Evolutek/Logiciel haut niveau 2026/_schemas)
"""
import json
import os
import sys

OUT = sys.argv[1] if len(sys.argv) > 1 else "out"
os.makedirs(OUT, exist_ok=True)
HEADER = """---

excalidraw-plugin: parsed
tags: [excalidraw]

---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'


# Excalidraw Data

## Text Elements
"""
for r in json.load(open("results2.json")):
    texts = "".join(f"{e['text']} ^{e['id']}\n\n" for e in r["elements"] if e["type"] == "text")
    drawing = {"type": "excalidraw", "version": 2,
               "source": "https://github.com/zsviczian/obsidian-excalidraw-plugin/releases/tag/2.28.1",
               "elements": r["elements"],
               "appState": {"gridSize": None, "viewBackgroundColor": "#ffffff"},
               "files": r.get("files") or {}}
    body = HEADER + texts + "%%\n## Drawing\n```json\n" + json.dumps(drawing, ensure_ascii=False, indent=1) + "\n```\n%%"
    open(os.path.join(OUT, r["name"] + ".excalidraw.md"), "w", encoding="utf-8").write(body)
    print(r["name"])
