/* ============================================================================
   ADMIN_SETUP — READ THIS FIRST (Luffy, plain language)

   1) YOUR SECRET ADMIN URL
      This admin panel does NOT live at /admin/ (too easy to guess).
      It lives at:  /securesex/
      To make it truly yours, rename this folder to any secret word you like,
      for example:  /manage-blue-mango-42/
      Then redeploy (push to GitHub → Vercel). Keep the new URL to yourself.
      If you rename the folder, also update ADMIN_PATH below and the
      Disallow line in robots.txt.

   2) YOUR PASSWORD — there is NO default password, and none is written here.
      The FIRST time you open the admin page, it asks you to CREATE your own
      username + password. It is hashed with SHA-256 and stored only in your
      browser (localStorage). Nobody can read it from the site files.

   3) HOW PUBLISHING WORKS (static site — the admin cannot write to the server)
      Edit here → Export (download JSON + covers) → copy files into
      data/novels/ and img/covers/ on your local copy → push to GitHub →
      Vercel redeploys automatically. The guide inside the panel explains it.

   4) SECURITY NOTE — shown in the panel too:
      For maximum security, use the admin panel on your LOCAL copy
      (localhost), not the live https URL.
   ============================================================================ */
const ADMIN_PATH = 'securesex'; // <-- change if you rename this folder

/* ---------------- utils ---------------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add('hidden'), 2600);
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const pwHash = (user, pass) => sha256('ast-novels-admin::' + user + '::' + pass);

function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9\u0600-\u06FF\s-]/g, '')
    .replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    || ('novel-' + Date.now().toString(36));
}

function download(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function dataURLtoBlob(dataURL) {
  const [head, data] = dataURL.split(',');
  const mime = head.match(/:(.*?);/)[1];
  const bin = atob(data);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function extractDriveId(input) {
  if (!input) return '';
  const s = String(input).trim();
  let m = s.match(/[-\w]{25,}/);
  // prefer the /d/<id>/ pattern from share links
  const dm = s.match(/\/d\/([-\w]{10,})/);
  if (dm) return dm[1];
  if (/^[-\w]{10,}$/.test(s)) return s;
  return m ? m[0] : s;
}

/* ---------------- auth ---------------- */
const LS_AUTH = 'ast_admin_auth';
const getAuth = () => { try { return JSON.parse(localStorage.getItem(LS_AUTH)); } catch { return null; } };

function showScreen(which) {
  $('setup-screen').classList.toggle('hidden', which !== 'setup');
  $('login-screen').classList.toggle('hidden', which !== 'login');
  $('admin-app').classList.toggle('hidden', which !== 'app');
}

async function initAuth() {
  if (!getAuth()) { showScreen('setup'); wireSetup(); return; }
  showScreen('login'); wireLogin();
}

function wireSetup() {
  $('setup-btn').onclick = async () => {
    const u = $('setup-user').value.trim();
    const p1 = $('setup-pass').value, p2 = $('setup-pass2').value;
    if (!u || !p1) return toast('Please enter a username and password.');
    if (p1 !== p2) return toast('Passwords do not match.');
    if (p1.length < 6) return toast('Password must be at least 6 characters.');
    const hash = await pwHash(u, p1);
    localStorage.setItem(LS_AUTH, JSON.stringify({ user: u, hash, created: Date.now() }));
    toast('Admin access created. Please log in.');
    showScreen('login'); wireLogin();
  };
}

