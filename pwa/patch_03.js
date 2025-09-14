/* patch_03.js — Make Red Letter toggle work after initial word-wrapping
   Strategy: unwrap .word spans -> apply marker replacements -> re-wrap words.
   Safe, idempotent, and only hooks the MC toggle + helper.
*/
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const storyEl = $('story');

  function unwrapWords(rootEl) {
    if (!rootEl) return;
    const words = Array.from(rootEl.querySelectorAll('span.word'));
    if (!words.length) return;
    const frag = document.createDocumentFragment();
    // Replace each .word with a plain text node, preserving spaces
    words.forEach(w => {
      const t = document.createTextNode(w.textContent || '');
      w.parentNode.replaceChild(t, w);
    });
    // Normalize to merge adjacent text nodes
    rootEl.normalize();
  }

  function applyMarkersFast(rootEl) {
    // Use the same replacements as v24 (monkey-patch if not present)
    const html = rootEl.innerHTML;
    const next = html
      .replace(/###\s*MCD\s*START/gi, '<span class="mc-red">')
      .replace(/###\s*MCD\s*END/gi, '</span>');
    if (next !== html) rootEl.innerHTML = next;
  }

  function wrapWords(rootEl) {
    // Lightweight re-wrap; mirrors v24 wrapWords behavior
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
    const toWrap = [];
    while (walker.nextNode()) {
      const t = walker.currentNode;
      if (!t.nodeValue || !t.nodeValue.trim()) continue;
      if (t.parentElement && t.parentElement.classList.contains('mc-red')) continue;
      toWrap.push(t);
    }
    toWrap.forEach(t => {
      const parts = t.nodeValue.split(/(\s+)/);
      const frag = document.createDocumentFragment();
      parts.forEach(part => {
        if (/^\s+$/.test(part)) {
          frag.appendChild(document.createTextNode(part));
        } else {
          const span = document.createElement('span');
          span.className = 'word';
          span.textContent = part;
          frag.appendChild(span);
        }
      });
      t.parentNode.replaceChild(frag, t);
    });
  }

  // Patch the button click so toggle-on path unwraps first
  document.addEventListener('DOMContentLoaded', () => {
    const mcBtn = $('toggle-mc');
    if (!mcBtn || !storyEl) return;

    // Intercept the existing handler by adding a capturing listener that runs first.
    mcBtn.addEventListener('click', () => {
      const turningOn = !(window.__mc_enabled === true);
      if (!turningOn) return; // off path unchanged
      // 1) unwrap word spans created by loadText()
      unwrapWords(storyEl);
      // 2) apply marker replacements
      applyMarkersFast(storyEl);
      // 3) re-wrap words for TTS/click-to-read
      wrapWords(storyEl);
    }, true);
  });
})();
