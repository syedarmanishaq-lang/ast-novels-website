/* ============================================================================
   AST NOVELS — Admin panel (Supabase edition)
   Login: Supabase Auth (email + password). Everything saves LIVE to the
   database — no export/push needed. Published novels appear on the site
   instantly.
   Admin login: admin@astnovels.app (password kept by Luffy).
   ============================================================================ */
'use strict';
/* ---------------- utils ---------------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add('hidden'), 2800);
}

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

function extractDriveId(input) {
  if (!input) return '';
  const s = String(input).trim();
  const dm = s.match(/\/d\/([-\w]{10,})/);
  if (dm) return dm[1];
  if (/^[-\w]{10,}$/.test(s)) return s;
  const m = s.match(/[-\w]{25,}/);
  return m ? m[0] : s;
}

/* ---------------- Supabase session ---------------- */
const SB = window.ASTSupa;
const LS_TOKEN = 'ast_sb_token';
let novels = [];        // all novels from DB (with chapter counts)
let editingId = null;   // uuid of novel being edited
let editingSlug = null;
let editorChapters = [];
let editorCoverFile = null;
let editorCoverURL = '';
let editorPdfFile = null;
let editorPdfPath = ''; // existing books/ path when editing

const token = () => sessionStorage.getItem(LS_TOKEN);

let authors = [];       // author profiles from DB
let reviews = [];       // reader reviews from DB
let editingAuthorId = null;
let reviewFilter = 'pending';

async function sbGet(path) { return SB.get(path, token()); }
async function sbPost(path, json, prefer) { return SB.post(path, json, token(), prefer); }
async function sbPatch(path, json) { return SB.patch(path, json, token()); }
async function sbDel(path) { return SB.del(path, token()); }

/* ---------------- auth ---------------- */
function showScreen(which) {
  $('login-screen').classList.toggle('hidden', which !== 'login');
  $('admin-app').classList.toggle('hidden', which !== 'app');
}

function initAuth() {
  if (token()) { enterApp(); return; }
  showScreen('login');
  const go = async () => {
    const email = $('login-user').value.trim();
    const pass = $('login-pass').value;
    if (!email || !pass) return toast('Enter your email and password.');
    $('login-btn').disabled = true;
    $('login-btn').textContent = 'Logging in…';
    try {
      const s = await SB.signIn(email, pass);
      sessionStorage.setItem(LS_TOKEN, s.access_token);
      toast('Welcome back.');
      enterApp();
    } catch (e) {
      $('login-error').classList.remove('hidden');
      $('login-btn').disabled = false;
      $('login-btn').textContent = 'Log in';
    }
  };
  $('login-btn').onclick = go;
  $('login-pass').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

function logout() {
  SB.signOut(token());
  sessionStorage.removeItem(LS_TOKEN);
  location.reload();
}

/* ---------------- data ---------------- */
function normRow(r) {
  const c = (r.chapters && r.chapters[0] && r.chapters[0].count) || 0;
  return {
    id: r.id, slug: r.slug, title: r.title, title_en: r.title_en,
    author: r.author, author_en: r.author_en, language: r.lang || 'en',
    genre: r.genre, description: r.description, cover: r.cover_url,
    featured: !!r.featured, status: r.status || 'published',
    chapterCount: c, wordCount: r.word_count || 0, views: r.views || 0,
    tags: r.tags || [], published_year: r.published_year,
    source_type: r.source_type, source_id: r.source_id,
    updated_at: r.updated_at,
  };
}

async function loadNovels() {
  const rows = await sbGet('/rest/v1/novels?select=*,chapters(count)&order=updated_at.desc');
  novels = rows.map(normRow);
}

async function getNovelChapters(id) {
  return sbGet('/rest/v1/chapters?novel_id=eq.' + id + '&select=title,content,position&order=position');
}

/* ---------------- navigation ---------------- */
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  $('view-' + name).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.body.classList.remove('nav-open');
  if (name === 'dashboard') renderDashboard();
  if (name === 'novels') renderNovelList();
  if (name === 'authors') renderAuthors();
  if (name === 'reviews') renderReviews();
  if (name === 'trash') renderTrash();
  window.scrollTo(0, 0);
}

function emptyHTML(icon, title, sub) {
  return `<div class="empty"><span class="e-icon">${icon}</span><div class="e-title">${esc(title)}</div><p>${esc(sub)}</p></div>`;
}

