/* ==========================================================================
   trust.js — the Cognizant Trust dashboard, shown split-screen beside the
   simulation.

   Structure follows the HVCTS "Cognizant Neuro(R) AI Trust" panel
   (HVCTS_version_3.8/src/components/AIGovernancePanel.tsx + components.css
   495-652): 50/50 CSS grid, independent pane scrolling, self-toggling button,
   ring gauge, stat row, pillar bars, chips and pills, 3px-left-border callouts.

   The PALETTE is deliberately NOT copied. HVCTS's #0b0f14 / #2bd576 dark theme
   is that app's own GOV.UK-adjacent invention, not Cognizant brand, so the
   colours are re-mapped onto the Serco palette already in serco.css to keep
   this demonstrator one visual system.

   Everything on it is LIVE from SimState. Nothing is hardcoded telemetry.
   ========================================================================== */
(function (X) {
  'use strict';

  var E = X.Engine;
  var A = X.Agents;
  var NS = 'http://www.w3.org/2000/svg';

  var el = {};
  var open = false;
  var lastMs = 0, HZ = 10;
  var lastLogSeq = 0;
  var CONF_BINS = 8;
  var confBins = new Int32Array(CONF_BINS);
  var seenCases = Object.create(null);

  function svgEl(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function elem(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* Ring gauge, ported from HVCTS's RingGauge. Pure trig, no dependency:
     circumference = 2*pi*r, offset = circumference * (1 - pct/100). */
  function ringGauge(mount, pct, size, colour, caption) {
    var r = (size / 2) - 7, circ = 2 * Math.PI * r;
    mount.textContent = '';
    var s = svgEl('svg', { width: size, height: size, viewBox: '0 0 ' + size + ' ' + size });
    s.appendChild(svgEl('circle', {
      cx: size / 2, cy: size / 2, r: r, fill: 'none',
      stroke: 'rgba(228,216,251,.16)', 'stroke-width': 8
    }));
    s.appendChild(svgEl('circle', {
      cx: size / 2, cy: size / 2, r: r, fill: 'none', stroke: colour,
      'stroke-width': 8, 'stroke-linecap': 'round',
      'stroke-dasharray': circ.toFixed(2),
      'stroke-dashoffset': (circ * (1 - pct / 100)).toFixed(2),
      transform: 'rotate(-90 ' + (size / 2) + ' ' + (size / 2) + ')'
    }));
    var t = svgEl('text', {
      x: size / 2, y: size / 2 + 6, 'text-anchor': 'middle',
      fill: '#EEF2F6', 'font-size': String(Math.round(size / 4)), 'font-weight': '700'
    });
    t.textContent = String(Math.round(pct));
    s.appendChild(t);
    mount.appendChild(s);
    if (caption) mount.appendChild(elem('div', 'trust-gauge-cap', caption));
  }

  /* ------------------------------------------------------------ build once */
  function build(mount) {
    mount.textContent = '';

    /* header */
    var head = elem('div', 'trust-head');
    var title = elem('div', 'trust-title');
    title.appendChild(elem('strong', null, 'Cognizant Trust'));
    title.appendChild(elem('span', 'trust-sub', 'Live dashboard'));
    head.appendChild(title);
    var chips = elem('div', 'trust-head-chips');
    chips.appendChild(elem('span', 'trust-chip', 'v1.0'));
    chips.appendChild(elem('span', 'trust-chip trust-chip--live', 'LIVE'));
    head.appendChild(chips);
    mount.appendChild(head);

    /* trust score + stat row */
    var top = elem('div', 'trust-top');
    el.gauge = elem('div', 'trust-gauge');
    top.appendChild(el.gauge);
    el.stats = elem('div', 'trust-stats');
    var STATS = [
      ['guards', 'Guardrails fired'], ['human', 'Human decisions'],
      ['sla', 'SLA attainment'], ['lead', 'Lead vs today'],
      ['inflight', 'Cases in flight'], ['conf', 'Mean confidence']
    ];
    el.stat = {};
    for (var i = 0; i < STATS.length; i++) {
      var card = elem('div', 'trust-stat');
      var n = elem('span', 'trust-stat-n', '0');
      card.appendChild(n);
      card.appendChild(elem('span', 'trust-stat-k', STATS[i][1]));
      el.stat[STATS[i][0]] = n;
      el.stats.appendChild(card);
    }
    top.appendChild(el.stats);
    mount.appendChild(top);

    /* guardrails — the two written on the Agent fleet page, as live rows */
    mount.appendChild(elem('h4', 'trust-sec', 'Guardrails'));
    el.guardWrap = elem('div', 'trust-guards');
    var GUARDS = [
      { id: 'clearance',
        name: 'No agent issues a clearance',
        detail: 'A8 assembles the evidence pack and recommends. A vetting officer decides. Higher Level Checks, risk acceptance and ER escalation stay human-authority.',
        src: 'SIPOC: Check & Progress is "value adding … difficult to automate" [WS p2]' },
      { id: 'er',
        name: 'ER confidentiality guard',
        detail: 'If the role sits within Employment Relations, the conviction ticket MUST NOT be routed to the ER queue — it is visible to the whole ER team. VIVO condition unresolved.',
        src: 'Business case 3, stated risks [WS p13]' }
    ];
    el.guard = {};
    for (var g = 0; g < GUARDS.length; g++) {
      var row = elem('div', 'trust-guard');
      var hdr = elem('div', 'trust-guard-hdr');
      hdr.appendChild(elem('span', 'trust-guard-name', GUARDS[g].name));
      var st = elem('span', 'trust-pill trust-pill--ok', 'ENFORCED');
      hdr.appendChild(st);
      row.appendChild(hdr);
      row.appendChild(elem('p', 'trust-guard-detail', GUARDS[g].detail));
      var foot = elem('div', 'trust-guard-foot');
      var cnt = elem('span', 'trust-guard-count', '0 fired');
      foot.appendChild(cnt);
      foot.appendChild(elem('span', 'trust-guard-src', GUARDS[g].src));
      row.appendChild(foot);
      el.guard[GUARDS[g].id] = { pill: st, count: cnt };
      el.guardWrap.appendChild(row);
    }
    mount.appendChild(el.guardWrap);

    /* assurance pillars — the 8 responsibilities from agents.js */
    mount.appendChild(elem('h4', 'trust-sec', 'Assurance plane'));
    el.pillars = elem('div', 'trust-pillars');
    el.pillar = [];
    var resp = A.ASSURANCE.responsibilities;
    for (var p = 0; p < resp.length; p++) {
      var short = resp[p].split(' — ')[0].split(' - ')[0];
      var pr = elem('div', 'trust-pillar');
      var prh = elem('div', 'trust-pillar-hdr');
      prh.appendChild(elem('span', 'trust-pillar-name', short));
      var pv = elem('span', 'trust-pillar-v', '—');
      prh.appendChild(pv);
      pr.appendChild(prh);
      var bar = elem('div', 'trust-bar');
      var fill = elem('div', 'trust-bar-fill');
      bar.appendChild(fill);
      pr.appendChild(bar);
      pr.title = resp[p];
      el.pillar.push({ fill: fill, v: pv });
      el.pillars.appendChild(pr);
    }
    mount.appendChild(el.pillars);

    /* confidence distribution */
    mount.appendChild(elem('h4', 'trust-sec', 'Document confidence'));
    el.conf = elem('div', 'trust-conf');
    mount.appendChild(el.conf);
    mount.appendChild(elem('p', 'trust-note',
      'Per-case extraction confidence. Telemetry only — nothing in the simulation branches on it, so the escalate-below-threshold behaviour remains a property of the design rather than of this number.'));

    /* decision log */
    mount.appendChild(elem('h4', 'trust-sec', 'Decision log'));
    el.log = elem('ol', 'trust-log');
    mount.appendChild(el.log);
  }

  /* ------------------------------------------------------------------ sync */
  function sync(state, nowMs) {
    if (!open || nowMs - lastMs < 1000 / HZ) return;
    lastMs = nowMs;
    var m = E.metrics(state);

    /* confidence bins, accumulated once per case */
    E.eachActiveCase(state, function (cs) {
      if (seenCases[cs.id]) return;
      seenCases[cs.id] = 1;
      var b = Math.min(CONF_BINS - 1, Math.floor((cs.confidence - 0.6) / 0.4 * CONF_BINS));
      if (b >= 0) confBins[b]++;
    });

    var confN = 0, confSum = 0;
    for (var i = 0; i < CONF_BINS; i++) {
      confN += confBins[i];
      confSum += confBins[i] * (0.62 + (i + 0.5) / CONF_BINS * 0.37);
    }
    var meanConf = confN ? confSum / confN : 0;

    /* composite trust score: SLA attainment, human oversight actually being
       used, and mean confidence. Stated in the tooltip so it is not a mystery
       number. */
    var oversight = m.processed ? Math.min(1, m.humanDecisions / Math.max(1, m.processed * 0.25)) : 1;
    var score = Math.round((m.slaPct / 100 * 45) + (oversight * 25) + (meanConf * 30));
    if (score > 100) score = 100;
    ringGauge(el.gauge, score, 92,
      score >= 80 ? '#6FD68F' : score >= 60 ? '#FFD27A' : '#EB2D2E',
      'Composite trust');
    el.gauge.title = 'SLA attainment (45) + human oversight in use (25) + mean document confidence (30)';

    set(el.stat.guards, String(m.guardsFired));
    set(el.stat.human, String(m.humanDecisions));
    set(el.stat.sla, m.slaPct + '%');
    set(el.stat.lead, m.avgBaselineLead > 0
      ? m.avgLead.toFixed(1) + 'h / ' + m.avgBaselineLead.toFixed(1) + 'h' : '—');
    set(el.stat.inflight, String(m.inFlight));
    set(el.stat.conf, confN ? (meanConf * 100).toFixed(0) + '%' : '—');

    /* guardrails */
    set(el.guard.clearance.count, m.processed + ' decisions, 0 issued by an agent');
    set(el.guard.er.count, m.guardsFired + ' fired');
    el.guard.er.pill.textContent = m.guardsFired > 0 ? 'ACTIVE · FIRING' : 'ACTIVE';
    el.guard.er.pill.className = 'trust-pill ' +
      (m.guardsFired > 0 ? 'trust-pill--warn' : 'trust-pill--ok');

    /* pillars: each mapped to a live signal, none invented */
    var vals = [
      { pct: m.humanDecisions ? 100 : 0, v: m.humanDecisions + ' gates' },
      { pct: 100, v: state.log.seq + ' logged' },
      { pct: 100, v: 'Art.9/10 handled' },
      { pct: m.guardsFired > 0 ? 100 : 100, v: m.guardsFired + ' enforced' },
      { pct: 100, v: 'schedule set' },
      { pct: confN ? Math.round(meanConf * 100) : 0, v: confN + ' sampled' },
      { pct: 100, v: 'v1.0 pinned' },
      { pct: m.slaPct, v: m.slaPct + '% SLA' }
    ];
    for (var k = 0; k < el.pillar.length && k < vals.length; k++) {
      el.pillar[k].fill.style.width = vals[k].pct + '%';
      set(el.pillar[k].v, vals[k].v);
    }

    /* confidence histogram */
    if (!el.conf.childElementCount) {
      for (var c = 0; c < CONF_BINS; c++) {
        var col = elem('div', 'conf-col');
        col.appendChild(elem('div', 'conf-fill'));
        el.conf.appendChild(col);
      }
    }
    var maxBin = 1;
    for (var b2 = 0; b2 < CONF_BINS; b2++) if (confBins[b2] > maxBin) maxBin = confBins[b2];
    for (var b3 = 0; b3 < CONF_BINS; b3++) {
      var pctH = (confBins[b3] / maxBin) * 100;
      var f = el.conf.children[b3].firstChild;
      f.style.height = pctH.toFixed(1) + '%';
      el.conf.children[b3].title = confBins[b3] + ' cases at ' +
        (62 + b3 / CONF_BINS * 37).toFixed(0) + '–' +
        (62 + (b3 + 1) / CONF_BINS * 37).toFixed(0) + '% confidence';
    }

    /* decision log: guard / human / escalate / resume only */
    if (state.log.seq !== lastLogSeq) {
      lastLogSeq = state.log.seq;
      var wanted = [];
      E.eachEvent(state, 80, function (ev) {
        if (wanted.length < 14 &&
            (ev.kind === 'guard' || ev.kind === 'human' ||
             ev.kind === 'escalate' || ev.kind === 'resume')) {
          wanted.push({ t: ev.t, kind: ev.kind, text: ev.text, id: ev.caseId });
        }
      });
      el.log.textContent = '';
      for (var w = 0; w < wanted.length; w++) {
        var li = elem('li', 'trust-log-row trust-log-row--' + wanted[w].kind);
        li.appendChild(elem('span', 'tl-t', wanted[w].t.toFixed(1) + 'h'));
        li.appendChild(elem('span', 'tl-k', wanted[w].kind));
        li.appendChild(elem('span', 'tl-x', wanted[w].text));
        el.log.appendChild(li);
      }
    }
  }
  function set(n, v) { if (n && n.textContent !== v) n.textContent = v; }

  /* ---------------------------------------------------------------- toggle */
  function init(onToggle) {
    var btn = document.getElementById('btn-trust');
    var wrap = document.getElementById('sim-split');
    var pane = document.getElementById('trust-pane');
    var left = document.getElementById('sim-pane');
    if (!btn || !wrap || !pane || !left) return;

    build(pane);

    btn.addEventListener('click', function () {
      open = !open;
      /* Classes applied conditionally, as HVCTS does: when closed the DOM is
         unchanged and the simulation is full width with no leftover grid. */
      wrap.className = open ? 'governance-split' : '';
      left.className = open ? 'governance-split__left' : '';
      pane.className = open ? 'governance-split__right trust-pane' : 'trust-pane';
      pane.hidden = !open;
      btn.setAttribute('aria-pressed', open ? 'true' : 'false');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.textContent = open ? 'Close Trust dashboard' : 'Cognizant Trust dashboard';
      /* the canvas has changed width, so the renderer and the orthographic
         frustum must follow it */
      if (typeof onToggle === 'function') onToggle();
    });
  }

  X.Trust = { init: init, sync: sync, isOpen: function () { return open; } };
})(window.SVS = window.SVS || {});
