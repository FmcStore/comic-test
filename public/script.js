/*
  FmcComic - PWA + Auth + Custom Proxy + Database Sync
*/

// MENGGUNAKAN PROXY BUATAN SENDIRI
const API_PROXY = "/api/proxy?url=";
const API_BASE = "https://www.sankavollerei.com/comic/komikcast";
const BACKEND_URL = window.location.origin;

const contentArea = document.getElementById('content-area');
const filterPanel = document.getElementById('filter-panel');
const mainNav = document.getElementById('main-nav');
const mobileNav = document.getElementById('mobile-nav');
const progressBar = document.getElementById('progress-bar');

let currentChapterList = [];
let currentComicContext = { slug: null, title: null, image: null };
let isNavigating = false;
let currentUser = null; 
let isSyncing = false;

// Register Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(() => console.log('SW Registered'))
    .catch(err => console.log('SW Fail:', err));
}

document.addEventListener('DOMContentLoaded', () => {
  checkLoginSession();
  loadGenres();
  handleInitialLoad();
});

/* ---------------- AUTH & SYNC SYSTEM ---------------- */

function toggleAuthModal() {
  document.getElementById('auth-modal').classList.toggle('hidden');
}

function checkLoginSession() {
  const savedUser = localStorage.getItem('fmc_user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    updateAuthUI(true);
    syncData(false);
  } else {
    updateAuthUI(false);
  }
}

function updateAuthUI(isLoggedIn) {
  const form = document.getElementById('auth-form-container');
  const info = document.getElementById('user-info-container');
  const dot = document.getElementById('login-status-dot');
  const emailDisplay = document.getElementById('user-email-display');

  if (isLoggedIn) {
    form.classList.add('hidden');
    info.classList.remove('hidden');
    dot.classList.remove('bg-red-500');
    dot.classList.add('bg-green-500', 'animate-pulse');
    emailDisplay.textContent = currentUser.email;
  } else {
    form.classList.remove('hidden');
    info.classList.add('hidden');
    dot.classList.remove('bg-green-500', 'animate-pulse');
    dot.classList.add('bg-red-500');
  }
}

async function handleLogin() {
  const email = document.getElementById('auth-email').value;
  const pass = document.getElementById('auth-pass').value;
  const btn = document.getElementById('btn-login-submit');

  if (!email || !pass) return alert("Isi semua data!");

  btn.innerHTML = `<i class="fa fa-spinner fa-spin"></i> Loading...`;
  
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass })
    });
    const data = await res.json();

    if (data.success) {
      currentUser = { email: data.user.email };
      
      // Update local storage dengan data dari server (Merge simple)
      if (data.user.history.length > 0) localStorage.setItem('fmc_history', JSON.stringify(data.user.history));
      if (data.user.bookmarks.length > 0) localStorage.setItem('fmc_bookmarks', JSON.stringify(data.user.bookmarks));
      
      localStorage.setItem('fmc_user', JSON.stringify(currentUser));
      updateAuthUI(true);
      await syncData(true); // Sync balik untuk memastikan
      
      alert("Login Berhasil!");
      toggleAuthModal();
    } else {
      alert(data.message || "Login gagal");
    }
  } catch (e) {
    alert("Error koneksi server");
  } finally {
    btn.innerHTML = `Masuk / Daftar`;
  }
}

function handleLogout() {
  localStorage.removeItem('fmc_user');
  currentUser = null;
  updateAuthUI(false);
  toggleAuthModal();
}