function showSkeletons() {
  $('stats-grid').innerHTML = '<div class="skel" style="height:104px"></div>'.repeat(4);
  $('top-viewed').innerHTML = '<div class="skel-row"><div class="skel" style="flex:1"></div><div class="skel" style="width:90px"></div></div>'
    + '<div class="skel-row"><div class="skel" style="flex:1"></div><div class="skel" style="width:70px"></div></div>'
    + '<div class="skel-row"><div class="skel" style="flex:1"></div><div class="skel" style="width:100px"></div></div>';
  $('recent-list').innerHTML = '<div class="skel-row"><div class="skel" style="flex:1"></div></div>'
    + '<div class="skel-row"><div class="skel" style="flex:1"></div></div>';
}

/* mobile drawer nav */
function wireDrawer() {
  $('nav-toggle').onclick = () => document.body.classList.add('nav-open');
  $('nav-close').onclick = () => document.body.classList.remove('nav-open');
  $('nav-backdrop').onclick = () => document.body.classList.remove('nav-open');
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.body.classList.remove('nav-open');
  });
}

function enterApp() {
  showScreen('app');
  showSkeletons();
  loadNovels()
    .then(() => switchView('dashboard'))
    .catch((e) => { toast('Could not load novels: ' + e.message); });
  loadAuthors().catch(() => {});
  loadReviews().catch(() => {});
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.onclick = () => {
      if (b.dataset.view === 'editor' && b.id === 'nav-add') openEditor(null);
      else switchView(b.dataset.view);
    };
  });
  $('add-novel-btn').onclick = () => openEditor(null);
  $('logout-btn').onclick = logout;
  $('export-all-btn').onclick = exportAll;
  $('add-author-btn').onclick = () => openAuthorModal(null);
  document.querySelectorAll('#review-filters .btn').forEach(b => {
    b.onclick = () => {
      reviewFilter = b.dataset.rf;
      document.querySelectorAll('#review-filters .btn').forEach(x => x.classList.toggle('primary', x === b));
      renderReviews();
    };
  });
  wireDrawer();
  wireEditor();
  wireAuthorModal();
  wireSettings();
}

/* ---------------- dashboard ---------------- */
function renderDashboard() {
  const live = novels.filter(n => n.status !== 'trash');
  const pub = live.filter(n => n.status === 'published');
  const drafts = live.filter(n => n.status === 'draft');
  const chapters = live.reduce((a, n) => a + (n.chapterCount || 0), 0);
  const words = live.reduce((a, n) => a + (n.wordCount || 0), 0);
  const views = live.reduce((a, n) => a + (n.views || 0), 0);
  const trashCount = novels.filter(n => n.status === 'trash').length;
  const tb = $('trash-badge');
  tb.textContent = trashCount;
  tb.classList.toggle('hidden', !trashCount);
  updateReviewBadge();

  const pendingReviews = reviews.filter(r => !r.approved).length;
  $('stats-grid').innerHTML = [
    ['📚', live.length, 'Total novels', 'novels'],
    ['✅', pub.length, 'Published', 'novels'],
    ['📝', drafts.length, 'Drafts', 'novels'],
    ['📄', chapters, 'Chapters', ''],
    ['🔤', words.toLocaleString(), 'Words', ''],
    ['👁️', views.toLocaleString(), 'Total views', ''],
    ['👥', authors.length, 'Authors', 'authors'],
    ['⭐', pendingReviews, 'Pending reviews', 'reviews'],
  ].map(([i, n, l, v]) => v
    ? `<a class="stat" href="javascript:void(0)" onclick="switchView('${v}')"><div class="num">${n}</div><div class="lbl">${i} ${l}</div></a>`
    : `<div class="stat"><div class="num">${n}</div><div class="lbl">${i} ${l}</div></div>`).join('');

  const top = [...live].sort((a, b) => b.views - a.views).slice(0, 5);
  $('top-viewed').innerHTML = top.length
    ? '<table class="novel-table"><tbody>' + top.map(n =>
        `<tr><td>${esc(n.title)}</td><td>${(n.views || 0).toLocaleString()} views</td>
         <td><span class="badge ${n.status === 'draft' ? 'draft' : 'pub'}">${n.status}</span></td></tr>`).join('') + '</tbody></table>'
    : '<p class="hint">No views recorded yet.</p>';

  $('recent-list').innerHTML = live.slice(0, 5).map(n =>
    `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><strong>${esc(n.title)}</strong>
     <span class="hint">— ${esc(n.author || '')} · ${n.chapterCount || 0} chapters</span></div>`).join('')
    || '<p class="hint">No novels yet.</p>';
}

function statusBadge(s) {
  return `<span class="badge ${s === 'draft' ? 'draft' : 'pub'}">${s}</span>`;
}

