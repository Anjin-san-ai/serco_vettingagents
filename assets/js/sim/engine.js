/* ==========================================================================
   engine.js - the vetting case simulation.

   HARD CONTRACT, mechanically enforced by test/run.js:
     - no renderer library, no window, no document, no wall clock, no unseeded
       randomness
     - receives dt; owns a seeded PRNG; therefore byte-reproducible from a seed
     - the renderer READS this state and never writes to it
     - the only inbound channel is Intents.enqueue(), drained at the top of step()

   Time mapping: 1 simulated second = 1 business hour.

   Each satellite agent has a FIFO work queue. Without one, a second case
   arriving at a busy agent overwrites the case in progress - which silently
   orphans it, leaks the case slot, and can release a human hold. The queue is
   also the more faithful model: these are work queues in real life.
   ========================================================================== */
(function (X) {
  'use strict';

  /* ---------------------------------------------------------------- config */
  var CAP_PACKETS = 128;
  var CAP_CASES = 64;
  var LOG_SLOTS = 256;

  var SIM = {
    N_AGENTS: 11,              /* 0 = orchestrator, 1..10 = A1..A10 */
    N_TRACES: 10,
    PACKET_SPEED: 0.9,         /* fraction of an edge per sim second */
    SPAWN_INTERVAL: 1.6,       /* sim seconds between new cases */
    AUTO_RESUME_AFTER: 1.8,    /* sim seconds a hold waits before auto-release */
    MAX_IN_FLIGHT: 24,         /* back-pressure: see spawnCase */
    ORCH_PULSE: 0.4,           /* cosmetic only - never gates routing */
    DONE_DECAY: 0.55,
    RTW_AHT_MIN: 5,            /* [WS p4]  876/month at ~5 min */
    AUDIT_AHT_MIN: 20,         /* [WS p9]  643/month at ~20 min */
    REWORK_MIN: 5,             /* [WS p7]  5 min per error occurrence */
    RTW_SLA_HOURS: 2,          /* [WS p4] */
    AUDIT_SLA_HOURS: 24,       /* [WS p9]  3 working days */
    /* Animation timing is chosen for legibility, so it must NOT be charged to
       the SLA clock. The clock accrues the DOCUMENTED handling time instead:
       each hop adds its share of the process AHT. A human wait is tracked
       separately, because Serco report the SLA on the team's own handling -
       a pushback closes the ticket and starts a new cycle. */
    HUMAN_WAIT_H: 4,           /* agentic: manager prompted in-system, same day */
    PUSHBACK_DELAY_H: 24       /* today: ~3 working days waiting for a manager [VP p4] */
  };

  /* BLOCKED was declared here and in config.state but NEVER assigned by any
     code path, so the legend advertised a state that could not occur. Removed
     rather than documented. The view's `C.state[x] || C.state.IDLE` fallback
     handles any unknown value safely if one is ever added back. */
  var STATES = {
    IDLE: 'IDLE', WORKING: 'WORKING', WAITING_HUMAN: 'WAITING_HUMAN',
    ESCALATED: 'ESCALATED', DONE: 'DONE'
  };

  /* Agent ids in ring order - must match assets/js/sim/agents.js */
  var AGENT_IDS = [
    'orchestrator',
    'manager-copilot', 'doc-intelligence', 'id-verify', 'reconciliation',
    'screening-setup', 'progress-chase', 'inbox', 'adjudication',
    'records', 'follow-on'
  ];
  var IX = {};
  for (var i = 0; i < AGENT_IDS.length; i++) IX[AGENT_IDS[i]] = i;

  /* Per-agent dwell in sim seconds. Index 0 is unused: the orchestrator routes
     immediately, because a router that queues is a bottleneck by construction. */
  var DWELL = [0, 0.40, 0.34, 0.30, 0.28, 0.36, 0.30, 0.32, 0.55, 0.42, 0.34];

  /* ---------------------------------------------------------------- routing
     Hub and spoke, exactly as the reference architecture is drawn: every hop
     runs satellite -> orchestrator -> satellite. 10 physical traces carry 20
     directed edges.                                                          */
  function edgeIndex(from, to) {
    return from === 0 ? (to - 1) : (SIM.N_TRACES + (from - 1));
  }
  function edgeTrace(e) { return e % SIM.N_TRACES; }
  function edgeIsOutbound(e) { return e < SIM.N_TRACES; }

  /* ------------------------------------------------------------- scenarios */
  var ROUTE_RTW = ['manager-copilot', 'doc-intelligence', 'id-verify',
                   'reconciliation', 'screening-setup', 'progress-chase',
                   'adjudication'];
  var ROUTE_AUDIT = ['doc-intelligence', 'reconciliation', 'records', 'follow-on'];

  var SCENARIOS = {
    'happy-path': {
      label: 'Happy path', journey: 'RTW', route: ROUTE_RTW, branch: null
    },
    'id-mismatch': {
      label: 'ID / Appian mismatch', journey: 'RTW', route: ROUTE_RTW,
      branch: { at: 'reconciliation', kind: 'bounce', to: 'manager-copilot',
                note: 'Passport name does not match Appian - correction proposed',
                prevents: true }
    },
    'insufficient-id': {
      label: 'Insufficient ID', journey: 'RTW', route: ROUTE_RTW,
      branch: { at: 'manager-copilot', kind: 'hold',
                note: 'Not enough ID to proceed - decision tree prompting manager',
                prevents: true }
    },
    'conviction-declared': {
      label: 'Conviction declared', journey: 'AUDIT', route: ROUTE_AUDIT,
      branch: { at: 'follow-on', kind: 'escalate',
                note: 'Criminal conviction declared on signed contract',
                guard: 'ER confidentiality guard: role sits within ER - ticket withheld from ER queue' }
    },
    'visa-required': {
      label: 'Visa required', journey: 'AUDIT', route: ROUTE_AUDIT,
      branch: { at: 'records', kind: 'dwell', extra: 0.7,
                note: 'Visa management required - writing to SAP visa register, not Excel' }
    }
  };
  /* 'live' mixes them at roughly the documented 23% pushback rate, using the
     relative shares of the four root causes from [WS p7]: 14/13/6/3. */
  var LIVE_MIX = [
    ['happy-path', 0.72],
    ['id-mismatch', 0.09],
    ['insufficient-id', 0.07],
    ['conviction-declared', 0.08],
    ['visa-required', 0.04]
  ];

  var NAMES = ['A. Okafor', 'J. Nowak', 'S. Ahmed', 'R. Campbell', 'M. Silva',
               'T. Brennan', 'K. Adeyemi', 'L. Mwangi', 'D. Kaur', 'P. Novak',
               'C. Whitfield', 'N. Petrov', 'H. Yilmaz', 'B. Osei', 'E. Laurent'];
  var CLEARANCES = ['BPSS', 'DBS', 'Enhanced DBS', 'BS7858', 'NSV', 'SC'];

  /* ------------------------------------------------------------- mulberry32
     Small, fast, seedable, deterministic across platforms.                   */
  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* --------------------------------------------------------------- event log
     Fixed ring buffer of reused objects: nothing allocated per event.        */
  function makeLog() {
    var slots = new Array(LOG_SLOTS);
    for (var i = 0; i < LOG_SLOTS; i++) {
      slots[i] = { seq: -1, t: 0, kind: '', agent: -1, caseId: '', text: '' };
    }
    return { slots: slots, seq: 0 };
  }
  function emit(state, kind, agentIx, caseId, text) {
    var log = state.log;
    var slot = log.slots[log.seq % LOG_SLOTS];
    slot.seq = log.seq;
    slot.t = state.simTime;
    slot.kind = kind;
    slot.agent = agentIx;
    slot.caseId = caseId;
    slot.text = text;
    log.seq++;
  }

  /* ---------------------------------------------------------- state factory */
  function makeState(seed) {
    var st = {
      seed: seed >>> 0,
      rng: makeRng(seed),
      simTime: 0,
      scenario: 'live',
      spawnTimer: 0.4,
      autoResume: true,
      caseSeq: 10400,

      agents: [],
      traceHeat: new Float32Array(SIM.N_TRACES),

      pActive: new Uint8Array(CAP_PACKETS),
      pCase: new Int32Array(CAP_PACKETS),
      pEdge: new Int32Array(CAP_PACKETS),
      pU: new Float32Array(CAP_PACKETS),
      pU0: new Float32Array(CAP_PACKETS),
      pStatus: new Uint8Array(CAP_PACKETS),
      pFree: new Int32Array(CAP_PACKETS),
      pFreeN: CAP_PACKETS,
      pLive: 0,

      cases: [],
      cFree: [],

      counters: {
        processed: 0, minutesSaved: 0, pushbacksPrevented: 0,
        slaMet: 0, slaTotal: 0, humanDecisions: 0, guardsFired: 0,
        cycleTotal: 0, inFlight: 0, dropped: 0, backpressure: 0,
        leadTotal: 0, baselineTotal: 0
      },
      log: makeLog()
    };

    for (var a = 0; a < SIM.N_AGENTS; a++) {
      st.agents.push({
        ix: a, id: AGENT_IDS[a], state: STATES.IDLE, stateEnteredAt: 0,
        caseId: '', note: '', dwellLeft: 0, holdWaited: 0,
        queue: [], caseIx: -1, bounceTo: -1,
        escalateNext: false, resumeAfterEscalate: false,
        handled: 0
      });
    }
    for (var p = 0; p < CAP_PACKETS; p++) st.pFree[p] = CAP_PACKETS - 1 - p;
    for (var c = 0; c < CAP_CASES; c++) {
      st.cases.push({
        active: false, id: '', name: '', clearance: '', journey: 'RTW',
        scenario: 'happy-path', label: '', route: null, hop: -1, atAgent: 0,
        bounced: false, escalated: false, slaClock: 0, slaHours: 0,
        branchDone: false, ahtMin: 0, hops: 1, humanWaitH: 0, held: false,
        confidence: 0
      });
      st.cFree.push(c);
    }
    return st;
  }

  /* ----------------------------------------------------------------- intents
     The renderer's ONLY way to affect the simulation. A pod click and the
     auto-resume timer both arrive here, so the human-in-the-loop pause is
     testable without a browser.                                              */
  var intentQueue = [];
  var Intents = {
    enqueue: function (intent) { intentQueue.push(intent); },
    pending: function () { return intentQueue.length; },
    _drain: function () { var q = intentQueue; intentQueue = []; return q; },
    _reset: function () { intentQueue = []; }
  };

  /* ----------------------------------------------------------------- helpers */
  function pickWeighted(rng, table) {
    var r = rng(), acc = 0;
    for (var i = 0; i < table.length; i++) {
      acc += table[i][1];
      if (r <= acc) return table[i][0];
    }
    return table[table.length - 1][0];
  }

  function allocPacket(st, caseIx, edge, status) {
    if (st.pFreeN === 0) { st.counters.dropped++; return -1; }
    var p = st.pFree[--st.pFreeN];
    st.pActive[p] = 1;
    st.pCase[p] = caseIx;
    st.pEdge[p] = edge;
    st.pU[p] = 0;
    st.pU0[p] = 0;
    st.pStatus[p] = status || 0;
    st.pLive++;
    return p;
  }
  function freePacket(st, p) {
    st.pActive[p] = 0;
    st.pFree[st.pFreeN++] = p;
    st.pLive--;
  }

  function setAgentState(st, ix, newState, caseId, note) {
    var ag = st.agents[ix];
    if (ag.state === newState && ag.caseId === (caseId || '')) {
      if (note != null) ag.note = note;
      return;
    }
    ag.state = newState;
    ag.stateEnteredAt = st.simTime;
    ag.caseId = caseId || '';
    ag.note = note || '';
  }

  function busy(ag) {
    return ag.state === STATES.WORKING ||
           ag.state === STATES.WAITING_HUMAN ||
           ag.state === STATES.ESCALATED;
  }

  function dispatch(st, caseIx, to) {
    var cs = st.cases[caseIx];
    var status = cs.escalated ? 2 : (cs.bounced ? 1 : 0);
    allocPacket(st, caseIx, edgeIndex(cs.atAgent, to), status);
  }

  /* Pull the next queued case if this agent is free. */
  function tryStart(st, ix) {
    if (ix === 0) return;
    var ag = st.agents[ix];
    while (!busy(ag) && ag.queue.length) {
      var caseIx = ag.queue.shift();
      var cs = st.cases[caseIx];
      if (!cs || !cs.active) continue;          /* case died while queued */
      cs.atAgent = ix;
      setAgentState(st, ix, STATES.WORKING, cs.id, '');
      ag.dwellLeft = DWELL[ix];
      ag.caseIx = caseIx;
      emit(st, 'arrive', ix, cs.id, cs.id + ' → ' + AGENT_IDS[ix]);
      return;
    }
  }

  /* Back-pressure. A human hold occupies its agent for far longer than the
     agent's own dwell, so in a hold-heavy scenario the arrival rate exceeds
     that agent's service rate and its queue grows without bound. Real work
     queues are bounded by capacity, so the simulation bounds itself too -
     otherwise the case pool leaks and the demo silently stalls. */
  function spawnCase(st) {
    if (st.cFree.length === 0) return;
    if (st.counters.inFlight >= SIM.MAX_IN_FLIGHT) { st.counters.backpressure++; return; }
    var key = st.scenario === 'live' ? pickWeighted(st.rng, LIVE_MIX) : st.scenario;
    var sc = SCENARIOS[key];
    if (!sc) return;

    var ci = st.cFree.pop();
    var cs = st.cases[ci];
    st.caseSeq += 1 + ((st.rng() * 4) | 0);

    cs.active = true;
    cs.scenario = key;
    cs.label = sc.label;
    cs.journey = sc.journey;
    cs.route = sc.route;
    cs.hop = -1;
    cs.atAgent = 0;
    cs.bounced = false;
    cs.escalated = false;
    cs.branchDone = false;
    cs.slaClock = 0;
    cs.humanWaitH = 0;
    cs.held = false;
    cs.ahtMin = sc.journey === 'RTW' ? SIM.RTW_AHT_MIN : SIM.AUDIT_AHT_MIN;
    cs.hops = sc.route.length;
    cs.slaHours = sc.journey === 'RTW' ? SIM.RTW_SLA_HOURS : SIM.AUDIT_SLA_HOURS;
    cs.id = (sc.journey === 'RTW' ? 'RTW-' : 'AUD-') + st.caseSeq;
    cs.name = NAMES[(st.rng() * NAMES.length) | 0];
    cs.clearance = CLEARANCES[(st.rng() * CLEARANCES.length) | 0];
    /* Document-extraction confidence, for the Trust panel's distribution.
       DISPLAY AND TELEMETRY ONLY: nothing in step() branches on this value.
       If it ever gates routing, the simulation stops matching the documented
       process and the claim that agents escalate below threshold becomes a
       property of this number rather than of the design. Skewed high with a
       tail, which is what document OCR confidence actually looks like. */
    cs.confidence = 0.62 + 0.37 * Math.pow(st.rng(), 0.55);

    st.counters.inFlight++;
    emit(st, 'spawn', 0, cs.id,
      cs.id + ' · ' + cs.name + ' · ' + cs.clearance + ' · ' + sc.label);
    advance(st, ci);
  }

  function advance(st, caseIx) {
    var cs = st.cases[caseIx];
    cs.hop++;
    if (cs.hop >= cs.route.length) { complete(st, caseIx); return; }
    dispatch(st, caseIx, IX[cs.route[cs.hop]]);
  }

  function complete(st, caseIx) {
    var cs = st.cases[caseIx];
    var c = st.counters;
    c.processed++;
    c.inFlight--;
    c.minutesSaved += cs.journey === 'RTW' ? SIM.RTW_AHT_MIN : SIM.AUDIT_AHT_MIN;
    if (cs.bounced) c.minutesSaved += SIM.REWORK_MIN;
    c.slaTotal++;
    if (cs.slaClock <= cs.slaHours) c.slaMet++;
    c.cycleTotal += cs.slaClock;

    /* Lead-time comparison. Under today's process a defect of this kind is
       pushed back and waits ~3 working days for the manager to return correct
       details [VP p4]. In the agentic flow the manager is prompted in-system
       and the case never leaves the pipeline, so the wait is hours not days.
       That difference is the headline benefit, so it is measured explicitly. */
    var leadH = cs.slaClock + cs.humanWaitH;
    var baseH = (cs.ahtMin / 60) + (cs.held ? SIM.PUSHBACK_DELAY_H : 0);
    c.leadTotal += leadH;
    c.baselineTotal += baseH;

    emit(st, 'done', 0, cs.id,
      cs.id + ' complete · ' + cs.ahtMin + ' min handling · lead ' +
      leadH.toFixed(1) + ' h vs ' + baseH.toFixed(1) + ' h today · ' +
      (cs.slaClock <= cs.slaHours ? 'SLA met' : 'SLA breached'));
    cs.active = false;
    st.cFree.push(caseIx);
  }

  /* An agent finished its dwell. */
  function finishWork(st, agIx) {
    var ag = st.agents[agIx];
    var caseIx = ag.caseIx;
    if (caseIx < 0) { setAgentState(st, agIx, STATES.IDLE, ''); return; }
    var cs = st.cases[caseIx];
    if (!cs || !cs.active) { ag.caseIx = -1; setAgentState(st, agIx, STATES.IDLE, ''); return; }

    var sc = SCENARIOS[cs.scenario];
    var br = sc && sc.branch;

    if (br && !cs.branchDone && br.at === AGENT_IDS[agIx]) {
      cs.branchDone = true;

      if (br.kind === 'dwell') {
        emit(st, 'branch', agIx, cs.id, br.note);
        ag.dwellLeft = br.extra;
        return;
      }
      if (br.kind === 'bounce') {
        cs.bounced = true;
        cs.held = true;
        st.counters.pushbacksPrevented++;
        st.counters.humanDecisions++;
        ag.bounceTo = IX[br.to];
        ag.holdWaited = 0;
        setAgentState(st, agIx, STATES.WAITING_HUMAN, cs.id, br.note);
        emit(st, 'human', agIx, cs.id, br.note + ' — pushback prevented');
        return;
      }
      if (br.kind === 'escalate') {
        cs.escalated = true;
        cs.held = true;
        st.counters.humanDecisions++;
        ag.escalateNext = true;
        ag.holdWaited = 0;
        setAgentState(st, agIx, STATES.WAITING_HUMAN, cs.id, br.note);
        emit(st, 'human', agIx, cs.id, br.note);
        return;
      }
      /* kind === 'hold' */
      cs.held = true;
      st.counters.humanDecisions++;
      ag.holdWaited = 0;
      setAgentState(st, agIx, STATES.WAITING_HUMAN, cs.id, br.note);
      emit(st, 'human', agIx, cs.id, br.note);
      return;
    }

    handOff(st, agIx, caseIx);
  }

  /* Hand the case back to the orchestrator and free the agent. */
  function handOff(st, agIx, caseIx) {
    var ag = st.agents[agIx];
    var cs = st.cases[caseIx];
    /* one hop of real work completed: accrue its share of the documented AHT */
    cs.slaClock += (cs.ahtMin / 60) / cs.hops;
    ag.handled++;
    cs.atAgent = agIx;
    ag.caseIx = -1;
    setAgentState(st, agIx, STATES.DONE, cs.id);
    dispatch(st, caseIx, 0);
  }

  /* Release a human hold. Reached from a pod click and from the auto-resume
     timer through exactly the same intent path. */
  function release(st, agIx) {
    var ag = st.agents[agIx];
    if (ag.state !== STATES.WAITING_HUMAN) return false;
    var caseIx = ag.caseIx;
    if (caseIx < 0) { setAgentState(st, agIx, STATES.IDLE, ''); return false; }
    var cs = st.cases[caseIx];
    if (!cs || !cs.active) { ag.caseIx = -1; setAgentState(st, agIx, STATES.IDLE, ''); return false; }
    var sc = SCENARIOS[cs.scenario];
    var br = sc && sc.branch;

    /* Escalation is visible as its own state before the case moves on, so the
       ER confidentiality guard can be seen firing. */
    if (ag.escalateNext) {
      ag.escalateNext = false;
      ag.resumeAfterEscalate = true;
      ag.dwellLeft = 0.5;
      setAgentState(st, agIx, STATES.ESCALATED, cs.id, br && br.guard);
      st.counters.guardsFired++;
      emit(st, 'escalate', agIx, cs.id, 'Escalated to Employment Relations');
      if (br && br.guard) emit(st, 'guard', agIx, cs.id, br.guard);
      return true;
    }

    cs.humanWaitH += SIM.HUMAN_WAIT_H;
    emit(st, 'resume', agIx, cs.id, 'Released by human decision');

    if (ag.bounceTo >= 0) {
      var backIx = cs.route.indexOf(AGENT_IDS[ag.bounceTo]);
      ag.bounceTo = -1;
      if (backIx >= 0) cs.hop = backIx - 1;   /* re-run from the copilot onward */
    }
    handOff(st, agIx, caseIx);
    return true;
  }

  /* -------------------------------------------------------------------- step */
  function step(st, dt) {
    /* 1. drain intents */
    var q = Intents._drain();
    for (var qi = 0; qi < q.length; qi++) {
      var it = q[qi];
      if (!it) continue;
      if (it.type === 'RESUME_HOLD') {
        var ix = typeof it.agent === 'number' ? it.agent : IX[it.agentId];
        if (ix != null && ix > 0 && ix < SIM.N_AGENTS) release(st, ix);
      } else if (it.type === 'SET_SCENARIO') {
        st.scenario = it.scenario;
        emit(st, 'branch', 0, '', 'Scenario set to ' + (it.scenario === 'live'
          ? 'live mix (23% pushback)'
          : (SCENARIOS[it.scenario] ? SCENARIOS[it.scenario].label : it.scenario)));
      } else if (it.type === 'SET_AUTORESUME') {
        st.autoResume = !!it.value;
      }
    }

    st.simTime += dt;

    /* 2. decay trace heat */
    var heat = st.traceHeat;
    for (var h = 0; h < heat.length; h++) {
      heat[h] -= dt * 1.4;
      if (heat[h] < 0) heat[h] = 0;
    }

    /* 3. advance packets */
    for (var p = 0; p < CAP_PACKETS; p++) {
      if (!st.pActive[p]) continue;
      st.pU0[p] = st.pU[p];
      var u = st.pU[p] + dt * SIM.PACKET_SPEED;
      var tr = edgeTrace(st.pEdge[p]);
      if (heat[tr] < 1) heat[tr] = Math.min(1, heat[tr] + dt * 3.0);

      if (u < 1) { st.pU[p] = u; continue; }

      var caseIx = st.pCase[p];
      var edge = st.pEdge[p];
      var arrivedAt = edgeIsOutbound(edge) ? (edge + 1) : 0;
      freePacket(st, p);

      var cs = st.cases[caseIx];
      if (!cs || !cs.active) continue;

      if (arrivedAt === 0) {
        /* The orchestrator routes immediately. A router that queues is a
           bottleneck by construction, and its state here is cosmetic. */
        cs.atAgent = 0;
        setAgentState(st, 0, STATES.WORKING, cs.id, 'Routing ' + cs.id);
        advance(st, caseIx);
      } else {
        st.agents[arrivedAt].queue.push(caseIx);
      }
    }

    /* 4. advance agents */
    for (var a = 0; a < SIM.N_AGENTS; a++) {
      var ag = st.agents[a];

      if (a === 0) {
        if (ag.state === STATES.WORKING &&
            st.simTime - ag.stateEnteredAt > SIM.ORCH_PULSE) {
          setAgentState(st, 0, STATES.IDLE, '');
        }
        continue;
      }

      if (ag.state === STATES.WORKING || ag.state === STATES.ESCALATED) {
        ag.dwellLeft -= dt;
        if (ag.dwellLeft <= 0) {
          if (ag.resumeAfterEscalate) {
            ag.resumeAfterEscalate = false;
            var ec = ag.caseIx;
            if (ec >= 0 && st.cases[ec].active) handOff(st, a, ec);
            else { ag.caseIx = -1; setAgentState(st, a, STATES.IDLE, ''); }
          } else {
            finishWork(st, a);
          }
        }
      } else if (ag.state === STATES.WAITING_HUMAN) {
        ag.holdWaited += dt;
        if (st.autoResume && ag.holdWaited >= SIM.AUTO_RESUME_AFTER) {
          Intents.enqueue({ type: 'RESUME_HOLD', agent: a });
        }
      } else if (ag.state === STATES.DONE) {
        if (st.simTime - ag.stateEnteredAt > SIM.DONE_DECAY) {
          setAgentState(st, a, STATES.IDLE, '');
        }
      }

      tryStart(st, a);
    }

    /* 5. spawn */
    st.spawnTimer -= dt;
    if (st.spawnTimer <= 0) {
      st.spawnTimer = SIM.SPAWN_INTERVAL;
      spawnCase(st);
    }
  }

  /* ------------------------------------------------------------------ metrics */
  function metrics(st) {
    var c = st.counters;
    return {
      processed: c.processed,
      hoursSaved: c.minutesSaved / 60,
      pushbacksPrevented: c.pushbacksPrevented,
      slaPct: c.slaTotal ? Math.round((c.slaMet / c.slaTotal) * 100) : 100,
      humanDecisions: c.humanDecisions,
      guardsFired: c.guardsFired,
      avgCycle: c.slaTotal ? (c.cycleTotal / c.slaTotal) : 0,
      avgLead: c.slaTotal ? (c.leadTotal / c.slaTotal) : 0,
      avgBaselineLead: c.slaTotal ? (c.baselineTotal / c.slaTotal) : 0,
      /* 8-hour working day */
      leadDaysSaved: Math.max(0, (c.baselineTotal - c.leadTotal) / 8),
      inFlight: c.inFlight,
      packets: st.pLive,
      dropped: c.dropped,
      backpressure: c.backpressure
    };
  }

  /* Iterate live cases, newest first, without allocating. */
  function eachActiveCase(st, fn) {
    for (var i = st.cases.length - 1; i >= 0; i--) {
      if (st.cases[i].active) fn(st.cases[i], i);
    }
  }

  /* Newest-first iteration over the ring buffer, no allocation. */
  function eachEvent(st, n, fn) {
    var log = st.log;
    var count = Math.min(n, log.seq, LOG_SLOTS);
    for (var k = 0; k < count; k++) {
      fn(log.slots[(log.seq - 1 - k) % LOG_SLOTS]);
    }
  }

  X.Engine = {
    SIM: SIM, STATES: STATES, AGENT_IDS: AGENT_IDS, IX: IX,
    SCENARIOS: SCENARIOS, LIVE_MIX: LIVE_MIX,
    CAP_PACKETS: CAP_PACKETS, CAP_CASES: CAP_CASES,
    createState: makeState,
    step: step,
    metrics: metrics,
    eachEvent: eachEvent,
    eachActiveCase: eachActiveCase,
    edgeIndex: edgeIndex,
    edgeTrace: edgeTrace,
    edgeIsOutbound: edgeIsOutbound,
    Intents: Intents
  };
})(typeof module !== 'undefined' ? module.exports : (window.SVS = window.SVS || {}));
