#!/usr/bin/env python3
"""Regenerate assets/js/maps.js from the validated process/*.mmd files.

The maps are embedded as JS strings because fetch() and XMLHttpRequest are both
blocked from file://, and the deliverable has to run from a USB stick.

Run from the project root:  python3 tools/embed-maps.py
"""
import json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = {
    "map-rtw": "process/bpmn-rtw.mmd",
    "map-audit": "process/bpmn-audit.mmd",
    "map-onboarding": "process/bpmn-onboarding.mmd",
    "map-specialist": "process/bpmn-specialist.mmd",
}

missing = [p for p in FILES.values() if not (ROOT / p).exists()]
if missing:
    sys.exit("missing map sources: " + ", ".join(missing))

data = {k: (ROOT / v).read_text() for k, v in FILES.items()}
tpl = (ROOT / "assets/js/maps.js").read_text()
head, _, rest = tpl.partition("  var MAPS = ")
_, _, tail = rest.partition(";\n")
(ROOT / "assets/js/maps.js").write_text(
    head + "  var MAPS = " + json.dumps(data, indent=2) + ";\n" + tail
)
print("regenerated assets/js/maps.js from", len(data), "maps")