function wireLogin() {
  const go = async () => {
    const u = $('login-user').value.trim();
    const p = $('login-pass').value;
    const auth = getAuth();
    const hash = await pwHash(u, p);
    if (auth && u === auth.user && hash === auth.hash) {
      sessionStorage.setItem('ast_admin_session', '1');
      enterApp();
    } else {
      $('login-error').classList.remove('hidden');
    }
  };
  $('login-btn').onclick = go;
  $('login-pass').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

/* ---------------- store ---------------- */
const LS_NOVELS = 'ast_admin_novels';   // staged edits, keyed by slug
const LS_TRASH = 'ast_admin_trash';     // soft-deleted novels
let BASE = [];        // from data/novels/index.json
let baseNovels = {};  // slug -> full novel JSON (fetched lazily)
let staged = {};      // slug -> novel (overrides)
let trash = {};       // slug -> novel

function loadLocal() {
  try { staged = JSON.parse(localStorage.getItem(LS_NOVELS) || '{}'); } catch { staged = {}; }
  try { trash = JSON.parse(localStorage.getItem(LS_TRASH) || '{}'); } catch { trash = {}; }
}
function persistLocal() {
  localStorage.setItem(LS_NOVELS, JSON.stringify(staged));
  localStorage.setItem(LS_TRASH, JSON.stringify(trash));
}

async function loadBase() {
  try {
    const r = await fetch('../data/novels/index.json');
    BASE = await r.json();
  } catch { BASE = []; }
}

async function getNovel(slug) {
  if (staged[slug]) return staged[slug];
  if (trash[slug]) return trash[slug];
  if (!baseNovels[slug]) {
    const r = await fetch(`../data/novels/${slug}.json`);
    baseNovels[slug] = await r.json();
  }
  return baseNovels[slug];
}

/** All novels visible in admin (base + staged), excluding trash. */
function allNovels() {
  const map = {};
  for (const e of BASE) map[e.slug] = { ...e, _base: true };
  for (const [slug, n] of Object.entries(staged)) {
    map[slug] = { ...indexEntryOf(n), _base: !!map[slug], _staged: true };
  }
  return Object.values(map).filter(n => !trash[n.slug]);
}

function indexEntryOf(n) {
  const wc = (n.chapters || []).reduce((a, c) => a + String(c.text || '').split(/\s+/).filter(Boolean).length, 0);
  return {
    slug: n.slug, title: n.title, title_en: n.title_en, author: n.author,
    author_en: n.author_en, language: n.language, genre: n.genre,
    description: n.description, cover: n.cover, featured: !!n.featured,
    sample: !!n.sample, status: n.status || 'published',
    chapterCount: (n.chapters || []).length, wordCount: wc,
  };
}

/** Novels as the PUBLIC site sees them (published only, staged overrides applied). */
function publicNovels() {
  return allNovels().filter(n => (n.status || 'published') === 'published');
}

function getViews(slug) {
  return parseInt(localStorage.getItem('ast_views_' + slug) || '0', 10) || 0;
}

/* ---------------- part 2: navigation, dashboard, novel list ---------------- */
let editingSlug = null;
let editorChapters = [];
let editorCoverDataURL = null;
let editorCoverName = null;

function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  $('view-' + name).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'dashboard') renderDashboard();
  if (name === 'novels') renderNovelList();
  if (name === 'trash') renderTrash();
  if (name === 'guide') $('guide-path').textContent = '/' + ADMIN_PATH + '/';
}

function enterApp() {
  showScreen('app');
  loadLocal();
  loadBase().then(() => { switchView('dashboard'); });
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.onclick = () => {
      if (b.dataset.view === 'editor' && b.id === 'nav-add') openEditor(null);
      else switchView(b.dataset.view);
    };
  });
  $('add-novel-btn').onclick = () => openEditor(null);
  $('logout-btn').onclick = () => { sessionStorage.removeItem('ast_admin_session'); location.reload(); };
  $('export-all-btn').onclick = exportAll;
  wireEditor();
  wireSettings();
}

