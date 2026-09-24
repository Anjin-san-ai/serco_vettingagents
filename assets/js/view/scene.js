/* ==========================================================================
   scene.js — procedural scene construction. Runs once at boot.

   Everything here is built in code: no downloaded models, no image textures.
   `examples/jsm/*` is ESM-only and therefore unavailable from file://, so the
   pieces normally taken from there are hand-rolled:
     BufferGeometryUtils.mergeGeometries  -> mergeGeos() below
     TextGeometry / FontLoader            -> CanvasTexture atlases
     Line2 / LineMaterial                 -> TubeGeometry
     EffectComposer / UnrealBloomPass     -> additive billboards + ACES
   ========================================================================== */
(function (X) {
  'use strict';

  var C = X.Config;
  var T;   /* THREE, bound at build time */

  /* ------------------------------------------------------- mergeGeometries
     Replaces BufferGeometryUtils. Concatenates position/normal/uv and offsets
     indices. Only handles the attributes we actually use, deliberately. */
  function mergeGeos(geos) {
    var i, g, total = 0, idxTotal = 0, hasUV = true;
    for (i = 0; i < geos.length; i++) {
      g = geos[i];
      if (!g.index) g = geos[i] = g.toNonIndexed();
      total += g.attributes.position.count;
      idxTotal += g.index ? g.index.count : g.attributes.position.count;
      if (!g.attributes.uv) hasUV = false;
    }
    var pos = new Float32Array(total * 3);
    var nor = new Float32Array(total * 3);
    var uv = hasUV ? new Float32Array(total * 2) : null;
    var idx = new Uint32Array(idxTotal);

    var vOff = 0, iOff = 0;
    for (i = 0; i < geos.length; i++) {
      g = geos[i];
      var p = g.attributes.position.array;
      var n = g.attributes.normal ? g.attributes.normal.array : null;
      pos.set(p, vOff * 3);
      if (n) nor.set(n, vOff * 3);
      if (uv && g.attributes.uv) uv.set(g.attributes.uv.array, vOff * 2);
      var gi = g.index.array;
      for (var k = 0; k < gi.length; k++) idx[iOff + k] = gi[k] + vOff;
      vOff += g.attributes.position.count;
      iOff += gi.length;
    }
    var out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    if (uv) out.setAttribute('uv', new T.BufferAttribute(uv, 2));
    out.setIndex(new T.BufferAttribute(idx, 1));
    return out;
  }

  function applyMatrix(geo, m) { geo.applyMatrix4(m); return geo; }
  function at(geo, x, y, z, rx) {
    var m = new T.Matrix4();
    if (rx) m.makeRotationX(rx);
    m.setPosition(x, y, z);
    return applyMatrix(geo, m);
  }

  /* ------------------------------------------------------------- textures
     All canvas-drawn at boot. No network, no image decode. */
  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function tex(c, repeat) {
    var t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;           /* r149 name; colorSpace is r152+ */
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    t.generateMipmaps = true;
    t.minFilter = T.LinearMipmapLinearFilter;
    return t;
  }

  /* The decorative circuit board: ONE textured quad instead of thousands of
     line segments. This is the single biggest structural performance win. */
  function circuitTexture() {
    var S = 2048, c = canvas(S, S), x = c.getContext('2d');
    x.fillStyle = '#120428'; x.fillRect(0, 0, S, S);

    /* fine lattice */
    x.strokeStyle = 'rgba(228,216,251,0.08)'; x.lineWidth = 1;
    for (var i = 0; i <= S; i += 32) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.stroke();
      x.beginPath(); x.moveTo(0, i); x.lineTo(S, i); x.stroke();
    }
    /* brighter Manhattan traces with vias */
    var rnd = mulberry(20260921);
    x.lineWidth = 3;
    for (var t = 0; t < 46; t++) {
      x.strokeStyle = 'rgba(228,216,251,' + (0.16 + rnd() * 0.16).toFixed(3) + ')';
      var px = Math.floor(rnd() * S / 32) * 32, py = Math.floor(rnd() * S / 32) * 32;
      x.beginPath(); x.moveTo(px, py);
      for (var seg = 0; seg < 4; seg++) {
        var len = (2 + Math.floor(rnd() * 8)) * 32;
        if (rnd() < 0.5) px += rnd() < 0.5 ? len : -len; else py += rnd() < 0.5 ? len : -len;
        x.lineTo(px, py);
      }
      x.stroke();
      x.fillStyle = 'rgba(228,216,251,0.30)';
      x.beginPath(); x.arc(px, py, 6, 0, Math.PI * 2); x.fill();
    }
    /* chip blocks */
    for (var b = 0; b < 14; b++) {
      var bx = rnd() * (S - 260), by = rnd() * (S - 180);
      var bw = 90 + rnd() * 160, bh = 60 + rnd() * 110;
      x.strokeStyle = 'rgba(228,216,251,0.20)'; x.lineWidth = 2;
      x.strokeRect(bx, by, bw, bh);
      x.fillStyle = 'rgba(228,216,251,0.05)'; x.fillRect(bx, by, bw, bh);
      x.fillStyle = 'rgba(228,216,251,0.22)';
      for (var pin = 0; pin < bw / 14; pin++) x.fillRect(bx + pin * 14 + 4, by - 5, 5, 5);
    }
    return tex(c);
  }

  function radialGlowTexture(inner, outer) {
    var S = 256, c = canvas(S, S), x = c.getContext('2d');
    var g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,' + inner + ')');
    g.addColorStop(0.45, 'rgba(255,255,255,' + (inner * 0.32) + ')');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    if (outer) { /* soft ring for shadow blobs */ }
    return tex(c);
  }

  function dashTexture() {
    var W = 16, H = 256, c = canvas(W, H), x = c.getContext('2d');
    x.clearRect(0, 0, W, H);
    for (var y = 0; y < H; y += 32) {
      var g = x.createLinearGradient(0, y, 0, y + 20);
      g.addColorStop(0, 'rgba(228,216,251,0)');
      g.addColorStop(0.5, 'rgba(228,216,251,0.85)');
      g.addColorStop(1, 'rgba(228,216,251,0)');
      x.fillStyle = g; x.fillRect(0, y, W, 20);
    }
    return tex(c, true);
  }

  /* Back-wall pseudo-code, drawn from the real domain so a workshop audience
     reads something meaningful rather than lorem ipsum. */
  var CODE_LINES = [
    'orchestrator.classify(instruction) -> clearanceType',
    'if (clearanceType in [BPSS, DBS, ENHANCED_DBS, BS7858, NSV])',
    '  route.push(screeningSetup)',
    'docIntelligence.split(combinedPdf) -> document[]',
    'docIntelligence.reject(OUT_OF_SCOPE)   // bank statements',
    'idVerify.stamp(assuranceLevel)  // never a bare pass',
    'reconcile(extracted, appian) -> fieldDiff[]',
    'if (fieldDiff.length) managerCopilot.propose(correction)',
    'AS.link.generate(candidateId) -> welcomeEmail',
    'AS.poll(completion)   // AS emits no event',
    'refHistory.require(contract === PECS ? 6 : 36)  // months',
    'SAP.upload(contract, rtwDocuments)   // 54 hrs/mo',
    'SAP.write(passportNo, expiry, visa)  // 43 hrs/mo',
    'visaRegister.migrate(EXCEL -> SAP)',
    'followOn.route(P45)          -> PAYROLL     // 193/mo',
    'followOn.route(DISABILITY)   -> LINE_MANAGER// 86/mo',
    'followOn.route(CONVICTION)   -> ER          // 43/mo',
    'assert(!(role.unit === ER && target === ER_QUEUE))',
    '  // ER confidentiality guard - business case 3',
    'adjudication.pack(refs, dbs, credit, addressHistory5y)',
    'adjudication.recommend() // officer decides, never the agent',
    'SNOW.ticket.close(COMPLETE)',
    'sla.assert(rtw <= 2h, audit <= 3d)'
  ];
  function codeTexture() {
    var W = 2048, H = 1024, c = canvas(W, H), x = c.getContext('2d');
    x.clearRect(0, 0, W, H);
    x.font = '20px ui-monospace, Menlo, Consolas, monospace';
    x.fillStyle = 'rgba(228,216,251,0.85)';
    var y = 26, li = 0;
    while (y < H - 10) {
      var line = CODE_LINES[li % CODE_LINES.length];
      x.fillStyle = /guard|assert|never/.test(line)
        ? 'rgba(255,170,170,0.9)' : 'rgba(228,216,251,0.8)';
      x.fillText(line, 24 + ((li % 3) * 18), y);
      y += 30; li++;
    }
    /* dissolve top and bottom */
    var g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.25, 'rgba(0,0,0,0)');
    g.addColorStop(0.75, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out';
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'source-over';
    return tex(c);
  }

  /* ------------------------------------------------------- status chip atlas
     The fix for "I cannot tell if the agents are changing status". The old
     encoding was a 0.34-unit glyph quad on a pod that renders ~50 px wide, so
     the glyph arrived at ~10 px - invisible from anywhere but a desk.

     This atlas bakes one filled, rounded STATUS CHIP per state: state colour,
     glyph, and the state name in words. Pods switch state by moving map.offset
     to another row, so it is still one texture and one draw call per pod. */
  function chipAtlas() {
    var ROWS = C.chipAtlasRows, CW = 512, CH = 128;
    var c = canvas(CW, CH * ROWS), x = c.getContext('2d');
    x.clearRect(0, 0, CW, CH * ROWS);

    var keys = Object.keys(C.state);
    for (var i = 0; i < keys.length; i++) {
      var st = C.state[keys[i]];
      var y0 = i * CH;
      var hex = '#' + ('000000' + st.colour.toString(16)).slice(-6);
      var dim = st.dim;

      /* rounded rect, inset so the edge does not clip under mip filtering */
      var pad = 10, r = (CH - pad * 2) / 2;
      x.save();
      x.beginPath();
      var x0 = pad, y1 = y0 + pad, w = CW - pad * 2, h = CH - pad * 2;
      x.moveTo(x0 + r, y1);
      x.lineTo(x0 + w - r, y1);
      x.arcTo(x0 + w, y1, x0 + w, y1 + r, r);
      x.lineTo(x0 + w, y1 + h - r);
      x.arcTo(x0 + w, y1 + h, x0 + w - r, y1 + h, r);
      x.lineTo(x0 + r, y1 + h);
      x.arcTo(x0, y1 + h, x0, y1 + h - r, r);
      x.lineTo(x0, y1 + r);
      x.arcTo(x0, y1, x0 + r, y1, r);
      x.closePath();

      /* idle is a quiet outline; every active state is a solid fill, so the
         transition out of idle is a whole-chip change, not a subtle one */
      if (dim < 0.5) {
        x.fillStyle = 'rgba(18,4,40,0.72)';
        x.fill();
        x.lineWidth = 4;
        x.strokeStyle = 'rgba(215,222,226,0.45)';
        x.stroke();
      } else {
        x.fillStyle = hex;
        x.fill();
        x.lineWidth = 4;
        x.strokeStyle = 'rgba(255,255,255,0.65)';
        x.stroke();
      }
      x.restore();

      /* text colour by fill luminance, so both the pale lilac and the deep red
         chips stay legible */
      var rr = (st.colour >> 16) & 255, gg = (st.colour >> 8) & 255, bb = st.colour & 255;
      var lum = (0.2126 * rr + 0.7152 * gg + 0.0722 * bb) / 255;
      var ink = (dim < 0.5) ? 'rgba(215,222,226,0.9)' : (lum > 0.55 ? '#120428' : '#FFFFFF');

      x.fillStyle = ink;
      x.textBaseline = 'middle';

      /* glyph, then the state in words */
      x.font = 'bold 74px ui-monospace, Menlo, Consolas, monospace';
      x.textAlign = 'center';
      x.fillText(C.glyphs[st.glyph], pad + 52, y0 + CH / 2 + 2);

      x.font = 'bold 54px "Avenir Next", "Segoe UI", system-ui, sans-serif';
      x.textAlign = 'left';
      x.fillText(st.chip || st.label, pad + 100, y0 + CH / 2 + 3);
    }

    var t = tex(c);
    t.repeat.set(1, 1 / ROWS);
    return { texture: t, rows: ROWS, index: keys };
  }

  /* One atlas of agent names, baked into a single merged label geometry. */
  function nameAtlas(labels) {
    var CELL_W = 512, CELL_H = 64, N = 4;
    var rows = Math.ceil(labels.length / N);
    var c = canvas(CELL_W * N, CELL_H * rows), x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 40px "Avenir Next", "Segoe UI", system-ui, sans-serif';
    for (var i = 0; i < labels.length; i++) {
      var col = i % N, row = Math.floor(i / N);
      x.fillStyle = 'rgba(232,238,242,1)';
      x.fillText(labels[i], col * CELL_W + CELL_W / 2, row * CELL_H + CELL_H / 2);
    }
    return { texture: tex(c), N: N, rows: rows };
  }

  function mulberry(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }


  /* The base block's emissive panel texture: glyph rows, an LED tick column and
     the top rim highlight, all baked into ONE texture so the block stays a
     single draw call. Spec components panel-glyphs + rim-inset; no text
     fidelity is claimed - the reference glyphs are illegible pseudo-text. */
  function blockPanelTexture() {
    var W = 512, H = 512, c = canvas(W, H), x = c.getContext('2d');
    x.fillStyle = '#1D0743'; x.fillRect(0, 0, W, H);

    /* rim highlight along the top edge. BoxGeometry maps 0..1 to every face, so
       this band appears on all six - which is what we want: the reference has a
       bright edge on every upward-facing edge of the block. */
    var g = x.createLinearGradient(0, 0, 0, 30);
    g.addColorStop(0, 'rgba(235,228,255,1)');
    g.addColorStop(1, 'rgba(228,216,251,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, 30);

    /* Panel marks. Second correction: two rows of fine glyphs were invisible by
       GEOMETRY, not by contrast - with ten pods in a wide scene each block face
       renders ~40 px, so an 18 px mark in a 512 px texture lands at ~1.4 px on
       screen. Fewer, chunkier marks reproduce the IMPRESSION of a data panel,
       which is what actually survives to the viewer. The reference glyphs are
       illegible pseudo-text in any case, so nothing is lost by not drawing 40
       of them. */
    var rnd = mulberry(4242);
    var bars = [96, 58, 132, 74];
    var bx = 46;
    for (var b = 0; b < bars.length; b++) {
      x.fillStyle = 'rgba(236,228,255,' + (0.82 + rnd() * 0.18).toFixed(2) + ')';
      x.fillRect(bx, 206, bars[b], 34);
      bx += bars[b] + 22;
    }
    /* LED tick column, Serco bright red - large enough to read as status lights */
    x.fillStyle = 'rgba(235,45,46,1)';
    for (var t = 0; t < 4; t++) x.fillRect(W - 104, 188 + t * 44, 46, 26);

    /* panel seam */
    x.strokeStyle = 'rgba(228,216,251,0.40)'; x.lineWidth = 4;
    x.strokeRect(30, 180, W - 60, 160);
    return tex(c);
  }

  /* ------------------------------------------------------- ring geometries
     Five prebuilt variants. Switching a mesh's .geometry between already
     uploaded buffers is free, and gives the redundant SHAPE channel with no
     custom shader.                                                         */
  function ringVariants() {
    /* Enlarged via config: flat on the block top the annulus is heavily
       foreshortened in isometric, so it needs to be big to read. */
    var R0 = C.ringR0, R1 = C.ringR1, TAU = Math.PI * 2;
    function ringSlices(n, frac) {
      var parts = [];
      for (var i = 0; i < n; i++) {
        var start = (i / n) * TAU;
        parts.push(new T.RingGeometry(R0, R1, Math.max(4, Math.floor(48 / n)), 1,
                                      start, TAU * frac / n));
      }
      return at(mergeGeos(parts), 0, 0, 0, -Math.PI / 2);
    }
    return {
      thin:   at(new T.RingGeometry(R0 + 0.04, R1 - 0.04, 40), 0, 0, 0, -Math.PI / 2),
      dash4:  ringSlices(4, 0.55),
      dash2:  ringSlices(2, 0.62),
      double: at(mergeGeos([new T.RingGeometry(R0, R0 + 0.045, 40),
                            new T.RingGeometry(R1 - 0.045, R1, 40)]), 0, 0, 0, -Math.PI / 2),
      disc:   at(new T.CircleGeometry(R1, 40), 0, 0, 0, -Math.PI / 2)
    };
  }

  /* -------------------------------------------------------------- the pod
     Built from .img2threejs/object-sculpt-spec.json, which passed
     validate_sculpt_spec.py --strict-quality. Three stacked volumes:

        head-dome    ellipsoid 0.86 x 0.70 x 0.80, scaled (1, 0.82, 0.92)
        visor        flattened ellipsoid + 6-lens cluster
        neck         cylinder 0.30 dia x 0.34
        plinth       box 1.12 x 0.20 x 1.12, inset on the block
        base-block   box 1.55 x 0.62 x 1.55, dark navy, emissive panels

     The first build was cone + hex prism + hemisphere and read as a grey mound
     because it had none of the three identity features: the ovoid head, the
     visor, and the dark block with glowing panels. */
  function palePartsGeometry() {
    /* plinth + neck + dome merged: one material, one draw call */
    var parts = [];
    parts.push(at(new T.BoxGeometry(1.04, 0.13, 1.04), 0, 0.68, 0));
    /* taller, wider neck: in the first render the head floated with no
       visible support, which broke the reference's stacked reading */
    parts.push(at(new T.CylinderGeometry(0.175, 0.205, 0.40, 14), 0, 0.93, 0));

    /* OVOID, not a sphere: wider than tall, per the spec's identity feature.
       Enlarged after the first render: at 0.43 radius on a 0.34 neck the head
       read as a small ball on a stick. In the reference the head is nearly as
       wide as the plinth top and sits close to it. */
    var dome = new T.SphereGeometry(0.50, 16, 10);
    dome.scale(1.0, 0.80, 0.92);
    parts.push(at(dome, 0, 1.33, 0));
    return mergeGeos(parts);
  }

  function blockGeometry() {
    /* a chamfer read is cheaper as two stacked boxes than as a rounded box */
    return mergeGeos([
      at(new T.BoxGeometry(1.55, 0.50, 1.55), 0, 0.25, 0),
      at(new T.BoxGeometry(1.44, 0.14, 1.44), 0, 0.56, 0)
    ]);
  }

  /* Spec component glow-skirt. Omitted from the first build, which is why the
     head read as detached rather than hovering. Additive cone, depthWrite
     false, doubleSided - the material is declared open-shell in the spec. */
  function glowSkirtGeometry() {
    return at(new T.ConeGeometry(0.42, 0.46, 14, 1, true), 0, 0.92, 0);
  }

  function visorGeometry() {
    var v = new T.SphereGeometry(0.25, 12, 7);
    v.scale(1.0, 0.60, 0.34);
    return at(v, 0, 1.33, 0.385);
  }

  /* Repetition system visor-lens-array: 6 lenses, two rows of three.
     Recorded as a decision, not a measurement - the source cannot settle
     5 vs 6 vs 7 at ~170px per pod. */
  function lensClusterGeometry() {
    var parts = [], xs = [-0.125, 0, 0.125], ys = [-0.045, 0.045];
    for (var i = 0; i < xs.length; i++) {
      for (var j = 0; j < ys.length; j++) {
        var d = new T.CircleGeometry(0.044, 8);
        parts.push(at(d, xs[i], 1.33 + ys[j], 0.455));
      }
    }
    return mergeGeos(parts);
  }

  /* ----------------------------------------------------------- the traces
     CatmullRom through Manhattan-ish waypoints: near-straight runs with
     rounded elbows, which is what makes it read as a circuit board rather
     than a spider web. TubeGeometry rather than lines, because
     LineBasicMaterial.linewidth is ignored on every platform and Line2 is
     unavailable.                                                           */
  function buildTraces(podPositions) {
    var curves = [], geos = [];
    for (var i = 0; i < podPositions.length; i++) {
      var p = podPositions[i];
      var ang = Math.atan2(p.z, p.x);
      var lateral = (i % 2 === 0 ? 1 : -1) * 0.42;
      var nx = -Math.sin(ang), nz = Math.cos(ang);
      var pts = [];
      function radial(r, lat) {
        pts.push(new T.Vector3(Math.cos(ang) * r + nx * lat, 0.055,
                               Math.sin(ang) * r + nz * lat));
      }
      radial(C.platformRadius + 0.30, 0);
      radial(C.platformRadius + 0.95, 0);
      radial(C.platformRadius + 1.55, lateral);
      radial(C.ringRadius - 1.35, lateral);
      radial(C.ringRadius - 0.75, 0);
      radial(C.ringRadius - 0.52, 0);
      var curve = new T.CatmullRomCurve3(pts, false, 'catmullrom', 0.25);
      curves.push(curve);
      geos.push(new T.TubeGeometry(curve, 26, 0.036, 4, false));
    }
    return { curves: curves, geometry: mergeGeos(geos), segPerTrace: geos.length };
  }

  /* Arc-length lookup tables, sampled once. The render loop interpolates into
     these Float32Arrays and never calls curve.getPointAt(), which allocates a
     Vector3 on every call. */
  function buildEdgeLUTs(curves, samples) {
    var luts = [];
    for (var i = 0; i < curves.length; i++) {
      var pts = curves[i].getSpacedPoints(samples);
      var arr = new Float32Array((samples + 1) * 3);
      for (var k = 0; k <= samples; k++) {
        arr[k * 3] = pts[k].x; arr[k * 3 + 1] = pts[k].y; arr[k * 3 + 2] = pts[k].z;
      }
      luts.push(arr);
    }
    return { pos: luts, samples: samples };
  }

  /* ============================================================== build == */
  function build(THREE, labels) {
    T = THREE;

    var scene = new T.Scene();
    scene.background = new T.Color(C.col.purpleLo);

    /* ---- camera ---- */
    var camera = new T.OrthographicCamera(-1, 1, 1, -1, -100, 200);
    camera.position.set(C.camPos[0], C.camPos[1], C.camPos[2]);
    camera.lookAt(C.camTarget[0], C.camTarget[1], C.camTarget[2]);

    /* ---- lights: four, no shadow maps ---- */
    var hemi = new T.HemisphereLight(C.col.mist, C.col.purple, 0.55);
    var key = new T.DirectionalLight(C.col.lilac, 0.78);
    key.position.set(-8, 14, 6);
    var spill = new T.PointLight(C.col.redBright, 0.9, 12, 2);
    spill.position.set(0, 2.2, 0);
    var rim = new T.DirectionalLight(C.col.red, 0.25);
    rim.position.set(10, 4, -10);
    scene.add(hemi, key, spill, rim);

    /* ---- pod positions ---- */
    var podPositions = [];
    for (var i = 0; i < C.podCount; i++) {
      var a = (i / C.podCount) * Math.PI * 2 - Math.PI / 2;
      podPositions.push(new T.Vector3(Math.cos(a) * C.ringRadius, 0,
                                      Math.sin(a) * C.ringRadius));
    }

    /* ---- floor ---- */
    var floorGeo = new T.PlaneGeometry(C.floorSize, C.floorSize * 0.72);
    floorGeo.rotateX(-Math.PI / 2);
    var floorTex = circuitTexture();
    var floor = new T.Mesh(floorGeo, new T.MeshLambertMaterial({
      map: floorTex, color: 0xffffff
    }));
    scene.add(floor);

    var glowTex = radialGlowTexture(0.55);
    var floorGlowGeo = new T.PlaneGeometry(9, 9);
    floorGlowGeo.rotateX(-Math.PI / 2);
    var floorGlow = new T.Mesh(floorGlowGeo, new T.MeshBasicMaterial({
      map: glowTex, color: 0x7A1030, transparent: true,
      blending: T.AdditiveBlending, depthWrite: false, opacity: 0.10
    }));
    floorGlow.position.y = 0.006;
    floorGlow.renderOrder = C.order.floorGlow;
    scene.add(floorGlow);

    /* fake shadows: one merged mesh, 1 draw call, no shadow map anywhere */
    var shadowParts = [];
    for (i = 0; i < podPositions.length; i++) {
      var sg = new T.PlaneGeometry(2.6, 2.6); sg.rotateX(-Math.PI / 2);
      shadowParts.push(at(sg, podPositions[i].x, 0.004, podPositions[i].z));
    }
    var cg = new T.PlaneGeometry(6.4, 6.4); cg.rotateX(-Math.PI / 2);
    shadowParts.push(at(cg, 0, 0.003, 0));
    var shadows = new T.Mesh(mergeGeos(shadowParts), new T.MeshBasicMaterial({
      map: glowTex, color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false
    }));
    scene.add(shadows);

    /* ---- back wall code ---- */
    var wallGeo = new T.PlaneGeometry(40, 12);
    var wall = new T.Mesh(wallGeo, new T.MeshBasicMaterial({
      map: codeTexture(), transparent: true, opacity: 0.20,
      blending: T.AdditiveBlending, depthWrite: false
    }));
    wall.position.set(0, 5.4, -14);
    scene.add(wall);

    /* ---- traces: one geometry, two meshes (base + additive hot) ---- */
    var tr = buildTraces(podPositions);
    var vCount = tr.geometry.attributes.position.count;
    var perTrace = vCount / C.podCount;
    var traceColours = new Float32Array(vCount * 3);
    tr.geometry.setAttribute('color', new T.BufferAttribute(traceColours, 3));

    var tracesBase = new T.Mesh(tr.geometry, new T.MeshBasicMaterial({
      color: C.col.lilac, transparent: true, opacity: 0.22, depthWrite: false
    }));
    tracesBase.renderOrder = C.order.traces;
    var tracesHot = new T.Mesh(tr.geometry, new T.MeshBasicMaterial({
      vertexColors: true, transparent: true, blending: T.AdditiveBlending,
      depthWrite: false
    }));
    tracesHot.renderOrder = C.order.traces + 1;
    scene.add(tracesBase, tracesHot);

    /* ---- orchestrator ---- */
    var orch = new T.Group();
    var platformParts = [
      at(new T.CylinderGeometry(C.platformRadius, C.platformRadius + 0.18, 0.34, 40), 0, 0.17, 0),
      at(new T.TorusGeometry(C.platformRadius - 0.06, 0.055, 6, 52), 0, 0.35, 0, -Math.PI / 2)
    ];
    var platform = new T.Mesh(platformParts[0], new T.MeshStandardMaterial({
      color: 0x2A2F3A, roughness: 0.68, metalness: 0.20
    }));
    orch.add(platform);

    /* the glowing rim is a SEPARATE additive mesh, so the red never washes
       across the platform's top face and drown the robot standing on it */
    var platformRim = new T.Mesh(platformParts[1], new T.MeshBasicMaterial({
      color: C.col.red, transparent: true, opacity: 0.85,
      blending: T.AdditiveBlending, depthWrite: false
    }));
    platformRim.renderOrder = C.order.halo;
    orch.add(platformRim);

    var robotParts = [
      at(new T.CylinderGeometry(0.60, 0.74, 1.00, 12), 0, 0.88, 0),
      at(new T.BoxGeometry(1.60, 0.20, 0.44), 0, 1.42, 0),
      at((function () { var h = new T.SphereGeometry(0.46, 20, 14); h.scale(1, 0.84, 0.94); return h; })(), 0, 1.78, 0),
      at(new T.CylinderGeometry(0.12, 0.12, 0.64, 8), -0.82, 1.10, 0),
      at(new T.CylinderGeometry(0.12, 0.12, 0.64, 8), 0.82, 1.10, 0)
    ];
    var robot = new T.Mesh(mergeGeos(robotParts), new T.MeshStandardMaterial({
      color: 0xE8E4F2, roughness: 0.44, metalness: 0.06,
      emissive: C.col.lilac, emissiveIntensity: 0.10
    }));
    orch.add(robot);

    var eyeGeo = at(new T.PlaneGeometry(0.46, 0.13), 0, 1.80, 0.44);
    var eyes = new T.Mesh(eyeGeo, new T.MeshBasicMaterial({
      color: C.col.redBright, transparent: true, blending: T.AdditiveBlending,
      depthWrite: false
    }));
    eyes.renderOrder = C.order.halo;
    orch.add(eyes);

    /* dome: additive shell, emphatically not MeshPhysicalMaterial — transmission
       is an enormous fragment shader for a 12%-opacity surface */
    var dome = new T.Mesh(
      new T.SphereGeometry(1.95, 30, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new T.MeshBasicMaterial({
        color: C.col.lilac, transparent: true, opacity: 0.13,
        blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
      })
    );
    dome.position.y = 0.36;
    dome.renderOrder = C.order.dome;
    orch.add(dome);

    var domeWire = new T.Mesh(
      new T.SphereGeometry(1.97, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2),
      new T.MeshBasicMaterial({
        color: C.col.lilac, wireframe: true, transparent: true, opacity: 0.16,
        depthWrite: false
      })
    );
    domeWire.position.y = 0.36;
    domeWire.renderOrder = C.order.dome;
    orch.add(domeWire);

    /* scan wedge: alpha falloff BAKED into vertex colours at build time, so
       animating it is just rotation.y += w*dt with no shader and no per-frame
       work */
    var WEDGE = Math.PI / 3.2;
    var wedgeGeo = new T.CircleGeometry(1.55, 26, 0, WEDGE);
    wedgeGeo.rotateX(-Math.PI / 2);
    var wp = wedgeGeo.attributes.position;
    var wc = new Float32Array(wp.count * 3);
    for (i = 0; i < wp.count; i++) {
      var r = Math.sqrt(wp.getX(i) * wp.getX(i) + wp.getZ(i) * wp.getZ(i)) / 1.55;
      var f = Math.max(0, 1 - r) * 0.9 + 0.1;
      wc[i * 3] = f; wc[i * 3 + 1] = f * 0.82; wc[i * 3 + 2] = f * 0.95;
    }
    wedgeGeo.setAttribute('color', new T.BufferAttribute(wc, 3));
    var wedge = new T.Mesh(wedgeGeo, new T.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.5,
      blending: T.AdditiveBlending, depthWrite: false
    }));
    wedge.position.y = 0.40;
    wedge.renderOrder = C.order.wedge;
    orch.add(wedge);

    /* a thin vertical blade on the leading edge, so the sweep stays legible
       from an oblique projector angle */
    var bladeGeo = new T.PlaneGeometry(1.5, 0.42);
    bladeGeo.translate(0.75, 0.21, 0);
    var blade = new T.Mesh(bladeGeo, new T.MeshBasicMaterial({
      color: C.col.lilac, transparent: true, opacity: 0.20,
      blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
    }));
    blade.position.y = 0.40;
    blade.renderOrder = C.order.wedge;
    orch.add(blade);

    /* radar pings: pooled instanced rings */
    var pingGeo = new T.RingGeometry(0.40, 0.445, 36);
    pingGeo.rotateX(-Math.PI / 2);
    var pings = new T.InstancedMesh(pingGeo, new T.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.28,
      blending: T.AdditiveBlending, depthWrite: false
    }), 3);
    pings.instanceColor = new T.InstancedBufferAttribute(new Float32Array(9), 3);
    pings.renderOrder = C.order.wedge;
    pings.count = 3;
    orch.add(pings);

    scene.add(orch);

    /* ---- pods ---- */
    var rings = ringVariants();
    /* geometries and materials are built ONCE and shared by all ten pods, so
       there are no shader-program switches between them */
    var paleGeo = palePartsGeometry();
    var blockGeo = blockGeometry();
    var visorGeo = visorGeometry();
    var lensGeo = lensClusterGeometry();
    var skirtGeo = glowSkirtGeometry();

    /* materials from the spec: pod-satin, block-matte, lens-gloss, lens-emissive */
    var paleMat = new T.MeshStandardMaterial({
      color: 0xE8E4F2, roughness: 0.42, metalness: 0.0
    });
    var blockMat = new T.MeshStandardMaterial({
      color: 0xFFFFFF, map: blockPanelTexture(), roughness: 0.82, metalness: 0.10,
      emissive: 0xFFFFFF, emissiveIntensity: 0.85, emissiveMap: blockPanelTexture()
    });
    var visorMat = new T.MeshStandardMaterial({
      color: 0x120428, roughness: 0.26, metalness: 0.18
    });
    var lensMat = new T.MeshBasicMaterial({
      color: C.col.redBright, transparent: true, blending: T.AdditiveBlending,
      depthWrite: false, side: T.DoubleSide
    });

    var atlas = chipAtlas();
    var haloTex = radialGlowTexture(0.85);
    var podViews = [];

    for (i = 0; i < C.podCount; i++) {
      var g = new T.Group();
      g.position.copy(podPositions[i]);
      /* Face the camera, not the hub. Facing inward is semantically tempting
         (agents looking at the orchestrator) but it turns the visor - the pod's
         single most identifying feature - away from the viewer on every near
         pod. Every pod in the reference faces the viewer, so we do too. */
      g.rotation.y = Math.PI / 4;

      var inner = new T.Group();           /* lifted/tilted; keeps group y clean */

      /* the dark block stays on the ground: only the bust lifts and tilts, which
         is what makes the state elevation channel read as the AGENT reacting */
      var block = new T.Mesh(blockGeo, blockMat);
      g.add(block);

      /* cloned so the WHOLE BUST can carry the state colour as emissive - the
         one channel that cannot be missed, since it changes the pod's dominant
         surface rather than a detail on it. Clone shares the compiled program. */
      var bust = new T.Mesh(paleGeo, paleMat.clone());
      inner.add(bust);
      var visor = new T.Mesh(visorGeo, visorMat);
      inner.add(visor);
      /* cloned so each pod's lenses can carry its own state colour; the clone
         shares the compiled program, so there is no shader recompile */
      var lenses = new T.Mesh(lensGeo, lensMat.clone());
      lenses.renderOrder = C.order.halo;
      inner.add(lenses);

      var skirt = new T.Mesh(skirtGeo, new T.MeshBasicMaterial({
        color: C.col.lilac, transparent: true, opacity: 0.30,
        blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
      }));
      skirt.renderOrder = C.order.rain;
      inner.add(skirt);

      var ring = new T.Mesh(rings.thin, new T.MeshBasicMaterial({
        color: C.col.mist, transparent: true, opacity: 0.5,
        blending: T.AdditiveBlending, depthWrite: false
      }));
      ring.position.y = C.ringY;            /* clear of the block top */
      ring.renderOrder = C.order.halo;
      g.add(ring);                          /* on the block, not the lifting bust */

      /* glyph billboard: per-pod material + texture clone. Cloning a texture
         shares its .source, so there is one GPU upload and independent offsets;
         cloning a material shares the compiled program, so no recompile. */
      var gTex = atlas.texture.clone();
      gTex.needsUpdate = true;
      gTex.repeat.set(1, 1 / atlas.rows);
      /* NOT additive: a solid chip must stay readable over the bright platform
         glow as well as over the dark floor. Normal blending with alpha. */
      var glyph = new T.Mesh(
        new T.PlaneGeometry(C.chipWidth, C.chipHeight),
        new T.MeshBasicMaterial({ map: gTex, transparent: true, depthWrite: false, opacity: 1 })
      );
      /* Parented to the SCENE, not the pod: the pod group is rotated PI/4 to
         face the camera, and a local quaternion copy under a rotated parent
         renders the chip tilted. At the scene root, local == world. */
      glyph.position.set(podPositions[i].x, C.chipY, podPositions[i].z);
      glyph.renderOrder = C.order.packet + 2;   /* above everything else */
      scene.add(glyph);

      var halo = new T.Mesh(new T.PlaneGeometry(2.5, 2.5), new T.MeshBasicMaterial({
        map: haloTex, color: C.col.mist, transparent: true,
        blending: T.AdditiveBlending, depthWrite: false, opacity: 0.0
      }));
      halo.position.y = 1.35;
      halo.renderOrder = C.order.halo;
      inner.add(halo);

      /* The channel that actually carries across a workshop room. */
      var beacon = new T.Mesh(
        new T.CylinderGeometry(0.055, 0.055, 2.6, 6, 1, true),
        new T.MeshBasicMaterial({
          color: C.col.lilac, transparent: true, opacity: 0.5,
          blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
        })
      );
      beacon.position.y = 3.15;
      beacon.visible = false;
      beacon.renderOrder = C.order.beacon;
      inner.add(beacon);

      g.add(inner);

      /* invisible pick proxy — raycasting happens against these 10 spheres on
         pointerdown only, never against the scene graph and never per-frame */
      var pick = new T.Mesh(new T.SphereGeometry(1.15, 8, 6), new T.MeshBasicMaterial());
      pick.visible = false;
      pick.position.y = 0.9;
      pick.userData.podIndex = i;
      g.add(pick);

      scene.add(g);
      podViews.push({
        group: g, inner: inner, body: bust, block: block, visor: visor,
        lenses: lenses, skirt: skirt, ring: ring, glyph: glyph, halo: halo, beacon: beacon,
        pick: pick, basePos: podPositions[i].clone(),
        state: null, ringName: 'thin'
      });
    }

    /* ---- name labels: all in one merged geometry, 1 draw call ---- */
    var na = nameAtlas(labels);
    var labelParts = [];
    for (i = 0; i < C.podCount; i++) {
      var lg = new T.PlaneGeometry(2.9, 0.36);
      var uvAttr = lg.attributes.uv;
      var col = i % na.N, row = Math.floor(i / na.N);
      for (var v = 0; v < uvAttr.count; v++) {
        var u0 = uvAttr.getX(v), v0 = uvAttr.getY(v);
        uvAttr.setXY(v, (col + u0) / na.N, 1 - (row + (1 - v0)) / na.rows);
      }
      uvAttr.needsUpdate = true;
      lg.translate(podPositions[i].x, 0.07, podPositions[i].z + 1.45);
      lg.rotateX(0);
      labelParts.push(lg);
    }
    var labelsMesh = new T.Mesh(mergeGeos(labelParts), new T.MeshBasicMaterial({
      map: na.texture, transparent: true, depthWrite: false, opacity: 0.92
    }));
    labelsMesh.renderOrder = C.order.halo;
    scene.add(labelsMesh);

    /* ---- data rain: one shared geometry, cloned materials/textures ---- */
    var rainGeo = new T.CylinderGeometry(0.07, 0.07, 3.2, 6, 1, true);
    var rainTex0 = dashTexture();
    var rain = [];
    for (i = 0; i < C.podCount; i++) {
      var rt = rainTex0.clone(); rt.needsUpdate = true;
      var m = new T.Mesh(rainGeo, new T.MeshBasicMaterial({
        map: rt, transparent: true, blending: T.AdditiveBlending,
        depthWrite: false, side: T.DoubleSide, opacity: 0.0
      }));
      m.position.set(podPositions[i].x, 3.4, podPositions[i].z);
      m.visible = false;
      m.renderOrder = C.order.rain;
      scene.add(m);
      rain.push(m);
    }

    /* ---- packets: two instanced meshes for every packet in flight ---- */
    var CAPP = X.Engine.CAP_PACKETS;
    var packetCores = new T.InstancedMesh(
      new T.OctahedronGeometry(0.115, 0),
      new T.MeshBasicMaterial({ transparent: true, blending: T.AdditiveBlending, depthWrite: false }),
      CAPP
    );
    packetCores.instanceColor = new T.InstancedBufferAttribute(new Float32Array(CAPP * 3), 3);
    packetCores.renderOrder = C.order.packet;
    packetCores.count = 0;
    packetCores.frustumCulled = false;

    var packetHalos = new T.InstancedMesh(
      new T.PlaneGeometry(0.85, 0.85),
      new T.MeshBasicMaterial({
        map: haloTex, transparent: true, blending: T.AdditiveBlending,
        depthWrite: false, opacity: 0.55
      }),
      CAPP
    );
    packetHalos.instanceColor = new T.InstancedBufferAttribute(new Float32Array(CAPP * 3), 3);
    packetHalos.renderOrder = C.order.packet - 1;
    packetHalos.count = 0;
    packetHalos.frustumCulled = false;
    scene.add(packetCores, packetHalos);

    return {
      scene: scene, camera: camera,
      floor: floor, floorGlow: floorGlow, wall: wall, shadows: shadows,
      tracesBase: tracesBase, tracesHot: tracesHot,
      traceColours: traceColours, verticesPerTrace: perTrace,
      edgeLUTs: buildEdgeLUTs(tr.curves, 64),
      orch: orch, platform: platform, robot: robot, eyes: eyes,
      dome: dome, domeWire: domeWire, wedge: wedge, blade: blade, pings: pings,
      podViews: podViews, rings: rings, rain: rain, labelsMesh: labelsMesh,
      packetCores: packetCores, packetHalos: packetHalos,
      pickTargets: podViews.map(function (p) { return p.pick; }),
      atlasRows: atlas.rows,
      atlasIndex: atlas.index
    };
  }

  X.Scene = { build: build, mergeGeos: function (g) { return mergeGeos(g); } };
})(typeof module !== 'undefined' ? module.exports : (window.SVS = window.SVS || {}));