/* ---------------- novel list ---------------- */
function renderNovelList() {
  const q = ($('novel-search').value || '').toLowerCase();
  const lang = $('filter-lang').value;
  const status = $('filter-status').value;
  const rows = novels.filter(n => {
    if (n.status === 'trash') return false;
    if (q && !(n.title + ' ' + (n.title_en || '') + ' ' + n.author).toLowerCase().includes(q)) return false;
    if (lang && n.language !== lang) return false;
    if (status && n.status !== status) return false;
    return true;
  });
  $('novel-rows').innerHTML = rows.map(n => `<tr>
    <td>${n.cover ? `<img class="thumb" src="${esc(n.cover)}" alt="" loading="lazy">` : ''}</td>
    <td><strong>${esc(n.title)}</strong>${n.title_en ? `<br><span class="hint">${esc(n.title_en)}</span>` : ''}</td>
    <td>${esc(n.author || '')}</td>
    <td>${n.language === 'ur' ? 'Urdu' : 'English'}</td>
    <td>${n.chapterCount || 0}</td>
    <td>${(n.views || 0).toLocaleString()}</td>
    <td>${statusBadge(n.status)}</td>
    <td><div class="row-actions">
      <button class="btn small" onclick="openEditor('${n.slug}')">✏️ Edit</button>
      <button class="btn small" onclick="previewNovel('${n.slug}')">👁️</button>
      <button class="btn small" onclick="toggleStatus('${n.slug}')">${n.status === 'draft' ? '🚀 Publish' : '📝 Draft'}</button>
      <button class="btn small" onclick="exportNovel('${n.slug}')">📥</button>
      <button class="btn small" onclick="trashNovel('${n.slug}')">🗑️</button>
    </div></td>
  </tr>`).join('') || '<tr><td colspan="8" class="hint">No novels match.</td></tr>';
  /* mobile cards */
  $('novel-cards').innerHTML = rows.map(n => {
    const u = n.language === 'ur';
    return `<div class="ncard">
      ${n.cover ? `<img class="thumb" src="${esc(n.cover)}" alt="" loading="lazy">` : `<div class="thumb" style="display:flex;align-items:center;justify-content:center;font-size:22px">📖</div>`}
      <div class="ncard-info">
        <div class="ncard-title${u ? ' urdu' : ''}">${esc(n.title)}</div>
        <div class="ncard-author">${esc(n.author || '')}</div>
        <div class="ncard-meta">${statusBadge(n.status)}<span class="m">${n.chapterCount || 0} ch</span><span class="m">${(n.views || 0).toLocaleString()} views</span></div>
      </div>
      <div class="ncard-actions">
        <button class="btn small" onclick="openEditor('${n.slug}')">✏️ Edit</button>
        <button class="btn small" onclick="previewNovel('${n.slug}')">👁️ View</button>
        <button class="btn small" onclick="toggleStatus('${n.slug}')">${n.status === 'draft' ? '🚀 Publish' : '📝 Draft'}</button>
        <button class="btn small" onclick="trashNovel('${n.slug}')">🗑️</button>
      </div>
    </div>`;
  }).join('') || emptyHTML('📚', 'No novels found', 'Try a different search, or add your first novel.');
}

function findNovel(slug) { return novels.find(n => n.slug === slug); }

async function toggleStatus(slug) {
  const n = findNovel(slug);
  if (!n) return;
  const next = n.status === 'draft' ? 'published' : 'draft';
  try {
    await sbPatch('/rest/v1/novels?id=eq.' + n.id, { status: next });
    n.status = next;
    renderNovelList(); renderDashboard();
    toast(next === 'published' ? '🚀 Published — live on the site now.' : 'Moved to draft (hidden from public).');
  } catch (e) { toast('Failed: ' + e.message); }
}

async function trashNovel(slug) {
  const n = findNovel(slug);
  if (!n) return;
  if (!confirm('Move "' + n.title + '" to trash? It will be hidden from the public site.')) return;
  try {
    await sbPatch('/rest/v1/novels?id=eq.' + n.id, { status: 'trash' });
    n.status = 'trash';
    renderNovelList(); renderDashboard();
    toast('Moved to trash.');
  } catch (e) { toast('Failed: ' + e.message); }
}

