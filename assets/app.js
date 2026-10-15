/* Job Radar hub. Static, no build step.
   Data: data/index.json (list of days) and data/days/<date>.json (one digest per day). */
(function () {
  'use strict';

  const main = document.getElementById('main');
  const dayList = document.getElementById('dayList');
  const dateSelect = document.getElementById('dateSelect');
  const footNote = document.getElementById('footNote');
  const cache = new Map();
  let INDEX = { days: [] };

  /* ---------- tiny utils ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const fmtDay = (iso, opts) => {
    const d = new Date(iso + 'T12:00:00Z');
    return d.toLocaleDateString('en-GB', Object.assign({ weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }, opts || {}));
  };
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const daysUntil = (iso) => Math.round((new Date(iso + 'T23:59:59Z') - new Date(todayISO() + 'T23:59:59Z')) / 86400000);
  const fitClass = (it) => it.section === 'top' || it.fit >= 4 ? 'top' : it.section === 'bridge' ? 'bridge' : 'worth';
  const applied = store.get('jr.applied', {});
  const setApplied = (key, on) => { if (on) applied[key] = todayISO(); else delete applied[key]; store.set('jr.applied', applied); };

  async function getJSON(url) {
    if (cache.has(url)) return cache.get(url);
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
    const j = await r.json();
    cache.set(url, j);
    return j;
  }
  const getDay = (date) => getJSON('data/days/' + date + '.json');

  /* ---------- theme ---------- */
  const themeBtn = document.getElementById('themeBtn');
  const savedTheme = store.get('jr.theme', null);
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
  themeBtn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    store.set('jr.theme', next);
  });

  /* ---------- shell: day list + selector ---------- */
  function renderShell(active) {
    const max = Math.max(1, ...INDEX.days.map((d) => d.kept || 0));
    dayList.innerHTML = INDEX.days.map((d) => `
      <li><a href="#/day/${d.date}" class="${d.date === active ? 'active' : ''} ${d.status === 'failed' ? 'failed' : ''}">
        <span class="d">${esc(fmtDay(d.date, { year: undefined }))}</span>
        <span class="n">${d.status === 'ok' ? (d.shown || 0) + ' · ' + (d.top || 0) + ' top' : '–'}</span>
        <span class="bar"><i style="width:${Math.round(100 * (d.kept || 0) / max)}%"></i></span>
      </a></li>`).join('') || '<li class="empty">No digests yet.</li>';
    dateSelect.innerHTML = '<option value="all">Overview (all days)</option>' +
      INDEX.days.map((d) => `<option value="${d.date}" ${d.date === active ? 'selected' : ''}>${esc(fmtDay(d.date))}</option>`).join('');
    if (!active) dateSelect.value = 'all';
    document.querySelectorAll('.tabs a').forEach((a) => {
      const v = a.dataset.view;
      a.classList.toggle('active', (v === 'all' && !active) || (v === 'day' && !!active));
    });
    const latest = INDEX.days[0];
    document.querySelector('.tabs a[data-view="day"]').href = latest ? '#/day/' + latest.date : '#/all';
  }
  dateSelect.addEventListener('change', () => {
    location.hash = dateSelect.value === 'all' ? '#/all' : '#/day/' + dateSelect.value;
  });

  /* ---------- pieces ---------- */
  function card(it, date) {
    const cls = fitClass(it);
    const soon = isDate(it.closes) && daysUntil(it.closes) >= 0 && daysUntil(it.closes) <= 7;
    const closes = isDate(it.closes) ? 'closes ' + fmtDay(it.closes, { weekday: undefined }) : 'rolling';
    const done = !!applied[it.key];
    return `<article class="card ${cls} ${done ? 'applied' : ''}" data-key="${esc(it.key)}">
      <div class="head">
        <div><h3>${esc(it.title)}</h3><div class="emp">${esc(it.employer)} · ${esc(it.hub)}</div></div>
        <span class="fit ${cls}" title="Fit score">${esc(it.fit)}/5</span>
      </div>
      <div class="meta">
        <span class="tag cv" title="CV flavour">CV ${esc(it.cv)}</span>
        <span class="tag">Type ${esc(it.type_id)} · ${esc(it.type_name)}</span>
        <span class="tag ${soon ? 'close-soon' : ''}">${esc(closes)}</span>
        ${date ? `<span class="tag">seen ${esc(fmtDay(date, { weekday: undefined, year: undefined }))}</span>` : ''}
      </div>
      <p><b>Why</b>${esc(it.why)}</p>
      <p><b>Angle</b>${esc(it.angle)}</p>
      ${(it.flags || []).length ? `<div class="flags">${it.flags.map((f) => `<span class="flag">${esc(f)}</span>`).join('')}</div>` : ''}
      <div class="actions">
        ${it.url ? `<a class="apply" href="${esc(it.url)}" target="_blank" rel="noopener">Read ad / apply ↗</a>` : ''}
        <label><input type="checkbox" class="appliedBox" ${done ? 'checked' : ''}> Applied</label>
      </div>
    </article>`;
  }

  function wireApplied(root) {
    root.querySelectorAll('.appliedBox').forEach((box) => {
      box.addEventListener('change', () => {
        const el = box.closest('[data-key]');
        setApplied(el.dataset.key, box.checked);
        el.classList.toggle('applied', box.checked);
      });
    });
  }

  function section(title, items, date) {
    if (!items.length) return '';
    return `<h2 class="sec">${esc(title)} <span class="count">${items.length}</span></h2>
      <div class="cards">${items.map((it) => card(it, date)).join('')}</div>`;
  }

  function kpis(list) {
    return `<div class="kpis">${list.map(([v, l]) => `<div class="kpi"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></div>`).join('')}</div>`;
  }

  /* ---------- day view ---------- */
  async function renderDay(date) {
    renderShell(date);
    let d;
    try { d = await getDay(date); } catch (e) { main.innerHTML = `<p class="empty">No digest for ${esc(date)}.</p>`; return; }
    const s = d.stats || {};
    const items = d.items || [];
    const head = `<div class="pagehead"><h1>${esc(fmtDay(d.date, { weekday: 'long', month: 'long' }))}</h1>
      <span class="sub">${d.catch_up ? `Covers ${esc(d.days_covered)} days since ${esc((d.window_from || '').slice(0, 10))}` : 'Daily digest'}${d.data_refreshed && d.data_refreshed !== d.date ? ` · data last refreshed ${esc(d.data_refreshed)}` : ''}</span></div>
      ${(d.notes || []).length ? `<ul class="notes">${d.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}`;

    if (d.status === 'failed') {
      main.innerHTML = head + `<div class="callout fail">Run failed. ${esc(d.failure_note || '')}</div>` + healthBlock(d);
      return;
    }
    if (d.status === 'empty') {
      main.innerHTML = head + `<div class="callout">${esc(d.failure_note || 'No new matching postings.')}</div>` + healthBlock(d);
      return;
    }

    const top = items.filter((i) => i.section === 'top');
    const worth = items.filter((i) => i.section === 'worth');
    const bridge = items.filter((i) => i.section === 'bridge');
    let html = head + kpis([
      [s.pending ?? '–', 'pending postings'],
      [s.read ?? '–', 'ads read'],
      [s.passed_gates ?? '–', 'passed gates'],
      [s.kept ?? items.length, 'kept (fit ≥ 2)'],
      [top.length, 'top picks'],
      [s.sources_failed ?? 0, 'sources failed'],
    ]);
    html += section('Top picks · fit 4+', top, null);
    html += section('Worth a look · fit 3', worth, null);
    if (s.held_over) html += `<p class="notes" style="margin-top:12px">+${esc(s.held_over)} kept items scoring 2 to 2.5 held over the 12-item cap; they stay pending.</p>`;
    html += section('Bridge', bridge, null);

    html += `<h2 class="sec">Schemes and deadlines · next 14 days</h2>` + ((d.deadlines || []).length
      ? `<div class="panel"><ul class="plain">${d.deadlines.map((x) => `<li><span>${esc(x.employer)} · ${esc(x.scheme)}</span><span class="r">${esc(isDate(x.closes) ? fmtDay(x.closes) : x.closes)}</span></li>`).join('')}</ul></div>`
      : `<p class="empty">None.</p>`);

    if (d.cv_version) html += `<h2 class="sec">CV version</h2><div class="callout">${esc(d.cv_version)}</div>`;

    const filt = d.filtered || [];
    if (filt.length || d.filtered_more) {
      html += `<h2 class="sec">Filtered out <span class="count">${filt.length}${d.filtered_more ? '+' : ''}</span></h2>
        <details class="panel"><summary>Show reasons</summary><ul class="plain">
        ${filt.map((f) => `<li><span>${esc(f.title)} <span class="muted">· ${esc(f.employer)}</span></span><span class="r">${esc(f.reason)}</span></li>`).join('')}
        ${d.filtered_more ? `<li><span class="muted">${esc(d.filtered_more)}</span><span></span></li>` : ''}
        </ul></details>`;
    }
    html += healthBlock(d);
    main.innerHTML = html;
    wireApplied(main);
  }

  function healthBlock(d) {
    const h = d.source_health || [];
    return `<h2 class="sec">Source health</h2>` + (h.length
      ? `<div class="panel"><ul class="plain">${h.map((x) => `<li><span>${esc(x.source)} <span class="muted">· ${esc(x.error)}</span></span><span class="r">failing ${esc(x.days)} days</span></li>`).join('')}</ul></div>`
      : `<p class="empty">No sources failing 3 or more days.</p>`);
  }

  /* ---------- overview ---------- */
  async function renderAll() {
    renderShell(null);
    const okDays = INDEX.days.filter((d) => d.status === 'ok');
    const digests = await Promise.all(okDays.map((d) => getDay(d.date).catch(() => null)));
    // newest first; keep the latest sighting of each job key (and its duplicate keys)
    const seen = new Set();
    const all = [];
    digests.forEach((d) => {
      if (!d) return;
      (d.items || []).forEach((it) => {
        const keys = [it.key].concat(it.dup_keys || []);
        if (keys.some((k) => seen.has(k))) return;
        keys.forEach((k) => seen.add(k));
        all.push(Object.assign({ date: d.date }, it));
      });
    });

    const today = todayISO();
    const open = all.filter((i) => !isDate(i.closes) || i.closes >= today);
    const closing = open.filter((i) => isDate(i.closes)).sort((a, b) => a.closes.localeCompare(b.closes));
    const ledgerDeadlines = digests[0] ? (digests[0].deadlines || []) : [];
    const appliedCount = all.filter((i) => applied[i.key]).length;

    let html = `<div class="pagehead"><h1>Overview</h1><span class="sub">${okDays.length} digest day${okDays.length === 1 ? '' : 's'}${INDEX.updated ? ' · updated ' + esc(INDEX.updated.replace('T', ' ').slice(0, 16)) + ' UTC' : ''}</span></div>`;
    html += kpis([
      [INDEX.days.length, 'days tracked'],
      [all.length, 'unique matches'],
      [all.filter((i) => i.section === 'top').length, 'top picks'],
      [open.length, 'still open'],
      [closing.filter((i) => daysUntil(i.closes) <= 14).length, 'closing in 14 days'],
      [appliedCount, 'marked applied'],
    ]);

    // volume per day (oldest left)
    const vols = INDEX.days.slice(0, 30).reverse();
    const vmax = Math.max(1, ...vols.map((d) => d.shown || 0));
    html += `<h2 class="sec">Matches per day</h2><div class="panel"><div class="vol">${vols.map((d) => {
      const h = Math.round(64 * (d.shown || 0) / vmax);
      const t = d.shown ? Math.round(h * (d.top || 0) / d.shown) : 0;
      return `<a href="#/day/${d.date}" title="${esc(d.date)}: ${d.shown || 0} shown, ${d.top || 0} top"><span class="b" style="height:${h}px"><span class="t" style="height:${t}px"></span></span>${esc(d.date.slice(8))}</a>`;
    }).join('')}</div><div class="vol-legend"><span><i style="background:var(--top)"></i>top picks</span><span><i style="background:var(--accent)"></i>other kept</span></div></div>`;

    html += `<h2 class="sec">Closing soon</h2>` + (closing.length || ledgerDeadlines.length
      ? `<div class="panel"><ul class="plain">${closing.slice(0, 12).map((i) => {
          const n = daysUntil(i.closes);
          return `<li><span><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a> <span class="muted">· ${esc(i.employer)}</span></span><span class="r">${esc(fmtDay(i.closes, { weekday: undefined }))} · ${n === 0 ? 'today' : n + 'd'}</span></li>`;
        }).join('')}${ledgerDeadlines.map((x) => `<li><span>${esc(x.employer)} · ${esc(x.scheme)}</span><span class="r">${esc(x.closes)}</span></li>`).join('')}</ul></div>`
      : `<p class="empty">No dated deadlines among open matches.</p>`);

    // all matches table
    const hubs = [...new Set(all.map((i) => i.hub))].sort();
    const cvs = [...new Set(all.map((i) => i.cv))].sort();
    html += `<h2 class="sec">All matches <span class="count" id="allCount">${all.length}</span></h2>
      <div class="filters">
        <input type="search" id="q" placeholder="Search title, employer, why…" aria-label="Search">
        <select id="fHub" aria-label="Hub"><option value="">All hubs</option>${hubs.map((h) => `<option>${esc(h)}</option>`).join('')}</select>
        <select id="fCv" aria-label="CV flavour"><option value="">All CVs</option>${cvs.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
        <select id="fFit" aria-label="Minimum fit"><option value="0">Any fit</option><option value="3">Fit 3+</option><option value="4">Fit 4+</option></select>
        <select id="fOpen" aria-label="Status"><option value="open">Open only</option><option value="">Include closed</option><option value="todo">Not applied</option></select>
      </div>
      <div class="panel tablewrap"><table><thead><tr>
        <th data-k="fit" aria-sort="descending">Fit</th><th data-k="title">Role</th><th data-k="hub">Hub</th><th data-k="cv">CV</th><th data-k="closes">Closes</th><th data-k="date">Seen</th>
      </tr></thead><tbody id="allBody"></tbody></table></div>`;
    main.innerHTML = html;

    let sortK = 'fit', sortDir = -1;
    const els = ['q', 'fHub', 'fCv', 'fFit', 'fOpen'].reduce((o, id) => (o[id] = document.getElementById(id), o), {});
    const saved = store.get('jr.filters', {});
    Object.keys(saved).forEach((k) => { if (els[k]) els[k].value = saved[k]; });

    function draw() {
      const q = els.q.value.trim().toLowerCase();
      store.set('jr.filters', { fHub: els.fHub.value, fCv: els.fCv.value, fFit: els.fFit.value, fOpen: els.fOpen.value });
      const rows = all.filter((i) =>
        (!q || [i.title, i.employer, i.why, i.angle, i.type_name].join(' ').toLowerCase().includes(q)) &&
        (!els.fHub.value || i.hub === els.fHub.value) &&
        (!els.fCv.value || i.cv === els.fCv.value) &&
        (+i.fit >= +els.fFit.value) &&
        (els.fOpen.value !== 'open' || !isDate(i.closes) || i.closes >= today) &&
        (els.fOpen.value !== 'todo' || !applied[i.key])
      ).sort((a, b) => {
        const av = sortK === 'closes' ? (isDate(a.closes) ? a.closes : '9999') : a[sortK];
        const bv = sortK === 'closes' ? (isDate(b.closes) ? b.closes : '9999') : b[sortK];
        return (av > bv ? 1 : av < bv ? -1 : 0) * sortDir || (b.fit - a.fit);
      });
      document.getElementById('allCount').textContent = rows.length;
      document.getElementById('allBody').innerHTML = rows.map((i) => `<tr class="${applied[i.key] ? 'applied' : ''}">
        <td class="num"><span class="fit ${fitClass(i)}">${esc(i.fit)}</span></td>
        <td><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a><div class="emp">${esc(i.employer)} · ${esc(i.type_name)}</div></td>
        <td>${esc(i.hub)}</td><td>${esc(i.cv)}</td>
        <td class="num">${isDate(i.closes) ? esc(fmtDay(i.closes, { weekday: undefined, year: undefined })) : 'rolling'}</td>
        <td class="num"><a href="#/day/${i.date}">${esc(fmtDay(i.date, { weekday: undefined, year: undefined }))}</a></td>
      </tr>`).join('') || `<tr><td colspan="6" class="empty">No matches for these filters.</td></tr>`;
    }
    Object.values(els).forEach((el) => el.addEventListener('input', draw));
    main.querySelectorAll('th[data-k]').forEach((th) => th.addEventListener('click', () => {
      const k = th.dataset.k;
      sortDir = sortK === k ? -sortDir : (k === 'fit' || k === 'date' ? -1 : 1);
      sortK = k;
      main.querySelectorAll('th[data-k]').forEach((t) => t.removeAttribute('aria-sort'));
      th.setAttribute('aria-sort', sortDir === 1 ? 'ascending' : 'descending');
      draw();
    }));
    draw();
  }

  /* ---------- router ---------- */
  async function route() {
    const h = location.hash || '#/all';
    const m = h.match(/^#\/day\/(\d{4}-\d{2}-\d{2})$/);
    if (m) return renderDay(m[1]);
    if (h === '#/latest' && INDEX.days[0]) return renderDay(INDEX.days[0].date);
    return renderAll();
  }

  async function boot() {
    try {
      INDEX = await getJSON('data/index.json');
    } catch (e) {
      main.innerHTML = '<p class="empty">No data yet. The first digest will appear here.</p>';
      return;
    }
    INDEX.days.sort((a, b) => b.date.localeCompare(a.date));
    footNote.textContent = `Job Radar · ${INDEX.days.length} days · applied ticks are saved in this browser only`;
    window.addEventListener('hashchange', () => { route(); main.focus({ preventScroll: true }); window.scrollTo(0, 0); });
    route();
  }
  boot();
})();
