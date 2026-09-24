/* ==========================================================================
   evidence-view.js - the Evidence walkthrough page.

   Reads SVS.Evidence (hand-authored content), SVS.EvidenceBoxes (generated
   geometry), SVS.Agents (the fleet, shared with agents.html and the
   simulation) and SVS.Config (decision-state colours and labels).

   Classic script, no modules, no fetch: these pages must run from file:// off
   a USB stick. Built with the same el()/aria-pressed idioms as fleet.js.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.getElementById('ev-app');
  if (!root) { return; }

  /* ----------------------------------------------------------- boot check
     A missing generated file must read as an instruction, not as a page of
     grey rectangles. Mirrors selfCheck() in app.js.                        */
  function bail(why) {
    var box = document.getElementById('ev-boot');
    var span = document.getElementById('ev-boot-why');
    if (box) { box.hidden = false; }
    if (span) { span.textContent = why; }
    root.setAttribute('data-ev-ready', 'failed');
  }

  var S = window.SVS || {};
  if (!S.Evidence) { return bail('assets/js/evidence.js did not load.'); }
  if (!S.EvidenceBoxes) {
    return bail('assets/js/evidence-boxes.js did not load. Generate it with: ' +
                'python3 tools/build-evidence.py');
  }
  if (!S.Agents || !S.Config) {
    return bail('assets/js/sim/agents.js or config.js did not load.');
  }

  var EV = S.Evidence;
  var BOXES = S.EvidenceBoxes;
  var STEPS = EV.steps;
  var DWELL = 620;          // ms per extracted field during playback
  var RULE_DWELL = 520;     // ms per rule

  /* What each decision MEANS for a case. Config.state carries labels and
     colours shared with the simulation, but its `desc` describes the 3D pod
     animation, so it must not be shown here. */
  var DECISION_MEANS = {
    DONE: 'Step complete. Nothing was left for a person to redo.',
    WAITING_HUMAN: 'Held. One specific question, and the rest of the ticket ' +
      'untouched \u2014 not closed incomplete and bounced back.',
    ESCALATED: 'Stopped and handed to a named person. The agent declined to ' +
      'take the obvious next action.',
    WORKING: 'In progress.',
    IDLE: 'Not started.'
  };

  /* ------------------------------------------------------------- helpers */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text != null) { n.textContent = text; }
    return n;
  }

  function reduced() {
    return document.body.getAttribute('data-motion') === 'reduce' ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function pct(v) { return (v * 100).toFixed(3) + '%'; }

  /* A field's displayed value. Non-text fields (photo box, signature strip)
     declare readAs instead of a printed value - the panel must say what was
     read, not leave a blank row. */
  function readOf(f, key, geo) {
    if (f.value != null) { return f.value; }
    if (f.lines) { return f.lines.join(' '); }
    /* Derived text - the MRZ - is handed over by the generator, so the panel
       shows the exact string that was printed rather than a description. */
    if (geo && geo.derived && geo.derived[key] != null) { return geo.derived[key]; }
    return f.readAs || 'Present';
  }

  /* ---------------------------------------------------------------- state */
  var current = -1;
  var gen = 0;              // playback generation; guards stale timers
  var timers = [];
  var showAll = false;

  /* Human decisions, keyed by step id. In memory only: reloading resets, which
     is right for a demo and avoids sessionStorage under a null file:// origin. */
  var decisions = {};

  function answerFor(stepId) { return decisions[stepId] || null; }

  function answerObj(st) {
    var id = answerFor(st.id);
    if (!id || !st.hitl) { return null; }
    for (var i = 0; i < st.hitl.answers.length; i++) {
      if (st.hitl.answers[i].id === id) { return st.hitl.answers[i]; }
    }
    return null;
  }

  /* A dependent step is blocked until its dependency has been answered the one
     way that unblocks it. Returns null when the step may proceed. */
  function blockedBy(st) {
    if (!st.dependsOn) { return null; }
    var dep = null, depIx = -1;
    for (var i = 0; i < STEPS.length; i++) {
      if (STEPS[i].id === st.dependsOn.step) { dep = STEPS[i]; depIx = i; }
    }
    if (!dep) { return null; }
    var given = answerFor(dep.id);
    if (given === st.dependsOn.answer) { return null; }
    var chosen = answerObj(dep);
    return {
      dep: dep, depIx: depIx,
      reason: chosen && chosen.downstream ? chosen.downstream : st.blocked,
      answered: !!given
    };
  }

  function clearTimers() {
    for (var i = 0; i < timers.length; i++) { clearTimeout(timers[i]); }
    timers = [];
  }

  function after(ms, fn) {
    var my = gen;
    timers.push(setTimeout(function () { if (my === gen) { fn(); } }, ms));
  }

  /* ------------------------------------------------------------- scaffold */
  var rail = el('div', 'ev-rail');
  rail.setAttribute('role', 'tablist');
  rail.setAttribute('aria-label', 'Vetting steps');

  var controls = el('div', 'ev-controls');
  var btnPlay = el('button', 'ev-btn ev-btn--play', 'Play step');
  btnPlay.type = 'button';
  var btnSkip = el('button', 'ev-btn', 'Skip to result');
  btnSkip.type = 'button';
  var btnPrev = el('button', 'ev-btn', 'Previous');
  btnPrev.type = 'button';
  var btnNext = el('button', 'ev-btn', 'Next step');
  btnNext.type = 'button';
  var btnAll = el('button', 'ev-btn', 'Show everything');
  btnAll.type = 'button';
  btnAll.setAttribute('aria-pressed', 'false');
  var btnReset = el('button', 'ev-btn ev-btn--reset', 'Reset decisions');
  btnReset.type = 'button';
  controls.appendChild(btnPrev);
  controls.appendChild(btnPlay);
  controls.appendChild(btnSkip);
  controls.appendChild(btnNext);
  controls.appendChild(btnAll);
  controls.appendChild(btnReset);

  var live = el('p', 'sr-only');
  live.setAttribute('aria-live', 'polite');

  var stage = el('div', 'ev-stage');
  var paneDoc = el('div', 'ev-pane ev-pane--doc');
  var paneAgent = el('div', 'ev-pane ev-pane--agent');
  stage.appendChild(paneDoc);
  stage.appendChild(paneAgent);

  var allWrap = el('div', 'ev-all');
  allWrap.hidden = true;

  root.appendChild(rail);
  root.appendChild(controls);
  root.appendChild(live);
  root.appendChild(stage);
  root.appendChild(allWrap);

  /* ------------------------------------------------------------ step rail */
  STEPS.forEach(function (st, i) {
    var b = el('button', 'ev-tab');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', 'false');
    b.id = 'ev-tab-' + st.id;
    var n = el('span', 'ev-tab-n', String(i + 1));
    var t = el('span', 'ev-tab-t', st.title);
    var r = el('span', 'ev-tab-r', st.ref);
    b.appendChild(n);
    b.appendChild(t);
    b.appendChild(r);
    if (st.exception) { b.setAttribute('data-exception', String(st.exception)); }
    b.setAttribute('data-decision', st.decision);
    b.addEventListener('click', function () { select(i, false); });
    rail.appendChild(b);
  });

  /* --------------------------------------------------------- the document */
  function buildDoc(st) {
    paneDoc.textContent = '';
    var doc = EV.docs[st.doc];
    var geo = BOXES.docs[st.doc];

    var fig = el('figure', 'map-frame ev-frame');
    var cap = el('figcaption');
    cap.appendChild(el('span', null, doc.label));
    var tag = el('span', 'tag');
    tag.textContent = doc.issuer || 'Serco';
    cap.appendChild(tag);
    fig.appendChild(cap);

    var shot = el('div', 'ev-shot');
    /* Reserve the box from the generated pixel dimensions so the overlay is
       correct before the image decodes and nothing reflows mid-animation. */
    shot.style.aspectRatio = geo.px[0] + ' / ' + geo.px[1];
    var img = el('img');
    img.src = geo.png;
    img.alt = 'Specimen ' + doc.label + '. A generated example document, ' +
              'watermarked as a specimen.';
    img.loading = 'lazy';
    shot.appendChild(img);

    /* Highlight overlay. Decorative: every value it points at is also a real
       row in the panel, so screen readers lose nothing by skipping it. */
    var layer = el('div', 'ev-layer');
    layer.setAttribute('aria-hidden', 'true');
    st.highlight.forEach(function (key) {
      var b = geo.boxes[key];
      if (!b) { return; }
      var hl = el('span', 'ev-hl');
      hl.style.left = pct(b[0]);
      hl.style.top = pct(b[1]);
      hl.style.width = pct(b[2]);
      hl.style.height = pct(b[3]);
      hl.setAttribute('data-field', key);
      layer.appendChild(hl);
    });
    shot.appendChild(layer);
    fig.appendChild(shot);

    var foot = el('div', 'map-validation');
    var a = el('a', null, 'Open the full PDF');
    a.href = geo.pdf;
    a.target = '_blank';
    a.rel = 'noopener';
    foot.appendChild(a);
    foot.appendChild(document.createTextNode(
      ' · generated specimen, ' + geo.px[0] + '×' + geo.px[1] +
      'px · not a real document'));
    fig.appendChild(foot);

    paneDoc.appendChild(fig);

    if (doc.note) {
      var note = el('p', 'ev-docnote', doc.note);
      paneDoc.appendChild(note);
    }
    return layer;
  }

  /* ------------------------------------------------------------ the agent */
  function provenanceChip(st) {
    var wrap = el('ul', 'chips ev-prov');
    var map = {
      serco: ['badge-serco', 'Sourced' + (st.citation ? ' ' + st.citation : '')],
      ours: ['badge-ours', 'Cognizant design'],
      proposed: ['badge-ours', 'PROPOSED — not in the current process']
    };
    var m = map[st.provenance] || map.ours;
    var li = el('li', 'chip ' + m[0], m[1]);
    wrap.appendChild(li);
    if (st.sla) {
      wrap.appendChild(el('li', 'chip chip--sys', 'SLA ' + st.sla));
    } else {
      wrap.appendChild(el('li', 'chip', 'SLA not stated in source'));
    }
    if (st.volume) { wrap.appendChild(el('li', 'chip chip--wave', st.volume)); }
    if (st.lead) { wrap.appendChild(el('li', 'chip chip--human', st.lead)); }
    if (st.aht) { wrap.appendChild(el('li', 'chip', 'AHT ' + st.aht)); }
    return wrap;
  }

  function buildAgent(st) {
    paneAgent.textContent = '';
    var agent = S.Agents.byId(st.agent);
    var doc = EV.docs[st.doc];
    var geo = BOXES.docs[st.doc];

    var head = el('div', 'ev-head');
    var who = el('p', 'ev-agent');
    who.appendChild(el('span', 'ev-agent-code', agent.code));
    who.appendChild(el('span', 'ev-agent-name', agent.name));
    head.appendChild(who);
    head.appendChild(el('h3', 'ev-title', st.title));
    head.appendChild(provenanceChip(st));
    paneAgent.appendChild(head);

    paneAgent.appendChild(el('p', 'ev-narrative', st.narrative));

    /* extracted. A gated step must not display values that only exist because
       of an approval that has not happened. */
    var gate = blockedBy(st);
    var pendingFields = (gate && st.dependsOn.affects) || [];
    paneAgent.appendChild(el('p', 'trust-sec', 'Extracted from this document'));
    var rows = el('div', 'ev-rows');
    st.highlight.forEach(function (key) {
      var f = doc.fields[key];
      if (!f) { return; }
      var pending = pendingFields.indexOf(key) >= 0;
      var row = el('div', 'ev-row');
      row.setAttribute('data-field', key);
      if (pending) { row.setAttribute('data-pending', 'yes'); }
      row.appendChild(el('span', 'ev-row-k', f.label));
      row.appendChild(el('span', 'ev-row-v',
        pending ? 'awaiting confirmation at step ' + (gate.depIx + 1)
                : readOf(f, key, geo)));
      var bar = el('span', 'trust-bar');
      var fill = el('span', 'trust-bar-fill');
      fill.style.width = Math.round((f.conf || 0) * 100) + '%';
      bar.appendChild(fill);
      row.appendChild(bar);
      row.appendChild(el('span', 'ev-row-c',
        pending ? '\u2014' : Math.round((f.conf || 0) * 100) + '%'));
      rows.appendChild(row);
    });
    paneAgent.appendChild(rows);

    /* rules */
    paneAgent.appendChild(el('p', 'trust-sec',
      gate ? 'Rules that will apply once the gate clears' : 'Rules applied'));
    var rulesWrap = el('div', 'ev-rules');
    st.rules.forEach(function (r) {
      var g = el('div', 'trust-guard ev-rule');
      g.setAttribute('data-verdict', r.verdict);
      var hdr = el('div', 'trust-guard-hdr');
      hdr.appendChild(el('span', 'trust-guard-name', r.name));
      hdr.appendChild(el('span', 'trust-pill trust-pill--' +
        (r.verdict === 'ok' ? 'ok' : 'warn'),
        r.verdict === 'ok' ? 'PASS' : 'FLAG'));
      g.appendChild(hdr);
      g.appendChild(el('p', 'trust-guard-detail', r.detail));
      if (r.citation) {
        g.appendChild(el('p', 'trust-guard-foot', r.citation));
      }
      rulesWrap.appendChild(g);
    });
    paneAgent.appendChild(rulesWrap);

    /* Other ways this step fails. Collapsed by default - a presenter wants the
       happy path first and the caveats on demand. <details> needs no JS and
       is keyboard-accessible for free. */
    if (st.edgeCases && st.edgeCases.length) {
      var det = el('details', 'ev-edge');
      var sum = el('summary', 'ev-edge-sum',
        'Other ways this step fails (' + st.edgeCases.length + ')');
      det.appendChild(sum);
      st.edgeCases.forEach(function (e) {
        var item = el('div', 'ev-edge-item');
        var h = el('p', 'ev-edge-name', e.name);
        item.appendChild(h);
        item.appendChild(el('p', 'ev-edge-detail', e.detail));
        var tag = el('span', 'badge-' + (e.provenance === 'serco' ? 'serco' : 'ours'),
          e.provenance === 'serco' ? (e.citation || 'Serco') : 'Cognizant');
        item.appendChild(tag);
        det.appendChild(item);
      });
      paneAgent.appendChild(det);
    }

    /* decision - or, for a dependent step whose gate is unresolved, the
       blocked state instead. The step genuinely cannot proceed. */
    var block = blockedBy(st);
    if (block) {
      paneAgent.appendChild(el('p', 'trust-sec', 'Decision'));
      var bdec = el('div', 'ev-decision is-on');
      var bpill = el('span', 'case-pill');
      bpill.setAttribute('data-state', 'WAITING_HUMAN');
      bpill.textContent = S.Config.state.WAITING_HUMAN.label;
      bdec.appendChild(bpill);
      bdec.appendChild(el('span', 'ev-dec-desc', DECISION_MEANS.WAITING_HUMAN));
      paneAgent.appendChild(bdec);
      paneAgent.appendChild(buildBlocked(st, block));
      paneAgent.appendChild(el('p', 'trust-sec', 'What stays human'));
      paneAgent.appendChild(el('p', 'ev-stays', st.stays));
      return { rows: rows, rules: rulesWrap, dec: bdec };
    }

    var dec = el('div', 'ev-decision');
    var stateDef = S.Config.state[st.decision] || {};
    var pill = el('span', 'case-pill');
    pill.setAttribute('data-state', st.decision);
    pill.textContent = stateDef.label || st.decision;
    paneAgent.appendChild(el('p', 'trust-sec', 'Decision'));
    dec.appendChild(pill);
    if (DECISION_MEANS[st.decision]) {
      dec.appendChild(el('span', 'ev-dec-desc', DECISION_MEANS[st.decision]));
    }
    paneAgent.appendChild(dec);

    if (st.humanQuestion) {
      var q = el('div', 'callout callout--warn ev-question');
      q.appendChild(el('p', 'ev-q-lab', 'The one question put to a human'));
      q.appendChild(el('p', null, st.humanQuestion));
      paneAgent.appendChild(q);
    }

    /* The gate itself. Answering re-renders this step, and any step that
       depends on it picks the change up the next time it is opened. */
    if (st.hitl) {
      paneAgent.appendChild(buildHitl(st, function () {
        select(current, true);
      }));
    }

    if (st.impact) {
      var im = el('p', 'ev-impact', st.impact);
      paneAgent.appendChild(im);
    }

    paneAgent.appendChild(el('p', 'trust-sec', 'What stays human'));
    paneAgent.appendChild(el('p', 'ev-stays', st.stays));

    return { rows: rows, rules: rulesWrap, dec: dec };
  }

  /* --------------------------------------------------------- HITL panel
     The gate, made operable. Everything a person needs in order to answer is
     here: who is being asked, the conflict with each document that contradicts
     the keyed value, and the answers actually allowed. */
  function buildHitl(st, onAnswered) {
    var h = st.hitl;
    var wrap = el('div', 'ev-hitl');
    var chosen = answerObj(st);
    wrap.setAttribute('data-answered', chosen ? 'yes' : 'no');

    var hdr = el('div', 'ev-hitl-hdr');
    hdr.appendChild(el('span', 'ev-hitl-tag',
      chosen ? 'DECIDED BY A HUMAN' : 'HELD \u2014 AWAITING A HUMAN'));
    hdr.appendChild(el('span', 'ev-hitl-who', h.askedOf));
    wrap.appendChild(hdr);
    wrap.appendChild(el('p', 'ev-hitl-role', h.askedOfRole));
    wrap.appendChild(el('p', 'ev-hitl-why', h.why));

    /* the conflict, side by side, naming the document each reading came from */
    h.conflicts.forEach(function (c) {
      var box = el('div', 'ev-conflict');
      box.appendChild(el('p', 'ev-conflict-f', c.field));
      var row = el('div', 'ev-conflict-row');
      var keyed = el('div', 'ev-conflict-side ev-conflict-side--keyed');
      keyed.appendChild(el('span', 'ev-conflict-src', c.keyedFrom));
      keyed.appendChild(el('span', 'ev-conflict-v', c.keyed));
      row.appendChild(keyed);
      c.evidence.forEach(function (e) {
        var side = el('div', 'ev-conflict-side');
        var d = EV.docs[e.doc];
        side.appendChild(el('span', 'ev-conflict-src', d ? d.label : e.doc));
        side.appendChild(el('span', 'ev-conflict-v', e.value));
        row.appendChild(side);
      });
      box.appendChild(row);
      if (c.note) { box.appendChild(el('p', 'ev-conflict-note', c.note)); }
      if (c.proposed) {
        box.appendChild(el('p', 'ev-conflict-prop',
          'Proposed correction: ' + c.proposed));
      }
      wrap.appendChild(box);
    });

    if (h.noAutoRelease) {
      wrap.appendChild(el('p', 'ev-hitl-noauto', h.noAutoRelease));
    }

    /* the answers allowed */
    if (!chosen) {
      wrap.appendChild(el('p', 'ev-hitl-ask', 'Answers allowed:'));
      var btns = el('div', 'ev-hitl-answers');
      h.answers.forEach(function (a) {
        var b = el('button', 'ev-btn ev-answer', a.label);
        b.type = 'button';
        b.setAttribute('data-kind', a.kind);
        b.setAttribute('data-answer', a.id);
        b.addEventListener('click', function () {
          decisions[st.id] = a.id;
          live.textContent = 'Decision recorded: ' + a.label;
          onAnswered();
        });
        btns.appendChild(b);
      });
      wrap.appendChild(btns);
    } else {
      var res = el('div', 'ev-hitl-chosen');
      res.appendChild(el('span', 'ev-hitl-chosen-lab', 'Answered'));
      res.appendChild(el('span', 'ev-hitl-chosen-v', chosen.label));
      wrap.appendChild(res);
      wrap.appendChild(el('p', 'ev-hitl-outcome', chosen.outcome));
    }

    /* the decision log - reuses trust.css's component unchanged */
    var log = el('div', 'ev-log');
    log.appendChild(el('p', 'trust-sec', 'Decision log'));
    var rows = el('div', 'trust-log');
    /* Uses trust.css's own row children - .tl-t / .tl-k / .tl-x - so the
       per-kind colours (guard amber, human lilac, resume green, escalate red)
       apply with no new CSS. The first column is an ordinal rather than a
       fabricated timestamp: an invented date here would be an unbacked literal,
       which is exactly the class of defect this round exists to remove. */
    var seq = 0;
    function logRow(kind, text, pending) {
      seq++;
      var r = el('div', 'trust-log-row trust-log-row--' + kind);
      r.appendChild(el('span', 'tl-t', '#' + seq));
      r.appendChild(el('span', 'tl-k', kind));
      r.appendChild(el('span', 'tl-x' + (pending ? ' ev-log-pending' : ''), text));
      rows.appendChild(r);
    }
    logRow('guard', h.guard);
    if (chosen) {
      chosen.log.forEach(function (l) { logRow(l.kind, l.text); });
    } else {
      logRow('human', 'awaiting ' + h.askedOf + '\u2026', true);
    }
    log.appendChild(rows);
    wrap.appendChild(log);
    return wrap;
  }

  /* ------------------------------------------------------- blocked step */
  function buildBlocked(st, b) {
    var wrap = el('div', 'ev-blocked');
    wrap.appendChild(el('p', 'ev-hitl-tag ev-blocked-tag',
      b.answered ? 'BLOCKED BY AN UPSTREAM DECISION' : 'WAITING ON A HUMAN DECISION'));
    wrap.appendChild(el('p', 'ev-blocked-why', b.reason));
    var a = el('a', 'ev-blocked-link',
      'Go to step ' + (b.depIx + 1) + ' \u2014 ' + b.dep.title);
    a.href = '#step-' + b.dep.id;
    a.addEventListener('click', function (e) {
      e.preventDefault();
      select(b.depIx, true);
    });
    wrap.appendChild(a);
    return wrap;
  }

  /* ----------------------------------------------------------- playback */
  function reveal(parts, layer, instant) {
    var rowEls = parts.rows.querySelectorAll('.ev-row');
    var ruleEls = parts.rules.querySelectorAll('.ev-rule');
    var hls = layer.querySelectorAll('.ev-hl');
    var i;

    if (instant) {
      for (i = 0; i < rowEls.length; i++) { rowEls[i].classList.add('is-on'); }
      for (i = 0; i < ruleEls.length; i++) { ruleEls[i].classList.add('is-on'); }
      for (i = 0; i < hls.length; i++) { hls[i].classList.add('is-on'); }
      parts.dec.classList.add('is-on');
      btnPlay.textContent = 'Replay step';
      return;
    }

    btnPlay.textContent = 'Playing…';
    var t = 0;
    for (i = 0; i < rowEls.length; i++) {
      (function (row, hl) {
        after(t, function () {
          row.classList.add('is-on');
          if (hl) { hl.classList.add('is-on'); }
          var k = row.querySelector('.ev-row-k');
          var v = row.querySelector('.ev-row-v');
          live.textContent = (k ? k.textContent : '') + ': ' + (v ? v.textContent : '');
        });
      }(rowEls[i], hls[i]));
      t += DWELL;
    }
    for (i = 0; i < ruleEls.length; i++) {
      (function (r) {
        after(t, function () {
          r.classList.add('is-on');
          var nm = r.querySelector('.trust-guard-name');
          var pl = r.querySelector('.trust-pill');
          live.textContent = (pl ? pl.textContent + ': ' : '') + (nm ? nm.textContent : '');
        });
      }(ruleEls[i]));
      t += RULE_DWELL;
    }
    after(t, function () {
      parts.dec.classList.add('is-on');
      var p = parts.dec.querySelector('.case-pill');
      live.textContent = 'Decision: ' + (p ? p.textContent : '');
      btnPlay.textContent = 'Replay step';
    });
  }

  /* ------------------------------------------------------------- select */
  var lastParts = null;
  var lastLayer = null;

  function select(i, instant) {
    if (i < 0 || i >= STEPS.length) { return; }
    clearTimers();
    gen++;
    current = i;
    var st = STEPS[i];

    var tabs = rail.querySelectorAll('.ev-tab');
    for (var k = 0; k < tabs.length; k++) {
      var on = (k === i);
      tabs[k].setAttribute('aria-selected', on ? 'true' : 'false');
      tabs[k].setAttribute('tabindex', on ? '0' : '-1');
      /* Mark held steps that a human has now answered, and dependent steps
         still waiting, so the rail shows where the gate is. */
      var stK = STEPS[k];
      if (stK.hitl) {
        tabs[k].setAttribute('data-hitl', answerFor(stK.id) ? 'answered' : 'pending');
      }
      if (stK.dependsOn) {
        tabs[k].setAttribute('data-blocked', blockedBy(stK) ? 'yes' : 'no');
      }
      if (on) { tabs[k].setAttribute('aria-current', 'step'); }
      else { tabs[k].removeAttribute('aria-current'); }
    }
    /* Keep the active step visible: the rail scrolls, and a deep link or a
       Next past the fold would otherwise look like nothing was selected. */
    if (tabs[i] && tabs[i].scrollIntoView) {
      try {
        tabs[i].scrollIntoView({
          behavior: reduced() ? 'auto' : 'smooth',
          block: 'nearest', inline: 'center'
        });
      } catch (e) { tabs[i].scrollIntoView(); }
    }

    lastLayer = buildDoc(st);
    lastParts = buildAgent(st);
    btnPrev.disabled = (i === 0);
    btnNext.disabled = (i === STEPS.length - 1);

    live.textContent = 'Step ' + (i + 1) + ' of ' + STEPS.length + ': ' + st.title;

    /* Deep link, so a presenter can open straight at a step and a link in the
       deck lands where it says it will. replaceState rather than push: the
       back button should leave the page, not walk the rail. */
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '#step-' + st.id);
    }
    reveal(lastParts, lastLayer, instant || reduced());
  }

  function indexFromHash() {
    var m = (window.location.hash || '').match(/^#step-(.+)$/);
    if (!m) { return 0; }
    for (var i = 0; i < STEPS.length; i++) {
      if (STEPS[i].id === decodeURIComponent(m[1])) { return i; }
    }
    return 0;
  }

  /* ---------------------------------------------------------- show all */
  function buildAll() {
    if (allWrap.childElementCount) { return; }
    STEPS.forEach(function (st, i) {
      var agent = S.Agents.byId(st.agent);
      var doc = EV.docs[st.doc];
      var sec = el('section', 'ev-all-step');
      var h = el('h3');
      h.appendChild(el('span', 'ev-tab-n', String(i + 1)));
      h.appendChild(document.createTextNode(' ' + st.title));
      sec.appendChild(h);
      sec.appendChild(el('p', 'ev-all-meta',
        st.ref + ' · ' + agent.code + ' ' + agent.name + ' · ' +
        doc.label + ' · ' + st.decision +
        (st.sla ? ' · SLA ' + st.sla : ' · SLA not stated in source') +
        (st.citation ? ' · ' + st.citation : '')));
      sec.appendChild(el('p', null, st.narrative));
      var ul = el('ul', 'tick');
      st.rules.forEach(function (r) {
        ul.appendChild(el('li', null,
          '[' + (r.verdict === 'ok' ? 'PASS' : 'FLAG') + '] ' + r.name +
          ' — ' + r.detail));
      });
      sec.appendChild(ul);
      if (st.humanQuestion) {
        sec.appendChild(el('p', 'ev-all-q', 'Question to a human: ' + st.humanQuestion));
      }
      sec.appendChild(el('p', 'ev-all-stays', 'Stays human: ' + st.stays));
      allWrap.appendChild(sec);
    });
  }

  /* --------------------------------------------------------------- wire */
  btnPlay.addEventListener('click', function () {
    if (current < 0) { return select(0, false); }
    clearTimers();
    gen++;
    lastLayer = buildDoc(STEPS[current]);
    lastParts = buildAgent(STEPS[current]);
    reveal(lastParts, lastLayer, reduced());
  });

  btnSkip.addEventListener('click', function () {
    clearTimers();
    gen++;
    if (current < 0) { current = 0; }
    lastLayer = buildDoc(STEPS[current]);
    lastParts = buildAgent(STEPS[current]);
    reveal(lastParts, lastLayer, true);
  });

  btnPrev.addEventListener('click', function () { select(current - 1, false); });
  btnNext.addEventListener('click', function () { select(current + 1, false); });

  btnReset.addEventListener('click', function () {
    decisions = {};
    live.textContent = 'Decisions cleared. Held steps are awaiting a human again.';
    select(current < 0 ? 0 : current, true);
  });

  btnAll.addEventListener('click', function () {
    showAll = !showAll;
    btnAll.setAttribute('aria-pressed', showAll ? 'true' : 'false');
    btnAll.textContent = showAll ? 'Back to the walkthrough' : 'Show everything';
    buildAll();
    allWrap.hidden = !showAll;
    stage.hidden = showAll;
    rail.hidden = showAll;
    btnPlay.disabled = showAll;
    btnSkip.disabled = showAll;
    btnPrev.disabled = showAll || current <= 0;
    btnNext.disabled = showAll || current >= STEPS.length - 1;
  });

  /* Arrow-key movement along the rail, per the tablist pattern. */
  rail.addEventListener('keydown', function (e) {
    var d = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { d = 1; }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { d = -1; }
    else if (e.key === 'Home') { d = -current; }
    else if (e.key === 'End') { d = STEPS.length - 1 - current; }
    else { return; }
    e.preventDefault();
    var next = Math.min(STEPS.length - 1, Math.max(0, current + d));
    select(next, false);
    rail.querySelectorAll('.ev-tab')[next].focus();
  });

  /* ------------------------------------------------- combination matrix
     Rendered into its own mount on the page, not into a step: it answers a
     question about the whole submission rather than about one document. */
  function buildCombinations() {
    var mount = document.getElementById('ev-combinations');
    var C = EV.combinations;
    if (!mount || !C) { return; }
    mount.textContent = '';

    var head = el('p', 'ev-comb-prov');
    head.appendChild(el('span', 'badge-ours', 'Cognizant'));
    head.appendChild(document.createTextNode(' ' + C.source));
    mount.appendChild(head);
    mount.appendChild(el('p', 'lede', C.lede));

    var scroll = el('div', 'table-scroll');
    var t = el('table', 'data ev-comb');
    var cap = el('caption', null,
      'Accepted evidence by circumstance. The highlighted row is the one this ' +
      'candidate satisfied.');
    t.appendChild(cap);
    var thead = el('thead');
    var hr = el('tr');
    ['Circumstance', 'Accepted evidence', 'What it establishes', 'Note']
      .forEach(function (h) { hr.appendChild(el('th', null, h)); });
    thead.appendChild(hr);
    t.appendChild(thead);
    var tb = el('tbody');
    C.rows.forEach(function (r) {
      var tr = el('tr');
      if (r.thisCandidate) { tr.setAttribute('data-this', 'yes'); }
      var c1 = el('td');
      c1.appendChild(el('strong', null, r.circumstance));
      if (r.thisCandidate) { c1.appendChild(el('span', 'ev-comb-flag', 'this candidate')); }
      tr.appendChild(c1);
      tr.appendChild(el('td', null, r.accepted));
      tr.appendChild(el('td', null, r.establishes));
      tr.appendChild(el('td', 'ev-comb-note', r.note));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    scroll.appendChild(t);
    mount.appendChild(scroll);

    /* and what each of the four documents actually did */
    mount.appendChild(el('h3', 'ev-comb-h', 'What arrived, and what each one did'));
    var list = el('ul', 'ev-sent');
    C.sent.forEach(function (x) {
      var li = el('li', 'ev-sent-item');
      li.setAttribute('data-load', x.loadBearing ? 'yes' : 'no');
      var d = EV.docs[x.doc];
      li.appendChild(el('span', 'ev-sent-doc', d ? d.label : x.doc));
      li.appendChild(el('span', 'ev-sent-role', x.role));
      li.appendChild(el('span', 'ev-sent-tag',
        x.loadBearing ? 'load-bearing' : 'not load-bearing'));
      list.appendChild(li);
    });
    mount.appendChild(list);

    var v = el('div', 'callout callout--warn ev-comb-verdict');
    v.appendChild(el('p', null, C.verdict));
    mount.appendChild(v);
  }

  /* --------------------------------------------------------- acceptability
     "What if I send a gas bill?" — 14 probes, each with an RTW verdict and
     a Vetting verdict, so the honest "acceptable for one thing, not the
     other" answer is visible rather than collapsed to a single yes/no.     */
  function buildAcceptability() {
    var mount = document.getElementById('ev-acceptability');
    if (!mount) { return; }
    var A = EV.acceptability;
    if (!A) { return; }

    mount.textContent = '';

    /* attribution header */
    var hdr = el('div', 'ev-acc-hdr');
    var b = el('span', 'badge-serco', 'Acceptable Documents Guide');
    hdr.appendChild(b);
    hdr.appendChild(el('p', 'ev-acc-author', A.author + ' · ' + A.citation));
    hdr.appendChild(el('p', 'ev-acc-caveat', A.selfCaveat));
    var dist = el('p', 'ev-acc-dist');
    dist.innerHTML = '<strong>Key distinction:</strong> ' + A.keyDistinction +
      ' <span class="ev-acc-dist-page">[ADG p' +
      A.keyDistinctionPage + ']</span>';
    hdr.appendChild(dist);
    mount.appendChild(hdr);

    /* probe browser: left rail + right pane */
    var browser = el('div', 'ev-acc-browser');
    var rail = el('ul', 'ev-acc-rail');
    var pane = el('div', 'ev-acc-pane');

    function vabbr(v) {
      return v === 'accepted' ? 'A' : v === 'conditional' ? 'C' : 'R';
    }
    function vlabel(v) {
      return v.charAt(0).toUpperCase() + v.slice(1);
    }

    A.probes.forEach(function (p, i) {
      var li = el('li', 'ev-acc-tab');
      li.setAttribute('data-rtw', p.rtw.verdict);
      li.setAttribute('data-vet', p.vetting.verdict);
      li.setAttribute('role', 'button');
      li.setAttribute('tabindex', '0');
      li.setAttribute('aria-selected', 'false');
      li.appendChild(el('span', 'ev-acc-tab-label', p.label));
      var vtags = el('div', 'ev-acc-tab-vtags');
      var rt = el('span', 'ev-acc-vtag');
      rt.setAttribute('data-v', p.rtw.verdict);
      rt.setAttribute('title', 'RTW: ' + vlabel(p.rtw.verdict));
      rt.textContent = 'RTW ' + vabbr(p.rtw.verdict);
      var vt = el('span', 'ev-acc-vtag');
      vt.setAttribute('data-v', p.vetting.verdict);
      vt.setAttribute('title', 'Vetting: ' + vlabel(p.vetting.verdict));
      vt.textContent = 'ID ' + vabbr(p.vetting.verdict);
      vtags.appendChild(rt);
      vtags.appendChild(vt);
      li.appendChild(vtags);
      li.addEventListener('click', function () { selectProbe(i); });
      li.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { selectProbe(i); }
      });
      rail.appendChild(li);
    });

    function buildVerdictCol(purposeTitle, side) {
      var col = el('div', 'ev-acc-col');
      col.setAttribute('data-v', side.verdict);
      var colhd = el('div', 'ev-acc-col-hd');
      colhd.appendChild(el('span', 'ev-acc-col-title', purposeTitle));
      var badge = el('span', 'ev-acc-verdict');
      badge.setAttribute('data-v', side.verdict);
      badge.textContent = vlabel(side.verdict);
      colhd.appendChild(badge);
      col.appendChild(colhd);
      col.appendChild(el('p', 'ev-acc-why', side.why));
      var bq = el('blockquote', 'ev-acc-clause');
      bq.appendChild(el('p', null, '“' + side.clause + '”'));
      bq.appendChild(el('cite', null, '[ADG p' + side.page + ']'));
      col.appendChild(bq);
      if (side.group) {
        col.appendChild(el('p', 'ev-acc-group', side.group));
      }
      return col;
    }

    function renderProbeDetail(p) {
      pane.textContent = '';
      pane.appendChild(el('h3', 'ev-acc-probe-h', p.label));
      pane.appendChild(el('p', 'ev-acc-asked', p.asked));

      var split = el('div', 'ev-acc-split');
      split.appendChild(buildVerdictCol('Right to Work', p.rtw));
      split.appendChild(buildVerdictCol('Screening & Vetting ID', p.vetting));
      pane.appendChild(split);

      var consq = el('div', 'ev-acc-consequence');
      consq.appendChild(el('p', 'ev-acc-hd', 'What the agent does'));
      consq.appendChild(el('p', null, p.consequence));
      pane.appendChild(consq);

      if (p.remedy) {
        var rem = el('div', 'ev-acc-remedy');
        rem.appendChild(el('p', 'ev-acc-hd', 'What to ask for instead'));
        rem.appendChild(el('p', null, p.remedy));
        pane.appendChild(rem);
      }
    }

    function selectProbe(i) {
      rail.querySelectorAll('.ev-acc-tab').forEach(function (t, j) {
        t.setAttribute('aria-selected', j === i ? 'true' : 'false');
      });
      renderProbeDetail(A.probes[i]);
    }

    browser.appendChild(rail);
    browser.appendChild(pane);
    mount.appendChild(browser);

    selectProbe(0);
  }

  window.addEventListener('hashchange', function () {
    var i = indexFromHash();
    if (i !== current) { select(i, true); }
  });

  buildCombinations();
  buildAcceptability();
  root.setAttribute('data-ev-ready', 'yes');
  /* Instant on first paint: the page must never open blank waiting for a
     timer, and a deep-linked step should show its result immediately. */
  select(indexFromHash(), true);
}());
