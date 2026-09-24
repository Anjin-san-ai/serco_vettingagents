/* ==========================================================================
   dashboard.js — the live case dashboard and the state legend, both rendered
   below the simulation panel.

   Everything here is a READ of SimState. History for the sparkline is kept
   HERE, not in the engine, so the simulation stays deterministic and the
   golden-seed test keeps working.

   Classic script, no modules: the pages must run from file://.
   ========================================================================== */
(function (X) {
  'use strict';

  var E = X.Engine;
  var A = X.Agents;
  var C = X.Config;
  var NS = 'http://www.w3.org/2000/svg';

  var el = {};
  var lastMs = 0;
  var HZ = 10;

  /* throughput history, owned by the view layer */
  var BUCKETS = 12, BUCKET_MS = 2500;
  var hist = new Array(BUCKETS);
  var histIx = 0, bucketStart = 0, lastProcessed = 0;
  for (var h = 0; h < BUCKETS; h++) hist[h] = 0;

  function hex(n) { return '#' + ('000000' + n.toString(16)).slice(-6); }
  function svg(tag, attrs) {
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

  /* ---------------------------------------------------------------- legend
     Generated from Config.state so the legend and the scene cannot disagree.
     The hand-written legend this replaces had waiting-on-human as #8B5CF6 and
     complete as #1F6B3A, while the scene rendered #E4D8FB and #6FD68F. */
  function buildLegend(mount) {
    if (!mount) return;
    var keys = Object.keys(C.state);
    for (var i = 0; i < keys.length; i++) {
      var st = C.state[keys[i]];
      var row = elem('div', 'legend-row');

      var chip = elem('span', 'legend-chip');
      chip.textContent = C.glyphs[st.glyph] + '  ' + (st.chip || st.label);
      if (st.dim < 0.5) {
        chip.style.background = 'rgba(18,4,40,.72)';
        chip.style.color = '#D7DEE2';
        chip.style.borderColor = 'rgba(215,222,226,.45)';
      } else {
        var c = hex(st.colour);
        var rr = (st.colour >> 16) & 255, gg = (st.colour >> 8) & 255, bb = st.colour & 255;
        var lum = (0.2126 * rr + 0.7152 * gg + 0.0722 * bb) / 255;
        chip.style.background = c;
        chip.style.color = lum > 0.55 ? '#120428' : '#FFFFFF';
        chip.style.borderColor = 'rgba(255,255,255,.55)';
      }
      row.appendChild(chip);
      row.appendChild(elem('span', 'legend-name', st.label));
      row.appendChild(elem('span', 'legend-desc', st.desc || ''));
      mount.appendChild(row);
    }
  }

  /* ------------------------------------------------------------ case table */
  var CASE_ROWS = 10;
  function syncTable(state) {
    if (!el.tbody) return;
    var rows = [];
    E.eachActiveCase(state, function (cs) {
      if (rows.length < CASE_ROWS) rows.push(cs);
    });

    while (el.tbody.childElementCount > rows.length) {
      el.tbody.removeChild(el.tbody.lastElementChild);
    }
    while (el.tbody.childElementCount < rows.length) {
      var tr = document.createElement('tr');
      for (var c = 0; c < 6; c++) tr.appendChild(document.createElement('td'));
      el.tbody.appendChild(tr);
    }

    for (var i = 0; i < rows.length; i++) {
      var cs = rows[i], tr = el.tbody.children[i], td = tr.children;
      var agentIx = cs.atAgent;
      var agent = agentIx > 0 ? A.RING[agentIx - 1] : A.ORCHESTRATOR;
      var agState = state.agents[agentIx].state;
      var conf = C.state[agState] || C.state.IDLE;

      if (td[0].textContent !== cs.id) td[0].textContent = cs.id;
      if (td[1].textContent !== cs.name) td[1].textContent = cs.name;
      if (td[2].textContent !== cs.clearance) {
        td[2].textContent = '';
        td[2].appendChild(elem('span', 'chip chip--sys', cs.clearance));
      }
      var who = (agent.code || 'A0') + ' ' + agent.name;
      if (td[3].textContent !== who) td[3].textContent = who;

      var label = (conf.chip || conf.label);
      if (td[4].dataset.s !== agState) {
        td[4].dataset.s = agState;
        td[4].textContent = '';
        var pill = elem('span', 'case-pill', C.glyphs[conf.glyph] + ' ' + label);
        pill.dataset.state = agState;
        td[4].appendChild(pill);
      }
      var prog = (cs.hop + 1) + '/' + cs.hops + (cs.slaClock <= cs.slaHours ? '  ✓' : '  !');
      if (td[5].textContent !== prog) td[5].textContent = prog;
    }
    if (el.tableEmpty) el.tableEmpty.hidden = rows.length > 0;
  }

  /* ----------------------------------------------------------- sparkline */
  function syncSparkline(state, nowMs) {
    if (!el.spark) return;
    var m = E.metrics(state);
    if (!bucketStart) { bucketStart = nowMs; lastProcessed = m.processed; }
    if (nowMs - bucketStart >= BUCKET_MS) {
      histIx = (histIx + 1) % BUCKETS;
      hist[histIx] = 0;
      bucketStart = nowMs;
    }
    var delta = m.processed - lastProcessed;
    if (delta > 0) { hist[histIx] += delta; lastProcessed = m.processed; }

    var W = 210, H = 46, max = 1;
    for (var i = 0; i < BUCKETS; i++) if (hist[i] > max) max = hist[i];

    el.spark.textContent = '';
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H });
    var bw = W / BUCKETS;
    for (var b = 0; b < BUCKETS; b++) {
      var ix = (histIx + 1 + b) % BUCKETS;          /* oldest first */
      var v = hist[ix];
      var bh = Math.max(1, (v / max) * (H - 8));
      s.appendChild(svg('rect', {
        x: (b * bw + 1).toFixed(1), y: (H - bh).toFixed(1),
        width: (bw - 2).toFixed(1), height: bh.toFixed(1), rx: 1,
        fill: b === BUCKETS - 1 ? '#EB2D2E' : '#8E7BB8'
      }));
    }
    el.spark.appendChild(s);
    if (el.sparkNow) el.sparkNow.textContent = String(hist[histIx]);
  }

  /* -------------------------------------------------------- agent heatmap */
  function syncHeatmap(state) {
    if (!el.heat) return;
    if (!el.heat.childElementCount) {
      for (var i = 0; i < A.RING.length; i++) {
        var cell = elem('div', 'heat-cell');
        cell.appendChild(elem('span', 'heat-code', A.RING[i].code));
        cell.appendChild(elem('span', 'heat-n', '0'));
        cell.title = A.RING[i].name;
        el.heat.appendChild(cell);
      }
    }
    var max = 1;
    for (var a = 1; a < state.agents.length; a++) {
      if (state.agents[a].handled > max) max = state.agents[a].handled;
    }
    for (var k = 0; k < A.RING.length; k++) {
      var n = state.agents[k + 1].handled;
      var cell2 = el.heat.children[k];
      var t = n / max;
      cell2.style.background = 'rgba(235,45,46,' + (0.08 + t * 0.62).toFixed(3) + ')';
      var nEl = cell2.lastChild;
      if (nEl.textContent !== String(n)) nEl.textContent = String(n);
      /* queue depth is where a human hold shows up as a bottleneck */
      var q = state.agents[k + 1].queue.length;
      cell2.dataset.queued = q > 0 ? String(q) : '';
    }
  }

  /* ------------------------------------------------------------ donut + KPI */
  function syncDonut(state) {
    if (!el.donut) return;
    var m = E.metrics(state);
    var segs = [
      { label: 'Completed', v: m.processed - m.pushbacksPrevented - m.guardsFired, col: '#6FD68F' },
      { label: 'Pushback prevented', v: m.pushbacksPrevented, col: '#FFD27A' },
      { label: 'Escalated', v: m.guardsFired, col: '#C50001' },
      { label: 'In flight', v: m.inFlight, col: '#8E7BB8' }
    ];
    var total = 0, i;
    for (i = 0; i < segs.length; i++) { if (segs[i].v < 0) segs[i].v = 0; total += segs[i].v; }
    if (!total) total = 1;

    el.donut.textContent = '';
    var R = 34, SW = 13, CIRC = 2 * Math.PI * R;
    var s = svg('svg', { viewBox: '0 0 90 90', width: '90', height: '90' });
    s.appendChild(svg('circle', {
      cx: 45, cy: 45, r: R, fill: 'none', stroke: 'rgba(228,216,251,.14)', 'stroke-width': SW
    }));
    var off = 0;
    for (i = 0; i < segs.length; i++) {
      if (!segs[i].v) continue;
      var frac = segs[i].v / total;
      s.appendChild(svg('circle', {
        cx: 45, cy: 45, r: R, fill: 'none', stroke: segs[i].col, 'stroke-width': SW,
        'stroke-dasharray': (CIRC * frac).toFixed(2) + ' ' + (CIRC * (1 - frac)).toFixed(2),
        'stroke-dashoffset': (-CIRC * off).toFixed(2),
        transform: 'rotate(-90 45 45)'
      }));
      off += frac;
    }
    var t = svg('text', {
      x: 45, y: 49, 'text-anchor': 'middle', fill: '#EEF2F6',
      'font-size': '19', 'font-weight': '700', 'font-family': 'inherit'
    });
    t.textContent = String(m.processed);
    s.appendChild(t);
    el.donut.appendChild(s);

    if (!el.donutKey.childElementCount) {
      for (i = 0; i < segs.length; i++) {
        var row = elem('div', 'donut-key-row');
        var sw = elem('i', 'donut-sw'); sw.style.background = segs[i].col;
        row.appendChild(sw);
        row.appendChild(elem('span', 'dk-label', segs[i].label));
        row.appendChild(elem('span', 'dk-n', '0'));
        el.donutKey.appendChild(row);
      }
    }
    for (i = 0; i < segs.length; i++) {
      var n2 = el.donutKey.children[i].lastChild;
      if (n2.textContent !== String(segs[i].v)) n2.textContent = String(segs[i].v);
    }

    setKpi(el.kpiHours, (Math.round(m.hoursSaved * 10) / 10).toFixed(1));
    setKpi(el.kpiDays, (Math.round(m.leadDaysSaved * 10) / 10).toFixed(1));
    setKpi(el.kpiGuard, String(m.guardsFired));
    setKpi(el.kpiSla, m.slaPct + '%');
  }
  function setKpi(node, v) { if (node && node.textContent !== v) node.textContent = v; }

  /* ------------------------------------------------------------------ init */
  function init() {
    el.tbody = document.getElementById('case-tbody');
    el.tableEmpty = document.getElementById('case-empty');
    el.spark = document.getElementById('dash-spark');
    el.sparkNow = document.getElementById('dash-spark-now');
    el.heat = document.getElementById('dash-heat');
    el.donut = document.getElementById('dash-donut');
    el.donutKey = document.getElementById('dash-donut-key');
    el.kpiHours = document.getElementById('kpi-hours');
    el.kpiDays = document.getElementById('kpi-days');
    el.kpiGuard = document.getElementById('kpi-guard');
    el.kpiSla = document.getElementById('kpi-sla');
    buildLegend(document.getElementById('state-legend'));
  }

  function sync(state, nowMs) {
    if (nowMs - lastMs < 1000 / HZ) return;
    lastMs = nowMs;
    syncTable(state);
    syncSparkline(state, nowMs);
    syncHeatmap(state);
    syncDonut(state);
  }

  X.Dashboard = { init: init, sync: sync };
})(window.SVS = window.SVS || {});