function renderDashboard() {
  const novels = allNovels();
  const pub = novels.filter(n => (n.status || 'published') === 'published');
  const drafts = novels.filter(n => n.status === 'draft');
  const chapters = novels.reduce((a, n) => a + (n.chapterCount || 0), 0);
  const words = novels.reduce((a, n) => a + (n.wordCount || 0), 0);
  const views = novels.reduce((a, n) => a + getViews(n.slug), 0);
  const trashCount = Object.keys(trash).length;
  const tb = $('trash-badge');
  tb.textContent = trashCount;
  tb.classList.toggle('hidden', !trashCount);

  $('stats-grid').innerHTML = [
    ['📚', novels.length, 'Total novels'],
    ['✅', pub.length, 'Published'],
    ['📝', drafts.length, 'Drafts'],
    ['📄', chapters, 'Chapters'],
    ['🔤', words.toLocaleString(), 'Words'],
    ['👁️', views.toLocaleString(), 'Total views'],
  ].map(([i, n, l]) => `<div class="stat"><div class="num">${n}</div><div class="lbl">${i} ${l}</div></div>`).join('');

  const top = [...novels].sort((a, b) => getViews(b.slug) - getViews(a.slug)).slice(0, 5);
  $('top-viewed').innerHTML = top.length
    ? '<table class="novel-table"><tbody>' + top.map(n =>
        `<tr><td>${esc(n.title)}</td><td>${getViews(n.slug).toLocaleString()} views</td>
         <td><span class="badge ${n.status === 'draft' ? 'draft' : 'pub'}">${n.status || 'published'}</span></td></tr>`).join('') + '</tbody></table>'
    : '<p class="hint">No views recorded yet.</p>';

  $('recent-list').innerHTML = novels.slice(0, 5).map(n =>
    `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><strong>${esc(n.title)}</strong>
     <span class="hint">— ${esc(n.author || '')} · ${n.chapterCount || 0} chapters</span></div>`).join('')
    || '<p class="hint">No novels yet.</p>';
}

function statusBadge(n) {
  const s = n.status || 'published';
  return `<span class="badge ${s === 'draft' ? 'draft' : 'pub'}">${s}</span>${n._staged ? ' <span class="badge">edited</span>' : ''}`;
}

function renderNovelList() {
  const q = ($('novel-search').value || '').toLowerCase();
  const lang = $('filter-lang').value;
  const status = $('filter-status').value;
  const rows = allNovels().filter(n => {
    if (q && !(n.title + ' ' + (n.title_en || '') + ' ' + n.author).toLowerCase().includes(q)) return false;
    if (lang && n.language !== lang) return false;
    if (status && (n.status || 'published') !== status) return false;
    return true;
  });
  $('novel-rows').innerHTML = rows.map(n => `<tr>
    <td>${n.cover ? `<img class="thumb" src="${n.cover.startsWith('data:') ? n.cover : '../' + n.cover}" alt="">` : ''}</td>
    <td><strong>${esc(n.title)}</strong>${n.title_en ? `<br><span class="hint">${esc(n.title_en)}</span>` : ''}</td>
    <td>${esc(n.author || '')}</td>
    <td>${n.language === 'ur' ? 'Urdu' : 'English'}</td>
    <td>${n.chapterCount || 0}</td>
    <td>${getViews(n.slug).toLocaleString()}</td>
    <td>${statusBadge(n)}</td>
    <td><div class="row-actions">
      <button class="btn small" onclick="openEditor('${n.slug}')">✏️ Edit</button>
      <button class="btn small" onclick="previewNovel('${n.slug}')">👁️</button>
      <button class="btn small" onclick="toggleStatus('${n.slug}')">${(n.status || 'published') === 'draft' ? '🚀 Publish' : '📝 Draft'}</button>
      <button class="btn small" onclick="exportNovel('${n.slug}')">📤</button>
      <button class="btn small" onclick="trashNovel('${n.slug}')">🗑️</button>
    </div></td>
  </tr>`).join('') || '<tr><td colspan="8" class="hint">No novels match.</td></tr>';
}

async function ensureStaged(slug) {
  if (!staged[slug]) staged[slug] = await getNovel(slug);
  return staged[slug];
}

async function toggleStatus(slug) {
  const n = await ensureStaged(slug);
  n.status = (n.status || 'published') === 'draft' ? 'published' : 'draft';
  persistLocal(); renderNovelList(); renderDashboard();
  toast(n.status === 'draft' ? 'Moved to draft (hidden from public).' : 'Published.');
}

