/* AST Novels — catalog loading + home/library/novel rendering. */
(function(){
  'use strict';
  var AN = window.ASTNovels;

  function fetchJSON(url){
    return fetch(url, {cache:'no-cache'}).then(function(r){
      if(!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  /* Load catalog, applying admin localStorage overrides (staged edits).
     Public view: drafts and trashed novels are hidden. */
  function loadCatalog(){
    return fetchJSON('data/novels/index.json').then(function(list){
      var ov = AN.listOverrides();
      var trashed = AN.listTrash();
      var out = [];
      list.forEach(function(n){
        if(trashed[n.slug]) return;
        var m = ov[n.slug] ? mergeMeta(n, ov[n.slug]) : n;
        var status = (ov[n.slug] && ov[n.slug].status) || 'published';
        if(status === 'draft') return;
        out.push(m);
      });
      Object.keys(ov).forEach(function(k){
        if(k === '__deleted__') return;
        var isNew = !list.some(function(n){ return n.slug === k; });
        if(isNew && !trashed[k] && ov[k].status !== 'draft') out.push(stripChapters(ov[k]));
      });
      return out;
    });
  }
  function mergeMeta(base, o){
    var m = Object.assign({}, base);
    ['title','title_en','author','language','genre','description','cover','featured','status'].forEach(function(k){
      if(o[k] !== undefined) m[k] = o[k];
    });
    if(o.chapters){ m.chapterCount = o.chapters.length; m.wordCount = countWords(o.chapters); }
    return m;
  }
  function stripChapters(o){
    var m = {};
    ['slug','title','title_en','author','language','genre','description','cover','featured','status'].forEach(function(k){ m[k] = o[k]; });
    m.chapterCount = (o.chapters || []).length;
    m.wordCount = countWords(o.chapters || []);
    return m;
  }
  function countWords(chs){
    var w = 0;
    chs.forEach(function(c){ w += String(c.text || '').trim().split(/\s+/).filter(Boolean).length; });
    return w;
  }

  /* Full novel (with chapters), honoring overrides.
     Drafts and trashed novels are not publicly readable. */
  function loadNovel(slug){
    if(AN.isTrashed(slug)) return Promise.reject(new Error('trashed'));
    var ov = AN.getOverride(slug);
    if(ov && ov.status === 'draft') return Promise.reject(new Error('draft'));
    if(ov && ov.chapters) return Promise.resolve(ov);
    return fetchJSON('data/novels/' + slug + '.json');
  }

  /* Per-novel view counter (localStorage; shown in admin dashboard). */
  function countView(slug){
    try{
      var k = 'ast_views_' + slug;
      var v = parseInt(localStorage.getItem(k) || '0', 10) || 0;
      localStorage.setItem(k, String(v + 1));
    }catch(e){}
  }

  /* ---------- card builders ---------- */
  function isUrdu(n){ return n.language === 'ur'; }
  function displayTitle(n){
    return isUrdu(n) ? AN.esc(n.title) : AN.esc(n.title);
  }
  function cardHTML(n){
    var u = isUrdu(n);
    return '<a class="book-card reveal" href="novel.html?id=' + AN.esc(n.slug) + '">' +
      '<div class="book-cover"><img src="' + AN.esc(n.cover) + '" alt="Cover of ' + AN.esc(u && n.title_en ? n.title_en : n.title) + '" loading="lazy">' +
      '<span class="book-lang">' + (u ? 'اردو' : 'EN') + '</span></div>' +
      '<div class="book-body">' +
        '<div class="book-title' + (u ? ' urdu' : '') + '">' + displayTitle(n) + '</div>' +
        '<div class="book-author">by ' + AN.esc(n.author) + '</div>' +
        '<div class="book-meta"><span class="genre">' + AN.esc(n.genre) + '</span>' +
        '<span>' + AN.words(n.wordCount || 0) + ' words</span></div>' +
      '</div></a>';
  }
  function featHTML(n){
    var u = isUrdu(n);
    var desc = AN.esc(n.description || '');
    return '<a class="feat-card reveal" href="novel.html?id=' + AN.esc(n.slug) + '">' +
      '<img src="' + AN.esc(n.cover) + '" alt="Cover of ' + AN.esc(u && n.title_en ? n.title_en : n.title) + '" loading="lazy">' +
      '<div><h3 class="' + (u ? 'urdu' : '') + '">' + displayTitle(n) + '</h3>' +
      '<div class="by">by ' + AN.esc(n.author) + ' · ' + AN.esc(n.genre) + ' · ' + AN.words(n.wordCount || 0) + ' words</div>' +
      '<p class="' + (u ? 'urdu' : '') + '">' + desc + '</p>' +
      '<div class="read-link">Read now &rarr;</div></div></a>';
  }

  /* ---------- reading progress (localStorage) ---------- */
  function getProgress(slug){
    try{ return JSON.parse(localStorage.getItem('astnovels_progress') || '{}')[slug] || null; }
    catch(e){ return null; }
  }
  function readChapters(slug){
    try{ return JSON.parse(localStorage.getItem('astnovels_read') || '{}')[slug] || []; }
    catch(e){ return []; }
  }

  /* ---------- page renderers ---------- */
  function renderHome(){
    var featEl = document.getElementById('featuredGrid'),
        libEl  = document.getElementById('homeGrid'),
        statEl = document.getElementById('heroStats');
    if(!featEl && !libEl) return;
    loadCatalog().then(function(novels){
      var feat = novels.filter(function(n){ return n.featured; });
      if(featEl) featEl.innerHTML = feat.length ? feat.map(featHTML).join('') : '<p class="count-line">No featured novels yet.</p>';
      if(libEl){
        var rest = novels.filter(function(n){ return !n.featured; });
        var show = (feat.length ? [] : novels).concat(rest).slice(0, 8);
        libEl.innerHTML = show.length ? show.map(cardHTML).join('') : '<p class="count-line">The library is growing — check back soon.</p>';
      }
      if(statEl){
        var words = novels.reduce(function(a,n){ return a + (n.wordCount || 0); }, 0);
        statEl.innerHTML =
          '<div><b>' + novels.length + '</b><span>Novels</span></div>' +
          '<div><b>' + AN.words(words) + '</b><span>Words</span></div>' +
          '<div><b>2</b><span>Languages</span></div>';
      }
    }).catch(function(){
      if(featEl) featEl.innerHTML = '<p class="count-line">Could not load the library. Check your connection and refresh.</p>';
    });
  }

  function renderLibrary(){
    var grid = document.getElementById('libraryGrid');
    if(!grid) return;
    var search = document.getElementById('libSearch'),
        chips  = document.querySelectorAll('#genreChips .chip'),
        langChips = document.querySelectorAll('#langChips .chip'),
        count  = document.getElementById('libCount'),
        empty  = document.getElementById('libEmpty');
    var genre = 'all', lang = 'all', q = '';
    var all = [];

    function draw(){
      var shown = 0, html = '';
      all.forEach(function(n){
        if(genre !== 'all' && n.genre !== genre) return;
        if(lang !== 'all' && n.language !== lang) return;
        if(q){
          var hay = (n.title + ' ' + (n.title_en || '') + ' ' + n.author + ' ' + (n.author_en || '') + ' ' + n.genre).toLowerCase();
          if(hay.indexOf(q) === -1) return;
        }
        html += cardHTML(n); shown++;
      });
      grid.innerHTML = html;
      if(count) count.textContent = shown + ' of ' + all.length + ' novels';
      if(empty) empty.style.display = shown ? 'none' : 'block';
    }
    function setChip(list, val, cb){
      list.forEach(function(c){
        c.classList.toggle('on', c.getAttribute('data-v') === val);
      });
      cb(val); draw();
    }
    chips.forEach(function(c){ c.addEventListener('click', function(){ setChip(chips, c.getAttribute('data-v'), function(v){ genre = v; }); }); });
    langChips.forEach(function(c){ c.addEventListener('click', function(){ setChip(langChips, c.getAttribute('data-v'), function(v){ lang = v; }); }); });
    if(search) search.addEventListener('input', function(){ q = search.value.trim().toLowerCase(); draw(); });

    loadCatalog().then(function(novels){
      all = novels;
      // build genre chips from data
      var genres = {};
      novels.forEach(function(n){ genres[n.genre] = true; });
      var gc = document.getElementById('genreChips');
      if(gc){
        var html = '<button class="chip on" data-v="all">All</button>';
        Object.keys(genres).sort().forEach(function(g){ html += '<button class="chip" data-v="' + AN.esc(g) + '">' + AN.esc(g) + '</button>'; });
        gc.innerHTML = html;
        chips = gc.querySelectorAll('.chip');
        chips.forEach(function(c){ c.addEventListener('click', function(){ setChip(chips, c.getAttribute('data-v'), function(v){ genre = v; }); }); });
      }
      draw();
    }).catch(function(){
      grid.innerHTML = '<p class="count-line">Could not load the library. Check your connection and refresh.</p>';
    });
  }

  function renderNovel(){
    var root = document.getElementById('novelRoot');
    if(!root) return;
    var slug = new URLSearchParams(location.search).get('id');
    if(!slug){ root.innerHTML = '<div class="empty-state"><div class="big">Novel not found</div><p>The link may be broken.</p><p style="margin-top:18px"><a class="btn btn-ghost" href="library.html">Browse library</a></p></div>'; return; }
    loadNovel(slug).then(function(n){
      countView(slug);
      var u = isUrdu(n);
      var prog = getProgress(slug);
      var read = readChapters(slug);
      var hasSource = !!(n.source && n.source.provider);
      var chapters = n.chapters || [];
      var total = chapters.length;
      var startCh = prog ? prog.ch : 0;

      /* SEO: dynamic title + JSON-LD Book */
      document.title = n.title + ' by ' + n.author + ' — AST Novels';
      var md = document.querySelector('meta[name="description"]');
      if(md) md.setAttribute('content', 'Read ' + n.title + ' by ' + n.author + ' online free at AST Novels. ' + (n.description || '').slice(0, 120));
      var ld = document.createElement('script');
      ld.type = 'application/ld+json';
      ld.textContent = JSON.stringify({
        '@context':'https://schema.org', '@type':'Book',
        name:n.title, author:{'@type':'Person', name:n.author},
        inLanguage: n.language === 'ur' ? 'ur' : 'en',
        genre:n.genre, description:n.description,
        image:'https://ast-novels.vercel.app/' + n.cover,
        url:'https://ast-novels.vercel.app/novel.html?id=' + n.slug
      });
      document.head.appendChild(ld);

      var chRows = hasSource && !total
        ? '<a class="chapter-row" href="read.html?id=' + AN.esc(n.slug) + '&ch=0">' +
          '<span class="ch-num">▶</span>' +
          '<span class="ch-title">Read now</span>' +
          '<span class="ch-words">External file</span>' +
          '<span class="ch-go">&rarr;</span></a>'
        : chapters.map(function(c, i){
        var done = read.indexOf(i) !== -1;
        var wc = String(c.text || '').trim().split(/\s+/).filter(Boolean).length;
        return '<a class="chapter-row' + (done ? ' done' : '') + '" href="read.html?id=' + AN.esc(n.slug) + '&ch=' + i + '">' +
          '<span class="ch-num">' + (i + 1) + '</span>' +
          '<span class="ch-title' + (u ? ' urdu' : '') + '">' + AN.esc(c.title || ('Chapter ' + (i + 1))) + '</span>' +
          '<span class="ch-words">' + AN.words(wc) + ' words</span>' +
          (done ? '<span class="ch-check" title="Read">&#10003;</span>' : '<span class="ch-go">&rarr;</span>') +
        '</a>';
      }).join('');

      root.innerHTML =
        '<div class="novel-hero">' +
          '<div class="novel-cover"><img src="' + AN.esc(n.cover) + '" alt="Cover of ' + AN.esc(n.title) + '"></div>' +
          '<div class="novel-info">' +
            '<div class="kicker">' + AN.esc(n.genre) + ' · ' + (u ? 'Urdu' : 'English') + '</div>' +
            '<h1 class="' + (u ? 'urdu' : '') + '">' + AN.esc(n.title) + '</h1>' +
            '<div class="author">by <b>' + AN.esc(n.author) + '</b></div>' +
            '<div class="tag-row">' +
              '<span class="tag">' + (hasSource && !total ? 'External file' : total + ' chapter' + (total === 1 ? '' : 's')) + '</span>' +
              (total ? '<span class="tag">' + AN.words(countWords(chapters)) + ' words</span>' : '') +
              (n.sample ? '<span class="tag accent">Sample story</span>' : '') +
            '</div>' +
            '<p class="novel-desc' + (u ? ' urdu' : '') + '">' + AN.esc(n.description || '') + '</p>' +
            '<div class="novel-actions">' +
              '<a class="btn" href="read.html?id=' + AN.esc(n.slug) + '&ch=' + startCh + '">' +
                (prog ? 'Continue reading — Ch. ' + (startCh + 1) : 'Start reading') + ' &rarr;</a>' +
              '<a class="btn btn-ghost" href="library.html">All novels</a>' +
            '</div>' +
            (prog ? '<div class="progress-note">You left off at chapter ' + (prog.ch + 1) + ' of ' + total + '.</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="chapter-section"><h2 class="serif sec-title" style="font-size:30px;margin-bottom:18px">Chapters</h2>' +
        '<div class="chapter-list">' + chRows + '</div></div>';
    }).catch(function(){
      root.innerHTML = '<div class="empty-state"><div class="big">Could not load this novel</div><p>Check your connection and try again.</p><p style="margin-top:18px"><a class="btn btn-ghost" href="library.html">Browse library</a></p></div>';
    });
  }

  document.addEventListener('DOMContentLoaded', function(){
    renderHome();
    renderLibrary();
    renderNovel();
  });

  window.ASTNovelsSite = { loadCatalog: loadCatalog, loadNovel: loadNovel, getProgress: getProgress, readChapters: readChapters, countWords: countWords };
})();
