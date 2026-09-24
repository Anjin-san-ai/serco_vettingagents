/* ==========================================================================
   test/run.js — headless tests for the simulation engine.
   Run: node test/run.js
   No dependencies. Uses node:assert.

   These exist to enforce the sim/view boundary MECHANICALLY rather than by
   discipline. The moment someone reaches for a view function or a wall clock
   inside engine.js, sim.purity or sim.golden fails loudly.
   ========================================================================== */
'use strict';

const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

let pass = 0, fail = 0;
const results = [];

function test(name, fn) {
  try { fn(); pass++; results.push(['PASS', name, '']); }
  catch (e) { fail++; results.push(['FAIL', name, e.message]); }
}

// Strip block and line comments, well enough for an identifier scan.
// (Deliberately a line comment: naming a block-comment terminator inside a
// block comment would close it early.)
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

const ENGINE_PATH = path.join(__dirname, '..', 'assets', 'js', 'sim', 'engine.js');
const AGENTS_PATH = path.join(__dirname, '..', 'assets', 'js', 'sim', 'agents.js');

/* ========================================================== sim.purity ===
   Load every sim module with the browser and renderer globals poisoned.
   Anything that touches them throws at require time.                      */
test('sim.purity: engine.js loads with window/document/THREE/Math.random poisoned', () => {
  const src = fs.readFileSync(ENGINE_PATH, 'utf8');
  // Strip comments first: the file's own contract comment names the banned
  // identifiers in order to document the ban, and that must not trip the scan.
  const code = stripComments(src);

  // Static check: the engine must not reference the view or a wall clock.
  const banned = ['THREE', 'document.', 'window.', 'requestAnimationFrame',
                  'performance.now', 'Date.now', 'new Date', 'Math.random'];
  for (const b of banned) {
    // `window.SVS` in the IIFE tail is the one permitted occurrence.
    const occurrences = code.split(b).length - 1;
    const allowed = (b === 'window.') ? 2 : 0;   // window.SVS = window.SVS || {}
    assert.ok(occurrences <= allowed,
      `engine.js references "${b}" ${occurrences} time(s) in code; allowed ${allowed}`);
  }

  // Dynamic check: execute it in a context where the globals are traps.
  const vm = require('node:vm');
  const trap = (n) => new Proxy({}, {
    get() { throw new Error(`engine.js touched ${n}`); },
    set() { throw new Error(`engine.js assigned to ${n}`); }
  });
  const MathSafe = Object.create(Math);
  Object.defineProperty(MathSafe, 'random', {
    get() { throw new Error('engine.js called Math.random'); }
  });
  const sandbox = {
    module: { exports: {} },
    Math: MathSafe,
    Uint8Array, Int32Array, Float32Array, Array, Object, Number, String, Error,
    get window() { return trap('window'); },
    get document() { return trap('document'); },
    get THREE() { return trap('THREE'); },
    get performance() { return trap('performance'); },
    get Date() { return trap('Date'); }
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'engine.js' });
  assert.ok(sandbox.module.exports.Engine, 'Engine was not exported');
});

test('sim.purity: agents.js is pure data (no THREE, no document)', () => {
  const code = stripComments(fs.readFileSync(AGENTS_PATH, 'utf8'));
  // Check for USAGE, not for the word: agent prose legitimately discusses
  // "documents" throughout, this being a document-checking process.
  assert.ok(!code.includes('THREE.'), 'agents.js uses THREE');
  assert.ok(!code.includes('document.'), 'agents.js uses document');
  assert.ok(!/\bnew (Date|Worker)\b/.test(code), 'agents.js is not pure data');
});

/* Load for real now. */
const { Engine } = require(ENGINE_PATH);
const { Agents } = require(AGENTS_PATH);

/* ==================================================== data consistency === */
test('agents.js and engine.js agree on the fleet', () => {
  const dataIds = [Agents.ORCHESTRATOR.id].concat(Agents.RING.map(a => a.id));
  assert.deepStrictEqual(dataIds, Engine.AGENT_IDS,
    'agent id order differs between agents.js and engine.js');
  assert.strictEqual(Engine.AGENT_IDS.length, 11, 'expected 11 agents');
  assert.strictEqual(Agents.RING.length, 10, 'expected 10 ring agents');
});

test('every agent has evidence, systems and a wave', () => {
  for (const a of Agents.all()) {
    assert.ok(a.code, `${a.id} has no code`);
    assert.ok(a.name, `${a.id} has no name`);
    assert.ok(a.job && a.job.length > 20, `${a.id} has no job description`);
    assert.ok(Array.isArray(a.systems) && a.systems.length, `${a.id} has no systems`);
    assert.ok(a.evidence && a.evidence.length > 20, `${a.id} has no evidence`);
    assert.ok(typeof a.wave === 'number', `${a.id} has no wave`);
    for (const k of ['inputs', 'processing', 'outputs', 'guardrails', 'human']) {
      assert.ok(a.detail && a.detail[k], `${a.id} missing detail.${k}`);
    }
  }
});

/* =================================================== determinism/golden ===
   Byte-reproducible from a seed. This is only possible because the engine
   owns a seeded PRNG and never reads a wall clock.                        */
function digest(seed, steps, scenario) {
  const st = Engine.createState(seed);
  Engine.Intents._reset();
  if (scenario) st.scenario = scenario;
  const dt = 1 / 30;
  const h = crypto.createHash('sha256');
  for (let i = 0; i < steps; i++) {
    Engine.step(st, dt);
    if (i % 30 === 0) {
      const m = Engine.metrics(st);
      h.update(`${i}|${m.processed}|${m.pushbacksPrevented}|${m.humanDecisions}|` +
               `${m.guardsFired}|${m.packets}|${st.log.seq}|`);
      h.update(st.agents.map(a => a.state).join(','));
    }
  }
  return { hash: h.digest('hex').slice(0, 16), state: st };
}

test('sim.golden: seed 1337 x 600 steps is reproducible', () => {
  const a = digest(1337, 600);
  const b = digest(1337, 600);
  assert.strictEqual(a.hash, b.hash, 'same seed produced different runs');
  // Record the digest so a future change that alters behaviour is visible.
  results.push(['INFO', 'golden digest (seed 1337)', a.hash]);
});

test('sim.golden: a different seed produces a different run', () => {
  const a = digest(1337, 600).hash;
  const b = digest(99, 600).hash;
  assert.notStrictEqual(a, b, 'different seeds produced identical runs');
});

/* ======================================================= scenarios ====== */
test('sim.scenarios: every scenario completes cases and never deadlocks', () => {
  for (const key of Object.keys(Engine.SCENARIOS)) {
    const st = Engine.createState(4242);
    Engine.Intents._reset();
    st.scenario = key;
    const dt = 1 / 30;
    for (let i = 0; i < 2400; i++) Engine.step(st, dt);   // 80 sim seconds
    const m = Engine.metrics(st);
    assert.ok(m.processed > 0,
      `scenario "${key}" completed no cases in 80 sim seconds (deadlock?)`);
    assert.ok(m.inFlight < 40,
      `scenario "${key}" is accumulating cases (inFlight=${m.inFlight}) — leak`);
  }
});

test('sim.scenarios: live mix completes cases and fires every branch type', () => {
  const st = Engine.createState(20260921);
  Engine.Intents._reset();
  st.scenario = 'live';
  for (let i = 0; i < 6000; i++) Engine.step(st, 1 / 30);
  const m = Engine.metrics(st);
  assert.ok(m.processed > 20, `live mix only processed ${m.processed} cases`);
  assert.ok(m.pushbacksPrevented > 0, 'live mix never prevented a pushback');
  assert.ok(m.humanDecisions > 0, 'live mix never requested a human decision');
  assert.ok(m.guardsFired > 0, 'live mix never fired the ER confidentiality guard');
});

test('sim.scenarios: conviction-declared fires the ER confidentiality guard', () => {
  const st = Engine.createState(7);
  Engine.Intents._reset();
  st.scenario = 'conviction-declared';
  for (let i = 0; i < 1800; i++) Engine.step(st, 1 / 30);
  assert.ok(Engine.metrics(st).guardsFired > 0,
    'the ER guard never fired on the conviction scenario');

  let sawGuard = false, guardText = '';
  Engine.eachEvent(st, 256, (e) => {
    if (e.kind === 'guard') { sawGuard = true; guardText = e.text; }
  });
  assert.ok(sawGuard, 'no guard event was logged');
  assert.ok(/ER|Employment Relations/.test(guardText),
    `guard event text did not mention ER: "${guardText}"`);
});

