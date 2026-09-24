#!/usr/bin/env python3
"""Render the specimen evidence documents and emit their highlight geometry.

Reads assets/js/evidence.js (the hand-authored source of truth) via node, draws
one PDF per document with reportlab, rasterises page 1 with PyMuPDF, and writes
assets/js/evidence-boxes.js containing normalised highlight boxes plus a digest
of the values it was built from.

Every field VALUE lives in evidence.js and nowhere else. This script prints
those values and records where it printed them; it never invents one. After
changing a value in evidence.js, re-run this. test/run.js compares the digest
and fails if you forget.

Run from the project root:
    python3 tools/build-evidence.py           # build
    python3 tools/build-evidence.py --check   # verify on-disk assets are current
"""

import hashlib
import io
import json
import math
import pathlib
import random
import subprocess
import sys

# ---------------------------------------------------------------- determinism
# rl_config reads RL_* environment variables and ~/.reportlab_settings at import
# time, so a developer with RL_pageCompression exported would produce different
# bytes from the same source. Pin everything that affects output, before any
# canvas exists.
from reportlab import rl_config
rl_config.invariant = 1
rl_config.pageCompression = 1
rl_config.useA85 = 1
rl_config.shapeChecking = 1
rl_config.ttfAsciiReadable = 0

from reportlab.pdfgen import canvas                     # noqa: E402
from reportlab.pdfbase import pdfmetrics                # noqa: E402
from reportlab.pdfbase.pdfmetrics import stringWidth    # noqa: E402
from reportlab.lib.colors import HexColor               # noqa: E402
import fitz                                             # noqa: E402
from PIL import Image                                   # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONTENT = ROOT / "assets/js/evidence.js"
OUT_DIR = ROOT / "assets/evidence"
BOXES_JS = ROOT / "assets/js/evidence-boxes.js"

TARGET_LONG_EDGE_PX = 1400   # constant pixels, not constant DPI - see below
PNG_COLOURS = 64

# Palette borrowed from assets/css/serco.css so the specimens sit in the same
# world as the site without pretending to be any real document.
INK      = HexColor('#232A30')
INK_2    = HexColor('#46555F')
RULE     = HexColor('#B9C4CB')
RULE_HI  = HexColor('#D7DEE2')
SURF_2   = HexColor('#F2F2F2')
SURF_3   = HexColor('#E9EEF1')
MIST     = HexColor('#C3CDD5')
RED      = HexColor('#C50001')
PURPLE   = HexColor('#1D0743')


# ------------------------------------------------------------------ geometry
def norm_box(x0, y0, x1, y1, page_w, page_h, zoom, pad=1.0):
    """Bottom-left-origin PDF points -> top-left-origin fractions of the raster.

    Normalising against round(page * zoom) rather than page * zoom matters: that
    rounded value is what get_pixmap() actually produces, and the difference is
    about a pixel at the far edge of a 1400px image.

    pad is not cosmetic. Measured: for an all-caps string in Helvetica-Bold,
    cap height equals the ascent, so glyph tops sit exactly on the ascent line
    and antialiasing spills one pixel past it at raster scale.
    """
    px_w = round(page_w * zoom)
    px_h = round(page_h * zoom)
    x0, y0, x1, y1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
    return [
        round(x0 * zoom / px_w, 5),
        round((page_h - y1) * zoom / px_h, 5),
        round((x1 - x0) * zoom / px_w, 5),
        round((y1 - y0) * zoom / px_h, 5),
    ]


def zoom_for(page_w, page_h):
    """Constant long-edge pixel target.

    A constant DPI would render the 85.6mm driving licence at 674px and the A4
    forms at 1654px, and CSS gives both the same column width - so the licence
    would look soft in exactly the slot where it matters.
    """
    return TARGET_LONG_EDGE_PX / max(page_w, page_h)


