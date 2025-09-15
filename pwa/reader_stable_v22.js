/* reader.js — stable build (Aug 11, 2025)
   Matches IDs in dyslexia-friendly-reader.html
*/
(() => {
  'use strict';

  // Reader import handoff
  (function (){
    const STORAGE_KEY = 'reader:import';
    const channelName = 'reader';

    async function consumeImport(payload) {
      const STORAGE_KEY = 'reader:import';
      try {
        const deliver = async () => {
          if (window.reader && typeof window.reader.loadText === 'function') {
            await window.reader.loadText(payload.text, payload.name, payload.meta || {});
            return true;
          } else if (window.reader && typeof window.reader.openFile === 'function') {
            const file = new File([payload.text], payload.name || 'import.txt', { type: 'text/plain' });
            await window.reader.openFile(file, payload.meta || {});
            return true;
          }
          return false;
        };
        let ok = await deliver();
        if (!ok) {
          if (document.readyState === 'loading') {
            await new Promise(res => document.addEventListener('DOMContentLoaded', res, { once: true }));
          }
          ok = await deliver();
        }
        if (ok) {
          try { localStorage.removeItem(STORAGE_KEY); } catch {}
          if (location.hash === '#import') history.replaceState(null, '', location.pathname + location.search);
        } else {
          alert('Reader integration missing: implement reader.loadText(text, name, meta) or reader.openFile(file).');
        }
      } catch (e) {
        console.error('Import error:', e);
      }
    }

    // ===== EPUB → Plain Text extraction =====
    // ===== EPUB → Plain Text extraction (JSZip, no epub.js rendering) =====
async function extractEpubToPlainText(file) {
  if (!(window.JSZip)) {
    throw new Error('JSZip not loaded (vendor/jszip/jszip.min.js).');
  }
  const zip = await JSZip.loadAsync(file);

  // 1) Find the OPF via META-INF/container.xml
  const CONTAINER = 'META-INF/container.xml';
  const containerEntry = zip.file(CONTAINER);
  if (!containerEntry) throw new Error(`EPUB missing ${CONTAINER}`);
  const containerXml = await containerEntry.async('string');

  const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
  const rootfileEl = containerDoc.querySelector('rootfile');
  const opfPath = rootfileEl && rootfileEl.getAttribute('full-path');
  if (!opfPath) throw new Error('Could not locate .opf (no rootfile full-path)');

  // 2) Read OPF (manifest + spine)
  const opfEntry = zip.file(opfPath);
  if (!opfEntry) throw new Error(`Missing OPF at ${opfPath}`);
  const opfXml = await opfEntry.async('string');

  const opfDoc = new DOMParser().parseFromString(opfXml, 'application/xml');

  // Build manifest map id -> href
  const manifest = {};
  opfDoc.querySelectorAll('manifest > item').forEach(it => {
    manifest[it.getAttribute('id')] = it.getAttribute('href');
  });

  // Spine order (list of manifest ids)
  const spineIds = Array.from(opfDoc.querySelectorAll('spine > itemref'))
    .map(el => el.getAttribute('idref'))
    .filter(Boolean);

  // Resolve base path for content files (OPF directory)
  const baseDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  // Helper: XHTML -> plain text
  function xhtmlToText(xhtml) {
    const doc = new DOMParser().parseFromString(xhtml, 'text/html');
    doc.querySelectorAll('br').forEach(br => br.replaceWith(doc.createTextNode('\n')));
    doc.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
      const t = (h.textContent || '').trim();
      h.replaceWith(doc.createTextNode('\n\n' + t.toUpperCase() + '\n\n'));
    });
    doc.querySelectorAll('p,blockquote,li,pre,section,article').forEach(el => {
      const t = (el.textContent || '').replace(/\s+\n/g, '\n').trim();
      el.replaceWith(doc.createTextNode(t ? t + '\n\n' : ''));
    });
    let out = (doc.body.textContent || '').replace(/\r/g, '');
    out = out.replace(/\u00A0/g, ' ').replace(/\n{3,}/g, '\n\n').trim() + '\n\n';
    return out;
  }

  // 3) Read each spine item in order, convert, and join
  const chunks = [];
  for (const id of spineIds) {
    const href = manifest[id];
    if (!href) continue;
    // Normalize path
    const path = baseDir + href;
    const entry = zip.file(path);
    if (!entry) continue;
    const xhtml = await entry.async('string');
    chunks.push(xhtmlToText(xhtml));
  }

  return chunks.join('');
}




    

    // Hook into your existing text pipeline
    async function openEpubAsPlainText(file) {
      const text = await extractEpubToPlainText(file);
      const filename = (file && file.name) ? file.name.replace(/\.epub$/i, '.txt') : 'book.txt';
      return window.reader.loadText(text, filename, { source: 'epub-extracted' });
    }

    // ✅ Export so outside code can call it
    window.openEpubAsPlainText = openEpubAsPlainText;

    // 1) On page load + #import: pull from localStorage
    if (location.hash === '#import') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) { const p = JSON.parse(raw); console.debug('[Reader] Import payload received', {name:p?.name, id:p?.id}); consumeImport(p); }
      } catch (e) { console.error('Import error:', e); }
    }

    // 2) Live handoff (if opened in another tab)
    try {
      const bc = new BroadcastChannel(channelName);
      bc.onmessage = (ev) => {
        if (ev?.data?.type === 'ping') { try { ev.target.postMessage({ type:'pong', from:'reader' }); } catch {} return; }
        if (ev?.data?.type === 'import' && ev.data.payload) consumeImport(ev.data.payload);
      };
    } catch { /* BroadcastChannel not supported—no problem */ }
  })();

  // ---------- Utils ----------
  const $ = (id) => document.getElementById(id);
  const bySel = (s, el=document) => el.querySelector(s);

  // === Novel-safe token helpers ===
  function getAllTokens() {
    const raw = (storyEl && (storyEl.innerText || storyEl.textContent || "")) || "";
    const flat = raw.replace(/\s+/g, " ").trim();
    return flat ? flat.split(" ") : [];
  }

  function tokenIndexFromScroll(total) {
    const doc = document.documentElement;
    const scrollTop = window.scrollY || doc.scrollTop || 0;
    const scrollHeight = doc.scrollHeight || (storyEl ? storyEl.scrollHeight : 1) || 1;
    const pct = Math.min(1, Math.max(0, scrollTop / Math.max(1, scrollHeight - window.innerHeight)));
    return Math.floor(pct * (total || 0));
  }

  // ---- Layout helpers ----
  function setControlsOffset() {
    const controls = document.getElementById('controls');
    const root = document.documentElement;
    const offset = document.body.classList.contains('reading') ? 0 : (controls ? controls.offsetHeight : 0);
    root.style.setProperty('--controls-offset', offset + 'px');
  }

  let _lastY = 0;
  function handleScrollAutohide() {
    const y = window.scrollY || 0;
    const goingDown = y > _lastY + 6;
    const goingUp   = y < _lastY - 6;
    if (goingDown) document.body.classList.add('hide-controls');
    else if (goingUp) document.body.classList.remove('hide-controls');
    _lastY = y;
  }


