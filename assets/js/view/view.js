/* ==========================================================================
   view.js — per-frame rendering. A PURE READ of SimState.

   Nothing in this file writes to the simulation. Its only channel back is
   Engine.Intents.enqueue(), used by picking.

   Allocation discipline: every Vector3/Color/Matrix4 used per frame is
   module-scoped and reused. No `new` inside sync(), no closures in hot loops,
   no string building. A steady-state DevTools recording should show a flat
   heap with no minor GC.
   ========================================================================== */
(function (X) {
  'use strict';

  var C = X.Config;
  var E = X.Engine;
  var T;      /* THREE */
  var S;      /* the built scene */

  /* ------------------------------------------------- module-scoped scratch */
  var _v = null, _v2 = null, _m = null, _q = null, _c = null, _c2 = null;
  var _ray = null, _ptr = null;

  /* frozen palette: THREE.Color instances built once, never per frame */
  var PAL = {};

  var tier = 0;
  var tierChangedAt = -1e9;
  var frameTimes = null;
  var ftIndex = 0, ftFilled = 0;
  var reducedMotion = false;
  var projector = false;
  var azimuth = 0, azimuthTarget = 0;
  var driftPhase = 0;
  var pingState = null;

  function init(THREE, built) {
    T = THREE; S = built;
    _v = new T.Vector3(); _v2 = new T.Vector3();
    _m = new T.Matrix4(); _q = new T.Quaternion();
    _c = new T.Color(); _c2 = new T.Color();
    _ray = new T.Raycaster(); _ptr = new T.Vector2();
    frameTimes = new Float32Array(C.perfWindow);

    var keys = Object.keys(C.state);
    for (var i = 0; i < keys.length; i++) {
      PAL[keys[i]] = new T.Color(C.state[keys[i]].colour);
    }
    PAL._packet = [];
    for (i = 0; i < C.packetColours.length; i++) {
      PAL._packet.push(new T.Color(C.packetColours[i]));
    }
    PAL._traceHot = new T.Color(C.col.redBright);

    pingState = { t: [0.9, 1.6, 2.3] };
    applyTier(0, true);
  }

  /* ----------------------------------------------------------------- camera */
  function resize(w, h) {
    var aspect = w / h;
    var d = C.camHalfHeight;
    /* if the viewport is narrow, raise the half-height so the ring still fits */
    if (aspect < 1.35) d = C.camHalfHeight * (1.35 / aspect) * 0.86;
    S.camera.left = -d * aspect;
    S.camera.right = d * aspect;
    S.camera.top = d;
    S.camera.bottom = -d;
    S.camera.updateProjectionMatrix();
  }

  function setAzimuth(delta) {
    azimuthTarget += delta;
    if (azimuthTarget > C.camAzimuthClamp) azimuthTarget = C.camAzimuthClamp;
    if (azimuthTarget < -C.camAzimuthClamp) azimuthTarget = -C.camAzimuthClamp;
  }

  function updateCamera(dt) {
    azimuth += (azimuthTarget - azimuth) * Math.min(1, dt * 6);
    var drift = 0;
    if (!reducedMotion && C.tiers[tier].drift) {
      driftPhase += dt / C.camDriftPeriod * Math.PI * 2;
      drift = Math.sin(driftPhase) * C.camDriftAmp * 0.02;
    }
    var a = azimuth + drift;
    var r = Math.sqrt(C.camPos[0] * C.camPos[0] + C.camPos[2] * C.camPos[2]);
    var base = Math.atan2(C.camPos[2], C.camPos[0]);
    S.camera.position.set(Math.cos(base + a) * r, C.camPos[1], Math.sin(base + a) * r);
    S.camera.lookAt(C.camTarget[0], C.camTarget[1], C.camTarget[2]);
  }

  /* -------------------------------------------------------------- pod state */
  function ringGeoFor(name) { return S.rings[name] || S.rings.thin; }

  function syncPod(pv, agent, simTime, ix) {
    var st = C.state[agent.state] || C.state.IDLE;
    var phase = simTime - agent.stateEnteredAt;

    /* discrete swaps, only on change */
    if (pv.state !== agent.state) {
      pv.state = agent.state;
      if (pv.ringName !== st.ring) {
        pv.ringName = st.ring;
        pv.ring.geometry = ringGeoFor(st.ring);
      }
      /* move the chip texture to this state's row */
      var row = S.atlasIndex.indexOf(agent.state);
      if (row < 0) row = 0;
      pv.glyph.material.map.offset.set(0, 1 - (row + 1) / S.atlasRows);
      pv.beacon.visible = !!st.beacon && !reducedMotion ? true : !!st.beacon;
    }

    /* colour */
    _c.copy(PAL[agent.state] || PAL.IDLE);
    pv.ring.material.color.copy(_c);
    pv.halo.material.color.copy(_c);
    pv.beacon.material.color.copy(_c);
    /* the visor lens cluster is the pod's "eye": it carries state colour too, so
       the front of the agent reads even when the ring is edge-on to the camera */
    if (pv.lenses) {
      pv.lenses.material.color.copy(_c);
      pv.lenses.material.opacity = 0.45 + 0.5 * st.dim;
    }
    if (pv.skirt) {
      pv.skirt.material.color.copy(_c);
      pv.skirt.material.opacity = 0.16 + 0.26 * st.dim;
    }
    /* The bust is the pod's dominant surface, so tinting it is the state change
       you cannot miss - the ring, halo and lenses are all details by comparison.
       Idle keeps a trace so the pod never looks unlit. */
    if (pv.body) {
      pv.body.material.emissive.copy(_c);
      pv.body.material.emissiveIntensity =
        agent.state === 'IDLE' ? 0.04 : C.bodyTintMax * st.dim;
    }

    /* continuous channels, derived from phase — no tween objects */
    var lift = st.lift, tilt = st.tilt, ringOp = 0.45 * st.dim + 0.25;
    var haloOp = 0.0, bob = 0, spin = pv.ring.rotation.z;

    if (reducedMotion) {
      if (st.motion === 'strobe' || st.motion === 'blink') ringOp = 0.85;
      haloOp = st.dim * 0.30;
    } else {
      switch (st.motion) {
        case 'spin':
          spin += C.ringSpinRate * 0.016;
          bob = Math.sin(phase * C.bobRate * Math.PI * 2) * C.bobAmp;
          haloOp = 0.26 + 0.10 * Math.sin(phase * 3.1);
          break;
        case 'blink':
          ringOp = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(phase * Math.PI));
          haloOp = 0.30;
          break;
        case 'strobe':
          ringOp = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(phase * C.strobeRate * Math.PI * 2));
          haloOp = 0.40;
          break;
        case 'pop':
          var p = Math.min(1, phase / 0.45);
          haloOp = (1 - p) * 0.55;
          ringOp = 0.5 + (1 - p) * 0.4;
          break;
        default:
          haloOp = 0.0;
      }
    }

    pv.ring.rotation.z = spin;
    pv.ring.material.opacity = ringOp;
    pv.halo.material.opacity = haloOp * (projector ? 1.5 : 1);
    pv.halo.scale.setScalar(1 + haloOp * 0.5);

    /* elevation + tilt: the channels that read at ten metres */
    pv.inner.position.y = lift + bob;
    pv.inner.rotation.z = tilt;

    if (pv.beacon.visible) {
      pv.beacon.material.opacity = reducedMotion
        ? 0.55
        : 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(phase * 2.2));
    }

    /* Chip and halo billboards face the camera. The chip lives at the scene
       root (see scene.js) so this local copy IS the world orientation and it
       renders upright. It keeps full opacity in every state - a status
       indicator that fades is one you cannot trust at a glance. */
    pv.glyph.quaternion.copy(_q);
    pv.glyph.position.y = C.chipY + lift * 1.4;
    pv.halo.quaternion.copy(_q);

    /* data rain follows activity */
    var rm = S.rain[ix];
    if (rm) {
      var active = agent.state === 'WORKING' || agent.state === 'WAITING_HUMAN' ||
                   agent.state === 'ESCALATED';
      var want = C.tiers[tier].rain && active;
      if (rm.visible !== want) rm.visible = want;
      if (want) {
        rm.material.opacity = 0.42;
        if (!reducedMotion) rm.material.map.offset.y -= C.rainSpeed * 0.016;
        rm.material.color.copy(_c);
      }
    }
  }

  /* --------------------------------------------------------------- packets */
  function samplePath(lut, u, out) {
    var f = u * 64;
    var i = f | 0; if (i > 63) i = 63;
    var t = f - i;
    var a = i * 3, b = (i + 1) * 3;
    out.set(
      lut[a] + (lut[b] - lut[a]) * t,
      lut[a + 1] + (lut[b + 1] - lut[a + 1]) * t,
      lut[a + 2] + (lut[b + 2] - lut[a + 2]) * t
    );
  }

  function syncPackets(state, alpha) {
    var cores = S.packetCores, halos = S.packetHalos;
    var luts = S.edgeLUTs.pos;
    var n = 0;
    var showHalos = C.tiers[tier].packetHalos;

    for (var p = 0; p < E.CAP_PACKETS; p++) {
      if (!state.pActive[p]) continue;
      var edge = state.pEdge[p];
      var trace = E.edgeTrace(edge);
      var lut = luts[trace];
      if (!lut) continue;

      var u = state.pU0[p] + (state.pU[p] - state.pU0[p]) * alpha;
      if (u < 0) u = 0; else if (u > 1) u = 1;
      /* the LUT runs centre -> pod; an inbound packet traverses it backwards */
      if (!E.edgeIsOutbound(edge)) u = 1 - u;

      samplePath(lut, u, _v);
      _v.y += 0.14;

      _m.makeTranslation(_v.x, _v.y, _v.z);
      cores.setMatrixAt(n, _m);
      _c2.copy(PAL._packet[state.pStatus[p]] || PAL._packet[0]);
      cores.setColorAt(n, _c2);

      if (showHalos) {
        _m.compose(_v, _q, _v2.set(1, 1, 1));
        halos.setMatrixAt(n, _m);
        halos.setColorAt(n, _c2);
      }
      n++;
    }

    cores.count = n;
    halos.count = showHalos ? n : 0;
    if (n > 0) {
      cores.instanceMatrix.needsUpdate = true;
      if (cores.instanceColor) cores.instanceColor.needsUpdate = true;
      if (showHalos) {
        halos.instanceMatrix.needsUpdate = true;
        if (halos.instanceColor) halos.instanceColor.needsUpdate = true;
      }
    }
  }

  /* ----------------------------------------------------------------- traces
     Per-edge glow written into the preallocated colour buffer. Two draw calls
     for all 10 traces, no custom shader. */
  function syncTraces(state) {
    var cols = S.traceColours;
    var per = S.verticesPerTrace;
    var hot = PAL._traceHot;
    var boost = projector ? 2.0 : 1.0;
    for (var t = 0; t < C.podCount; t++) {
      var h = state.traceHeat[t] * boost;
      if (h > 1) h = 1;
      var r = hot.r * h, g = hot.g * h, b = hot.b * h;
      var start = t * per;
      for (var v = 0; v < per; v++) {
        var o = (start + v) * 3;
        cols[o] = r; cols[o + 1] = g; cols[o + 2] = b;
      }
    }
    S.tracesHot.geometry.attributes.color.needsUpdate = true;
  }

  /* ---------------------------------------------------------- orchestrator */
  function syncOrchestrator(state, dt) {
    var ag = state.agents[0];
    var working = ag.state === 'WORKING';

    if (!reducedMotion) {
      S.wedge.rotation.y += C.scanRate * Math.PI * 2 * dt;
      S.blade.rotation.y = S.wedge.rotation.y;
    } else {
      /* snap to 8 discrete positions rather than sweeping */
      var oct = Math.floor((state.simTime * 0.5) % 8) / 8 * Math.PI * 2;
      S.wedge.rotation.y = oct;
      S.blade.rotation.y = oct;
    }

    S.eyes.material.opacity = working ? 0.95 : 0.45;
    S.eyes.quaternion.copy(_q);
    S.platform.material.emissiveIntensity = working ? 0.28 : 0.12;
    S.dome.material.opacity = working ? 0.19 : 0.12;
    if (S.domeWire.visible !== C.tiers[tier].domeWire) {
      S.domeWire.visible = C.tiers[tier].domeWire;
    }

    if (S.pings.visible !== C.tiers[tier].pings) S.pings.visible = C.tiers[tier].pings;
    if (C.tiers[tier].pings && !reducedMotion) {
      for (var i = 0; i < 3; i++) {
        pingState.t[i] += dt * 0.5;
        if (pingState.t[i] > 2.6) pingState.t[i] -= 2.6;
        var prog = pingState.t[i] / 2.6;
        var s = 0.7 + prog * 3.2;
        _v.set(0, 0.42, 0);
        _v2.set(s, 1, s);
        _m.compose(_v, _q.set(0, 0, 0, 1), _v2);
        S.pings.setMatrixAt(i, _m);
        /* additive, so fading the instance colour fades the ring */
        var f = Math.max(0, 1 - prog) * 0.5;
        _c2.setRGB(f * 0.82, f * 0.78, f);
        S.pings.setColorAt(i, _c2);
      }
      S.pings.instanceMatrix.needsUpdate = true;
      if (S.pings.instanceColor) S.pings.instanceColor.needsUpdate = true;
      _q.copy(S.camera.quaternion);   /* restore billboard quaternion */
    }
  }

  /* -------------------------------------------------------------- perf tier */
  function applyTier(t, force) {
    if (!force && t === tier) return;
    tier = t;
    tierChangedAt = 0;
    if (S && S.renderer) S.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, C.tiers[tier].pixelRatio)
    );
  }

  function sample(dtMs, nowMs) {
    frameTimes[ftIndex] = dtMs;
    ftIndex = (ftIndex + 1) % C.perfWindow;
    if (ftFilled < C.perfWindow) ftFilled++;
    if (ftFilled < C.perfWindow) return;
    if (nowMs - tierChangedAt < C.tierHysteresisMs) return;

    /* rolling median without sorting the whole window every frame: a simple
       count-based estimate is enough to pick a tier */
    var above20 = 0, above28 = 0, above40 = 0;
    for (var i = 0; i < C.perfWindow; i++) {
      var f = frameTimes[i];
      if (f > C.tierUpMs) above20++;
      if (f > C.tierUp2Ms) above28++;
      if (f > C.tierBailMs) above40++;
    }
    var half = C.perfWindow / 2;
    var want = tier;
    if (above40 > half) want = 2;
    else if (above28 > half) want = Math.min(2, 2);
    else if (above20 > half) want = Math.max(tier, 1);
    else if (above20 < C.perfWindow * 0.1) want = Math.max(0, tier - 1);

    if (want !== tier) { tierChangedAt = nowMs; applyTier(want, true); }
  }

  function medianFrameMs() {
    if (!ftFilled) return 0;
    var tmp = Array.prototype.slice.call(frameTimes, 0, ftFilled);
    tmp.sort(function (a, b) { return a - b; });
    return tmp[tmp.length >> 1];
  }

  /* ---------------------------------------------------------------- picking
     pointerdown ONLY, against 10 invisible proxies. Never per-frame, never on
     pointermove. */
  function pick(clientX, clientY, rect) {
    _ptr.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ptr.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _ray.setFromCamera(_ptr, S.camera);
    var hits = _ray.intersectObjects(S.pickTargets, false);
    if (!hits.length) return -1;
    return hits[0].object.userData.podIndex;
  }

  /* ------------------------------------------------------------------ sync */
  function sync(state, alpha, dt) {
    _q.copy(S.camera.quaternion);          /* shared billboard orientation */
    updateCamera(dt);
    _q.copy(S.camera.quaternion);

    for (var i = 0; i < C.podCount; i++) {
      syncPod(S.podViews[i], state.agents[i + 1], state.simTime, i);
    }
    syncOrchestrator(state, dt);
    syncTraces(state);
    syncPackets(state, alpha);
    S.labelsMesh.material.opacity = projector ? 1.0 : 0.92;
  }

  function setReducedMotion(v) { reducedMotion = !!v; }
  function setProjector(v) {
    projector = !!v;
    S.floor.material.color.setHex(projector ? 0x2A1057 : 0xffffff);
    S.tracesBase.material.opacity = projector ? 0.45 : 0.22;
    S.wall.material.opacity = projector ? 0.30 : 0.20;
  }
  function setTier(t) { applyTier(t, true); }
  function currentTier() { return tier; }

  X.View = {
    init: init, sync: sync, resize: resize, pick: pick,
    sample: sample, medianFrameMs: medianFrameMs,
    setReducedMotion: setReducedMotion, setProjector: setProjector,
    setTier: setTier, currentTier: currentTier, setAzimuth: setAzimuth
  };
})(typeof module !== 'undefined' ? module.exports : (window.SVS = window.SVS || {}));