class Sheet:
    """A reportlab canvas that records a normalised box for each declared field.

    Call .field()/.block()/.rows() only for things a step can highlight. Static
    labels and chrome go through .c directly: a recorded box for the words
    "Surname / Nom" would be noise in the payload and a lie in the panel.
    """

    PAD = 1.0

    def __init__(self, doc_id, page_w, page_h):
        self.id = doc_id
        self.w = float(page_w)
        self.h = float(page_h)
        self.zoom = zoom_for(self.w, self.h)
        self.buf = io.BytesIO()
        self.c = canvas.Canvas(self.buf, pagesize=(self.w, self.h), invariant=1)
        self.c.setTitle('%s - SPECIMEN' % doc_id)
        self.c.setAuthor('Serco Agentic Vetting demonstrator')
        self.c.setSubject('Fictional specimen - not a real document')
        self.c.setCreator('tools/build-evidence.py')
        self.page = 0
        self.boxes = {}
        self.checks = []
        self.derived = {}          # text COMPUTED here, not declared in content
        self.suppress = False      # set while drawing nested/scaled content

    # -- recording ---------------------------------------------------------
    def _emit(self, name, x0, y0, x1, y1, text=None):
        if self.suppress:
            return None
        if name in self.boxes:
            raise KeyError('%s: field "%s" recorded twice' % (self.id, name))
        if self.page != 0:
            raise ValueError(
                '%s: field "%s" is on page %d. Only page 1 is rasterised, so '
                'it could never be highlighted.' % (self.id, name, self.page + 1))
        self.boxes[name] = norm_box(x0, y0, x1, y1, self.w, self.h, self.zoom, self.PAD)
        if text:
            self.checks.append((name, text, (x0, y0, x1, y1)))
        return self.boxes[name]

    def field(self, name, x, y, text, font='Helvetica-Bold', size=9, align='left',
              colour=None):
        text = str(text)
        self.c.setFillColor(colour or INK)   # never inherit; see the MRZ bug
        self.c.setFont(font, size)
        w = stringWidth(text, font, size)
        if align == 'right':
            self.c.drawRightString(x, y, text)
            x0 = x - w
        elif align == 'centre':
            self.c.drawCentredString(x, y, text)
            x0 = x - w / 2.0
        else:
            self.c.drawString(x, y, text)
            x0 = x
        face = pdfmetrics.getFont(font).face
        return self._emit(name, x0, y + face.descent / 1000.0 * size,
                          x0 + w, y + face.ascent / 1000.0 * size, text)

    def rows(self, name, x, y, lines, font='Helvetica', size=8.5, leading=None):
        """Multi-line value - one box spanning every line, which is what a human
        would circle."""
        leading = leading or size * 1.3
        face = pdfmetrics.getFont(font).face
        self.c.setFillColor(INK)
        self.c.setFont(font, size)
        widest = 0.0
        for i, ln in enumerate(lines):
            self.c.drawString(x, y - i * leading, ln)
            widest = max(widest, stringWidth(ln, font, size))
        top = y + face.ascent / 1000.0 * size
        bot = y - (len(lines) - 1) * leading + face.descent / 1000.0 * size
        return self._emit(name, x, bot, x + widest, top, '\n'.join(lines))

    def block(self, name, x, y, w, h):
        """Non-text field: photo frame, signature strip, category table."""
        return self._emit(name, x, y, x + w, y + h)

    def derive(self, name, text):
        """Record text this script computed rather than read from the content
        module - currently just the MRZ, which is generated from the persona.

        This is not a second copy of a value: it is a projection of values that
        live in evidence.js, produced by the same code that printed it. The
        panel shows exactly what is on the page because it is handed the
        rendered string.
        """
        if not self.suppress:
            self.derived[name] = text
        return text

    # -- chrome ------------------------------------------------------------
    def label(self, x, y, text, size=5.6, colour=INK_2, font='Helvetica'):
        self.c.setFont(font, size)
        self.c.setFillColor(colour)
        self.c.drawString(x, y, text)
        self.c.setFillColor(INK)

    def new_page(self):
        self.watermark()
        self.footer()
        self.c.showPage()
        self.page += 1

    def watermark(self, text='SPECIMEN — NOT A GENUINE DOCUMENT'):
        c = self.c
        c.saveState()
        c.setFillColor(RED)
        c.setFillAlpha(0.11)
        c.translate(self.w / 2.0, self.h / 2.0)
        c.rotate(math.degrees(math.atan2(self.h, self.w)))
        unit = stringWidth(text, 'Helvetica-Bold', 100) / 100.0
        size = (self.w ** 2 + self.h ** 2) ** 0.5 * 0.92 / unit
        c.setFont('Helvetica-Bold', size)
        c.drawCentredString(0, -size * 0.35, text)
        c.restoreState()

    def footer(self):
        # An A4-sized footer eats the entitlement band on an ID-1 card, so the
        # disclaimer scales with the page. It is never omitted.
        small = self.h < 200
        c = self.c
        c.saveState()
        c.setFont('Helvetica', 3.4 if small else 5.2)
        c.setFillColor(INK_2)
        c.drawCentredString(
            self.w / 2.0, 3.2 if small else 6.5,
            'SPECIMEN — not a real document' if small else
            'Fictional specimen generated for the Serco Agentic Vetting '
            'demonstrator — not a real document')
        c.restoreState()

    def finish(self):
        self.watermark()
        self.footer()
        self.c.showPage()
        self.c.save()
        return self.buf.getvalue()


# ------------------------------------------------------------------ specimens
def signature(c, x, y, w, h, seed):
    """A seeded scribble. Not anyone's real signature, and stable across runs
    so the same person signs the same way on every document they appear on."""
    rng = random.Random(seed)
    p = c.beginPath()
    p.moveTo(x, y)
    cx, n = x, 7
    for _ in range(n):
        dx = w / float(n)
        p.curveTo(cx + dx * 0.30, y + rng.uniform(-h, h),
                  cx + dx * 0.70, y + rng.uniform(-h, h),
                  cx + dx, y + rng.uniform(-h * 0.3, h * 0.3))
        cx += dx
    c.saveState()
    c.setStrokeColor(PURPLE)
    c.setLineWidth(1.0)
    c.setLineCap(1)
    c.drawPath(p)
    c.restoreState()


