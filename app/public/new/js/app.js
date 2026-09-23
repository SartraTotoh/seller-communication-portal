(function () {
  'use strict';

  /* ============================= */
  /* 1. CONFIG — contract เดิม      */
  /* ============================= */
  var SCP_AUTH_BRIDGE_URL = 'https://script.google.com/a/macros/shopee.com/s/AKfycbwyRFFG24CHH7Y3udiFVkVmKb7_jfbP1nyLBxo6FqHS0j_jxgTURYmt8sLDukmbK_nq/exec';
  var SCP_AUTH_SESSION_KEY = 'sellerCommsWorkspaceSessionR42';
  var TRACKER_DEFAULT_KEY = 'sellerCommsTrackerSyncEndpoint';
  var TRACKER_DEFAULT_URL = 'https://script.google.com/a/macros/shopee.com/s/AKfycbxvIcXHzP8Nefx5o22PLdwCxNzg0Tyw2J3nnaR_5IN9POD4RtgVbSfTx5d1v1JvnwXfRQ/exec';
  var STATIC_URL = './data/requests-2026.json';
  var CLOUD_URLS = ['/data/requests-2026.json'];

  var CHANNEL_CATALOG = [
    { key: 'SC', label: 'SC', family: 'Internal', items: [
      { id: 'CH_SC_PC_POPUP', label: '[PC] Homepage Pop-Up', selectable: true, active: true },
      { id: 'CH_SC_PC_BANNER', label: '[PC] Homepage Banner', selectable: true, active: true },
      { id: 'CH_SC_PC_ANN', label: '[PC] Homepage Announcement', selectable: true, active: true },
      { id: 'CH_SC_PC_NOTICE', label: '[PC] Homepage Notice', selectable: false, importantOnly: true, active: true },
      { id: 'CH_SC_PC_MC_ANN', label: '[PC] MC Announcement', selectable: true, active: true },
      { id: 'CH_SC_APP_BANNER', label: '[APP] Homepage Banner', selectable: true, active: true },
      { id: 'CH_SC_APP_NOTICE', label: '[APP] Homepage Notice', selectable: false, importantOnly: true, active: true }
    ]},
    { key: 'PN_EDM', label: 'PN / EDM', family: 'Internal', items: [
      { id: 'CH_PNAR', label: 'PN/AR', selectable: true, active: true },
      { id: 'CH_EMAIL', label: 'Email', selectable: true, active: true },
      { id: 'CH_PN_IMPORTANT', label: 'PN', selectable: false, importantOnly: true, active: true }
    ]},
    { key: 'SOCIAL_MEDIA', label: 'Social Media', family: 'External', massOnly: true, items: [
      { id: 'CH_SOCIAL_FB', label: 'Facebook Page / Facebook Group', selectable: true, active: true },
      { id: 'CH_SOCIAL_LINE', label: 'LINE Broadcast', selectable: true, active: true },
      { id: 'CH_SOCIAL_YT', label: 'YouTube', selectable: true, active: true },
      { id: 'CH_SOCIAL_IG', label: 'IG', selectable: true, active: true },
      { id: 'CH_SOCIAL_TIKTOK', label: 'TikTok', selectable: true, active: true },
      { id: 'CH_SOCIAL_X', label: 'X', selectable: true, active: true }
    ]},
    { key: 'SELLER_EDU_HUB', label: 'Seller Education Hub', family: 'Internal', contentOnly: true, items: [
      { id: 'CH_EDU_ARTICLE', label: 'Seller Article', selectable: true, active: true },
      { id: 'CH_EDU_BLOG', label: 'Seller Blog', selectable: true, active: true }
    ]}
  ];
  var MASTER_DEPARTMENTS = ['BD', 'MKT', 'OPS', 'Other Entities'];
  var MASTER_SELLER_SCOPES = ['All Platform Sellers', 'Specific Seller List'];
  var ARTWORK_RULES = [
    { match: /\[PC\].*Pop-Up/i, required: 'REQUIRED' },
    { match: /\[PC\].*Banner/i, required: 'REQUIRED' },
    { match: /\[APP\].*Banner/i, required: 'REQUIRED' },
    { match: /Announcement/i, required: 'CONDITIONAL' },
    { match: /.*/, required: 'NOT_REQUIRED' }
  ];

  /* ============================= */
  /* 2. UTILS                      */
  /* ============================= */
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var attr = function (v) { return esc(v).replace(/`/g, '&#96;'); };
  var normalize = function (v) { return String(v || '').trim().toLowerCase(); };
  var isTrue = function (v) { return v === true || /^(true|yes|y|1)$/i.test(String(v || '')); };
  var number = function (v) { var n = parseFloat(v); return isFinite(n) ? n : 0; };
  var clone = function (x) { return x == null ? x : JSON.parse(JSON.stringify(x)); };
  function addDaysIso(days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  }
  var optionsHtml = function (items, selected, placeholder) {
    placeholder = placeholder === undefined ? 'Select option...' : placeholder;
    var first = placeholder === null ? '' : '<option value="">' + esc(placeholder) + '</option>';
    return first + (items || []).map(function (item) {
      var value = typeof item === 'string' ? item : item.value;
      var label = typeof item === 'string' ? item : item.label;
      return '<option value="' + attr(value) + '"' + (String(value) === String(selected) ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
  };

  /* ============================= */
  /* 3. STATE                      */
  /* ============================= */
  var APP = {
    page: 'dashboard',
    data: { requests: [], teams: [], lookups: { departments: MASTER_DEPARTMENTS.slice(), statuses: [], sellerScopes: MASTER_SELLER_SCOPES.slice() } },
    user: null,
    lang: 'EN'
  };

  var I18N = {
    portalWordmark: { EN: 'ระบบสื่อสารกับผู้ขาย', TH: 'ระบบสื่อสารกับผู้ขาย' },
    'nav.dashboard': { EN: 'Dashboard', TH: 'ภาพรวม' },
    'nav.requests': { EN: 'Requests', TH: 'คำขอ' },
    newRequest: { EN: 'New Request', TH: 'สร้างคำขอ' },
    'dashboard.title': { EN: 'Dashboard', TH: 'ภาพรวมงาน' },
    'dashboard.subtitle': { EN: 'Communication request overview for your team.', TH: 'ภาพรวมคำขอสื่อสารของทีมคุณ' },
    'dashboard.total': { EN: 'All requests', TH: 'คำขอทั้งหมด' },
    'dashboard.pending': { EN: 'Pending review', TH: 'รอตรวจสอบ' },
    'dashboard.approved': { EN: 'Ready', TH: 'พร้อมส่ง' },
    'dashboard.urgent': { EN: 'Urgent', TH: 'เร่งด่วน' },
    'dashboard.recentTitle': { EN: 'Recent Requests', TH: 'คำขอล่าสุด' },
    'requests.title': { EN: 'Requests', TH: 'คำขอสื่อสาร' },
    'requests.empty': { EN: 'No requests yet — create your first communication request.', TH: 'ยังไม่มีคำขอ — สร้างคำขอแรกของคุณเลย' },
    'table.id': { EN: 'ID', TH: 'รหัส' },
    'table.campaign': { EN: 'Campaign', TH: 'แคมเปญ' },
    'table.channel': { EN: 'Channel', TH: 'ช่องทาง' },
    'table.requestor': { EN: 'Requestor', TH: 'ผู้ขอ' },
    'table.department': { EN: 'Department', TH: 'แผนก' },
    'table.priority': { EN: 'Priority', TH: 'ความสำคัญ' },
    'table.start': { EN: 'Start', TH: 'เริ่ม' },
    'table.status': { EN: 'Status', TH: 'สถานะ' }
  };
  function t(key) { return (I18N[key] && I18N[key][APP.lang]) || key; }
  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.dataset.i18n); });
    var toggler = document.getElementById('langToggle');
    if (toggler) toggler.textContent = APP.lang === 'EN' ? 'EN' : 'TH';
  }

  /* ============================= */
  /* 4. AUTH (Workspace bridge)    */
  /* ============================= */
  function scpWorkspaceSession() {
    try { return String(window.sessionStorage.getItem(SCP_AUTH_SESSION_KEY) || '').trim(); } catch (e) { return ''; }
  }
  function scpParseSessionUser() {
    var token = scpWorkspaceSession();
    if (!token) return null;
    try {
      var parts = token.split('.');
      if (parts.length < 2) return null;
      var b = parts[0].replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      var jsonStr = decodeURIComponent(atob(b).split('').map(function (c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join(''));
      return JSON.parse(jsonStr);
    } catch (e) { return null; }
  }
  function scpStoreWorkspaceSession(token) { try { window.sessionStorage.setItem(SCP_AUTH_SESSION_KEY, String(token || '')); } catch (e) {} }
  function scpClearWorkspaceSession() { try { window.sessionStorage.removeItem(SCP_AUTH_SESSION_KEY); } catch (e) {} }
  function scpConsumeWorkspaceSession() {
    var raw = String(location.hash || '');
    if (!raw.startsWith('#scp_session=')) return false;
    var token = '';
    try { token = decodeURIComponent(raw.slice('#scp_session='.length)); } catch (e) {}
    if (token) scpStoreWorkspaceSession(token);
    history.replaceState(null, '', location.pathname + location.search + '#dashboard');
    return !!token;
  }
  function scpAuthBridgeReady() {
    return /^https:\/\/script\.google\.com\/(?:a\/macros\/shopee\.com\/|macros\/)s\/AKfy[A-Za-z0-9_-]+\/exec$/i.test(SCP_AUTH_BRIDGE_URL);
  }
  function scpStartWorkspaceLogin() {
    scpClearWorkspaceSession();
    if (!scpAuthBridgeReady()) { toast('Workspace login bridge is not configured.', 'error'); return; }
    location.replace(SCP_AUTH_BRIDGE_URL + '?action=login&_=' + Date.now());
  }

  /* ============================= */
  /* 5. API LAYER                 */
  /* ============================= */
  var BACKEND_WRITE_ACTIONS = {
    submitRequest: 'req_create',
    updateRequest: 'req_update',
    uploadArtwork: 'artwork_upload',
    createContent: 'content_create',
    createSmartLink: 'link_create',
    saveLookup: 'lookup_save',
    saveBusinessConfig: 'config_save'
  };

  function getFormMeta(payload) {
    var score = 0;
    if (isTrue(payload.urgent)) score += 40;
    if (isTrue(payload.compliance)) score += 35;
    if (isTrue(payload.monetary)) score += 25;
    var tierTS = /compliance|mandatory/i.test(payload.objectiveType || '') ? 'A+' : 'B';
    var level = score >= 70 ? 'P0 Critical' : score >= 45 ? 'P1 High' : score >= 25 ? 'P2 Medium' : 'P3 Normal';
    var recommendations = (payload.channels || []).slice(0, 4).map(function (c) { return { asset: c, eligible: true, mandatory: artworkRuleForAsset(c).required === 'REQUIRED' ? true : false }; });
    return { priority: { level: level, score: score }, campaignGrade: { ts: tierTS, ns: tierTS }, recommendations: recommendations };
  }

  var LocalDataServer = (function () {
    var data = APP.data;
    return {
      submitRequest: function (payload) {
        var urgent = isTrue(payload.urgent) || payload.requestType === 'URGENT';
        var prefix = urgent ? 'URG' : 'REQ';
        var id = prefix + '-PREVIEW-' + Date.now().toString(36).toUpperCase();
        var meta = getFormMeta(payload);
        var complete = Boolean(payload.department && payload.team && payload.requestor && payload.campaign && payload.startDate && (payload.channels || []).length);
        var row = Object.assign({}, payload, {
          id: id, row: data.requests.length + 2,
          requestType: urgent ? 'URGENT' : 'NORMAL',
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          status: urgent ? 'PENDING_MANAGER_APPROVAL' : (complete ? 'READY_FOR_CUTOFF' : 'INCOMPLETE'),
          completenessStatus: complete ? 'COMPLETE' : 'INCOMPLETE',
          managerApprovalStatus: urgent ? 'PENDING' : 'NOT_REQUIRED',
          priorityLevel: meta.priority.level, priorityScore: meta.priority.score,
          tsTier: meta.campaignGrade.ts, nsTier: meta.campaignGrade.ns,
          owner: urgent ? 'Reporting Manager' : 'Upcoming Cutoff'
        });
        data.requests.unshift(row);
        return clone(row);
      },
      updateRequest: function (payload) {
        var row = data.requests.find(function (x) { return String(x.id) === String(payload.id); });
        if (!row) throw new Error('Request not found.');
        if (payload.status) row.status = payload.status;
        if (payload.note !== undefined) row.reviewNote = payload.note || '';
        Object.keys(payload.fields || {}).forEach(function (k) { row[k] = payload.fields[k]; });
        row.updatedAt = new Date().toISOString();
        return clone(row);
      }
    };
  })();

  var Api = {
    call: function (method) {
      var args = Array.prototype.slice.call(arguments, 1);
      if (window.google && google.script && google.script.run) {
        return new Promise(function (resolve, reject) {
          try {
            var runner = google.script.run
              .withSuccessHandler(resolve)
              .withFailureHandler(function (error) { reject(new Error(error && error.message ? error.message : String(error))); });
            runner[method].apply(runner, args);
          } catch (error) { reject(error); }
        });
      }
      if (BACKEND_WRITE_ACTIONS[method]) return BackendWriteBridge.call(method, args[0] || {});
      if (!LocalDataServer[method]) return Promise.resolve().then(function () { throw new Error('Local API method not implemented: ' + method); });
      return Promise.resolve(LocalDataServer[method].apply(LocalDataServer, args));
    }
  };

  var BackendWriteBridge = (function () {
    function endpoint() {
      try {
        var cfg = (APP.data.businessConfig || []).find(function (x) { return x.id === 'tracker_sync_endpoint'; });
        if (cfg && cfg.value) return cfg.value.trim();
      } catch (e) {}
      return TRACKER_DEFAULT_URL;
    }
    function jsonp(url, action, payload) {
      return new Promise(function (resolve, reject) {
        var cb = '__scpWrite_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        var script = document.createElement('script');
        var cleanup = function () { delete window[cb]; script.remove(); };
        var timeout = setTimeout(function () { cleanup(); reject(new Error('Backend write timed out.')); }, 20000);
        window[cb] = function (r) {
          clearTimeout(timeout); cleanup();
          if (r && r.ok === false) reject(new Error(r.error || 'Backend write failed.'));
          else resolve(r);
        };
        var session = scpWorkspaceSession();
        if (!session) { clearTimeout(timeout); cleanup(); reject(new Error('WORKSPACE_SESSION_REQUIRED')); return; }
        var sep = url.includes('?') ? '&' : '?';
        script.src = url + sep + 'action=' + encodeURIComponent(action) + '&callback=' + encodeURIComponent(cb) + '&payload=' + encodeURIComponent(JSON.stringify(payload || {})) + '&session=' + encodeURIComponent(session) + '&_=' + Date.now();
        script.onerror = function () { clearTimeout(timeout); cleanup(); reject(new Error('Unable to reach backend endpoint.')); };
        document.head.appendChild(script);
      });
    }
    return {
      call: function (method, payload) {
        var action = BACKEND_WRITE_ACTIONS[method] || method;
        return jsonp(endpoint(), action, payload).then(function (r) {
          if (method === 'submitRequest' && r && r.request) return r.request;
          if (method === 'submitRequest' && r && r.id) return r;
          if (method === 'submitRequest') throw new Error('Backend write returned no recorded request.');
          return r;
        });
      }
    };
  })();

  /* ============================= */
  /* 6. DATA LOAD (sync sources)   */
  /* ============================= */
  function mapCloudSnapshotJson(j) {
    if (!j || (!Array.isArray(j.requests) && !Array.isArray(j.sources))) return null;
    var rows = [];
    if (Array.isArray(j.requests)) {
      rows = j.requests.map(function (r, i) {
        return {
          id: String(r.id || r.row || ('CLOUD-' + (i + 1))),
          source: r.source || '', sourceId: String(r.row || ''),
          campaign: r.campaign || r.title || '', title: r.title || '',
          keyMessage: r.content || '', requestor: r.requestor || '', requestorEmail: r.requestor || '',
          department: r.department || '', team: r.team || '',
          objective: r.objective || r.title || '',
          assetType: r.assetType || r.channel || '', channel: r.channel || r.assetType || '',
          status: r.status || 'Pending Review',
          startDate: r.startDate || '', endDate: r.endDate || '',
          preferredTimeSlot: r.preferredTimeSlot || '',
          destinationUrl: '', finalistStatus: r.finalist || '', allocationStatus: r.finalist || '', legacySlot: r.finalist || ''
        };
      });
    } else {
      /* schema selleredu.source-snapshot.v1: sources[] -> sheets[] -> rows[] */
      (j.sources || []).forEach(function (src) {
        (src.sheets || []).forEach(function (sheet) {
          var h = (sheet.headers || []).map(function (x) { return normalize(x); });
          var idx = {
            cutoff: h.findIndex(function (x) { return x === 'cutoff'; }),
            dept: h.findIndex(function (x) { return x === 'campaign department' || x === 'business line'; }),
            campaign: h.findIndex(function (x) { return x.indexOf('campaign name') === 0; }),
            title: h.findIndex(function (x) { return x === 'title (max 40 characters)' || x === 'title'; }),
            content: h.findIndex(function (x) { return x === 'content (max 240 characters)' || x === 'content'; }),
            requestor: h.findIndex(function (x) { return x === 'requestor'; }),
            asset: h.findIndex(function (x) { return x === 'asset type'; }),
            start: h.findIndex(function (x) { return x.indexOf('date') >= 0; })
          };
          (sheet.rows || []).forEach(function (r, i) {
            var normRow = {};
            (sheet.headers || []).forEach(function (hdr, hi) { normRow[normalize(hdr)] = Array.isArray(r) ? r[hi] : (r && r[hdr]); });
            var campaign = normRow[idx.campaign >= 0 ? normalize(sheet.headers[idx.campaign]) : ''] || '';
            var title = normRow[idx.title >= 0 ? normalize(sheet.headers[idx.title]) : ''] || '';
            var content = normRow[idx.content >= 0 ? normalize(sheet.headers[idx.content]) : ''] || '';
            var requestor = normRow[idx.requestor >= 0 ? normalize(sheet.headers[idx.requestor]) : ''] || '';
            var assetType = normRow[idx.asset >= 0 ? normalize(sheet.headers[idx.asset]) : ''] || '';
            if (!campaign && !title) return;
            rows.push({
              id: String('CLD-' + src.key + '-' + (i + 1)), source: src.key, sourceId: String(sheet.returnedRows ? (i + 1) : ''),
              campaign: String(campaign), title: String(title), keyMessage: String(content),
              requestor: String(requestor), requestorEmail: String(requestor),
              department: String(normRow[idx.dept >= 0 ? normalize(sheet.headers[idx.dept]) : ''] || ''),
              team: '', objective: String(title), assetType: String(assetType), channel: String(assetType),
              status: 'Pending Review', startDate: String(normRow[idx.start >= 0 ? normalize(sheet.headers[idx.start]) : ''] || ''),
              endDate: '', preferredTimeSlot: '', destinationUrl: String(normRow['destination link'] || ''),
              finalistStatus: '', allocationStatus: '', legacySlot: ''
            });
          });
        });
      });
    }
    return {
      data: {
        requests: rows,
        meta: { mode: 'cloud', source: 'Cloud Snapshot', sourceType: 'cloud', requestCount: rows.length, qualityGate: 'CLOUD-V1', sourceUpdatedAt: j.generatedAt || '', lastSuccessfulSyncAt: j.generatedAt || '', cloudRowCount: rows.length, cloudSourceCount: (j.sources || []).length }
      }
    };
  }

  var PortalSync = (function () {
    function endpoint() {
      try {
        var cfg = (APP.data.businessConfig || []).find(function (x) { return x.id === 'tracker_sync_endpoint'; });
        if (cfg && cfg.value) return cfg.value.trim();
      } catch (e) {}
      return TRACKER_DEFAULT_URL;
    }
    function jsonp(url, action) {
      return new Promise(function (resolve, reject) {
        var cb = '__portalSync_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        var script = document.createElement('script');
        var cleanup = function () { delete window[cb]; script.remove(); };
        var timeout = setTimeout(function () { cleanup(); reject(new Error('Tracker sync timed out.')); }, 20000);
        window[cb] = function (payload) {
          clearTimeout(timeout); cleanup();
          if (payload && payload.ok === false) reject(new Error(payload.error || 'Tracker sync failed.'));
          else resolve(payload);
        };
        var session = scpWorkspaceSession();
        if (!session) { clearTimeout(timeout); cleanup(); return reject(new Error('WORKSPACE_SESSION_REQUIRED')); }
        var sep = url.includes('?') ? '&' : '?';
        script.src = url + sep + 'action=' + encodeURIComponent(action) + '&callback=' + encodeURIComponent(cb) + '&session=' + encodeURIComponent(session) + '&_=' + Date.now();
        script.onerror = function () { clearTimeout(timeout); cleanup(); reject(new Error('Unable to reach Tracker sync endpoint.')); };
        document.head.appendChild(script);
      });
    }
    async function staticSnapshot() {
      var res = await fetch(STATIC_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('Unable to load static snapshot (' + res.status + ').');
      return res.json();
    }
    async function cloudSnapshot() {
      for (var i = 0; i < CLOUD_URLS.length; i++) {
        var u = CLOUD_URLS[i];
        if (!u) continue;
        try {
          var res = await fetch(u, { cache: 'no-store' });
          if (!res.ok) continue;
          var json = await res.json();
          var mapped = mapCloudSnapshotJson(json);
          if (mapped && mapped.data.requests.length) return mapped;
        } catch (e) { console.warn('Cloud snapshot unavailable:', u, e); }
      }
      return null;
    }
    async function liveSync() {
      var url = endpoint();
      if (!url) return null;
      var payload = await jsonp(url, 'portalData');
      if (payload && payload.requests) return { data: { requests: payload.requests, meta: { mode: 'live', source: 'Workspace Tracker', sourceType: 'live' } } };
      return null;
    }
    return {
      endpoint: endpoint,
      load: async function () {
        var live = null;
        if (scpWorkspaceSession()) {
          try { live = await liveSync(); } catch (e) { console.warn('Live sync unavailable:', e); }
        }
        if (live && live.data.requests.length) {
          APP.data.requests = live.data.requests;
          return { mode: 'live', meta: live.data.meta };
        }
        var cloud = null;
        try { cloud = await cloudSnapshot(); } catch (e) {}
        if (cloud && cloud.data.requests.length) {
          APP.data.requests = cloud.data.requests;
          return { mode: 'cloud', meta: cloud.data.meta };
        }
        APP.data.requests = [];
        return { mode: 'static', meta: { mode: 'static' } };
      }
    };
  })();

  /* ============================= */
  /* 7. RENDER                    */
  /* ============================= */
  function artworkRuleForAsset(asset) {
    var base = ARTWORK_RULES.find(function (x) { return x.match.test(String(asset || '')); }) || ARTWORK_RULES[ARTWORK_RULES.length - 1];
    return base;
  }
  function pill(status) {
    var s = String(status || '').toUpperCase();
    var cls = 'pill-gray';
    if (/READY|COMPLETE|PASS|APPROVED|SUBMITTED/.test(s)) cls = 'pill-green';
    if (/PENDING|REVIEW/.test(s)) cls = 'pill-amber';
    if (/URGENT|FAIL|REJECT|OVERDUE/.test(s)) cls = 'pill-red';
    if (/CUTOFF/.test(s)) cls = 'pill-blue';
    return '<span class="pill ' + cls + '">' + esc(status || '—') + '</span>';
  }
  function requestRows() {
    return (APP.data.requests || []).slice();
  }
  function renderDashboard() {
    var rs = requestRows();
    document.getElementById('statTotal').textContent = rs.length;
    document.getElementById('statPending').textContent = rs.filter(function (r) { return /PENDING|REVIEW/i.test(r.status || ''); }).length;
    document.getElementById('statApproved').textContent = rs.filter(function (r) { return /READY|APPROVED|COMPLETE|SUBMITTED/i.test(r.status || ''); }).length;
    document.getElementById('statUrgent').textContent = rs.filter(function (r) { return /URGENT/i.test(r.status || ''); }).length;
    var wrap = document.getElementById('dashboardRecent');
    var recent = rs.slice(0, 6);
    if (!recent.length) { wrap.innerHTML = '<div class="empty-state"><span class="material-symbols-rounded">inbox</span><p>' + t('requests.empty') + '</p></div>'; return; }
    wrap.innerHTML = recent.map(function (r) {
      return '<div class="recent-row"><span class="table-id">' + esc(r.id) + '</span><strong>' + esc(r.campaign) + '</strong><span class="muted">' + esc(r.assetType || r.channel || '') + '</span><span class="muted">—</span>' + pill(r.status) + '</div>';
    }).join('');
  }
  function statusOptions() {
    var seen = {};
    requestRows().forEach(function (r) { if (r.status && !seen[String(r.status)]) { seen[String(r.status)] = true; } });
    return Object.keys(seen).map(function (s) { return '<option value="' + attr(s) + '">' + esc(s) + '</option>'; }).join('');
  }
  function renderRequests() {
    var q = normalize(document.getElementById('requestSearch').value);
    var status = document.getElementById('requestStatusFilter').value;
    var rows = requestRows().filter(function (r) {
      if (status && String(r.status) !== status) return false;
      if (q) {
        var hay = normalize([r.campaign, r.requestor, r.id, r.assetType].join(' '));
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var tbody = document.getElementById('requestsTable');
    var empty = document.getElementById('requestsEmpty');
    document.getElementById('requestCount').textContent = rows.length + ' matching';
    if (!rows.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    tbody.innerHTML = rows.map(function (r) {
      return '<tr>' +
        '<td><span class="table-id">' + esc(r.id) + '</span></td>' +
        '<td><strong>' + esc(r.campaign) + '</strong>' + (r.title ? '<div class="muted" style="font-size:11px">' + esc(r.title) + '</div>' : '') + '</td>' +
        '<td>' + esc(r.assetType || r.channel || '—') + '</td>' +
        '<td>' + esc(r.requestor || '—') + '</td>' +
        '<td>' + esc(r.department || '—') + '</td>' +
        '<td>' + esc(r.priorityLevel || '—') + '</td>' +
        '<td>' + esc((r.startDate || '—').slice(0, 10)) + '</td>' +
        '<td>' + pill(r.status) + '</td>' +
      '</tr>';
    }).join('');
  }
  function setSyncMeta(meta) {
    var el = document.getElementById('sourceMeta');
    if (!el) return;
    if (!meta) { el.textContent = 'static'; el.className = 'pill pill-gray'; }
    else if (meta.mode === 'live') { el.textContent = 'live tracker'; el.className = 'pill pill-green'; }
    else if (meta.mode === 'cloud') { el.textContent = 'cloud snapshot'; el.className = 'pill pill-blue'; }
    else { el.textContent = 'static'; el.className = 'pill pill-gray'; }
  }
  function renderAll() {
    renderDashboard();
    renderRequests();
  }

  /* ============================= */
  /* 8. REQUEST FORM (wizard)      */
  /* ============================= */
  function channelPickerHtml(user) {
    var requester = true;
    return '<div class="channel-picker">' + CHANNEL_CATALOG.map(function (group) {
      return '<section class="channel-group-card"><h4>' + esc(group.label) + '</h4>' + group.items.map(function (item) {
        var blocked = requester && !item.selectable;
        return '<label class="channel-check' + (blocked ? ' locked' : '') + '"><input type="checkbox" name="channels" value="' + attr(item.label) + '"' + (blocked ? ' disabled' : '') + '><span><strong>' + esc(item.label) + '</strong>' + (item.importantOnly ? '<span class="lock-copy">Important Announcement — Comms assign only</span>' : '') + (group.massOnly ? '<span class="lock-copy">Mass communication — no seller target file</span>' : '') + '</span></label>';
      }).join('') + '</section>';
    }).join('') + '</div>';
  }
  function syncDynamicRequestForm(form) {
    var channels = Array.prototype.map.call(form.querySelectorAll('[name="channels"]:checked'), function (x) { return x.value; });
    var socialOnly = channels.length > 0 && channels.every(function (c) { return CHANNEL_CATALOG.find(function (g) { return g.key === 'SOCIAL_MEDIA'; }).items.some(function (i) { return i.label === c; }); });
    var eduOnly = channels.length > 0 && channels.every(function (c) { return CHANNEL_CATALOG.find(function (g) { return g.key === 'SELLER_EDU_HUB'; }).items.some(function (i) { return i.label === c; }); });
    var assetSelect = document.getElementById('requestAssetSelect');
    var selectedChannels = channels;
    if (assetSelect) {
      var prev = assetSelect.value;
      assetSelect.innerHTML = requestAssetOptionsHtml(selectedChannels);
      if (prev && selectedChannels.indexOf(prev) >= 0) assetSelect.value = prev;
    }
    var sellerScopeField = document.getElementById('sellerScopeField');
    var targetFileField = document.getElementById('targetFileField');
    if (sellerScopeField) sellerScopeField.classList.toggle('hidden', socialOnly || eduOnly);
    if (targetFileField) {
      targetFileField.classList.toggle('hidden', socialOnly || eduOnly || form.elements.sellerScope.value !== 'Specific Seller List');
      if (form.elements.targetFile) form.elements.targetFile.required = !(socialOnly || eduOnly) && form.elements.sellerScope.value === 'Specific Seller List';
    }
    var dynamic = document.getElementById('channelDynamicFields');
    var blocks = [];
    if (channels.indexOf('Email') >= 0) blocks.push('<div class="detail-card"><h4>Email Requirements</h4><div class="form-grid"><div class="form-field"><label>Email Type</label><select name="emailType"><option>Mass</option><option>Targeted</option></select></div><div class="form-field"><label>Email Brief / Draft Link *</label><input name="emailBrief" placeholder="Google Drive / Doc URL"></div></div></div>');
    if (channels.some(function (c) { return /^\[PC\]|^\[APP\]/.test(c); })) blocks.push('<div class="detail-card"><h4>' + esc(channels.find(function (c) { return /^\[PC\]/.test(c); }) || '[PC]') + ' Requirements</h4><div class="form-grid"><div class="form-field"><label>Title <span class="muted">max 40</span></label><input name="scTitle" maxlength="40"></div><div class="form-field"><label>Time-Sensitive?</label><select name="timeSensitive"><option>No</option><option>Yes</option></select></div><div class="form-field full"><label>Content <span class="muted">max 240</span></label><textarea name="scContent" maxlength="240"></textarea></div></div></div>');
    if (channels.some(function (c) { return ['Facebook Page / Facebook Group', 'LINE Broadcast', 'YouTube', 'IG', 'TikTok', 'X'].indexOf(c) >= 0; })) blocks.push('<div class="detail-card"><h4>Social Media Requirements</h4><div class="form-grid"><div class="form-field"><label>Publish Date / Time</label><input name="socialPublishAt" type="datetime-local"></div><div class="form-field"><label>Content Material</label><input name="socialMaterial" placeholder="Artwork / Video / Script link"></div></div></div>');
    if (channels.some(function (c) { return ['Seller Article', 'Seller Blog'].indexOf(c) >= 0; })) blocks.push('<div class="detail-card"><h4>Seller Education Hub</h4><div class="form-field"><label>Request Action</label><select name="eduAction"><option>Create New</option><option>Edit / Revise</option><option>Review</option><option>Unpublish</option></select></div></div>');
    if (dynamic) dynamic.innerHTML = blocks.join('');
  }
  function requestAssetOptionsHtml(channels) {
    if (!channels || !channels.length) return '<option value="">Select a channel first...</option>';
    var seen = {};
    var opts = [];
    CHANNEL_CATALOG.forEach(function (group) {
      group.items.forEach(function (item) {
        if (channels.indexOf(item.label) < 0 || seen[item.label]) return;
        seen[item.label] = true;
        opts.push('<option value="' + attr(item.label) + '">' + esc(item.label) + ' (Sample)</option>');
      });
    });
    return opts.join('') || '<option value="">Select a channel first...</option>';
  }
  function buildRequestFormHtml(user) {
    var u = user || { email: '', department: 'BD' };
    return '<form id="requestForm" class="request-wizard">' +
      '<section class="detail-card"><h4>Request Context</h4><div class="form-grid">' +
      '<div class="form-field full"><label>Campaign Name *</label><input name="campaign" required placeholder="Campaign / project name"></div>' +
      '<div class="form-field"><label>Department *</label><select name="department" required>' + optionsHtml(MASTER_DEPARTMENTS, u.department) + '</select></div>' +
      '<div class="form-field"><label>Team / Sub Team *</label><input name="team" required placeholder="Your team / sub-team"></div>' +
      '<div class="form-field full"><label>Requester</label><input name="requestor" value="' + attr(u.email || '') + '" readonly></div>' +
      '</div></section>' +
      '<section class="detail-card"><h4>Requested Communication</h4>' +
      '<div class="form-note">Requester may select multiple standard channels. PN / PC Notice / APP Notice are intentionally hidden — allocated by Admin/Comms for Important Announcements.</div>' +
      channelPickerHtml(u) +
      '<div class="form-field" style="margin-top:12px"><label>Primary Asset Type</label><select name="sourceAssetType" id="requestAssetSelect"><option value="">Select a channel first...</option></select><small>Sample assets update automatically from the channels selected above.</small></div>' +
      '<div id="channelDynamicFields" class="form-grid" style="margin-top:12px"></div>' +
      '</section>' +
      '<section class="detail-card"><h4>Content & Objective</h4><div class="form-grid">' +
      '<div class="form-field full"><label>Communication Objective Type *</label><select name="objectiveType" required><option value="">Select objective type…</option><option>Compliance / Mandatory</option><option>Platform Strategic Focus</option><option>Seller Experience / Ops Enablement / Others</option></select></div>' +
      '<div class="form-field full"><label>Objective / Business Context *</label><textarea name="objective" required placeholder="What should the seller know or do after receiving this message?"></textarea></div>' +
      '<div class="form-field full"><label>Key Message / Content *</label><textarea name="detail" required placeholder="Main message, required action, focus points, notes…"></textarea></div>' +
      '<div class="form-field"><label>Compliance check required?</label><select name="compliance"><option value="false">No</option><option value="true">Yes</option></select></div>' +
      '<div class="form-field"><label>Does seller risk losing money?</label><select name="monetary"><option value="false">No</option><option value="true">Yes</option></select></div>' +
      '<div class="form-field full"><label>Destination Link</label><input name="destinationUrl" type="url" placeholder="https://..."></div>' +
      '<div class="form-field full"><label>Creative / Media File</label><input name="artworkUrl" type="hidden"><input name="artworkFile" type="file" accept="image/png,image/jpeg,image/webp"><small>Upload from your computer — system checks file size & resolution before submit.</small><div id="newRequestArtworkInspection" class="artwork-inspection">Select an image when the selected asset type requires a creative file.</div></div>' +
      '</div></section>' +
      '<section class="detail-card"><h4>Target Audience</h4><div class="form-grid">' +
      '<div class="form-field" id="sellerScopeField"><label>Seller Scope</label><select name="sellerScope">' + optionsHtml(MASTER_SELLER_SCOPES, 'All Platform Sellers') + '</select></div>' +
      '<div class="form-field hidden" id="targetFileField"><label>Seller Target File / Link *</label><input name="targetFile" placeholder="CSV or Google Drive link"></div>' +
      '<div class="form-field full"><label>Audience / Target Criteria</label><textarea name="targetCriteria" placeholder="Describe the intended audience or target criteria."></textarea></div>' +
      '</div></section>' +
      '<section class="detail-card"><h4>Schedule</h4><div class="form-grid">' +
      '<div class="form-field"><label>Preferred / Start Date *</label><input name="startDate" type="date" value="' + addDaysIso(7) + '" required></div>' +
      '<div class="form-field"><label>Preferred Comms Time Window</label><select name="preferredTimeSlot"><option value="NO_PREFERENCE">No preference</option><option value="09:00-11:59">09:00 - 11:59</option><option value="12:00-14:59">12:00 - 14:59</option><option value="15:00-17:59">15:00 - 17:59</option><option value="18:00-20:59">18:00 - 20:59</option></select></div>' +
      '<div class="form-field full"><label>End Date</label><input name="endDate" type="date" value="' + addDaysIso(14) + '"></div>' +
      '</div></section>' +
      '<div id="requestMeta"></div>' +
      '<div class="form-actions"><button class="btn btn-secondary" type="button" id="previewRequestScope">Check readiness</button><button class="btn btn-primary" type="submit"><span class="material-symbols-rounded">send</span>Submit Request</button></div>' +
      '</form>';
  }

  function inspectImageFile(file, asset) {
    return new Promise(function (resolve) {
      var rule = artworkRuleForAsset(asset);
      var out = { fileName: file.name, mimeType: file.type, size: file.size, width: 0, height: 0, rule: rule };
      if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) { out.status = 'FAIL'; out.message = 'Unsupported image type. Use PNG, JPG/JPEG or WebP.'; return resolve(out); }
      if (file.size > 10 * 1048576) { out.status = 'FAIL'; out.message = 'File is ' + (file.size / 1048576).toFixed(1) + ' MB; current technical limit is 10 MB.'; return resolve(out); }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        out.width = img.naturalWidth; out.height = img.naturalHeight;
        out.status = 'PASS'; out.message = 'Passed: ' + out.width + '×' + out.height + 'px — ' + (file.size / 1048576).toFixed(2) + ' MB.';
        resolve(out);
      };
      img.onerror = function () { URL.revokeObjectURL(url); out.status = 'FAIL'; out.message = 'Could not read image file.'; resolve(out); };
      img.src = url;
    });
  }
  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '').split(',')[1] || ''); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function submitRequestForm(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var values = Object.fromEntries(new FormData(form).entries());
    var selectedChannels = Array.prototype.map.call(form.querySelectorAll('[name="channels"]:checked'), function (x) { return x.value; });
    if (!selectedChannels.length) { toast('Select at least one Communication Channel.', 'error'); return; }
    values.channels = selectedChannels;
    values.assetType = values.channels.join(', ');
    values.urgent = false;
    values.compliance = isTrue(values.compliance);
    values.monetary = isTrue(values.monetary);
    values.managerConsentStatus = 'NOT_REQUIRED';
    var artworkFile = form.elements.artworkFile && form.elements.artworkFile.files && form.elements.artworkFile.files[0] || null;
    var requiredAsset = selectedChannels.find(function (c) { return artworkRuleForAsset(c).required === 'REQUIRED'; });
    if (requiredAsset && !artworkFile && !values.artworkUrl) { toast('Artwork is required for ' + requiredAsset + '. Upload the image before submitting.', 'error'); return; }
    if (artworkFile && form.__artworkInspection && form.__artworkInspection.status === 'FAIL') { toast('Artwork technical validation failed. Fix the image before submitting.', 'error'); return; }
    var submitBtn = form.querySelector('[type="submit"]');
    submitBtn.disabled = true;
    try {
      var result = await Api.call('submitRequest', values);
      if (artworkFile) {
        var inspection = form.__artworkInspection || await inspectImageFile(artworkFile, requiredAsset || selectedChannels[0] || '');
        var base64 = await fileToBase64(artworkFile);
        try { await Api.call('uploadArtwork', { requestId: result.id, assetType: requiredAsset || selectedChannels[0] || '', fileName: artworkFile.name, mimeType: artworkFile.type, fileSize: artworkFile.size, width: inspection.width, height: inspection.height, validationStatus: inspection.status, validationMessage: inspection.message, base64: base64 }); } catch (e) { console.warn('Artwork upload failed:', e); }
      }
      closeModal();
      await loadPortalData(true);
      showPage('requests');
      toast('Request ' + result.id + ' submitted successfully.', 'success');
    } catch (error) {
      toast(error.message || String(error), 'error');
      submitBtn.disabled = false;
    }
  }

  function openNewRequestModal() {
    var user = APP.user || { email: 'not-signed-in@shopee.com', department: 'BD' };
    openModal('New Request', buildRequestFormHtml(user));
    var form = document.getElementById('requestForm');
    if (!form) return;
    var sync = function () { syncDynamicRequestForm(form); };
    form.addEventListener('change', sync);
    var artworkInput = form.elements.artworkFile;
    if (artworkInput) {
      artworkInput.addEventListener('change', async function (e) {
        var file = e.target.files && e.target.files[0];
        var channels = Array.prototype.map.call(form.querySelectorAll('[name="channels"]:checked'), function (x) { return x.value; });
        var asset = channels.find(function (c) { return artworkRuleForAsset(c).required === 'REQUIRED'; }) || channels[0] || '';
        var box = document.getElementById('newRequestArtworkInspection');
        if (!file) { form.__artworkInspection = null; box.textContent = 'No file selected.'; return; }
        box.textContent = 'Inspecting image…';
        var result = await inspectImageFile(file, asset);
        form.__artworkInspection = result;
        box.className = 'artwork-inspection ' + (result.status === 'PASS' ? 'good' : result.status === 'WARN' ? 'warn' : 'bad');
        box.textContent = result.message;
      });
    }
    form.addEventListener('submit', submitRequestForm);
    document.getElementById('previewRequestScope').addEventListener('click', function () {
      sync();
      toast('Request scope validated against current preview rules.', 'success');
    });
    sync();
  }

  /* ============================= */
  /* 9. MODAL & SHELL             */
  /* ============================= */
  function openModal(title, bodyHtml) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHtml;
    document.getElementById('modal').classList.remove('hidden');
  }
  function closeModal() {
    document.getElementById('modal').classList.add('hidden');
    document.getElementById('modalBody').innerHTML = '';
  }
  function showPage(name) {
    APP.page = name;
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
    var target = document.getElementById('page-' + name);
    if (target) target.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(function (b) { b.classList.toggle('active', b.dataset.page === name); });
    renderAll();
  }
  function toast(message, type) {
    type = type || 'info';
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    var icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info';
    el.innerHTML = '<span class="material-symbols-rounded">' + icon + '</span>' + esc(message);
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
  }
  function renderUser() {
    var u = APP.user;
    var nameEl = document.getElementById('userName');
    if (u && u.email) {
      nameEl.textContent = u.name ? (u.name + ' · ' + u.email) : u.email;
    } else if (u) {
      nameEl.textContent = u.name || 'Signed in';
    } else {
      nameEl.textContent = 'Not signed in';
    }
  }

  /* ============================= */
  /* 10. DATA LOAD WRAPPER        */
  /* ============================= */
  async function loadPortalData(silent) {
    if (!silent) {
      var gate = document.getElementById('bootGate');
      if (gate) { gate.classList.remove('hidden'); document.getElementById('bootStatus').textContent = 'Loading workspace data…'; }
    }
    try {
      var result = await PortalSync.load();
      setSyncMeta(result.meta);
    } catch (e) {
      console.warn('Data load fallback to empty.', e);
      APP.data.requests = [];
      setSyncMeta(null);
    }
    renderAll();
    var gate2 = document.getElementById('bootGate');
    if (gate2) gate2.classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    updateSyncPill();
  }
  function updateSyncPill() {
    var el = document.getElementById('syncPill');
    if (scpWorkspaceSession() && APP.user) { el.textContent = 'WS secured'; el.style.cssText = 'background:#e6f4ea;color:#188038'; }
    else { el.textContent = 'preview'; el.style.cssText = 'background:#eaf2ff;color:#1876e5'; }
  }

  /* ============================= */
  /* 11. BOOT                     */
  /* ============================= */
  function bindUserChip() {
    document.getElementById('userChip').addEventListener('click', function () {
      if (!scpWorkspaceSession()) { scpStartWorkspaceLogin(); } else { toast('Signed in with Workspace session.', 'success'); }
    });
  }
  function bindShell() {
    document.querySelectorAll('.nav-item').forEach(function (btn) {
      btn.addEventListener('click', function () { showPage(btn.dataset.page); });
    });
    document.querySelectorAll('#newRequestBtn, #newRequestBtn2').forEach(function (btn) {
      btn.addEventListener('click', openNewRequestModal);
    });
    document.getElementById('langToggle').addEventListener('click', function () {
      APP.lang = APP.lang === 'EN' ? 'TH' : 'EN';
      applyI18n();
    });
    document.getElementById('requestSearch').addEventListener('input', renderRequests);
    document.getElementById('requestStatusFilter').addEventListener('change', renderRequests);
    document.getElementById('requestStatusFilter').innerHTML = statusOptions();
    document.querySelectorAll('[data-close]').forEach(function (el) { el.addEventListener('click', closeModal); });
    document.getElementById('modal').addEventListener('click', function (e) { if (e.target === e.currentTarget) closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
  }
  async function boot() {
    var hadSession = scpConsumeWorkspaceSession() || !!scpWorkspaceSession();
    if (hadSession) APP.user = scpParseSessionUser();
    bindShell();
    applyI18n();
    renderUser();
    if (scpWorkspaceSession()) updateSyncPill();
    await loadPortalData(false);
  }
  document.addEventListener('DOMContentLoaded', boot);
})();