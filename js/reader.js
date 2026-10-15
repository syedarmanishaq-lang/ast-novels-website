/* AST Novels — premium reader: themes, font size, RTL, bookmarks, progress.
   External sources: novels can live on Google Drive or a direct URL.
   Privacy: the novel JSON stores ONLY a Drive file ID (never a full URL).
   This script builds the Google API request at runtime, so readers only ever
   see read.html?id=xyz — the Drive location never appears in page HTML,
   and readers are never redirected to Drive. */
(function(){
  'use strict';
  var AN = window.ASTNovels, Site = null;

  /* ------------------------------------------------------------------
     DRIVE_API_KEY — Luffy: paste your Google Drive API key here.
     Free: Google Cloud Console → enable "Google Drive API" →
     Credentials → Create API key. Restrict the key to the Drive API
     and to your domain (ast-novels.vercel.app).
     Only needed for novels whose source is a Google Drive file.
     Drive share setting must be "Anyone with the link".
  ------------------------------------------------------------------ */
  var DRIVE_API_KEY = '';

  var PDFJS_LIBS = [
    { js: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
      worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js' },
    { js: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
      worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js' }
  ];

  var store = {
    get: function(k, d){ try{ var v = localStorage.getItem('astnovels_' + k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
    set: function(k, v){ try{ localStorage.setItem('astnovels_' + k, JSON.stringify(v)); }catch(e){} }
  };

  function para(text){
    return String(text || '').split(/\n\s*\n/).map(function(p){
      return '<p>' + AN.esc(p.trim()).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  /* ---------- external sources ---------- */
  function loadPdfJs(){
    return new Promise(function(resolve, reject){
      if(window.pdfjsLib) return resolve(window.pdfjsLib);
      var libs = PDFJS_LIBS.slice();
      function attempt(){
        var lib = libs.shift();
        if(!lib) return reject(new Error('pdfjs-load'));
        var s = document.createElement('script');
        s.src = lib.js;
        s.onload = function(){
          try{ window.pdfjsLib.GlobalWorkerOptions.workerSrc = lib.worker; }catch(e){}
          resolve(window.pdfjsLib);
        };
        s.onerror = function(){ s.remove(); attempt(); };
        document.head.appendChild(s);
      }
      attempt();
    });
  }

  function isPdfBytes(buf){
    var b = new Uint8Array(buf.slice(0, 5));
    return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
  }

  /* Split plain text into chapters on common headings; fallback: one chapter. */
  function textToChapters(text, fallbackTitle){
    var t = String(text || '').replace(/\r\n?/g, '\n');
    // strip obvious boilerplate headers
    t = t.replace(/^[\s\S]{0,2000}?(\n\n(?=[A-Z]))/, function(m){ return m; });
    var lines = t.split('\n');
    var chs = [], cur = null;
    var headRe = /^\s*(chapter|ch\.?|باب|حصہ)\s*[\dIVXLC]+.*$/i;
    lines.forEach(function(ln){
      if(headRe.test(ln) && ln.trim().length < 80){
        if(cur) chs.push(cur);
        cur = { title: ln.trim(), text: '' };
      } else if(cur){
        cur.text += ln + '\n';
      } else {
        if(!cur) cur = { title: fallbackTitle, text: '' };
        cur.text += ln + '\n';
      }
    });
    if(cur) chs.push(cur);
    chs = chs.filter(function(c){ return c.text.trim().length > 0; });
    if(!chs.length) chs = [{ title: fallbackTitle, text: t }];
    chs.forEach(function(c){ c.text = c.text.replace(/\n{3,}/g, '\n\n').trim(); });
    return chs;
  }

  function maybeJsonChapters(text){
    try{
      var o = JSON.parse(text);
      if(o && Array.isArray(o.chapters) && o.chapters.length) return o.chapters;
    }catch(e){}
    return null;
  }

  /* Resolve a novel's external source -> {kind:'text', chapters} or {kind:'pdf', data}. */
  function resolveSource(n){
    var src = n.source;
    if(!src || !src.provider) return Promise.resolve(null);
    var url, label;
    if(src.provider === 'gdrive'){
      if(!DRIVE_API_KEY) return Promise.reject(new Error('nodrivekey'));
      // NOTE: only the file ID is stored; the full request URL is built here at runtime.
      url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(src.fileId) +
            '?alt=media&key=' + encodeURIComponent(DRIVE_API_KEY);
      label = 'Google Drive';
    } else if(src.provider === 'url'){
      url = src.url;
      label = 'linked file';
    } else if(src.provider === 'supabase_pdf'){
      // PDF/TXT uploaded to the Supabase "books" bucket via the admin panel.
      url = (window.ASTSupa ? window.ASTSupa.publicUrl('books', src.path) : src.path);
      label = 'library file';
    } else {
      return Promise.resolve(null);
    }
    return fetch(url).then(function(r){
      if(!r.ok) throw new Error('fetch-' + r.status);
      var ct = (r.headers.get('content-type') || '').toLowerCase();
      if(ct.indexOf('pdf') !== -1){
        return r.arrayBuffer().then(function(buf){ return { kind: 'pdf', data: buf }; });
      }
      // peek at bytes to detect PDF even when content-type lies
      return r.arrayBuffer().then(function(buf){
        if(isPdfBytes(buf)) return { kind: 'pdf', data: buf };
        var text = new TextDecoder('utf-8').decode(buf);
        var jc = maybeJsonChapters(text);
        if(jc) return { kind: 'text', chapters: jc };
        return { kind: 'text', chapters: textToChapters(text, n.title) };
      });
    }).catch(function(err){
      if(err.message === 'nodrivekey' || err.message === 'pdfjs-load') throw err;
      throw new Error('source-unreachable');
    });
  }

  function sourceErrorHTML(n){
    var msg;
    if(!DRIVE_API_KEY && n.source && n.source.provider === 'gdrive'){
      msg = 'This novel is hosted on Google Drive and needs a Drive API key to load inside the reader. ' +
            'The site owner can add one in <code>js/reader.js</code> (see the Publishing guide in the admin panel).';
    } else {
      msg = 'This novel could not be loaded from its external source right now. ' +
            'Check your connection and try again. (The file must be shared as “Anyone with the link”.)';
    }
    return '<div class="empty-state"><div class="big">Could not load this novel</div><p>' + msg + '</p>' +
      '<p style="margin-top:18px"><a class="btn btn-ghost" href="novel.html?id=' + AN.esc(n.slug) + '">Back to novel</a></p></div>';
  }

  document.addEventListener('DOMContentLoaded', function(){
    Site = window.ASTNovelsSite;
    var root = document.getElementById('readerRoot');
    if(!root) return;
    var slug = new URLSearchParams(location.search).get('id');
    if(!slug){ location.href = 'library.html'; return; }
    var startCh = parseInt(new URLSearchParams(location.search).get('ch') || '0', 10) || 0;

    Site.loadNovel(slug).then(function(n){
      var u0 = n.language === 'ur';
      // loading indicator while external sources resolve
      root.innerHTML = '<div class="empty-state"><div class="big">Opening…</div><p>Preparing your book.</p></div>';
      return resolveSource(n).then(function(ext){
        if(ext && ext.kind === 'pdf'){
          startPdfReader(n, ext.data);
          return;
        }
        if(ext && ext.kind === 'text'){
          n = Object.assign({}, n, { chapters: ext.chapters });
        }
        startTextReader(n);
      }, function(err){
        root.innerHTML = sourceErrorHTML(n);
      });
    }).catch(function(){
      root.innerHTML = '<div class="empty-state"><div class="big">Could not open this novel</div><p>Check your connection and try again.</p><p style="margin-top:18px"><a class="btn btn-ghost" href="library.html">Back to library</a></p></div>';
    });
  });

  /* ================= text-mode reader (native chapters) ================= */
  function startTextReader(n){
    var root = document.getElementById('readerRoot');
    root.innerHTML = '';
    var slug = n.slug;
    var params = new URLSearchParams(location.search);
    var startCh = parseInt(params.get('ch') || '0', 10) || 0;
    var u = n.language === 'ur';
    var ch = Math.min(Math.max(startCh, 0), n.chapters.length - 1);
    var theme = store.get('reader_theme', 'day');
    var fsize = store.get('reader_font', 19);
    /* 4 reading themes: light(day) / sepia / dark / night-black(night). Stored values stay compatible. */
    var THEMES = ['day', 'sepia', 'dark', 'night'];
    if(THEMES.indexOf(theme) === -1) theme = 'day';
    /* line spacing: compact → normal → relaxed */
    var LH_STEPS = [1.6, 1.9, 2.2];
    var LH_NAMES = { '1.6': 'Compact', '1.9': 'Normal', '2.2': 'Relaxed' };
    var lh = store.get('reader_lineheight', 1.9);
    if(LH_STEPS.indexOf(lh) === -1) lh = 1.9;

      /* reader shell */
      var shell = document.createElement('div');
      shell.className = 'reader';
      shell.setAttribute('data-theme', theme);
      shell.innerHTML =
        '<div class="progress-track" id="rProg"></div>' +
        '<div class="reader-bar"><div class="reader-bar-inner">' +
          '<a class="back" href="novel.html?id=' + AN.esc(n.slug) + '">&larr; <span>Novel</span></a>' +
          '<div class="r-title" id="rTitle"></div>' +
          '<div class="reader-tools">' +
            '<button class="tool-btn" id="tMinus" aria-label="Smaller text" title="Smaller text">A&minus;</button>' +
            '<button class="tool-btn" id="tPlus" aria-label="Larger text" title="Larger text">A+</button>' +
            '<button class="tool-btn" id="tLH" aria-label="Line spacing" title="Line spacing">&#8801;</button>' +
            '<button class="tool-btn" id="tDay" aria-label="Light theme" title="Light">&#9728;</button>' +
            '<button class="tool-btn" id="tSepia" aria-label="Sepia theme" title="Sepia">&#9696;</button>' +
            '<button class="tool-btn" id="tDark" aria-label="Dark theme" title="Dark">&#9790;</button>' +
            '<button class="tool-btn" id="tNight" aria-label="Night black theme" title="Night black">&#11035;</button>' +
            '<select class="tool-btn" id="chSel" aria-label="Choose chapter"></select>' +
          '</div>' +
        '</div></div>' +
        '<div class="reader-body" id="rBody"></div>' +
        '<div class="reader-nav" id="rNav"></div>' +
        '<button class="bookmark-fab" id="bmFab" aria-label="Bookmark this chapter" title="Bookmark this chapter">☆</button>';
      root.appendChild(shell);
      document.body.classList.add('reader-page');

      var body = shell.querySelector('#rBody'),
          title = shell.querySelector('#rTitle'),
          nav = shell.querySelector('#rNav'),
          prog = shell.querySelector('#rProg'),
          fab = shell.querySelector('#bmFab'),
          sel = shell.querySelector('#chSel');

      /* chapter dropdown */
      sel.innerHTML = n.chapters.map(function(c, i){
        return '<option value="' + i + '">Ch. ' + (i + 1) + ' — ' + AN.esc((c.title || '').slice(0, 40)) + '</option>';
      }).join('');
      sel.value = String(ch);
      sel.addEventListener('change', function(){ go(parseInt(sel.value, 10)); });

      function paintTheme(){
        shell.setAttribute('data-theme', theme);
        [['tDay','day'],['tSepia','sepia'],['tDark','dark'],['tNight','night']].forEach(function(p){
          shell.querySelector('#' + p[0]).classList.toggle('on', theme === p[1]);
        });
      }
      function paintFont(){ body.style.fontSize = fsize + 'px'; }
      function paintLH(){
        shell.style.setProperty('--rlh', lh);
        shell.querySelector('#tLH').title = 'Line spacing: ' + (LH_NAMES[lh] || 'Normal');
      }

      shell.querySelector('#tMinus').addEventListener('click', function(){ fsize = Math.max(14, fsize - 2); store.set('reader_font', fsize); paintFont(); });
      shell.querySelector('#tPlus').addEventListener('click', function(){ fsize = Math.min(28, fsize + 2); store.set('reader_font', fsize); paintFont(); });
      shell.querySelector('#tLH').addEventListener('click', function(){
        lh = LH_STEPS[(LH_STEPS.indexOf(lh) + 1) % LH_STEPS.length];
        store.set('reader_lineheight', lh); paintLH();
      });
      shell.querySelector('#tDay').addEventListener('click', function(){ theme = 'day'; store.set('reader_theme', theme); paintTheme(); });
      shell.querySelector('#tSepia').addEventListener('click', function(){ theme = 'sepia'; store.set('reader_theme', theme); paintTheme(); });
      shell.querySelector('#tDark').addEventListener('click', function(){ theme = 'dark'; store.set('reader_theme', theme); paintTheme(); });
      shell.querySelector('#tNight').addEventListener('click', function(){ theme = 'night'; store.set('reader_theme', theme); paintTheme(); });

      /* bookmarks: {slug: [chIdx,...]} */
      function getBM(){ return store.get('bookmarks', {}); }
      function paintFab(){
        var on = (getBM()[slug] || []).indexOf(ch) !== -1;
        fab.classList.toggle('saved', on);
        fab.textContent = on ? '★' : '☆';
      }
      fab.addEventListener('click', function(){
        var b = getBM(); b[slug] = b[slug] || [];
        var ix = b[slug].indexOf(ch);
        if(ix === -1) b[slug].push(ch); else b[slug].splice(ix, 1);
        store.set('bookmarks', b); paintFab();
      });

      function markRead(i){
        var r = store.get('read', {}); r[slug] = r[slug] || [];
        if(r[slug].indexOf(i) === -1) r[slug].push(i);
        store.set('read', r);
      }
      function saveProgress(){
        var p = store.get('progress', {});
        p[slug] = { ch: ch, scroll: window.scrollY, at: Date.now() };
        store.set('progress', p);
      }

      function go(i){
        ch = Math.min(Math.max(i, 0), n.chapters.length - 1);
        render();
        window.scrollTo(0, 0);
        history.replaceState(null, '', 'read.html?id=' + encodeURIComponent(slug) + '&ch=' + ch);
      }

      function render(){
        var c = n.chapters[ch];
        document.title = (c.title || ('Chapter ' + (ch + 1))) + ' — ' + n.title + ' — AST Novels';
        title.textContent = n.title;
        sel.value = String(ch);
        body.innerHTML =
          '<div class="ch-kicker">Chapter ' + (ch + 1) + ' of ' + n.chapters.length + '</div>' +
          '<h1 class="chapter-title' + (u ? ' urdu' : '') + '">' + AN.esc(c.title || ('Chapter ' + (ch + 1))) + '</h1>' +
          '<div class="ch-byline">' + AN.esc(n.title) + ' · by ' + AN.esc(n.author) + '</div>' +
          '<div class="prose' + (u ? ' urdu' : '') + '">' + para(c.text) + '</div>';
        var prev = n.chapters[ch - 1], next = n.chapters[ch + 1];
        nav.innerHTML =
          (prev ? '<a href="read.html?id=' + AN.esc(slug) + '&ch=' + (ch - 1) + '" data-nav="' + (ch - 1) + '"><span class="lbl">&larr; Previous</span><span class="t">' + AN.esc(prev.title || ('Chapter ' + ch)) + '</span></a>'
                : '<a class="disabled"><span class="lbl">&larr; Previous</span><span class="t">—</span></a>') +
          (next ? '<a class="next" href="read.html?id=' + AN.esc(slug) + '&ch=' + (ch + 1) + '" data-nav="' + (ch + 1) + '"><span class="lbl">Next &rarr;</span><span class="t">' + AN.esc(next.title || ('Chapter ' + (ch + 2))) + '</span></a>'
                : '<a class="next disabled"><span class="lbl">Next &rarr;</span><span class="t">—</span></a>');
        nav.querySelectorAll('[data-nav]').forEach(function(a){
          a.addEventListener('click', function(e){ e.preventDefault(); go(parseInt(a.getAttribute('data-nav'), 10)); });
        });
        paintTheme(); paintFont(); paintLH(); paintFab();
        markRead(ch); saveProgress();
      }

      /* reading progress bar + autosave scroll */
      var tick = null;
      window.addEventListener('scroll', function(){
        if(tick) return;
        tick = setTimeout(function(){
          tick = null;
          var h = document.documentElement;
          var max = h.scrollHeight - h.clientHeight;
          prog.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
          saveProgress();
        }, 120);
      }, {passive:true});

      /* restore scroll if arriving from novel page with saved position */
      var saved = store.get('progress', {})[slug];
      render();
      if(saved && saved.ch === ch && saved.scroll > 200){
        setTimeout(function(){ window.scrollTo(0, saved.scroll); }, 60);
      }
  }

  /* ================= PDF-mode reader (Drive-hosted PDFs via PDF.js) =================
     The PDF is fetched through the Google Drive API (file ID only, built at
     runtime) and rendered page-by-page inside the site. Readers never see
     the Drive URL and are never redirected. */
  function startPdfReader(n, pdfData){
    var root = document.getElementById('readerRoot');
    root.innerHTML = '<div class="empty-state"><div class="big">Opening…</div><p>Loading document pages.</p></div>';
    var slug = n.slug;
    var theme = store.get('reader_theme', 'day');
    var zoom = store.get('reader_pdfzoom', 1);

    loadPdfJs().then(function(pdfjs){
      return pdfjs.getDocument({ data: pdfData }).promise;
    }).then(function(pdf){
      var total = pdf.numPages;
      root.innerHTML = '';
      var shell = document.createElement('div');
      shell.className = 'reader pdf-mode';
      shell.setAttribute('data-theme', theme);
      shell.innerHTML =
        '<div class="progress-track" id="rProg"></div>' +
        '<div class="reader-bar"><div class="reader-bar-inner">' +
          '<a class="back" href="novel.html?id=' + AN.esc(n.slug) + '">&larr; <span>Novel</span></a>' +
          '<div class="r-title">' + AN.esc(n.title) + '</div>' +
          '<div class="reader-tools">' +
            '<button class="tool-btn" id="tMinus" aria-label="Smaller" title="Zoom out">A&minus;</button>' +
            '<button class="tool-btn" id="tPlus" aria-label="Larger" title="Zoom in">A+</button>' +
            '<button class="tool-btn" id="tDay" aria-label="Light theme" title="Light">&#9728;</button>' +
            '<button class="tool-btn" id="tSepia" aria-label="Sepia theme" title="Sepia">&#9696;</button>' +
            '<button class="tool-btn" id="tDark" aria-label="Dark theme" title="Dark">&#9790;</button>' +
            '<button class="tool-btn" id="tNight" aria-label="Night black theme" title="Night black">&#11035;</button>' +
            '<select class="tool-btn" id="pgSel" aria-label="Go to page"></select>' +
          '</div>' +
        '</div></div>' +
        '<div class="reader-body pdf-body" id="rBody"></div>' +
        '<div class="reader-nav" id="rNav">' +
          '<a id="pgPrev"><span class="lbl">&larr; Previous</span><span class="t" id="pgPrevT"></span></a>' +
          '<a class="next" id="pgNext"><span class="lbl">Next &rarr;</span><span class="t" id="pgNextT"></span></a>' +
        '</div>';
      root.appendChild(shell);
      document.body.classList.add('reader-page');

      var body = shell.querySelector('#rBody'),
          prog = shell.querySelector('#rProg'),
          sel = shell.querySelector('#pgSel'),
          pages = [], cur = 1;

      sel.innerHTML = Array.from({length: total}, function(_, i){
        return '<option value="' + (i + 1) + '">Page ' + (i + 1) + ' / ' + total + '</option>';
      }).join('');
      sel.addEventListener('change', function(){ goPage(parseInt(sel.value, 10)); });

      var THEMES = ['day', 'sepia', 'dark', 'night'];
      if(THEMES.indexOf(theme) === -1) theme = 'day';

      function paintTheme(){
        shell.setAttribute('data-theme', theme);
        [['tDay','day'],['tSepia','sepia'],['tDark','dark'],['tNight','night']].forEach(function(p){
          shell.querySelector('#' + p[0]).classList.toggle('on', theme === p[1]);
        });
      }
      shell.querySelector('#tDay').addEventListener('click', function(){ theme = 'day'; store.set('reader_theme', theme); paintTheme(); });
      shell.querySelector('#tSepia').addEventListener('click', function(){ theme = 'sepia'; store.set('reader_theme', theme); paintTheme(); });
      shell.querySelector('#tDark').addEventListener('click', function(){ theme = 'dark'; store.set('reader_theme', theme); paintTheme(); });
      shell.querySelector('#tNight').addEventListener('click', function(){ theme = 'night'; store.set('reader_theme', theme); paintTheme(); });
      shell.querySelector('#tMinus').addEventListener('click', function(){ zoom = Math.max(0.6, +(zoom - 0.15).toFixed(2)); store.set('reader_pdfzoom', zoom); renderAll(true); });
      shell.querySelector('#tPlus').addEventListener('click', function(){ zoom = Math.min(2.2, +(zoom + 0.15).toFixed(2)); store.set('reader_pdfzoom', zoom); renderAll(true); });

      function renderPage(num){
        var holder = pages[num - 1];
        if(!holder || holder.rendered) return Promise.resolve();
        holder.rendered = true;
        return pdf.getPage(num).then(function(page){
          var scale = 1.5 * zoom;
          var vp = page.getViewport({ scale: scale });
          var cv = document.createElement('canvas');
          cv.width = vp.width; cv.height = vp.height;
          cv.className = 'pdf-page';
          holder.el.innerHTML = '';
          holder.el.appendChild(cv);
          return page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        });
      }
      function renderAll(rerender){
        var jobs = [];
        for(var i = 1; i <= total; i++){
          var holder = pages[i - 1];
          if(rerender) holder.rendered = false;
          // render current + neighbors eagerly, rest lazily on scroll
          if(Math.abs(i - cur) <= 2) jobs.push(renderPage(i));
        }
        return Promise.all(jobs);
      }
      // build placeholders
      for(var i = 1; i <= total; i++){
        var d = document.createElement('div');
        d.className = 'pdf-holder';
        d.id = 'pdfp' + i;
        d.innerHTML = '<div class="pdf-loading">Page ' + i + '…</div>';
        body.appendChild(d);
        pages.push({ el: d, rendered: false });
      }
      // lazy render on scroll
      var io = 'IntersectionObserver' in window ? new IntersectionObserver(function(es){
        es.forEach(function(e){
          if(e.isIntersecting){
            var num = parseInt(e.target.id.replace('pdfp', ''), 10);
            renderPage(num);
            setCur(num, true);
          }
        });
      }, { rootMargin: '400px' }) : null;
      pages.forEach(function(p){ if(io) io.observe(p.el); });

      function setCur(num, fromScroll){
        cur = Math.min(Math.max(num, 1), total);
        sel.value = String(cur);
        shell.querySelector('#pgPrevT').textContent = cur > 1 ? 'Page ' + (cur - 1) : '—';
        shell.querySelector('#pgNextT').textContent = cur < total ? 'Page ' + (cur + 1) : '—';
        var pr = store.get('progress', {});
        pr[slug] = { ch: 0, pdfPage: cur, at: Date.now() };
        store.set('progress', pr);
        if(!fromScroll){
          var el = document.getElementById('pdfp' + cur);
          if(el) el.scrollIntoView();
        }
      }
      function goPage(num){
        setCur(num);
        renderPage(cur).then(function(){ renderPage(cur + 1); renderPage(cur - 1); });
      }
      shell.querySelector('#pgPrev').addEventListener('click', function(){ if(cur > 1) goPage(cur - 1); });
      shell.querySelector('#pgNext').addEventListener('click', function(){ if(cur < total) goPage(cur + 1); });

      /* progress bar */
      var tick = null;
      window.addEventListener('scroll', function(){
        if(tick) return;
        tick = setTimeout(function(){
          tick = null;
          var h = document.documentElement;
          var max = h.scrollHeight - h.clientHeight;
          prog.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
        }, 120);
      }, {passive:true});

      paintTheme();
      var saved = store.get('progress', {})[slug];
      var startPage = (saved && saved.pdfPage) || 1;
      document.title = n.title + ' — AST Novels';
      setCur(startPage);
      renderAll(false);
    }).catch(function(){
      root.innerHTML = sourceErrorHTML(n);
    });
  }
})();