// ============================
// Red Letter MC — helpers & attribution
// ============================
const MC_CONFIG = {
  mainCharacter: "Holmes",
  aliases: [/Sherlock\s+Holmes/i, /\bHolmes\b/i, /\bMr\.?\s+Holmes\b/i],
  verbs: /(said|asked|cried|muttered|remarked|observed|replied|answered|shouted|exclaimed)/i,
  manualOverrides: {}
};

function extractQuotesFromParagraph(text) {
  const NORMAL = text.replace(/[“”]/g, '"');
  const quotes = [];
  let i = 0, start = -1;
  while (i < NORMAL.length) {
    if (NORMAL[i] === '"') {
      if (start === -1) start = i;
      else { quotes.push({ start, end: i }); start = -1; }
    }
    i++;
  }
  return quotes;
}

function isHolmesAttributionAround(text, spanStart, spanEnd) {
  const around = text.slice(Math.max(0, spanStart - 120), Math.min(text.length, spanEnd + 120));
  const saidAfter = new RegExp(`${MC_CONFIG.verbs.source}\\s+(?:${MC_CONFIG.aliases.map(r=>r.source).join('|')})`, 'i');
  const saidBefore = new RegExp(`(?:${MC_CONFIG.aliases.map(r=>r.source).join('|')})\\s+${MC_CONFIG.verbs.source}`, 'i');
  if (saidAfter.test(around) || saidBefore.test(around)) return true;
  const quoteText = text.slice(spanStart, spanEnd + 1);
  if (/^"\s*Holmes[,!]/i.test(quoteText)) return false;
  return null;
}

function lastExplicitNameBefore(text, index) {
  const before = text.slice(0, index);
  for (let i = MC_CONFIG.aliases.length - 1; i >= 0; i--) {
    const re = MC_CONFIG.aliases[i];
    const match = before.match(re);
    if (match) return "Holmes";
  }
  return null;
}

function isLikelyWatsonFirstPerson(quoteText) {
  return /^"\s*I(\b|['’])/i.test(quoteText);
}

function attributeQuotesInParagraph(text, turnCounterState) {
  const quotes = extractQuotesFromParagraph(text);
  return quotes.map((q) => {
    const quoteText = text.slice(q.start, q.end + 1);
    const direct = isHolmesAttributionAround(text, q.start, q.end);
    if (direct === true) return { ...q, speaker: "Holmes" };
    if (direct === false) return { ...q, speaker: "Other" };
    if (isLikelyWatsonFirstPerson(quoteText)) return { ...q, speaker: "Other" };
    const lastName = lastExplicitNameBefore(text, q.start);
    if (lastName === "Holmes") return { ...q, speaker: "Holmes" };
    const speaker = (turnCounterState.last === "Holmes") ? "Other" : "Holmes";
    turnCounterState.last = speaker;
    return { ...q, speaker };
  });
}

function applyRedLetterMC(rootEl, chapterId, enabled) {
  const paras = Array.from(rootEl.querySelectorAll('p, div, li'));
  const overrides = (MC_CONFIG.manualOverrides[chapterId] || []);
  paras.forEach((p, paraIndex) => {
    const text = p.textContent || "";
    if (!text || text.indexOf('"') === -1) return;
    const turnState = { last: "Other" };
    const attributions = attributeQuotesInParagraph(text, turnState);
    const byPara = overrides.filter(o => o.paraIndex === paraIndex).map(o => o.quoteIndex);
    attributions.forEach((attr, quoteIndex) => {
      if (byPara.includes(quoteIndex)) attr.speaker = "Holmes";
    });
    if (!enabled) return;
    let cursor = 0;
    const pieces = [];
    attributions.forEach((attr) => {
      pieces.push(escapeHtml(text.slice(cursor, attr.start)));
      const quoteRaw = text.slice(attr.start, attr.end + 1);
      if (attr.speaker === "Holmes") {
        pieces.push(`<span class="mc-red">${escapeHtml(quoteRaw)}</span>`);
      } else {
        pieces.push(escapeHtml(quoteRaw));
      }
      cursor = attr.end + 1;
    });
    pieces.push(escapeHtml(text.slice(cursor)));
    p.innerHTML = pieces.join('');
  });
}


// ============================
// Red Letter MC — metadata markers override
// Recognizes ### MCD START ... ### MCD END and wraps the content in .mc-red,
// removing the marker tokens from the DOM. This OVERRIDES heuristic logic when present.
// ============================
function hasMCDMarkers(rootEl) {
  if (!rootEl) return false;
  const txt = rootEl.textContent || "";
  return /###\s*MCD\s*START/i.test(txt) || /###\s*MCD\s*END/i.test(txt);
}

function applyRedLetterMC_Markers(rootEl) {
  if (!rootEl) return;

  // Idempotence: unwrap any previous .mc-red spans
  rootEl.querySelectorAll('span.mc-red').forEach(sp => sp.replaceWith(sp.textContent || ''));

  const START_RE = /###\s*MCD\s*START/gi;
  const END_RE   = /###\s*MCD\s*END/gi;

  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
  let mcdOn = false;

  function nextMatch(re, str, from) {
    re.lastIndex = from;
    const m = re.exec(str);
    return m ? { index: m.index, len: m[0].length } : null;
  }

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    if (!node || !node.nodeValue) continue;
    let text = node.nodeValue;
    let cursor = 0;
    let changed = false;

    while (cursor <= text.length) {
      if (!mcdOn) {
        const m = nextMatch(START_RE, text, cursor);
        if (!m) break;

        const before = text.slice(cursor, m.index);
        if (before) node.parentNode.insertBefore(document.createTextNode(before), node);
        cursor = m.index + m.len; // skip token
        mcdOn = true;
        changed = true;
        continue;
      } else {
        const m = nextMatch(END_RE, text, cursor);
        if (!m) {
          const content = text.slice(cursor);
          if (content) {
            const span = document.createElement('span');
            span.className = 'mc-red';
            span.textContent = content;
            node.parentNode.insertBefore(span, node);
          }
          cursor = text.length + 1;
          changed = true;
          break;
        } else {
          const content = text.slice(cursor, m.index);
          if (content) {
            const span = document.createElement('span');
            span.className = 'mc-red';
            span.textContent = content;
            node.parentNode.insertBefore(span, node);
          }
          cursor = m.index + m.len; // skip END
          mcdOn = false;
          changed = true;
          continue;
        }
      }
    }

    if (cursor < text.length) {
      const tail = text.slice(cursor);
      if (tail) node.parentNode.insertBefore(document.createTextNode(tail), node);
      changed = true;
    }

    if (changed && node.parentNode) {
      node.parentNode.removeChild(node);
    }
  }
}




