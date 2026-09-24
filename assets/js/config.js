/* ==========================================================================
   config.js — every renderer tunable, brand colour and quality tier.
   View-side only. The simulation engine deliberately has no dependency on it.
   ========================================================================== */
(function (X) {
  'use strict';

  var C = {
    /* ---- brand, as hex ints for Three.js ---- */
    col: {
      red:       0xC50001,
      redBright: 0xEB2D2E,
      purple:    0x1D0743,
      purpleLo:  0x120428,
      slate:     0x232A30,
      steel:     0x46555F,
      mist:      0xD7DEE2,
      lilac:     0xE4D8FB,
      white:     0xFFFFFF,
      green:     0x6FD68F    /* completion only; not a brand colour, used sparingly */
    },

    /* ---- layout ---- */
    ringRadius: 6.2,
    podCount: 10,
    platformRadius: 2.45,
    floorSize: 42,

    /* ---- camera ---- */
    camHalfHeight: 9.3,
    camPos: [22, 18, 22],
    /* shifted off-centre so the ring clears the HUD event log on the right */
    camTarget: [1.9, 1.0, 1.1],
    camAzimuthClamp: 0.52,     /* +/- radians (~30 degrees) */
    camDriftAmp: 0.6,
    camDriftPeriod: 40,

    /* ---- loop ---- */
    simDt: 1 / 30,
    maxCatchUpSteps: 5,
    dtClamp: 0.25,
    speeds: [0.5, 1, 2, 4],
    defaultSpeedIx: 1,

    /* ---- quality ladder. antialias is construction-time only, so it is read
            once at boot; pixelRatio is the runtime lever. ---- */
    tiers: [
      { pixelRatio: 1.5, rain: true,  packetHalos: true,  domeWire: true,  drift: true,  pings: true  },
      { pixelRatio: 1.0, rain: false, packetHalos: false, domeWire: true,  drift: false, pings: true  },
      { pixelRatio: 0.75, rain: false, packetHalos: false, domeWire: false, drift: false, pings: false }
    ],
    tierUpMs: 20,              /* median frame time above this -> degrade */
    tierUp2Ms: 28,
    tierBailMs: 40,
    tierHysteresisMs: 3000,
    perfWindow: 90,

    /* ---- status chip: the fix for "I cannot tell if agents change status".
            The old glyph was a 0.34-unit quad on a pod that renders ~50 px, so
            the glyph landed at ~10 px. This chip is a filled, billboarded
            rounded rect carrying the glyph AND the state colour. ---- */
    chipWidth: 1.95,
    chipHeight: 0.49,
    chipY: 2.34,
    chipAtlasRows: 8,
    ringR0: 0.72,
    ringR1: 0.96,
    ringY: 0.68,
    bodyTintMax: 0.55,      /* emissiveIntensity on the bust at full state dim */

    /* ---- animation ---- */
    ringSpinRate: 1.6,
    bobAmp: 0.04,
    bobRate: 1.2,
    strobeRate: 2.0,
    scanRate: 0.55,
    rainSpeed: 0.55,

    /* ---- pod state encoding. Five independent channels so colour is never
            load-bearing, with luminance rising from idle to done so the table
            survives a washed-out projector and a greyscale screenshot.  ---- */
    state: {
      IDLE: {
        colour: 0xD7DEE2, dim: 0.22, glyph: 0, ring: 'thin',
        motion: 'none', lift: 0.00, beacon: false, tilt: 0,
        label: 'Idle',
        chip: 'IDLE',
        desc: 'thin dim ring, no motion, at rest'
      },
      WORKING: {
        colour: 0xEB2D2E, dim: 1.0, glyph: 1, ring: 'dash4',
        motion: 'spin', lift: 0.06, beacon: false, tilt: 0,
        label: 'Working',
        chip: 'WORKING',
        desc: 'four chasing dashes, ring spins, pod bobs and lifts'
      },
      WAITING_HUMAN: {
        colour: 0xE4D8FB, dim: 1.0, glyph: 2, ring: 'dash2',
        motion: 'blink', lift: 0.14, beacon: true, tilt: 0,
        label: 'Waiting on human',
        chip: 'HUMAN',
        desc: 'two dashes blinking and a beacon column rises above the pod'
      },
      ESCALATED: {
        colour: 0xC50001, dim: 1.0, glyph: 3, ring: 'double',
        motion: 'strobe', lift: 0.20, beacon: true, tilt: 0.14,
        label: 'Escalated',
        chip: 'ESCALATED',
        desc: 'double counter-rotating ring, strobe, and the pod tilts'
      },
      DONE: {
        colour: 0x6FD68F, dim: 1.0, glyph: 4, ring: 'disc',
        motion: 'pop', lift: 0.00, beacon: false, tilt: 0,
        label: 'Complete',
        chip: 'COMPLETE',
        desc: 'solid disc, one expanding ring, then back to rest'
      },
      /* BLOCKED removed: it was never assigned by the engine, so the legend
         was advertising a state that cannot happen. */
    },

    /* Glyph atlas cell order must match state.glyph above. Drawn as text into
       a canvas atlas at boot — no font loading, no TextGeometry (unavailable). */
    glyphs: ['·', '≡', '●', '⚠', '✓', '✕'],

    /* Packet status colours: 0 normal, 1 branched, 2 escalated */
    packetColours: [0xE4D8FB, 0xFFD27A, 0xEB2D2E],

    /* Render order contract, applied once at build. Every additive material
       also sets depthWrite:false, or the dome glows through the robot. */
    order: {
      floorGlow: 5, traces: 10, rain: 15, wedge: 20,
      halo: 25, dome: 30, packet: 35, beacon: 28
    }
  };

  X.Config = C;
})(typeof module !== 'undefined' ? module.exports : (window.SVS = window.SVS || {}));
