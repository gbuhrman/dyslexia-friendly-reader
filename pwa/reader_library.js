
(() => {
  'use strict';

  const libStatus = document.getElementById('libStatus');
  const libList = document.getElementById('libList');

  // Load catalog.json from GitHub Pages
async function loadCatalogJSON(url = "./catalog.json") {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to fetch ${url}`);
    const data = await res.json();
    console.log('Catalog loaded successfully:', data);  // Log loaded catalog data for inspection
    return data;
  } catch (e) {
    console.error('Error loading catalog:', e);
    libStatus.textContent = "(catalog.json not found anywhere)";
  }
}
  
 

  // Render the library based on catalog data
  function renderLibrary(books) {
    libList.innerHTML = "";  // Clear existing content
    if (!Array.isArray(books) || books.length === 0) {
      libStatus.textContent = "No books found.";
      return;
    }

    libStatus.textContent = `Showing ${books.length} book(s).`;

    books.forEach(book => {
      const li = document.createElement('li');
      li.classList.add('library-card');
      li.innerHTML = `
        <h3>${book.title}</h3>
        <p><strong>Author:</strong> ${book.author}</p>
        <p><strong>Genres:</strong> ${book.genres.join(", ")}</p>
        <button class="open-text" data-url="${book.download}">Open</button>
      `;
      libList.appendChild(li);
    });
  }

  // Fetch and display library on page load
  document.addEventListener('DOMContentLoaded', async () => {
    const catalogData = await loadCatalogJSON();
    if (catalogData && catalogData.books) {
      renderLibrary(catalogData.books);
    }
  });

  // Filtering and sorting functions
  function filterAndSortBooks(books) {
    const term = (libSearch.value || "").toLowerCase();
    const genre = libGenre.value || "";
    const sort = libSort.value || "title";
    let out = books.filter(b => {
      const t = (b.title || "").toLowerCase();
      const a = (b.author || "").toLowerCase();
      const g = (Array.isArray(b.genres) ? b.genres.join(" ").toLowerCase() : "");
      const okTerm = !term || t.includes(term) || a.includes(term);
      const okGenre = !genre || g.includes(genre.toLowerCase());
      return okTerm && okGenre;
    });
    out.sort((x, y) => {
      const ax = (x[sort] || "") + "";
      const ay = (y[sort] || "") + "";
      return ax.localeCompare(ay, undefined, { numeric: true, sensitivity: 'base' });
    });
    return out;
  }

})();
