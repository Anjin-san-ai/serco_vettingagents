/* ==========================================================================
   app.js — bootstrap, mode selection, and the frame loop. Loaded last.

   Frame loop: fixed-timestep simulation + interpolated render. The fixed step
   is what makes the golden-seed test in test/run.js byte-reproducible and makes
   the speed control exact rather than approximate.
   ========================================================================== */
(function (X) {
  'use strict';

  var C = X.Config;
  var E = X.Engine;
  var A = X.Agents;

  var state, ctl, renderer, built, canvasEl, stageEl;
  var mode = 'webgl';            /* 'webgl' | 'canvas2d' */
  var fallbackRenderer = null;
  var acc = 0, last = 0, raf = 0;
  var labels = [];

  function bootError(msg) {
    var box = document.getElementById('boot-error');
    if (!box) { return; }
    var detail = document.getElementById('boot-error-detail');
    if (detail) detail.textContent = msg;
    box.classList.add('show');
  }

  /* Boot self-check. A missing vendor file must read as an instruction, not as
     a black rectangle five minutes before a workshop. */
  function selfCheck() {
    var problems = [];
    if (typeof THREE === 'undefined') {
      problems.push('assets/vendor/three.min.js did not load or is not a UMD build.');
    }
    if (!X.Engine) problems.push('assets/js/sim/engine.js did not load.');
    if (!X.Agents) problems.push('assets/js/sim/agents.js did not load.');
    if (!X.Config) problems.push('assets/js/config.js did not load.');
    if (!X.Scene) problems.push('assets/js/view/scene.js did not load.');
    if (!X.View) problems.push('assets/js/view/view.js did not load.');
    if (!X.Hud) problems.push('assets/js/hud/hud.js did not load.');
    if (!X.Dashboard) problems.push('assets/js/hud/dashboard.js did not load.');
    if (!X.Trust) problems.push('assets/js/hud/trust.js did not load.');
    return problems;
  }

  /* Measure the CANVAS, not the stage. The stage carries a min-height while the
     canvas height comes from its own aspect-ratio, so at half width (Trust split
     open) the two disagree: the stage stays 544px tall while the canvas box is
     311px. Measuring the stage then sized the backing store to 552x544 behind a
     552x311 CSS box and the scene rendered stretched. */
  function sizeOf() {
    var r = canvasEl.getBoundingClientRect();
    return { w: Math.max(320, Math.round(r.width)), h: Math.max(200, Math.round(r.height)) };
  }

  function startWebGL() {
    var q = new URLSearchParams(location.search);
    var aa = q.get('aa') !== '0';        /* construction-time only */
    renderer = new THREE.WebGLRenderer({
      canvas: canvasEl, antialias: aa, alpha: false, powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, C.tiers[0].pixelRatio));
    renderer.outputEncoding = THREE.sRGBEncoding;          /* r149 name */
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = false;                    /* fake shadows only */

    built = X.Scene.build(THREE, labels);
    built.renderer = renderer;
    X.View.init(THREE, built);

    /* ?stripped=1 renders the scene unlit and map-stripped: flat matte on every
       solid, additive and emissive layers hidden, no textures. This is the
       blockout evidence the img2threejs review gate requires - it answers
       "does the silhouette read WITHOUT materials?", which a lit, textured
       screenshot cannot. */
    if (new URLSearchParams(location.search).get('stripped') === '1') {
      stripMaps(built);
    }

    var s = sizeOf();
    renderer.setSize(s.w, s.h, false);
    X.View.resize(s.w, s.h);

    /* Plugging in a projector is a common, genuine cause of context loss. */
    canvasEl.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      cancelAnimationFrame(raf);
    }, false);
    canvasEl.addEventListener('webglcontextrestored', function () {
      try {
        built = X.Scene.build(THREE, labels);
        built.renderer = renderer;
        X.View.init(THREE, built);
        var s2 = sizeOf();
        renderer.setSize(s2.w, s2.h, false);
        X.View.resize(s2.w, s2.h);
        loop(performance.now());
      } catch (err) {
        switchToFallback('WebGL context could not be restored.');
      }
    }, false);
  }

  /* Replace every material with flat matte and hide the additive/emissive
     layers, so only form remains. */
  function stripMaps(b) {
    var flat = new THREE.MeshBasicMaterial({ color: 0xBFC3CC });
    var dark = new THREE.MeshBasicMaterial({ color: 0x6E7480 });
    b.scene.background = new THREE.Color(0x2B2E36);

    b.scene.traverse(function (o) {
      if (!o.isMesh && !o.isInstancedMesh) return;
      var m = o.material;
      /* anything additive or transparent is a light effect, not form */
      if (m && (m.blending === THREE.AdditiveBlending || m.transparent)) {
        o.visible = false;
        return;
      }
      o.material = (m && m.map) ? dark : flat;
    });
    /* the floor and back wall are context, not the subject */
    if (b.floor) b.floor.visible = false;
    if (b.wall) b.wall.visible = false;
    if (b.shadows) b.shadows.visible = false;
    if (b.labelsMesh) b.labelsMesh.visible = false;
    b.scene.traverse(function (o) { if (o.isLight) o.intensity = 0; });
    b.scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  }

  function switchToFallback(reason) {
    mode = 'canvas2d';
    cancelAnimationFrame(raf);
    if (renderer) { try { renderer.dispose(); } catch (e) {} }
    var note = document.getElementById('sim-fallback-note');
    if (note) {
      note.hidden = false;
      var why = document.getElementById('sim-fallback-reason');
      if (why) why.textContent = reason;
    }
    fallbackRenderer = X.Fallback.create(canvasEl, labels);
    var s = sizeOf();
    fallbackRenderer.resize(s.w, s.h);
    last = performance.now();
    loop(last);
  }

  /* ------------------------------------------------------------- frame loop */
  function loop(now) {
    raf = requestAnimationFrame(loop);

    var dt = (now - last) / 1000;
    last = now;
    if (dt > C.dtClamp) dt = C.dtClamp;      /* tab-away / projector switch */
    if (mode === 'webgl') X.View.sample(dt * 1000, now);

    if (!ctl.paused) {
      acc += dt * ctl.speed;
      var steps = 0;
      while (acc >= C.simDt && steps < C.maxCatchUpSteps) {
        E.step(state, C.simDt);
        acc -= C.simDt;
        steps++;
      }
      if (steps === C.maxCatchUpSteps) acc = 0;   /* drop the backlog */
    }

    if (mode === 'webgl') {
      X.View.sync(state, acc / C.simDt, dt);
      renderer.render(built.scene, built.camera);
    } else {
      fallbackRenderer.draw(state);
    }

    X.Hud.sync(state, now);
    if (X.Dashboard) X.Dashboard.sync(state, now);
    if (X.Trust) X.Trust.sync(state, now);
  }

  /* ------------------------------------------------------------------ input */
  function wirePointer() {
    var dragging = false, lastX = 0, moved = 0;

    canvasEl.addEventListener('pointerdown', function (e) {
      dragging = true; lastX = e.clientX; moved = 0;
      canvasEl.setPointerCapture && canvasEl.setPointerCapture(e.pointerId);
    });
    canvasEl.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - lastX;
      lastX = e.clientX;
      moved += Math.abs(dx);
      if (mode === 'webgl') X.View.setAzimuth(-dx * 0.004);
    });
    canvasEl.addEventListener('pointerup', function (e) {
      dragging = false;
      /* A click, not a drag: raycast once. Never on pointermove. */
      if (moved < 5) {
        var rect = canvasEl.getBoundingClientRect();
        var pod = mode === 'webgl'
          ? X.View.pick(e.clientX, e.clientY, rect)
          : fallbackRenderer.pick(e.clientX, e.clientY, rect);
        if (pod >= 0) {
          X.Hud.selectPod(pod);
          /* releasing a human hold uses the same intent as the keyboard path */
          E.Intents.enqueue({ type: 'RESUME_HOLD', agent: pod + 1 });
        }
      }
    });
    canvasEl.style.touchAction = 'none';
  }

  /* One resize path, shared by the window listener and the Trust split toggle:
     opening the split halves the canvas width, so the renderer and the
     orthographic frustum both have to follow it or the scene distorts. */
  function applyResize() {
    var s = sizeOf();
    if (mode === 'webgl') {
      renderer.setSize(s.w, s.h, false);
      X.View.resize(s.w, s.h);
    } else if (fallbackRenderer) {
      fallbackRenderer.resize(s.w, s.h);
    }
  }

  function wireResize() {
    var t = 0;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(applyResize, 120);
    });
  }

  /* ------------------------------------------------------------------- boot */
  function boot() {
    stageEl = document.getElementById('sim-stage');
    canvasEl = document.getElementById('sim-canvas');
    if (!stageEl || !canvasEl) return;

    var problems = selfCheck();
    if (problems.length) {
      bootError(problems.join(' '));
      return;
    }

    labels = A.RING.map(function (a) { return a.code + '  ' + a.name; });

    state = E.createState(20260921);
    E.Intents._reset();
    ctl = { paused: false, speed: C.speeds[C.defaultSpeedIx], qualityOverride: 'auto' };

    X.Hud.init(state, ctl);
    if (X.Dashboard) X.Dashboard.init();
    if (X.Trust) {
      /* the split changes the canvas width; wait a frame for the grid to settle
         before measuring, or we resize to the pre-toggle width */
      X.Trust.init(function () { requestAnimationFrame(applyResize); });
    }

    /* Reduced motion defaults to the OS preference, but the HUD can override
       either way — the simulation keeps running, only interpolation stops. */
    var prefersReduced = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var forced2d = new URLSearchParams(location.search).get('mode') === '2d';

    if (!forced2d && X.Fallback.isWebGLAvailable()) {
      try {
        startWebGL();
        X.View.setReducedMotion(prefersReduced);
      } catch (err) {
        switchToFallback('WebGL failed to initialise: ' + err.message);
      }
    } else {
      switchToFallback(forced2d
        ? 'Running in 2D mode because ?mode=2d was requested.'
        : 'This browser or machine reports no WebGL support.');
    }

    if (prefersReduced) {
      document.body.dataset.motion = 'reduce';
      var mb = document.getElementById('btn-motion');
      if (mb) { mb.setAttribute('aria-pressed', 'true'); mb.textContent = 'Reduce motion: on'; }
    }

    wirePointer();
    wireResize();

    if (!raf) { last = performance.now(); loop(last); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.SVS = window.SVS || {});