/* ============================================ human-in-the-loop blocking ==
   The requirement is that a case actually HALTS at a pod. With auto-resume
   off, a hold must persist indefinitely until an intent arrives — and the
   intent path must be the same one a pod click uses.                       */
test('sim.hitl: a hold blocks indefinitely with autoResume off', () => {
  const st = Engine.createState(31337);
  Engine.Intents._reset();
  st.scenario = 'insufficient-id';
  st.autoResume = false;

  let holdAgent = -1;
  for (let i = 0; i < 3000 && holdAgent < 0; i++) {
    Engine.step(st, 1 / 30);
    for (const a of st.agents) {
      if (a.state === Engine.STATES.WAITING_HUMAN) { holdAgent = a.ix; break; }
    }
  }
  assert.ok(holdAgent >= 0, 'no agent ever entered WAITING_HUMAN');

  const heldCase = st.agents[holdAgent].caseId;
  // 60 more sim seconds must not release it.
  for (let i = 0; i < 1800; i++) Engine.step(st, 1 / 30);
  assert.strictEqual(st.agents[holdAgent].state, Engine.STATES.WAITING_HUMAN,
    'hold released without an intent');
  assert.strictEqual(st.agents[holdAgent].caseId, heldCase, 'held case changed');

  // The click path.
  Engine.Intents.enqueue({ type: 'RESUME_HOLD', agent: holdAgent });
  Engine.step(st, 1 / 30);
  assert.notStrictEqual(st.agents[holdAgent].state, Engine.STATES.WAITING_HUMAN,
    'RESUME_HOLD intent did not release the hold');
});

test('sim.hitl: auto-resume uses the identical intent path', () => {
  const st = Engine.createState(31337);
  Engine.Intents._reset();
  st.scenario = 'insufficient-id';
  st.autoResume = true;
  let sawHold = false, sawResume = false;
  for (let i = 0; i < 3000; i++) {
    Engine.step(st, 1 / 30);
    for (const a of st.agents) if (a.state === Engine.STATES.WAITING_HUMAN) sawHold = true;
  }
  Engine.eachEvent(st, 256, (e) => { if (e.kind === 'resume') sawResume = true; });
  assert.ok(sawHold, 'never held');
  assert.ok(sawResume, 'auto-resume never produced a resume event');
});

/* ================================================= pools and allocation == */
test('sim.pools: packet pool never leaks or overruns', () => {
  const st = Engine.createState(555);
  Engine.Intents._reset();
  st.scenario = 'live';
  for (let i = 0; i < 9000; i++) {
    Engine.step(st, 1 / 30);
    assert.ok(st.pLive >= 0 && st.pLive <= Engine.CAP_PACKETS,
      `pLive out of range: ${st.pLive}`);
    assert.ok(st.pFreeN >= 0 && st.pFreeN <= Engine.CAP_PACKETS,
      `pFreeN out of range: ${st.pFreeN}`);
  }
  assert.strictEqual(st.pLive + st.pFreeN, Engine.CAP_PACKETS,
    `packet accounting drifted: live=${st.pLive} free=${st.pFreeN}`);
});

test('sim.pools: SLA and counters stay coherent', () => {
  const st = Engine.createState(808);
  Engine.Intents._reset();
  st.scenario = 'live';
  for (let i = 0; i < 6000; i++) Engine.step(st, 1 / 30);
  const c = st.counters, m = Engine.metrics(st);
  assert.ok(c.slaMet <= c.slaTotal, 'slaMet exceeds slaTotal');
  assert.strictEqual(c.slaTotal, c.processed, 'slaTotal should equal processed');
  assert.ok(m.slaPct >= 0 && m.slaPct <= 100, `slaPct out of range: ${m.slaPct}`);
  assert.ok(m.hoursSaved > 0, 'no hours saved recorded');
});

test('sim.lead: SLA is measured on documented handling time, not animation time', () => {
  const st = Engine.createState(2468);
  Engine.Intents._reset();
  st.scenario = 'happy-path';
  for (let i = 0; i < 6000; i++) Engine.step(st, 1 / 30);
  const m = Engine.metrics(st);
  assert.ok(m.processed > 10, `only processed ${m.processed}`);
  // A clean RTW case is 5 minutes of handling against a 2-hour SLA, so a
  // correctly-modelled clock must attain 100%. Charging packet flight time to
  // the clock produced 0% and is the bug this guards.
  assert.strictEqual(m.slaPct, 100,
    `clean happy-path run attained only ${m.slaPct}% SLA - is animation time being charged?`);
  assert.ok(m.avgCycle < 0.2,
    `avg agent handling ${m.avgCycle.toFixed(3)}h should be ~0.083h (5 min)`);
});

test('sim.lead: held cases show a lead-time saving against the 3-day baseline', () => {
  const st = Engine.createState(1234);
  Engine.Intents._reset();
  st.scenario = 'id-mismatch';
  for (let i = 0; i < 6000; i++) Engine.step(st, 1 / 30);
  const m = Engine.metrics(st);
  assert.ok(m.processed > 5, `only processed ${m.processed}`);
  assert.ok(m.leadDaysSaved > 0,
    'a prevented pushback should save lead time against the 3-day baseline');
  assert.ok(m.avgBaselineLead > m.avgLead,
    `baseline lead ${m.avgBaselineLead.toFixed(1)}h should exceed agentic lead ${m.avgLead.toFixed(1)}h`);
  // SLA is reported on the team's own handling, as Serco do.
  assert.strictEqual(m.slaPct, 100, `SLA ${m.slaPct}% - holds must not be charged to it`);
});

test('sim.routing: hub-and-spoke edge indices are consistent', () => {
  for (let to = 1; to <= 10; to++) {
    const out = Engine.edgeIndex(0, to);
    const back = Engine.edgeIndex(to, 0);
    assert.ok(Engine.edgeIsOutbound(out), `edge 0->${to} not outbound`);
    assert.ok(!Engine.edgeIsOutbound(back), `edge ${to}->0 marked outbound`);
    assert.strictEqual(Engine.edgeTrace(out), Engine.edgeTrace(back),
      `0->${to} and ${to}->0 should share a physical trace`);
    assert.ok(out >= 0 && out < 10, `outbound edge index out of range: ${out}`);
    assert.ok(back >= 10 && back < 20, `inbound edge index out of range: ${back}`);
  }
});

/* ======================================================= evidence.data ===
   The Evidence walkthrough has one structural hazard: a field value edited in
   evidence.js without re-running tools/build-evidence.py leaves the rendered
   PNG showing the old value while the panel shows the new one. The demo still
   WORKS, it is just wrong, and the person who notices is in the audience.

   contentDigest below is deliberately a second, independent implementation of
   the Python one. If they ever disagree, one of them is broken - which is the
   whole point of not sharing the code.                                     */
const EVIDENCE_PATH = path.join(__dirname, '..', 'assets', 'js', 'evidence.js');
const BOXES_PATH = path.join(__dirname, '..', 'assets', 'js', 'evidence-boxes.js');
const { Evidence } = require(EVIDENCE_PATH);
const { EvidenceBoxes } = require(BOXES_PATH);
const { Config } = require(path.join(__dirname, '..', 'assets', 'js', 'config.js'));

function contentDigest(docs) {
  const material = [];
  for (const id of Object.keys(docs).sort()) {
    const fields = docs[id].fields || {};
    for (const n of Object.keys(fields).sort()) {
      const f = fields[n];
      material.push([id, n,
        f.value === undefined ? null : f.value,
        f.lines === undefined ? null : f.lines]);
    }
  }
  return crypto.createHash('sha256')
    .update(JSON.stringify(material)).digest('hex').slice(0, 16);
}

test('evidence.data: generated boxes were built from the current values', () => {
  assert.strictEqual(EvidenceBoxes.builtFrom, contentDigest(Evidence.docs),
    'assets/js/evidence.js has changed since the assets were built. ' +
    'Run: python3 tools/build-evidence.py');
});

test('evidence.data: every step is well formed', () => {
  assert.ok(Evidence.steps.length >= 10, 'expected a substantial walkthrough');
  for (const s of Evidence.steps) {
    for (const k of ['id', 'ref', 'title', 'agent', 'doc', 'highlight',
                     'narrative', 'rules', 'decision', 'stays']) {
      assert.ok(s[k] != null, `step ${s.id} missing ${k}`);
    }
    assert.ok(Array.isArray(s.highlight) && s.highlight.length,
      `step ${s.id} highlights nothing`);
    assert.ok(Array.isArray(s.rules) && s.rules.length,
      `step ${s.id} applies no rules`);
    for (const r of s.rules) {
      assert.ok(r.name && r.detail, `step ${s.id} has an incomplete rule`);
      assert.ok(r.verdict === 'ok' || r.verdict === 'warn',
        `step ${s.id} rule "${r.name}" has verdict ${r.verdict}`);
    }
  }
});

