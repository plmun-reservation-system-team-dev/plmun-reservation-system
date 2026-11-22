/* PLMun Reservation & Borrowing - shared helpers (loaded on every page) */
const App = (() => {
  const ROOT = document.currentScript.src.replace(/assets\/js\/app\.js.*$/, '');
  // page key -> folder under pages/ (the file is <folder-name>/<folder-name>.html)
  const ROUTES = {
    login: 'auth/login', signup: 'auth/signup', 'forgot-password': 'auth/forgot-password',
    home: 'client/dashboard', catalog: 'client/catalog', 'equipment-details': 'client/equipment-details', reserve: 'client/reserve',
    'my-reservations': 'client/my-reservations', 'my-penalties': 'client/my-penalties', reviews: 'client/reviews',
    'admin-dashboard': 'admin/dashboard', 'admin-reservations': 'admin/reservations', 'admin-borrowing': 'admin/borrowing',
    'admin-returns': 'admin/returns', 'admin-penalties': 'admin/penalties', 'admin-inventory': 'admin/inventory', 'admin-users': 'admin/users',
  };
  // api file -> module folder under api/
  const API = {
    'auth.php': 'auth', 'users.php': 'auth',
    'reservations.php': 'booking', 'reviews.php': 'booking',
    'equipment.php': 'inventory', 'categories.php': 'inventory',
    'borrowings.php': 'borrowing',
    'returns.php': 'returns', 'penalties.php': 'returns',
    'analytics.php': 'analytics', 'overview.php': 'analytics',
    'chat.php': 'chat',
  };
  const url = (page, qs = '') => { if (page === 'login') return `${ROOT}index.html${qs}`; const r = ROUTES[page] || page; return `${ROOT}pages/${r}/${r.split('/').pop()}.html${qs}`; };
  const asset = p => ROOT + p;

  // ---- which backend? real PHP + MySQL when available, otherwise the in-browser one (assets/js/localapi.js) ----
  const loadScript = src => new Promise(ok => { const el = document.createElement('script'); el.src = src; el.onload = () => ok(true); el.onerror = () => ok(false); document.head.append(el); });
  let backendP;
  const backend = () => backendP || (backendP = (async () => {
    await loadScript(ROOT + 'assets/js/site-config.js');
    const mode = (window.PLMUN_CONFIG || {}).backend || 'auto';
    let local = mode === 'local';
    if (mode === 'auto') {
      local = /\.github\.io$/.test(location.hostname) || location.protocol === 'file:';
      if (!local) {
        try { const r = await fetch(ROOT + 'api/auth/auth.php?action=me', { credentials: 'same-origin' }); JSON.parse(await r.text()); }
        catch (e) { local = true; }   // the server did not answer with JSON, so it cannot run PHP
      }
    }
    if (!local) return null;
    await loadScript(ROOT + 'assets/js/localapi.js');
    return window.LocalAPI || null;
  })());
  const isLocal = () => backend().then(b => !!b);

  async function api(path, { method = 'GET', body, form } = {}) {
    const opt = { method, credentials: 'same-origin', headers: {} };
    if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); opt.method = method === 'GET' ? 'POST' : method; }
    if (form) { opt.body = form; opt.method = 'POST'; }
    const local = await backend();
    if (local) {   // no PHP server (e.g. GitHub Pages): use the in-browser backend
      const [file, query = ''] = path.split('?');
      try { return await local.call(file, query, { method: opt.method, body, form }); }
      catch (e) { if (!e.status) { console.error(e); e.message = e.message || 'Something went wrong.'; } throw e; }
    }
    let res, j;
    try { const file = path.split('?')[0]; res = await fetch(`${ROOT}api/${API[file] ? API[file] + '/' : ''}${path}`, opt); j = await res.json(); }
    catch (e) { throw new Error('Cannot reach the server. If you use XAMPP, make sure Apache and MySQL are running and open the site through http://localhost/.'); }
    if (!res.ok || j.ok === false) { const err = new Error(j.error || 'Something went wrong.'); err.status = res.status; throw err; }
    return j;
  }
  const post = (path, body) => api(path, { method: 'POST', body });

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dt = s => s ? new Date(String(s).replace(' ', 'T')) : null;
  const date = s => s ? dt(s + (String(s).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const time = t => { if (!t) return ''; const [h, m] = t.split(':'); const H = +h; return `${H % 12 || 12}:${m} ${H < 12 ? 'AM' : 'PM'}`; };
  const datetime = s => s ? `${date(s.slice(0, 10))}, ${time(s.slice(11, 16))}` : '—';
  const badge = v => `<span class="badge b-${esc(String(v).split(' ')[0])}">${esc(v)}</span>`;
  const stars = n => { n = Math.round(n); return `<span class="stars" aria-label="${n} out of 5">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>`; };
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

  // Product photos live in assets/img/ (an uploaded photo from the Inventory page always wins over these).
  const PHOTOS = [[/chair/i, 'icon_chairs.png'], [/table/i, 'icon_table.png'], [/loud|speaker|pa /i, 'icon_speaker.png'], [/mic/i, 'icon_microphone.png'],
    [/project/i, 'icon_projector.png'], [/cord|extension|power/i, 'icon_extension.png']];
  const CAT = { Audio: 'icon_speaker.png', Visual: 'icon_projector.png', Furniture: 'icon_chairs.png', Electrical: 'icon_extension.png' };
  const iconSrc = e => asset('assets/img/' + ((PHOTOS.find(([r]) => r.test(e.equipment_name)) || [0, CAT[e.category_name] || 'logo.png'])[1]));
  const icon = e => `<img class="stock" src="${iconSrc(e)}" alt="${esc(e.equipment_name)}">`;
  const picture = e => e.image ? `<img src="${/^data:/.test(e.image) ? e.image : asset(esc(e.image))}" alt="${esc(e.equipment_name)}">` : icon(e);
  const thumb = (e, h = 150) => `<div class="thumb" style="height:${h}px">${picture(e)}</div>`;

  // ---- cart (kept in this browser until the request is submitted) ----
  const cart = {
    get() { try { return JSON.parse(localStorage.getItem('plm_cart') || '[]'); } catch { return []; } },
    set(c) { localStorage.setItem('plm_cart', JSON.stringify(c)); paintCart(); },
    add(e, qty = 1) { const c = this.get(), f = c.find(x => x.id === e.equipment_id);
      if (f) f.qty += qty; else c.push({ id: e.equipment_id, name: e.equipment_name, cat: e.category_name, image: e.image || null, qty }); this.set(c); },
    remove(id) { this.set(this.get().filter(x => x.id !== id)); },
    clear() { this.set([]); },
    count() { return this.get().reduce((a, x) => a + x.qty, 0); },
  };
  const paintCart = () => { const el = document.getElementById('cartPip'); if (el) { const n = cart.count(); el.textContent = n; el.hidden = !n; } };

  // ---- ui bits ----
  let tt;
  function toast(msg, bad) {
    document.querySelector('.toast')?.remove();
    const t = Object.assign(document.createElement('div'), { className: 'toast' + (bad ? ' bad' : ''), textContent: msg });
    t.setAttribute('role', 'status'); document.body.append(t); clearTimeout(tt); tt = setTimeout(() => t.remove(), 3200);
  }
  function modal(title, html, { wide = false } = {}) {
    const v = document.createElement('div'); v.className = 'veil';
    v.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="modal-head"><h3>${esc(title)}</h3><button class="x" aria-label="Close">×</button></div><div class="mb">${html}</div></div>`;
    const close = () => v.remove();
    v.querySelector('.x').onclick = close; v.onmousedown = e => { if (e.target === v) close(); };
    document.body.append(v); return { el: v.querySelector('.mb'), close };
  }
  /** Equipment popup: photo, specs and every review. Used by the client catalog and the admin inventory.
   *  opts: { admin, win: {date,start,end}, onAdd(equipment, qty), onEdit(equipment) } */
  async function equipmentModal(id, { admin = false, win = null, onAdd, onEdit } = {}) {
    const m = modal('Equipment details', '<div class="empty">Loading…</div>', { wide: true });
    const title = m.el.closest('.modal').querySelector('h3');
    try {
      const qs = new URLSearchParams({ id });
      if (win && win.date && win.start && win.end) { qs.set('date', win.date); qs.set('start', win.start); qs.set('end', win.end); }
      const { equipment: e, reviews, summary: sm } = await api('equipment.php?' + qs);
      title.textContent = e.equipment_name;
      const total = +sm.total, free = e.window_checked ? e.available : (e.reservable ? +e.in_stock : 0);
      const bars = [5, 4, 3, 2, 1].map(n => `<div class="bar"><span>${n}★</span><i><b style="width:${total ? sm['s' + n] / total * 100 : 0}%"></b></i><span>${sm['s' + n] || 0}</span></div>`).join('');
      const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
      const specs = admin
        ? `<div class="spec"><small>In stock</small><b>${e.quantity_available} units</b></div><div class="spec"><small>Condition</small><b>${badge(e.condition_status)}</b></div>
           <div class="spec"><small>Status</small><b>${badge(e.availability_status)}</b></div><div class="spec"><small>Units loaned</small><b>${e.total_released}</b></div>
           <div class="spec"><small>Incidents</small><b>${e.incidents}</b></div><div class="spec"><small>Category</small><b>${esc(e.category_name)}</b></div>`
        : `<div class="spec"><small>${e.window_checked ? 'Free for your time' : 'In stock'}</small><b>${free} unit${free === 1 ? '' : 's'}</b></div><div class="spec"><small>Condition</small><b>${badge(e.condition_status)}</b></div>
           <div class="spec"><small>Status</small><b>${badge(e.reservable ? 'Available' : e.availability_status)}</b></div><div class="spec"><small>Times borrowed</small><b>${e.total_released}</b></div>`;
      const buy = admin ? `<div class="buyrow"><button class="btn" id="eqEdit">Edit equipment</button></div>`
        : free > 0 && onAdd ? `<div class="buyrow"><div class="qty"><button type="button" id="eqM" aria-label="Less">−</button><input type="number" id="eqN" min="1" max="${free}" value="1" aria-label="Quantity"><button type="button" id="eqP" aria-label="More">+</button></div>
            <button class="btn gold" id="eqAdd">Add to request</button></div>`
        : `<div class="warn">${e.reservable ? 'None free for the time you picked.' : 'This item can’t be reserved right now.'}</div>`;
      m.el.innerHTML = `<div class="eqv"><div class="eqv-pic">${thumb(e, 250)}</div>
        <div class="eqv-info"><p class="muted small" style="margin:0">${esc(e.category_name)}</p><h2 style="margin:2px 0 6px">${esc(e.equipment_name)}</h2>
          <p class="eqv-rate">${total ? `${stars(sm.avg)} <b>${Number(sm.avg).toFixed(1)}</b> <span class="muted small">· ${total} review${total === 1 ? '' : 's'}</span>` : '<span class="muted small">No reviews yet</span>'}</p>
          <p>${esc(e.description || 'No description yet.')}</p><div class="specs">${specs}</div>${buy}</div></div>
        <h3 class="eqv-h">Reviews from borrowers</h3>
        ${total ? `<div class="eqv-sum"><div class="eqv-big"><b>${Number(sm.avg).toFixed(1)}</b>${stars(sm.avg)}<small class="muted">${total} review${total === 1 ? '' : 's'}</small></div><div class="eqv-bars">${bars}</div></div>` : ''}
        <div class="eqv-revs">${reviews.map(r => `<article class="rv"><span class="av">${esc(initials(r.full_name))}</span><div><div class="rv-top"><b>${esc(r.full_name)}</b><span class="muted small">${esc(r.user_type)} · ${date(r.review_date.slice(0, 10))}</span></div>
            ${stars(r.rating)}<p>${esc(r.comment || 'No comment left.')}</p><small class="muted">For event: ${esc(r.event_name)}</small></div></article>`).join('')
          || '<div class="empty"><b>No reviews for this item yet</b>Borrowers can review it after they borrow it.</div>'}</div>
        ${admin ? '' : `<p class="small" style="margin:14px 0 0"><a href="${url('equipment-details', '?id=' + e.equipment_id)}">Open full page →</a></p>`}`;
      if (admin) m.el.querySelector('#eqEdit').onclick = () => { m.close(); onEdit && onEdit(e); };
      else if (free > 0 && onAdd) {
        const n = m.el.querySelector('#eqN');
        m.el.querySelector('#eqM').onclick = () => n.value = Math.max(1, +n.value - 1);
        m.el.querySelector('#eqP').onclick = () => n.value = Math.min(free, +n.value + 1);
        m.el.querySelector('#eqAdd').onclick = () => { const q = Math.min(Math.max(1, +n.value || 1), free); onAdd(e, q); m.close(); };
      }
    } catch (err) { m.el.innerHTML = `<div class="empty"><b>${esc(err.message)}</b></div>`; }
    return m;
  }
  const busy = async (btn, fn) => { btn.disabled = true; try { return await fn(); } finally { btn.disabled = false; } };

  const I = d => `<svg viewBox="0 0 24 24">${d}</svg>`;
  const IC = {
    dash: I('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
    cat: I('<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>'),
    res: I('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M9 15l2 2 4-4"/>'),
    mine: I('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3h6v3H9zM9 13l2 2 4-4"/>'),
    pen: I('<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17v.5"/>'),
    star: I('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
    send: I('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    back: I('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
    users: I('<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M17 4a4 4 0 010 8M22 21c0-3-2-5-4-5.5"/>'),
    out: I('<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>'),
    bell: I('<path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 01-3.4 0"/>'),
    cal: I('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>'),
    check: I('<path d="M20 6L9 17l-5-5"/>'),
    people: I('<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5M16 4.5a3.5 3.5 0 010 7M22 20c0-3-2-4.8-4-5.3"/>'),
    clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    chart: I('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    pie: I('<path d="M12 3v9h9"/><path d="M20.5 15A9 9 0 1112 3"/>'),
    ret: I('<path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8M3 3v5h5"/>'),
    bars: I('<path d="M3 20h18M7 20V9M12 20V4M17 20v-8"/>'),
    truck: I('<path d="M2 6h12v10H2zM14 9h4l4 3.5V16h-8"/><circle cx="6.5" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/>'),
    clip: I('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 14l2 2 4-4"/>'),
  };
  // client pages: links in the top bar
  const USER_NAV = [['home', 'Home', IC.dash], ['catalog', 'Catalog', IC.cat], ['reserve', 'Reserve', IC.res], ['my-reservations', 'My Reservations', IC.mine], ['my-penalties', 'Penalties', IC.pen], ['reviews', 'Reviews', IC.star]];
  // admin pages: flat sidebar
  const ADMIN_NAV = [
    ['admin-dashboard', 'Dashboard', IC.bars], ['admin-reservations', 'Reservations', IC.cal], ['admin-borrowing', 'Borrowing & Dispatch', IC.truck],
    ['admin-returns', 'Returns & Inspection', IC.clip], ['admin-penalties', 'Penalties', IC.pen], ['admin-inventory', 'Inventory', IC.cat], ['admin-users', 'Users', IC.users],
  ];
  const MODULES = [
    { n: 1, title: 'Client Booking & Interactive Catalog', desc: 'Browse the catalog, check live availability and submit a request.' },
    { n: 2, title: 'Digital Borrowing & Dispatching', desc: 'Approved requests are released with a digital dispatch record.' },
    { n: 3, title: 'Smart Returning, Inspection & Penalty', desc: 'Item-by-item inspection with automatic late, damage and loss fees.' },
    { n: 4, title: 'Advanced Inventory & Asset Life-Cycle', desc: 'Stock, condition, maintenance and retirement of every asset.' },
    { n: 5, title: 'Operational Analytics & Revenue Intelligence', desc: 'Trends, top equipment and penalty revenue at a glance.' },
  ];

  async function init({ need = 'user', active = '' } = {}) {
    let user = null;
    try { user = (await api('auth.php?action=me')).user; } catch (e) { toast(e.message, true); }
    const go = p => location.replace(url(p));
    const note = ((window.PLMUN_CONFIG || {}).demoNotice || '').trim();   // optional "demo" label, set in site-config.js
    if (note && !document.getElementById('demoNote')) {
      const n = Object.assign(document.createElement('div'), { id: 'demoNote', textContent: note });
      n.style.cssText = 'position:fixed;left:50%;bottom:8px;transform:translateX(-50%);z-index:50;font:600 12px/1 system-ui,sans-serif;background:#0e3a23;color:#f4c95d;padding:6px 12px;border-radius:99px;opacity:.9;pointer-events:none;max-width:90vw;text-align:center';
      document.body.append(n);
    }
    if (need === 'guest') { if (user) go(user.role === 'admin' ? 'admin-dashboard' : 'home'); return user; }
    if (!user) { go('login'); return new Promise(() => {}); }
    if (need === 'admin' && user.role !== 'admin') { go('home'); return new Promise(() => {}); }
    if (need === 'user' && user.role === 'admin') { go('admin-dashboard'); return new Promise(() => {}); }

    const logout = async () => { await post('auth.php?action=logout', {}); cart.clear(); go('login'); };
    const isAdmin = user.role === 'admin';
    const link = ([p, l, ic]) => `<a class="nl ${p === active ? 'on' : ''}" href="${url(p)}">${ic}<span>${l}</span>${p === 'reserve' ? '<span class="pip" id="cartPip" hidden>0</span>' : ''}${p === 'my-penalties' && user.unpaid > 0 ? '<span class="pip red">!</span>' : ''}</a>`;
    const nav = document.getElementById('nav');
    let menu; // the element that opens/closes on small screens

    if (isAdmin) {
      // ----- admin: left sidebar -----
      document.body.classList.add('app', 'app-admin');
      const side = menu = document.createElement('aside');
      side.className = 'side';
      side.setAttribute('aria-label', 'Main navigation');
      side.innerHTML = `<a class="brand" href="${url('admin-dashboard')}"><img src="${asset('assets/img/logo.png')}" alt="PLMun logo"><div><b>PLMun Property Office<span class="tag">ADMIN</span></b><span>Reservation &amp; Borrowing</span></div></a>
        ${ADMIN_NAV.map(link).join('')}<div class="sp"></div>
        <div class="me"><b>${esc(user.name)}</b>${esc(user.email)}</div><button class="out" id="outBtn">Log out</button>`;
      const mbar = document.createElement('header');
      mbar.className = 'mbar';
      mbar.innerHTML = `<button class="burger" id="burger" aria-label="Open menu">☰</button><a class="brand" href="${url('admin-dashboard')}"><img src="${asset('assets/img/logo.png')}" alt=""><div><b>PLMun Property Office</b></div></a>`;
      const main = document.createElement('div');
      main.className = 'main';
      main.append(mbar);
      [...document.body.children].forEach(el => { if (el !== nav && el.tagName !== 'SCRIPT') main.append(el); });
      nav.replaceWith(side);
      side.after(main);
    } else {
      // ----- client: top navigation bar -----
      document.body.classList.add('app', 'app-user');
      const top = menu = document.createElement('header');
      top.className = 'topnav';
      top.innerHTML = `<div class="topnav-in">
        <a class="brand" href="${url('home')}"><img src="${asset('assets/img/logo.png')}" alt="PLMun logo"><div><b>Pamantasan ng Lungsod ng Muntinlupa</b><span>Reservation &amp; Borrowing</span></div></a>
        <nav class="links" aria-label="Main navigation">${USER_NAV.map(link).join('')}</nav>
        <div class="acct"><div class="who">${esc(user.first_name || user.name)}<small>${esc(user.type)}</small></div><button class="out" id="outBtn">Log out</button></div></div>`;
      nav.replaceWith(top);
    }
    document.getElementById('burger')?.addEventListener('click', () => document.body.classList.toggle('nav-open'));
    document.body.addEventListener('click', e => { if (document.body.classList.contains('nav-open') && !menu.contains(e.target) && e.target.id !== 'burger') document.body.classList.remove('nav-open'); });
    document.getElementById('outBtn').onclick = logout;
    paintCart();

    const foot = document.getElementById('foot');
    if (foot) foot.innerHTML = `<b>Pamantasan ng Lungsod ng Muntinlupa</b> · Smart Event Equipment Reservation and Borrowing Management System with Operational Analytics`;
    // chat assistant (logged-in pages only)
    document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: asset('assets/css/chatbot.css') }));
    document.head.append(Object.assign(document.createElement('script'), { src: asset('assets/js/chatbot.js'), defer: true }));
    return user;
  }
  return { ROOT, IC, MODULES, url, asset, api, post, esc, money, date, time, datetime, badge, stars, today, icon, iconSrc, picture, thumb, cart, toast, modal, equipmentModal, busy, init, dt };
})();

/* Show/hide eye on every password box (login, sign-up ...). Runs once the page's inputs exist. */
(() => {
  const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.9 17.9A10.1 10.1 0 0112 19C5.6 19 2 12 2 12a18 18 0 014.1-5M9.9 5.2A9.7 9.7 0 0112 5c6.4 0 10 7 10 7a18 18 0 01-2.2 3.2M1 1l22 22"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/></svg>';
  const wire = () => document.querySelectorAll('input[type=password]').forEach(inp => {
    if (inp.closest('.pw-wrap')) return;
    const wrap = document.createElement('div'); wrap.className = 'pw-wrap';
    inp.replaceWith(wrap); wrap.append(inp);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pw-eye'; b.innerHTML = EYE; b.setAttribute('aria-label', 'Show password'); b.setAttribute('aria-pressed', 'false');
    b.onclick = () => {
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      b.innerHTML = show ? EYE_OFF : EYE;
      b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); b.setAttribute('aria-pressed', String(show));
      inp.focus();
    };
    wrap.append(b);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
