/* AST Novels — platform layer: reading stats, ratings, reviews, trending.
   All personal data stays in this browser (localStorage). Nothing is sent anywhere. */
(function(){
  'use strict';
  var AN = window.ASTNovels;

  var store = {
    get: function(k, d){ try{ var v = localStorage.getItem('astnovels_' + k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
    set: function(k, v){ try{ localStorage.setItem('astnovels_' + k, JSON.stringify(v)); }catch(e){} }
  };

  function todayKey(){
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  /* ---------- reading time tracking ---------- */
  var trackTimer = null;
  function trackReading(slug){
    if(trackTimer || !slug) return;
    var lastActive = Date.now();
    function poke(){ lastActive = Date.now(); }
    ['scroll','touchstart','keydown','click'].forEach(function(ev){
      window.addEventListener(ev, poke, {passive:true});
    });
    trackTimer = setInterval(function(){
      if(document.visibilityState !== 'visible') return;
      if(Date.now() - lastActive > 90000) return; // idle > 90s: not reading
      var s = store.get('stats', {sec:0, perNovel:{}, days:[]});
      s.sec = (s.sec || 0) + 5;
      s.perNovel = s.perNovel || {};
      s.perNovel[slug] = (s.perNovel[slug] || 0) + 5;
      s.days = s.days || [];
      var tk = todayKey();
      if(s.days.indexOf(tk) === -1){ s.days.push(tk); if(s.days.length > 400) s.days = s.days.slice(-400); }
      s.perDay = s.perDay || {};
      s.perDay[tk] = (s.perDay[tk] || 0) + 5;
      // prune per-day history older than 400 days
      var dk = Object.keys(s.perDay);
      if(dk.length > 400){
        dk.sort();
        for(var i = 0; i < dk.length - 400; i++) delete s.perDay[dk[i]];
      }
      store.set('stats', s);
    }, 5000);
  }

  function getStats(){ return store.get('stats', {sec:0, perNovel:{}, days:[]}); }

  function dayStreak(){
    var days = getStats().days || [];
    if(!days.length) return 0;
    var set = {};
    days.forEach(function(d){ set[d] = true; });
    var d = new Date();
    // streak counts back from today; if today missing, start from yesterday
    var tk = todayKey();
    if(!set[tk]) d.setDate(d.getDate() - 1);
    var streak = 0;
    while(true){
      var k = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      if(set[k]){ streak++; d.setDate(d.getDate() - 1); } else break;
    }
    return streak;
  }

  function chaptersFinished(){
    var r = store.get('read', {});
    var total = 0;
    Object.keys(r).forEach(function(slug){
      if(Array.isArray(r[slug])) total += r[slug].length;
    });
    return total;
  }

  /* novels completed: read-chapters >= catalog chapterCount (text novels only) */
  function novelsCompleted(catalog){
    var r = store.get('read', {});
    var done = 0;
    Object.keys(r).forEach(function(slug){
      var readCount = Array.isArray(r[slug]) ? r[slug].length : 0;
      if(!readCount) return;
      var n = null;
      (catalog || []).forEach(function(x){ if(x.slug === slug) n = x; });
      if(n && n.chapterCount > 0 && readCount >= n.chapterCount) done++;
    });
    return done;
  }

  /* ---------- local ratings ---------- */
  function getMyRating(slug){
    var m = store.get('myratings', {});
    return m[slug] || 0;
  }
  function setRating(slug, val){
    val = Math.max(1, Math.min(5, Math.round(val)));
    var mine = store.get('myratings', {});
    var agg = store.get('aggratings', {});
    var prev = mine[slug] || 0;
    var a = agg[slug] || {sum:0, cnt:0};
    if(prev > 0){ a.sum -= prev; a.cnt -= 1; }
    a.sum += val; a.cnt += 1;
    mine[slug] = val; agg[slug] = a;
    store.set('myratings', mine);
    store.set('aggratings', agg);
    return val;
  }
  /* Merge server rating (Supabase) with local ratings into {avg, count}. */
  function mergedRating(novel){
    var savg = parseFloat(novel.rating_avg) || 0;
    var scnt = parseInt(novel.rating_count, 10) || 0;
    var agg = (store.get('aggratings', {}))[novel.slug];
    var sum = savg * scnt, cnt = scnt;
    if(agg && agg.cnt > 0){ sum += agg.sum; cnt += agg.cnt; }
    if(cnt <= 0) return null;
    return { avg: sum / cnt, count: cnt };
  }
  function starsText(avg){
    var full = Math.round(avg), s = '';
    for(var i = 1; i <= 5; i++) s += (i <= full) ? '★' : '☆';
    return s;
  }
  function ratingLineHTML(novel){
    var m = mergedRating(novel);
    if(!m) return '';
    return '<span class="rating"><span class="stars" aria-hidden="true">' + starsText(m.avg) + '</span>' +
      '<span class="rating-val">' + m.avg.toFixed(1) + '</span></span>';
  }

  /* ---------- reviews (local) ---------- */
  function getReviews(slug){
    var all = store.get('reviews', {});
    return all[slug] || [];
  }
  function addReview(slug, name, text){
    name = String(name || '').trim().slice(0, 40);
    text = String(text || '').trim().slice(0, 600);
    if(!text) return null;
    var all = store.get('reviews', {});
    var list = all[slug] || [];
    var rev = { n: name || 'Anonymous reader', t: text, at: Date.now() };
    list.unshift(rev);
    if(list.length > 60) list = list.slice(0, 60);
    all[slug] = list;
    store.set('reviews', all);
    return rev;
  }

  /* ---------- views (local read counts) ---------- */
  function localViews(slug){
    try{ return parseInt(localStorage.getItem('ast_views_' + slug) || '0', 10) || 0; }
    catch(e){ return 0; }
  }
  function totalViews(novel){
    return (parseInt(novel.views, 10) || 0) + localViews(novel.slug);
  }

  /* ---------- trending score ---------- */
  function trendingScore(novel){
    var m = mergedRating(novel);
    var score = totalViews(novel) * 1;
    if(m){ score += m.count * 4 + m.avg * 2; }
    return score;
  }

  /* ---------- reading goals ---------- */
  function getGoalMin(){ var v = parseInt(store.get('goal_min', 30), 10); return (v > 0 && v <= 480) ? v : 30; }
  function setGoalMin(m){ m = parseInt(m, 10); if(m > 0 && m <= 480) store.set('goal_min', m); }
  function todaySeconds(){ var s = getStats(); return ((s.perDay || {})[todayKey()] || 0); }

  /* ---------- bookshelves: want / reading / finished (localStorage) ---------- */
  var SHELF_KEYS = ['want', 'reading', 'finished'];
  var SHELF_LABELS = { want: 'Want to Read', reading: 'Currently Reading', finished: 'Finished' };
  var SHELF_SHORT = { want: 'Want to Read', reading: 'Reading', finished: 'Finished' };
  function getShelves(){
    var s = store.get('shelves', null);
    if(!s || typeof s !== 'object') s = {};
    var out = {};
    SHELF_KEYS.forEach(function(k){ out[k] = Array.isArray(s[k]) ? s[k].slice() : []; });
    return out;
  }
  function getShelf(slug){
    var s = getShelves();
    for(var i = 0; i < SHELF_KEYS.length; i++){
      if(s[SHELF_KEYS[i]].indexOf(slug) !== -1) return SHELF_KEYS[i];
    }
    return null;
  }
  function setShelf(slug, shelf){
    var s = getShelves();
    SHELF_KEYS.forEach(function(k){ s[k] = s[k].filter(function(x){ return x !== slug; }); });
    if(shelf && SHELF_KEYS.indexOf(shelf) !== -1) s[shelf].push(slug);
    store.set('shelves', s);
    return getShelf(slug);
  }
  /* Auto-move: starting a novel puts it on Currently Reading (only if unshelved). */
  function autoShelfOnStart(slug){
    if(!getShelf(slug)) setShelf(slug, 'reading');
  }

  /* ---------- reading time estimates ---------- */
  function readTimeMin(words, lang){
    var wpm = (lang === 'ur') ? 150 : 200;
    return Math.max(1, Math.ceil((parseInt(words, 10) || 0) / wpm));
  }
  function fmtReadTime(min){
    min = Math.max(1, Math.round(min));
    if(min < 60) return 'about ' + min + ' min read';
    var h = Math.floor(min / 60), m = min % 60;
    var hs = h + ' hr' + (h > 1 ? 's' : '');
    return m ? ('about ' + hs + ' ' + m + ' min read') : ('about ' + hs + ' read');
  }
  function fmtShortTime(min){
    min = Math.max(1, Math.round(min));
    if(min < 60) return min + ' min';
    var h = Math.floor(min / 60), m = min % 60;
    return m ? (h + 'h ' + m + 'm') : (h + 'h');
  }

  /* ---------- offline downloads (Cache API) ---------- */
  var DL_CACHE = 'ast-novels-downloads';
  function listDownloads(){ var d = store.get('downloads', []); return Array.isArray(d) ? d : []; }
  function isDownloaded(slug){ return listDownloads().indexOf(slug) !== -1; }
  function downloadNovel(slug, novel){
    var urls = ['data/novels/' + slug + '.json'];
    if(novel && novel.cover) urls.push(novel.cover);
    if(!('caches' in window)) return Promise.reject(new Error('no-cache-api'));
    return caches.open(DL_CACHE).then(function(c){ return c.addAll(urls); }).then(function(){
      var d = listDownloads();
      if(d.indexOf(slug) === -1){ d.push(slug); store.set('downloads', d); }
      return true;
    });
  }
  function removeDownload(slug){
    var done = function(){
      var d = listDownloads().filter(function(x){ return x !== slug; });
      store.set('downloads', d);
    };
    if(!('caches' in window)){ done(); return Promise.resolve(); }
    return caches.open(DL_CACHE).then(function(c){
      return c.delete('data/novels/' + slug + '.json');
    }).then(done, done);
  }

  window.ASTPlatform = {
    trackReading: trackReading,
    getStats: getStats,
    dayStreak: dayStreak,
    chaptersFinished: chaptersFinished,
    novelsCompleted: novelsCompleted,
    getMyRating: getMyRating,
    setRating: setRating,
    mergedRating: mergedRating,
    starsText: starsText,
    ratingLineHTML: ratingLineHTML,
    getReviews: getReviews,
    addReview: addReview,
    localViews: localViews,
    totalViews: totalViews,
    trendingScore: trendingScore,
    getGoalMin: getGoalMin,
    setGoalMin: setGoalMin,
    todaySeconds: todaySeconds,
    shelfKeys: SHELF_KEYS,
    shelfLabels: SHELF_LABELS,
    shelfShort: SHELF_SHORT,
    getShelves: getShelves,
    getShelf: getShelf,
    setShelf: setShelf,
    autoShelfOnStart: autoShelfOnStart,
    readTimeMin: readTimeMin,
    fmtReadTime: fmtReadTime,
    fmtShortTime: fmtShortTime,
    listDownloads: listDownloads,
    isDownloaded: isDownloaded,
    downloadNovel: downloadNovel,
    removeDownload: removeDownload,
    esc: function(s){ return AN ? AN.esc(s) : String(s); }
  };
})();
