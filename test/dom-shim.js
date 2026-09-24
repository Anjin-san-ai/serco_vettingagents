/* ==========================================================================
   test/dom-shim.js - the smallest DOM that evidence-view.js will run against.

   Not a browser and not trying to be. It exists so the test suite can execute
   the real view code across every step, which is the only way to catch a null
   field reference inside a builder - the data tests check the data, not the
   code that walks it.
   ========================================================================== */
'use strict';

function matches(node, sel) {
  if (sel.charAt(0) === '.') {
    return (' ' + (node.className || '') + ' ').indexOf(' ' + sel.slice(1) + ' ') >= 0;
  }
  if (sel.charAt(0) === '#') { return node.id === sel.slice(1); }
  return node.tag === sel;
}

class El {
  constructor(tag) {
    this.tag = tag;
    this.className = '';
    this.id = '';
    this.children = [];
    this.attrs = {};
    this.style = {};
    this._text = '';
    this.hidden = false;
    this.disabled = false;
    this.listeners = {};
    this.focused = false;
    this.scrolled = false;
    const self = this;
    this.classList = {
      add(c) { if (!matches(self, '.' + c)) { self.className = (self.className + ' ' + c).trim(); } },
      remove(c) {
        self.className = self.className.split(/\s+/).filter(x => x && x !== c).join(' ');
      },
      contains(c) { return matches(self, '.' + c); }
    };
  }
  get childElementCount() { return this.children.length; }
  /* In a real DOM these IDL attributes reflect into content attributes, so
     img.src = x is observable as getAttribute('src'). Model that, or tests
     asserting on attributes silently see undefined. */
  get src() { return this.getAttribute('src'); }
  set src(v) { this.setAttribute('src', v); }
  get href() { return this.getAttribute('href'); }
  set href(v) { this.setAttribute('href', v); }
  get alt() { return this.getAttribute('alt'); }
  set alt(v) { this.setAttribute('alt', v); }
  get rel() { return this.getAttribute('rel'); }
  set rel(v) { this.setAttribute('rel', v); }
  get target() { return this.getAttribute('target'); }
  set target(v) { this.setAttribute('target', v); }
  get loading() { return this.getAttribute('loading'); }
  set loading(v) { this.setAttribute('loading', v); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() {
    return this.children.length
      ? this.children.map(c => c.textContent).join('')
      : this._text;
  }
  appendChild(n) { this.children.push(n); return n; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  dispatch(t, ev) {
    for (const fn of (this.listeners[t] || [])) { fn(ev || { preventDefault() {} }); }
  }
  focus() { this.focused = true; }
  scrollIntoView() { this.scrolled = true; }
  walk(out) {
    for (const c of this.children) { out.push(c); c.walk(out); }
    return out;
  }
  querySelectorAll(sel) { return this.walk([]).filter(n => matches(n, sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

function install(SVS, hash) {
  const byId = {};
  const doc = {
    createElement(tag) { return new El(tag); },
    createTextNode(t) { const n = new El('#text'); n.textContent = t; return n; },
    getElementById(id) { return byId[id] || null; },
    body: new El('body')
  };
  // The elements evidence.html provides.
  for (const id of ['ev-app', 'ev-boot', 'ev-boot-why', 'ev-combinations', 'ev-acceptability']) {
    const e = new El('div');
    e.id = id;
    if (id === 'ev-boot' || id === 'ev-boot-why') { e.hidden = true; }
    byId[id] = e;
  }
  const win = {
    SVS,
    Event: function Event(t) { this.type = t; },
    matchMedia() { return { matches: false }; },
    location: { hash: hash || '' },
    history: { replaceState(a, b, h) { win.location.hash = h; } },
    addEventListener(t, fn) { (win.listeners[t] = win.listeners[t] || []).push(fn); },
    listeners: {}
  };
  global.document = doc;
  global.window = win;
  return { doc, win, byId, El };
}

function uninstall() { delete global.document; delete global.window; }

module.exports = { install, uninstall, El };