async function trashNovel(slug) {
  if (!confirm('Move "' + slug + '" to trash? It will be hidden from the public site.')) return;
  const n = await getNovel(slug);
  trash[slug] = { ...n, _deletedAt: Date.now() };
  delete staged[slug];
  persistLocal(); renderNovelList(); renderDashboard();
  toast('Moved to trash.');
}

async function previewNovel(slug) {
  const n = await getNovel(slug);
  const rtl = n.language === 'ur' ? 'rtl' : '';
  const cover = n.coverData || (n.cover ? (n.cover.startsWith('data:') ? n.cover : '../' + n.cover) : '');
  $('preview-body').innerHTML = `
    <div class="${rtl}">
      ${cover ? `<img class="pv-cover" src="${cover}" alt="">` : ''}
      <h2 style="font-family:Georgia,serif">${esc(n.title)}</h2>
      <p class="hint">by ${esc(n.author || '')} · ${(n.chapters || []).length} chapters · ${esc(n.status || 'published')}</p>
      <p>${esc(n.description || '')}</p>
      ${n.source && n.source.fileId ? `<p class="hint">📎 External source: Google Drive (ID hidden from readers)</p>` : ''}
      ${n.source && n.source.url ? `<p class="hint">📎 External source: direct URL</p>` : ''}
      <hr>
      ${(n.chapters || []).slice(0, 3).map(c => `<h4>${esc(c.title)}</h4><p>${esc(String(c.text || '').slice(0, 400))}…</p>`).join('')}
      ${(n.chapters || []).length > 3 ? `<p class="hint">…and ${(n.chapters || []).length - 3} more chapters</p>` : ''}
    </div>`;
  $('preview-modal').classList.remove('hidden');
}

/* ---------------- part 3: novel editor ---------------- */
function wireEditor() {
  $('save-novel-btn').onclick = saveEditor;
  $('preview-btn').onclick = () => previewFromEditor();
  $('add-ch-btn').onclick = () => { editorChapters.push({ title: 'Chapter ' + (editorChapters.length + 1), text: '' }); renderChapters(); };
  $('bulk-btn').onclick = () => $('bulk-box').classList.toggle('hidden');
  $('bulk-apply').onclick = bulkImport;
  $('preview-close').onclick = () => $('preview-modal').classList.add('hidden');
  $('preview-modal').addEventListener('click', (e) => { if (e.target.id === 'preview-modal') $('preview-modal').classList.add('hidden'); });
  $('f-cover').onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    editorCoverName = f.name;
    const r = new FileReader();
    r.onload = () => { editorCoverDataURL = r.result; $('cover-preview').src = r.result; };
    r.readAsDataURL(f);
  };
  $('f-title').oninput = () => {
    if (!editingSlug) $('f-slug').value = slugify($('f-title').value);
  };
  // Drive link auto-extract
  $('f-src-id').oninput = () => {
    const v = $('f-src-id').value;
    if ($('f-src-type').value === 'gdrive' && /drive\.google\.com|docs\.google\.com/.test(v)) {
      const id = extractDriveId(v);
      if (id && id !== v) { $('f-src-id').value = id; toast('Drive file ID extracted.'); }
    }
  };
  // Drive test preview (admin-only iframe; readers never see Drive)
  $('test-drive-btn').onclick = () => {
    const id = extractDriveId($('f-src-id').value.trim());
    if ($('f-src-type').value !== 'gdrive' || !id) {
      return toast('Set source type to Google Drive and enter a file ID or share link first.');
    }
    $('drive-test-frame').src = 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/preview';
    $('drive-test-box').classList.remove('hidden');
    toast('Loading Drive preview…');
  };
  ['novel-search', 'filter-lang', 'filter-status'].forEach(id => $(id).addEventListener('input', renderNovelList));
}

