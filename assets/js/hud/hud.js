/* ==========================================================================
   hud.js — DOM overlay: counters, event log, controls, detail drawer, and the
   accessible agent mirror.

   The mirror is always present in the DOM (visually hidden behind the canvas).
   It is simultaneously the screen-reader representation, the keyboard
   navigation surface, and the no-WebGL fallback view. One artefact, three jobs.
   ========================================================================== */
(function (X) {
  'use strict';

  var E = X.Engine;
  var A = X.Agents;
  var C = X.Config;

  var el = {};
  var lastCounters = { processed: -1, hours: -1, pushbacks: -1, sla: -1, human: -1, guard: -1, days: -1 };
  var lastLogSeq = 0;
  var lastHudMs = 0;
  var HUD_HZ = 10;
  var LOG_ROWS = 60;
  var selectedPod = -1;
  var announceAt = 0;
  var numCache = new Map();

  function $(id) { return document.getElementById(id); }

  function num(n) {
    var k = n | 0;
    var s = numCache.get(k);
    if (s === undefined) { s = String(k); numCache.set(k, s); }
    return s;
  }

  function init(state, controls) {
    el.processed = $('hud-processed');
    el.hours = $('hud-hours');
    el.pushbacks = $('hud-pushbacks');
    el.sla = $('hud-sla');
    el.human = $('hud-human');
    el.guard = $('hud-guard');
    el.days = $('hud-days');
    el.log = $('hud-log-list');
    el.detail = $('hud-detail');
    el.detailName = $('hud-detail-name');
    el.detailBody = $('hud-detail-body');
    el.mirror = $('agent-mirror');
    el.live = $('sim-live');
    el.fps = $('hud-fps');

    buildMirror(state);
    wireControls(state, controls);
  }

  /* ------------------------------------------------------------ the mirror */
  function buildMirror(state) {
    if (!el.mirror) return;
    var ring = A.RING;
    for (var i = 0; i < ring.length; i++) {
      var li = document.createElement('li');
      li.dataset.state = 'IDLE';
      li.dataset.pod = String(i);
      li.tabIndex = 0;
      li.setAttribute('role', 'button');

      var name = document.createElement('span');
      name.className = 'mname';
      name.textContent = ring[i].code + ' ' + ring[i].name;
      var st = document.createElement('span');
      st.className = 'mstate';
      st.textContent = 'Idle';

      li.appendChild(name);
      li.appendChild(st);
      el.mirror.appendChild(li);
    }

    /* Keyboard: Enter on a held agent releases it — the same intent a pod
       click sends, so there is one code path to test. */
    el.mirror.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var li = e.target.closest ? e.target.closest('li[data-pod]') : null;
      if (!li) return;
      e.preventDefault();
      var pod = parseInt(li.dataset.pod, 10);
      selectPod(pod);
      E.Intents.enqueue({ type: 'RESUME_HOLD', agent: pod + 1 });
    });
    el.mirror.addEventListener('click', function (e) {
      var li = e.target.closest ? e.target.closest('li[data-pod]') : null;
      if (!li) return;
      selectPod(parseInt(li.dataset.pod, 10));
    });
  }

  /* ------------------------------------------------------------- controls */
  function wireControls(state, ctl) {
    var play = $('btn-play');
    if (play) {
      play.addEventListener('click', function () {
        ctl.paused = !ctl.paused;
        play.setAttribute('aria-pressed', ctl.paused ? 'true' : 'false');
        play.textContent = ctl.paused ? '▶ Play' : '‖ Pause';
      });
    }

    var speed = $('sel-speed');
    if (speed) {
      speed.addEventListener('change', function () {
        ctl.speed = parseFloat(speed.value) || 1;
      });
    }

    var scenario = $('sel-scenario');
    if (scenario) {
      scenario.addEventListener('change', function () {
        E.Intents.enqueue({ type: 'SET_SCENARIO', scenario: scenario.value });
      });
    }

    var auto = $('btn-auto');
    if (auto) {
      auto.addEventListener('click', function () {
        var on = auto.getAttribute('aria-pressed') === 'true';
        auto.setAttribute('aria-pressed', on ? 'false' : 'true');
        auto.textContent = on ? 'Auto-release: off' : 'Auto-release: on';
        E.Intents.enqueue({ type: 'SET_AUTORESUME', value: !on });
      });
    }

    var proj = $('btn-projector');
    if (proj) {
      proj.addEventListener('click', function () {
        var on = proj.getAttribute('aria-pressed') === 'true';
        proj.setAttribute('aria-pressed', on ? 'false' : 'true');
        document.body.dataset.projector = on ? 'off' : 'on';
        if (X.View && X.View.setProjector) X.View.setProjector(!on);
      });
    }

    var motion = $('btn-motion');
    if (motion) {
      motion.addEventListener('click', function () {
        var on = motion.getAttribute('aria-pressed') === 'true';   /* on = reduced */
        motion.setAttribute('aria-pressed', on ? 'false' : 'true');
        motion.textContent = on ? 'Reduce motion: off' : 'Reduce motion: on';
        document.body.dataset.motion = on ? 'full' : 'reduce';
        if (X.View && X.View.setReducedMotion) X.View.setReducedMotion(!on);
      });
    }

    var quality = $('sel-quality');
    if (quality) {
      quality.addEventListener('change', function () {
        ctl.qualityOverride = quality.value;
        if (quality.value !== 'auto' && X.View && X.View.setTier) {
          X.View.setTier(parseInt(quality.value, 10));
        }
      });
    }

    var close = $('hud-detail-close');
    if (close) close.addEventListener('click', function () { hideDetail(); });

    /* Shortcuts: Space play/pause, [ ] speed, 1-5 scenario, Esc close */
    document.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === ' ') { e.preventDefault(); if (play) play.click(); }
      else if (e.key === '[') { stepSpeed(ctl, speed, -1); }
      else if (e.key === ']') { stepSpeed(ctl, speed, 1); }
      else if (e.key === 'Escape') { hideDetail(); }
      else if (/^[1-6]$/.test(e.key) && scenario) {
        var ix = parseInt(e.key, 10) - 1;
        if (ix < scenario.options.length) {
          scenario.selectedIndex = ix;
          scenario.dispatchEvent(new Event('change'));
        }
      }
    });
  }

  function stepSpeed(ctl, sel, dir) {
    var ix = C.speeds.indexOf(ctl.speed);
    if (ix < 0) ix = C.defaultSpeedIx;
    ix = Math.max(0, Math.min(C.speeds.length - 1, ix + dir));
    ctl.speed = C.speeds[ix];
    if (sel) sel.value = String(ctl.speed);
  }

  /* --------------------------------------------------------- detail drawer */
  function selectPod(podIx) {
    selectedPod = podIx;
    var agent = A.RING[podIx];
    if (!agent || !el.detail) return;
    el.detailName.textContent = agent.code + ' · ' + agent.name;
    el.detailBody.textContent = '';

    var dl = document.createElement('dl');
    [
      ['Does', agent.job],
      ['Systems', agent.systems.join(', ')],
      ['Saves', agent.saving || '—'],
      ['Wave', 'Wave ' + agent.wave],
      ['Guardrail', agent.detail.guardrails]
    ].forEach(function (p) {
      var dt = document.createElement('dt'); dt.textContent = p[0];
      var dd = document.createElement('dd'); dd.textContent = p[1];
      dl.appendChild(dt); dl.appendChild(dd);
    });
    el.detailBody.appendChild(dl);
    el.detail.hidden = false;
  }
  function hideDetail() { if (el.detail) el.detail.hidden = true; selectedPod = -1; }

  /* ---------------------------------------------------------------- counters
     Throttled to 10 Hz, and only written when the displayed integer changes,
     so the DOM is not touched on most frames. */
  function sync(state, nowMs) {
    if (nowMs - lastHudMs < 1000 / HUD_HZ) return;
    lastHudMs = nowMs;
    var m = E.metrics(state);

    if (el.processed && m.processed !== lastCounters.processed) {
      el.processed.textContent = num(m.processed);
      lastCounters.processed = m.processed;
    }
    var hrs = Math.round(m.hoursSaved * 10) / 10;
    if (el.hours && hrs !== lastCounters.hours) {
      el.hours.textContent = hrs.toFixed(1);
      lastCounters.hours = hrs;
    }
    if (el.pushbacks && m.pushbacksPrevented !== lastCounters.pushbacks) {
      el.pushbacks.textContent = num(m.pushbacksPrevented);
      lastCounters.pushbacks = m.pushbacksPrevented;
    }
    if (el.sla && m.slaPct !== lastCounters.sla) {
      el.sla.textContent = num(m.slaPct) + '%';
      lastCounters.sla = m.slaPct;
    }
    if (el.human && m.humanDecisions !== lastCounters.human) {
      el.human.textContent = num(m.humanDecisions);
      lastCounters.human = m.humanDecisions;
    }
    if (el.guard && m.guardsFired !== lastCounters.guard) {
      el.guard.textContent = num(m.guardsFired);
      lastCounters.guard = m.guardsFired;
    }
    var days = Math.round(m.leadDaysSaved * 10) / 10;
    if (el.days && days !== lastCounters.days) {
      el.days.textContent = days.toFixed(1);
      lastCounters.days = days;
    }
    if (el.fps && X.View && X.View.medianFrameMs) {
      var ms = X.View.medianFrameMs();
      el.fps.textContent = ms ? (Math.round(1000 / ms) + ' fps · tier ' +
        X.View.currentTier()) : '';
    }

    syncMirror(state);
    syncLog(state, nowMs);
  }

  function syncMirror(state) {
    if (!el.mirror) return;
    var kids = el.mirror.children;
    for (var i = 0; i < kids.length; i++) {
      var ag = state.agents[i + 1];
      var li = kids[i];
      if (li.dataset.state !== ag.state) {
        li.dataset.state = ag.state;
        var conf = C.state[ag.state] || C.state.IDLE;
        var txt = conf.label;
        if (ag.caseId) txt += ' — ' + ag.caseId;
        if (ag.state === 'WAITING_HUMAN') txt += ' (press Enter to release)';
        li.lastChild.textContent = txt;
      }
    }
  }

  /* Event log: append only the newly-emitted rows, batched in a fragment. */
  function syncLog(state, nowMs) {
    if (!el.log) return;
    var seq = state.log.seq;
    if (seq === lastLogSeq) return;
    var toAdd = Math.min(seq - lastLogSeq, 40);
    lastLogSeq = seq;

    var frag = document.createDocumentFragment();
    var collected = [];
    var want = toAdd;
    E.eachEvent(state, want, function (ev) { collected.push(ev); });
    /* eachEvent yields newest-first; prepend oldest-first for reading order */
    for (var i = collected.length - 1; i >= 0; i--) {
      var ev = collected[i];
      var li = document.createElement('li');
      li.className = 'ev--' + ev.kind;
      var t = document.createElement('span');
      t.className = 't';
      t.textContent = ev.t.toFixed(1) + 'h';
      li.appendChild(t);
      li.appendChild(document.createTextNode(ev.text));
      frag.appendChild(li);

      if (el.live && (ev.kind === 'guard' || ev.kind === 'escalate') &&
          nowMs - announceAt > 2000) {
        el.live.textContent = ev.text;
        announceAt = nowMs;
      }
    }
    el.log.appendChild(frag);
    while (el.log.childElementCount > LOG_ROWS) el.log.removeChild(el.log.firstChild);
    el.log.parentNode.scrollTop = el.log.parentNode.scrollHeight;
  }

  X.Hud = { init: init, sync: sync, selectPod: selectPod, hideDetail: hideDetail };
})(typeof module !== 'undefined' ? module.exports : (window.SVS = window.SVS || {}));