def seed_for(*parts):
    return int(hashlib.sha256(':'.join(str(p) for p in parts).encode()).hexdigest()[:8], 16)


def photo_placeholder(c, x, y, w, h, caption='SPECIMEN'):
    """Deliberately no face. Not a stock photo, not a generated one, not a real
    person - a neutral silhouette that reads as 'intentionally blank'."""
    c.saveState()
    c.setFillColor(SURF_3)
    c.setStrokeColor(RULE)
    c.setLineWidth(0.6)
    c.rect(x, y, w, h, stroke=1, fill=1)
    path = c.beginPath()
    path.rect(x, y, w, h)
    c.clipPath(path, stroke=0, fill=0)
    c.setStrokeColor(RULE_HI)
    c.setLineWidth(0.4)
    step = 4.0
    for i in range(int((w + h) / step) + 1):
        c.line(x + i * step, y, x - h + i * step, y + h)
    c.setFillColor(MIST)
    c.circle(x + w / 2.0, y + h * 0.66, w * 0.20, stroke=0, fill=1)
    sil = c.beginPath()
    sil.moveTo(x + w * 0.20, y + h * 0.10)
    sil.lineTo(x + w * 0.80, y + h * 0.10)
    sil.curveTo(x + w * 0.78, y + h * 0.44, x + w * 0.62, y + h * 0.46,
                x + w * 0.50, y + h * 0.46)
    sil.curveTo(x + w * 0.38, y + h * 0.46, x + w * 0.22, y + h * 0.44,
                x + w * 0.20, y + h * 0.10)
    sil.close()
    c.drawPath(sil, stroke=0, fill=1)
    c.restoreState()
    c.saveState()
    c.setFillColor(INK_2)
    c.setFont('Helvetica-Bold', max(4.2, w * 0.075))
    c.drawCentredString(x + w / 2.0, y + 3.2, caption)
    c.restoreState()


def guilloche(c, x, y, w, h, seed, rings=34):
    """Low-contrast lissajous wash. Contrast is kept minimal because fine
    high-contrast line noise defeats every PNG row predictor and roughly doubles
    the file size - and because a low-contrast security print looks more real."""
    rng = random.Random(seed)
    c.saveState()
    path = c.beginPath()
    path.rect(x, y, w, h)
    c.clipPath(path, stroke=0, fill=0)
    c.setStrokeColor(RULE_HI)
    c.setLineWidth(0.22)
    a, b = w * 0.34, h * 0.30
    f1, f2 = 3, 7
    phase = rng.uniform(0, 0.5)
    for k in range(rings):
        t = k / float(rings) * 2 * math.pi + phase
        p = c.beginPath()
        for i in range(97):
            u = i / 96.0 * 2 * math.pi
            px = x + w / 2 + a * math.cos(u * f1 + t) + a * 0.32 * math.cos(u * f2)
            py = y + h / 2 + b * math.sin(u * f1 + t) + b * 0.32 * math.sin(u * (f2 - 2))
            p.moveTo(px, py) if i == 0 else p.lineTo(px, py)
        c.drawPath(p)
    c.restoreState()