async function openEditor(slug) {
  editingSlug = slug;
  editorChapters = [];
  editorCoverDataURL = null;
  editorCoverName = null;
  $('editor-title').textContent = slug ? 'Edit novel' : 'Add novel';
  $('bulk-box').classList.add('hidden');
  $('bulk-text').value = '';
  $('drive-test-box').classList.add('hidden');
  $('drive-test-frame').removeAttribute('src');
  if (slug) {
    const n = await getNovel(slug);
    $('f-title').value = n.title || '';
    $('f-title-en').value = n.title_en || '';
    $('f-author').value = n.author || '';
    $('f-author-en').value = n.author_en || '';
    $('f-lang').value = n.language || 'ur';
    $('f-genre').value = n.genre || '';
    $('f-status').value = n.status || 'published';
    $('f-slug').value = n.slug;
    $('f-desc').value = n.description || '';
    editorChapters = (n.chapters || []).map(c => ({ title: c.title, text: c.text }));
    if (n.coverData) { editorCoverDataURL = n.coverData; $('cover-preview').src = n.coverData; }
    else if (n.cover) $('cover-preview').src = n.cover.startsWith('data:') ? n.cover : '../' + n.cover;
    else $('cover-preview').removeAttribute('src');
    if (n.source?.provider === 'gdrive') {
      $('f-src-type').value = 'gdrive';
      $('f-src-id').value = n.source.fileId || '';
    } else if (n.source?.provider === 'url') {
      $('f-src-type').value = 'url';
      $('f-src-id').value = n.source.url || '';
    } else {
      $('f-src-type').value = '';
      $('f-src-id').value = '';
    }
  } else {
    ['f-title', 'f-title-en', 'f-author', 'f-author-en', 'f-genre', 'f-slug', 'f-desc', 'f-src-id'].forEach(id => $(id).value = '');
    $('f-lang').value = 'ur';
    $('f-status').value = 'draft';
    $('f-src-type').value = '';
    $('cover-preview').removeAttribute('src');
    editorChapters = [{ title: 'Chapter 1', text: '' }];
  }
  renderChapters();
  switchView('editor');
}

function renderChapters() {
  $('ch-count').textContent = editorChapters.length;
  $('chapter-list').innerHTML = editorChapters.map((c, i) => `
    <div class="chapter-card">
      <div class="chapter-head">
        <strong>#${i + 1}</strong>
        <input type="text" data-ch="${i}" data-f="title" value="${esc(c.title)}" placeholder="Chapter title">
        <span class="spacer"></span>
        <button class="icon-btn" onclick="moveChapter(${i},-1)" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="icon-btn" onclick="moveChapter(${i},1)" ${i === editorChapters.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="icon-btn" onclick="delChapter(${i})">✕</button>
      </div>
      <textarea rows="6" data-ch="${i}" data-f="text" placeholder="Chapter text…">${esc(c.text)}</textarea>
    </div>`).join('');
  document.querySelectorAll('#chapter-list [data-ch]').forEach(el => {
    el.oninput = () => { editorChapters[+el.dataset.ch][el.dataset.f] = el.value; };
  });
}

function moveChapter(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= editorChapters.length) return;
  [editorChapters[i], editorChapters[j]] = [editorChapters[j], editorChapters[i]];
  renderChapters();
}
function delChapter(i) {
  if (!confirm('Delete chapter "' + editorChapters[i].title + '"?')) return;
  editorChapters.splice(i, 1);
  renderChapters();
}

function bulkImport() {
  const raw = $('bulk-text').value;
  if (!raw.trim()) return toast('Paste some text first.');
  const parts = raw.split(/^===\s*(.+?)\s*===\s*$/m);
  const imported = [];
  // parts[0] is text before first separator
  if (parts[0].trim()) imported.push({ title: 'Chapter ' + (editorChapters.length + 1), text: parts[0].trim() });
  for (let i = 1; i < parts.length; i += 2) {
    const title = (parts[i] || '').trim() || 'Untitled';
    const text = (parts[i + 1] || '').trim();
    if (text) imported.push({ title, text });
  }
  if (!imported.length) return toast('No chapters found. Use === Title === separators.');
  editorChapters = editorChapters.filter(c => c.text.trim() || c.title);
  if (editorChapters.length === 1 && !editorChapters[0].text.trim()) editorChapters = [];
  editorChapters.push(...imported);
  $('bulk-text').value = '';
  $('bulk-box').classList.add('hidden');
  renderChapters();
  toast(imported.length + ' chapters imported.');
}

