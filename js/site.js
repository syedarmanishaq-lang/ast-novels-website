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

  /* ---------- Supabase (live) with local JSON fallback ---------- */
  var SB = window.ASTSupa;

  /* Normalize a Supabase novels row to the shape the renderers expect. */
  function normNovel(r){
    var n = {
      _id: r.id,
      slug: r.slug,
      title: r.title,
      title_en: r.title_en,
      author: r.author,
      author_en: r.author_en,
      language: r.lang || 'en',
      genre: r.genre,
      description: r.description,
      cover: r.cover_url,
      featured: !!r.featured,
      status: r.status || 'published',
      chapterCount: (r.chapters && r.chapters[0] && r.chapters[0].count) || 0,
      wordCount: r.word_count || 0,
      views: r.views || 0,
      rating_avg: r.rating_avg || 0,
      rating_count: r.rating_count || 0,
      published_year: r.published_year,
      tags: r.tags || []
    };
    if(r.source_type === 'supabase_pdf' && r.source_id){
      n.source = { provider: 'supabase_pdf', path: r.source_id };
    } else if(r.source_type === 'gdrive' && r.source_id){
      n.source = { provider: 'gdrive', fileId: r.source_id };
    } else if(r.source_type === 'url' && r.source_id){
      n.source = { provider: 'url', url: r.source_id };
    }
    return n;
  }

  function sbCatalog(){
    return SB.get('/rest/v1/novels?status=eq.published&select=*,chapters(count)&order=featured.desc,updated_at.desc')
      .then(function(rows){ return rows.map(normNovel); });
  }

  function sbNovel(slug){
    return SB.get('/rest/v1/novels?slug=eq.' + encodeURIComponent(slug) + '&select=*')
      .then(function(rows){
        if(!rows.length || rows[0].status !== 'published') throw new Error('not-found');
        var r = rows[0];
        return SB.get('/rest/v1/chapters?novel_id=eq.' + r.id + '&select=title,content,position,word_count&order=position')
          .then(function(chs){
            var n = normNovel(r);
            n.chapters = chs.map(function(c){ return { title: c.title, text: c.content }; });
            n.chapterCount = chs.length;
            return n;
          });
      });
  }

  /* Load catalog: Supabase first, local JSON fallback (offline/PWA). */
  function loadCatalog(){
    if(!SB) return localCatalog();
    return sbCatalog().catch(function(){ return localCatalog(); });
  }
  function localCatalog(){
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

  /* Full novel (with chapters): Supabase first, local JSON fallback. */
  function loadNovel(slug){
    if(AN.isTrashed(slug)) return Promise.reject(new Error('trashed'));
    var ov = AN.getOverride(slug);
    if(ov && ov.status === 'draft') return Promise.reject(new Error('draft'));
    if(ov && ov.chapters) return Promise.resolve(ov);
    if(SB) return sbNovel(slug).catch(function(){ return localNovel(slug); });
    return localNovel(slug);
  }
  function localNovel(slug){
    return fetchJSON('data/novels/' + slug + '.json');
  }

  /* View counter: server-side via safe RPC + local fallback. */
  function countView(slug, novelId){
    try{
      var k = 'ast_views_' + slug;
      var v = parseInt(localStorage.getItem(k) || '0', 10) || 0;
      localStorage.setItem(k, String(v + 1));
    }catch(e){}
    if(SB && novelId){
      SB.rpc('increment_views', { novel_id: novelId }).catch(function(){});
    }
  }

  /* ---------- card builders ---------- */
  function isUrdu(n){ return n.language === 'ur'; }
  function displayTitle(n){
    return isUrdu(n) ? AN.esc(n.title) : AN.esc(n.title);
  }
  function cardHTML(n){
    var u = isUrdu(n);
    var P = window.ASTPlatform;
    var ratingLine = (P && P.ratingLineHTML(n)) || '';
    var dlBadge = (P && P.isDownloaded(n.slug))
      ? '<span class="book-dl" title="Downloaded for offline">Downloaded &#10003;</span>' : '';
    var shelf = P ? P.getShelf(n.slug) : null;
    var shelfBadge = shelf
      ? '<span class="book-shelf" data-shelfbadge="' + AN.esc(n.slug) + '" title="' + AN.esc(P.shelfLabels[shelf]) + '">' + AN.esc(P.shelfShort[shelf]) + '</span>' : '';
    var shelfBtn = P
      ? '<button type="button" class="shelf-btn" data-shelfbtn="' + AN.esc(n.slug) + '" aria-label="Add to bookshelf" title="Add to bookshelf">+ Shelf</button>' : '';
    return '<a class="book-card reveal" href="novel.html?id=' + AN.esc(n.slug) + '">' +
      '<div class="book-cover"><img src="' + AN.esc(n.cover) + '" alt="Cover of ' + AN.esc(u && n.title_en ? n.title_en : n.title) + '" loading="lazy">' +
      '<span class="book-lang">' + (u ? 'اردو' : 'EN') + '</span>' + dlBadge + shelfBadge + shelfBtn + '</div>' +
      '<div class="book-body">' +
        '<div class="book-title' + (u ? ' urdu' : '') + '">' + displayTitle(n) + '</div>' +
        '<div class="book-author">by ' + AN.esc(n.author) + '</div>' +
        (ratingLine ? '<div class="book-rating">' + ratingLine + '</div>' : '') +
        '<div class="book-meta"><span class="genre">' + AN.esc(n.genre) + '</span>' +
        '<span>' + AN.words(n.wordCount || 0) + ' words</span></div>' +
      '</div></a>';
  }

  /* ---------- bookshelf quick-menu (shared floating menu for card buttons) ---------- */
  var shelfMenuEl = null;
  function closeShelfMenu(){ if(shelfMenuEl){ shelfMenuEl.remove(); shelfMenuEl = null; } }
  function openShelfMenu(btn, slug){
    var P = window.ASTPlatform;
    if(!P) return;
    closeShelfMenu();
    var cur = P.getShelf(slug);
    var m = document.createElement('div');
    m.className = 'shelf-menu';
    m.setAttribute('role', 'menu');
    var html = '';
    P.shelfKeys.forEach(function(k){
      html += '<button type="button" data-sk="' + k + '" class="' + (cur === k ? 'on' : '') + '">' +
        (cur === k ? '&#10003; ' : '') + AN.esc(P.shelfLabels[k]) + '</button>';
    });
    html += '<button type="button" data-sk="" class="rm">Remove from shelves</button>';
    m.innerHTML = html;
    document.body.appendChild(m);
    var r = btn.getBoundingClientRect();
    m.style.top = (r.bottom + window.scrollY + 6) + 'px';
    var left = Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - 200);
    m.style.left = Math.max(window.scrollX + 8, left) + 'px';
    shelfMenuEl = m;
    m.addEventListener('click', function(e){
      var b = e.target.closest ? e.target.closest('button[data-sk]') : null;
      if(!b) return;
      var v = b.getAttribute('data-sk') || null;
      P.setShelf(slug, v);
      closeShelfMenu();
      refreshShelfBadges(slug);
      showToast(v ? ('Added to ' + P.shelfLabels[v]) : 'Removed from shelves');
      // refresh the My Shelves section if present
      if(typeof renderShelvesSection === 'function') renderShelvesSection();
    });
    setTimeout(function(){
      document.addEventListener('click', function away(e){
        if(shelfMenuEl && !shelfMenuEl.contains(e.target)){ closeShelfMenu(); document.removeEventListener('click', away); }
      });
    }, 0);
  }
  function refreshShelfBadges(slug){
    var P = window.ASTPlatform;
    if(!P) return;
    var shelf = P.getShelf(slug);
    document.querySelectorAll('[data-shelfbadge="' + slug + '"]').forEach(function(el){
      if(shelf){
        el.style.display = '';
        el.textContent = P.shelfShort[shelf];
        el.setAttribute('title', P.shelfLabels[shelf]);
      } else {
        el.style.display = 'none';
      }
    });
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest ? e.target.closest('[data-shelfbtn]') : null;
    if(b){
      e.preventDefault();
      e.stopPropagation();
      openShelfMenu(b, b.getAttribute('data-shelfbtn'));
    }
  });
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

  /* ---------- Continue Reading (homepage) ----------
     Reads the position the reader already saves in js/reader.js
     (localStorage key astnovels_progress: {slug: {ch, scroll, pdfPage, at}}).
     Shows only the most recently read novel; hidden when nothing is saved. */
  function renderContinue(novels){
    var sec = document.getElementById('continueSection'),
        box = document.getElementById('continueReading');
    if(!sec || !box) return;
    var all = {};
    try{ all = JSON.parse(localStorage.getItem('astnovels_progress') || '{}'); }catch(e){ all = {}; }
    var best = null;
    Object.keys(all).forEach(function(slug){
      var p = all[slug];
      if(!p || typeof p !== 'object') return;
      if(!best || (p.at || 0) > (best.p.at || 0)) best = { slug: slug, p: p };
    });
    if(!best) return;
    var n = null;
    novels.forEach(function(x){ if(x.slug === best.slug) n = x; });
    if(!n) return;
    var ch = best.p.ch || 0;
    var where = best.p.pdfPage
      ? 'Page ' + best.p.pdfPage
      : 'Chapter ' + (ch + 1) + (n.chapterCount ? ' of ' + n.chapterCount : '');
    var u = isUrdu(n);
    var shelfNote = '';
    if(window.ASTPlatform){
      var sh = window.ASTPlatform.getShelf(n.slug);
      if(sh) shelfNote = ' · ' + AN.esc(window.ASTPlatform.shelfLabels[sh]);
    }
    box.innerHTML =
      '<div class="continue-card">' +
        '<a class="continue-cover" href="read.html?id=' + AN.esc(n.slug) + '&ch=' + ch + '"><img src="' + AN.esc(n.cover) + '" alt="Cover of ' + AN.esc(u && n.title_en ? n.title_en : n.title) + '" loading="lazy"></a>' +
        '<div class="continue-body">' +
          '<div class="continue-label">Continue Reading</div>' +
          '<a class="continue-title' + (u ? ' urdu' : '') + '" href="read.html?id=' + AN.esc(n.slug) + '&ch=' + ch + '">' + AN.esc(n.title) + '</a>' +
          '<div class="continue-meta">by ' + AN.esc(n.author) + ' · ' + AN.esc(where) + shelfNote + '</div>' +
        '</div>' +
        '<a class="btn btn-sm" href="read.html?id=' + AN.esc(n.slug) + '&ch=' + ch + '">Continue &rarr;</a>' +
      '</div>';
    sec.style.display = '';
  }

  /* ---------- Trending (homepage) ----------
     Top novels by readers' local ratings + read counts. Hidden when no signal yet. */
  function renderTrending(novels){
    var sec = document.getElementById('trendSection'),
        grid = document.getElementById('trendGrid');
    if(!sec || !grid || !window.ASTPlatform) return;
    var scored = novels.map(function(n){
      return { n: n, s: window.ASTPlatform.trendingScore(n) };
    }).filter(function(x){ return x.s > 0; });
    if(scored.length < 2) return; // not enough reader signal yet
    scored.sort(function(a, b){ return b.s - a.s; });
    var top = scored.slice(0, 4).map(function(x){ return x.n; });
    grid.innerHTML = top.map(cardHTML).join('');
    sec.style.display = '';
  }

  /* ---------- My Shelves (library section with tabs) ---------- */
  var shelfTab = 'want';
  function renderShelvesSection(catalog){
    var sec = document.getElementById('myShelves'),
        grid = document.getElementById('shelfGrid'),
        empty = document.getElementById('shelfEmpty');
    if(!sec || !grid || !window.ASTPlatform) return;
    var P = window.ASTPlatform;
    var shelves = P.getShelves();
    var tabs = document.querySelectorAll('#shelfTabs .chip');
    tabs.forEach(function(t){
      var k = t.getAttribute('data-v');
      var cnt = (shelves[k] || []).length;
      var lbl = t.querySelector('.cnt');
      if(lbl) lbl.textContent = cnt ? ' (' + cnt + ')' : '';
      t.classList.toggle('on', k === shelfTab);
    });
    var bySlug = {};
    (catalog || []).forEach(function(n){ bySlug[n.slug] = n; });
    var list = (shelves[shelfTab] || []).map(function(s){ return bySlug[s]; }).filter(Boolean);
    grid.innerHTML = list.length ? list.map(cardHTML).join('') : '';
    if(empty){
      empty.style.display = list.length ? 'none' : 'block';
      empty.innerHTML = '<div class="big">This shelf is empty</div><p>Tap <b>+ Shelf</b> on any book cover to shelve it here.</p>';
    }
    sec.style.display = '';
  }

  /* ---------- page renderers ---------- */
  function renderHome(){
    var featEl = document.getElementById('featuredGrid'),
        libEl  = document.getElementById('homeGrid'),
        statEl = document.getElementById('heroStats');
    if(!featEl && !libEl) return;
    loadCatalog().then(function(novels){
      renderContinue(novels);
      renderTrending(novels);
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
        sortSel = document.getElementById('libSort'),
        chips  = document.querySelectorAll('#genreChips .chip'),
        langChips = document.querySelectorAll('#langChips .chip'),
        count  = document.getElementById('libCount'),
        empty  = document.getElementById('libEmpty');
    var genre = 'all', lang = 'all', q = '', sort = 'featured', dlOnly = false;
    var all = [];
    var order = [];

    function sortList(list){
      var P = window.ASTPlatform;
      var arr = list.slice();
      if(sort === 'newest'){
        arr.sort(function(a, b){ return (b.year || 0) - (a.year || 0); });
      } else if(sort === 'rated' && P){
        arr.sort(function(a, b){
          var ra = P.mergedRating(a), rb = P.mergedRating(b);
          var va = ra ? ra.avg + Math.min(ra.count, 10) * 0.05 : -1;
          var vb = rb ? rb.avg + Math.min(rb.count, 10) * 0.05 : -1;
          return vb - va;
        });
      } else if(sort === 'read' && P){
        arr.sort(function(a, b){ return P.totalViews(b) - P.totalViews(a); });
      } else if(order.length){
        var pos = {};
        order.forEach(function(s, i){ pos[s] = i; });
        arr.sort(function(a, b){ return (pos[a.slug] == null ? 1e9 : pos[a.slug]) - (pos[b.slug] == null ? 1e9 : pos[b.slug]); });
      }
      return arr;
    }

    function draw(){
      var P = window.ASTPlatform;
      var list = [];
      all.forEach(function(n){
        if(genre !== 'all' && n.genre !== genre) return;
        if(lang !== 'all' && n.language !== lang) return;
        if(dlOnly && !(P && P.isDownloaded(n.slug))) return;
        if(q){
          var hay = (n.title + ' ' + (n.title_en || '') + ' ' + n.author + ' ' + (n.author_en || '') + ' ' + n.genre).toLowerCase();
          if(hay.indexOf(q) === -1) return;
        }
        list.push(n);
      });
      list = sortList(list);
      var html = '', shown = 0;
      list.forEach(function(n){ html += cardHTML(n); shown++; });
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
    if(sortSel) sortSel.addEventListener('change', function(){ sort = sortSel.value; draw(); });
    var dlChip = document.getElementById('dlOnlyChip');
    if(dlChip) dlChip.addEventListener('click', function(){
      dlOnly = !dlOnly;
      dlChip.classList.toggle('on', dlOnly);
      dlChip.setAttribute('data-v', dlOnly ? 'on' : 'off');
      dlChip.setAttribute('aria-pressed', dlOnly ? 'true' : 'false');
      draw();
    });

    loadCatalog().then(function(novels){
      all = novels;
      order = novels.map(function(n){ return n.slug; });
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
      // My Shelves tabs
      var tabs = document.querySelectorAll('#shelfTabs .chip');
      tabs.forEach(function(t){
        t.addEventListener('click', function(){
          shelfTab = t.getAttribute('data-v');
          renderShelvesSection(all);
        });
      });
      renderShelvesSection(novels);
      draw();
    }).catch(function(){
      grid.innerHTML = '<p class="count-line">Could not load the library. Check your connection and refresh.</p>';
    });
  }

  /* Star rating: ★/☆ from a numeric rating_avg; empty string when unrated. */
  function starsHTML(avg, count){
    avg = parseFloat(avg) || 0;
    if(!(avg > 0) || !(count > 0)) return '';
    var full = Math.round(avg);
    var stars = '';
    for(var i = 1; i <= 5; i++){ stars += (i <= full) ? '★' : '☆'; }
    return '<span class="rating" title="' + avg.toFixed(1) + ' out of 5 from ' + count + ' rating' + (count === 1 ? '' : 's') + '">' +
      '<span class="stars" aria-hidden="true">' + stars + '</span>' +
      '<span class="rating-val">' + avg.toFixed(1) + ' · ' + count + ' rating' + (count === 1 ? '' : 's') + '</span></span>';
  }

  /* Small toast (used for the Share clipboard fallback). */
  function showToast(msg){
    var old = document.querySelector('.toast');
    if(old) old.remove();
    var t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ t.classList.add('show'); }); });
    setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){ t.remove(); }, 400); }, 2600);
  }

  /* Interactive star rating + local reviews for the novel page. */
  function renderRateWidget(slug, novel){
    var el = document.getElementById('rateWidget');
    if(!el || !window.ASTPlatform) return;
    var P = window.ASTPlatform;
    function draw(){
      var mine = P.getMyRating(slug);
      var m = P.mergedRating(novel);
      var btns = '';
      for(var i = 1; i <= 5; i++){
        btns += '<button type="button" data-v="' + i + '" class="' + (i <= mine ? 'lit' : '') + '" aria-label="Rate ' + i + ' star' + (i > 1 ? 's' : '') + '">★</button>';
      }
      el.innerHTML =
        '<div class="rate-widget"><span class="rate-label">Your rating</span>' +
        '<span class="rate-stars">' + btns + '</span>' +
        (m ? '<span class="rate-avg">' + m.avg.toFixed(1) + ' · ' + m.count + ' rating' + (m.count === 1 ? '' : 's') + '</span>'
           : '<span class="rate-avg">Be the first to rate</span>') +
        '</div>';
      var bs = el.querySelectorAll('.rate-stars button');
      for(var j = 0; j < bs.length; j++){
        (function(b){
          b.addEventListener('click', function(){
            P.setRating(slug, parseInt(b.getAttribute('data-v'), 10));
            draw();
            showToast('Thanks — your rating was saved');
          });
        })(bs[j]);
      }
    }
    draw();
  }

  function renderReviews(slug){
    var list = document.getElementById('reviewList'),
        form = document.getElementById('reviewForm');
    if(!list || !form || !window.ASTPlatform) return;
    var P = window.ASTPlatform;
    function draw(){
      var revs = P.getReviews(slug);
      list.innerHTML = revs.length
        ? revs.map(function(r){
            var when = new Date(r.at).toLocaleDateString(undefined, {year:'numeric', month:'short', day:'numeric'});
            return '<div class="review"><div class="review-head"><b>' + AN.esc(r.n) + '</b><span>' + AN.esc(when) + '</span></div>' +
              '<p>' + AN.esc(r.t) + '</p></div>';
          }).join('')
        : '<p class="count-line">No reviews yet — yours could be the first.</p>';
    }
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var rev = P.addReview(slug, document.getElementById('revName').value, document.getElementById('revText').value);
      if(rev){ draw(); form.reset(); showToast('Review posted'); }
    });
    draw();
  }

  function renderNovel(){
    var root = document.getElementById('novelRoot');
    if(!root) return;
    var slug = new URLSearchParams(location.search).get('id');
    if(!slug){ root.innerHTML = '<div class="empty-state"><div class="big">Novel not found</div><p>The link may be broken.</p><p style="margin-top:18px"><a class="btn btn-ghost" href="library.html">Browse library</a></p></div>'; return; }
    loadNovel(slug).then(function(n){
      countView(slug, n._id);
      var u = isUrdu(n);
      var prog = getProgress(slug);
      var read = readChapters(slug);
      var hasSource = !!(n.source && n.source.provider);
      var chapters = n.chapters || [];
      var total = chapters.length;
      var startCh = prog ? prog.ch : 0;

      /* SEO: unique title + description + canonical/OG derived from this novel */
      var pageUrl = 'https://ast-novels.vercel.app/novel.html?id=' + n.slug;
      var seoDesc = 'Read ' + n.title + ' by ' + n.author + ' online free at AST Novels. ' + (n.description || '').slice(0, 120);
      document.title = n.title + ' by ' + n.author + ' — Read Free | AST Novels';
      var md = document.querySelector('meta[name="description"]');
      if(md) md.setAttribute('content', seoDesc);
      var can = document.querySelector('link[rel="canonical"]');
      if(can) can.setAttribute('href', pageUrl);
      function setMeta(sel, attr, val){
        var el = document.querySelector(sel);
        if(el) el.setAttribute(attr, val);
      }
      setMeta('meta[property="og:title"]', 'content', n.title + ' by ' + n.author + ' — AST Novels');
      setMeta('meta[property="og:description"]', 'content', seoDesc);
      setMeta('meta[property="og:url"]', 'content', pageUrl);
      setMeta('meta[property="og:image"]', 'content', 'https://ast-novels.vercel.app/' + n.cover);
      setMeta('meta[name="twitter:title"]', 'content', n.title + ' by ' + n.author + ' — AST Novels');
      setMeta('meta[name="twitter:description"]', 'content', seoDesc);
      var ldObj = {
        '@context':'https://schema.org', '@type':'Book',
        name:n.title, author:{'@type':'Person', name:n.author},
        inLanguage: n.language === 'ur' ? 'ur' : 'en',
        genre:n.genre, description:(n.description || '').slice(0, 300),
        image:'https://ast-novels.vercel.app/' + n.cover,
        url:pageUrl,
        bookFormat:'https://schema.org/EBook',
        isAccessibleForFree:true,
        publisher:{'@type':'Organization', name:'AST Family Studio', url:'https://ast-novels.vercel.app/'}
      };
      if(n.year){ ldObj.datePublished = String(n.year); }
      if(n.rating_count > 0 && n.rating_avg > 0){
        ldObj.aggregateRating = {
          '@type':'AggregateRating',
          ratingValue: Number(n.rating_avg).toFixed(1),
          ratingCount: n.rating_count,
          bestRating: '5'
        };
      }
      var ld = document.createElement('script');
      ld.type = 'application/ld+json';
      ld.textContent = JSON.stringify(ldObj);
      document.head.appendChild(ld);
      /* BreadcrumbList for richer search results */
      var bc = document.createElement('script');
      bc.type = 'application/ld+json';
      bc.textContent = JSON.stringify({
        '@context':'https://schema.org', '@type':'BreadcrumbList',
        itemListElement:[
          {'@type':'ListItem', position:1, name:'Home', item:'https://ast-novels.vercel.app/'},
          {'@type':'ListItem', position:2, name:'Library', item:'https://ast-novels.vercel.app/library.html'},
          {'@type':'ListItem', position:3, name:n.title + ' by ' + n.author, item:pageUrl}
        ]
      });
      document.head.appendChild(bc);
      /* FAQPage per novel — original Q&A for richer results (beats thin competitor pages) */
      (function(){
        var faqQs = [
          {'q':'Is ' + n.title + ' free to read online?', 'a':'Yes. ' + n.title + ' by ' + n.author + ' is completely free to read online at AST Novels — full text in a beautiful reader, no account or signup needed.'},
          {'q':'Who wrote ' + n.title + '?', 'a':n.title + ' was written by ' + n.author + (n.year ? ' and first published in ' + n.year + '.' : '.') + ' Read it free on AST Novels.'},
          {'q':'Do I need an account to read ' + n.title + '?', 'a':'No. Unlike many free-reading sites, AST Novels never asks for an account — open ' + n.title + ' and start reading instantly, on any device.'}
        ];
        if(n.language === 'ur'){
          faqQs.push({'q':'Is ' + n.title + ' in original Urdu script?', 'a':'Yes. ' + n.title + ' is presented in original Urdu script on AST Novels, exactly as written — not transliterated into Roman Urdu.'});
        }
        if(total > 1){
          faqQs.push({'q':'How many chapters does ' + n.title + ' have?', 'a':n.title + ' has ' + total + ' chapters on AST Novels, all free to read with your progress saved in your browser.'});
        }
        var faq = document.createElement('script');
        faq.type = 'application/ld+json';
        faq.textContent = JSON.stringify({
          '@context':'https://schema.org', '@type':'FAQPage',
          mainEntity: faqQs.map(function(x){ return {'@type':'Question', name:x.q, acceptedAnswer:{'@type':'Answer', text:x.a}}; })
        });
        document.head.appendChild(faq);
      })();

      var chRows = hasSource && !total
        ? '<a class="chapter-row" href="read.html?id=' + AN.esc(n.slug) + '&ch=0">' +
          '<span class="ch-num">▶</span>' +
          '<span class="ch-title">Read now</span>' +
          '<span class="ch-words">External file</span>' +
          '<span class="ch-go">&rarr;</span></a>'
        : chapters.map(function(c, i){
        var done = read.indexOf(i) !== -1;
        var wc = String(c.text || '').trim().split(/\s+/).filter(Boolean).length;
        var P0 = window.ASTPlatform;
        var chTime = P0 ? P0.fmtShortTime(P0.readTimeMin(wc, n.language)) : '';
        return '<a class="chapter-row' + (done ? ' done' : '') + '" href="read.html?id=' + AN.esc(n.slug) + '&ch=' + i + '">' +
          '<span class="ch-num">' + (i + 1) + '</span>' +
          '<span class="ch-title' + (u ? ' urdu' : '') + '">' + AN.esc(c.title || ('Chapter ' + (i + 1))) + '</span>' +
          '<span class="ch-words">' + AN.words(wc) + ' words' + (chTime ? ' · ' + chTime : '') + '</span>' +
          (done ? '<span class="ch-check" title="Read">&#10003;</span>' : '<span class="ch-go">&rarr;</span>') +
        '</a>';
      }).join('');

      var P1 = window.ASTPlatform;
      var totalWords = countWords(chapters);
      var readTimeTag = (P1 && totalWords > 0)
        ? '<span class="tag" title="Estimated reading time">' + P1.fmtReadTime(P1.readTimeMin(totalWords, n.language)).replace(/^about /, '~') + '</span>' : '';
      var curShelf = P1 ? P1.getShelf(n.slug) : null;
      var shelfChips = P1 ? P1.shelfKeys.map(function(k){
        return '<button type="button" class="chip' + (curShelf === k ? ' on' : '') + '" data-shelfchip="' + k + '">' + AN.esc(P1.shelfLabels[k]) + '</button>';
      }).join('') : '';

      root.innerHTML =
        '<div class="novel-hero">' +
          '<div class="novel-cover"><img src="' + AN.esc(n.cover) + '" alt="Cover of ' + AN.esc(n.title) + '"></div>' +
          '<div class="novel-info">' +
            '<div class="kicker">' + AN.esc(n.genre) + ' · ' + (u ? 'Urdu' : 'English') + '</div>' +
            '<h1 class="' + (u ? 'urdu' : '') + '">' + AN.esc(n.title) + '</h1>' +
            '<div class="author">by <b>' + AN.esc(n.author) + '</b></div>' +
            starsHTML(n.rating_avg, n.rating_count) +
            '<div id="rateWidget"></div>' +
            '<div class="tag-row">' +
              '<span class="tag">' + (hasSource && !total ? 'External file' : total + ' chapter' + (total === 1 ? '' : 's')) + '</span>' +
              (total ? '<span class="tag">' + AN.words(countWords(chapters)) + ' words</span>' : '') +
              readTimeTag +
              (n.sample ? '<span class="tag accent">Sample story</span>' : '') +
            '</div>' +
            '<p class="novel-desc' + (u ? ' urdu' : '') + '">' + AN.esc(n.description || '') + '</p>' +
            (shelfChips ? '<div class="shelf-row"><span class="rate-label">Bookshelf</span><div class="chip-row" id="shelfChips">' + shelfChips + '</div></div>' : '') +
            '<div class="novel-actions">' +
              '<a class="btn" href="read.html?id=' + AN.esc(n.slug) + '&ch=' + startCh + '">' +
                (prog ? 'Continue reading — Ch. ' + (startCh + 1) : 'Start reading') + ' &rarr;</a>' +
              '<a class="btn btn-ghost" href="library.html">All novels</a>' +
              '<button class="btn btn-ghost" id="dlBtn" type="button">Download</button>' +
              '<button class="btn btn-ghost" id="shareBtn" type="button">Share</button>' +
              '<a class="btn btn-ghost" target="_blank" rel="noopener" href="https://wa.me/?text=' +
                encodeURIComponent('Read ' + n.title + ' by ' + n.author + ' free on AST Novels: ' + pageUrl) + '">WhatsApp</a>' +
            '</div>' +
            (prog ? '<div class="progress-note">You left off at chapter ' + (prog.ch + 1) + ' of ' + total + '.</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="chapter-section"><h2 class="serif sec-title" style="font-size:30px;margin-bottom:18px">Chapters</h2>' +
        '<div class="chapter-list">' + chRows + '</div></div>' +
        '<div class="chapter-section" id="reviewsSection"><h2 class="serif sec-title" style="font-size:30px;margin-bottom:6px">Reader reviews</h2>' +
        '<p class="sec-sub" style="margin-bottom:20px">What did you think of this book? Reviews are saved on this device only.</p>' +
        '<div id="reviewList"></div>' +
        '<form id="reviewForm" class="review-form">' +
          '<input id="revName" type="text" maxlength="40" placeholder="Your name (optional)" aria-label="Your name" autocomplete="name">' +
          '<textarea id="revText" rows="3" maxlength="600" placeholder="Write your review…" aria-label="Your review" required></textarea>' +
          '<button class="btn btn-sm" type="submit">Post review</button>' +
        '</form></div>' +
        '<div id="relatedNovels"></div>';

      /* Related novels: same author first, then same genre/language — internal linking */
      loadCatalog().then(function(all){
        var rel = [];
        var i, m;
        for(i = 0; i < all.length && rel.length < 4; i++){
          m = all[i];
          if(m.slug !== n.slug && m.author === n.author) rel.push(m);
        }
        for(i = 0; i < all.length && rel.length < 4; i++){
          m = all[i];
          if(m.slug !== n.slug && m.author !== n.author && m.genre === n.genre && rel.indexOf(m) < 0) rel.push(m);
        }
        for(i = 0; i < all.length && rel.length < 4; i++){
          m = all[i];
          if(m.slug !== n.slug && rel.indexOf(m) < 0) rel.push(m);
        }
        if(rel.length){
          var relHTML = '<div class="chapter-section"><h2 class="serif sec-title" style="font-size:30px;margin-bottom:18px">You may also like</h2>' +
            '<div class="book-grid">' + rel.map(cardHTML).join('') + '</div></div>';
          var relEl = document.getElementById('relatedNovels');
          if(relEl) relEl.innerHTML = relHTML;
        }
      }).catch(function(){});

      /* Platform: interactive rating + local reviews. */
      renderRateWidget(n.slug, n);
      renderReviews(n.slug);

      /* Bookshelf selector chips on the novel page. */
      (function(){
        var P = window.ASTPlatform;
        var chips = document.querySelectorAll('#shelfChips [data-shelfchip]');
        if(!P || !chips.length) return;
        chips.forEach(function(c){
          c.addEventListener('click', function(){
            var v = c.getAttribute('data-shelfchip');
            var cur = P.getShelf(n.slug);
            P.setShelf(n.slug, cur === v ? null : v); // tap again to remove
            var now = P.getShelf(n.slug);
            chips.forEach(function(x){ x.classList.toggle('on', x.getAttribute('data-shelfchip') === now); });
            showToast(now ? ('Added to ' + P.shelfLabels[now]) : 'Removed from shelves');
          });
        });
      })();

      /* Offline download: cache the novel's data + cover via the Cache API. */
      (function(){
        var P = window.ASTPlatform;
        var dlBtn = document.getElementById('dlBtn');
        if(!dlBtn || !P) return;
        function paint(){
          var done = P.isDownloaded(n.slug);
          dlBtn.textContent = done ? 'Downloaded ✓' : 'Download';
          dlBtn.classList.toggle('dl-on', done);
        }
        paint();
        dlBtn.addEventListener('click', function(){
          dlBtn.disabled = true;
          dlBtn.textContent = 'Saving…';
          if(P.isDownloaded(n.slug)){
            P.removeDownload(n.slug).then(function(){ dlBtn.disabled = false; paint(); showToast('Removed from downloads'); });
          } else {
            P.downloadNovel(n.slug, n).then(function(){
              dlBtn.disabled = false; paint(); showToast('Saved for offline reading');
            }).catch(function(){
              dlBtn.disabled = false; paint(); showToast('Could not save — check your connection');
            });
          }
        });
      })();

      /* Share: Web Share API with clipboard fallback + toast. */
      var shareBtn = document.getElementById('shareBtn');
      if(shareBtn){
        shareBtn.addEventListener('click', function(){
          var shareData = { title: n.title + ' by ' + n.author + ' — AST Novels', text: 'Read ' + n.title + ' by ' + n.author + ' free on AST Novels.', url: pageUrl };
          function copyFallback(){
            function done(){ showToast('Link copied to clipboard'); }
            if(navigator.clipboard && navigator.clipboard.writeText){
              navigator.clipboard.writeText(pageUrl).then(done).catch(function(){ legacyCopy(); });
            } else { legacyCopy(); }
            function legacyCopy(){
              var ta = document.createElement('textarea');
              ta.value = pageUrl;
              ta.style.position = 'fixed'; ta.style.opacity = '0';
              document.body.appendChild(ta);
              ta.select();
              try{ document.execCommand('copy'); done(); }
              catch(e){ showToast('Copy this link: ' + pageUrl); }
              ta.remove();
            }
          }
          if(navigator.share){
            navigator.share(shareData).catch(function(){ /* user dismissed — no fallback needed */ });
          } else {
            copyFallback();
          }
        });
      }
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