test('evidence.data: every step maps to a real agent and a real state', () => {
  for (const s of Evidence.steps) {
    assert.ok(Agents.byId(s.agent),
      `step ${s.id} names agent "${s.agent}", which is not in the fleet`);
    assert.ok(Config.state[s.decision],
      `step ${s.id} has decision "${s.decision}", not a Config.state key`);
  }
});

test('evidence.data: exactly two steps stop for a human, each with a question', () => {
  const held = Evidence.steps.filter(s => s.decision !== 'DONE');
  assert.strictEqual(held.length, 2,
    `expected 2 steps to stop for a human, found ${held.length}: ` +
    held.map(s => s.id).join(', '));
  for (const s of held) {
    assert.ok(s.humanQuestion, `held step ${s.id} asks no question`);
    assert.ok(s.exception, `held step ${s.id} is not marked as an exception`);
  }
});

test('evidence.data: provenance is declared, and sourced claims are cited', () => {
  for (const s of Evidence.steps) {
    assert.ok(['serco', 'ours', 'proposed'].includes(s.provenance),
      `step ${s.id} has provenance "${s.provenance}"`);
    if (s.provenance === 'serco' || s.provenance === 'proposed') {
      assert.ok(/^\[(WS|VP) p\d+(, ?p\d+)*\]$/.test(s.citation || ''),
        `step ${s.id} is sourced but its citation is "${s.citation}"`);
    }
    for (const r of s.rules) {
      if (r.citation) {
        assert.ok(/^\[(WS|VP) p\d+(, ?p\d+)*\]$/.test(r.citation),
          `step ${s.id} rule "${r.name}" has citation "${r.citation}"`);
      }
    }
  }
});

test('evidence.data: no step highlights a field that was never drawn', () => {
  for (const s of Evidence.steps) {
    const doc = Evidence.docs[s.doc];
    assert.ok(doc, `step ${s.id} references unknown document "${s.doc}"`);
    const geo = EvidenceBoxes.docs[s.doc];
    assert.ok(geo, `no geometry generated for document "${s.doc}"`);
    for (const f of s.highlight) {
      assert.ok(doc.fields[f], `step ${s.id}: ${s.doc}.${f} has no declared value`);
      assert.ok(geo.boxes[f], `step ${s.id}: ${s.doc}.${f} has no generated box`);
    }
  }
});

test('evidence.data: every declared field has a value or a readAs', () => {
  for (const [id, doc] of Object.entries(Evidence.docs)) {
    for (const [n, f] of Object.entries(doc.fields)) {
      assert.ok(f.label, `${id}.${n} has no label`);
      const geo = EvidenceBoxes.docs[id];
      const derived = geo && geo.derived && geo.derived[n] != null;
      assert.ok(f.value != null || f.lines || f.readAs || derived,
        `${id}.${n} would render as a blank row`);
      assert.ok(typeof f.conf === 'number' && f.conf > 0 && f.conf <= 1,
        `${id}.${n} has confidence ${f.conf}`);
    }
  }
});

test('evidence.data: every box is a sane normalised rectangle', () => {
  let n = 0;
  for (const [id, d] of Object.entries(EvidenceBoxes.docs)) {
    assert.ok(Array.isArray(d.px) && d.px.length === 2, `${id} has no raster dims`);
    for (const [k, b] of Object.entries(d.boxes)) {
      assert.ok(Array.isArray(b) && b.length === 4, `${id}.${k} is not a 4-tuple`);
      for (const v of b) {
        assert.ok(typeof v === 'number' && v >= 0 && v <= 1,
          `${id}.${k} has an out-of-range component: ${v}`);
      }
      assert.ok(b[0] + b[2] <= 1.0001, `${id}.${k} overflows the page width`);
      assert.ok(b[1] + b[3] <= 1.0001, `${id}.${k} overflows the page height`);
      assert.ok(b[2] > 0 && b[3] > 0, `${id}.${k} is zero-area`);
      n++;
    }
  }
  assert.ok(n > 100, `expected a box per declared field, got ${n}`);
});

test('evidence.data: the mismatch the page claims is a real diff', () => {
  // Exception 1 asserts that PeopleFirst disagrees with the passport on the
  // date of birth. Prove it from the two documents rather than trusting prose.
  const keyed = Evidence.docs['appian-record'].fields.dob.value;
  const passport = Evidence.docs.passport.fields.dob.value;
  const licence = Evidence.docs.licence.fields.dob.value;
  assert.notStrictEqual(keyed, passport,
    'the ID-vs-Appian exception claims a mismatch, but both documents agree');
  assert.strictEqual(passport, Evidence.persona.dob, 'passport DOB is not the persona DOB');
  assert.strictEqual(keyed, Evidence.persona.dobTyped, 'keyed DOB is not the mis-keyed one');
  // The licence independently corroborates the passport, which the step says.
  const norm = d => d.replace(/[.\s]/g, '').toUpperCase();
  const months = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
                   JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
  const pm = passport.match(/^(\d{2}) ([A-Z]{3}) (\d{4})$/);
  assert.ok(pm, 'passport DOB is not in the expected format');
  assert.strictEqual(norm(licence), pm[1] + months[pm[2]] + pm[3],
    'the licence is supposed to corroborate the passport DOB, and does not');
});

test('evidence.data: every generated artefact exists and is non-empty', () => {
  for (const [id, d] of Object.entries(EvidenceBoxes.docs)) {
    for (const rel of [d.pdf, d.png]) {
      const abs = path.join(__dirname, '..', rel);
      assert.ok(fs.existsSync(abs), `${id}: missing ${rel}`);
      assert.ok(fs.statSync(abs).size > 512, `${id}: ${rel} is suspiciously small`);
    }
  }
});

test('evidence.data: the Evidence tab is present on every page', () => {
  const pages = ['index.html', 'process.html', 'evidence.html', 'agents.html',
                 'simulation.html', 'business-case.html'];
  for (const f of pages) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    const nav = src.match(/<nav class="site-nav"[\s\S]*?<\/nav>/);
    assert.ok(nav, `${f} has no site-nav`);
    assert.ok(nav[0].includes('href="evidence.html"'),
      `${f} nav is missing the Evidence tab`);
    const marked = /href="evidence\.html" aria-current="page"/.test(nav[0]);
    assert.strictEqual(marked, f === 'evidence.html',
      `${f}: aria-current on the Evidence tab should be ${f === 'evidence.html'}`);
  }
});

test('no un-overridden light card sits inside a dark band', () => {
  // band--deep recolours h2/h3/strong/lede for a dark background, but .card,
  // .cards and .callout keep their light backgrounds - so nesting one inside
  // the other yields light text on white. index.html solves this by giving each
  // card a translucent background inline; that is the accepted convention, so
  // only cards WITHOUT such an override are a defect. (Caught exactly this bug
  // in review on a section added to evidence.html.)
  const pages = ['index.html', 'process.html', 'evidence.html', 'agents.html',
                 'simulation.html', 'business-case.html'];
  const OVERRIDDEN = /background\s*:\s*rgba\(255\s*,\s*255\s*,\s*255/;
  for (const f of pages) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    const sections = src.match(/<section[^>]*band--deep[\s\S]*?<\/section>/g) || [];
    for (const sec of sections) {
      for (const tag of sec.match(/<div[^>]*class="[^"]*\bcard\b[^"]*"[^>]*>/g) || []) {
        assert.ok(OVERRIDDEN.test(tag),
          `${f}: a .card inside a band--deep section has no translucent ` +
          'background override, so it renders light text on white: ' + tag.slice(0, 90));
      }
      for (const tag of sec.match(/<div[^>]*class="[^"]*\bcallout\b[^"]*"[^>]*>/g) || []) {
        assert.ok(OVERRIDDEN.test(tag),
          `${f}: a .callout inside a band--deep section has no background ` +
          'override: ' + tag.slice(0, 90));
      }
    }
  }
});