async function previewNovel(slug) {
  const n = findNovel(slug);
  if (!n) return;
  const rtl = n.language === 'ur' ? 'rtl' : '';
  let chHtml = '';
  try {
    const chs = await getNovelChapters(n.id);
    chHtml = chs.slice(0, 3).map(c => `<h4>${esc(c.title)}</h4><p>${esc(String(c.content || '').slice(0, 400))}…</p>`).join('')
      + (chs.length > 3 ? `<p class="hint">…and ${chs.length - 3} more chapters</p>` : '');
  } catch (e) { chHtml = '<p class="hint">Could not load chapters.</p>'; }
  const srcNote = n.source_type === 'supabase_pdf' ? '<p class="hint">📕 PDF attached (read inside the site)</p>'
    : n.source_type === 'gdrive' ? '<p class="hint">📎 External source: Google Drive</p>'
    : n.source_type === 'url' ? '<p class="hint">📎 External source: direct URL</p>' : '';
  $('preview-body').innerHTML = `
    <div class="${rtl}">
      ${n.cover ? `<img class="pv-cover" src="${esc(n.cover)}" alt="">` : ''}
      <h2 style="font-family:Georgia,serif">${esc(n.title)}</h2>
      <p class="hint">by ${esc(n.author || '')} · ${n.chapterCount || 0} chapters · ${esc(n.status)}</p>
      <p>${esc(n.description || '')}</p>
      ${srcNote}
      <hr>${chHtml}
    </div>`;
  $('preview-modal').classList.remove('hidden');
}