MONTHS = {'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
          'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12}


def parse_date(text):
    """'14 MAR 1994' or '14.03.1994' -> (1994, 3, 14).

    Both forms are printed on the specimens, and every derived encoding - the
    MRZ dates, the DVLA number - comes through here, so none of them can
    disagree with the date printed on the page.
    """
    t = text.strip().upper()
    if '.' in t:
        d, m, y = t.split('.')
        return int(y), int(m), int(d)
    d, mon, y = t.split()
    if mon not in MONTHS:
        raise ValueError('unrecognised month in %r' % text)
    return int(y), MONTHS[mon], int(d)


def yymmdd(text):
    y, m, d = parse_date(text)
    return '%02d%02d%02d' % (y % 100, m, d)


def dvla_number(surname, forenames, dob_text, sex):
    """A DVLA photocard licence number, to the published 16-character schema.

    1-5   surname, padded to five with 9s
    6     decade digit of the year of birth
    7-8   month of birth, PLUS 50 if the holder is female
    9-10  day of birth
    11    final digit of the year of birth
    12-13 first two forename initials, or one initial padded with 9
    14    arbitrary digit, distinguishing otherwise identical records
    15-16 computer check characters

    Note the order: decade / month / day / year. A DVLA number therefore never
    contains a YYMMDD string, which is what the earlier hand-written value on
    this page wrongly claimed.
    """
    y, m, d = parse_date(dob_text)
    parts = [ch for ch in forenames.upper().split() if ch]
    initials = (parts[0][0] + (parts[1][0] if len(parts) > 1 else '9'))
    num = '%-5.5s%s%02d%02d%s%s9AB' % (
        (surname.upper() + '99999')[:5],
        str(y)[2],
        m + (50 if sex.upper() == 'F' else 0),
        d,
        str(y)[3],
        initials,
    )
    assert len(num) == 16, (num, len(num))
    return num


def decode_dvla(num):
    """Inverse of the date portion, so the build can prove the round trip."""
    mon = int(num[6:8])
    female = mon > 50
    return {'surname5': num[:5], 'month': mon - 50 if female else mon,
            'day': int(num[8:10]), 'female': female,
            'decade': num[5], 'yearDigit': num[10]}


_MRZ_W = (7, 3, 1)


def _mrz_cd(s):
    total = 0
    for i, ch in enumerate(s):
        if ch == '<':
            v = 0
        elif ch.isdigit():
            v = int(ch)
        else:
            v = ord(ch) - 55
        total += v * _MRZ_W[i % 3]
    return str(total % 10)


def _mrz_pad(s, n):
    s = ''.join(ch if ch.isalnum() else '<' for ch in s.upper().replace(' ', '<'))
    return (s + '<' * n)[:n]


def mrz_td3(surname, given, doc_no, nationality, dob, sex, expiry, issuing='GBR'):
    """ICAO 9303 TD3, derived from the SAME values the visual zone prints.

    Deriving rather than declaring is the point: it lets a step legitimately
    claim the MRZ was checked against the printed zone and the check digits
    recomputed, which is a real thing document-intelligence products do.
    """
    name = (_mrz_pad(surname, len(surname)) + '<<' +
            _mrz_pad(given, len(given)) + '<' * 39)[:39]
    l1 = 'P<' + issuing + name
    dn = _mrz_pad(doc_no, 9)
    core = dn + _mrz_cd(dn) + nationality + dob + _mrz_cd(dob) + sex + expiry + _mrz_cd(expiry)
    l2 = core + '<' * 14 + '0'
    l2 += _mrz_cd(dn + _mrz_cd(dn) + dob + _mrz_cd(dob) + expiry + _mrz_cd(expiry) + '<' * 15)
    assert len(l1) == 44, len(l1)
    assert len(l2) == 44, len(l2)
    return l1, l2


def _val(doc, key):
    return doc['fields'][key]['value']


# Every persona value that is ALSO printed on a specimen, and where. Asserted
# on each build so the convenience block cannot drift away from the documents.
PERSONA_MIRRORS = [
    ('surname',     'passport',        'surname'),
    ('givenNames',  'passport',        'givenNames'),
    ('passportNo',  'passport',        'passportNo'),
    ('sex',         'passport',        'sex'),
    ('dob',         'passport',        'dob'),
    ('nationality', 'passport',        'nationality'),
    ('birthplace',  'passport',        'birthplace'),
    ('niNumber',    'ni-letter',       'niNumber'),
    ('dobTyped',    'appian-record',   'dob'),
    ('ticket',      'appian-record',   'ticket'),
    ('role',        'appian-record',   'role'),
    ('site',        'appian-record',   'site'),
    ('auditTicket', 'sap-record',      'auditTicket'),
    ('manager',     'mgr-declaration', 'manager'),
]


def check_persona(docs, persona):
    for pkey, doc_id, fkey in PERSONA_MIRRORS:
        if pkey not in persona:
            raise AssertionError('persona.%s is missing' % pkey)
        want = docs[doc_id]['fields'][fkey]['value']
        if persona[pkey] != want:
            raise AssertionError(
                'persona.%s is %r but %s.%s prints %r - one of them is wrong'
                % (pkey, persona[pkey], doc_id, fkey, want))
    for gone in ('dobShort', 'licenceNo'):
        if gone in persona:
            raise AssertionError(
                'persona.%s is now derived by the build; remove it from '
                'evidence.js so there is only one copy' % gone)


def draw_passport(sh, doc, persona):
    """ID-3 / TD3 biographical data page.

    Field order and grouping follow ICAO 9303 - type/code/number share a line,
    as do date-of-birth/sex and issue/expiry, which is both authentic and the
    only way twelve fields fit on a 125 x 88 mm page. The artwork is schematic:
    no reproduction of Crown copyright design.
    """
    c, W, H = sh.c, sh.w, sh.h
    c.setFillColor(SURF_2)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    # Confined to the empty right-hand field so it never sits under text.
    guilloche(c, W * 0.60, 44, W * 0.40, H - 78, seed_for('passport-guilloche'), rings=22)

    c.setFillColor(PURPLE)
    c.setFont('Helvetica-Bold', 7.2)
    c.drawString(14, H - 15, 'UNITED KINGDOM OF GREAT BRITAIN AND NORTHERN IRELAND')
    c.setFont('Helvetica', 5.2)
    c.setFillColor(INK_2)
    c.drawString(14, H - 23, 'PASSPORT  /  PASSEPORT')
    c.setStrokeColor(RULE)
    c.setLineWidth(0.5)
    c.line(14, H - 27, W - 14, H - 27)

    px, py, pw, ph = 14, H - 143, 74, 108
    photo_placeholder(c, px, py, pw, ph)
    sh.block('photo', px, py, pw, ph)
    photo_placeholder(c, 14, 52, 28, 38, caption='')      # ghost portrait

    # (key, label, x-offset) grouped onto shared lines
    LINES = [
        [('type', 'Type', 0), ('code', 'Code of issuing State', 34),
         ('passportNo', 'Passport No. / No. du passeport', 96)],
        [('surname', 'Surname / Nom', 0)],
        [('givenNames', 'Given names / Pr\u00e9noms', 0)],
        [('nationality', 'Nationality / Nationalit\u00e9', 0)],
        [('dob', 'Date of birth / Date de naissance', 0), ('sex', 'Sex', 112)],
        [('birthplace', 'Place of birth / Lieu de naissance', 0)],
        [('issued', 'Date of issue', 0), ('expiry', 'Date of expiry', 112)],
        [('authority', 'Authority / Autorit\u00e9', 0)],
    ]
    col = 100
    y = H - 40
    for line in LINES:
        for key, lab, dx in line:
            sh.label(col + dx, y + 6.2, lab, size=5.0)
            sh.field(key, col + dx, y - 1.8, _val(doc, key), size=8.2)
        y -= 15.4

    sh.label(col, y + 2, "Holder's signature / Signature du titulaire", size=5.0)
    signature(c, col + 2, y - 12, 94, 7, seed_for('sig', persona['name']))
    sh.block('signature', col, y - 21, 102, 21)

    # Built from the values printed above, not from the persona block. That is
    # what makes step 6's claim - "MRZ agrees with the printed zone" - true by
    # construction rather than by hand-authoring coincidence.
    f = doc['fields']
    l1, l2 = mrz_td3(f['surname']['value'], f['givenNames']['value'],
                     f['passportNo']['value'], 'GBR',
                     yymmdd(f['dob']['value']), f['sex']['value'],
                     yymmdd(f['expiry']['value']))
    c.setFillColor(HexColor('#FFFFFF'))
    c.rect(0, 14, W, 32, stroke=0, fill=1)
    c.setStrokeColor(RULE_HI)
    c.setLineWidth(0.4)
    c.line(0, 46, W, 46)
    sh.field('mrz1', 12, 33, sh.derive('mrz1', l1), font='Courier-Bold', size=10.4)
    sh.field('mrz2', 12, 20, sh.derive('mrz2', l2), font='Courier-Bold', size=10.4)


def draw_licence(sh, doc, persona):
    """ID-1 photocard, numbered to the DVLA field schema.

    The numbering is the interesting part for a vetting audience: 4b is the
    expiry the check actually cares about, and field 5 encodes the surname and
    date of birth, which gives a second independent read on the date the
    manager mis-keyed.
    """
    c, W, H = sh.c, sh.w, sh.h
    c.setFillColor(SURF_2)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    guilloche(c, 0, 8, W, H - 8, seed_for('licence-guilloche'), rings=16)

    c.setFillColor(PURPLE)
    c.setFont('Helvetica-Bold', 6.4)
    c.drawString(9, H - 13, 'DRIVING LICENCE')
    c.setFont('Helvetica', 4.4)
    c.setFillColor(INK_2)
    c.drawString(9, H - 19, 'UNITED KINGDOM')

    px, py, pw, ph = 9, H - 88, 50, 64
    photo_placeholder(c, px, py, pw, ph)
    sh.block('photo', px, py, pw, ph)

    # Ghost portrait and hologram rosette live in the empty right-hand third,
    # stacked so they do not sit on top of each other.
    photo_placeholder(c, W - 40, H - 62, 26, 34, caption='')
    c.saveState()
    c.setFillAlpha(0.20)
    c.setStrokeColor(PURPLE)
    c.setLineWidth(0.35)
    for r in range(4, 20, 4):
        c.circle(W - 27, 42, r, stroke=1, fill=0)
    c.restoreState()

    col = 66
    y = H - 27
    for key, num in [('surname', '1'), ('givenNames', '2'), ('dob', '3'),
                     ('issued', '4a'), ('expiry', '4b'), ('authority', '4c'),
                     ('licenceNumber', '5')]:
        if key == 'licenceNumber':
            # Derived from the surname, forenames, date of birth and sex printed
            # on this same card, so the number cannot disagree with them.
            text = sh.derive('licenceNumber', dvla_number(
                _val(doc, 'surname'), _val(doc, 'givenNames'),
                _val(doc, 'dob'), persona['sex']))
        else:
            text = _val(doc, key)
        sh.label(col, y, num, size=4.2)
        sh.field(key, col + 10, y, text, size=6.2)
        y -= 9.0

    sh.label(col, y - 1, '8', size=4.2)
    sh.rows('address', col + 10, y - 1, doc['fields']['address']['lines'], size=5.2)

    sh.label(9, 34, '7  Signature', size=4.2)
    signature(c, 13, 24, 44, 4.5, seed_for('sig', persona['name']))
    sh.block('signature', 11, 17, 48, 14)

    c.setFillColor(SURF_3)
    c.rect(col, 14, W - col - 46, 12, stroke=0, fill=1)
    sh.label(col + 2, 21.5, '9  Entitlement categories', size=4.0)
    c.setFillColor(INK)
    c.setFont('Helvetica-Bold', 4.8)
    c.drawString(col + 2, 16.0, 'AM/A1/A2/A  B1/B/BE  f/k/l/n/p/q')
    sh.block('categories', col, 14, W - col - 46, 12)


def draw_form(sh, doc, persona):
    """Generic A4 document: letterhead, a label/value ladder, signature and
    row-block fields where declared. Covers eleven of the sixteen specimens."""
    c, W, H = sh.c, sh.w, sh.h
    c.setFillColor(HexColor('#FFFFFF'))
    c.rect(0, 0, W, H, stroke=0, fill=1)

    # letterhead
    c.setFillColor(SURF_3)
    c.rect(0, H - 92, W, 92, stroke=0, fill=1)
    c.setFillColor(PURPLE)
    c.setFont('Helvetica-Bold', 13)
    c.drawString(46, H - 44, doc.get('issuer', 'Document'))
    c.setFont('Helvetica', 9)
    c.setFillColor(INK_2)
    # wrap the label if it is long
    lab = doc['label']
    c.drawString(46, H - 60, lab if stringWidth(lab, 'Helvetica', 9) < W - 92 else lab[:78])
    c.setStrokeColor(RULE)
    c.setLineWidth(0.7)
    c.line(46, H - 92, W - 46, H - 92)

    y = H - 126
    lab_x, val_x = 46, 250
    for key, f in doc['fields'].items():
        kind = f.get('kind')
        if kind == 'rows':
            sh.label(lab_x, y, f['label'].upper(), size=6.0)
            sh.rows(key, val_x, y, f['lines'], size=9)
            y -= 12 + 11 * len(f['lines'])
            continue
        if kind == 'block':
            sh.label(lab_x, y, f['label'].upper(), size=6.0)
            signature(c, val_x + 2, y - 4, 130, 9, seed_for('sig', persona['name'], key))
            sh.block(key, val_x, y - 15, 140, 24)
            y -= 34
            continue
        sh.label(lab_x, y, f['label'].upper(), size=6.0)
        sh.field(key, val_x, y, f['value'], size=9.6)
        c.setStrokeColor(RULE_HI)
        c.setLineWidth(0.4)
        c.line(val_x, y - 5.5, W - 46, y - 5.5)
        y -= 20.5
        if y < 120:      # spill onto a second page; page 1 keeps the boxes
            sh.new_page()
            c.setFillColor(HexColor('#FFFFFF'))
            c.rect(0, 0, W, H, stroke=0, fill=1)
            y = H - 70

    if doc.get('note'):
        c.setFillColor(HexColor('#FFF8E8'))
        c.rect(46, 44, W - 92, 56, stroke=0, fill=1)
        c.setStrokeColor(HexColor('#B26A00'))
        c.setLineWidth(2)
        c.line(46, 44, 46, 100)
        c.setFillColor(HexColor('#8A5A00'))
        c.setFont('Helvetica-Bold', 6.4)
        c.drawString(54, 88, 'ABOUT THIS SPECIMEN')
        c.setFont('Helvetica', 7.2)
        words, line, ly = doc['note'].split(), '', 78
        for wd in words:
            probe = (line + ' ' + wd).strip()
            if stringWidth(probe, 'Helvetica', 7.2) > W - 120:
                c.drawString(54, ly, line)
                ly -= 9.4
                line = wd
            else:
                line = probe
        if line:
            c.drawString(54, ly, line)


def draw_combined(sh, doc, persona, sub_docs):
    """The manager's upload: four unrelated documents scanned into one file.

    The sub-documents are drawn at reduced scale with recording suppressed -
    only the four detected REGIONS get boxes, because that is what the split
    step highlights. Each document is then shown full size in its own step.
    """
    c, W, H = sh.c, sh.w, sh.h
    c.setFillColor(HexColor('#FFFFFF'))
    c.rect(0, 0, W, H, stroke=0, fill=1)

    c.setFillColor(PURPLE)
    c.setFont('Helvetica-Bold', 12)
    c.drawString(40, H - 46, 'Kaur_docs_scan.pdf')
    c.setFont('Helvetica', 8.4)
    c.setFillColor(INK_2)
    c.drawString(40, H - 60, 'Uploaded to PeopleFirst (Appian) — 4 documents in one file')
    c.setStrokeColor(RULE)
    c.line(40, H - 68, W - 40, H - 68)

    sh.label(40, H - 84, 'FILE NAME', size=6.0)
    sh.field('filename', 130, H - 84, _val(doc, 'filename'), size=9.4)
    sh.label(320, H - 84, 'PAGES', size=6.0)
    sh.field('pageCount', 366, H - 84, _val(doc, 'pageCount'), size=9.4)
    sh.label(40, H - 100, 'UPLOADED TO', size=6.0)
    sh.field('uploaded', 130, H - 100, _val(doc, 'uploaded'), size=9.4)

    # Two columns, two rows. avail is generous on height so the portrait A4
    # sub-documents are not scaled down to illegibility next to the cards.
    AVAIL_W, AVAIL_H = 240, 300
    slots = [
        ('passport',       40,  H - 430, 'Document 1 of 4'),
        ('licence',        310, H - 430, 'Document 2 of 4'),
        ('ni-letter',      40,  H - 772, 'Document 3 of 4'),
        ('bank-statement', 310, H - 772, 'Document 4 of 4'),
    ]
    sh.suppress = True
    for doc_id, ox, oy, caption in slots:
        sub = sub_docs[doc_id]
        sw, shh = sub['page']
        scale = min(AVAIL_W / sw, AVAIL_H / shh)
        c.saveState()
        c.translate(ox, oy)
        c.setStrokeColor(RULE)
        c.setLineWidth(0.6)
        c.rect(0, 0, sw * scale, shh * scale, stroke=1, fill=0)
        c.saveState()
        path = c.beginPath()
        path.rect(0, 0, sw * scale, shh * scale)
        c.clipPath(path, stroke=0, fill=0)
        c.scale(scale, scale)
        inner = Sheet(doc_id, sw, shh)
        inner.suppress = True
        inner.c = c                       # draw into the parent canvas
        RENDERERS[sub['kind']](inner, sub, persona)
        c.restoreState()
        c.restoreState()
        c.setFillColor(INK_2)
        c.setFont('Helvetica-Bold', 6.6)
        c.drawString(ox, oy - 11, caption + ' — ' + sub['label'])
    sh.suppress = False

    for doc_id, ox, oy, _ in slots:
        sub = sub_docs[doc_id]
        sw, shh = sub['page']
        scale = min(AVAIL_W / sw, AVAIL_H / shh)
        sh.block('region-' + doc_id, ox, oy, sw * scale, shh * scale)


RENDERERS = {
    'passport': draw_passport,
    'licence': draw_licence,
    'form': draw_form,
    'combined': None,        # needs the sub-documents; handled in build()
}


# -------------------------------------------------------------------- output
def verify(sh, pdf_bytes):
    """Re-open what we just wrote and prove every recorded box really contains
    the text it claims. PyMuPDF's search_for returns top-left-origin points."""
    doc = fitz.open(stream=pdf_bytes, filetype='pdf')
    page = doc[0]
    for name, text, (x0, y0, x1, y1) in sh.checks:
        mine = fitz.Rect(x0, sh.h - y1, x1, sh.h - y0)
        for part in text.split('\n'):
            part = part.strip()
            if not part:
                continue
            hits = page.search_for(part)
            if not hits:
                raise AssertionError(
                    '%s.%s: "%s" is not present in the rendered PDF'
                    % (sh.id, name, part))
            if not any(h.intersects(mine) for h in hits):
                raise AssertionError(
                    '%s.%s: "%s" found at %s but recorded %s'
                    % (sh.id, name, part, hits[0], mine))
    doc.close()


def render_png(pdf_bytes, zoom, colours=PNG_COLOURS):
    doc = fitz.open(stream=pdf_bytes, filetype='pdf')
    pm = doc[0].get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    im = Image.frombytes('RGB', (pm.width, pm.height), pm.samples)
    distinct = len(im.getcolors(maxcolors=1 << 18) or [])
    q = im.quantize(colors=colours, method=Image.Quantize.MEDIANCUT,
                    dither=Image.Dither.NONE)
    out = io.BytesIO()
    q.save(out, 'PNG', optimize=True)
    dims = (pm.width, pm.height)
    doc.close()
    return out.getvalue(), dims, distinct


def js_str(s):
    """Python str -> a literal that is valid JS *and* valid JSON.

    ensure_ascii covers U+2028/U+2029, lone surrogates and all non-ASCII. The
    angle-bracket pass then removes every HTML hazard - </script>, <!--, -->
    - which json.dumps will never escape on its own.
    """
    return (json.dumps(s, ensure_ascii=True, allow_nan=False)
            .replace('<', '\\u003c').replace('>', '\\u003e'))


def js_val(v, ind=1):
    pad = '  ' * ind
    if v is None:
        return 'null'
    if v is True:
        return 'true'
    if v is False:
        return 'false'
    if isinstance(v, str):
        return js_str(v)
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        if v != v or v in (float('inf'), float('-inf')):
            raise ValueError('non-finite number in payload: %r' % v)
        return repr(round(v, 5))
    if isinstance(v, (list, tuple)):
        if not v:
            return '[]'
        if all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in v):
            return '[' + ', '.join(js_val(x) for x in v) + ']'
        body = ',\n'.join(pad + '  ' + js_val(x, ind + 1) for x in v)
        return '[\n' + body + '\n' + pad + ']'
    if isinstance(v, dict):
        if not v:
            return '{}'
        body = ',\n'.join(pad + '  ' + js_str(str(k)) + ': ' + js_val(x, ind + 1)
                          for k, x in v.items())
        return '{\n' + body + '\n' + pad + '}'
    raise TypeError('not serialisable: %s' % type(v))