test('no dark-on-dark src-note inside a dark band', () => {
  // .src-note is var(--steel) #46555F. On var(--purple) #1D0743 that is about
  // 1.6:1 - unreadable. It has to be overridden or kept out of a deep band.
  const pages = ['index.html', 'process.html', 'evidence.html', 'agents.html',
                 'simulation.html', 'business-case.html'];
  const offenders = [];
  for (const f of pages) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    for (const sec of src.match(/<section[^>]*band--deep[\s\S]*?<\/section>/g) || []) {
      for (const tag of sec.match(/<p[^>]*class="[^"]*src-note[^"]*"[^>]*>/g) || []) {
        if (!/color\s*:/.test(tag)) { offenders.push(f + ': ' + tag.slice(0, 80)); }
      }
    }
  }
  assert.strictEqual(offenders.length, 0,
    'src-note with no colour override inside a dark band: ' + offenders.join(' | '));
});

test('evidence.js and evidence-view.js stay file://-safe', () => {
  for (const f of ['assets/js/evidence.js', 'assets/js/evidence-boxes.js',
                   'assets/js/evidence-view.js', 'evidence.html']) {
    const src = stripComments(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
    for (const banned of ['fetch(', 'XMLHttpRequest', 'type="module"', 'https://', 'http://']) {
      assert.ok(!src.includes(banned),
        `${f} contains "${banned}" — these pages must run from file://`);
    }
  }
});

/* ============================================ evidence.guide ===
   The Acceptable Document Guide is the authority for which documents Serco
   will accept, for what purpose, and within what window. evidence.js quotes
   clauses from it; these tests prove every quote is real and still current.

   Without this, the acceptability panel would be the same class of hazard as
   the licence-number claim was: authoritative-looking, falsifiable, and wrong.
   The PDF is line-wrapped, so both sides are whitespace-normalised - the text
   is verbatim, the line breaks are a layout artefact.                       */
const GUIDE_PATH = path.join(__dirname, '..', 'process', 'acceptable-documents.txt');

function normalise(t) {
  return String(t).replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ').trim();
}

const GUIDE = normalise(fs.readFileSync(GUIDE_PATH, 'utf8'));

function collectQuotes(A) {
  const out = [];
  const push = (where, clause, page) => {
    if (clause) { out.push({ where, clause, page }); }
  };
  for (const q of A.quality) { push('quality:' + q.name, q.clause, q.page); }
  for (const p of A.probes) {
    push('probe:' + p.id + ':rtw', p.rtw.clause, p.rtw.page);
    push('probe:' + p.id + ':vetting', p.vetting.clause, p.vetting.page);
  }
  push('keyDistinction', A.keyDistinction, A.keyDistinctionPage);
  for (const c of A.certification) { push('certification:' + c.route, c.wording, c.page); }
  for (const g of A.groups) {
    for (const e of g.examples) { push('group:' + g.id, e, g.page); }
  }
  for (const r of A.routes) { push('route:' + r.id, r.need, r.page); }
  return out;
}

test('evidence.guide: the extracted guide is present and looks right', () => {
  assert.ok(GUIDE.length > 4000, 'the extracted guide is suspiciously short');
  assert.ok(GUIDE.includes('Acceptable Document Guide for Hiring Managers'),
    'the extracted text is not the acceptable-documents guide');
  for (let p = 1; p <= 3; p++) {
    assert.ok(GUIDE.includes('PAGE ' + p), `page ${p} is missing from the extract`);
  }
});

test('evidence.guide: every quoted clause appears verbatim in the guide', () => {
  const A = Evidence.acceptability;
  assert.ok(A, 'the acceptability model is not exported');
  const missing = [];
  for (const q of collectQuotes(A)) {
    // Certification wording contains [name]/[date] placeholders, which are in
    // the guide too, so it is matched the same way as everything else.
    if (!GUIDE.includes(normalise(q.clause))) {
      missing.push(q.where + ' → "' + q.clause.slice(0, 60) + '"');
    }
  }
  assert.strictEqual(missing.length, 0,
    missing.length + ' clause(s) quoted on the page do not appear in ' +
    'process/acceptable-documents.txt: ' + missing.join(' | '));
});

test('evidence.guide: every clause is attributed to the page it is on', () => {
  const A = Evidence.acceptability;
  // Split the extract per page so a clause cited as p3 cannot actually be p1.
  const pages = {};
  const parts = fs.readFileSync(GUIDE_PATH, 'utf8').split(/^=+\nPAGE (\d)\n=+$/m);
  for (let i = 1; i < parts.length; i += 2) { pages[parts[i]] = normalise(parts[i + 1]); }
  const wrong = [];
  for (const q of collectQuotes(A)) {
    assert.ok(q.page, q.where + ' cites no page');
    const body = pages[String(q.page)];
    assert.ok(body, q.where + ' cites page ' + q.page + ', which was not extracted');
    if (!body.includes(normalise(q.clause))) {
      const actually = Object.keys(pages)
        .filter(k => pages[k].includes(normalise(q.clause)));
      wrong.push(q.where + ' cites p' + q.page +
        (actually.length ? ' but is on p' + actually.join('/p') : ' and is nowhere'));
    }
  }
  assert.strictEqual(wrong.length, 0, 'mis-cited clauses: ' + wrong.join(' | '));
});

test('evidence.guide: every probe answers both purposes, with a reason', () => {
  const A = Evidence.acceptability;
  assert.ok(A.probes.length >= 10, 'the probe set is too small to be useful');
  const ids = new Set();
  for (const p of A.probes) {
    assert.ok(p.id && p.label && p.asked, `probe ${p.id} is incomplete`);
    assert.ok(!ids.has(p.id), `duplicate probe id "${p.id}"`);
    ids.add(p.id);
    assert.ok(p.consequence, `probe ${p.id} does not say what the agent does`);
    for (const k of ['rtw', 'vetting']) {
      const v = p[k];
      assert.ok(v, `probe ${p.id} has no ${k} verdict`);
      assert.ok(['accepted', 'rejected', 'conditional'].includes(v.verdict),
        `probe ${p.id}.${k} has verdict "${v.verdict}"`);
      assert.ok(v.why && v.why.length > 20, `probe ${p.id}.${k} gives no reason`);
      assert.ok(v.clause, `probe ${p.id}.${k} cites no clause`);
    }
    // Anything refused must tell the manager what to do instead.
    const refused = p.rtw.verdict === 'rejected' && p.vetting.verdict === 'rejected';
    if (refused) {
      assert.ok(p.remedy,
        `probe ${p.id} is refused for both purposes but offers no remedy`);
    }
    // A Group is only meaningful for the vetting purpose.
    if (p.vetting.group) {
      assert.ok(A.groups.some(g => g.name.startsWith(p.vetting.group)),
        `probe ${p.id} cites unknown group "${p.vetting.group}"`);
    }
  }
  // The gas bill is the question that prompted this; it must be answerable.
  const gas = A.probes.find(x => x.id === 'gas-bill');
  assert.ok(gas, 'there is no gas-bill probe');
  assert.strictEqual(gas.rtw.verdict, 'rejected',
    'a utility bill must never be presented as right-to-work evidence');
  assert.strictEqual(gas.vetting.verdict, 'accepted',
    'a recent gas bill IS acceptable Group 2b vetting ID - the guide says so');
});

/* ================================================ evidence.claims ===
   The page states things a reader can check: MRZ check digits, a decoded
   licence number, specific dates and identifiers. A wrong one is worse than a
   vague one, because it looks authoritative and is falsifiable.

   The sweep below caught a real defect: the licence-number rule claimed the
   number "encodes the date of birth" and contained "940314", when the printed
   value decoded to month 43 and contained no 0 at all. It also caught a
   hardcoded MRZ expiry that no document field backed.

   Every check digit and decode here is implemented a SECOND time, in JS, for
   the same reason the builtFrom digest is: a shared implementation cannot
   disagree with itself, so it proves nothing.                               */

function printedValues() {
  const out = [];
  for (const [id, d] of Object.entries(Evidence.docs)) {
    for (const f of Object.values(d.fields)) {
      if (f.value != null) { out.push(String(f.value)); }
      for (const l of (f.lines || [])) { out.push(l); }
    }
    const derived = (EvidenceBoxes.docs[id] || {}).derived || {};
    for (const v of Object.values(derived)) { out.push(String(v)); }
  }
  for (const v of Object.values(Evidence.persona)) {
    if (Array.isArray(v)) { v.forEach(x => out.push(String(x))); }
    else { out.push(String(v)); }
  }
  return out;
}

/* Substring matching against one concatenated blob is too weak, and gave a
   FALSE PASS on the exact defect this test exists for: the claim that the
   licence number contains "940314" matched because the MRZ happens to contain
   "9403143". A digit run must therefore be a whole number within some value,
   not an arbitrary slice of a longer one. */
function isBacked(token, values) {
  const numeric = /^[0-9]+$/.test(token);
  for (const v of values) {
    if (!numeric) {
      if (v.includes(token)) { return true; }
      continue;
    }
    let from = 0;
    for (;;) {
      const i = v.indexOf(token, from);
      if (i < 0) { break; }
      const before = i === 0 ? '' : v[i - 1];
      const after = v[i + token.length] || '';
      if (!/[0-9]/.test(before) && !/[0-9]/.test(after)) { return true; }
      from = i + 1;
    }
  }
  return false;
}

test('evidence.claims: every checkable literal traces to a rendered value', () => {
  const values = printedValues();
  // Identifier-shaped tokens: MRZ/licence-style codes, long digit runs, and
  // dates in either printed form. Prose numbers like "13%" are not matched.
  const RE = /\b(?:[A-Z]{2,}[0-9][A-Z0-9]{3,}|[0-9]{6,}|[0-9]{2}[ .][A-Z]{3}[ .][0-9]{4}|[0-9]{2}\.[0-9]{2}\.[0-9]{4})\b/g;
  const unbacked = [];
  for (const st of Evidence.steps) {
    const texts = [st.narrative, st.impact, st.humanQuestion, st.stays]
      .concat(st.rules.map(r => r.name + ' ' + r.detail))
      .concat((st.edgeCases || []).map(e => e.name + ' ' + e.detail))
      .filter(Boolean);
    for (const t of texts) {
      for (const tok of new Set(t.match(RE) || [])) {
        if (!isBacked(tok, values)) { unbacked.push(`${st.id}: "${tok}"`); }
      }
    }
  }
  assert.ok(unbacked.length === 0,
    unbacked.length + ' literal(s) asserted on the page appear in no document ' +
    'field and in nothing the build derived: ' + unbacked.join('; '));
});

test('evidence.claims: the literal sweep rejects a coincidental substring', () => {
  // Guards the guard. 940314 sits inside the MRZ's "9403143", and the sweep
  // must NOT accept that as backing for a claim about the licence number.
  const mrz = EvidenceBoxes.docs.passport.derived.mrz2;
  assert.ok(mrz.includes('940314'),
    'fixture assumption broken: the MRZ no longer contains 9403143');
  assert.strictEqual(isBacked('940314', [mrz]), false,
    'the sweep accepted a digit run that is only a slice of a longer number');
  assert.strictEqual(isBacked('500000007', ['500000007']), true,
    'the sweep rejected an exact whole-value match');
  assert.strictEqual(isBacked('5000000072', [mrz]), true,
    'the sweep rejected a whole number that is followed by a letter');
});

/* ---- ICAO 9303, reimplemented ---- */
const MRZ_W = [7, 3, 1];
function mrzCheck(s) {
  let t = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const v = ch === '<' ? 0 : (/[0-9]/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 55);
    t += v * MRZ_W[i % 3];
  }
  return String(t % 10);
}
const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
                 JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
