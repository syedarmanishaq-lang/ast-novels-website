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
      var href = (a.getAttribute('href') || '').split('?')[0].replace(/^\//, '');
      if(href === path || (path === '' && href === 'index.html')) a.classList.add('active');
    });
  });

  /* ---------- service worker ---------- */
  if('serviceWorker' in navigator && location.protocol.indexOf('http') === 0){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('/sw.js').catch(function(){ /* offline support optional */ });
    });
  }

  /* ---------- PWA install modal ---------- */
  var deferredPrompt = null;
  var LS_OFFERED = 'astnovels_install_offered_at';
  var OFFER_COOLDOWN = 7 * 24 * 3600 * 1000; // re-offer after 7 days, never forever-blocked

  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    deferredPrompt = e;
    maybeAutoOffer();
  });
  window.addEventListener('appinstalled', function(){
    deferredPrompt = null;
    closeInstallModal();
    try{ localStorage.setItem('astnovels_installed', '1'); }catch(e){}
  });

  function isStandalone(){
    try{
      return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    }catch(e){ return false; }
  }
  function alreadyInstalled(){
    try{ return localStorage.getItem('astnovels_installed') === '1'; }catch(e){ return false; }
  }
  function offerDue(){
    if(isStandalone() || alreadyInstalled()) return false;
    if(document.body.classList.contains('reader-page')) return false;
    try{
      var last = parseInt(localStorage.getItem(LS_OFFERED) || '0', 10);
      return (Date.now() - last) > OFFER_COOLDOWN;
    }catch(e){ return true; }
  }
  function markOffered(){
    try{ localStorage.setItem(LS_OFFERED, String(Date.now())); }catch(e){}
  }
  function maybeAutoOffer(){
    if(!offerDue()) return;
    // small delay so the page settles first
    setTimeout(function(){ if(offerDue()) openInstallModal(false); }, 2500);
  }

  function openInstallModal(fromLink){
    if(document.querySelector('.install-modal')) return;
    if(isStandalone() || alreadyInstalled()) return;
    markOffered();
    var hasPrompt = !!deferredPrompt;
    var m = document.createElement('div');
    m.className = 'install-modal';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-label', 'Install AST Novels app');
    var stepsHTML =
      '<ol class="im-steps">' +
        '<li><b>Android · Chrome:</b> tap the <b>&#8942;</b> menu, then <b>Install app</b> (or <b>Add to Home screen</b>).</li>' +
        '<li><b>iPhone · Safari:</b> tap <b>Share</b>, then <b>Add to Home Screen</b>.</li>' +
        '<li><b>Desktop · Chrome/Edge:</b> click the install icon in the address bar.</li>' +
      '</ol>';
    m.innerHTML =
      '<div class="im-backdrop"></div>' +
      '<div class="im-card">' +
        '<button class="im-close" aria-label="Close">&times;</button>' +
        '<div class="im-icon"><img src="/img/icon-192.png" alt="AST Novels app icon" width="76" height="76"></div>' +
        '<h3 class="serif">Get the AST Novels app</h3>' +
        '<p class="im-sub">Your library, on your home screen.</p>' +
        '<ul class="im-bullets">' +
          '<li><span class="im-tick">&#10003;</span> Read offline — anywhere, no internet needed</li>' +
          '<li><span class="im-tick">&#10003;</span> Listen to novels with read-aloud</li>' +
          '<li><span class="im-tick">&#10003;</span> Free forever — no account, no signup</li>' +
        '</ul>' +
        (hasPrompt
          ? '<button class="btn im-install" id="imInstallBtn">Install app</button>'
          : '<div class="im-manual"><p class="im-manual-title">Install in 10 seconds:</p>' + stepsHTML + '</div>') +
        '<button class="im-later">Maybe later</button>' +
      '</div>';
    document.body.appendChild(m);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ m.classList.add('show'); }); });
    function close(){ closeInstallModal(); }
    m.querySelector('.im-backdrop').addEventListener('click', close);
    m.querySelector('.im-close').addEventListener('click', close);
    m.querySelector('.im-later').addEventListener('click', close);
    var ib = m.querySelector('#imInstallBtn');
    if(ib){
      ib.addEventListener('click', function(){
        if(deferredPrompt){
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(function(choice){
            if(choice && choice.outcome === 'accepted'){
              try{ localStorage.setItem('astnovels_installed', '1'); }catch(e){}
            }
            deferredPrompt = null;
            closeInstallModal();
          }).catch(function(){ closeInstallModal(); });
        } else {
          closeInstallModal();
        }
      });
    }
    document.addEventListener('keydown', function esc(e){
      if(e.key === 'Escape'){ closeInstallModal(); document.removeEventListener('keydown', esc); }
    });
  }
  function closeInstallModal(){
    var m = document.querySelector('.install-modal');
    if(m){
      m.classList.remove('show');
      setTimeout(function(){ m.remove(); }, 350);
    }
    document.body.style.overflow = '';
  }
  // expose for footer link + any future buttons
  window.ASTNovelsInstall = { open: function(){ openInstallModal(true); } };

  /* ---------- footer "Install app" link: always available, even if auto-prompt never fires ---------- */
  var installLink = document.getElementById('installAppLink');
  if(installLink){
    // hide the link when already running as the installed app
    if(isStandalone() || alreadyInstalled()){ installLink.style.display = 'none'; }
    installLink.addEventListener('click', function(e){
      e.preventDefault();
      if(window.ASTNovelsInstall) window.ASTNovelsInstall.open();
    });
  }

  /* expose shared helpers */
  window.ASTNovels = { esc: esc, words: words, getOverride: getOverride, listOverrides: listOverrides, listTrash: listTrash, isTrashed: isTrashed };
})();
