/* AST Novels — shared site JS: nav, reveal, PWA install, service worker. */
(function(){
  'use strict';

  /* ---------- helpers ---------- */
  function esc(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function words(n){ return n >= 1000 ? (n/1000).toFixed(1).replace(/\.0$/,'') + 'k' : String(n); }

  /* Admin overrides: novels staged in the admin panel (localStorage).
     Keys written by the admin panel JS — kept in sync here. */
  var LS_NOVELS = 'ast_admin_novels';
  var LS_TRASH = 'ast_admin_trash';
  function readLS(key){
    try{ return JSON.parse(localStorage.getItem(key) || '{}'); }
    catch(e){ return {}; }
  }
  function getOverride(slug){
    var o = readLS(LS_NOVELS);
    return o[slug || '__deleted__'];
  }
  function listOverrides(){ return readLS(LS_NOVELS); }
  function listTrash(){ return readLS(LS_TRASH); }
  function isTrashed(slug){ return !!readLS(LS_TRASH)[slug]; }

  /* ---------- mobile menu ---------- */
  document.addEventListener('DOMContentLoaded', function(){
    var ham = document.querySelector('.hamburger'),
        mm  = document.querySelector('.mobile-menu');
    if(ham && mm){ ham.addEventListener('click', function(){ mm.classList.toggle('open'); }); }

    /* ---------- scroll reveal ---------- */
    if('IntersectionObserver' in window){
      var io = new IntersectionObserver(function(es){
        es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
      }, {threshold:.08});
      document.querySelectorAll('.reveal').forEach(function(n){ io.observe(n); });
      // watch for dynamically added .reveal nodes (novel cards etc.)
      var mo = new MutationObserver(function(muts){
        muts.forEach(function(m){
          m.addedNodes.forEach(function(n){
            if(n.nodeType !== 1) return;
            if(n.classList && n.classList.contains('reveal')) io.observe(n);
            n.querySelectorAll && n.querySelectorAll('.reveal:not(.in)').forEach(function(c){ io.observe(c); });
          });
        });
      });
      mo.observe(document.body, {childList:true, subtree:true});
    } else {
      document.querySelectorAll('.reveal').forEach(function(n){ n.classList.add('in'); });
    }

    /* ---------- active nav link ---------- */
    var path = (location.pathname.split('/').pop() || 'index.html').split('?')[0];
    document.querySelectorAll('.nav-links a, .mobile-menu a').forEach(function(a){
      var href = (a.getAttribute('href') || '').split('?')[0];
      if(href === path || (path === '' && href === 'index.html')) a.classList.add('active');
    });
  });

  /* ---------- service worker ---------- */
  if('serviceWorker' in navigator && location.protocol.indexOf('http') === 0){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('sw.js').catch(function(){ /* offline support optional */ });
    });
  }

  /* ---------- PWA install prompt ---------- */
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });
  window.addEventListener('appinstalled', function(){ hideInstallBanner(); });

  function showInstallBanner(){
    if(document.querySelector('.install-banner')) return;
    if(localStorage.getItem('astnovels_install_dismissed')) return;
    // don't show inside the reader — it has its own chrome
    if(document.body.classList.contains('reader-page')) return;
    var b = document.createElement('div');
    b.className = 'install-banner';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', 'Install AST Novels app');
    b.innerHTML =
      '<div class="ib-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#FFF4DE" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg></div>' +
      '<div class="ib-text"><b>Get the AST Novels app</b><span>Install for offline reading &amp; quick access</span></div>' +
      '<button class="ib-install">Install</button>' +
      '<button class="ib-close" aria-label="Dismiss">&times;</button>';
    document.body.appendChild(b);
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ b.classList.add('show'); }); });
    b.querySelector('.ib-install').addEventListener('click', function(){
      if(deferredPrompt){
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function(){ deferredPrompt = null; hideInstallBanner(); });
      }
    });
    b.querySelector('.ib-close').addEventListener('click', function(){
      localStorage.setItem('astnovels_install_dismissed', '1');
      hideInstallBanner();
    });
    // iOS hint: no beforeinstallprompt on iOS — show manual hint after 20s if standalone never happens
    setTimeout(function(){
      if(!window.matchMedia('(display-mode: standalone)').matches && !deferredPrompt && !document.querySelector('.install-banner.show')){
        // keep quiet on iOS; the About page explains Add to Home Screen
      }
    }, 20000);
  }
  function hideInstallBanner(){
    var b = document.querySelector('.install-banner');
    if(b){ b.classList.remove('show'); setTimeout(function(){ b.remove(); }, 450); }
  }

  /* expose shared helpers */
  window.ASTNovels = { esc: esc, words: words, getOverride: getOverride, listOverrides: listOverrides, listTrash: listTrash, isTrashed: isTrashed };
})();