function parseDate(text) {
  const t = String(text).trim().toUpperCase();
  if (t.includes('.')) {
    const [d, m, y] = t.split('.');
    return { y: +y, m: +m, d: +d };
  }
  const [d, mon, y] = t.split(/\s+/);
  assert.ok(MONTHS[mon], `unrecognised month in ${text}`);
  return { y: +y, m: MONTHS[mon], d: +d };
}
function yymmdd(text) {
  const { y, m, d } = parseDate(text);
  return String(y % 100).padStart(2, '0') +
         String(m).padStart(2, '0') + String(d).padStart(2, '0');
}

test('evidence.claims: the MRZ agrees with the printed zone, as step 6 says', () => {
  const f = Evidence.docs.passport.fields;
  const derived = EvidenceBoxes.docs.passport.derived;
  const [l1, l2] = [derived.mrz1, derived.mrz2];
  assert.ok(l1 && l2, 'the MRZ was not derived');
  assert.strictEqual(l1.length, 44, 'MRZ line 1 is not 44 characters');
  assert.strictEqual(l2.length, 44, 'MRZ line 2 is not 44 characters');

  // line 1 carries the names printed above it
  assert.ok(l1.startsWith('P<GBR' + f.surname.value + '<<' + f.givenNames.value),
    `MRZ line 1 does not carry the printed names: ${l1}`);

  // line 2 carries the printed number, DOB, sex and expiry, each with a digit
  const num = f.passportNo.value;
  assert.strictEqual(l2.slice(0, 9), num, 'MRZ number is not the printed number');
  assert.strictEqual(l2[9], mrzCheck(num), 'MRZ document-number check digit is wrong');
  assert.strictEqual(l2.slice(10, 13), 'GBR', 'MRZ nationality is not GBR');
  assert.strictEqual(l2.slice(13, 19), yymmdd(f.dob.value),
    'MRZ date of birth does not match the printed date of birth');
  assert.strictEqual(l2[19], mrzCheck(yymmdd(f.dob.value)), 'MRZ DOB check digit is wrong');
  assert.strictEqual(l2[20], f.sex.value, 'MRZ sex does not match the printed sex');
  assert.strictEqual(l2.slice(21, 27), yymmdd(f.expiry.value),
    'MRZ expiry does not match the printed expiry — this was hardcoded once');
  assert.strictEqual(l2[27], mrzCheck(yymmdd(f.expiry.value)), 'MRZ expiry check digit is wrong');
});

test('evidence.claims: the check digit really does adjudicate the transposition', () => {
  // Step 8 claims the keyed number's check digit "gives 6 where the zone reads
  // 2", and therefore that the document is right and the typing is wrong. That
  // is an arithmetic claim, so prove the arithmetic.
  const printed = Evidence.docs.passport.fields.passportNo.value;
  const keyed = Evidence.docs['appian-record'].fields.passportNo.value;
  const mrz = EvidenceBoxes.docs.passport.derived.mrz2;

  assert.notStrictEqual(keyed, printed,
    'the transposition exception claims a mismatch, but the two agree');
  assert.strictEqual(
    keyed.split('').sort().join(''), printed.split('').sort().join(''),
    'the keyed number should be a TRANSPOSITION - same digits, different order');

  const zoneDigit = mrz[9];
  assert.strictEqual(zoneDigit, mrzCheck(printed),
    'the passport is not internally consistent, so the whole argument fails');
  assert.notStrictEqual(mrzCheck(keyed), zoneDigit,
    'the keyed number passes the check digit, so the page cannot claim the ' +
    'check digit identifies it as the error');

  // And the specific digits the page states.
  const claim = Evidence.steps.find(x => x.id === 'reconcile').rules
    .find(r => r.name.includes('check digit'));
  assert.ok(claim, 'the check-digit rule is gone from step 8');
  assert.ok(claim.detail.includes('gives ' + mrzCheck(keyed)),
    `the rule states a check digit for the keyed value that is not ${mrzCheck(keyed)}`);
  assert.ok(claim.detail.includes('zone reads ' + zoneDigit),
    `the rule states a zone check digit that is not ${zoneDigit}`);
});

test('evidence.claims: the licence number decodes to the printed date of birth', () => {
  const num = EvidenceBoxes.docs.licence.derived.licenceNumber;
  assert.ok(num, 'the licence number was not derived');
  assert.strictEqual(num.length, 16, `DVLA numbers are 16 characters, got ${num.length}`);

  const lic = Evidence.docs.licence.fields;
  const { y, m, d } = parseDate(lic.dob.value);
  const sex = Evidence.docs.passport.fields.sex.value;

  assert.strictEqual(num.slice(0, 5), (lic.surname.value + '99999').slice(0, 5),
    'characters 1-5 are not the padded surname');
  assert.strictEqual(num[5], String(y)[2], 'character 6 is not the decade of birth');
  const mon = Number(num.slice(6, 8));
  assert.ok(mon >= 1 && mon <= 62 && !(mon > 12 && mon < 51),
    `characters 7-8 decode to ${mon}, which is not a month (1-12, or 51-62 if female)`);
  assert.strictEqual(mon > 50, sex === 'F',
    'the +50 female flag in characters 7-8 disagrees with the printed sex');
  assert.strictEqual(mon > 50 ? mon - 50 : mon, m,
    'characters 7-8 do not decode to the printed month of birth');
  assert.strictEqual(Number(num.slice(8, 10)), d,
    'characters 9-10 do not decode to the printed day of birth');
  assert.strictEqual(num[10], String(y)[3], 'character 11 is not the final year digit');

  // The old claim. A DVLA number is ordered decade/month/day/year, so it can
  // never contain YYMMDD - asserting that it does was wrong twice over.
  assert.ok(!num.includes(yymmdd(lic.dob.value)),
    'a DVLA number cannot contain a YYMMDD string; the encoding is ' +
    'decade/month/day/year');
});

