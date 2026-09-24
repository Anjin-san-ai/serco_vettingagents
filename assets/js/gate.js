/* ==========================================================================
   gate.js — lightweight password gate for the demo site.
   Runs before anything else; hides the page until the correct passphrase
   is entered. Uses sessionStorage so the user only types it once per
   browser session. Works from file:// as well as http(s)://.
   ========================================================================== */
(function () {
  'use strict';

  var KEY  = 'svs_auth';
  var PASS = 'C0gn1z4nt';

  /* Already authenticated this session — do nothing. */
  try { if (sessionStorage.getItem(KEY) === '1') { return; } } catch (e) {}

  /* Hide page content instantly so there's no flash of ungated content. */
  var style = document.createElement('style');
  style.textContent = 'body>*:not(#svs-gate){visibility:hidden}';
  document.head.appendChild(style);

  function unlock() {
    try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
    var overlay = document.getElementById('svs-gate');
    if (overlay) {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity .3s ease';
      setTimeout(function () { overlay.parentNode && overlay.parentNode.removeChild(overlay); }, 320);
    }
    style.parentNode && style.parentNode.removeChild(style);
  }

  function buildOverlay() {
    var o = document.createElement('div');
    o.id = 'svs-gate';
    o.innerHTML = [
      '<div class="svs-gate-card">',
      '  <div class="svs-gate-brand">',
      '    <img src="assets/img/serco-logo.png" alt="Serco" class="svs-gate-logo-s">',
      '    <span class="svs-gate-divider" aria-hidden="true"></span>',
      '    <img src="assets/img/Cognizantlogo.png" alt="Cognizant" class="svs-gate-logo-c">',
      '  </div>',
      '  <h1 class="svs-gate-title">Agentic Vetting</h1>',
      '  <p class="svs-gate-sub">Solution architecture demonstrator &mdash; Cognizant for Serco</p>',
      '  <form id="svs-gate-form" class="svs-gate-form" autocomplete="off">',
      '    <label for="svs-gate-pw" class="svs-gate-label">Access code</label>',
      '    <div class="svs-gate-row">',
      '      <input id="svs-gate-pw" type="password" class="svs-gate-input"',
      '             placeholder="Enter access code" autocomplete="current-password">',
      '      <button type="submit" class="svs-gate-btn">Enter</button>',
      '    </div>',
      '    <p id="svs-gate-err" class="svs-gate-err" hidden>Incorrect code &mdash; please try again.</p>',
      '  </form>',
      '  <p class="svs-gate-footer">Prepared by Cognizant &middot; September 2026</p>',
      '</div>'
    ].join('\n');

    /* Inline all styles so this works before any stylesheet loads. */
    o.style.cssText = [
      'position:fixed;inset:0;z-index:99999',
      'display:flex;align-items:center;justify-content:center',
      'background:#1D0743',
      'font-family:"Avenir Next LT Pro","Avenir Next",Avenir,"Segoe UI",system-ui,sans-serif'
    ].join(';');

    var css = document.createElement('style');
    css.textContent = [
      '#svs-gate{box-sizing:border-box;padding:1rem}',
      '.svs-gate-card{',
      '  background:#fff;border-radius:8px;padding:2.5rem 2rem 2rem;',
      '  max-width:26rem;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.4);',
      '  text-align:center',
      '}',
      '.svs-gate-brand{display:flex;align-items:center;justify-content:center;gap:.75rem;margin-bottom:1.75rem}',
      '.svs-gate-logo-s{height:28px;width:auto}',
      '.svs-gate-logo-c{height:22px;width:auto}',
      '.svs-gate-divider{display:inline-block;width:1px;height:28px;background:#DCE2E6}',
      '.svs-gate-title{font-size:1.45rem;font-weight:700;color:#1D0743;margin:0 0 .35rem;font-family:Lora,Georgia,serif}',
      '.svs-gate-sub{font-size:.88rem;color:#46555F;margin:0 0 1.75rem;line-height:1.4}',
      '.svs-gate-label{display:block;text-align:left;font-size:.82rem;font-weight:600;color:#232A30;margin-bottom:.4rem;letter-spacing:.03em;text-transform:uppercase}',
      '.svs-gate-row{display:flex;gap:.5rem}',
      '.svs-gate-input{',
      '  flex:1;padding:.6rem .75rem;border:1.5px solid #DCE2E6;border-radius:4px;',
      '  font-size:1rem;font-family:inherit;color:#232A30;outline:none;',
      '  transition:border-color .15s',
      '}',
      '.svs-gate-input:focus{border-color:#1D0743}',
      '.svs-gate-btn{',
      '  padding:.6rem 1.25rem;background:#1D0743;color:#fff;border:none;',
      '  border-radius:4px;font-size:.95rem;font-weight:600;cursor:pointer;',
      '  font-family:inherit;transition:background .15s;white-space:nowrap',
      '}',
      '.svs-gate-btn:hover{background:#2d0f6a}',
      '.svs-gate-err{font-size:.84rem;color:#C50001;text-align:left;margin:.6rem 0 0}',
      '.svs-gate-footer{font-size:.75rem;color:#B9C4CB;margin:1.5rem 0 0}'
    ].join('\n');
    document.head.appendChild(css);

    return o;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var overlay = buildOverlay();
    document.body.appendChild(overlay);

    var form = document.getElementById('svs-gate-form');
    var input = document.getElementById('svs-gate-pw');
    var err   = document.getElementById('svs-gate-err');

    input.focus();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (input.value === PASS) {
        err.hidden = true;
        unlock();
      } else {
        err.hidden = false;
        input.value = '';
        input.focus();
        /* Brief shake */
        var card = overlay.querySelector('.svs-gate-card');
        card.style.animation = 'none';
        card.style.transform = 'translateX(6px)';
        setTimeout(function () { card.style.transform = 'translateX(-6px)'; }, 60);
        setTimeout(function () { card.style.transform = 'translateX(0)'; }, 120);
      }
    });
  });
}());
