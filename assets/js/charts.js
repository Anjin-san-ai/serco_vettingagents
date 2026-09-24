/* ==========================================================================
   charts.js — hand-rolled inline SVG charts. No charting library, because the
   pages must run from file:// with no network.

   Design rules followed (one system, accessible, brand-consistent):
     - one categorical hue per series, never a rainbow
     - value labels ON the marks, so the reader never counts gridlines
     - Serco Bright Red #EB2D2E is graphics-only (4.2:1 on white, below AA)
     - every chart gets a <title>/<desc> and a data table alternative
   ========================================================================== */
(function (X) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var COL = {
    red: '#C50001', redBright: '#EB2D2E', purple: '#1D0743',
    steel: '#46555F', mist: '#D7DEE2', lilac: '#E4D8FB',
    rule: '#DCE2E6', green: '#1F6B3A'
  };

  function el(tag, attrs, text) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }

  function svg(w, h, title, desc) {
    var s = el('svg', {
      viewBox: '0 0 ' + w + ' ' + h,
      role: 'img', 'aria-labelledby': '', preserveAspectRatio: 'xMinYMin meet'
    });
    s.appendChild(el('title', null, title));
    if (desc) s.appendChild(el('desc', null, desc));
    return s;
  }

  /* ---------------------------------------------------------------- Pareto
     Horizontal bars, descending, with a cumulative line. Horizontal because
     the category labels are prose-length and would otherwise be rotated. */
  function pareto(mount, data, opts) {
    opts = opts || {};
    var W = 760, rowH = 56, padL = 250, padR = 90, padT = 26;
    var H = padT + data.length * rowH + 30;
    var max = Math.max.apply(null, data.map(function (d) { return d.value; }));
    var barW = W - padL - padR;
    var s = svg(W, H, opts.title || 'Pareto chart', opts.desc);

    var total = data.reduce(function (a, d) { return a + d.value; }, 0);
    var cum = 0, pts = [];

    data.forEach(function (d, i) {
      var y = padT + i * rowH;
      var w = (d.value / max) * barW;

      s.appendChild(el('text', {
        x: padL - 12, y: y + 20, 'text-anchor': 'end', class: 'lbl'
      }, d.label));

      s.appendChild(el('rect', {
        x: padL, y: y + 6, width: w, height: 22, rx: 2,
        fill: d.highlight ? COL.red : COL.redBright,
        opacity: d.highlight ? 1 : 0.78
      }));

      s.appendChild(el('text', {
        x: padL + w + 8, y: y + 22, class: 'val'
      }, d.value + '%'));

      if (d.note) {
        s.appendChild(el('text', {
          x: padL, y: y + 44, class: 'lbl', 'font-size': '10', fill: COL.steel
        }, d.note));
      }
      cum += d.value;
      pts.push([padL + w, y + 17, cum]);
    });

    /* cumulative markers, drawn as a dotted polyline through the bar ends */
    var poly = pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ');
    s.appendChild(el('polyline', {
      points: poly, fill: 'none', stroke: COL.purple,
      'stroke-width': 1.5, 'stroke-dasharray': '3 3', opacity: 0.55
    }));
    pts.forEach(function (p) {
      s.appendChild(el('circle', { cx: p[0], cy: p[1], r: 3, fill: COL.purple, opacity: 0.7 }));
    });

    s.appendChild(el('text', {
      x: padL, y: H - 6, class: 'lbl', 'font-size': '10', fill: COL.steel
    }, 'Dotted line: cumulative share. Total of the four causes = ' + total + '% of the sample.'));

    mount.appendChild(s);
  }

  /* ------------------------------------------------------- stacked pass/fail */
  function passFail(mount, opts) {
    var W = 520, H = 300, padL = 54, padB = 46, padT = 20;
    var plotH = H - padB - padT, plotW = W - padL - 20;
    var s = svg(W, H, opts.title, opts.desc);

    [0, 25, 50, 75, 100].forEach(function (t) {
      var y = padT + plotH - (t / 100) * plotH;
      s.appendChild(el('line', {
        x1: padL, x2: padL + plotW, y1: y, y2: y, stroke: COL.rule, 'stroke-width': 1
      }));
      s.appendChild(el('text', {
        x: padL - 10, y: y + 4, 'text-anchor': 'end', 'font-size': '11', fill: COL.steel
      }, t + '%'));
    });

    var barW = 88;
    opts.bars.forEach(function (b, i) {
      var x = padL + 48 + i * 190;
      var failH = (b.fail / 100) * plotH;
      var passH = plotH - failH;
      s.appendChild(el('rect', {
        x: x, y: padT, width: barW, height: passH, fill: COL.green, opacity: 0.78
      }));
      s.appendChild(el('rect', {
        x: x, y: padT + passH, width: barW, height: failH, fill: COL.redBright
      }));
      s.appendChild(el('text', {
        x: x + barW / 2, y: padT + passH + failH / 2 + 5, 'text-anchor': 'middle',
        'font-size': '13', 'font-weight': '700', fill: '#fff'
      }, b.fail + '%'));
      s.appendChild(el('text', {
        x: x + barW / 2, y: H - 24, 'text-anchor': 'middle', class: 'lbl'
      }, b.label));
      if (b.sub) {
        s.appendChild(el('text', {
          x: x + barW / 2, y: H - 10, 'text-anchor': 'middle', 'font-size': '10', fill: COL.steel
        }, b.sub));
      }
    });

    /* Serco's own 10% target line */
    var ty = padT + plotH - (opts.target / 100) * plotH;
    s.appendChild(el('line', {
      x1: padL, x2: padL + plotW, y1: ty, y2: ty,
      stroke: COL.purple, 'stroke-width': 2, 'stroke-dasharray': '6 4'
    }));
    s.appendChild(el('text', {
      x: padL + plotW, y: ty - 7, 'text-anchor': 'end',
      'font-size': '11', 'font-weight': '700', fill: COL.purple
    }, 'Target ' + opts.target + '%'));
    mount.appendChild(s);
  }

  /* ------------------------------------------------------------ hours by agent */
  function hoursBars(mount, data, opts) {
    var W = 760, rowH = 38, padL = 250, padR = 110, padT = 16;
    var H = padT + data.length * rowH + 34;
    var max = Math.max.apply(null, data.map(function (d) { return d.value; }));
    var barW = W - padL - padR;
    var s = svg(W, H, opts.title, opts.desc);

    data.forEach(function (d, i) {
      var y = padT + i * rowH;
      var w = Math.max(2, (d.value / max) * barW);
      s.appendChild(el('text', {
        x: padL - 12, y: y + 20, 'text-anchor': 'end', class: 'lbl'
      }, d.label));
      s.appendChild(el('rect', {
        x: padL, y: y + 7, width: w, height: 20, rx: 2,
        fill: d.serco ? COL.purple : COL.redBright, opacity: d.serco ? 0.9 : 0.8
      }));
      s.appendChild(el('text', {
        x: padL + w + 8, y: y + 22, class: 'val'
      }, d.value ? d.value + ' hrs' : d.text || '—'));
    });

    s.appendChild(el('text', {
      x: padL, y: H - 8, 'font-size': '10', fill: COL.steel
    }, 'Purple: a figure Serco documented. Red: a saving this design enables but Serco has not yet costed.'));
    mount.appendChild(s);
  }

  /* --------------------------------------------------------- volume breakdown */
  function volumeBars(mount, data, opts) {
    var W = 680, rowH = 40, padL = 230, padR = 120, padT = 16;
    var H = padT + data.length * rowH + 20;
    var max = Math.max.apply(null, data.map(function (d) { return d.value; }));
    var barW = W - padL - padR;
    var s = svg(W, H, opts.title, opts.desc);

    data.forEach(function (d, i) {
      var y = padT + i * rowH;
      var w = Math.max(2, (d.value / max) * barW);
      s.appendChild(el('text', {
        x: padL - 12, y: y + 20, 'text-anchor': 'end', class: 'lbl'
      }, d.label));
      s.appendChild(el('rect', {
        x: padL, y: y + 8, width: w, height: 20, rx: 2, fill: COL.purple, opacity: 0.86
      }));
      s.appendChild(el('text', { x: padL + w + 8, y: y + 23, class: 'val' },
        d.value + '/mo'));
      s.appendChild(el('text', {
        x: padL + w + 74, y: y + 23, 'font-size': '10', fill: COL.steel
      }, d.to));
    });
    mount.appendChild(s);
  }

  X.Charts = {
    pareto: pareto, passFail: passFail, hoursBars: hoursBars, volumeBars: volumeBars,
    COL: COL
  };
})(window.SVS = window.SVS || {});