/* ====================================================== evidence.view ===
   Execute the REAL view code against a minimal DOM, once per step. The data
   tests above prove the data is consistent; only this proves the code that
   walks it does not throw on any of the seventeen steps.                    */
const { install, uninstall } = require('./dom-shim.js');

function runView(hash) {
  const SVS = { Evidence, EvidenceBoxes, Agents, Config };
  const ctx = install(SVS, hash);
  try {
    delete require.cache[require.resolve('../assets/js/evidence-view.js')];
    require('../assets/js/evidence-view.js');
  } finally {
    // leave globals installed for assertions; caller uninstalls
  }
  return ctx;
}

test('evidence.view: boots, and reports ready rather than failing', () => {
  const ctx = runView('');
  try {
    assert.strictEqual(ctx.byId['ev-app'].getAttribute('data-ev-ready'), 'yes',
      'the view did not report ready: ' + ctx.byId['ev-boot-why'].textContent);
    assert.ok(ctx.byId['ev-boot'].hidden, 'the boot error box was revealed');
    const tabs = ctx.byId['ev-app'].querySelectorAll('.ev-tab');
    assert.strictEqual(tabs.length, Evidence.steps.length,
      'the step rail does not have one tab per step');
  } finally { uninstall(); }
});

test('evidence.view: every step renders without throwing', () => {
  for (let i = 0; i < Evidence.steps.length; i++) {
    const st = Evidence.steps[i];
    const ctx = runView('#step-' + st.id);
    try {
      const app = ctx.byId['ev-app'];
      assert.strictEqual(app.getAttribute('data-ev-ready'), 'yes',
        `step ${st.id} failed to boot`);

      // the selected tab is the one we deep-linked to
      const tabs = app.querySelectorAll('.ev-tab');
      const selected = tabs.map((t, k) => [k, t.getAttribute('aria-selected')])
        .filter(x => x[1] === 'true');
      assert.strictEqual(selected.length, 1,
        `step ${st.id}: expected exactly 1 selected tab, got ${selected.length}`);
      assert.strictEqual(selected[0][0], i,
        `#step-${st.id} selected tab ${selected[0][0]}, expected ${i}`);

      // one extraction row per highlighted field, and none of them blank
      const rows = app.querySelectorAll('.ev-row');
      assert.strictEqual(rows.length, st.highlight.length,
        `step ${st.id}: ${rows.length} rows for ${st.highlight.length} highlights`);
      for (const r of rows) {
        const v = r.querySelector('.ev-row-v');
        assert.ok(v && v.textContent.trim(),
          `step ${st.id}: a row rendered with no value`);
      }

      // one rule card per rule, and one overlay box per highlighted field
      assert.strictEqual(app.querySelectorAll('.ev-rule').length, st.rules.length,
        `step ${st.id}: rule count mismatch`);
      assert.strictEqual(app.querySelectorAll('.ev-hl').length, st.highlight.length,
        `step ${st.id}: overlay box count mismatch`);

      // The decision pill carries the state - except for a gated step with an
      // unresolved dependency, which must show WAITING_HUMAN and say why.
      const pill = app.querySelector('.case-pill');
      assert.ok(pill, `step ${st.id}: no decision pill`);
      const gated = !!st.dependsOn;
      assert.strictEqual(pill.getAttribute('data-state'),
        gated ? 'WAITING_HUMAN' : st.decision,
        `step ${st.id}: pill state mismatch`);
      if (gated) {
        assert.ok(app.querySelector('.ev-blocked'),
          `step ${st.id} is gated but rendered no blocked panel`);
        // and it must not display values that only exist post-approval
        for (const key of (st.dependsOn.affects || [])) {
          const row = app.querySelectorAll('.ev-row')
            .find(r => r.getAttribute('data-field') === key);
          assert.ok(row, `step ${st.id}: affected field ${key} is not shown`);
          assert.strictEqual(row.getAttribute('data-pending'), 'yes',
            `step ${st.id}: ${key} is not marked pending while the gate is open`);
          const shown = row.querySelector('.ev-row-v').textContent;
          assert.notStrictEqual(shown, Evidence.docs[st.doc].fields[key].value,
            `step ${st.id}: ${key} displays the approved value before approval`);
        }
      }

      // held steps must actually show the question
      const q = app.querySelector('.ev-question');
      if (st.humanQuestion) {
        assert.ok(q && q.textContent.includes(st.humanQuestion.slice(0, 30)),
          `step ${st.id}: the human question was not rendered`);
      } else {
        assert.ok(!q, `step ${st.id}: rendered a question callout with no question`);
      }

      // the image points at the generated PNG for this step's document
      const img = app.querySelector('img');
      assert.ok(img, `step ${st.id}: no document image`);
      assert.strictEqual(img.attrs.src, EvidenceBoxes.docs[st.doc].png,
        `step ${st.id}: image src does not match the generated asset`);
      assert.ok(img.attrs.alt && img.attrs.alt.length > 20,
        `step ${st.id}: image has no useful alt text`);
    } finally { uninstall(); }
  }
});

test('evidence.view: the combination matrix renders and marks this candidate', () => {
  const ctx = runView('');
  try {
    const mount = ctx.byId['ev-combinations'];
    const C = Evidence.combinations;
    assert.ok(mount.childElementCount, 'the combination matrix did not render');

    const rows = mount.querySelectorAll('tr');
    // one header row plus one per circumstance
    assert.strictEqual(rows.length, C.rows.length + 1,
      'the matrix does not have one row per circumstance');
    const flagged = rows.filter(r => r.getAttribute('data-this') === 'yes');
    assert.strictEqual(flagged.length, 1,
      'exactly one row should be marked as the candidate’s own circumstance');

    // every document that arrived is listed, and exactly one is load-bearing
    const items = mount.querySelectorAll('.ev-sent-item');
    assert.strictEqual(items.length, C.sent.length,
      'not every submitted document is accounted for');
    assert.strictEqual(items.filter(i => i.getAttribute('data-load') === 'yes').length, 1,
      'exactly one of the four documents should be load-bearing');

    const text = mount.textContent;
    assert.ok(text.includes(C.verdict.slice(0, 30)), 'the verdict is missing');
  } finally { uninstall(); }
});

test('evidence.data: the matrix is attributed to Cognizant, not to Serco', () => {
  // The Serco documents contain no List A/B breakdown, so presenting this as
  // sourced from them would be exactly the overstatement the page warns about.
  const C = Evidence.combinations;
  assert.strictEqual(C.provenance, 'ours',
    'the combination matrix must be labelled as Cognizant-supplied');
  assert.ok(/NOT the Serco/i.test(C.source),
    'the matrix source line must say plainly that it is not from the Serco documents');
  assert.ok(!/\[(WS|VP) p\d+\]/.test(JSON.stringify(C)),
    'the matrix cites a Serco page reference for policy those documents do not contain');
  assert.ok(C.rows.filter(r => r.thisCandidate).length === 1,
    'exactly one circumstance should be marked as this candidate’s');
  assert.ok(C.sent.filter(x => x.loadBearing).length === 1,
    'exactly one submitted document should be load-bearing');
  for (const x of C.sent) {
    assert.ok(Evidence.docs[x.doc], `the matrix names unknown document "${x.doc}"`);
  }
});

test('evidence.data: edge cases are complete and labelled by provenance', () => {
  let total = 0;
  for (const st of Evidence.steps) {
    for (const e of (st.edgeCases || [])) {
      total++;
      assert.ok(e.name && e.detail, `${st.id} has an incomplete edge case`);
      assert.ok(['serco', 'ours'].includes(e.provenance),
        `${st.id} edge case "${e.name}" has provenance "${e.provenance}"`);
      if (e.provenance === 'serco') {
        assert.ok(/^\[(WS|VP) p\d+(, ?p\d+)*\]$/.test(e.citation || ''),
          `${st.id} edge case "${e.name}" claims a Serco source but cites "${e.citation}"`);
      } else {
        assert.ok(!e.citation,
          `${st.id} edge case "${e.name}" is Cognizant design but carries a citation`);
      }
    }
  }
  assert.ok(total >= 12, `expected a substantial edge-case catalogue, got ${total}`);
});

