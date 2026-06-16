/* ════════════════════════════════════════════════════════════════════════════
   CALENDAR  —  per-user calendar / tasks / habits / projects
   Ported from Cadence (React) to vanilla JS so it drops into Paheyli's
   zero-build static frontend. Talks to /api/calendar with the JWT that
   Paheyli already stores (Authorization: Bearer …), so every account sees
   only its own data.
   Depends on these globals defined in index.html: apiGet, apiPut, apiPost,
   apiDel, getUser, toast.
════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── date helpers ───────────────────────────────────────────────────────── */
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var ymd = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var parseYmd = function (s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  var sameDay = function (a, b) { return ymd(a) === ymd(b); };
  var startOfWeek = function (d, ws) { ws = ws || 0; var x = new Date(d); var diff = (x.getDay() - ws + 7) % 7; x.setDate(x.getDate() - diff); x.setHours(0,0,0,0); return x; };
  var addDays = function (d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; };
  var startOfMonth = function (d) { return new Date(d.getFullYear(), d.getMonth(), 1); };
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var WD_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var weekdayLabels = function (ws) { ws = ws || 0; return Array.from({ length: 7 }, function (_, i) { return WD[(i + ws) % 7]; }); };
  var uid = function () { return Math.random().toString(36).slice(2, 10); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); };

  /* ── domain config ──────────────────────────────────────────────────────── */
  // Inline SVG icons (lucide-style), keyed so markup can request them by name.
  var ICONS = {
    task:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 12 2 2 4-4"/></svg>',
    event:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    reminder:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    habit:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
    bell:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    repeat:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>',
    flag:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
    check:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    x:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    plus:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5v14"/></svg>',
    chevL:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    chevR:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
    inbox:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
    folder:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><path d="M2 10h20"/></svg>',
    clock:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    trash:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    corner:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg>',
    cal:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>'
  };
  var svg = function (name) { return ICONS[name] || ''; };

  var TYPES = {
    task:     { label: 'Task',     color: '#2563eb', icon: 'task' },
    event:    { label: 'Event',    color: '#eab308', icon: 'event' },
    reminder: { label: 'Reminder', color: '#9333ea', icon: 'reminder' },
    habit:    { label: 'Habit',    color: '#0d9488', icon: 'habit' }
  };
  var HABIT_ICON = svg('habit'); // single icon for habits in this port

  var itemColor = function (it, projOf) {
    if (it.projectId && projOf) { var p = projOf(it.projectId); if (p) return p.color; }
    return TYPES[it.type].color;
  };
  var PRIORITIES = {
    high:   { label: 'High',   color: '#dc2626' },
    medium: { label: 'Medium', color: '#f59e0b' },
    low:    { label: 'Low',    color: '#10b981' },
    none:   { label: 'None',   color: '#cbd5e1' }
  };
  var PRIO_RANK = { high: 0, medium: 1, low: 2, none: 3 };
  var PROJ_COLORS = ['#5b4bdb','#0ea5e9','#0d9488','#f59e0b','#e11d48','#db2777','#7c3aed','#16a34a'];

  /* ── recurrence ─────────────────────────────────────────────────────────── */
  function occursOn(item, d) {
    if (item.backlog || !item.date) return false;
    var start = parseYmd(item.date);
    var day = new Date(d); day.setHours(0,0,0,0);
    if (day < start) return false;
    var r = item.recurrence;
    if (!r || r.type === 'none') return sameDay(start, day);
    if (r.type === 'daily') return true;
    if (r.type === 'weekly') return day.getDay() === start.getDay();
    if (r.type === 'custom') return r.days && r.days.indexOf(day.getDay()) >= 0;
    return false;
  }
  var timeRange = function (it) {
    if (!it.time) return '';
    return (it.endTime && it.endTime > it.time) ? (it.time + '–' + it.endTime) : it.time;
  };
  var sortItems = function (a, b) {
    var ta = a.time || '', tb = b.time || '';
    if (ta && tb) { if (ta !== tb) return ta.localeCompare(tb); }
    else if (ta) return -1;
    else if (tb) return 1;
    return PRIO_RANK[a.priority || 'none'] - PRIO_RANK[b.priority || 'none'];
  };

  /* ── API client (uses Paheyli's apiFetch helpers + JWT) ─────────────────── */
  var CalAPI = {
    getItems:       function () { return apiGet('/api/calendar/items').then(unwrap([])); },
    saveItem:       function (it) { return apiPut('/api/calendar/items', it).then(unwrap(it)); },
    deleteItem:     function (id) { return apiDel('/api/calendar/items/' + id); },
    getProjects:    function () { return apiGet('/api/calendar/projects').then(unwrap([])); },
    saveProject:    function (p) { return apiPut('/api/calendar/projects', p).then(unwrap(p)); },
    deleteProject:  function (id) { return apiDel('/api/calendar/projects/' + id); },
    getDone:        function () { return apiGet('/api/calendar/completions').then(unwrap({})); },
    setStatus:      function (itemId, date, status) { return apiPost('/api/calendar/completions', { itemId: itemId, date: date, status: status }); }
  };
  function unwrap(fallback) {
    return function (r) {
      if (r && r.ok) return r.data;
      if (r && r.status === 401) { toast && toast('Please sign in to use the calendar.'); }
      else if (r && r.data && r.data.error) { toast && toast(r.data.error); }
      return fallback;
    };
  }

  /* ── state ──────────────────────────────────────────────────────────────── */
  var S = {
    view: 'month',
    cursor: new Date(),
    items: [],
    projects: [],
    done: {},
    loaded: false,
    panel: null,            // 'projects' | 'habits' | 'inbox' | null
    projectFilter: null,
    weekStart: 1,
    modal: null,            // { item } | null
    projModal: null         // { project } | null
  };

  /* ── status helpers ─────────────────────────────────────────────────────── */
  function statusOf(id, d) { return S.done[id + '|' + ymd(d)] || null; }
  function isDone(id, d) { return S.done[id + '|' + ymd(d)] === 'done'; }
  function statusOfBacklog(id) { return S.done[id + '|backlog'] || null; }
  function isBacklogDone(id) { return S.done[id + '|backlog'] === 'done'; }

  function cycle(key, persistDate) {
    var cur = S.done[key], next;
    if (!cur) { S.done[key] = 'done'; next = 'done'; }
    else if (cur === 'done') { S.done[key] = 'skip'; next = 'skip'; }
    else { delete S.done[key]; next = null; }
    var id = key.split('|')[0];
    CalAPI.setStatus(id, persistDate, next);
    render();
  }
  function cycleStatus(id, d) { cycle(id + '|' + ymd(d), ymd(d)); }
  function toggleBacklogDone(id) { cycle(id + '|backlog', 'backlog'); }

  /* ── item / project mutations ───────────────────────────────────────────── */
  function saveItem(it) {
    var exists = S.items.some(function (x) { return x.id === it.id; });
    S.items = exists ? S.items.map(function (x) { return x.id === it.id ? it : x; }) : S.items.concat([it]);
    S.modal = null;
    CalAPI.saveItem(it);
    render();
  }
  function deleteItem(id) {
    S.items = S.items.filter(function (x) { return x.id !== id; });
    S.modal = null;
    CalAPI.deleteItem(id);
    render();
  }
  function carryOver(id, toDate) {
    toDate = toDate || new Date();
    var moved = null;
    S.items = S.items.map(function (x) { if (x.id === id) { moved = Object.assign({}, x, { date: ymd(toDate) }); return moved; } return x; });
    if (moved) CalAPI.saveItem(moved);
    render();
  }
  function overdueTasks(ref) {
    var refStart = new Date(ref); refStart.setHours(0,0,0,0);
    return S.items.filter(function (it) {
      return it.type === 'task' && !it.backlog && it.date &&
        (!it.recurrence || it.recurrence.type === 'none') &&
        parseYmd(it.date) < refStart &&
        !statusOf(it.id, parseYmd(it.date));
    });
  }
  function saveProject(p) {
    var exists = S.projects.some(function (x) { return x.id === p.id; });
    S.projects = exists ? S.projects.map(function (x) { return x.id === p.id ? p : x; }) : S.projects.concat([p]);
    S.projModal = null;
    CalAPI.saveProject(p);
    render();
  }
  function deleteProject(id) {
    S.projects = S.projects.filter(function (x) { return x.id !== id; });
    S.items = S.items.map(function (it) { return it.projectId === id ? Object.assign({}, it, { projectId: null }) : it; });
    if (S.projectFilter === id) S.projectFilter = null;
    S.projModal = null;
    CalAPI.deleteProject(id);
    render();
  }
  function projOf(id) { return S.projects.filter(function (p) { return p.id === id; })[0]; }

  function projectStats(pid) {
    var its = S.items.filter(function (i) { return i.projectId === pid && (i.type === 'task' || i.type === 'habit'); });
    if (its.length === 0) return { total: 0, complete: 0, pct: 0 };
    var today = new Date(); today.setHours(0,0,0,0);
    var isComplete = function (i) {
      if (i.backlog) return isBacklogDone(i.id);
      var recurring = i.recurrence && i.recurrence.type !== 'none';
      if (!recurring) return i.date ? isDone(i.id, parseYmd(i.date)) : false;
      if (occursOn(i, today)) return isDone(i.id, today);
      for (var k = 1; k <= 31; k++) { var d = addDays(today, -k); if (occursOn(i, d)) return isDone(i.id, d); }
      return false;
    };
    var complete = its.filter(isComplete).length;
    return { total: its.length, complete: complete, pct: Math.round((complete / its.length) * 100) };
  }
  function habitStats(habit, windowDays, stripDays) {
    windowDays = windowDays || 30; stripDays = stripDays || 21;
    var today = new Date(); today.setHours(0,0,0,0);
    var scheduled = [];
    for (var i = windowDays - 1; i >= 0; i--) { var d = addDays(today, -i); if (occursOn(habit, d)) scheduled.push(d); }
    var doneOn = function (dd) { return statusOf(habit.id, dd) === 'done'; };
    var total = scheduled.length;
    var completed = scheduled.filter(doneOn).length;
    var pct = total ? Math.round((completed / total) * 100) : 0;
    var current = 0;
    for (var j = scheduled.length - 1; j >= 0; j--) { if (doneOn(scheduled[j])) current++; else break; }
    var longest = 0, run = 0;
    scheduled.forEach(function (dd) { if (doneOn(dd)) { run++; longest = Math.max(longest, run); } else run = 0; });
    var strip = scheduled.slice(-stripDays).map(function (dd) {
      return { date: ymd(dd), status: statusOf(habit.id, dd) || (sameDay(dd, today) ? 'today' : 'miss') };
    });
    return { current: current, longest: longest, pct: pct, completed: completed, total: total, strip: strip };
  }

  /* ── seeds ──────────────────────────────────────────────────────────────── */
  function blankItem(d) {
    return { id: uid(), title: '', type: 'task', date: ymd(d), time: '', endTime: '', notes: '', recurrence: { type: 'none', days: [] }, backlog: false, priority: 'none', projectId: null, habitIcon: 'flame' };
  }
  function blankProject() { return { id: uid(), name: '', color: PROJ_COLORS[0], description: '' }; }

  /* ── navigation ─────────────────────────────────────────────────────────── */
  function nav(dir) {
    if (S.view === 'day') S.cursor = addDays(S.cursor, dir);
    else if (S.view === 'week') S.cursor = addDays(S.cursor, dir * 7);
    else S.cursor = new Date(S.cursor.getFullYear(), S.cursor.getMonth() + dir, 1);
    render();
  }
  function titleText() {
    if (S.view === 'day') return WD_FULL[S.cursor.getDay()] + ', ' + MONTHS[S.cursor.getMonth()] + ' ' + S.cursor.getDate();
    if (S.view === 'week') {
      var s = startOfWeek(S.cursor, S.weekStart), e = addDays(s, 6);
      return MONTHS[s.getMonth()].slice(0,3) + ' ' + s.getDate() + ' – ' + MONTHS[e.getMonth()].slice(0,3) + ' ' + e.getDate() + ', ' + e.getFullYear();
    }
    return MONTHS[S.cursor.getMonth()] + ' ' + S.cursor.getFullYear();
  }

  /* ════════════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════════════ */
  var ROOT_ID = 'cal-root';
  function root() { return document.getElementById(ROOT_ID); }

  function visibleItems() {
    return S.projectFilter ? S.items.filter(function (i) { return i.projectId === S.projectFilter; }) : S.items;
  }

  function render() {
    var el = root();
    if (!el) return;
    var user = getUser && getUser();
    if (!user) { el.innerHTML = signedOutHtml(); return; }
    if (!S.loaded) { el.innerHTML = '<div class="cal-loading">Loading your calendar…</div>'; return; }

    var vis = visibleItems();
    var inbox = vis.filter(function (i) { return i.backlog; });
    var todayOverdue = overdueTasks(new Date());

    var html = '';
    html += header(todayOverdue, inbox);
    html += '<div class="cal-body">';
    html +=   '<main class="cal-canvas">';
    if (S.view === 'month') html += monthView(vis);
    else if (S.view === 'week') html += weekView(vis);
    else html += dayView(vis, todayOverdue);
    html +=   '</main>';
    if (S.panel === 'projects') html += projectsPanel();
    else if (S.panel === 'habits') html += habitsPanel();
    else if (S.panel === 'inbox') html += inboxPanel(inbox);
    html += '</div>';
    if (S.modal) html += itemModal(S.modal.item);
    if (S.projModal) html += projectModal(S.projModal.project);

    el.innerHTML = html;
    bind(el);
  }

  function signedOutHtml() {
    return '<div class="cal-signed-out">' +
      '<div class="cal-so-icon">' + svg('cal') + '</div>' +
      '<h2>Your personal calendar</h2>' +
      '<p>Sign in to create your own calendar, schedule tasks and events, and track habits and projects — all private to your account.</p>' +
      '<button class="cal-so-btn" data-act="open-sidebar">Sign in to get started</button>' +
      '</div>';
  }

  function header(overdue, inbox) {
    var h = '<header class="cal-top">';
    h += '<div class="cal-brand">' + svg('cal') + '<span>Calendar</span></div>';
    h += '<div class="cal-nav">' +
         '<button class="cal-icon" data-act="prev" aria-label="Previous">' + svg('chevL') + '</button>' +
         '<button class="cal-today" data-act="today">Today</button>' +
         '<button class="cal-icon" data-act="next" aria-label="Next">' + svg('chevR') + '</button>' +
         '<h1 class="cal-title">' + esc(titleText()) + '</h1>';
    if (overdue.length > 0) {
      h += '<button class="cal-overdue-pill" data-act="goto-overdue">' + svg('corner') + ' ' + overdue.length + ' overdue</button>';
    }
    h += '</div>';
    h += '<div class="cal-tools">';
    if (S.projectFilter) {
      var pf = projOf(S.projectFilter);
      h += '<button class="cal-filter-chip" data-act="clear-filter"><span class="cal-fc-dot" style="background:' + (pf ? pf.color : '#999') + '"></span>' + esc(pf ? pf.name : '') + ' ' + svg('x') + '</button>';
    }
    h += '<div class="cal-seg">';
    ['day','week','month'].forEach(function (v) {
      h += '<button class="' + (S.view === v ? 'on' : '') + '" data-act="view" data-view="' + v + '">' + v.charAt(0).toUpperCase() + v.slice(1) + '</button>';
    });
    h += '</div>';
    h += '<div class="cal-seg cal-wk-seg" title="Week starts on">' +
         '<button class="' + (S.weekStart === 0 ? 'on' : '') + '" data-act="wkstart" data-ws="0">Sun</button>' +
         '<button class="' + (S.weekStart === 1 ? 'on' : '') + '" data-act="wkstart" data-ws="1">Mon</button>' +
         '</div>';
    h += '<button class="cal-icon ' + (S.panel === 'projects' ? 'active' : '') + '" data-act="panel" data-panel="projects" aria-label="Projects">' + svg('folder') + '</button>';
    h += '<button class="cal-icon ' + (S.panel === 'habits' ? 'active' : '') + '" data-act="panel" data-panel="habits" aria-label="Habit tracking">' + svg('clock') + '</button>';
    h += '<button class="cal-icon ' + (S.panel === 'inbox' ? 'active' : '') + '" data-act="panel" data-panel="inbox" aria-label="Inbox">' + svg('inbox') + (inbox.length > 0 ? '<span class="cal-dot">' + inbox.length + '</span>' : '') + '</button>';
    h += '<button class="cal-add" data-act="new-item">' + svg('plus') + ' Add</button>';
    h += '</div></header>';
    return h;
  }

  /* ── Month ──────────────────────────────────────────────────────────────── */
  function monthView(items) {
    var gridStart = startOfWeek(startOfMonth(S.cursor), S.weekStart);
    var cells = Array.from({ length: 42 }, function (_, i) { return addDays(gridStart, i); });
    var today = new Date();
    var labels = weekdayLabels(S.weekStart);
    var h = '<div class="cal-month cal-card-surface"><div class="cal-m-head">';
    labels.forEach(function (d) { h += '<div>' + d + '</div>'; });
    h += '</div><div class="cal-m-grid">';
    cells.forEach(function (d) {
      var inMonth = d.getMonth() === S.cursor.getMonth();
      var dayItems = items.filter(function (it) { return occursOn(it, d); }).sort(sortItems);
      h += '<div class="cal-m-cell ' + (inMonth ? '' : 'muted') + ' ' + (sameDay(d, today) ? 'today' : '') + '" data-act="open-day" data-date="' + ymd(d) + '">';
      h += '<div class="cal-m-num">' + d.getDate() + '</div><div class="cal-m-items">';
      dayItems.slice(0, 4).forEach(function (it) {
        var col = itemColor(it, projOf);
        var st = statusOf(it.id, d);
        h += '<div class="cal-chip ' + (st === 'done' ? 'done' : '') + ' ' + (st === 'skip' ? 'skip' : '') + '" style="background:' + col + '" data-act="open-item" data-id="' + it.id + '">';
        if (it.priority && it.priority !== 'none') h += '<span class="cal-prio-pip" style="background:' + PRIORITIES[it.priority].color + '"></span>';
        if (it.type === 'reminder') h += '<span class="cal-ic10">' + svg('bell') + '</span>';
        if (it.type === 'habit') h += '<span class="cal-ic10">' + HABIT_ICON + '</span>';
        if (it.recurrence && it.recurrence.type !== 'none') h += '<span class="cal-ic10">' + svg('repeat') + '</span>';
        if (it.time) h += '<b>' + esc(timeRange(it)) + '</b> ';
        h += esc(it.title) + '</div>';
      });
      if (dayItems.length > 4) h += '<div class="cal-more">+' + (dayItems.length - 4) + ' more</div>';
      h += '</div></div>';
    });
    h += '</div></div>';
    return h;
  }

  /* ── Week ───────────────────────────────────────────────────────────────── */
  function weekView(items) {
    var s = startOfWeek(S.cursor, S.weekStart);
    var days = Array.from({ length: 7 }, function (_, i) { return addDays(s, i); });
    var today = new Date();
    var h = '<div class="cal-week">';
    days.forEach(function (d) {
      var dayItems = items.filter(function (it) { return occursOn(it, d); }).sort(sortItems);
      h += '<div class="cal-w-col ' + (sameDay(d, today) ? 'today' : '') + '">';
      h += '<div class="cal-w-head"><span class="cal-w-wd">' + WD[d.getDay()] + '</span><span class="cal-w-num">' + d.getDate() + '</span></div>';
      h += '<div class="cal-w-items">';
      dayItems.forEach(function (it) {
        var col = itemColor(it, projOf);
        var st = statusOf(it.id, d);
        var streak = it.type === 'habit' ? habitStats(it).current : 0;
        h += '<div class="cal-row ' + (st === 'done' ? 'done' : '') + ' ' + (st === 'skip' ? 'skip' : '') + '" style="border-left-color:' + col + '">';
        if (it.type === 'task' || it.type === 'habit') {
          h += '<button class="cal-cb st-' + (st || 'pending') + '" data-act="toggle" data-id="' + it.id + '" data-date="' + ymd(d) + '">' + (st === 'done' ? svg('check') : st === 'skip' ? svg('x') : '') + '</button>';
        }
        h += '<div class="cal-row-body" data-act="open-item" data-id="' + it.id + '"><div class="cal-row-title">';
        if (it.priority && it.priority !== 'none') h += '<span class="cal-prio-tag" style="background:' + PRIORITIES[it.priority].color + '">' + PRIORITIES[it.priority].label + '</span>';
        if (it.type === 'reminder') h += '<span class="cal-ic11" style="color:' + col + '">' + svg('bell') + '</span>';
        if (it.type === 'habit') h += '<span class="cal-ic11" style="color:' + col + '">' + HABIT_ICON + '</span>';
        if (it.type === 'event') h += '<span class="cal-ic11" style="color:' + col + '">' + svg('event') + '</span>';
        if (it.recurrence && it.recurrence.type !== 'none') h += '<span class="cal-ic11">' + svg('repeat') + '</span>';
        h += esc(it.title) + '</div>';
        if (it.time) h += '<div class="cal-row-time">' + esc(timeRange(it)) + '</div>';
        if (it.type === 'habit' && streak > 0) h += '<span class="cal-streak-badge">🔥 ' + streak + '</span>';
        var pr = it.projectId && projOf(it.projectId);
        if (pr) h += '<span class="cal-row-proj" style="color:' + pr.color + '">● ' + esc(pr.name) + '</span>';
        h += '</div></div>';
      });
      h += '<button class="cal-w-add" data-act="new-on" data-date="' + ymd(d) + '">' + svg('plus') + '</button>';
      h += '</div></div>';
    });
    h += '</div>';
    return h;
  }

  /* ── Day ────────────────────────────────────────────────────────────────── */
  function dayView(items, todayOverdue) {
    var c = S.cursor;
    var dayItems = items.filter(function (it) { return occursOn(it, c); });
    var pinned = dayItems.filter(function (i) { return i.type === 'reminder' || i.type === 'event'; }).sort(sortItems);
    var timed = dayItems.filter(function (i) { return (i.type === 'task' || i.type === 'habit') && i.time; }).sort(sortItems);
    var untimed = dayItems.filter(function (i) { return (i.type === 'task' || i.type === 'habit') && !i.time; }).sort(sortItems);
    var startOfToday = new Date(new Date().setHours(0,0,0,0));
    var overdue = c >= startOfToday ? todayOverdue : [];

    function section(label, list) {
      var s = '<div class="cal-d-section"><h3>' + label + '</h3>';
      if (list.length === 0) s += '<p class="cal-empty">None</p>';
      list.forEach(function (it) {
        var col = itemColor(it, projOf);
        var st = statusOf(it.id, c);
        var streak = it.type === 'habit' ? habitStats(it).current : 0;
        s += '<div class="cal-d-row cal-card-surface ' + (st === 'done' ? 'done' : '') + ' ' + (st === 'skip' ? 'skip' : '') + '" style="border-left-color:' + col + '">';
        if (it.type === 'task' || it.type === 'habit') {
          s += '<button class="cal-cb big st-' + (st || 'pending') + '" data-act="toggle" data-id="' + it.id + '" data-date="' + ymd(c) + '">' + (st === 'done' ? svg('check') : st === 'skip' ? svg('x') : '') + '</button>';
        }
        s += '<div class="cal-d-body" data-act="open-item" data-id="' + it.id + '"><div class="cal-d-title">';
        if (it.priority && it.priority !== 'none') s += '<span class="cal-prio-tag" style="background:' + PRIORITIES[it.priority].color + '">' + PRIORITIES[it.priority].label + '</span>';
        if (it.type === 'reminder') s += '<span class="cal-ic13" style="color:' + col + '">' + svg('bell') + '</span>';
        if (it.type === 'event') s += '<span class="cal-ic13" style="color:' + col + '">' + svg('event') + '</span>';
        if (it.type === 'habit') s += '<span class="cal-ic13" style="color:' + col + '">' + HABIT_ICON + '</span>';
        if (it.recurrence && it.recurrence.type !== 'none') s += '<span class="cal-ic13">' + svg('repeat') + '</span>';
        s += esc(it.title);
        if (it.type === 'habit' && streak > 0) s += '<span class="cal-streak-badge">🔥 ' + streak + '</span>';
        s += '</div>';
        if (it.notes) s += '<div class="cal-d-notes">' + esc(it.notes) + '</div>';
        var pr = it.projectId && projOf(it.projectId);
        if (pr) s += '<span class="cal-d-proj" style="color:' + pr.color + '">● ' + esc(pr.name) + '</span>';
        s += '</div>';
        if (it.time) s += '<div class="cal-d-time">' + esc(timeRange(it)) + '</div>';
        s += '</div>';
      });
      s += '</div>';
      return s;
    }

    var h = '<div class="cal-day">';
    h += '<div class="cal-d-banner cal-card-surface">';
    if (pinned.length > 0) h += '<span>' + svg('bell') + ' ' + pinned.length + ' event' + (pinned.length > 1 ? 's' : '') + ' & reminder' + (pinned.length > 1 ? 's' : '') + ' today</span>';
    else h += '<span class="cal-muted-banner">No events or reminders</span>';
    h += '<button class="cal-d-newbtn" data-act="new-on" data-date="' + ymd(c) + '">' + svg('plus') + ' Add</button></div>';
    if (overdue.length > 0) {
      h += '<div class="cal-d-section cal-overdue-sec"><h3>Overdue</h3>';
      overdue.forEach(function (it) {
        var col = itemColor(it, projOf);
        h += '<div class="cal-d-row cal-card-surface cal-overdue-row" style="border-left-color:' + col + '">';
        h += '<button class="cal-cb big st-pending" data-act="toggle" data-id="' + it.id + '" data-date="' + it.date + '"></button>';
        h += '<div class="cal-d-body" data-act="open-item" data-id="' + it.id + '"><div class="cal-d-title">';
        if (it.priority && it.priority !== 'none') h += '<span class="cal-prio-tag" style="background:' + PRIORITIES[it.priority].color + '">' + PRIORITIES[it.priority].label + '</span>';
        h += esc(it.title) + '</div><span class="cal-overdue-when">was due ' + esc(it.date) + '</span></div>';
        h += '<button class="cal-carry-btn" data-act="carry" data-id="' + it.id + '">' + svg('corner') + ' Carry over</button></div>';
      });
      h += '</div>';
    }
    h += section('Events & reminders', pinned);
    h += section('Scheduled', timed);
    h += section('Anytime today', untimed);
    h += '</div>';
    return h;
  }

  /* ── Panels ─────────────────────────────────────────────────────────────── */
  function projectsPanel() {
    var h = '<aside class="cal-panel"><div class="cal-panel-head">' + svg('folder') + ' Projects</div>';
    if (S.projects.length === 0) h += '<p class="cal-empty">No projects yet. Group related tasks and watch progress fill up.</p>';
    S.projects.forEach(function (p) {
      var st = projectStats(p.id);
      h += '<div class="cal-proj-card ' + (S.projectFilter === p.id ? 'on' : '') + '">';
      h += '<div class="cal-proj-top" data-act="toggle-filter" data-id="' + p.id + '"><span class="cal-proj-dot" style="background:' + p.color + '"></span><span class="cal-proj-name">' + esc(p.name) + '</span><span class="cal-proj-pct">' + st.pct + '%</span></div>';
      h += '<div class="cal-bar"><div class="cal-bar-fill" style="width:' + st.pct + '%;background:' + p.color + '"></div></div>';
      h += '<div class="cal-proj-meta"><span>' + st.complete + '/' + st.total + ' done</span><button class="cal-proj-edit" data-act="edit-proj" data-id="' + p.id + '">Edit</button></div></div>';
    });
    h += '<button class="cal-panel-add" data-act="new-proj">' + svg('plus') + ' New project</button></aside>';
    return h;
  }
  function habitsPanel() {
    var habits = S.items.filter(function (i) { return i.type === 'habit' && !i.backlog; });
    var h = '<aside class="cal-panel"><div class="cal-panel-head">' + svg('clock') + ' Habit tracking</div><p class="cal-panel-sub">Last 30 days, scheduled days only</p>';
    if (habits.length === 0) h += '<p class="cal-empty">No habits yet. Create a habit and track your streaks here.</p>';
    habits.forEach(function (hb) {
      var st = habitStats(hb);
      h += '<div class="cal-habit-card" data-act="open-item" data-id="' + hb.id + '">';
      h += '<div class="cal-habit-top"><span class="cal-habit-ic" style="color:' + TYPES.habit.color + '">' + HABIT_ICON + '</span><span class="cal-habit-name">' + esc(hb.title) + '</span><span class="cal-habit-pct" style="color:' + TYPES.habit.color + '">' + st.pct + '%</span></div>';
      h += '<div class="cal-habit-stats"><span class="cal-hs"><b>' + st.current + '</b> day streak</span><span class="cal-hs"><b>' + st.longest + '</b> best</span><span class="cal-hs"><b>' + st.completed + '/' + st.total + '</b> done</span></div>';
      h += '<div class="cal-strip">';
      st.strip.forEach(function (s) { h += '<span class="cal-pip ' + s.status + '" title="' + s.date + ': ' + s.status + '"></span>'; });
      h += '</div></div>';
    });
    h += '</aside>';
    return h;
  }
  function inboxPanel(inbox) {
    var h = '<aside class="cal-panel"><div class="cal-panel-head">' + svg('inbox') + ' Inbox</div><p class="cal-panel-sub">Unscheduled tasks &amp; reminders</p>';
    if (inbox.length === 0) h += '<p class="cal-empty">Nothing here. Capture loose tasks and reminders, schedule them later.</p>';
    inbox.forEach(function (t) {
      var T = TYPES[t.type];
      var bst = statusOfBacklog(t.id);
      h += '<div class="cal-inbox-item ' + (bst === 'done' ? 'done' : '') + ' ' + (bst === 'skip' ? 'skip' : '') + '">';
      h += '<button class="cal-cb st-' + (bst || 'pending') + '" data-act="toggle-backlog" data-id="' + t.id + '">' + (bst === 'done' ? svg('check') : bst === 'skip' ? svg('x') : '') + '</button>';
      h += '<div class="cal-ib-body" data-act="open-item" data-id="' + t.id + '"><div class="cal-ib-title"><span class="cal-ic12" style="color:' + T.color + '">' + svg(T.icon) + '</span>';
      if (t.priority && t.priority !== 'none') h += '<span class="cal-ic11" style="color:' + PRIORITIES[t.priority].color + '">' + svg('flag') + '</span>';
      h += esc(t.title) + '</div>';
      var pr = t.projectId && projOf(t.projectId);
      if (pr) h += '<span class="cal-ib-proj"><span class="cal-proj-dot sm" style="background:' + pr.color + '"></span>' + esc(pr.name) + '</span>';
      h += '</div></div>';
    });
    h += '<button class="cal-panel-add" data-act="new-backlog" data-type="task">' + svg('plus') + ' New task</button>';
    h += '<button class="cal-panel-add cal-ghost-add" data-act="new-backlog" data-type="reminder">' + svg('bell') + ' New reminder</button>';
    h += '</aside>';
    return h;
  }

  /* ── Item modal ─────────────────────────────────────────────────────────── */
  // Modal edits a working copy held in S.modal.item so re-render preserves state.
  function itemModal(it) {
    var isNew = !it._existing;
    var h = '<div class="cal-overlay" data-act="close-modal"><div class="cal-modal" data-stop="1">';
    h += '<div class="cal-m-top"><h2>' + (isNew ? 'New item' : 'Edit item') + '</h2><button class="cal-icon" data-act="close-modal">' + svg('x') + '</button></div>';
    h += '<div class="cal-types">';
    Object.keys(TYPES).forEach(function (k) {
      var v = TYPES[k];
      var on = it.type === k;
      h += '<button class="cal-type-pill ' + (on ? 'on' : '') + '" ' + (on ? 'style="background:' + v.color + ';color:#fff;border-color:' + v.color + '"' : '') + ' data-act="m-type" data-type="' + k + '">' + svg(v.icon) + ' ' + v.label + '</button>';
    });
    h += '</div>';
    h += '<label class="cal-fl">Title<input id="cal-m-title" value="' + esc(it.title) + '" placeholder="What is it?" data-field="title"/></label>';

    h += '<div class="cal-fl">Priority<div class="cal-prio-row">';
    Object.keys(PRIORITIES).forEach(function (k) {
      var v = PRIORITIES[k]; var on = it.priority === k;
      h += '<button class="cal-prio-btn ' + (on ? 'on' : '') + '" ' + (on ? 'style="border-color:' + v.color + ';color:' + v.color + ';background:' + v.color + '15"' : '') + ' data-act="m-prio" data-prio="' + k + '"><span class="cal-ic12" style="color:' + v.color + '">' + svg('flag') + '</span> ' + v.label + '</button>';
    });
    h += '</div></div>';

    h += '<label class="cal-fl">Project<div class="cal-select-wrap"><select data-field="projectId"><option value="">No project</option>';
    S.projects.forEach(function (p) { h += '<option value="' + p.id + '" ' + (it.projectId === p.id ? 'selected' : '') + '>' + esc(p.name) + '</option>'; });
    h += '</select></div></label>';

    h += '<label class="cal-fl cal-chkline"><input type="checkbox" data-field="backlog" ' + (it.backlog ? 'checked' : '') + '/>Unscheduled (keep in inbox)</label>';

    if (!it.backlog) {
      h += '<label class="cal-fl">Date<input type="date" value="' + esc(it.date || '') + '" data-field="date"/></label>';
      h += '<div class="cal-grid2">';
      h += '<label class="cal-fl">Start time' + (it.type !== 'reminder' && it.type !== 'event' ? ' <span class="cal-opt">(optional)</span>' : '') + '<input type="time" value="' + esc(it.time || '') + '" data-field="time"/></label>';
      h += '<label class="cal-fl">End time <span class="cal-opt">(optional)</span><input type="time" value="' + esc(it.endTime || '') + '" data-field="endTime" ' + (it.time ? '' : 'disabled') + '/></label>';
      h += '</div>';
      if (it.time && it.endTime && it.endTime <= it.time) h += '<p class="cal-field-warn">End time should be after the start time.</p>';

      h += '<div class="cal-rec"><div class="cal-rec-head">' + svg('repeat') + ' Repeat</div><div class="cal-rec-opts">';
      [['none','Once'],['daily','Daily'],['weekly','Weekly'],['custom','Custom']].forEach(function (pair) {
        var on = (it.recurrence && it.recurrence.type) === pair[0];
        h += '<button class="' + (on ? 'on' : '') + '" data-act="m-rec" data-rec="' + pair[0] + '">' + pair[1] + '</button>';
      });
      h += '</div>';
      if (it.recurrence && it.recurrence.type === 'custom') {
        h += '<div class="cal-wd-pick">';
        WD.forEach(function (d, i) {
          var on = it.recurrence.days && it.recurrence.days.indexOf(i) >= 0;
          h += '<button class="' + (on ? 'on' : '') + '" data-act="m-recday" data-day="' + i + '">' + d + '</button>';
        });
        h += '</div>';
      }
      h += '</div>';
    }

    h += '<label class="cal-fl">Notes<textarea data-field="notes" rows="2" placeholder="Details…">' + esc(it.notes || '') + '</textarea></label>';

    h += '<div class="cal-m-actions">';
    if (!isNew) h += '<button class="cal-del" data-act="m-delete">' + svg('trash') + ' Delete</button>';
    h += '<div class="cal-spacer"></div>';
    h += '<button class="cal-ghost" data-act="close-modal">Cancel</button>';
    h += '<button class="cal-primary" data-act="m-save" ' + (it.title && it.title.trim() ? '' : 'disabled') + '>Save</button>';
    h += '</div></div></div>';
    return h;
  }

  /* ── Project modal ──────────────────────────────────────────────────────── */
  function projectModal(p) {
    var isNew = !p._existing;
    var h = '<div class="cal-overlay" data-act="close-projmodal"><div class="cal-modal small" data-stop="1">';
    h += '<div class="cal-m-top"><h2>' + (isNew ? 'New project' : 'Edit project') + '</h2><button class="cal-icon" data-act="close-projmodal">' + svg('x') + '</button></div>';
    h += '<label class="cal-fl">Name<input value="' + esc(p.name) + '" placeholder="e.g. Q3 launch" data-pfield="name"/></label>';
    h += '<div class="cal-fl">Color<div class="cal-color-row">';
    PROJ_COLORS.forEach(function (c) { h += '<button class="cal-color-dot ' + (p.color === c ? 'on' : '') + '" style="background:' + c + '" data-act="p-color" data-color="' + c + '"></button>'; });
    h += '</div></div>';
    h += '<label class="cal-fl">Description<textarea rows="2" placeholder="Optional" data-pfield="description">' + esc(p.description || '') + '</textarea></label>';
    h += '<div class="cal-m-actions">';
    if (!isNew) h += '<button class="cal-del" data-act="p-delete">' + svg('trash') + ' Delete</button>';
    h += '<div class="cal-spacer"></div><button class="cal-ghost" data-act="close-projmodal">Cancel</button>';
    h += '<button class="cal-primary" data-act="p-save" ' + (p.name && p.name.trim() ? '' : 'disabled') + '>Save</button>';
    h += '</div></div></div>';
    return h;
  }

  /* ════════════════════════════════════════════════════════════════════════
     EVENT BINDING  (delegation on the root, re-applied each render)
  ════════════════════════════════════════════════════════════════════════ */
  function readModalFields(el) {
    if (!S.modal) return;
    var it = S.modal.item;
    el.querySelectorAll('[data-field]').forEach(function (n) {
      var f = n.getAttribute('data-field');
      if (n.type === 'checkbox') it[f] = n.checked;
      else if (f === 'projectId') it[f] = n.value || null;
      else it[f] = n.value;
    });
  }
  function readProjFields(el) {
    if (!S.projModal) return;
    var p = S.projModal.project;
    el.querySelectorAll('[data-pfield]').forEach(function (n) { p[n.getAttribute('data-pfield')] = n.value; });
  }

  function bind(el) {
    // live-sync modal text inputs without re-render (preserve focus/caret)
    el.querySelectorAll('[data-field],[data-pfield]').forEach(function (n) {
      var tag = n.tagName.toLowerCase();
      var live = (tag === 'input' && (n.type === 'text' || n.type === 'time' || n.type === 'date' || !n.type)) || tag === 'textarea';
      if (live) {
        n.addEventListener('input', function () {
          if (n.hasAttribute('data-field') && S.modal) {
            var f = n.getAttribute('data-field'); S.modal.item[f] = n.value;
            if (f === 'title') { var sv = el.querySelector('[data-act="m-save"]'); if (sv) sv.disabled = !n.value.trim(); }
          } else if (n.hasAttribute('data-pfield') && S.projModal) {
            var pf = n.getAttribute('data-pfield'); S.projModal.project[pf] = n.value;
            if (pf === 'name') { var sp = el.querySelector('[data-act="p-save"]'); if (sp) sp.disabled = !n.value.trim(); }
          }
        });
      }
    });
    // select / checkbox change -> need a re-render (date/time visibility etc.)
    el.querySelectorAll('select[data-field],input[type=checkbox][data-field]').forEach(function (n) {
      n.addEventListener('change', function () {
        readModalFields(el);
        render();
      });
    });

    el.addEventListener('click', onClick);
  }

  function onClick(e) {
    var stop = e.target.closest('[data-stop]');
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var act = t.getAttribute('data-act');
    var el = root();

    // Overlay-dismiss acts live on the overlay element itself. When the click
    // happened inside the modal panel (data-stop) and didn't land on an
    // explicit close/cancel control, don't treat it as a dismiss.
    if ((act === 'close-modal' || act === 'close-projmodal') && stop &&
        !(t.classList.contains('cal-icon') || t.classList.contains('cal-ghost'))) return;

    // For acts that submit modal data, capture field values first.
    if (act === 'm-save') readModalFields(el);
    if (act === 'p-save') readProjFields(el);

    switch (act) {
      case 'open-sidebar': if (window.toggleSidebar) window.toggleSidebar(); return;
      case 'prev': nav(-1); return;
      case 'next': nav(1); return;
      case 'today': S.cursor = new Date(); render(); return;
      case 'goto-overdue': S.cursor = new Date(); S.view = 'day'; render(); return;
      case 'view': S.view = t.getAttribute('data-view'); render(); return;
      case 'wkstart': S.weekStart = parseInt(t.getAttribute('data-ws'), 10); render(); return;
      case 'clear-filter': S.projectFilter = null; render(); return;
      case 'panel': {
        var p = t.getAttribute('data-panel');
        S.panel = (S.panel === p ? null : p); render(); return;
      }
      case 'new-item': openItemModal(blankItem(S.cursor)); return;
      case 'new-on': openItemModal(blankItem(parseYmd(t.getAttribute('data-date')))); return;
      case 'new-backlog': {
        var ni = blankItem(S.cursor); ni.backlog = true; ni.type = t.getAttribute('data-type');
        openItemModal(ni); return;
      }
      case 'open-day': S.cursor = parseYmd(t.getAttribute('data-date')); S.view = 'day'; render(); return;
      case 'open-item': {
        e.stopPropagation();
        var item = S.items.filter(function (x) { return x.id === t.getAttribute('data-id'); })[0];
        if (item) openItemModal(Object.assign({}, item, { recurrence: Object.assign({ type: 'none', days: [] }, item.recurrence), _existing: true }));
        return;
      }
      case 'toggle': cycleStatus(t.getAttribute('data-id'), parseYmd(t.getAttribute('data-date'))); return;
      case 'toggle-backlog': toggleBacklogDone(t.getAttribute('data-id')); return;
      case 'carry': carryOver(t.getAttribute('data-id')); return;
      case 'toggle-filter': {
        var id = t.getAttribute('data-id');
        S.projectFilter = (S.projectFilter === id ? null : id); render(); return;
      }
      case 'edit-proj': {
        var pr = projOf(t.getAttribute('data-id'));
        if (pr) { S.projModal = { project: Object.assign({}, pr, { _existing: true }) }; render(); }
        return;
      }
      case 'new-proj': S.projModal = { project: blankProject() }; render(); return;

      /* modal: item */
      case 'close-modal': S.modal = null; render(); return;
      case 'm-type': readModalFields(el); S.modal.item.type = t.getAttribute('data-type'); render(); return;
      case 'm-prio': readModalFields(el); S.modal.item.priority = t.getAttribute('data-prio'); render(); return;
      case 'm-rec': {
        readModalFields(el);
        var r = S.modal.item.recurrence || { type: 'none', days: [] };
        r.type = t.getAttribute('data-rec'); S.modal.item.recurrence = r; render(); return;
      }
      case 'm-recday': {
        readModalFields(el);
        var rr = S.modal.item.recurrence || { type: 'custom', days: [] };
        var day = parseInt(t.getAttribute('data-day'), 10);
        rr.days = rr.days || [];
        rr.days = rr.days.indexOf(day) >= 0 ? rr.days.filter(function (x) { return x !== day; }) : rr.days.concat([day]);
        S.modal.item.recurrence = rr; render(); return;
      }
      case 'm-save': {
        var mi = Object.assign({}, S.modal.item); delete mi._existing;
        if (!mi.title || !mi.title.trim()) return;
        saveItem(mi); return;
      }
      case 'm-delete': deleteItem(S.modal.item.id); return;

      /* modal: project */
      case 'close-projmodal': if (e.target.classList.contains('cal-overlay') || t.classList.contains('cal-icon') || t.classList.contains('cal-ghost')) { S.projModal = null; render(); } return;
      case 'p-color': readProjFields(el); S.projModal.project.color = t.getAttribute('data-color'); render(); return;
      case 'p-save': {
        var pp = Object.assign({}, S.projModal.project); delete pp._existing;
        if (!pp.name || !pp.name.trim()) return;
        saveProject(pp); return;
      }
      case 'p-delete': deleteProject(S.projModal.project.id); return;
    }
  }

  function openItemModal(item) {
    S.modal = { item: item };
    render();
    var inp = document.getElementById('cal-m-title');
    if (inp) inp.focus();
  }

  /* ════════════════════════════════════════════════════════════════════════
     LIFECYCLE
  ════════════════════════════════════════════════════════════════════════ */
  function load() {
    var user = getUser && getUser();
    if (!user) { S.loaded = false; render(); return; }
    if (S.loaded) { render(); return; }
    render(); // show loading
    Promise.all([CalAPI.getItems(), CalAPI.getProjects(), CalAPI.getDone()]).then(function (res) {
      S.items = res[0] || [];
      S.projects = res[1] || [];
      S.done = res[2] || {};
      S.loaded = true;
      render();
    });
  }
  // Called by index.html when the user signs in/out so calendar data refreshes.
  function reset() { S.loaded = false; S.items = []; S.projects = []; S.done = {}; S.modal = null; S.projModal = null; }

  window.Calendar = { open: load, reset: reset, render: render };
})();