/* ---------------- editor ---------------- */
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
    editorCoverFile = f;
    const r = new FileReader();
    r.onload = () => { $('cover-preview').src = r.result; };
    r.readAsDataURL(f);
    toast('Cover selected — it uploads when you save.');
  };
  $('f-pdf').onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    editorPdfFile = f;
    $('pdf-name').textContent = '📕 ' + f.name + ' (' + Math.round(f.size / 1024) + ' KB) — uploads on save.';
    toast('PDF selected — it uploads when you save.');
  };
  $('f-pdf-clear').onclick = () => {
    editorPdfFile = null; editorPdfPath = '';
    $('f-pdf').value = ''; $('pdf-name').textContent = '';
    toast('PDF attachment removed.');
  };
  $('f-title').oninput = () => {
    if (!editingId) $('f-slug').value = slugify($('f-title').value);
  };
  $('f-src-id').oninput = () => {
    const v = $('f-src-id').value;
    if ($('f-src-type').value === 'gdrive' && /drive\.google\.com|docs\.google\.com/.test(v)) {
      const id = extractDriveId(v);
      if (id && id !== v) { $('f-src-id').value = id; toast('Drive file ID extracted.'); }
    }
  };
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
  editingId = null; editingSlug = slug;
  editorChapters = [];
  editorCoverFile = null; editorCoverURL = '';
  editorPdfFile = null; editorPdfPath = '';
  $('editor-title').textContent = slug ? 'Edit novel' : 'Add novel';
  $('bulk-box').classList.add('hidden');
  $('bulk-text').value = '';
  $('drive-test-box').classList.add('hidden');
  $('drive-test-frame').removeAttribute('src');
  $('pdf-name').textContent = '';
  $('f-pdf').value = '';
  $('f-cover').value = '';
  if (slug) {
    const n = findNovel(slug);
    if (!n) return toast('Novel not found.');
    editingId = n.id;
    $('f-title').value = n.title || '';
    $('f-title-en').value = n.title_en || '';
    $('f-author').value = n.author || '';
    $('f-author-en').value = n.author_en || '';
    $('f-lang').value = n.language || 'ur';
    $('f-genre').value = n.genre || '';
    $('f-status').value = n.status || 'published';
    $('f-slug').value = n.slug;
    $('f-desc').value = n.description || '';
    $('f-tags').value = (n.tags || []).join(', ');
    $('f-year').value = n.published_year || '';
    $('f-featured').checked = !!n.featured;
    editorCoverURL = n.cover || '';
    if (editorCoverURL) $('cover-preview').src = editorCoverURL;
    else $('cover-preview').removeAttribute('src');
    if (n.source_type === 'gdrive') {
      $('f-src-type').value = 'gdrive';
      $('f-src-id').value = n.source_id || '';
    } else if (n.source_type === 'url') {
      $('f-src-type').value = 'url';
      $('f-src-id').value = n.source_id || '';
    } else if (n.source_type === 'supabase_pdf') {
      $('f-src-type').value = 'supabase_pdf';
      editorPdfPath = n.source_id || '';
      $('pdf-name').textContent = '📕 Attached: ' + editorPdfPath.split('/').pop();
    } else {
      $('f-src-type').value = '';
      $('f-src-id').value = '';
    }
    toast('Loading chapters…');
    try {
      const chs = await getNovelChapters(n.id);
      editorChapters = chs.map(c => ({ title: c.title, text: c.content }));
    } catch (e) {
      toast('Could not load chapters: ' + e.message);
    }
  } else {
    ['f-title', 'f-title-en', 'f-author', 'f-author-en', 'f-genre', 'f-slug', 'f-desc', 'f-src-id', 'f-tags', 'f-year'].forEach(id => $(id).value = '');
    $('f-lang').value = 'ur';
    $('f-status').value = 'draft';
    $('f-src-type').value = '';
    $('f-featured').checked = false;
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

function countWords(t) { return String(t || '').trim().split(/\s+/).filter(Boolean).length; }

async function saveEditor() {
  const title = $('f-title').value.trim();
  const author = $('f-author').value.trim();
  if (!title) return toast('Title is required.');
  if (!author) return toast('Author is required.');
  const slug = ($('f-slug').value.trim() || slugify(title));
  const btn = $('save-novel-btn');
  btn.disabled = true;
  btn.textContent = '💾 Saving…';
  try {
    // 1. upload cover if a new file was chosen
    let coverURL = editorCoverURL;
    if (editorCoverFile) {
      const ext = (editorCoverFile.name.split('.').pop() || 'jpg').toLowerCase().slice(0, 4);
      const path = slug + '/' + Date.now() + '.' + ext;
      coverURL = await SB.upload('covers', path, editorCoverFile, token());
    }
    // 2. upload PDF if chosen
    const srcType = $('f-src-type').value;
    const srcVal = $('f-src-id').value.trim();
    let source_type = 'text', source_id = null;
    if (editorPdfFile) {
      const path = slug + '/' + Date.now() + '-' + editorPdfFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      await SB.upload('books', path, editorPdfFile, token());
      source_type = 'supabase_pdf'; source_id = path;
    } else if (srcType === 'supabase_pdf' && editorPdfPath) {
      source_type = 'supabase_pdf'; source_id = editorPdfPath;
    } else if (srcType === 'gdrive' && srcVal) {
      source_type = 'gdrive'; source_id = extractDriveId(srcVal);
    } else if (srcType === 'url' && srcVal) {
      source_type = 'url'; source_id = srcVal;
    }
    // 3. build novel row
    const chapters = editorChapters.filter(c => c.text.trim())
      .map(c => ({ title: (c.title || '').trim() || 'Untitled', text: c.text }));
    const tags = $('f-tags').value.split(',').map(s => s.trim()).filter(Boolean);
    const year = parseInt($('f-year').value, 10);
    const row = {
      slug,
      title,
      title_en: $('f-title-en').value.trim() || null,
      author,
      author_en: $('f-author-en').value.trim() || null,
      lang: $('f-lang').value,
      genre: $('f-genre').value.trim() || null,
      description: $('f-desc').value.trim() || null,
      cover_url: coverURL || null,
      status: $('f-status').value,
      featured: $('f-featured').checked,
      tags,
      published_year: isNaN(year) ? null : year,
      word_count: chapters.reduce((a, c) => a + countWords(c.text), 0),
      source_type,
      source_id,
      updated_at: new Date().toISOString(),
    };
    let novelId = editingId;
    if (editingId) {
      await sbPatch('/rest/v1/novels?id=eq.' + editingId, row);
    } else {
      const created = await sbPost('/rest/v1/novels', row, 'return=representation');
      novelId = created[0].id;
    }
    // 4. replace chapters
    if (editingId) {
      await sbDel('/rest/v1/chapters?novel_id=eq.' + novelId);
    }
    if (chapters.length) {
      const rows = chapters.map((c, i) => ({
        novel_id: novelId, title: c.title, content: c.text,
        position: i, word_count: countWords(c.text),
      }));
      for (let b = 0; b < rows.length; b += 50) {
        await sbPost('/rest/v1/chapters', rows.slice(b, b + 50));
      }
    }
    await loadNovels();
    editingId = novelId; editingSlug = slug;
    $('f-slug').value = slug;
    editorCoverURL = coverURL; editorCoverFile = null;
    editorPdfFile = null;
    if (source_type === 'supabase_pdf') editorPdfPath = source_id;
    $('pdf-name').textContent = source_type === 'supabase_pdf' ? '📕 Attached: ' + String(source_id).split('/').pop() : '';
    renderDashboard();
    toast(row.status === 'published' ? '🚀 Published — live on the site now!' : '💾 Saved as draft.');
  } catch (e) {
    toast('Save failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Save novel';
  }
}

function previewFromEditor() {
  const rtl = $('f-lang').value === 'ur' ? 'rtl' : '';
  const chs = editorChapters.filter(c => c.text.trim());
  $('preview-body').innerHTML = `
    <div class="${rtl}">
      ${$('cover-preview').src ? `<img class="pv-cover" src="${esc($('cover-preview').src)}" alt="">` : ''}
      <h2 style="font-family:Georgia,serif">${esc($('f-title').value) || '(untitled)'}</h2>
      <p class="hint">by ${esc($('f-author').value)} · ${chs.length} chapters</p>
      <p>${esc($('f-desc').value)}</p>
      ${editorPdfFile || editorPdfPath ? '<p class="hint">📕 PDF attached</p>' : ''}
      <hr>
      ${chs.slice(0, 2).map(c => `<h4>${esc(c.title)}</h4><p>${esc(String(c.text).slice(0, 400))}…</p>`).join('')}
      ${chs.length > 2 ? `<p class="hint">…and ${chs.length - 2} more chapters</p>` : ''}
    </div>`;
  $('preview-modal').classList.remove('hidden');
}

/* ---------------- trash ---------------- */
function renderTrash() {
  const rows = novels.filter(n => n.status === 'trash');
  $('trash-rows').innerHTML = rows.map(n => `<tr>
    <td>${n.cover ? `<img class="thumb" src="${esc(n.cover)}" alt="" loading="lazy">` : ''}</td>
    <td><strong>${esc(n.title)}</strong></td>
    <td>${esc(n.author || '')}</td>
    <td class="hint">${n.updated_at ? new Date(n.updated_at).toLocaleDateString() : ''}</td>
    <td><div class="row-actions">
      <button class="btn small" onclick="restoreNovel('${n.slug}')">♻️ Restore</button>
      <button class="btn small" onclick="purgeNovel('${n.slug}')">🔥 Delete forever</button>
    </div></td>
  </tr>`).join('') || '<tr><td colspan="5" class="hint">Trash is empty.</td></tr>';
  $('trash-cards').innerHTML = rows.map(n => `<div class="ncard">
    ${n.cover ? `<img class="thumb" src="${esc(n.cover)}" alt="" loading="lazy">` : `<div class="thumb" style="display:flex;align-items:center;justify-content:center;font-size:22px">📖</div>`}
    <div class="ncard-info">
      <div class="ncard-title">${esc(n.title)}</div>
      <div class="ncard-author">${esc(n.author || '')}</div>
      <div class="ncard-meta"><span class="m">Deleted ${n.updated_at ? new Date(n.updated_at).toLocaleDateString() : ''}</span></div>
    </div>
    <div class="ncard-actions">
      <button class="btn small" onclick="restoreNovel('${n.slug}')">♻️ Restore</button>
      <button class="btn small" onclick="purgeNovel('${n.slug}')">🔥 Delete</button>
    </div>
  </div>`).join('') || emptyHTML('🗑️', 'Trash is empty', 'Deleted novels will appear here.');
}

async function restoreNovel(slug) {
  const n = findNovel(slug);
  if (!n) return;
  try {
    await sbPatch('/rest/v1/novels?id=eq.' + n.id, { status: 'draft' });
    n.status = 'draft';
    renderTrash(); renderDashboard();
    toast('Restored as draft — publish when ready.');
  } catch (e) { toast('Failed: ' + e.message); }
}

async function purgeNovel(slug) {
  const n = findNovel(slug);
  if (!n) return;
  if (!confirm('PERMANENTLY delete "' + n.title + '" and all its chapters? This cannot be undone.')) return;
  try {
    await sbDel('/rest/v1/novels?id=eq.' + n.id);
    novels = novels.filter(x => x.id !== n.id);
    renderTrash(); renderDashboard();
    toast('Deleted forever.');
  } catch (e) { toast('Failed: ' + e.message); }
}

/* ---------------- backup export / import / settings ---------------- */
async function exportNovel(slug) {
  const n = findNovel(slug);
  if (!n) return;
  try {
    const chs = await getNovelChapters(n.id);
    const json = {
      slug: n.slug, title: n.title, title_en: n.title_en, author: n.author,
      author_en: n.author_en, language: n.language, genre: n.genre,
      description: n.description, cover: n.cover, featured: n.featured,
      status: n.status, source_type: n.source_type, source_id: n.source_id,
      chapters: chs.map(c => ({ title: c.title, text: c.content })),
    };
    download(slug + '.json', JSON.stringify(json, null, 2));
    toast('Downloaded ' + slug + '.json (backup).');
  } catch (e) { toast('Export failed: ' + e.message); }
}

async function exportAll() {
  const live = novels.filter(n => n.status !== 'trash');
  const index = live.map(n => ({
    slug: n.slug, title: n.title, author: n.author, language: n.language,
    genre: n.genre, description: n.description, cover: n.cover, featured: n.featured,
  }));
  download('index.json', JSON.stringify(index, null, 2));
  toast('Downloaded index.json backup. Use 📥 per novel for full JSON.');
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
        openEditor(null);
        $('f-title').value = n.title || '';
        $('f-title-en').value = n.title_en || '';
        $('f-author').value = n.author || '';
        $('f-author-en').value = n.author_en || '';
        $('f-lang').value = n.language || 'ur';
        $('f-genre').value = n.genre || '';
        $('f-slug').value = n.slug;
        $('f-desc').value = n.description || '';
        $('f-status').value = 'draft';
        editorChapters = (n.chapters || []).map(c => ({ title: c.title, text: c.text }));
        renderChapters();
        switchView('editor');
        toast('Imported "' + n.title + '" — review and save.');
      } catch { toast('Invalid novel JSON file.'); }
    };
    r.readAsText(f);
    e.target.value = '';
  };
  $('change-pass-btn').onclick = async () => {
    const nw = $('set-new').value;
    if (nw.length < 8) return toast('New password must be at least 8 characters.');
    try {
      await SB.updatePassword(token(), nw);
      $('set-new').value = '';
      toast('Password changed.');
    } catch (e) { toast('Failed: ' + e.message); }
  };
  $('reset-btn').onclick = () => {
    if (!confirm('Sign out of the admin panel?')) return;
    logout();
  };
}