test('evidence.view: the gate blocks until a human answers it', () => {
  const dep = Evidence.steps.find(x => x.dependsOn);
  assert.ok(dep, 'no step depends on a human decision any more');
  const ctx = runView('#step-' + dep.id);
  try {
    const app = ctx.byId['ev-app'];
    // Cold: blocked, WAITING_HUMAN, and it names the step it waits on.
    const blocked = app.querySelector('.ev-blocked');
    assert.ok(blocked, 'the dependent step did not render blocked');
    const link = app.querySelector('.ev-blocked-link');
    assert.ok(link && link.getAttribute('href') === '#step-' + dep.dependsOn.step,
      'the blocked panel does not link to the step it is waiting on');
    assert.strictEqual(
      app.querySelector('.case-pill').getAttribute('data-state'), 'WAITING_HUMAN');
    // It must NOT be showing the corrected values as though approved.
    assert.ok(!app.querySelector('.ev-decision.is-on .case-pill[data-state="DONE"]'),
      'the gated step reported DONE while its gate was unresolved');
  } finally { uninstall(); }
});

test('evidence.view: answering the gate resumes the dependent step', () => {
  const held = Evidence.steps.find(x => x.hitl && x.hitl.answers.some(a => a.kind === 'resume'));
  const dep = Evidence.steps.find(x => x.dependsOn && x.dependsOn.step === held.id);
  assert.ok(dep, 'the resume answer unblocks nothing');
  const ctx = runView('#step-' + held.id);
  try {
    const app = ctx.byId['ev-app'];
    const panel = app.querySelector('.ev-hitl');
    assert.ok(panel, 'the held step rendered no HITL panel');
    assert.strictEqual(panel.getAttribute('data-answered'), 'no');

    // every allowed answer is offered as a real button
    const btns = app.querySelectorAll('.ev-answer');
    assert.strictEqual(btns.length, held.hitl.answers.length,
      'not every allowed answer is offered');

    // the log shows the guard firing before any human has answered
    const kinds = app.querySelectorAll('.trust-log-row')
      .map(r => r.className.replace(/.*trust-log-row--/, '').split(' ')[0]);
    assert.ok(kinds[0].includes('guard'), 'the log does not open with the guard');

    // answer it the unblocking way
    const want = dep.dependsOn.answer;
    const btn = btns.find(b => b.getAttribute('data-answer') === want);
    assert.ok(btn, `no button offers the unblocking answer "${want}"`);
    btn.dispatch('click');

    // the held step now shows it was decided, with a human row in the log
    const after = app.querySelector('.ev-hitl');
    assert.strictEqual(after.getAttribute('data-answered'), 'yes',
      'the panel did not record the answer');
    // The kind is uppercased by CSS, not in the text, so match case-insensitively.
    // The dependent step must now show the real values, no longer pending.
    ctx.win.location.hash = '#step-' + dep.id;
    for (const fn of (ctx.win.listeners.hashchange || [])) { fn(); }
    assert.ok(!app.querySelector('.ev-blocked'),
      'the dependent step is still blocked after the gate was cleared');
    for (const key of (dep.dependsOn.affects || [])) {
      const row = app.querySelectorAll('.ev-row')
        .find(r => r.getAttribute('data-field') === key);
      assert.ok(row, `dependent step does not show ${key}`);
      assert.ok(!row.getAttribute('data-pending'),
        `${key} is still marked pending after the gate cleared`);
      assert.strictEqual(row.querySelector('.ev-row-v').textContent,
        Evidence.docs[dep.doc].fields[key].value,
        `${key} does not show the approved value after approval`);
    }
    assert.strictEqual(
      app.querySelector('.case-pill').getAttribute('data-state'), dep.decision,
      'the dependent step did not reach its own decision state');

    // back to the held step to inspect its log
    ctx.win.location.hash = '#step-' + held.id;
    for (const fn of (ctx.win.listeners.hashchange || [])) { fn(); }
    const logText = app.querySelector('.trust-log').textContent;
    assert.ok(/human/i.test(logText), 'no human row was written to the decision log');
    assert.ok(/resume/i.test(logText), 'no resume row was written to the decision log');
    const rowKinds = app.querySelectorAll('.trust-log-row')
      .map(r => (r.className.match(/trust-log-row--(\w+)/) || [])[1]);
    assert.strictEqual(rowKinds[0], 'guard',
      'the decision log must open with the guard that caused the hold');
    assert.ok(rowKinds.includes('human'), 'no human-kind row in the log');
    assert.ok(rowKinds.indexOf('human') < rowKinds.lastIndexOf('resume'),
      'the log shows the case resuming before a human decided');
  } finally { uninstall(); }
});

test('evidence.view: rejecting the gate leaves the dependent step blocked', () => {
  const held = Evidence.steps.find(x => x.hitl && x.hitl.answers.some(a => a.downstream));
  const dep = Evidence.steps.find(x => x.dependsOn && x.dependsOn.step === held.id);
  const other = held.hitl.answers.find(a => a.id !== dep.dependsOn.answer && a.downstream);
  assert.ok(other, 'no answer exists that should leave the dependent step blocked');
  const ctx = runView('#step-' + held.id);
  try {
    const app = ctx.byId['ev-app'];
    app.querySelectorAll('.ev-answer')
      .find(b => b.getAttribute('data-answer') === other.id).dispatch('click');
    // now open the dependent step
    ctx.win.location.hash = '#step-' + dep.id;
    for (const fn of (ctx.win.listeners.hashchange || [])) { fn(); }
    const blocked = app.querySelector('.ev-blocked');
    assert.ok(blocked, 'the dependent step is no longer blocked after a rejection');
    assert.ok(blocked.textContent.includes(other.downstream.slice(0, 30)),
      'the blocked panel does not explain the consequence of the answer given');
    assert.strictEqual(
      app.querySelector('.case-pill').getAttribute('data-state'), 'WAITING_HUMAN');
  } finally { uninstall(); }
});

test('evidence.view: Reset decisions returns the gate to unanswered', () => {
  const held = Evidence.steps.find(x => x.hitl);
  const ctx = runView('#step-' + held.id);
  try {
    const app = ctx.byId['ev-app'];
    app.querySelectorAll('.ev-answer')[0].dispatch('click');
    assert.strictEqual(app.querySelector('.ev-hitl').getAttribute('data-answered'), 'yes');
    app.querySelectorAll('.ev-btn').find(b => b.textContent === 'Reset decisions')
      .dispatch('click');
    assert.strictEqual(app.querySelector('.ev-hitl').getAttribute('data-answered'), 'no',
      'Reset decisions did not clear the recorded answer');
    assert.ok(app.querySelectorAll('.ev-answer').length,
      'the answer buttons did not come back after a reset');
  } finally { uninstall(); }
});

test('evidence.data: every HITL block is complete and internally consistent', () => {
  for (const st of Evidence.steps) {
    if (!st.hitl) { continue; }
    const h = st.hitl;
    for (const k of ['askedOf', 'askedOfRole', 'why', 'guard', 'conflicts', 'answers']) {
      assert.ok(h[k], `${st.id}.hitl is missing ${k}`);
    }
    assert.ok(h.answers.length >= 2, `${st.id} offers fewer than two answers`);
    assert.ok(h.answers.some(a => a.kind === 'resume'),
      `${st.id} offers no answer that lets the case proceed`);
    const ids = new Set();
    for (const a of h.answers) {
      assert.ok(a.id && a.label && a.outcome, `${st.id} has an incomplete answer`);
      assert.ok(!ids.has(a.id), `${st.id} has duplicate answer id "${a.id}"`);
      ids.add(a.id);
      assert.ok(['resume', 'reject', 'escalate'].includes(a.kind),
        `${st.id}.${a.id} has kind "${a.kind}"`);
      assert.ok(Array.isArray(a.log) && a.log.length,
        `${st.id}.${a.id} writes nothing to the decision log`);
      for (const l of a.log) {
        assert.ok(['human', 'resume', 'escalate', 'guard'].includes(l.kind),
          `${st.id}.${a.id} logs an unknown row kind "${l.kind}"`);
        assert.ok(l.text, `${st.id}.${a.id} has a log row with no text`);
      }
      assert.ok(a.log.some(l => l.kind === 'human'),
        `${st.id}.${a.id} does not record that a human decided`);
    }
    // Every conflict must name the keyed value and at least one document that
    // contradicts it, and those documents must exist and actually say that.
    for (const c of h.conflicts) {
      assert.ok(c.field && c.keyed && c.keyedFrom, `${st.id} has an incomplete conflict`);
      assert.ok(c.evidence && c.evidence.length,
        `${st.id} conflict "${c.field}" cites no evidence`);
      for (const e of c.evidence) {
        const d = Evidence.docs[e.doc];
        assert.ok(d, `${st.id} conflict cites unknown document "${e.doc}"`);
        const printed = Object.values(d.fields)
          .some(f => f.value === e.value || (f.lines || []).includes(e.value));
        assert.ok(printed,
          `${st.id} conflict claims ${e.doc} reads "${e.value}", but no field on ` +
          'that document prints it');
      }
    }
  }
  // Every dependency must point at a real step and a real answer of it.
  for (const st of Evidence.steps) {
    if (!st.dependsOn) { continue; }
    const dep = Evidence.steps.find(x => x.id === st.dependsOn.step);
    assert.ok(dep, `${st.id} depends on unknown step "${st.dependsOn.step}"`);
    assert.ok(dep.hitl, `${st.id} depends on ${dep.id}, which has no human gate`);
    assert.ok(dep.hitl.answers.some(a => a.id === st.dependsOn.answer),
      `${st.id} waits for answer "${st.dependsOn.answer}", which ${dep.id} never offers`);
    assert.ok(st.blocked, `${st.id} is gated but has no blocked-state copy`);
  }
});

