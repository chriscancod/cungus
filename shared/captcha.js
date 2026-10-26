/* Veynor bot check, browser side. Copied into mambru-inc/shared/captcha.js and cungus/shared/captcha.js: keep them identical.
 *
 * What it does for a visitor: nothing they can see. When they first touch the form it asks the server for a small
 * challenge and solves it in the background (in a Web Worker so the page stays smooth), and when they submit it hands the
 * answer to the form. It also adds a hidden "honeypot" field that people never see and bots love to fill in.
 * If anything goes wrong (offline, blocked, slow) it quietly returns no answer and the form still submits: the server
 * decides what to do about a missing answer, so a visitor is never stuck on a puzzle.
 *
 * Use:  VeynorCaptcha.watch(formElement, 'https://backend', 'signup')   once per form
 *       const extra = await VeynorCaptcha.fields(formElement)          -> { captcha, hp_note } to add to the request
 */
(function (root) {
  'use strict';

  // SHA-256 of an ASCII string, as hex. Small and synchronous, because a Web Worker has no need for the async crypto API
  // and 20,000 hashes this way take well under a second.
  function sha256Hex(ascii) {
    var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var len = ascii.length;
    var padded = ((len + 9 + 63) >> 6) << 6;
    var words = new Uint32Array(padded >> 2);
    for (var i = 0; i < len; i++) words[i >> 2] |= ascii.charCodeAt(i) << (24 - ((i & 3) << 3));
    words[len >> 2] |= 0x80 << (24 - ((len & 3) << 3));
    words[words.length - 1] = len * 8;
    var w = new Uint32Array(64);
    for (var off = 0; off < words.length; off += 16) {
      for (var t = 0; t < 16; t++) w[t] = words[off + t];
      for (t = 16; t < 64; t++) {
        var a1 = w[t - 15], a2 = w[t - 2];
        var s0 = ((a1 >>> 7) | (a1 << 25)) ^ ((a1 >>> 18) | (a1 << 14)) ^ (a1 >>> 3);
        var s1 = ((a2 >>> 17) | (a2 << 15)) ^ ((a2 >>> 19) | (a2 << 13)) ^ (a2 >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (t = 0; t < 64; t++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (hh + S1 + ch + K[t] + w[t]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    var out = '';
    for (var k = 0; k < 8; k++) out += ('00000000' + (h[k] >>> 0).toString(16)).slice(-8);
    return out;
  }

  /** Find the number n (0..maxnumber) where sha256(salt + n) equals the challenge, or null. */
  function solveChallenge(ch, from, to) {
    var last = Math.min(typeof to === 'number' ? to : ch.maxnumber, ch.maxnumber);
    for (var n = from || 0; n <= last; n++) if (sha256Hex(ch.salt + n) === ch.challenge) return n;
    return null;
  }

  function encode(ch, number) {
    var json = JSON.stringify(Object.assign({}, ch, { number: number }));
    return typeof btoa === 'function' ? btoa(json) : Buffer.from(json).toString('base64');
  }

  // Solve in a Web Worker when the browser allows it, otherwise in small slices on the page so it never freezes.
  function solveInBackground(ch) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(n) { if (!done) { done = true; resolve(n); } }
      function onPage() {
        var next = 0;
        (function slice() {
          var found = solveChallenge(ch, next, next + 1999);
          if (found !== null) return finish(found);
          next += 2000;
          if (next > ch.maxnumber) return finish(null);
          setTimeout(slice, 0);
        })();
      }
      try {
        var source = 'var sha256Hex=' + sha256Hex.toString() + ';var solveChallenge=' + solveChallenge.toString() + ';onmessage=function(e){postMessage(solveChallenge(e.data));};';
        var url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        var worker = new Worker(url);
        worker.onmessage = function (e) { worker.terminate(); URL.revokeObjectURL(url); finish(e.data); };
        worker.onerror = function () { worker.terminate(); URL.revokeObjectURL(url); onPage(); };
        worker.postMessage(ch);
      } catch (e) { onPage(); }
    });
  }

  var pending = {};
  function prepare(base, scope) {
    var key = base + '|' + scope;
    if (!pending[key]) {
      pending[key] = fetch(String(base).replace(/\/$/, '') + '/api/captcha/challenge?scope=' + encodeURIComponent(scope), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (ch) {
          if (!ch) return '';
          var issuedAt = Date.now();
          return solveInBackground(ch).then(function (n) {
            if (n === null) return '';
            // The server refuses answers that arrive in under a second (no person is that fast), so a quick solver waits
            // out the rest of that second instead of failing a visitor who simply submitted fast.
            var wait = issuedAt + 1100 - Date.now();
            return new Promise(function (r) { setTimeout(function () { r(encode(ch, n)); }, wait > 0 ? wait : 0); });
          });
        })
        .catch(function () { return ''; });
    }
    return pending[key];
  }
  /** The answer for this form, or '' if it could not be made in time. Each answer works once, so it is used up here. */
  function token(base, scope, waitMs) {
    var key = base + '|' + scope;
    var p = prepare(base, scope);
    delete pending[key];
    return Promise.race([p, new Promise(function (r) { setTimeout(function () { r(''); }, waitMs || 10000); })]);
  }

  function honeypot(form) {
    var field = form.querySelector('input[name="hp_note"]');
    if (!field) {
      field = document.createElement('input');
      field.type = 'text'; field.name = 'hp_note'; field.tabIndex = -1; field.autocomplete = 'off';
      field.setAttribute('aria-hidden', 'true');
      field.style.cssText = 'position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;opacity:0';
      form.appendChild(field);
    }
    return field;
  }

  var forms = typeof WeakMap === 'function' ? new WeakMap() : null;
  /** Add the honeypot and start solving the first time the visitor touches the form. */
  function watch(form, base, scope) {
    if (!form || (forms && forms.has(form))) return;
    if (forms) forms.set(form, { base: base, scope: scope });
    honeypot(form);
    var start = function () { prepare(base, scope); form.removeEventListener('focusin', start); form.removeEventListener('pointerdown', start); };
    form.addEventListener('focusin', start);
    form.addEventListener('pointerdown', start);
  }
  /** The extra fields to send with the form: { captcha, hp_note }. Never rejects. */
  function fields(form, waitMs) {
    var info = forms && forms.get(form);
    var hp = form.querySelector('input[name="hp_note"]');
    var extra = { hp_note: hp ? hp.value : '' };
    if (!info) return Promise.resolve(extra);
    return token(info.base, info.scope, waitMs).then(function (t) { extra.captcha = t; return extra; });
  }

  var api = { sha256Hex: sha256Hex, solveChallenge: solveChallenge, encode: encode, watch: watch, fields: fields, token: token, prepare: prepare, honeypot: honeypot };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VeynorCaptcha = api;
})(typeof window !== 'undefined' ? window : this);