async function syncData(force = false) {
  if (!currentUser) return;
  if (isSyncing && !force) return;

  isSyncing = true;
  const history = JSON.parse(localStorage.getItem('fmc_history') || '[]');
  const bookmarks = JSON.parse(localStorage.getItem('fmc_bookmarks') || '[]');

  try {
    await fetch(`${BACKEND_URL}/api/user/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentUser.email, history, bookmarks })
    });
    console.log("✅ Data Synced");
  } catch (e) {
    console.error("Sync fail", e);
  } finally {
    isSyncing = false;
  }
}

/* ---------------- HELPERS ---------------- */

async function getUuidFromSlug(slug, type) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/get-id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, type })
    });
    const data = await res.json();
    return data.uuid;
  } catch (e) { return slug; }
}

async function getSlugFromUuid(uuid) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/get-slug/${uuid}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}

function updateURL(path) {
  if (window.location.pathname !== path) history.pushState(null, null, path);
}

function getTypeClass(type) {
  if (!type) return 'type-default';
  const t = String(type).toLowerCase();
  if (t.includes('manga')) return 'type-manga';
  if (t.includes('manhwa')) return 'type-manhwa';
  if (t.includes('manhua')) return 'type-manhua';
  return 'type-default';
}

function redirectTo404() {
  contentArea.innerHTML = `<div class="text-center py-40 text-red-500">Error 404: Halaman tidak ditemukan.</div>`;
}

async function fetchAPI(url) {
  try {
    const response = await fetch(API_PROXY + encodeURIComponent(url));
    const data = await response.json();
    if (data.success) return data.result?.content || data.result || data;
    return null;
  } catch (e) { return null; }
}

function toggleFilter() {
  filterPanel.classList.toggle('hidden');
  const genreSelect = document.getElementById('filter-genre');
  if (genreSelect && genreSelect.options.length <= 1) loadGenres();
}

function resetNavs() {
  mainNav.classList.remove('-translate-y-full');
  mobileNav.classList.remove('translate-y-full');
  filterPanel.classList.add('hidden');
}

function toggleFullScreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  else if (document.exitFullscreen) document.exitFullscreen();
}

function setLoading() {
  contentArea.innerHTML = `
    <div class="flex justify-center py-40">
      <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-amber-500"></div>
    </div>`;
}

function lockNav() { isNavigating = true; setProgress(0); }
function unlockNav() { isNavigating = false; }
function setProgress(percent) { if (progressBar) progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`; }

function bindReaderProgress() {
  const onScroll = () => {
    const doc = document.documentElement;
    const scrollTop = doc.scrollTop || document.body.scrollTop;
    const scrollHeight = doc.scrollHeight - doc.clientHeight;
    if (scrollHeight <= 0) return setProgress(0);
    setProgress((scrollTop / scrollHeight) * 100);
  };
  window.removeEventListener('scroll', onScroll);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ---------------- DATA FUNCTIONS ---------------- */

async function loadGenres() {
  const data = await fetchAPI(`${API_BASE}/genres`);
  if (data && data.data) {
    const select = document.getElementById('filter-genre');
    const sorted = data.data.sort((a, b) => a.title.localeCompare(b.title));
    select.innerHTML = '<option value="">Pilih Genre</option>';
    sorted.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.slug;
      opt.text = g.title;
      select.appendChild(opt);
    });
  }
}

async function showHome(push = true) {
  if (push) updateURL('/');
  resetNavs();
  setLoading();

  const data = await fetchAPI(`${API_BASE}/home`);
  if (!data || !data.data) { redirectTo404(); return; }

  contentArea.innerHTML = `
    <section class="mb-12">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-bold flex items-center gap-2">
          <i class="fa fa-fire text-amber-500"></i> Populer Hari Ini
        </h2>
      </div>
      <div class="flex overflow-x-auto gap-4 hide-scroll pb-4 -mx-4 px-4 md:mx-0 md:px-0">
        ${data.data.hotUpdates.map(item => `
          <div class="min-w-[150px] md:min-w-[200px] cursor-pointer card-hover relative rounded-2xl overflow-hidden group"
              onclick="showDetail('${item.slug}')">
            <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent z-10"></div>
            <span class="type-badge ${getTypeClass(item.type)}">${item.type || 'Hot'}</span>
            <img src="${API_PROXY + encodeURIComponent(item.image)}" loading="lazy" class="h-64 md:h-80 w-full object-cover transform group-hover:scale-110 transition duration-500">
            <div class="absolute bottom-0 left-0 p-3 z-20 w-full">
              <h3 class="text-sm font-bold truncate text-white drop-shadow-md">${item.title}</h3>
              <p class="text-amber-400 text-xs font-semibold mt-1">${item.chapter || item.latestChapter}</p>
            </div>
          </div>
        `).join('')}
      </div>
    </section>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-10">
      <div class="lg:col-span-2">
        <h2 class="text-xl font-bold mb-6 border-l-4 border-amber-500 pl-4">Rilis Terbaru</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-4">
          ${data.data.latestReleases.slice(0, 15).map(item => `
            <div class="bg-zinc-900/40 border border-white/5 rounded-xl overflow-hidden cursor-pointer hover:border-amber-500/50 transition group"
                onclick="showDetail('${item.slug}')">
              <div class="relative h-48 overflow-hidden">
                <span class="type-badge ${getTypeClass(item.type)} bottom-2 left-2 top-auto">${item.type || 'UP'}</span>
                <img src="${API_PROXY + encodeURIComponent(item.image)}" loading="lazy" class="w-full h-full object-cover group-hover:scale-110 transition duration-500">
              </div>
              <div class="p-3">
                <h3 class="text-xs font-bold line-clamp-2 h-8 leading-relaxed">${item.title}</h3>
                <div class="flex justify-between items-center mt-3">
                  <span class="text-[10px] bg-white/5 px-2 py-1 rounded text-gray-400">${item.chapters?.[0]?.title || 'Ch.?'}</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
  window.scrollTo(0, 0);
}

async function showOngoing(page = 1) {
  updateURL('/ongoing'); resetNavs(); setLoading();
  const data = await fetchAPI(`${API_BASE}/list?status=Ongoing&orderby=popular&page=${page}`);
  renderGrid(data, "Komik Ongoing Terpopuler", "showOngoing");
}

async function showCompleted(page = 1) {
  updateURL('/completed'); resetNavs(); setLoading();
  const data = await fetchAPI(`${API_BASE}/list?status=Completed&orderby=popular&page=${page}`);
  renderGrid(data, "Komik Tamat (Selesai)", "showCompleted");
}

async function showGenre(slug, page = 1) {
  resetNavs(); setLoading();
  const data = await fetchAPI(`${API_BASE}/genre/${slug}/${page}`);
  if (!data || !data.data || data.data.length === 0) { redirectTo404(); return; }
  renderGrid(data, `Genre: ${slug.toUpperCase()}`, "showGenre", slug);
}

async function applyAdvancedFilter() {
  const query = document.getElementById('search-input').value;
  const genre = document.getElementById('filter-genre').value;
  const type = document.getElementById('filter-type').value;
  
  filterPanel.classList.add('hidden');
  setLoading();

  if (query) {
    const data = await fetchAPI(`${API_BASE}/search/${encodeURIComponent(query)}/1`);
    renderGrid(data, `Hasil Pencarian: "${query}"`, null);
    return;
  }
  if (genre) { showGenre(genre, 1); return; }

  let url = `${API_BASE}/list?page=1`;
  if (type) url += `&type=${type}`;
  const data = await fetchAPI(url + `&orderby=popular`);
  renderGrid(data, "Hasil Filter", null);
}

function renderGrid(data, title, funcName, extraArg = null) {
  const list = data?.data || [];
  if (list.length === 0) {
    contentArea.innerHTML = `<div class="text-center py-40">Tidak ada komik ditemukan.</div>`;
    return;
  }

  let paginationHTML = '';
  if (data.pagination && funcName) {
    const current = data.pagination.currentPage;
    const argStr = extraArg ? `'${extraArg}', ` : '';
    paginationHTML = `
      <div class="mt-14 flex justify-center items-center gap-4">
        ${current > 1 ? `<button onclick="${funcName}(${argStr}${current - 1})" class="glass px-5 py-2 rounded-lg text-xs font-bold hover:bg-amber-500 hover:text-black">Prev</button>` : ''}
        <span class="bg-amber-500 text-black px-4 py-2 rounded-lg text-xs font-extrabold shadow-lg shadow-amber-500/20">${current}</span>
        ${data.pagination.hasNextPage ? `<button onclick="${funcName}(${argStr}${current + 1})" class="glass px-5 py-2 rounded-lg text-xs font-bold hover:bg-amber-500 hover:text-black">Next</button>` : ''}
      </div>
    `;
  }

  contentArea.innerHTML = `
    <h2 class="text-2xl font-bold mb-8 border-l-4 border-amber-500 pl-4">${title}</h2>
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
      ${list.map(item => `
        <div class="bg-zinc-900/40 rounded-xl overflow-hidden border border-white/5 card-hover cursor-pointer relative group"
            onclick="showDetail('${item.slug}')">
          <span class="type-badge ${getTypeClass(item.type)}">${item.type || 'Comic'}</span>
          <div class="relative overflow-hidden aspect-[3/4]">
            <img src="${API_PROXY + encodeURIComponent(item.image)}" loading="lazy" class="w-full h-full object-cover group-hover:scale-110 transition duration-500">
          </div>
          <div class="p-3 text-center">
            <h3 class="text-xs font-bold truncate group-hover:text-amber-500 transition">${item.title}</h3>
            <p class="text-[10px] text-amber-500 mt-1 font-medium">${item.latestChapter || item.chapter || 'Baca'}</p>
          </div>
        </div>
      `).join('')}
    </div>
    ${paginationHTML}
  `;
  window.scrollTo(0, 0);
}

/* ---------------- DETAIL PAGE ---------------- */

async function showDetail(idOrSlug, push = true) {
  let slug = idOrSlug;
  setLoading();

  if (idOrSlug.length === 36) {
    const mapping = await getSlugFromUuid(idOrSlug);
    if (mapping) slug = mapping.slug;
  }

  if (push) {
    const uuid = await getUuidFromSlug(slug, 'series');
    updateURL(`/series/${uuid}`);
  }

  resetNavs();
  const data = await fetchAPI(`${API_BASE}/detail/${slug}`);
  if (!data || !data.data) { redirectTo404(); return; }

  const res = data.data;
  currentChapterList = res.chapters || [];
  currentComicContext = { slug, title: res.title, image: res.image };

  const history = JSON.parse(localStorage.getItem('fmc_history') || '[]');
  const savedItem = history.find(h => h.slug === slug);
  const lastCh = savedItem ? savedItem.lastChapterSlug : null;
  const firstCh = res.chapters?.length > 0 ? res.chapters[res.chapters.length - 1].slug : null;

  const startBtnText = lastCh ? "Lanjut Baca" : "Mulai Baca";
  const startBtnAction = lastCh
    ? `readChapter('${lastCh}', '${slug}')`
    : (firstCh ? `readChapter('${firstCh}', '${slug}')` : "alert('Chapter belum tersedia')");

  contentArea.innerHTML = `
    <div class="fixed top-0 left-0 w-full h-[60vh] -z-10 pointer-events-none overflow-hidden">
      <img src="${API_PROXY + encodeURIComponent(res.image)}" class="w-full h-full object-cover blur-2xl opacity-20 backdrop-banner animate-pulse-slow">
      <div class="absolute inset-0 bg-gradient-to-b from-[#0b0b0f]/40 via-[#0b0b0f]/80 to-[#0b0b0f]"></div>
    </div>

    <div class="relative z-10 flex flex-col md:flex-row gap-8 lg:gap-12 mt-4 animate-fade-in">
      <div class="md:w-[280px] flex-shrink-0 mx-auto md:mx-0 w-full max-w-[280px]">
        <div class="relative group">
          <span class="type-badge ${getTypeClass(res.type)} scale-110 top-4 left-4 shadow-lg">${res.type || 'Comic'}</span>
          <img src="${API_PROXY + encodeURIComponent(res.image)}" class="w-full rounded-2xl shadow-2xl border border-white/10">
        </div>

        <div class="flex flex-col gap-3 mt-6">
          <button onclick="${startBtnAction}" class="amber-gradient w-full py-3.5 rounded-xl font-bold text-black flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition shadow-lg shadow-amber-500/20">
            <i class="fa fa-book-open"></i> ${startBtnText}
          </button>
          <button onclick="toggleBookmark('${slug}', '${String(res.title).replace(/'/g, "")}', '${res.image}')" id="btn-bookmark"
            class="w-full py-3.5 rounded-xl glass font-semibold border-white/10 hover:bg-white/10 transition flex items-center justify-center gap-2">
            <i class="fa fa-bookmark"></i> Simpan
          </button>
        </div>
      </div>

      <div class="flex-1 min-w-0">
        <h1 class="text-3xl md:text-5xl font-extrabold mb-4 leading-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">${res.title}</h1>

        <div class="bg-white/5 rounded-2xl p-5 md:p-6 mb-8 border border-white/5 backdrop-blur-sm">
          <h3 class="font-bold text-sm mb-2 text-amber-500 uppercase tracking-wide">Sinopsis</h3>
          <p class="text-gray-300 text-sm leading-relaxed text-justify line-clamp-4">${res.synopsis}</p>
        </div>

        <div class="glass rounded-2xl border border-white/10 overflow-hidden">
          <div class="p-4 border-b border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white/5">
            <h3 class="font-bold text-lg flex items-center gap-2">
              <i class="fa fa-list-ul text-amber-500"></i> Daftar Chapter
            </h3>
            <input type="text" id="chapter-search" onkeyup="filterChapters()" placeholder="Cari Chapter..."
              class="w-full sm:w-64 bg-black/30 border border-white/10 rounded-lg py-2 pl-9 pr-4 text-xs focus:outline-none focus:border-amber-500 transition text-white">
          </div>
          <div id="chapter-list-container" class="max-h-[500px] overflow-y-auto p-2 bg-black/20"></div>
        </div>
      </div>
    </div>
  `;

  renderChapterList(res.chapters || [], slug);
  checkBookmarkStatus(slug);
  saveHistory(slug, res.title, res.image);
  window.scrollTo(0, 0);
}

function renderChapterList(chapters, comicSlug) {
  const container = document.getElementById('chapter-list-container');
  const history = JSON.parse(localStorage.getItem('fmc_history') || '[]');
  const comicHistory = history.find(h => h.slug === comicSlug);
  const lastReadSlug = comicHistory ? comicHistory.lastChapterSlug : '';

  container.innerHTML = chapters.map(ch => `
    <div onclick="safeReadChapter('${ch.slug}', '${comicSlug}')"
      class="chapter-item group flex items-center justify-between p-3 mb-1 rounded-xl cursor-pointer border border-transparent transition-all duration-200
      ${ch.slug === lastReadSlug ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/5 hover:bg-white/10'}">
      <span class="text-sm font-medium ${ch.slug === lastReadSlug ? 'text-amber-500' : 'text-gray-300'}">${ch.title}</span>
    </div>
  `).join('');
}

function safeReadChapter(chSlug, comicSlug) {
  if (isNavigating) return;
  readChapter(chSlug, comicSlug, true);
}

function filterChapters() {
  const input = document.getElementById('chapter-search');
  const filter = input.value.toLowerCase();
  const items = document.getElementsByClassName('chapter-item');
  for (let i = 0; i < items.length; i++) {
    items[i].style.display = items[i].innerText.toLowerCase().includes(filter) ? "" : "none";
  }
}

/* ---------------- READER LOGIC ---------------- */

async function readChapter(chIdOrSlug, comicSlug = null, push = true) {
  if (isNavigating) return;
  lockNav();
  setLoading();

  try {
    let chSlug = chIdOrSlug;
    if (chIdOrSlug.length === 36) {
      const mapping = await getSlugFromUuid(chIdOrSlug);
      if (mapping) chSlug = mapping.slug;
    }

    if (push) {
      const uuid = await getUuidFromSlug(chSlug, 'chapter');
      updateURL(`/chapter/${uuid}`);
    }

    mainNav.classList.add('-translate-y-full');
    mobileNav.classList.add('translate-y-full');

    const data = await fetchAPI(`${API_BASE}/chapter/${chSlug}`);
    if (!data || !data.data) { redirectTo404(); return; }

    const res = data.data;
    let finalComicSlug = comicSlug || res.parent_slug || res.comic_slug;
    
    // Header UI
    contentArea.innerHTML = `
      <div class="relative min-h-screen bg-[#0b0b0f] -mx-4 -mt-24">
        <div id="reader-top" class="reader-ui fixed top-0 w-full bg-gradient-to-b from-black/90 to-transparent z-[60] p-4 flex justify-between items-center transition-all duration-300">
          <div class="flex items-center gap-3">
            <button onclick="showDetail('${finalComicSlug}')" class="w-10 h-10 flex items-center justify-center bg-black/40 backdrop-blur-md border border-white/10 rounded-full hover:bg-amber-500 hover:text-black transition">
              <i class="fa fa-arrow-left"></i>
            </button>
            <h2 class="text-xs font-bold text-white max-w-[280px] truncate">${res.title}</h2>
          </div>
          <button onclick="toggleFullScreen()" class="w-10 h-10 flex items-center justify-center bg-black/40 backdrop-blur-md border border-white/10 rounded-full hover:bg-white/20"><i class="fa fa-expand text-xs"></i></button>
        </div>

        <div id="reader-images" class="flex flex-col items-center pt-0 pb-0 min-h-screen w-full max-w-3xl mx-auto bg-[#111]" onclick="toggleReaderUI()"></div>

        <div id="reader-bottom" class="reader-ui fixed bottom-6 left-0 w-full z-[60] px-4 flex justify-center transition-all duration-300">
          <div class="glass p-2 rounded-2xl flex gap-1 items-center shadow-2xl border border-white/10 bg-black/80 backdrop-blur-xl">
            <button onclick="${res.navigation?.prev ? `readChapter('${res.navigation.prev}', '${finalComicSlug}')` : ''}"
              class="w-10 h-10 flex items-center justify-center rounded-xl ${!res.navigation?.prev ? 'opacity-30 cursor-not-allowed' : 'hover:bg-amber-500 hover:text-black'}">
              <i class="fa fa-chevron-left"></i>
            </button>
             <button onclick="${res.navigation?.next ? `readChapter('${res.navigation.next}', '${finalComicSlug}')` : ''}"
              class="w-10 h-10 flex items-center justify-center rounded-xl ${!res.navigation?.next ? 'opacity-30 cursor-not-allowed' : 'amber-gradient text-black hover:scale-105 shadow-lg'}">
              <i class="fa fa-chevron-right"></i>
            </button>
          </div>
        </div>
      </div>
    `;

    const imageContainer = document.getElementById('reader-images');
    let loadedCount = 0;
    const total = res.images.length;

    // Image Rendering dengan Proxy
    res.images.forEach((imgUrl) => {
      const wrapper = document.createElement('div');
      wrapper.className = "w-full relative min-h-[400px] bg-[#1a1a1a]";
      
      const skeleton = document.createElement('div');
      skeleton.className = "skeleton absolute inset-0 w-full h-full z-10";
      
      const img = new Image();
      // Gunakan Proxy untuk gambar
      img.src = API_PROXY + encodeURIComponent(imgUrl);
      img.className = "comic-page opacity-0 transition-opacity duration-500 relative z-20";
      img.loading = "lazy";

      img.onload = () => {
        loadedCount++;
        skeleton.remove();
        img.classList.remove('opacity-0');
        wrapper.style.minHeight = "auto";
        wrapper.style.backgroundColor = "transparent";
        setProgress(10 + (loadedCount / total) * 90);
      };

      img.onerror = () => {
        skeleton.remove();
        wrapper.innerHTML = `<div class="py-12 text-center text-gray-500 text-xs">Gagal memuat gambar <br> <button onclick="this.parentElement.parentElement.querySelector('img').src='${img.src}'" class="mt-2 bg-white/10 px-3 py-1 rounded">Coba Lagi</button></div>`;
      };

      wrapper.appendChild(skeleton);
      wrapper.appendChild(img);
      imageContainer.appendChild(wrapper);
    });

    if (finalComicSlug) {
      saveHistory(finalComicSlug, currentComicContext?.title, currentComicContext?.image, chSlug, res.title);
    }

    window.scrollTo(0, 0);
    bindReaderProgress();

  } finally {
    unlockNav();
  }
}

function toggleReaderUI() {
  document.getElementById('reader-top').classList.toggle('ui-hidden-top');
  document.getElementById('reader-bottom').classList.toggle('ui-hidden-bottom');
}

/* ---------------- HISTORY & BOOKMARKS WITH AUTO SYNC ---------------- */

function handleSearch(e) { if (e.key === 'Enter') applyAdvancedFilter(); }

function saveHistory(slug, title, image, chSlug, chTitle) {
  let history = JSON.parse(localStorage.getItem('fmc_history') || '[]');
  history = history.filter(h => h.slug !== slug);
  
  history.unshift({
    slug,
    title: title || 'Unknown',
    image: image || 'assets/icon.png',
    lastChapterSlug: chSlug,
    lastChapterTitle: chTitle || 'Chapter ?',
    timestamp: new Date().getTime()
  });

  if (history.length > 50) history.pop();
  localStorage.setItem('fmc_history', JSON.stringify(history));

  // Trigger Sync ke Cloud jika user login
  if (currentUser) {
    if (window.syncTimeout) clearTimeout(window.syncTimeout);
    window.syncTimeout = setTimeout(() => syncData(), 2000);
  }
}

function toggleBookmark(slug, title, image) {
  let bookmarks = JSON.parse(localStorage.getItem('fmc_bookmarks') || '[]');
  const idx = bookmarks.findIndex(b => b.slug === slug);
  if (idx > -1) bookmarks.splice(idx, 1);
  else bookmarks.push({ slug, title, image });
  
  localStorage.setItem('fmc_bookmarks', JSON.stringify(bookmarks));
  checkBookmarkStatus(slug);
  
  if (currentUser) syncData(); 
}

function checkBookmarkStatus(slug) {
  let bookmarks = JSON.parse(localStorage.getItem('fmc_bookmarks') || '[]');
  const btn = document.getElementById('btn-bookmark');
  if (!btn) return;

  if (bookmarks.some(b => b.slug === slug)) {
    btn.innerHTML = `<i class="fa fa-check text-amber-500"></i> Tersimpan`;
    btn.classList.add('border-amber-500/50', 'bg-amber-500/10');
  } else {
    btn.innerHTML = `<i class="fa fa-bookmark"></i> Simpan`;
    btn.classList.remove('border-amber-500/50', 'bg-amber-500/10');
  }
}

function showHistory() {
  updateURL('/history'); resetNavs();
  let history = JSON.parse(localStorage.getItem('fmc_history') || '[]');
  renderGrid({ data: history }, "Riwayat Baca", null);
}

function showBookmarks() {
  updateURL('/bookmarks'); resetNavs();
  let bookmarks = JSON.parse(localStorage.getItem('fmc_bookmarks') || '[]');
  renderGrid({ data: bookmarks }, "Koleksi Favorit", null);
}

/* ---------------- INIT ---------------- */

async function handleInitialLoad() {
  const path = window.location.pathname;
  resetNavs();

  if (path === '/404.html') return;
  if (path.startsWith('/series/')) {
    const uuid = path.split('/')[2];
    if (uuid) showDetail(uuid, false); else showHome(false);
  }
  else if (path.startsWith('/chapter/')) {
    const uuid = path.split('/')[2];
    if (uuid) readChapter(uuid, null, false); else showHome(false);
  }
  else if (path === '/ongoing') showOngoing(1);
  else if (path === '/completed') showCompleted(1);
  else if (path === '/history') showHistory();
  else if (path === '/bookmarks') showBookmarks();
  else showHome(false);
}

window.addEventListener('popstate', () => handleInitialLoad());