test('evidence.view: first paint is instant, not waiting on a timer', () => {
  // A workshop page must never open blank. select(_, true) should have every
  // row, rule and decision already revealed before any timer fires.
  const ctx = runView('');
  try {
    const app = ctx.byId['ev-app'];
    for (const sel of ['.ev-row', '.ev-rule', '.ev-decision', '.ev-hl']) {
      const nodes = app.querySelectorAll(sel);
      assert.ok(nodes.length, `nothing matched ${sel} on first paint`);
      for (const n of nodes) {
        assert.ok(n.classList.contains('is-on'),
          `${sel} was not revealed on first paint`);
      }
    }
  } finally { uninstall(); }
});

test('evidence.view: Show everything renders all steps statically', () => {
  const ctx = runView('');
  try {
    const app = ctx.byId['ev-app'];
    const btn = app.querySelectorAll('.ev-btn')
      .find(b => b.textContent === 'Show everything');
    assert.ok(btn, 'no Show everything control');
    btn.dispatch('click');
    assert.strictEqual(btn.getAttribute('aria-pressed'), 'true');
    const all = app.querySelectorAll('.ev-all-step');
    assert.strictEqual(all.length, Evidence.steps.length,
      'Show everything did not render one section per step');
    // and every rule text is present, so the static view is the full record
    const text = app.querySelector('.ev-all').textContent;
    for (const st of Evidence.steps) {
      assert.ok(text.includes(st.title), `Show everything omitted "${st.title}"`);
      for (const r of st.rules) {
        assert.ok(text.includes(r.name),
          `Show everything omitted rule "${r.name}"`);
      }
    }
    btn.dispatch('click');
    assert.strictEqual(btn.getAttribute('aria-pressed'), 'false',
      'Show everything did not toggle back');
  } finally { uninstall(); }
});

test('evidence.view: reduced motion reveals everything at once', () => {
  // Playback is decoration - the information is in the panel either way. Under
  // reduced motion the sequence must be skipped, not merely sped up.
  const ctx = install({ Evidence, EvidenceBoxes, Agents, Config }, '');
  try {
    ctx.doc.body.setAttribute('data-motion', 'reduce');
    delete require.cache[require.resolve('../assets/js/evidence-view.js')];
    require('../assets/js/evidence-view.js');
    const app = ctx.byId['ev-app'];
    const play = app.querySelectorAll('.ev-btn')
      .find(b => b.textContent.indexOf('Play') === 0 || b.textContent.indexOf('Replay') === 0);
    assert.ok(play, 'no play control');
    play.dispatch('click');
    // Straight after the click, with no timer having fired, all of it is on.
    for (const sel of ['.ev-row', '.ev-rule', '.ev-decision']) {
      const nodes = app.querySelectorAll(sel);
      assert.ok(nodes.length, `nothing matched ${sel}`);
      for (const n of nodes) {
        assert.ok(n.classList.contains('is-on'),
          `${sel} was staged behind a timer under reduced motion`);
      }
    }
    assert.strictEqual(play.textContent, 'Replay step',
      'the play button was left saying it is still playing');
  } finally { uninstall(); }
});

test('evidence.view: the acceptability checker renders all probes', () => {
  const ctx = runView('');
  try {
    const mount = ctx.byId['ev-acceptability'];
    assert.ok(mount, '#ev-acceptability mount not found in DOM');
    const tabs = mount.querySelectorAll('.ev-acc-tab');
    assert.strictEqual(tabs.length, Evidence.acceptability.probes.length,
      'probe rail should have one tab per probe');
    // All probes have a vtag for RTW and for vetting
    for (const tab of tabs) {
      const vtags = tab.querySelectorAll('.ev-acc-vtag');
      assert.strictEqual(vtags.length, 2, 'each probe tab needs two verdict tags');
    }
  } finally { uninstall(); }
});

test('evidence.view: acceptability pane shows RTW and vetting columns', () => {
  const ctx = runView('');
  try {
    const pane = ctx.byId['ev-acceptability'].querySelector('.ev-acc-pane');
    assert.ok(pane, 'no .ev-acc-pane rendered');
    const cols = pane.querySelectorAll('.ev-acc-col');
    assert.strictEqual(cols.length, 2,
      'the split should show exactly two verdict columns');
    // Both columns carry a data-v attribute
    for (const col of cols) {
      const v = col.getAttribute('data-v');
      assert.ok(['accepted', 'rejected', 'conditional'].includes(v),
        'column data-v must be a known verdict, got: ' + v);
    }
  } finally { uninstall(); }
});

test('evidence.view: gas bill shows rejected RTW and accepted vetting', () => {
  const ctx = runView('');
  try {
    const mount = ctx.byId['ev-acceptability'];
    const tabs = mount.querySelectorAll('.ev-acc-tab');
    const gasIdx = Evidence.acceptability.probes.findIndex(p => p.id === 'gas-bill');
    assert.ok(gasIdx >= 0, 'gas-bill probe not found');
    // Click the gas bill tab
    tabs[gasIdx].dispatch('click');
    const pane = mount.querySelector('.ev-acc-pane');
    const cols = pane.querySelectorAll('.ev-acc-col');
    assert.strictEqual(cols[0].getAttribute('data-v'), 'rejected',
      'RTW column should be rejected for a gas bill');
    assert.strictEqual(cols[1].getAttribute('data-v'), 'accepted',
      'vetting column should be accepted for a recent gas bill');
    // Clause is quoted
    const clauses = pane.querySelectorAll('.ev-acc-clause');
    assert.strictEqual(clauses.length, 2, 'each column needs a clause blockquote');
  } finally { uninstall(); }
});

test('evidence.view: acceptability first probe is pre-selected on boot', () => {
  const ctx = runView('');
  try {
    const mount = ctx.byId['ev-acceptability'];
    const tabs = mount.querySelectorAll('.ev-acc-tab');
    assert.strictEqual(tabs[0].getAttribute('aria-selected'), 'true',
      'first probe tab should be selected on boot');
    const rest = Array.from(tabs).slice(1).every(t => t.getAttribute('aria-selected') === 'false');
    assert.ok(rest, 'only the first tab should start selected');
  } finally { uninstall(); }
});

test('evidence.view: a missing generated file reports how to fix it', () => {
  const ctx = install({ Evidence, Agents, Config }, '');   // no EvidenceBoxes
  try {
    delete require.cache[require.resolve('../assets/js/evidence-view.js')];
    require('../assets/js/evidence-view.js');
    assert.strictEqual(ctx.byId['ev-app'].getAttribute('data-ev-ready'), 'failed');
    assert.strictEqual(ctx.byId['ev-boot'].hidden, false,
      'the boot error box stayed hidden');
    assert.ok(ctx.byId['ev-boot-why'].textContent.includes('build-evidence.py'),
      'the failure message does not say how to fix it');
  } finally { uninstall(); }
});

/* ---------------------------------------------------------------- report */
const W = Math.max(...results.map(r => r[1].length));
for (const [status, name, msg] of results) {
  const tag = status === 'PASS' ? '  ok  ' : status === 'INFO' ? ' info ' : ' FAIL ';
  console.log(`${tag} ${name.padEnd(W)} ${msg}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
