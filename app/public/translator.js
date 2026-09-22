/*!
 * Seller Education — Auto Translator (AI Translate Tool)
 * ---------------------------------------------------------
 * แปลข้อความบนหน้าจอ EN → TH อัตโนมัติ ผ่าน Cloudflare Worker (Workers AI / m2m100)
 * - ถ้าตั้ง WORKER_URL แล้ว: เปิดใช้งานได้ทันที (มีปุ่มสลับมุมมองอยู่มุมล่างซ้าย)
 * - ถ้ายังไม่ตั้ง: จะแสดงปุ่ม "แปลภาษา" ที่เปิดหน้าเว็บผ่าน Google Translate แทน
 * - ปลอดภัย: ข้าม input/textarea/script/style และองค์ประกอบที่ตั้ง data-no-translate
 */
(function () {
  'use strict';

  // ==== ตั้งค่า =============================================================
  var CONFIG = {
    // ใส่ URL ของ Worker ที่ deploy แล้ว เช่น 'https://selleredu-tools.<subdomain>.workers.dev'
    WORKER_URL: '',
    SOURCE: 'en',
    TARGET: 'th',
    AUTO_TRANSLATE: true,     // เปิดทำงานอัตโนมัติเมื่อตั้ง WORKER_URL แล้ว
    BATCH_SIZE: 20,
    CACHE_KEY: 'selleredu:xlate:en-th:v1'
  };
  // ==========================================================================

  if (window.__SELLEREDU_TRANSLATOR__) return;

  var cache = (function () {
    try { return JSON.parse(localStorage.getItem(CONFIG.CACHE_KEY) || '{}'); } catch (e) { return {}; }
  })();
  var cacheDirty = false;
  function saveCache() {
    if (!cacheDirty) return;
    try { localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
    cacheDirty = false;
  }
  setInterval(saveCache, 3000);

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, SVG: 1, CANVAS: 1, KBD: 1 };
  var THAI_RE = /[\u0E00-\u0E7F]/;
  var LATIN_RE = /[A-Za-z]{2,}/;
  var translated = typeof WeakSet === 'function' ? new WeakSet() : null;

  function isSkippable(node) {
    var el = node.parentElement;
    if (!el) return true;
    if (SKIP_TAGS[el.tagName]) return true;
    if (el.isContentEditable) return true;
    if (el.closest('[data-no-translate], [contenteditable="true"]')) return true;
    return false;
  }
  function isCandidate(text) {
    var s = String(text || '').trim();
    if (s.length < 3 || s.length > 600) return false;
    if (THAI_RE.test(s)) return false;
    if (!LATIN_RE.test(s)) return false;
    if (/^[\d\s\W]+$/.test(s)) return false;
    return true;
  }

  function workerTranslate(texts) {
    return fetch(CONFIG.WORKER_URL.replace(/\/$/, '') + '/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: texts, source: CONFIG.SOURCE, target: CONFIG.TARGET })
    })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { return (j && j.translations) || []; });
  }

  function collectNodes(root) {
    var out = [];
    var walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue || !isCandidate(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        if (translated && translated.has(node)) return NodeFilter.FILTER_REJECT;
        if (isSkippable(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    while ((n = walker.nextNode())) out.push(n);
    return out;
  }

  var busy = false;
  function run() {
    if (!CONFIG.WORKER_URL || busy) return;
    busy = true;
    var nodes = collectNodes(document.body);
    var pending = [];
    nodes.forEach(function (node) {
      var key = String(node.nodeValue).trim();
      if (cache[key] !== undefined) {
        if (cache[key]) { node.nodeValue = node.nodeValue.replace(key, cache[key]); }
        if (translated) translated.add(node);
      } else {
        pending.push({ node: node, key: key });
      }
    });
    if (!pending.length) { busy = false; return; }

    var chunks = [];
    for (var i = 0; i < pending.length; i += CONFIG.BATCH_SIZE) chunks.push(pending.slice(i, i + CONFIG.BATCH_SIZE));

    var chain = Promise.resolve();
    chunks.forEach(function (chunk) {
      chain = chain.then(function () {
        return workerTranslate(chunk.map(function (p) { return p.key; }))
          .then(function (results) {
            chunk.forEach(function (p, idx) {
              var t = results[idx];
              if (t) {
                cache[p.key] = t; cacheDirty = true;
                p.node.nodeValue = p.node.nodeValue.replace(p.key, t);
              }
              if (translated) translated.add(p.node);
            });
          })
          .catch(function () { /* เงียบไว้ ไม่ให้กระทบหน้าจอ */ });
      });
    });
    chain.then(function () { busy = false; });
  }

  function installObserver() {
    if (!CONFIG.WORKER_URL) return;
    var timer = null;
    var obs = new MutationObserver(function () {
      clearTimeout(timer);
      timer = setTimeout(run, 900);
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function makeButton() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-no-translate', '1');
    btn.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:2147483000;display:flex;align-items:center;gap:6px;' +
      'padding:8px 12px;border-radius:999px;border:1px solid rgba(0,0,0,.12);background:#ee4d2d;color:#fff;font-size:12px;font-weight:700;' +
      'box-shadow:0 6px 18px rgba(238,77,45,.35);cursor:pointer;font-family:inherit';
    btn.innerHTML = '<span style="font-size:14px">🌐</span><span>แปลภาษา</span>';
    btn.addEventListener('click', function () {
      if (CONFIG.WORKER_URL) {
        var on = document.documentElement.getAttribute('data-xlate') === '1';
        if (on) {
          document.documentElement.setAttribute('data-xlate', '0');
          btn.innerHTML = '<span style="font-size:14px">🌐</span><span>แปลภาษา</span>';
          location.reload();
        } else {
          document.documentElement.setAttribute('data-xlate', '1');
          btn.innerHTML = '<span style="font-size:14px">🌐</span><span>กำลังแปล…</span>';
          run();
          setTimeout(function () { btn.innerHTML = '<span style="font-size:14px">🌐</span><span>แปลไทยแล้ว</span>'; }, 1500);
        }
      } else {
        var u = 'https://translate.google.com/translate?sl=auto&tl=' + CONFIG.TARGET + '&u=' + encodeURIComponent(location.href);
        window.open(u, '_blank', 'noopener');
      }
      return false;
    });
    document.body.appendChild(btn);
  }

  function boot() {
    if (!document.body) { setTimeout(boot, 300); return; }
    var enabled = CONFIG.WORKER_URL && CONFIG.AUTO_TRANSLATE && document.documentElement.getAttribute('data-xlate') !== '0';
    document.documentElement.setAttribute('data-xlate', enabled ? '1' : '0');
    makeButton();
    if (enabled) { installObserver(); run(); }
  }

  window.__SELLEREDU_TRANSLATOR__ = { run: run, config: CONFIG, cache: cache };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
