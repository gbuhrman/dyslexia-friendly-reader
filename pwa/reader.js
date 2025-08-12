
(() => {
  'use strict';

  // ---------- Read Aloud Functionality ----------
  const $ = (id) => document.getElementById(id);

  // Function to wrap the text into tokens
  function getAllTokens() {
    const raw = (storyEl && (storyEl.innerText || storyEl.textContent || "")) || "";
    const flat = raw.replace(/\s+/g, " ").trim();
    return flat ? flat.split(" ") : [];
  }

  function speakFrom(startIndex = 0) {
    if (!("speechSynthesis" in window)) return;
    const tokens = getAllTokens();
    if (!tokens.length) return;

    const CHUNK = 40; // try 40; drop to 30 if a novel still stalls
    let pos = Math.max(0, Math.min(tokens.length - 1, startIndex || 0));
    const u = new SpeechSynthesisUtterance(tokens.slice(pos, pos + CHUNK).join(" "));

    try { speechSynthesis.speak(u); } catch {}

    u.onend = () => {
      pos += CHUNK;
      if (pos < tokens.length) {
        speakFrom(pos);
      }
    };
  }

  // ---------- Bookmark Handling ----------
  const BM_KEY = 'df_reader_bookmark';
  function getBookmark() {
    try {
      return JSON.parse(localStorage.getItem(BM_KEY) || 'null');
    } catch {
      return null;
    }
  }
  function setBookmark(obj) {
    try {
      localStorage.setItem(BM_KEY, JSON.stringify(obj || {}));
    } catch {}
  }

  // ---------- Event Listeners ----------
  const readAloudBtn = $('readAloudBtn');
  const stopReadAloudBtn = $('stopReadAloudBtn');

  // Start reading aloud from bookmark or the start
  readAloudBtn.addEventListener('click', () => {
    const bm = getBookmark();
    speakFrom(bm ? bm.tok : 0);
  });

  // Stop the read-aloud functionality
  stopReadAloudBtn.addEventListener('click', () => {
    try { speechSynthesis.cancel(); } catch {}
  });
})();
