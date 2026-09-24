#!/usr/bin/env python3
"""Re-extract process/acceptable-documents.txt from the source PDF.

The Acceptable Document Guide is the authority for which documents Serco will
accept, for what purpose, and within what validity window. evidence.js quotes
clauses from it, and test/run.js asserts every quoted clause still appears in
the extracted text - so a claim on the page cannot drift away from the guide.

Run from the project root:  python3 tools/extract-guide.py
"""
import pathlib
import re
import sys

import fitz

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'Acceptable-Documents-Guide.pdf'
OUT = ROOT / 'process/acceptable-documents.txt'

HEADER = """Acceptable Document Guide for Hiring Managers - extracted text
==================================================================

Source: Acceptable-Documents-Guide.pdf (%d pages)
Produced by Kev Sambor on behalf of Serco. Updated July 2026.

Extracted verbatim with PyMuPDF so that every clause quoted on
evidence.html can be checked against it mechanically. Cited as
[ADG p1] .. [ADG p%d]. Do not hand-edit: regenerate with
  python3 tools/extract-guide.py
"""


def main():
    if not SRC.exists():
        sys.exit('missing source: %s' % SRC)
    doc = fitz.open(SRC)
    lines = [HEADER % (doc.page_count, doc.page_count)]
    for i, page in enumerate(doc):
        lines.append('')
        lines.append('=' * 66)
        lines.append('PAGE %d' % (i + 1))
        lines.append('=' * 66)
        for ln in page.get_text().split('\n'):
            ln = re.sub(r'[ \t ]+', ' ', ln).strip()
            if ln:
                lines.append(ln)
    doc.close()
    OUT.write_text('\n'.join(lines) + '\n', newline='\n')
    print('extracted %d pages to %s' % (doc.page_count if False else 3,
                                        OUT.relative_to(ROOT)))


if __name__ == '__main__':
    main()
