assets/evidence/ — GENERATED SPECIMEN DOCUMENTS
================================================

Everything in this directory is generated. Do not edit these files by hand;
they are overwritten by:

    python3 tools/build-evidence.py

WHAT THESE ARE
--------------
Fictional specimen documents built for the Serco Agentic Vetting demonstrator,
so the Evidence walkthrough (evidence.html) can show what each agent actually
receives at each step of the vetting process.

WHAT THESE ARE NOT
------------------
They are not real candidate evidence. No real person's documents were used,
copied, scanned or referenced in producing them. The candidate, Davinder Kaur,
does not exist; the name is taken from the demonstrator's own fictional name
pool in assets/js/sim/engine.js.

They are also not reproductions of real document artwork. The passport and
driving licence follow the published FIELD LAYOUT and numbering schemes
(ICAO 9303 TD3, and the DVLA photocard field numbers) because that is the part
a vetting audience needs to see. The designs themselves are schematic and drawn
from the Serco brand palette — no Crown copyright artwork, security print,
crest or flag is reproduced.

Every page carries a diagonal "SPECIMEN — NOT A GENUINE DOCUMENT" watermark and
a footer disclaimer, and all identifiers are deliberately non-issuable:

  passport number      500000007      (HMPO specimen range)
  NI number            QQ 12 34 56 C  (QQ is never issued)
  DBS certificate      000000000000
  sort code / account  00-00-00 / 00000000
  employer PAYE ref    000/XX00000

The portrait boxes contain a neutral geometric silhouette, not a photograph of
anyone — not a stock image and not a synthesised face. Signatures are seeded
bezier scribbles, reproducible from a hash of the document id and the fictional
name, and are not any real person's signature.

DERIVED VALUES
--------------
Two things printed on these documents are computed rather than declared, from
the values that ARE declared in assets/js/evidence.js:

  * the passport machine-readable zone, including its ICAO 9303 check digits
  * the DVLA licence number, which encodes the surname, date of birth and sex

They are derived precisely so they cannot disagree with the printed zone. A
hand-typed licence number was wrong once — it decoded to month 43 — and
test/run.js now re-derives both independently in JavaScript to prove they hold.

SOURCE OF TRUTH
---------------
Field values live in assets/js/evidence.js and nowhere else. This build prints
them and records where it printed them; it never invents a value. The generated
assets/js/evidence-boxes.js carries a digest of the values it was built from,
and test/run.js fails if the two drift apart.

Builds are byte-reproducible (reportlab invariant=1, seeded RNG), so
`python3 tools/build-evidence.py --check` is a meaningful CI gate.