// ============================
// Red Letter MC — toggle wiring + active indicator
// ============================
(function initRedLetterMC(){
  const btn = document.getElementById('toggle-mc');
  if (!btn) return;
  let enabled = false;

  function unwrapRed(){
    const root = document.getElementById('story');
    if (!root) return;
    root.querySelectorAll('span.mc-red').forEach(sp => sp.replaceWith(sp.textContent || ''));
  }

  function applyIfEnabled(){
    if (!enabled) return;
    const root = document.getElementById('story');
    if (!root) return;
    if (hasMCDMarkers(root)) {
      applyRedLetterMC_Markers(root);
    } else {
      const chapterId = root.getAttribute('data-chapter-id') || 'SINGLE_CHAPTER';
      applyRedLetterMC(root, chapterId, true);
    }
  }

  // Expose for loadText/file load hook
  window.__applyRedLetterMCIfEnabled = applyIfEnabled;

  function renderButton(){
    btn.setAttribute('aria-pressed', String(enabled));
    btn.classList.toggle('active', enabled);
    btn.textContent = enabled ? 'Red Letter MC (on)' : 'Red Letter MC (off)';
    btn.title = enabled ? 'Turn off Red Letter MC' : 'Turn on Red Letter MC';
  }
  renderButton();

  btn.addEventListener('click', () => {
    enabled = !enabled;
    if (!enabled) unwrapRed();
    else applyIfEnabled();
    renderButton();
  });
})();




  // ---------- Minimal additions (dictionary + bookmark) ----------
  function showDefinition(word){
    const pop = document.getElementById('definitionPopup');
    const closeBtn = document.getElementById('defClose');
    const dw = document.getElementById('defWord');
    const db = document.getElementById('defBody');
    if (!pop || !dw || !db) return;
    dw.textContent = word;
    db.textContent = 'Looking up…';
    pop.style.display = 'block';
    if (closeBtn) closeBtn.onclick = () => { pop.style.display = 'none'; };
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
    fetch(url).then(r => r.ok ? r.json() : Promise.reject()).then(arr => {
      try {
        const defs = [];
        (arr||[]).forEach(entry => (entry.meanings||[]).forEach(m => (m.definitions||[]).slice(0,2).forEach(d => defs.push(d.definition))));
        db.innerHTML = defs.length ? defs.map(d => `<div style="margin:.25rem 0">• ${escapeHtml(d)}</div>`).join('') : 'No definition found.';
      } catch { db.textContent = 'No definition found.'; }
    }).catch(()=>{ db.textContent = 'Could not fetch a definition.'; });
  }

  const BM_KEY = 'df_reader_bookmark';
  function getBookmark(){ try { return JSON.parse(localStorage.getItem(BM_KEY)||'null'); } catch { return null; } }
  function setBookmark(obj){ try { localStorage.setItem(BM_KEY, JSON.stringify(obj||{})); } catch {} }
  function wordIndexFromViewport(){
    if (!words || !words.length) return 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 800;
    let best = 0, bestDist = Infinity;
    for (let i=0;i<words.length;i++){
      const r = words[i].getBoundingClientRect();
      if (r.bottom < 0) continue;
      const dist = Math.abs(r.top - 0);
      if (dist < bestDist){ best = i; bestDist = dist; if (dist<2) break; }
    }
    return best;
  }

  const escapeHtml = (s) => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  // ---------- DOM ----------
  const storyEl = $('story');
  const fileInput = $('fileInput');
  const autoformatToggle = $('autoformatToggle');
  const clickReadToggle = $('clickReadToggle');
  const speedControl = $('speedControl');
  const voiceSelect = $('voiceSelect');
  const readAloudBtn = $('readAloudBtn');
  const stopReadAloudBtn = $('stopReadAloudBtn');
  const chapterSelect = $('chapterSelect');
  const bookmarkBtn = document.getElementById('bookmarkBtn');
  const gotoBookmarkBtn = document.getElementById('gotoBookmarkBtn');
  const toggleReadingBtn = document.getElementById('toggleReadingBtn');
  const quickControlsBtn = document.getElementById('quickControlsBtn');

  // === Reader import adapter ===
  window.reader = window.reader || {};

  window.reader.loadText = async function loadText(text, name, meta = {}) {
    if (!storyEl) return;

    const useAuto = (autoformatToggle && autoformatToggle.checked) !== false;
    storyEl.innerHTML = useAuto
      ? autoFormatText(text)
      : `<pre>${(text || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}</pre>`;

    applyPrefs();
    
    // Apply Red Letter MC (markers first) before word-wrapping
    if (typeof window.__applyRedLetterMCIfEnabled === 'function') {
      window.__applyRedLetterMCIfEnabled();
    }
wrapWords();
    promoteChapterHeadings();
    detectChapters();
    if (meta && meta.title) {
      try { document.title = `${meta.title} — Dyslexia-Friendly Reader`; } catch {}
    }
  };

  // ✅ EPUB-aware openFile (unchanged except for calling window.openEpubAsPlainText)
  window.reader.openFile = async function openFile(file, meta = {}) {
    const isEpub = /\.epub$/i.test(file.name || '') || file.type === 'application/epub+zip';
    if (isEpub) {
      return window.openEpubAsPlainText(file);
    }
    const text = await file.text();
    return window.reader.loadText(text, file.name || 'import.txt', meta);
  };

  function enterReadingMode() {
    document.body.classList.add('reading');
    if (quickControlsBtn) quickControlsBtn.hidden = false;
    setControlsOffset();
    setTimeout(() => window.scrollTo(0, 0), 0);
  }
  function exitReadingMode() {
    document.body.classList.remove('reading');
    if (quickControlsBtn) quickControlsBtn.hidden = true;
    setControlsOffset();
  }

  if (toggleReadingBtn) {
    toggleReadingBtn.addEventListener('click', () => {
      const on = !document.body.classList.contains('reading');
      toggleReadingBtn.setAttribute('aria-pressed', String(on));
      on ? enterReadingMode() : exitReadingMode();
    });
  }
  if (quickControlsBtn) {
    quickControlsBtn.addEventListener('click', () => { exitReadingMode(); });
  }

  setControlsOffset();
  window.addEventListener('resize', setControlsOffset);
  window.addEventListener('orientationchange', setControlsOffset);
  window.addEventListener('scroll', () => {
    if (!document.body.classList.contains('reading')) handleScrollAutohide();
  });

  if (bookmarkBtn) bookmarkBtn.addEventListener('click', () => {
    const tokens = getAllTokens();
    const tok = tokenIndexFromScroll(tokens.length);
    setBookmark({ tok, scroll: window.scrollY || 0 });
  });

  if (gotoBookmarkBtn) gotoBookmarkBtn.addEventListener('click', () => {
    const bm = getBookmark();
    if (bm && typeof bm.scroll === 'number') {
      window.scrollTo({ top: bm.scroll, behavior: 'smooth' });
    }
  });

  // ---------- Appearance Controls ----------
  const fontSelect = $('fontSelect');
  const fontSize = $('fontSize');
  const lineSpacing = $('lineSpacing');
  const textColor = $('textColor');
  const bgColor = $('bgColor');

  const PREFS_KEY = 'df_reader_prefs_v1';

  function promoteChapterHeadings(){
    if (!storyEl) return;
    const paras = Array.from(storyEl.querySelectorAll('p'));
    let n = 0;
    paras.forEach(p => {
      const t = (p.textContent || '').trim();
      if (/^(chapter|chap\.)\s+([ivxlcdm]+|\d+|[a-z-]+)\b/i.test(t)) {
        const h = document.createElement('h2');
        h.textContent = t;
        if (!h.id) h.id = `ch-${++n}`;
        p.replaceWith(h);
      }
    });
  }

  function detectChapters(){
    const chapterSelect = document.getElementById('chapterSelect');
    if (!storyEl || !chapterSelect) return;
    const hs = storyEl.querySelectorAll('h1,h2,h3');
    chapterSelect.innerHTML = '';
    if (!hs.length) {
      chapterSelect.innerHTML = '<option value="">(No chapters)</option>';
      return;
    }
    hs.forEach((h, i) => {
      if (!h.id) h.id = `ch-${i+1}`;
      const opt = document.createElement('option');
      opt.value = h.id;
      opt.textContent = h.textContent.trim() || `Chapter ${i+1}`;
      chapterSelect.appendChild(opt);
    });
  }

  function applyPrefs(p) {
    const prefs = p || loadPrefs();
    const target = storyEl || document.body;
    if (!prefs) return;
    if (prefs.fontFamily) target.style.fontFamily = prefs.fontFamily;
    if (prefs.fontSize) target.style.fontSize = prefs.fontSize + 'px';
    if (prefs.lineHeight) target.style.lineHeight = String(prefs.lineHeight);
    if (prefs.textColor) target.style.color = prefs.textColor;
    if (prefs.bgColor) document.body.style.backgroundColor = prefs.bgColor;
    if (fontSelect && prefs.fontFamily) fontSelect.value = prefs.fontFamily;
    if (fontSize && prefs.fontSize) fontSize.value = prefs.fontSize;
    if (lineSpacing && prefs.lineHeight) lineSpacing.value = prefs.lineHeight;
    if (textColor && prefs.textColor) textColor.value = prefs.textColor;
    if (bgColor && prefs.bgColor) bgColor.value = prefs.bgColor;
  }

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY)||'{}'); } catch { return {}; }
  }
  function savePrefs(next) {
    const cur = loadPrefs();
    const out = Object.assign({}, cur, next||{});
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(out)); } catch {}
    return out;
  }

  function bindAppearanceControls() {
    const target = storyEl || document.body;
    if (fontSelect) fontSelect.addEventListener('change', () => {
      const ff = fontSelect.value;
      target.style.fontFamily = ff || '';
      applyPrefs(savePrefs({fontFamily: ff}));
    });
    if (fontSize) fontSize.addEventListener('input', () => {
      const v = parseInt(fontSize.value||'18', 10);
      target.style.fontSize = v + 'px';
      applyPrefs(savePrefs({fontSize: v}));
    });
    if (lineSpacing) lineSpacing.addEventListener('input', () => {
      const v = parseFloat(lineSpacing.value||'1.6');
      target.style.lineHeight = String(v);
      applyPrefs(savePrefs({lineHeight: v}));
    });
    if (textColor) textColor.addEventListener('input', () => {
      const v = textColor.value || '#000000';
      target.style.color = v;
      applyPrefs(savePrefs({textColor: v}));
    });
    if (bgColor) bgColor.addEventListener('input', () => {
      const v = bgColor.value || '#f8f8f8';
      document.body.style.backgroundColor = v;
      applyPrefs(savePrefs({bgColor: v}));
    });
  }

  // ---------- State ----------
  let voices = [];
  let utter = null;
  let clickReadMode = false;
  let words = [];
  let chapters = [];
  let currentSpokenIndex = -1;

  // ---------- Voices ----------
  function loadVoices() {
    voices = (typeof speechSynthesis !== 'undefined') ? speechSynthesis.getVoices() || [] : [];
    voiceSelect.innerHTML = "";
    const def = document.createElement('option');
    def.value = "";
    def.textContent = voices.length ? "Default" : "No voices available";
    voiceSelect.appendChild(def);
    voices.forEach(v => {
      const o = document.createElement('option');
      o.value = v.name;
      o.textContent = `${v.name} — ${v.lang}${v.default ? " (default)" : ""}`;
      voiceSelect.appendChild(o);
    });
  }

  function getSelectedVoice() {
    const name = voiceSelect.value;
    if (!name) return null;
    return voices.find(v => v.name === name) || null;
  }

  // ---------- Formatting / Chapters ----------
  function autoFormatText(txt) {
    const paras = txt.split(/\r?\n\s*\r?\n/g).map(s => s.trim()).filter(Boolean);
    const html = paras.map(p => `<p>${escapeHtml(p)}</p>`).join("\n");
    return html || `<p>${escapeHtml(txt)}</p>`;
  }

  function wrapWords() {
    const walker = document.createTreeWalker(storyEl, NodeFilter.SHOW_TEXT, null);
    const toWrap = [];
    while (walker.nextNode()) {
      const t = walker.currentNode;
      if (!t.nodeValue.trim()) continue;
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
    words = Array.from(storyEl.querySelectorAll('span.word'));
  }


// --- replace current speakFrom() with this ---
function speakFrom(startIndex = 0) {
  if (!("speechSynthesis" in window)) return;
  if (!words.length) return;

  const CHUNK = 40;
  let pos = Math.max(0, Math.min(words.length - 1, startIndex || 0));
  const v = (typeof getSelectedVoice === "function") ? getSelectedVoice() : null;

  try { speechSynthesis.cancel(); } catch {}

  function next() {
    if (pos >= words.length) return;
    const end = Math.min(words.length, pos + CHUNK);
    const text = words.slice(pos, end).map(w => w.textContent).join(" ");
    const u = new SpeechSynthesisUtterance(text);
    if (v) u.voice = v;
    const rate = parseFloat((speedControl && speedControl.value) || "1");
    u.rate = (rate > 0 ? rate : 1);

    u.onend = () => {
      pos = end;
      try { setBookmark({ tok: pos, scroll: window.scrollY || 0 }); } catch {}
      setTimeout(next, 20);
    };

    try { speechSynthesis.speak(u); } catch {}
  }

  setTimeout(next, 50);
}


  function stopSpeaking() {
    try { speechSynthesis.cancel(); } catch {}
    utter = null;
    clearHighlight();
  }

  function highlightWord(i) {
    if (currentSpokenIndex >=0 && words[currentSpokenIndex]) {
      words[currentSpokenIndex].classList.remove('current');
    }
    currentSpokenIndex = i;
    if (words[i]) {
      words[i].classList.add('current');
      words[i].scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function clearHighlight() {
    if (currentSpokenIndex>=0 && words[currentSpokenIndex]) {
      words[currentSpokenIndex].classList.remove('current');
    }
    currentSpokenIndex = -1;
  }

  // ---------- Events ----------
  document.addEventListener('DOMContentLoaded', async () => {
    applyPrefs();

    // Voices
    loadVoices();
    if (typeof speechSynthesis !== 'undefined' && speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoices;
    }

    bindAppearanceControls();

    if (speedControl) speedControl.addEventListener('input', () => {
      if (utter) {
        try { speechSynthesis.cancel(); } catch {}
        speakFrom(currentSpokenIndex >=0 ? currentSpokenIndex : 0);
      }
    });

    if (readAloudBtn) readAloudBtn.addEventListener('click', () => {
      if (!words.length) wrapWords();
      speakFrom(0);
    });
    if (stopReadAloudBtn) stopReadAloudBtn.addEventListener('click', stopSpeaking);

    if (clickReadToggle) clickReadToggle.addEventListener('change', () => {
      clickReadMode = clickReadToggle.checked;
    });

    if (storyEl) storyEl.addEventListener('click', (e) => {
      if (!clickReadMode) return;
      const w = e.target && e.target.closest('.word');
      if (!w) return;
      if (!words.length) wrapWords();
      const idx = words.indexOf(w);
      if (idx>=0) {
        speakFrom(idx);
      }
    });

    // File input handler — now calls window.openEpubAsPlainText for EPUBs
    if (fileInput) fileInput.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;

      const isEpub = /\.epub$/i.test(f.name) || f.type === 'application/epub+zip';
      if (isEpub) {
        await window.openEpubAsPlainText(f);
        return;
      }

      const txt = await f.text();
      storyEl.innerHTML = autoformatToggle.checked ? autoFormatText(txt) : `<pre>${escapeHtml(txt)}</pre>`;
            // Apply Red Letter MC (markers first) before word-wrapping
      if (typeof window.__applyRedLetterMCIfEnabled === 'function') { window.__applyRedLetterMCIfEnabled(); }
applyPrefs();
      wrapWords();
      detectChapters();
      promoteChapterHeadings();
      detectChapters();
    });

    if (chapterSelect) chapterSelect.addEventListener('change', () => {
      const id = chapterSelect.value;
      if (!id) return;
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({behavior:'smooth', block:'start'});
    });

    // Service worker (guarded)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }
  });
})();
