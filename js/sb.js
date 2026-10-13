/* AST Novels — Supabase client (plain fetch, no extra CDN needed).
   Public reads use the anon key (RLS: published novels only).
   Admin writes pass the admin's session token explicitly. */
(function(){
  'use strict';
  var BASE = 'https://xbmhjjodaxewhsgpzoue.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhibWhqam9kYXhld2hzZ3B6b3VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MDkyOTMsImV4cCI6MjEwNzQ4NTI5M30.S0gmnq7Ki2MrmCDLRsnulbMy_CBgWYftTRo_5__Zh_g';

  function req(method, path, opts){
    opts = opts || {};
    var h = { 'apikey': ANON, 'Authorization': 'Bearer ' + (opts.auth || ANON) };
    if(opts.json !== undefined) h['Content-Type'] = 'application/json';
    if(opts.prefer) h['Prefer'] = opts.prefer;
    return fetch(BASE + path, {
      method: method,
      headers: h,
      body: opts.json !== undefined ? JSON.stringify(opts.json) : (opts.body != null ? opts.body : null)
    }).then(function(r){
      if(!r.ok) return r.text().then(function(t){ throw new Error('Supabase ' + r.status + ': ' + String(t).slice(0, 180)); });
      if(opts.raw) return r;
      var ct = r.headers.get('content-type') || '';
      return ct.indexOf('json') !== -1 ? r.json() : r.text();
    });
  }

  window.ASTSupa = {
    BASE: BASE,
    ANON: ANON,
    get: function(path, auth){ return req('GET', path, { auth: auth }); },
    post: function(path, json, auth, prefer){ return req('POST', path, { json: json, auth: auth, prefer: prefer }); },
    patch: function(path, json, auth, prefer){ return req('PATCH', path, { json: json, auth: auth, prefer: prefer || 'return=representation' }); },
    del: function(path, auth){ return req('DELETE', path, { auth: auth }); },
    rpc: function(fn, args, auth){ return req('POST', '/rest/v1/rpc/' + fn, { json: args || {}, auth: auth }); },

    signIn: function(email, password){
      return req('POST', '/auth/v1/token?grant_type=password', { json: { email: email, password: password } });
    },
    signOut: function(token){
      return req('POST', '/auth/v1/logout', { auth: token }).catch(function(){});
    },
    updatePassword: function(token, newPassword){
      return req('PUT', '/auth/v1/user', { json: { password: newPassword }, auth: token });
    },

    /* Upload a File/Blob to a storage bucket. Returns the public URL. */
    upload: function(bucket, path, file, token){
      return fetch(BASE + '/storage/v1/object/' + bucket + '/' + encodeURIComponent(path).replace(/%2F/g, '/'), {
        method: 'POST',
        headers: {
          'apikey': ANON,
          'Authorization': 'Bearer ' + token,
          'Content-Type': file.type || 'application/octet-stream',
          'x-upsert': 'true'
        },
        body: file
      }).then(function(r){
        if(!r.ok) return r.text().then(function(t){ throw new Error('Upload ' + r.status + ': ' + String(t).slice(0, 180)); });
        return BASE + '/storage/v1/object/public/' + bucket + '/' + path;
      });
    },
    publicUrl: function(bucket, path){ return BASE + '/storage/v1/object/public/' + bucket + '/' + path; }
  };
})();
