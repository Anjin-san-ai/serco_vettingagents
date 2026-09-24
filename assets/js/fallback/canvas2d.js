/* ==========================================================================
   canvas2d.js — WebGL capability check and a Canvas2D renderer over the SAME
   SimState. No Three.js, no WebGL.

   Uses the identical state -> visual encoding table as the 3D view (colour +
   glyph + ring dash + size), so the fallback is not a degraded story, just a
   flatter picture.

   `examples/jsm/WebGL.js` is ESM-only and therefore unavailable from file://,
   so the capability check is hand-rolled.
   ========================================================================== */
(function (X) {
  'use strict';

  var C = X.Config;
  var E = X.Engine;

  function isWebGLAvailable() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
                (c.getContext('webgl2') || c.getContext('webgl') ||
                 c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  function create(canvasEl, labels) {
    var ctx = canvasEl.getContext('2d');
    var pods = [];
    var cx = 0, cy = 0, scale = 1;

    function layout() {
      var w = canvasEl.width, h = canvasEl.height;
      cx = w / 2; cy = h / 2;
      scale = Math.min(w, h) / 17;
      pods.length = 0;
      for (var i = 0; i < C.podCount; i++) {
        var a = (i / C.podCount) * Math.PI * 2 - Math.PI / 2;
        /* isometric-ish projection: squash the vertical axis */
        pods.push({
          x: cx + Math.cos(a) * C.ringRadius * scale,
          y: cy + Math.sin(a) * C.ringRadius * scale * 0.55
        });
      }
    }

    function resize(w, h) {
      canvasEl.width = w; canvasEl.height = h;
      layout();
    }

    function hex(n) { return '#' + ('000000' + n.toString(16)).slice(-6); }

    function draw(state) {
      var w = canvasEl.width, h = canvasEl.height;
      ctx.fillStyle = hex(C.col.purpleLo);
      ctx.fillRect(0, 0, w, h);

      /* traces, with heat */
      for (var t = 0; t < C.podCount; t++) {
        var heat = state.traceHeat[t];
        ctx.strokeStyle = heat > 0.02
          ? 'rgba(235,45,46,' + (0.25 + heat * 0.7).toFixed(3) + ')'
          : 'rgba(228,216,251,0.18)';
        ctx.lineWidth = heat > 0.02 ? 3 : 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(pods[t].x, pods[t].y);
        ctx.stroke();
      }

      /* orchestrator */
      var orch = state.agents[0];
      ctx.beginPath();
      ctx.arc(cx, cy, scale * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(197,0,1,' + (orch.state === 'WORKING' ? 0.34 : 0.16) + ')';
      ctx.fill();
      ctx.strokeStyle = hex(C.col.redBright);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = hex(C.col.mist);
      ctx.font = 'bold ' + Math.round(scale * 0.42) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('A0 Orchestrator', cx, cy + scale * 2.1);

      /* packets */
      for (var p = 0; p < E.CAP_PACKETS; p++) {
        if (!state.pActive[p]) continue;
        var edge = state.pEdge[p];
        var tr = E.edgeTrace(edge);
        var u = state.pU[p];
        if (!E.edgeIsOutbound(edge)) u = 1 - u;
        var px = cx + (pods[tr].x - cx) * u;
        var py = cy + (pods[tr].y - cy) * u;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(3, scale * 0.14), 0, Math.PI * 2);
        ctx.fillStyle = hex(C.packetColours[state.pStatus[p]] || C.packetColours[0]);
        ctx.fill();
      }

      /* pods: same five-channel encoding as the 3D view */
      for (var i = 0; i < C.podCount; i++) {
        var ag = state.agents[i + 1];
        var conf = C.state[ag.state] || C.state.IDLE;
        var pos = pods[i];
        var r = scale * (0.62 + conf.lift * 1.6);

        /* halo */
        if (conf.dim > 0.5 && ag.state !== 'IDLE') {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r * 1.9, 0, Math.PI * 2);
          ctx.fillStyle = hex(conf.colour) + '22';
          ctx.fill();
        }
        /* body */
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(35,42,48,0.95)';
        ctx.fill();

        /* ring: dash pattern matches the 3D ring geometry variant */
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r * 1.28, 0, Math.PI * 2);
        ctx.strokeStyle = hex(conf.colour);
        ctx.globalAlpha = 0.35 + conf.dim * 0.6;
        ctx.lineWidth = conf.ring === 'double' ? 4 : 2.5;
        ctx.setLineDash(
          conf.ring === 'dash4' ? [r * 0.5, r * 0.4] :
          conf.ring === 'dash2' ? [r * 1.3, r * 0.9] :
          conf.ring === 'disc' ? [] : []
        );
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        /* beacon: the waiting-on-human channel */
        if (conf.beacon) {
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y - r);
          ctx.lineTo(pos.x, pos.y - r - scale * 2.3);
          ctx.strokeStyle = hex(conf.colour);
          ctx.lineWidth = 4;
          ctx.stroke();
        }

        /* glyph */
        ctx.fillStyle = hex(conf.colour);
        ctx.font = 'bold ' + Math.round(r * 0.95) + 'px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(C.glyphs[conf.glyph], pos.x, pos.y);

        /* name */
        ctx.fillStyle = 'rgba(215,222,226,0.85)';
        ctx.font = Math.round(scale * 0.3) + 'px system-ui, sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText(labels[i], pos.x, pos.y + r * 1.6);
      }
    }

    function pick(clientX, clientY, rect) {
      var x = (clientX - rect.left) * (canvasEl.width / rect.width);
      var y = (clientY - rect.top) * (canvasEl.height / rect.height);
      for (var i = 0; i < pods.length; i++) {
        var dx = x - pods[i].x, dy = y - pods[i].y;
        if (dx * dx + dy * dy < (scale * 1.1) * (scale * 1.1)) return i;
      }
      return -1;
    }

    layout();
    return { draw: draw, resize: resize, pick: pick };
  }

  X.Fallback = { isWebGLAvailable: isWebGLAvailable, create: create };
})(typeof module !== 'undefined' ? module.exports : (window.SVS = window.SVS || {}));