function collectEditor() {
  const slug = ($('f-slug').value.trim() || slugify($('f-title').value));
  const srcType = $('f-src-type').value;
  const srcVal = $('f-src-id').value.trim();
  const novel = {
    slug,
    title: $('f-title').value.trim(),
    title_en: $('f-title-en').value.trim() || undefined,
    author: $('f-author').value.trim(),
    author_en: $('f-author-en').value.trim() || undefined,
    language: $('f-lang').value,
    genre: $('f-genre').value.trim(),
    description: $('f-desc').value.trim(),
    cover: editorCoverName ? 'img/covers/' + editorCoverName : (editingSlug ? (staged[editingSlug]?.cover || baseNovels[editingSlug]?.cover || '') : ''),
    status: $('f-status').value,
    featured: editingSlug ? !!(staged[editingSlug]?.featured ?? baseNovels[editingSlug]?.featured) : false,
    sample: editingSlug ? !!(staged[editingSlug]?.sample ?? baseNovels[editingSlug]?.sample) : false,
    chapters: editorChapters.filter(c => c.text.trim()).map(c => ({ title: c.title.trim() || 'Untitled', text: c.text })),
  };
  if (editorCoverDataURL) {
    novel.coverData = editorCoverDataURL;
    novel.coverName = editorCoverName;
  }
  if (srcType === 'gdrive' && srcVal) {
    novel.source = { provider: 'gdrive', fileId: extractDriveId(srcVal) };
  } else if (srcType === 'url' && srcVal) {
    novel.source = { provider: 'url', url: srcVal };
  }
  // drop undefined
  Object.keys(novel).forEach(k => novel[k] === undefined && delete novel[k]);
  return novel;
}

function saveEditor() {
  const novel = collectEditor();
  if (!novel.title) return toast('Title is required.');
  if (!novel.author) return toast('Author is required.');
  if (editingSlug && novel.slug !== editingSlug) {
    // slug changed: drop old
    delete staged[editingSlug];
  }
  staged[novel.slug] = novel;
  persistLocal();
  editingSlug = novel.slug;
  $('f-slug').value = novel.slug;
  toast('Saved. Export to publish it live.');
  renderDashboard();
}

function previewFromEditor() {
  const n = collectEditor();
  const rtl = n.language === 'ur' ? 'rtl' : '';
  const cover = editorCoverDataURL || '';
  $('preview-body').innerHTML = `
    <div class="${rtl}">
      ${cover ? `<img class="pv-cover" src="${cover}" alt="">` : ''}
      <h2 style="font-family:Georgia,serif">${esc(n.title) || '(untitled)'}</h2>
      <p class="hint">by ${esc(n.author || '')} · ${n.chapters.length} chapters</p>
      <p>${esc(n.description || '')}</p>
      ${n.source ? `<p class="hint">📎 External source attached (${esc(n.source.provider)})</p>` : ''}
      <hr>
      ${n.chapters.slice(0, 2).map(c => `<h4>${esc(c.title)}</h4><p>${esc(String(c.text).slice(0, 400))}…</p>`).join('')}
      ${n.chapters.length > 2 ? `<p class="hint">…and ${n.chapters.length - 2} more chapters</p>` : ''}
    </div>`;
  $('preview-modal').classList.remove('hidden');
}

/* ---------------- part 4: trash, export/import, settings, init ---------------- */
function renderTrash() {
  const rows = Object.values(trash);
  $('trash-rows').innerHTML = rows.map(n => {
    const cover = n.coverData || (n.cover && !n.cover.startsWith('data:') ? '../' + n.cover : n.cover);
    return `<tr>
    <td>${cover ? `<img class="thumb" src="${cover}" alt="">` : ''}</td>
    <td><strong>${esc(n.title)}</strong></td>
    <td>${esc(n.author || '')}</td>
    <td class="hint">${n._deletedAt ? new Date(n._deletedAt).toLocaleDateString() : ''}</td>
    <td><div class="row-actions">
      <button class="btn small" onclick="restoreNovel('${n.slug}')">♻️ Restore</button>
      <button class="btn small" onclick="purgeNovel('${n.slug}')">🔥 Delete forever</button>
    </div></td>
  </tr>`;
  }).join('') || '<tr><td colspan="5" class="hint">Trash is empty.</td></tr>';
}

