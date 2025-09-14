/* patch_04.js — Enforce .mc-red color on iOS Safari
   - After markers are applied (or after a load), explicitly set color + -webkit-text-fill-color
   - No CSS injection (respects your CSP); uses per-element style props like your prefs do.
*/
(() => {
  'use strict';

  const MC_COLOR = '#8B0000'; // dark red; keep in sync with reader.css

  function enforceMcColor(root){
    if (!root) return;
    const nodes = root.querySelectorAll('span.mc-red');
    nodes.forEach(n => {
      // Make Safari paint the red fill regardless of inherited/base color
      n.style.color = MC_COLOR;
      n.style.webkitTextFillColor = MC_COLOR;
      // if you ever add text stroke, ensure fill is visible
      if (n.style.webkitTextStroke) n.style.webkitTextStroke = '0';
    });
  }

  function patchToggleOnce(){
    const btn = document.getElementById('toggle-mc');
    const root = document.getElementById('story');
    if (!btn || !root || window.__mc_ios_patch__) return;
    window.__mc_ios_patch__ = true;

    // Run after the existing toggle code finishes (so spans exist)
    btn.addEventListener('click', () => {
      // microtask → after your marker/wrap work
      setTimeout(() => enforceMcColor(root), 0);
    }, true);
  }

  function hookLoadTextOnce(){
    if (!window.reader || typeof window.reader.loadText !== 'function' || window.__mc_ios_load_patch__) return;
    window.__mc_ios_load_patch__ = true;
    const orig = window.reader.loadText;
    window.reader.loadText = async function(...args){
      const out = await orig.apply(this, args);
      // If markers were already present in the source, ensure they’re painted
      const root = document.getElementById('story');
      enforceMcColor(root);
      return out;
    };
  }

  function init(){
    patchToggleOnce();
    hookLoadTextOnce();
    // Final safety: if something rewrites #story without calling loadText,
    // repaint .mc-red shortly after significant DOM changes.
    const root = document.getElementById('story');
    if (!root) return;
    const mo = new MutationObserver(muts => {
      if (muts.some(m => m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length))) {
        setTimeout(() => enforceMcColor(root), 0);
      }
    });
    mo.observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
})();
