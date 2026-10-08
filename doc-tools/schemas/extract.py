"""Collect every <sources_dir>/<name>.mmd into diagrams.json for convert2.mjs.

usage: extract.py <sources_dir>
"""
import json
import os
import sys

if len(sys.argv) != 2:
    sys.exit("usage: extract.py <sources_dir>")
src = sys.argv[1]
out = [{"name": f[:-4], "conv": open(os.path.join(src, f), encoding="utf-8").read()}
       for f in sorted(os.listdir(src)) if f.endswith(".mmd")]
json.dump(out, open("diagrams.json", "w"), ensure_ascii=False, indent=1)
print(len(out))