function restoreNovel(slug) {
  const n = trash[slug];
  delete n._deletedAt;
  staged[slug] = n;
  delete trash[slug];
  persistLocal(); renderTrash(); renderDashboard();
  toast('Restored.');
}

function purgeNovel(slug) {
  if (!confirm('PERMANENTLY delete "' + slug + '"? This cannot be undone.')) return;
  delete trash[slug];
  persistLocal(); renderTrash(); renderDashboard();
  toast('Deleted forever.');
}

function cleanForExport(n) {
  const c = { ...n };
  delete c._deletedAt;
  delete c.coverName;
  // coverData stays out of the JSON file; exported separately as image
  const coverData = c.coverData;
  delete c.coverData;
  return { json: c, coverData };
}

function exportNovel(slug) {
  getNovel(slug).then(n => {
    const { json, coverData } = cleanForExport(n);
    download(slug + '.json', JSON.stringify(json, null, 2));
    if (coverData && n.coverName) {
      download(n.coverName, dataURLtoBlob(coverData));
    } else if (coverData) {
      const ext = coverData.startsWith('data:image/png') ? 'png' : 'jpg';
      download(slug + '.' + ext, dataURLtoBlob(coverData));
    }
    toast('Exported ' + slug + '.json' + (coverData ? ' + cover image.' : ''));
  });
}

function exportAll() {
  const novels = publicNovels();
  const index = novels.map(indexEntryOf);
  download('index.json', JSON.stringify(index, null, 2));
  let i = 0;
  const next = () => {
    if (i >= novels.length) { toast('Exported index + ' + novels.length + ' novels.'); return; }
    const n = novels[i++];
    const { json, coverData } = cleanForExport(n);
    download(n.slug + '.json', JSON.stringify(json, null, 2));
    if (coverData) {
      const ext = coverData.startsWith('data:image/png') ? 'png' : 'jpg';
      setTimeout(() => download((n.coverName || n.slug + '.' + ext), dataURLtoBlob(coverData)), 300);
    }
    setTimeout(next, 600);
  };
  next();
}

function wireSettings() {
  $('import-file').onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const n = JSON.parse(r.result);
        if (!n.slug || !n.title) throw new Error('bad file');
        staged[n.slug] = n;
        persistLocal();
        toast('Imported "' + n.title + '".');
        renderDashboard();
      } catch { toast('Invalid novel JSON file.'); }
    };
    r.readAsText(f);
    e.target.value = '';
  };
  $('change-pass-btn').onclick = async () => {
    const auth = getAuth();
    const cur = $('set-cur').value, nw = $('set-new').value;
    if ((await pwHash(auth.user, cur)) !== auth.hash) return toast('Current password is wrong.');
    if (nw.length < 6) return toast('New password must be at least 6 characters.');
    auth.hash = await pwHash(auth.user, nw);
    localStorage.setItem(LS_AUTH, JSON.stringify(auth));
    $('set-cur').value = $('set-new').value = '';
    toast('Password changed.');
  };
  $('reset-btn').onclick = () => {
    if (!confirm('Reset admin? This clears the login AND all staged novels from this browser.')) return;
    if (!confirm('Are you sure? This cannot be undone.')) return;
    localStorage.removeItem(LS_AUTH);
    localStorage.removeItem(LS_NOVELS);
    localStorage.removeItem(LS_TRASH);
    sessionStorage.removeItem('ast_admin_session');
    location.reload();
  };
}

/* ---------------- init ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('ast_admin_session') === '1' && getAuth()) {
    enterApp();
  } else {
    initAuth();
  }
});