BANNER = '''/* ==========================================================================
   evidence-boxes.js - GENERATED. DO NOT EDIT.

   Highlight geometry for the specimen evidence documents, plus asset paths and
   raster dimensions. Every box is [left, top, width, height] as a fraction of
   the PNG, top-left origin, ready for CSS position:absolute percentages.

   The field VALUES, the narrative and the confidences are hand-authored in
   assets/js/evidence.js. This file is geometry only, and carries a digest of
   the values it was built from so test/run.js can prove the two agree.

   Regenerate after ANY change to assets/js/evidence.js:
     python3 tools/build-evidence.py
   ========================================================================== */
'''


def write_boxes_js(payload):
    body = BANNER + '(function (X) {\n  \'use strict\';\n\n  var B = '
    body += js_val(payload, 1)
    body += ';\n\n  X.EvidenceBoxes = B;\n})'
    body += '(typeof module !== \'undefined\' ? module.exports : '
    body += '(window.SVS = window.SVS || {}));\n'
    return body


def content_digest(docs):
    """Digest of exactly the inputs that affect the rendered assets."""
    material = []
    for doc_id in sorted(docs):
        fields = docs[doc_id].get('fields', {})
        for name in sorted(fields):
            f = fields[name]
            material.append([doc_id, name, f.get('value'), f.get('lines')])
    blob = json.dumps(material, ensure_ascii=True, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(blob.encode()).hexdigest()[:16]


def load_content():
    out = subprocess.run(
        ['node', '-e',
         'process.stdout.write(JSON.stringify(require(process.argv[1]).Evidence))',
         '--', str(CONTENT)],
        capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def build(check_only=False):
    data = load_content()
    docs, persona = data['docs'], data['persona']
    check_persona(docs, persona)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    payload = {'schema': 1, 'builtFrom': content_digest(docs), 'docs': {}}
    artefacts = {}
    total_png = total_pdf = 0

    for doc_id in docs:
        doc = docs[doc_id]
        sh = Sheet(doc_id, *doc['page'])
        if doc['kind'] == 'combined':
            draw_combined(sh, doc, persona, docs)
        else:
            RENDERERS[doc['kind']](sh, doc, persona)
        pdf = sh.finish()
        verify(sh, pdf)
        png, dims, distinct = render_png(pdf, sh.zoom)

        for name, f in doc['fields'].items():
            if (f.get('value') is None and not f.get('lines')
                    and not f.get('readAs') and name not in sh.derived):
                raise AssertionError(
                    '%s.%s has no value, no lines, no readAs and nothing derived '
                    '- it would render as a blank row' % (doc_id, name))

        missing = set(doc['fields']) - set(sh.boxes)
        extra = set(sh.boxes) - set(doc['fields'])
        if missing:
            raise AssertionError('%s: declared but never drawn: %s'
                                 % (doc_id, ', '.join(sorted(missing))))
        if distinct > 4000:
            print('  ! %s has %d distinct colours - check the palette'
                  % (doc_id, distinct))

        artefacts[OUT_DIR / (doc_id + '.pdf')] = pdf
        artefacts[OUT_DIR / (doc_id + '.png')] = png
        total_pdf += len(pdf)
        total_png += len(png)

        payload['docs'][doc_id] = {
            'pdf': 'assets/evidence/%s.pdf' % doc_id,
            'png': 'assets/evidence/%s.png' % doc_id,
            'px': list(dims),
            'zoom': round(sh.zoom, 5),
            'boxes': {k: sh.boxes[k] for k in doc['fields'] if k in sh.boxes},
            'regions': {k: v for k, v in sh.boxes.items() if k.startswith('region-')},
            'derived': sh.derived,
        }
        if extra - set(payload['docs'][doc_id]['regions']):
            raise AssertionError('%s: recorded boxes with no declared field: %s'
                                 % (doc_id, ', '.join(sorted(extra))))

    # The README is an artefact too: it was twice lost to `rm -rf` on the
    # output directory during testing. The build owns it.
    artefacts[OUT_DIR / 'README.txt'] = (ROOT / 'tools/evidence-README.txt').read_bytes()
    artefacts[BOXES_JS] = write_boxes_js(payload).encode('utf-8')

    if check_only:
        stale = [p for p, b in artefacts.items()
                 if not p.exists() or p.read_bytes() != b]
        if stale:
            for p in stale:
                print('STALE: %s' % p.relative_to(ROOT))
            return 1
        print('all %d artefacts current' % len(artefacts))
        return 0

    for path, blob in artefacts.items():
        path.write_bytes(blob)

    print('built %d specimens  —  %d PDF fields boxed' % (
        len(docs), sum(len(d['boxes']) for d in payload['docs'].values())))
    print('  PDF %.0f KB   PNG %.0f KB   digest %s'
          % (total_pdf / 1024.0, total_png / 1024.0, payload['builtFrom']))
    return 0


if __name__ == '__main__':
    sys.exit(build(check_only='--check' in sys.argv))
