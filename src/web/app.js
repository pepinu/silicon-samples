// Silicon Samples SPA

// Static mode detection: if /data/experiments.json exists, we're running as a static site
let staticMode = false;
const staticModeCheck = fetch('/data/experiments.json', { method: 'HEAD' })
  .then(r => { staticMode = r.ok; })
  .catch(() => { staticMode = false; });

function staticUrl(url) {
  let path = url.replace(/\?.*$/, '');
  path = path.replace(/^\/api\//, '/data/');
  return path + '.json';
}

const api = {
  async get(url) {
    await staticModeCheck;
    const fetchUrl = staticMode ? staticUrl(url) : url;
    const r = await fetch(fetchUrl);
    return r.json();
  },
};

// ---- Navigation ----
const pages = ['home', 'methodology', 'results', 'experiment', 'library'];
let currentPage = 'home';

document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.page));
});

function navigateTo(page) {
  currentPage = page;
  pages.forEach(p => {
    document.getElementById(`page-${p}`)?.classList.toggle('hidden', p !== page);
  });
  document.querySelectorAll('nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });

  if (page === 'home') loadHome();
  if (page === 'methodology') loadMethodology();
  if (page === 'results') loadResults();
  if (page === 'library') loadLibrary();
}

// ---- Helpers ----
function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ---- Init ----
loadHome();
