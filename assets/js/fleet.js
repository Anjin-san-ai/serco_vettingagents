/* ==========================================================================
   fleet.js — renders the agent fleet as boxes on agents.html.
   Reads the single source of truth in assets/js/sim/agents.js (window.SVS.Agents).
   Classic script: no modules, because the pages must run from file://.
   ========================================================================== */
(function () {
  'use strict';

  var A = window.SVS && window.SVS.Agents;
  var grid = document.getElementById('fleet');
  if (!A || !grid) return;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function chips(items, cls) {
    var ul = el('ul', 'chips');
    items.forEach(function (t) {
      var li = el('li', 'chip ' + cls, t);
      ul.appendChild(li);
    });
    return ul;
  }

  /* One agent box. It is a <button> because it toggles a disclosure — that
     gives keyboard operation and the right semantics for free. */
  function box(agent, isOrch) {
    var b = el('button', 'agent-box' + (isOrch ? ' agent-box--orch' : ''));
    b.type = 'button';
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-controls', 'agent-pop');
    b.dataset.agent = agent.id;
    b.dataset.waveLabel = 'Wave ' + agent.wave;

    b.appendChild(el('span', 'agent-id', agent.code));
    b.appendChild(el('span', 'agent-name', agent.name));
    b.appendChild(el('span', 'agent-job', agent.job));

    var foot = el('div', 'agent-foot');
    foot.appendChild(chips(agent.systems, 'chip--sys'));
    var tags = el('ul', 'chips');
    if (agent.saving) tags.appendChild(el('li', 'chip chip--save', agent.saving));
    if (agent.human) tags.appendChild(el('li', 'chip chip--human', 'human in the loop'));
    if (tags.childNodes.length) foot.appendChild(tags);
    b.appendChild(foot);
    return b;
  }

  /* ------------------------------------------------------------ the popup
     ONE reused node on <body>, positioned at the pointer. Previously this was
     11 panels appended into the grid, which pushed the boxes around and lost
     the reader's place. */
  var pop = null, popTitle = null, popBody = null, opener = null;

  function ensurePopup() {
    if (pop) return pop;
    pop = el('div', 'agent-pop');
    pop.id = 'agent-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', 'false');
    pop.setAttribute('aria-labelledby', 'agent-pop-title');
    pop.hidden = true;
    pop.tabIndex = -1;

    var close = el('button', 'agent-pop-close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close agent detail');
    close.innerHTML = '&times;';
    close.addEventListener('click', hidePopup);
    pop.appendChild(close);

    popTitle = el('h3', 'agent-pop-title');
    popTitle.id = 'agent-pop-title';
    pop.appendChild(popTitle);

    popBody = el('div', 'agent-pop-body');
    pop.appendChild(popBody);

    document.body.appendChild(pop);
    return pop;
  }

  function fillPopup(agent) {
    popTitle.textContent = agent.code + ' \u00b7 ' + agent.name;
    popBody.textContent = '';
    var dl = el('dl');
    [
      ['Inputs', agent.detail.inputs],
      ['Processing', agent.detail.processing],
      ['Outputs', agent.detail.outputs],
      ['Guardrails', agent.detail.guardrails],
      ['What stays human', agent.detail.human],
      ['Evidence', agent.evidence]
    ].forEach(function (pair) {
      dl.appendChild(el('dt', null, pair[0]));
      dl.appendChild(el('dd', null, pair[1]));
    });
    popBody.appendChild(dl);
  }

  /* Prefer below-right of the cursor; flip and clamp so it never leaves the
     viewport. Measured AFTER fill, because the height depends on the content. */
  function placePopup(x, y) {
    pop.hidden = false;
    pop.style.left = '0px';
    pop.style.top = '0px';
    var M = 10;
    var r = pop.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;

    var left = x + 14;
    if (left + r.width > vw - M) left = x - 14 - r.width;      /* flip left */
    if (left < M) left = M;                                     /* clamp */
    if (left + r.width > vw - M) left = Math.max(M, vw - M - r.width);

    var top = y + 14;
    if (top + r.height > vh - M) top = y - 14 - r.height;       /* flip up */
    if (top < M) top = M;
    if (top + r.height > vh - M) top = Math.max(M, vh - M - r.height);

    pop.style.left = Math.round(left) + 'px';
    pop.style.top = Math.round(top) + 'px';
  }

  function showPopup(agent, btn, x, y) {
    ensurePopup();
    fillPopup(agent);
    /* keyboard path has no pointer coordinates, so anchor to the focused box */
    if (x == null) {
      var br = btn.getBoundingClientRect();
      x = br.left + br.width / 2;
      y = br.bottom;
    }
    placePopup(x, y);
    opener = btn;
    btn.setAttribute('aria-expanded', 'true');
    pop.focus();
  }

  function hidePopup() {
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    if (opener) {
      opener.setAttribute('aria-expanded', 'false');
      opener.focus();
      opener = null;
    }
  }

  /* Build the grid in reference-image order:
       A1 A2 A3 A4
       A5 [ A0 orchestrator ] A6
       A7 A8 A9 A10                                                        */
  var R = A.RING;
  var layout = [
    R[0], R[1], R[2], R[3],
    R[4], A.ORCHESTRATOR, R[5],
    R[6], R[7], R[8], R[9]
  ];

  layout.forEach(function (agent) {
    var isOrch = agent.id === 'orchestrator';
    var b = box(agent, isOrch);
    if (isOrch) b.classList.add('fleet-orch');
    grid.appendChild(b);
  });

  /* Open at the pointer. One popup, one open at a time. */
  grid.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.agent-box') : null;
    if (!btn) return;
    var agent = A.byId(btn.dataset.agent);
    if (!agent) return;

    var already = btn.getAttribute('aria-expanded') === 'true';
    grid.querySelectorAll('.agent-box[aria-expanded="true"]').forEach(function (b) {
      b.setAttribute('aria-expanded', 'false');
    });
    if (already) { hidePopup(); return; }

    /* detail() gives a click with no coordinates (keyboard-driven activation),
       in which case we anchor to the box instead of the cursor */
    var hasPointer = e.clientX || e.clientY;
    showPopup(agent, btn, hasPointer ? e.clientX : null, hasPointer ? e.clientY : null);
  });

  /* Dismiss on outside click, Esc, or scroll - a popup anchored to a cursor
     position is wrong the moment the page moves under it. */
  document.addEventListener('pointerdown', function (e) {
    if (!pop || pop.hidden) return;
    if (pop.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.agent-box')) return;
    hidePopup();
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hidePopup();
  });
  window.addEventListener('scroll', hidePopup, { passive: true });
  window.addEventListener('resize', hidePopup);

  /* Wave overlay toggle. */
  var waveBtn = document.getElementById('toggle-waves');
  if (waveBtn) {
    waveBtn.addEventListener('click', function () {
      var on = grid.getAttribute('data-waves') === 'on';
      grid.setAttribute('data-waves', on ? 'off' : 'on');
      waveBtn.setAttribute('aria-pressed', on ? 'false' : 'true');
      waveBtn.textContent = on ? 'Show delivery waves' : 'Hide delivery waves';
    });
  }

  /* Assurance plane responsibilities, from the same data file. */
  var planeList = document.getElementById('assurance-list');
  if (planeList) {
    A.ASSURANCE.responsibilities.forEach(function (t) {
      planeList.appendChild(el('li', null, t));
    });
  }
  var planeNote = document.getElementById('assurance-note');
  if (planeNote) planeNote.textContent = A.ASSURANCE.note;
})();