/* ---------------- authors ---------------- */
async function loadAuthors() {
  authors = await sbGet('/rest/v1/authors?select=*&order=name');
  const dl = $('authors-datalist');
  if (dl) dl.innerHTML = authors.map(a => `<option value="${esc(a.name)}">`).join('');
}

function authorInitial(a) {
  const s = (a.name || '?').trim();
  return esc(s.charAt(0));
}

function renderAuthors() {
  const g = $('author-grid');
  if (!authors.length) {
    g.innerHTML = emptyHTML('👥', 'No authors yet', 'Add author profiles — name, photo and bio. They power the author suggestions in the novel editor.');
    return;
  }
  g.innerHTML = authors.map(a => {
    const ncount = novels.filter(n => n.status !== 'trash' && (n.author || '') === a.name).length;
    return `<div class="author-card">
      ${a.photo_url
        ? `<img class="author-photo" src="${esc(a.photo_url)}" alt="" loading="lazy">`
        : `<div class="author-photo">${authorInitial(a)}</div>`}
      <div class="author-info">
        <h4>${esc(a.name)}${a.name_en ? `<span class="en">${esc(a.name_en)}</span>` : ''}</h4>
        ${a.bio ? `<div class="bio">${esc(a.bio)}</div>` : ''}
        <div class="author-meta"><span class="badge">${ncount} novel${ncount === 1 ? '' : 's'}</span></div>
        <div class="author-actions">
          <button class="btn small" onclick="openAuthorModal('${a.id}')">✏️ Edit</button>
          <button class="btn small" onclick="deleteAuthor('${a.id}')">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function openAuthorModal(id) {
  editingAuthorId = id || null;
  const a = id ? authors.find(x => x.id === id) : null;
  $('author-modal-title').textContent = a ? 'Edit author' : 'Add author';
  $('a-name').value = a ? (a.name || '') : '';
  $('a-name-en').value = a ? (a.name_en || '') : '';
  $('a-photo').value = a ? (a.photo_url || '') : '';
  $('a-bio').value = a ? (a.bio || '') : '';
  $('a-bio-en').value = a ? (a.bio_en || '') : '';
  $('author-modal').classList.remove('hidden');
  setTimeout(() => $('a-name').focus(), 60);
}

async function saveAuthor() {
  const name = $('a-name').value.trim();
  if (!name) return toast('Name is required.');
  const row = {
    name,
    name_en: $('a-name-en').value.trim() || null,
    photo_url: $('a-photo').value.trim() || null,
    bio: $('a-bio').value.trim() || null,
    bio_en: $('a-bio-en').value.trim() || null,
  };
  const btn = $('author-save-btn');
  btn.disabled = true;
  try {
    if (editingAuthorId) {
      await sbPatch('/rest/v1/authors?id=eq.' + editingAuthorId, row);
    } else {
      await sbPost('/rest/v1/authors', row);
    }
    await loadAuthors();
    renderAuthors();
    $('author-modal').classList.add('hidden');
    toast('Author saved.');
  } catch (e) {
    toast('Save failed: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

async function deleteAuthor(id) {
  const a = authors.find(x => x.id === id);
  if (!a) return;
  if (!confirm('Delete author "' + a.name + '"? Novels keep their author text.')) return;
  try {
    await sbDel('/rest/v1/authors?id=eq.' + id);
    authors = authors.filter(x => x.id !== id);
    const dl = $('authors-datalist');
    if (dl) dl.innerHTML = authors.map(x => `<option value="${esc(x.name)}">`).join('');
    renderAuthors();
    toast('Author deleted.');
  } catch (e) { toast('Failed: ' + e.message); }
}

function wireAuthorModal() {
  $('author-modal-close').onclick = () => $('author-modal').classList.add('hidden');
  $('author-modal-cancel').onclick = () => $('author-modal').classList.add('hidden');
  $('author-modal').addEventListener('click', (e) => {
    if (e.target.id === 'author-modal') $('author-modal').classList.add('hidden');
  });
  $('author-save-btn').onclick = saveAuthor;
}

/* ---------------- reviews ---------------- */
async function loadReviews() {
  try {
    reviews = await sbGet('/rest/v1/reviews?select=*,novels(title)&order=created_at.desc');
  } catch (e) {
    reviews = [];
  }
  updateReviewBadge();
  if (!$('view-reviews').classList.contains('hidden')) renderReviews();
}

function updateReviewBadge() {
  const p = reviews.filter(r => !r.approved).length;
  const b = $('reviews-badge');
  if (b) { b.textContent = p; b.classList.toggle('hidden', !p); }
}

function starStr(rating) {
  const r = Math.max(0, Math.min(5, parseInt(rating, 10) || 0));
  return '★★★★★'.slice(0, r) + '☆☆☆☆☆'.slice(0, 5 - r);
}

function renderReviews() {
  const list = reviews.filter(r =>
    reviewFilter === 'all' ? true : reviewFilter === 'approved' ? r.approved : !r.approved);
  const el = $('review-list');
  if (!list.length) {
    el.innerHTML = emptyHTML('⭐', reviewFilter === 'pending' ? 'No pending reviews' : 'No reviews yet',
      reviewFilter === 'pending' ? 'New reader reviews will appear here for approval.' : 'Reader reviews will appear here.');
    return;
  }
  el.innerHTML = list.map(r => {
    const novelTitle = (r.novels && r.novels.title) || 'Unknown novel';
    const date = r.created_at ? new Date(r.created_at).toLocaleDateString() : '';
    return `<div class="review-card${r.approved ? '' : ' pending'}">
      <div class="review-head">
        <span class="r-novel">${esc(novelTitle)}</span>
        <span class="r-stars">${starStr(r.rating)}</span>
        <span class="badge ${r.approved ? 'pub' : 'pending'}">${r.approved ? 'Approved' : 'Pending'}</span>
        <span class="r-date">${esc(date)}</span>
      </div>
      <div class="r-by" style="font-size:13px;color:var(--muted);margin-bottom:6px">by ${esc(r.reader_name || 'Anonymous')}</div>
      ${r.comment ? `<div class="review-body">${esc(r.comment)}</div>` : ''}
      <div class="review-actions">
        <button class="btn small" onclick="setReviewApproved('${r.id}', ${r.approved ? 'false' : 'true'})">${r.approved ? '⏳ Unapprove' : '✅ Approve'}</button>
        <button class="btn small" onclick="deleteReview('${r.id}')">🗑️ Delete</button>
      </div>
    </div>`;
  }).join('');
}

async function setReviewApproved(id, val) {
  try {
    await sbPatch('/rest/v1/reviews?id=eq.' + id, { approved: !!val });
    const r = reviews.find(x => x.id === id);
    if (r) r.approved = !!val;
    updateReviewBadge();
    renderReviews();
    toast(val ? 'Review approved — now visible on the site.' : 'Review moved back to pending.');
  } catch (e) { toast('Failed: ' + e.message); }
}

async function deleteReview(id) {
  if (!confirm('Delete this review?')) return;
  try {
    await sbDel('/rest/v1/reviews?id=eq.' + id);
    reviews = reviews.filter(x => x.id !== id);
    updateReviewBadge();
    renderReviews();
    toast('Review deleted.');
  } catch (e) { toast('Failed: ' + e.message); }
}

/* ---------------- init ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  if (!window.ASTSupa) {
    document.body.innerHTML = '<p style="padding:40px">Could not load js/sb.js — check the file exists.</p>';
    return;
  }
  initAuth();
});
