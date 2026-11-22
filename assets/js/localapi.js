/* PLMun Reservation & Borrowing - "no server" backend.
 *
 * GitHub Pages (and any plain static host) cannot run PHP or MySQL. This file re-implements the whole api/ folder in the
 * browser so the site works there: data is kept in this browser's localStorage (seeded with the same demo data as the SQL files).
 * app.js loads it automatically ONLY when the PHP backend is not available, so on XAMPP / `php -S` the real PHP + MySQL is used.
 * Every function below mirrors one PHP endpoint, with the same request and response shapes.
 */
window.LocalAPI = (() => {
  const KEY = 'plmun_db_v1', SESSION = 'plmun_session_v1', PENDING = 'plmun_pending_signup';
  const LATE_FEE_PER_HOUR = 50, VERIFY_MINUTES = 10, VERIFY_MAX_TRIES = 5, VERIFY_RESEND_SECONDS = 60;
  const CFG = () => window.PLMUN_CONFIG || {};

  /* ---------- tiny helpers ---------- */
  const pad = n => String(n).padStart(2, '0');
  const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const tstr = d => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const now = () => { const d = new Date(); return `${dstr(d)} ${tstr(d)}`; };
  const today = () => dstr(new Date());
  const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return dstr(d); };
  const hhmmss = t => (t || '').length === 5 ? t + ':00' : t;
  const parse = s => new Date(String(s).replace(' ', 'T'));
  const s = v => String(v ?? '').trim();
  const money = n => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ym = str => String(str).slice(0, 7);
  const monthLabel = key => new Date(key + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const order = (v, list) => { const i = list.indexOf(v); return i < 0 ? list.length : i; };
  const fail = (msg, status = 400) => { const e = new Error(msg); e.status = status; throw e; };
  const fullName = u => `${u.first_name}${u.middle_initial ? ' ' + u.middle_initial + '.' : ''} ${u.last_name}`;
  async function sha(str) {
    if (window.crypto && crypto.subtle) {
      const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
    }
    return 'x' + btoa(unescape(encodeURIComponent(str)));   // very old browsers / non-secure pages
  }

  /* ---------- storage + seed data ---------- */
  let db = null;
  async function seed() {
    const A = await sha('admin123'), U = await sha('user123'), t = now();
    const D = n => addDays(n), at = (n, hm) => `${D(n)} ${hm}:00`;
    const u = (id, last, first, mi, email, type, dept, course, year, contact) =>
      ({ user_id: id, last_name: last, first_name: first, middle_initial: mi, email, password: U, user_type: type, contact_number: contact || null, department: dept, course, year_level: year, account_status: 'Active', created_at: t });
    const eq = (id, cat, name, desc, qty) => ({ equipment_id: id, category_id: cat, equipment_name: name, description: desc, image: null, quantity_available: qty, condition_status: 'Good', availability_status: 'Available' });
    const res = (id, uid, adm, name, off, st, en, loc, purpose, status, remarks) =>
      ({ reservation_id: id, user_id: uid, admin_id: adm, event_name: name, event_date: D(off), start_time: st + ':00', end_time: en + ':00', event_location: loc, purpose, reservation_date: t, reservation_status: status, approval_remarks: remarks });
    return {
      seq: { admin: 1, users: 3, cat: 5, eq: 7, res: 5, ri: 12, rev: 10, bor: 4, bi: 10, ret: 4, rit: 10, pen: 2 },
      admin: [{ admin_id: 1, last_name: 'Administrator', first_name: 'System', middle_initial: null, email: 'admin@plmun.edu.ph', password: A, contact_number: '09123456789', department: 'Property Office', created_at: t }],
      users: [u(1, 'Dela Cruz', 'Juan', 'A', 'juan@plmun.edu.ph', 'Student', 'CITCS', 'BSIT', '4th Year', '09987654321'),
              u(2, 'Santos', 'Maria', 'L', 'maria@plmun.edu.ph', 'Student', 'CITCS', 'BSCS', '3rd Year'),
              u(3, 'Reyes', 'Ana', 'M', 'ana@plmun.edu.ph', 'Faculty', 'CAS', null, null)],
      cat: [[1, 'Audio', 'Speakers, microphones, mixers'], [2, 'Visual', 'Projectors, screens, monitors'], [3, 'Furniture', 'Chairs, tables, stages'],
            [4, 'Lighting', 'Stage and event lighting'], [5, 'Electrical', 'Extension cords, power strips']].map(([category_id, category_name, description]) => ({ category_id, category_name, description })),
      eq: [eq(1, 1, 'Wireless Microphone', 'Handheld wireless mic for emceeing, speeches and performances.', 10),
           { ...eq(2, 1, 'PA Speaker', '15-inch powered speaker for programs, announcements and small-venue events.', 4), condition_status: 'Excellent' },
           eq(3, 2, 'LCD Projector', 'HDMI/VGA projector for presentations, film showings and lectures.', 5),
           eq(4, 3, 'Monobloc Chair', 'Durable, lightweight plastic chair. Easy to move, arrange and store.', 200),
           eq(5, 3, 'Folding Table', '6-foot folding table for registration desks, exhibits and food stations.', 30),
           eq(6, 5, 'Extension Cord', 'Multi-outlet extension cord for sound systems, projectors and other equipment.', 15),
           eq(7, 4, 'Stage Par Light', 'LED par can for stage and program lighting.', 8)],
      res: [res(1, 1, 1, 'IT Week Opening', -75, '08:00', '17:00', 'Covered Court', 'Opening program', 'Completed', 'Approved'),
            res(2, 2, 1, 'CAS Seminar', -50, '09:00', '12:00', 'AVR', 'Research seminar', 'Completed', 'Approved'),
            res(3, 3, 1, 'Faculty Meeting', -30, '13:00', '16:00', 'Room 301', 'Monthly meeting', 'Completed', 'Approved'),
            res(4, 1, 1, 'Org Fair', -12, '08:00', '15:00', 'Quadrangle', 'Student org fair', 'Completed', 'Approved'),
            res(5, 2, null, 'Acquaintance Party', 5, '17:00', '21:00', 'Gymnasium', 'Class party', 'Pending', null)],
      ri: [[1, 1, 4, 100], [2, 1, 1, 3], [3, 1, 2, 2], [4, 2, 3, 1], [5, 2, 5, 4], [6, 3, 3, 1], [7, 3, 6, 2], [8, 4, 5, 10], [9, 4, 4, 60], [10, 4, 2, 1], [11, 5, 1, 2], [12, 5, 7, 4]]
        .map(([reservation_item_id, reservation_id, equipment_id, quantity_requested]) => ({ reservation_item_id, reservation_id, equipment_id, quantity_requested })),
      bor: [[1, 1, -75, '07:30', '17:00'], [2, 2, -50, '08:30', '12:00'], [3, 3, -30, '12:30', '16:00'], [4, 4, -12, '07:30', '15:00']]
        .map(([borrowing_id, reservation_id, off, rel, exp]) => ({ borrowing_id, reservation_id, released_by: 1, release_datetime: at(off, rel), expected_return_datetime: at(off, exp), borrowing_status: 'Returned', dispatch_notes: null })),
      bi: [[1, 1, 1, 100, 'Good'], [2, 1, 2, 3, 'Good'], [3, 1, 3, 2, 'Excellent'], [4, 2, 4, 1, 'Good'], [5, 2, 5, 4, 'Good'], [6, 3, 6, 1, 'Good'], [7, 3, 7, 2, 'Good'], [8, 4, 8, 10, 'Good'], [9, 4, 9, 60, 'Good'], [10, 4, 10, 1, 'Excellent']]
        .map(([borrowing_item_id, borrowing_id, reservation_item_id, quantity_released, dispatch_condition]) => ({ borrowing_item_id, borrowing_id, reservation_item_id, quantity_released, dispatch_condition, notes: null })),
      ret: [[1, 1, -75, '17:20', 'Complete', 'All good'], [2, 2, -50, '14:00', 'Late', 'Returned 2 hours late'], [3, 3, -30, '15:50', 'With Damage', 'Projector lens scratched'], [4, 4, -12, '14:40', 'Complete', 'All good']]
        .map(([return_id, borrowing_id, off, tm, return_status, inspection_notes]) => ({ return_id, borrowing_id, received_by: 1, return_datetime: at(off, tm), return_status, inspection_notes })),
      rit: [[1, 1, 1, 100, 'Good', null, 'Passed'], [2, 1, 2, 3, 'Good', null, 'Passed'], [3, 1, 3, 2, 'Excellent', null, 'Passed'], [4, 2, 4, 1, 'Good', null, 'Passed'], [5, 2, 5, 4, 'Good', null, 'Passed'],
            [6, 3, 6, 1, 'Damaged', 'Lens scratched', 'Failed'], [7, 3, 7, 2, 'Good', null, 'Passed'], [8, 4, 8, 10, 'Good', null, 'Passed'], [9, 4, 9, 60, 'Good', null, 'Passed'], [10, 4, 10, 1, 'Excellent', null, 'Passed']]
        .map(([return_item_id, return_id, borrowing_item_id, quantity_returned, condition_on_return, damage_notes, inspection_status]) => ({ return_item_id, return_id, borrowing_item_id, quantity_returned, condition_on_return, damage_notes, inspection_status })),
      pen: [{ penalty_id: 1, borrowing_id: 2, return_item_id: null, assessed_by: 1, penalty_type: 'Late Return', amount: 100, reason: '2 hour(s) late x PHP 50.00', penalty_status: 'Paid', assessed_at: t },
            { penalty_id: 2, borrowing_id: 3, return_item_id: 6, assessed_by: 1, penalty_type: 'Damage', amount: 500, reason: 'LCD Projector: lens scratched', penalty_status: 'Unpaid', assessed_at: t }],
      rev: [[1, 1, 1, 4, 5, 'Chairs were clean and complete, plenty for our opening program.'], [2, 1, 1, 2, 5, 'The PA speaker was loud and clear even at the covered court.'],
            [3, 1, 1, 1, 4, 'Mics worked well. One needed a battery swap mid-event.'], [4, 2, 2, 3, 4, 'Projector image was bright. Setup was quick.'],
            [5, 2, 2, 5, 5, 'Sturdy tables, perfect for the registration desk.'], [6, 3, 3, 3, 2, 'Lens was already a bit smudged when we got it, and I was penalized for the scratch.'],
            [7, 3, 3, 6, 4, 'Cord was long enough and had enough outlets.'], [8, 1, 4, 5, 5, 'Tables were stable and easy to set up for our booths.'],
            [9, 1, 4, 4, 4, 'Chairs were fine, a few had scuff marks.'], [10, 1, 4, 2, 5, 'Great sound, no feedback issues.']]
        .map(([review_id, user_id, reservation_id, equipment_id, rating, comment]) => ({ review_id, user_id, reservation_id, equipment_id, rating, comment, review_date: t })),
    };
  }
  // Supabase (online database) is used when its URL + public key are filled in assets/js/site-config.js
  const CLOUD = () => { const c = CFG().supabase || {}; return c.url && c.anonKey ? { url: String(c.url).replace(/\/+$/, ''), key: c.anonKey } : null; };
  const ready = (async () => {
    if (CLOUD()) return;
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
    if (!db || !db.seq) { db = await seed(); save(); }
  })();
  function save() { if (CLOUD()) return; try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { fail('This browser has no room left to save data (try a smaller photo or clear site data).', 507); } }
  // online ids: the next free number in that table (a clash with someone else's save is detected by the database and retried)
  const TABLES = { admin: ['admin', 'admin_id'], users: ['users', 'user_id'], cat: ['equipment_category', 'category_id'], eq: ['equipment', 'equipment_id'],
    res: ['reservation', 'reservation_id'], ri: ['reservation_item', 'reservation_item_id'], rev: ['review', 'review_id'], bor: ['borrowing', 'borrowing_id'],
    bi: ['borrowing_item', 'borrowing_item_id'], ret: ['return_record', 'return_id'], rit: ['return_item', 'return_item_id'], pen: ['penalty', 'penalty_id'] };
  const nextId = k => CLOUD() ? db[k].reduce((m, r) => Math.max(m, +r[TABLES[k][1]] || 0), 0) + 1 : ++db.seq[k];
  const find = (arr, key, id) => arr.find(x => x[key] == id);

  let cloudMe = null;   // the signed-in person (online mode), rebuilt from the database on every call
  const sess = {
    get: () => { if (CLOUD()) return cloudMe && { ...cloudMe }; try { return JSON.parse(localStorage.getItem(SESSION)); } catch (e) { return null; } },
    set: v => { try { v ? localStorage.setItem(SESSION, JSON.stringify(v)) : localStorage.removeItem(SESSION); } catch (e) {} },
  };
  const needLogin = () => sess.get() || fail('Please log in first.', 401);
  const needUser = () => { const a = needLogin(); if (a.role !== 'user') fail('Users only.', 403); return a; };
  const needAdmin = () => { const a = needLogin(); if (a.role !== 'admin') fail('Admin access only.', 403); return a; };

  /* ---------- shared logic (bootstrap.php) ---------- */
  const withName = u => ({ ...u, full_name: fullName(u) });
  const isReservable = e => !['Unavailable', 'Under Maintenance'].includes(e.availability_status) && e.condition_status !== 'Retired' && e.quantity_available > 0;
  function reservedMap(date, start, end, exclude = 0) {
    const m = {}, st = hhmmss(start), en = hhmmss(end);
    for (const r of db.res) {
      if (r.event_date !== date || !['Pending', 'Approved', 'Borrowed'].includes(r.reservation_status)) continue;
      if (!(r.start_time < en && r.end_time > st) || r.reservation_id === exclude) continue;
      for (const i of db.ri.filter(x => x.reservation_id === r.reservation_id)) m[i.equipment_id] = (m[i.equipment_id] || 0) + i.quantity_requested;
    }
    return m;
  }
  function refreshOverdue() {
    for (const b of db.bor) if (['Borrowed', 'Partially Returned'].includes(b.borrowing_status) && parse(b.expected_return_datetime) < new Date()) b.borrowing_status = 'Overdue';
  }
  const unpaidFor = uid => db.pen.filter(p => p.penalty_status === 'Unpaid' && uid === (find(db.res, 'reservation_id', find(db.bor, 'borrowing_id', p.borrowing_id)?.reservation_id) || {}).user_id)
    .reduce((a, p) => a + Number(p.amount), 0);
  const penaltyOwner = p => find(db.res, 'reservation_id', find(db.bor, 'borrowing_id', p.borrowing_id)?.reservation_id);
  const outstanding = bi => bi.quantity_released - db.rit.filter(r => r.borrowing_item_id === bi.borrowing_item_id).reduce((a, r) => a + r.quantity_returned, 0);
  const equipView = e => ({ ...e, category_name: find(db.cat, 'category_id', e.category_id)?.category_name });
  const reviewed = (rid, eid) => db.rev.some(v => v.reservation_id === rid && v.equipment_id === eid);

  /* ---------- e-mail (EmailJS, because a static site has no mail server) ---------- */
  async function sendMail(to, subject, html, text, name) {
    const c = CFG().emailjs || {};
    if (!c.serviceId || !c.templateId || !c.publicKey)
      return [false, 'Email is not set up on this site yet. Add your EmailJS keys in assets/js/site-config.js (see README).'];
    try {
      const r = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: c.serviceId, template_id: c.templateId, user_id: c.publicKey, template_params: { to_email: to, to_name: name || '', subject, html, message: text } }),
      });
      const t = await r.text();
      if (!r.ok) throw new Error(t || r.status);
      return [true, 'Email sent to ' + to + '.'];
    } catch (e) { return [false, 'Email could not be sent: ' + (e.message || e)]; }
  }
  const h = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shell = body => `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #ebe4d2;border-radius:12px;overflow:hidden">
    <div style="background:#0e3a23;color:#fff;padding:18px 22px"><b style="font-size:18px">PLMun Property Office</b><br><span style="color:#f4c95d">Reservation &amp; Borrowing</span></div>
    <div style="padding:22px;color:#16261c;line-height:1.55">${body}<p style="color:#617066;font-size:13px">This is an automated message from the PLMun Reservation &amp; Borrowing System.</p></div></div>`;
  function notifyReady(id) {
    const r = find(db.res, 'reservation_id', id);
    if (!r) return Promise.resolve([false, 'Reservation not found.']);
    const u = find(db.users, 'user_id', r.user_id), name = fullName(u);
    const items = db.ri.filter(i => i.reservation_id === id).map(i => ({ q: i.quantity_requested, n: find(db.eq, 'equipment_id', i.equipment_id).equipment_name }));
    const fmt = t => { const [H, M] = t.split(':'); return `${H % 12 || 12}:${M} ${H < 12 ? 'AM' : 'PM'}`; };
    const when = new Date(r.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + ', ' + fmt(r.start_time) + ' - ' + fmt(r.end_time);
    const remarks = s(r.approval_remarks);
    const html = shell(`<p>Hi ${h(name)},</p><p>Good news! Your reservation <b>#${r.reservation_id} &ndash; ${h(r.event_name)}</b> is <b>approved and ready for release</b>.</p>
      <p><b>When:</b> ${h(when)}<br><b>Venue:</b> ${h(r.event_location)}</p><p style="margin-bottom:4px"><b>Items</b></p><ul style="margin-top:0">${items.map(i => `<li>${i.q} &times; ${h(i.n)}</li>`).join('')}</ul>
      ${remarks ? `<p><b>Note from the office:</b> ${h(remarks)}</p>` : ''}<p>Please go to the Property Office to have your items released and bring your school ID. Returning late or damaged items may result in penalties.</p>`);
    const text = `Hi ${name},\n\nYour reservation #${r.reservation_id} (${r.event_name}) is approved and ready for release.\nWhen: ${when}\nVenue: ${r.event_location}\n\nItems:\n${items.map(i => `- ${i.q} x ${i.n}`).join('\n')}\n\nPlease go to the Property Office to have your items released and bring your school ID.\n\nPLMun Property Office`;
    return sendMail(u.email, `Your reservation #${r.reservation_id} is ready for release`, html, text, name);
  }

  /* ---------- endpoints ---------- */
  const E = {};

  E['auth.php'] = async ({ q, body }) => {
    const action = q.get('action');
    if (CLOUD()) return cloudAuth(action, body);
    if (action === 'me') {
      const a = sess.get();
      if (!a) return { user: null };
      refreshOverdue();
      if (a.role === 'user') {
        a.unpaid = unpaidFor(a.id);
        a.notify = db.pen.filter(p => p.penalty_status === 'Unpaid' && penaltyOwner(p)?.user_id === a.id).length
          + db.bor.filter(b => b.borrowing_status === 'Overdue' && find(db.res, 'reservation_id', b.reservation_id)?.user_id === a.id).length;
      } else {
        a.notify = db.res.filter(r => r.reservation_status === 'Pending').length + db.bor.filter(b => b.borrowing_status === 'Overdue').length;
      }
      return { user: a };
    }
    if (action === 'logout') { sess.set(null); return {}; }
    if (action === 'login') {
      const role = s(body.role) === 'admin' ? 'admin' : 'user';
      const email = s(body.email).toLowerCase(), pass = String(body.password ?? '');
      if (!email || !pass) fail('Please enter your email and password.');
      const row = (role === 'admin' ? db.admin : db.users).find(x => x.email.toLowerCase() === email);
      if (!row || row.password !== await sha(pass)) fail('Wrong email or password.', 401);
      if (role === 'user') {
        const msg = { Pending: 'Your account is still waiting for approval.', Suspended: 'Your account is suspended. Please see the Property Office.', Deactivated: 'Your account is deactivated.' };
        if (msg[row.account_status]) fail(msg[row.account_status], 403);
      }
      const a = { role, id: role === 'admin' ? row.admin_id : row.user_id, name: fullName(row), first_name: row.first_name, email: row.email, type: role === 'admin' ? 'Admin' : row.user_type, department: row.department || null };
      sess.set(a);
      return { user: a };
    }
    if (action === 'register') {
      const last = s(body.last_name), first = s(body.first_name);
      const mi = s(body.middle_initial).replace(/[. ]+$/, '').toUpperCase();
      const email = s(body.email).toLowerCase(), pass = String(body.password ?? '');
      const type = ['Student', 'Faculty', 'Staff'].includes(body.user_type) ? body.user_type : 'Student';
      if (!last || !first || !email || !pass) fail('Please fill in all required fields.');
      if (last.length > 60 || first.length > 60) fail('Surname and first name must be 60 characters or fewer.');
      if (mi && !/^\p{L}$/u.test(mi)) fail('Middle initial must be a single letter.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Please enter a valid email address.');
      if (pass.length < 6) fail('Password must be at least 6 characters.');
      const contact = s(body.contact_number);
      if (contact && !/^[0-9+\-\s]{7,20}$/.test(contact)) fail('Contact number looks invalid.');
      if (db.users.some(x => x.email.toLowerCase() === email) || db.admin.some(x => x.email.toLowerCase() === email)) fail('That email is already registered.', 409);
      const p = { last, first, mi, email, pass_hash: await sha(pass), type, contact, department: s(body.department), course: s(body.course), year: s(body.year_level) };
      return issueCode(p, true);
    }
    if (action === 'resend_code') {
      const p = pending() || fail('Your sign-up session expired. Please fill in the form again.', 409);
      const wait = VERIFY_RESEND_SECONDS - Math.floor((Date.now() - p.sent_at) / 1000);
      if (wait > 0) fail(`Please wait ${wait} second(s) before requesting another code.`, 429);
      return issueCode(p, false);
    }
    if (action === 'verify_email') {
      const p = pending() || fail('Your sign-up session expired. Please fill in the form again.', 409);
      const code = String(body.code ?? '').replace(/\D/g, '');
      if (code.length !== 6) fail('Enter the 6-digit code from your email.');
      if (Date.now() > p.expires) fail('That code has expired. Tap “Resend code” to get a new one.', 410);
      if (p.tries >= VERIFY_MAX_TRIES) fail('Too many wrong attempts. Tap “Resend code” to get a new one.', 429);
      if (await sha(code) !== p.code_hash) {
        p.tries++; setPending(p);
        const left = VERIFY_MAX_TRIES - p.tries;
        fail(left > 0 ? `Wrong code. ${left} attempt(s) left.` : 'Too many wrong attempts. Tap “Resend code” to get a new one.', 401);
      }
      if (db.users.some(x => x.email.toLowerCase() === p.email) || db.admin.some(x => x.email.toLowerCase() === p.email)) fail('That email is already registered.', 409);
      db.users.push({ user_id: nextId('users'), last_name: p.last, first_name: p.first, middle_initial: p.mi || null, email: p.email, password: p.pass_hash, user_type: p.type,
        contact_number: p.contact || null, department: p.department || null, course: p.type === 'Student' ? (p.course || null) : null, year_level: p.type === 'Student' ? (p.year || null) : null,
        account_status: 'Active', created_at: now() });
      setPending(null);
      return { message: 'Email verified. Account created. You can log in now.' };
    }
    fail('Unknown action.', 404);
  };
  const pending = () => { try { return JSON.parse(sessionStorage.getItem(PENDING)); } catch (e) { return null; } };
  const setPending = p => { try { p ? sessionStorage.setItem(PENDING, JSON.stringify(p)) : sessionStorage.removeItem(PENDING); } catch (e) {} };
  async function issueCode(p, first) {
    const code = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
    Object.assign(p, { code_hash: await sha(code), expires: Date.now() + VERIFY_MINUTES * 6e4, tries: 0, sent_at: Date.now() });
    const html = shell(`<p>Hi ${h(p.first)},</p><p>Use this code to verify your email and finish creating your account:</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:700;background:#f6f1e3;border-radius:10px;padding:14px;text-align:center;margin:14px 0">${code}</p>
      <p>The code expires in ${VERIFY_MINUTES} minutes. If you did not try to sign up, you can ignore this email.</p>`);
    const [sent, msg] = await sendMail(p.email, 'Your PLMun verification code: ' + code, html,
      `Hi ${p.first},\n\nYour PLMun verification code is: ${code}\n\nIt expires in ${VERIFY_MINUTES} minutes.\n\nPLMun Property Office`, p.first);
    const c = CFG().emailjs || {};
    const configured = c.serviceId && c.templateId && c.publicKey;
    if (!sent && configured) fail('We could not send the verification code. ' + msg, 502);
    setPending(p);
    const out = { verify: true, email: p.email, minutes: VERIFY_MINUTES, resend_after: VERIFY_RESEND_SECONDS };
    // No EmailJS keys yet = demo mode: show the code on screen so the flow can still be tried.
    if (!sent) out.demo_code = code;
    return out;
  }

  E['users.php'] = async ({ method, body }) => {
    needAdmin();
    if (method === 'GET') return { users: db.users.map(u => ({ ...withName(u), reservations: db.res.filter(r => r.user_id === u.user_id).length, unpaid: unpaidFor(u.user_id) }))
      .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)) };
    const id = +body.id;
    if (body.action === 'status' && ['Pending', 'Active', 'Suspended', 'Deactivated'].includes(body.status)) { const u = find(db.users, 'user_id', id); if (u) u.account_status = body.status; return {}; }
    if (body.action === 'delete') {
      const u = find(db.users, 'user_id', id) || fail('User not found.', 404);
      const n = db.res.filter(r => r.user_id === id).length;
      if (n > 0) fail(`${fullName(u)} has ${n} reservation record(s), so the account cannot be deleted (it would erase the borrowing history). Set the status to Deactivated instead.`);
      db.users = db.users.filter(x => x.user_id !== id); return {};
    }
    if (body.action === 'make_admin') {
      const u = find(db.users, 'user_id', id) || fail('User not found.', 404);
      if (db.admin.some(a => a.email === u.email)) fail('That email is already an admin.', 409);
      db.admin.push({ admin_id: nextId('admin'), last_name: u.last_name, first_name: u.first_name, middle_initial: u.middle_initial, email: u.email, password: u.password, contact_number: u.contact_number, department: u.department, created_at: now() });
      const n = db.res.filter(r => r.user_id === id).length;
      if (n === 0) db.users = db.users.filter(x => x.user_id !== id); else u.account_status = 'Deactivated';
      return { kept_as_deactivated: n > 0 };
    }
    fail('Unknown action.', 404);
  };

  E['categories.php'] = async ({ method, body }) => {
    needLogin();
    if (method === 'GET') return { categories: db.cat.map(c => ({ ...c, items: db.eq.filter(e => e.category_id === c.category_id).length })).sort((a, b) => a.category_name.localeCompare(b.category_name)) };
    needAdmin();
    if (body.action === 'add') {
      const n = s(body.category_name); if (!n) fail('Category name is required.');
      if (db.cat.some(c => c.category_name.toLowerCase() === n.toLowerCase())) fail('That category already exists.', 409);
      db.cat.push({ category_id: nextId('cat'), category_name: n, description: s(body.description) || null }); return {};
    }
    if (body.action === 'delete') {
      if (db.eq.some(e => e.category_id === +body.id)) fail('Category still has equipment. Move or remove those items first.', 409);
      db.cat = db.cat.filter(c => c.category_id !== +body.id); return {};
    }
    fail('Unknown action.', 404);
  };

  const reviewSummary = list => {
    const c = k => list.filter(r => r.rating === k).length;
    return { total: list.length, avg: list.length ? list.reduce((a, r) => a + r.rating, 0) / list.length : 0, s5: c(5), s4: c(4), s3: c(3), s2: c(2), s1: c(1) };
  };
  async function readImage(file) {   // shrink the photo so it fits in browser storage
    const url = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(file); });
    if (!/^data:image\/(jpeg|png|webp)/.test(url)) fail('Image must be JPG, PNG or WEBP.');
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const k = Math.min(1, 700 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  }
  E['equipment.php'] = async ({ method, q, body, form }) => {
    const me = needLogin(), isAdmin = me.role === 'admin';
    if (method === 'GET') {
      const id = +q.get('id') || 0;
      let rows = db.eq.filter(e => (!id || e.equipment_id === id) && (isAdmin || e.condition_status !== 'Retired')
        && (!q.get('category') || e.category_id === +q.get('category'))
        && (!q.get('q') || (e.equipment_name + ' ' + (e.description || '')).toLowerCase().includes(q.get('q').toLowerCase())));
      const date = s(q.get('date')), st = s(q.get('start')), en = s(q.get('end')), windowed = date && st && en && st < en;
      const resv = windowed ? reservedMap(date, st, en) : {};
      const held = {};
      for (const r of db.res) if (['Pending', 'Approved', 'Borrowed'].includes(r.reservation_status) && (r.reservation_status === 'Borrowed' || r.event_date >= today()))
        for (const i of db.ri.filter(x => x.reservation_id === r.reservation_id)) held[i.equipment_id] = (held[i.equipment_id] || 0) + i.quantity_requested;
      rows = rows.map(e => {
        const v = equipView(e), eid = e.equipment_id, rv = db.rev.filter(x => x.equipment_id === eid);
        const ris = db.ri.filter(x => x.equipment_id === eid), riIds = ris.map(x => x.reservation_item_id);
        const bis = db.bi.filter(x => riIds.includes(x.reservation_item_id));
        v.popularity = ris.filter(x => ['Approved', 'Borrowed', 'Completed'].includes(find(db.res, 'reservation_id', x.reservation_id)?.reservation_status)).reduce((a, x) => a + x.quantity_requested, 0);
        v.total_released = bis.reduce((a, x) => a + x.quantity_released, 0);
        v.incidents = db.rit.filter(x => bis.some(b => b.borrowing_item_id === x.borrowing_item_id) && ['Damaged', 'Lost', 'Needs Repair'].includes(x.condition_on_return)).length;
        v.rating_avg = rv.length ? rv.reduce((a, x) => a + x.rating, 0) / rv.length : 0;
        v.rating_count = rv.length;
        v.in_stock = Math.max(0, e.quantity_available - (held[eid] || 0));
        v.reservable = isReservable(e);
        v.reserved = resv[eid] || 0;
        v.available = v.reservable ? Math.max(0, e.quantity_available - v.reserved) : 0;
        v.window_checked = !!windowed;
        return v;
      }).sort((a, b) => a.category_name.localeCompare(b.category_name) || a.equipment_name.localeCompare(b.equipment_name));
      if (id) {
        if (!rows.length) fail('Equipment not found.', 404);
        const list = db.rev.filter(r => r.equipment_id === id);
        const reviews = list.map(r => { const u = find(db.users, 'user_id', r.user_id); return { review_id: r.review_id, rating: r.rating, comment: r.comment, review_date: r.review_date, user_type: u?.user_type, event_name: find(db.res, 'reservation_id', r.reservation_id)?.event_name, full_name: u ? fullName(u) : '' }; })
          .sort((a, b) => b.review_date.localeCompare(a.review_date) || b.review_id - a.review_id).slice(0, 50);
        return { equipment: rows[0], reviews, summary: reviewSummary(list) };
      }
      return { equipment: rows };
    }
    needAdmin();
    const b = form ? Object.fromEntries(form.entries()) : body;
    if (b.action === 'delete') {
      const id = +b.id;
      if (db.ri.some(x => x.equipment_id === id)) fail('This item has reservation history and cannot be deleted. Set it to Retired instead.', 409);
      db.eq = db.eq.filter(e => e.equipment_id !== id); return {};
    }
    if (b.action === 'save' || form) {
      const name = s(b.equipment_name);
      if (!name || !b.category_id) fail('Name and category are required.');
      const qty = parseInt(b.quantity_available || 0, 10);
      if (qty < 0) fail('Quantity cannot be negative.');
      const cond = ['Excellent', 'Good', 'Fair', 'Needs Repair', 'Damaged', 'Retired'].includes(b.condition_status) ? b.condition_status : 'Good';
      let avail = ['Available', 'Reserved', 'Borrowed', 'Unavailable', 'Under Maintenance'].includes(b.availability_status) ? b.availability_status : 'Available';
      if (cond === 'Retired') avail = 'Unavailable';
      let image = null;
      if (form && form.get('image') && form.get('image').size) {
        const f = form.get('image');
        if (f.size > 2 * 1024 * 1024) fail('Image must be 2 MB or smaller.');
        image = await readImage(f);
      }
      const id = +b.equipment_id || 0;
      if (id) {
        const e = find(db.eq, 'equipment_id', id) || fail('Equipment not found.', 404);
        Object.assign(e, { category_id: +b.category_id, equipment_name: name, description: s(b.description) || null, quantity_available: qty, condition_status: cond, availability_status: avail });
        if (image) e.image = image;
      } else db.eq.push({ equipment_id: nextId('eq'), category_id: +b.category_id, equipment_name: name, description: s(b.description) || null, image, quantity_available: qty, condition_status: cond, availability_status: avail });
      return {};
    }
    fail('Unknown action.', 404);
  };

  function attachItems(rows) {
    return rows.map(r => ({ ...r, items: db.ri.filter(i => i.reservation_id === r.reservation_id).map(i => {
      const e = find(db.eq, 'equipment_id', i.equipment_id);
      return { ...i, equipment_name: e.equipment_name, image: e.image, category_name: find(db.cat, 'category_id', e.category_id).category_name, reviewed: reviewed(i.reservation_id, i.equipment_id) ? 1 : 0 };
    }) }));
  }
  E['reservations.php'] = async ({ method, q, body }) => {
    const me = needLogin(); refreshOverdue();
    if (method === 'GET') {
      const view = r => { const u = find(db.users, 'user_id', r.user_id), b = db.bor.find(x => x.reservation_id === r.reservation_id);
        return { ...r, full_name: fullName(u), user_type: u.user_type, department: u.department, email: u.email, contact_number: u.contact_number,
          borrowing_id: b?.borrowing_id ?? null, expected_return_datetime: b?.expected_return_datetime ?? null, borrowing_status: b?.borrowing_status ?? null, release_datetime: b?.release_datetime ?? null,
          unreviewed: db.ri.filter(i => i.reservation_id === r.reservation_id && !reviewed(i.reservation_id, i.equipment_id)).length }; };
      const ST = ['Pending', 'Approved', 'Borrowed', 'Completed', 'Rejected', 'Cancelled'];
      let rows;
      if (me.role === 'user') rows = db.res.filter(r => r.user_id === me.id).map(view).sort((a, b) => b.reservation_date.localeCompare(a.reservation_date) || b.reservation_id - a.reservation_id);
      else rows = db.res.filter(r => !q.get('status') || r.reservation_status === q.get('status')).map(view)
        .sort((a, b) => order(a.reservation_status, ST) - order(b.reservation_status, ST) || a.event_date.localeCompare(b.event_date));
      return { reservations: attachItems(rows) };
    }
    const action = body.action;
    if (action === 'create') {
      const u = needUser();
      const name = s(body.event_name), date = s(body.event_date), start = s(body.start_time), end = s(body.end_time), loc = s(body.event_location), purpose = s(body.purpose);
      const items = Array.isArray(body.items) ? body.items : [];
      if (!name || !loc || !date || !start || !end) fail('Please complete all event details.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today()) fail('Event date cannot be in the past.');
      if (start >= end) fail('End time must be later than start time.');
      if (!items.length) fail('Add at least one equipment item to your request.');
      const unpaid = unpaidFor(u.id);
      if (unpaid > 0) fail(`You have unpaid penalties (PHP ${money(unpaid)}). Please settle them at the Property Office first.`, 403);
      if (find(db.users, 'user_id', u.id)?.account_status !== 'Active') fail('Your account is not active.', 403);
      const resv = reservedMap(date, start, end), clean = {};
      for (const it of items) { const eid = +it.equipment_id || 0, qty = +it.qty || 0; if (eid > 0 && qty > 0) clean[eid] = (clean[eid] || 0) + qty; }
      if (!Object.keys(clean).length) fail('Add at least one equipment item to your request.');
      for (const [eid, qty] of Object.entries(clean)) {
        const e = find(db.eq, 'equipment_id', eid);
        if (!e || !isReservable(e)) fail(`"${e ? e.equipment_name : 'An item'}" is not available for reservation.`);
        const free = e.quantity_available - (resv[eid] || 0);
        if (qty > free) fail(`Only ${Math.max(free, 0)} of "${e.equipment_name}" left for that time slot.`, 409);
      }
      const rid = nextId('res');
      db.res.push({ reservation_id: rid, user_id: u.id, admin_id: null, event_name: name, event_date: date, start_time: hhmmss(start), end_time: hhmmss(end), event_location: loc, purpose: purpose || null, reservation_date: now(), reservation_status: 'Pending', approval_remarks: null });
      for (const [eid, qty] of Object.entries(clean)) db.ri.push({ reservation_item_id: nextId('ri'), reservation_id: rid, equipment_id: +eid, quantity_requested: qty });
      return { reservation_id: rid };
    }
    if (action === 'cancel') {
      const u = needUser(), r = db.res.find(x => x.reservation_id === +body.id && x.user_id === u.id) || fail('Reservation not found.', 404);
      if (!['Pending', 'Approved'].includes(r.reservation_status)) fail('Only pending or approved reservations can be cancelled.');
      r.reservation_status = 'Cancelled'; return {};
    }
    if (action === 'decide') {
      const a = needAdmin(), r = find(db.res, 'reservation_id', +body.id) || fail('Reservation not found.', 404);
      if (r.reservation_status !== 'Pending') fail('This request was already reviewed.');
      const remarks = s(body.remarks);
      if (body.decision === 'approve') {
        const resv = reservedMap(r.event_date, r.start_time, r.end_time, r.reservation_id);
        for (const it of db.ri.filter(i => i.reservation_id === r.reservation_id)) {
          const e = find(db.eq, 'equipment_id', it.equipment_id), free = e.quantity_available - (resv[it.equipment_id] || 0);
          if (it.quantity_requested > free) fail(`Cannot approve: only ${Math.max(free, 0)} of "${e.equipment_name}" is free for that slot.`, 409);
        }
        Object.assign(r, { reservation_status: 'Approved', admin_id: a.id, approval_remarks: remarks || null });
        await flush();   // save first, so a failed save never sends an e-mail
        const [sent, msg] = await notifyReady(r.reservation_id);
        return { emailed: sent, email_message: msg };
      }
      if (body.decision === 'reject') {
        if (!remarks) fail('Please give a reason for rejecting.');
        Object.assign(r, { reservation_status: 'Rejected', admin_id: a.id, approval_remarks: remarks }); return {};
      }
      fail('Invalid decision.');
    }
    fail('Unknown action.', 404);
  };

  E['reviews.php'] = async ({ method, q, body }) => {
    const me = needLogin();
    if (method === 'GET') {
      const limit = Math.min(Math.max(parseInt(q.get('limit') || 200, 10), 1), 500);
      const reviews = db.rev.map(rv => { const e = find(db.eq, 'equipment_id', rv.equipment_id), u = find(db.users, 'user_id', rv.user_id);
        return { review_id: rv.review_id, equipment_id: rv.equipment_id, equipment_name: e.equipment_name, category_name: find(db.cat, 'category_id', e.category_id).category_name, rating: rv.rating, comment: rv.comment,
          review_date: rv.review_date, full_name: fullName(u), user_type: u.user_type, event_name: find(db.res, 'reservation_id', rv.reservation_id).event_name }; })
        .sort((a, b) => b.review_date.localeCompare(a.review_date) || b.review_id - a.review_id).slice(0, limit);
      const products = [...new Set(db.rev.map(r => r.equipment_id))].map(id => {
        const e = find(db.eq, 'equipment_id', id), sm = reviewSummary(db.rev.filter(r => r.equipment_id === id));
        return { equipment_id: id, equipment_name: e.equipment_name, image: e.image, category_name: find(db.cat, 'category_id', e.category_id).category_name, ...sm };
      }).sort((a, b) => a.equipment_name.localeCompare(b.equipment_name));
      const all = reviewSummary(db.rev);
      let eligible = [];
      if (me.role === 'user') {
        eligible = [];
        for (const r of db.res.filter(x => x.user_id === me.id && ['Borrowed', 'Completed'].includes(x.reservation_status)))
          for (const ri of db.ri.filter(i => i.reservation_id === r.reservation_id))
            if (!reviewed(r.reservation_id, ri.equipment_id)) eligible.push({ reservation_id: r.reservation_id, event_name: r.event_name, event_date: r.event_date, equipment_id: ri.equipment_id, equipment_name: find(db.eq, 'equipment_id', ri.equipment_id).equipment_name });
        eligible.sort((a, b) => b.event_date.localeCompare(a.event_date) || a.equipment_name.localeCompare(b.equipment_name));
      }
      return { reviews, products, summary: { total: all.total, avg: all.avg }, eligible };
    }
    const u = needUser(), rating = +body.rating || 0, rid = +body.reservation_id || 0, eid = +body.equipment_id || 0;
    if (rating < 1 || rating > 5) fail('Please choose a rating from 1 to 5 stars.');
    if (!eid) fail('Please choose the product you are reviewing.');
    const r = db.res.find(x => x.reservation_id === rid && x.user_id === u.id);
    if (!r || !['Borrowed', 'Completed'].includes(r.reservation_status)) fail('You can review items once you have borrowed them.');
    if (!db.ri.some(i => i.reservation_id === rid && i.equipment_id === eid)) fail('That product was not part of this reservation.');
    if (reviewed(rid, eid)) fail('You already reviewed this product for this reservation.', 409);
    db.rev.push({ review_id: nextId('rev'), user_id: u.id, reservation_id: rid, equipment_id: eid, rating, comment: s(body.comment) || null, review_date: now() });
    return {};
  };

  const borrowItem = bi => { const ri = find(db.ri, 'reservation_item_id', bi.reservation_item_id); return { ...bi, equipment_id: ri.equipment_id, quantity_requested: ri.quantity_requested, equipment_name: find(db.eq, 'equipment_id', ri.equipment_id).equipment_name, outstanding: outstanding(bi) }; };
  E['borrowings.php'] = async ({ method, body }) => {
    const me = needAdmin(); refreshOverdue();
    if (method === 'GET') {
      const BS = ['Overdue', 'Borrowed', 'Partially Returned', 'Returned'];
      const borrowings = db.bor.map(b => { const r = find(db.res, 'reservation_id', b.reservation_id), u = find(db.users, 'user_id', r.user_id);
        return { ...b, event_name: r.event_name, event_location: r.event_location, event_date: r.event_date, full_name: fullName(u), contact_number: u.contact_number, user_type: u.user_type,
          items: db.bi.filter(x => x.borrowing_id === b.borrowing_id).map(borrowItem) }; })
        .sort((a, b) => order(a.borrowing_status, BS) - order(b.borrowing_status, BS) || b.expected_return_datetime.localeCompare(a.expected_return_datetime));
      const ready = db.res.filter(r => r.reservation_status === 'Approved' && !db.bor.some(b => b.reservation_id === r.reservation_id))
        .sort((a, b) => a.event_date.localeCompare(b.event_date) || a.start_time.localeCompare(b.start_time))
        .map(r => { const u = find(db.users, 'user_id', r.user_id);
          return { ...r, full_name: fullName(u), contact_number: u.contact_number, user_type: u.user_type,
            items: db.ri.filter(i => i.reservation_id === r.reservation_id).map(i => { const e = find(db.eq, 'equipment_id', i.equipment_id);
              return { reservation_item_id: i.reservation_item_id, reservation_id: i.reservation_id, quantity_requested: i.quantity_requested, equipment_name: e.equipment_name, condition_status: e.condition_status, quantity_available: e.quantity_available }; }) }; });
      return { borrowings, ready };
    }
    if (body.action === 'notify') {
      const r = find(db.res, 'reservation_id', +body.reservation_id);
      if (!r || r.reservation_status !== 'Approved') fail('Only approved reservations can be notified.');
      const [sent, msg] = await notifyReady(r.reservation_id);
      return { emailed: sent, email_message: msg };
    }
    if (body.action === 'release') {
      const rid = +body.reservation_id || 0, r = find(db.res, 'reservation_id', rid);
      if (!r || r.reservation_status !== 'Approved') fail('Only approved reservations can be released.');
      if (db.bor.some(b => b.reservation_id === rid)) fail('Already released.');
      const items = Array.isArray(body.items) ? body.items : [], valid = ['Excellent', 'Good', 'Fair', 'Needs Repair'], rows = [];
      for (const it of items) {
        const ri = db.ri.find(x => x.reservation_item_id === +it.reservation_item_id && x.reservation_id === rid), qty = +it.qty || 0;
        if (!ri || qty <= 0) continue;
        if (qty > ri.quantity_requested) fail(`Cannot release more than requested for "${find(db.eq, 'equipment_id', ri.equipment_id).equipment_name}".`);
        rows.push({ ri, qty, cond: valid.includes(it.condition) ? it.condition : 'Good', notes: s(it.notes) || null });
      }
      if (!rows.length) fail('Release at least one item.');
      const bid = nextId('bor');
      db.bor.push({ borrowing_id: bid, reservation_id: rid, released_by: me.id, release_datetime: now(), expected_return_datetime: `${r.event_date} ${r.end_time}`, borrowing_status: 'Borrowed', dispatch_notes: s(body.notes) || null });
      for (const x of rows) db.bi.push({ borrowing_item_id: nextId('bi'), borrowing_id: bid, reservation_item_id: x.ri.reservation_item_id, quantity_released: x.qty, dispatch_condition: x.cond, notes: x.notes });
      r.reservation_status = 'Borrowed';
      return { borrowing_id: bid };
    }
    fail('Unknown action.', 404);
  };

  E['returns.php'] = async ({ method, body }) => {
    const me = needAdmin();
    if (method === 'GET') {
      const returns = db.ret.map(rr => { const b = find(db.bor, 'borrowing_id', rr.borrowing_id), r = find(db.res, 'reservation_id', b.reservation_id), u = find(db.users, 'user_id', r.user_id), a = find(db.admin, 'admin_id', rr.received_by);
        return { ...rr, event_name: r.event_name, full_name: fullName(u), received_by_name: a ? fullName(a) : null, expected_return_datetime: b.expected_return_datetime,
          items: db.rit.filter(x => x.return_id === rr.return_id).map(x => { const bi = find(db.bi, 'borrowing_item_id', x.borrowing_item_id), ri = find(db.ri, 'reservation_item_id', bi.reservation_item_id);
            return { ...x, equipment_name: find(db.eq, 'equipment_id', ri.equipment_id).equipment_name }; }) }; })
        .sort((a, b) => b.return_datetime.localeCompare(a.return_datetime)).slice(0, 100);
      return { returns, late_fee_per_hour: LATE_FEE_PER_HOUR };
    }
    if (body.action !== 'process') fail('Unknown action.', 404);
    const bid = +body.borrowing_id || 0, bor = find(db.bor, 'borrowing_id', bid);
    if (!bor || bor.borrowing_status === 'Returned') fail('This borrowing is not open for return.');
    const items = Array.isArray(body.items) ? body.items : [], conds = ['Excellent', 'Good', 'Fair', 'Needs Repair', 'Damaged', 'Lost'], lines = [];
    for (const it of items) {
      const qty = +it.qty || 0; if (qty <= 0) continue;
      const bi = db.bi.find(x => x.borrowing_item_id === +it.borrowing_item_id && x.borrowing_id === bid) || fail('Invalid item.');
      const ri = find(db.ri, 'reservation_item_id', bi.reservation_item_id), e = find(db.eq, 'equipment_id', ri.equipment_id), out = outstanding(bi);
      if (qty > out) fail(`"${e.equipment_name}": only ${out} still outstanding.`);
      lines.push({ bi, e, qty, cond: conds.includes(it.condition) ? it.condition : 'Good', notes: s(it.notes), fee: Math.max(0, +it.penalty || 0) });
    }
    if (!lines.length) fail('Enter the quantity being returned for at least one item.');
    const nowD = new Date(), expected = parse(bor.expected_return_datetime), late = nowD > expected;
    let damaged = false;
    const rid = nextId('ret');
    const rec = { return_id: rid, borrowing_id: bid, received_by: me.id, return_datetime: now(), return_status: 'Complete', inspection_notes: s(body.inspection_notes) || null };
    db.ret.push(rec);
    for (const l of lines) {
      const bad = ['Needs Repair', 'Damaged', 'Lost'].includes(l.cond); damaged = damaged || bad;
      const riid = nextId('rit');
      db.rit.push({ return_item_id: riid, return_id: rid, borrowing_item_id: l.bi.borrowing_item_id, quantity_returned: l.qty, condition_on_return: l.cond, damage_notes: l.notes || null, inspection_status: bad ? 'Failed' : 'Passed' });
      if (bad) l.e.quantity_available = Math.max(l.e.quantity_available - l.qty, 0);
      if (l.fee > 0 && bad)
        db.pen.push({ penalty_id: nextId('pen'), borrowing_id: bid, return_item_id: riid, assessed_by: me.id, penalty_type: l.cond === 'Lost' ? 'Loss' : 'Damage', amount: l.fee,
          reason: `${l.e.equipment_name} x${l.qty} - ${l.cond}${l.notes ? ': ' + l.notes : ''}`, penalty_status: 'Unpaid', assessed_at: now() });
    }
    let lateFee = 0;
    if (late && !db.pen.some(p => p.borrowing_id === bid && p.penalty_type === 'Late Return')) {
      const hours = Math.ceil((nowD - expected) / 3.6e6);
      lateFee = body.late_fee !== undefined && body.late_fee !== null && body.late_fee !== '' ? Math.max(0, +body.late_fee || 0) : hours * LATE_FEE_PER_HOUR;
      if (lateFee > 0) db.pen.push({ penalty_id: nextId('pen'), borrowing_id: bid, return_item_id: null, assessed_by: me.id, penalty_type: 'Late Return', amount: lateFee,
        reason: `${hours} hour(s) late x PHP ${money(LATE_FEE_PER_HOUR)}`, penalty_status: 'Unpaid', assessed_at: now() });
    }
    const myBis = db.bi.filter(x => x.borrowing_id === bid), rel = myBis.reduce((a, x) => a + x.quantity_released, 0);
    const ret = db.rit.filter(x => myBis.some(b => b.borrowing_item_id === x.borrowing_item_id)).reduce((a, x) => a + x.quantity_returned, 0);
    const complete = ret >= rel, status = !complete ? 'Partial' : damaged ? 'With Damage' : late ? 'Late' : 'Complete';
    rec.return_status = status;
    bor.borrowing_status = complete ? 'Returned' : late ? 'Overdue' : 'Partially Returned';
    if (complete) find(db.res, 'reservation_id', bor.reservation_id).reservation_status = 'Completed';
    return { return_id: rid, status, late_fee: lateFee, complete };
  };

  E['penalties.php'] = async ({ method, q, body }) => {
    const me = needLogin();
    if (method === 'GET') {
      const PS = ['Unpaid', 'Paid', 'Waived'];
      const rows = db.pen.map(p => { const b = find(db.bor, 'borrowing_id', p.borrowing_id), r = find(db.res, 'reservation_id', b.reservation_id), u = find(db.users, 'user_id', r.user_id);
        return { ...p, amount: Number(p.amount), event_name: r.event_name, event_date: r.event_date, full_name: fullName(u), email: u.email, expected_return_datetime: b.expected_return_datetime, _uid: r.user_id }; })
        .filter(p => (me.role !== 'user' || p._uid === me.id) && (!q.get('status') || p.penalty_status === q.get('status')))
        .sort((a, b) => order(a.penalty_status, PS) - order(b.penalty_status, PS) || b.assessed_at.localeCompare(a.assessed_at));
      rows.forEach(r => delete r._uid);
      return { penalties: rows };
    }
    const a = needAdmin();
    if (body.action === 'status') {
      if (!['Unpaid', 'Paid', 'Waived'].includes(body.status)) fail('Invalid status.');
      const p = find(db.pen, 'penalty_id', +body.id); if (p) { p.penalty_status = body.status; p.assessed_by = p.assessed_by ?? a.id; } return {};
    }
    if (body.action === 'create') {
      const amt = +body.amount || 0;
      if (amt <= 0) fail('Amount must be greater than zero.');
      if (!find(db.bor, 'borrowing_id', +body.borrowing_id)) fail('Borrowing record not found.');
      db.pen.push({ penalty_id: nextId('pen'), borrowing_id: +body.borrowing_id, return_item_id: null, assessed_by: a.id, penalty_type: 'Other', amount: amt, reason: s(body.reason) || null, penalty_status: 'Unpaid', assessed_at: now() });
      return {};
    }
    fail('Unknown action.', 404);
  };

  const monthsBack = n => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return d; };
  const sixMonthsAgo = () => { const d = new Date(); d.setMonth(d.getMonth() - 6); return dstr(d); };
  E['analytics.php'] = async () => {
    needAdmin(); refreshOverdue();
    const sum = (arr, f) => arr.reduce((a, x) => a + Number(f(x)), 0);
    const rr = db.ret, ontime = rr.filter(x => x.return_datetime <= find(db.bor, 'borrowing_id', x.borrowing_id).expected_return_datetime).length;
    const kpi = {
      pending: db.res.filter(r => r.reservation_status === 'Pending').length,
      to_release: db.res.filter(r => r.reservation_status === 'Approved' && !db.bor.some(b => b.reservation_id === r.reservation_id)).length,
      active: db.bor.filter(b => ['Borrowed', 'Partially Returned'].includes(b.borrowing_status)).length,
      overdue: db.bor.filter(b => b.borrowing_status === 'Overdue').length, reservations: db.res.length, users: db.users.length,
      collected: sum(db.pen.filter(p => p.penalty_status === 'Paid'), p => p.amount), outstanding: sum(db.pen.filter(p => p.penalty_status === 'Unpaid'), p => p.amount), waived: sum(db.pen.filter(p => p.penalty_status === 'Waived'), p => p.amount),
      avg_rating: Math.round((db.rev.length ? sum(db.rev, r => r.rating) / db.rev.length : 0) * 100) / 100, reviews: db.rev.length,
      ontime_rate: rr.length ? Math.round(ontime / rr.length * 100) : null,
    };
    const stat = {};
    const top_equipment = db.eq.map(e => { const ris = db.ri.filter(i => i.equipment_id === e.equipment_id && ['Approved', 'Borrowed', 'Completed'].includes(find(db.res, 'reservation_id', i.reservation_id).reservation_status));
      return { equipment_name: e.equipment_name, qty: sum(ris, i => i.quantity_requested), bookings: new Set(ris.map(i => i.reservation_id)).size }; })
      .filter(x => x.bookings > 0).sort((a, b) => b.bookings - a.bookings || b.qty - a.qty).slice(0, 6);
    const group = (rows, keyOf, init) => { const m = {}; for (const r of rows) { const k = keyOf(r); (m[k] ||= init(k)); m[k].add(r); } return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v.out()); };
    const monthly = group(db.res.filter(r => !['Cancelled', 'Rejected'].includes(r.reservation_status) && r.event_date >= sixMonthsAgo()), r => ym(r.event_date),
      k => { let n = 0; return { add: () => n++, out: () => ({ ym: k, label: monthLabel(k), total: n }) }; });
    const revenue_monthly = group(db.pen.filter(p => p.penalty_status === 'Paid' && p.assessed_at.slice(0, 10) >= sixMonthsAgo()), p => ym(p.assessed_at),
      k => { let n = 0; return { add: p => n += Number(p.amount), out: () => ({ ym: k, label: monthLabel(k), total: n }) }; });
    const types = {}; for (const p of db.pen.filter(x => x.penalty_status !== 'Waived')) { const t = (types[p.penalty_type] ||= { penalty_type: p.penalty_type, cnt: 0, total: 0 }); t.cnt++; t.total += Number(p.amount); }
    const mix = {}; for (const r of db.res) { const t = (mix[r.reservation_status] ||= { label: r.reservation_status, total: 0 }); t.total++; }
    const attention = db.eq.filter(e => ['Needs Repair', 'Damaged'].includes(e.condition_status) || e.availability_status === 'Under Maintenance' || e.quantity_available <= 2)
      .sort((a, b) => a.quantity_available - b.quantity_available).slice(0, 8).map(e => ({ equipment_name: e.equipment_name, quantity_available: e.quantity_available, condition_status: e.condition_status, availability_status: e.availability_status }));
    const top_borrowers = db.users.map(u => ({ user_id: u.user_id, email: u.email, user_type: u.user_type, department: u.department, full_name: fullName(u),
      bookings: db.res.filter(r => r.user_id === u.user_id && !['Cancelled', 'Rejected'].includes(r.reservation_status)).length })).filter(x => x.bookings > 0)
      .sort((a, b) => b.bookings - a.bookings || a.full_name.localeCompare(b.full_name)).slice(0, 5);
    return { kpi, top_equipment, monthly, revenue_monthly, penalty_types: Object.values(types), status_mix: Object.values(mix), attention, top_borrowers };
  };

  E['overview.php'] = async () => {
    const me = needLogin(); refreshOverdue();
    const isAdmin = me.role === 'admin', cur = ym(today()), prev = ym(dstr(monthsBack(1)));
    const thisM = db.res.filter(r => ym(r.event_date) === cur).length, lastM = db.res.filter(r => ym(r.event_date) === prev).length;
    const stats = { equipment_types: db.eq.filter(e => e.condition_status !== 'Retired').length, reservations: db.res.length, reservations_change: lastM ? Math.round((thisM - lastM) / lastM * 100) : null,
      borrowers: db.users.filter(u => u.account_status === 'Active').length, avg_rating: Math.round((db.rev.length ? db.rev.reduce((a, r) => a + r.rating, 0) / db.rev.length : 0) * 10) / 10, reviews: db.rev.length };
    const trend = { labels: [], reservations: [], approved: [], rejected: [] };
    for (let i = 5; i >= 0; i--) {
      const d = monthsBack(i), k = ym(dstr(d)), rs = db.res.filter(r => ym(r.event_date) === k);
      trend.labels.push(d.toLocaleDateString('en-US', { month: 'short' })); trend.reservations.push(rs.length);
      trend.approved.push(rs.filter(r => ['Approved', 'Borrowed', 'Completed'].includes(r.reservation_status)).length); trend.rejected.push(rs.filter(r => r.reservation_status === 'Rejected').length);
    }
    const top = db.eq.map(e => { const ris = db.ri.filter(i => i.equipment_id === e.equipment_id && ['Approved', 'Borrowed', 'Completed'].includes(find(db.res, 'reservation_id', i.reservation_id).reservation_status));
      return { equipment_id: e.equipment_id, equipment_name: e.equipment_name, image: e.image, category_name: find(db.cat, 'category_id', e.category_id).category_name,
        bookings: new Set(ris.map(i => i.reservation_id)).size, units: ris.reduce((a, i) => a + i.quantity_requested, 0) }; })
      .filter(x => x.bookings > 0).sort((a, b) => b.bookings - a.bookings || b.units - a.units).slice(0, 8);
    const mine = r => isAdmin || r.user_id === me.id, act = [], add = (kind, title, ts, detail) => { if (ts) act.push({ kind, title, ts, detail }); };
    const latest = (rows, n = 5) => rows.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, n);
    const resOf = b => find(db.res, 'reservation_id', b.reservation_id);
    latest(db.res.filter(mine).map(r => ({ ts: r.reservation_date, n: r.event_name }))).forEach(x => add('request', 'New reservation request', x.ts, x.n));
    latest(db.bor.filter(b => mine(resOf(b))).map(b => ({ ts: b.release_datetime, n: resOf(b).event_name }))).forEach(x => add('release', 'Equipment released', x.ts, x.n));
    latest(db.ret.filter(x => mine(resOf(find(db.bor, 'borrowing_id', x.borrowing_id)))).map(x => ({ ts: x.return_datetime, n: resOf(find(db.bor, 'borrowing_id', x.borrowing_id)).event_name }))).forEach(x => add('return', 'Equipment returned', x.ts, x.n));
    latest(db.bor.filter(b => b.borrowing_status === 'Overdue' && mine(resOf(b))).map(b => ({ ts: b.expected_return_datetime, n: resOf(b).event_name }))).forEach(x => add('overdue', 'Overdue item', x.ts, x.n));
    latest(db.pen.filter(p => mine(resOf(find(db.bor, 'borrowing_id', p.borrowing_id)))).map(p => ({ ts: p.assessed_at, n: resOf(find(db.bor, 'borrowing_id', p.borrowing_id)).event_name }))).forEach(x => add('penalty', 'Penalty assessed', x.ts, x.n));
    act.sort((a, b) => b.ts.localeCompare(a.ts));
    return { stats, trend, top_equipment: top, activities: act.slice(0, isAdmin ? 8 : 4) };
  };

  E['chat.php'] = async ({ method, body }) => {
    const me = needLogin();
    if (method !== 'POST') fail('POST only.', 405);
    const msgs = Array.isArray(body.messages) ? body.messages : [];
    const last = s((msgs.filter(m => m.role !== 'assistant').pop() || {}).content).slice(0, 1000);
    if (!last) fail('Please type a message.');
    const t = last.toLowerCase(), has = w => w.some(x => t.includes(x));
    const equipment = db.eq.filter(e => e.condition_status !== 'Retired').map(equipView);
    const mine = me.role === 'user' ? db.res.filter(r => r.user_id === me.id).sort((a, b) => b.reservation_id - a.reservation_id).slice(0, 5) : [];
    const unpaid = me.role === 'user' ? unpaidFor(me.id) : 0;
    let reply = null;
    if (has(['hello', 'hi ', 'hi!', 'hey', 'kumusta', 'good morning', 'good afternoon']) && t.length < 25) reply = `Hi ${me.name}! I can help with equipment availability, how to reserve, your reservation status, penalties and returns. What would you like to know?`;
    else if (has(['my reservation', 'my request', 'status', 'approved', 'reservations ko'])) {
      if (me.role === 'admin') reply = `Right now: ${db.res.filter(r => r.reservation_status === 'Pending').length} pending request(s), ${db.res.filter(r => r.reservation_status === 'Approved' && !db.bor.some(b => b.reservation_id === r.reservation_id)).length} approved and waiting for release, ${db.bor.filter(b => b.borrowing_status === 'Overdue').length} overdue borrowing(s).`;
      else if (!mine.length) reply = 'You have no reservations yet. Go to Catalog, add the items you need, then submit the request on the Reserve page.';
      else reply = 'Your latest reservations:\n' + mine.map(r => `- #${r.reservation_id} ${r.event_name} (${r.event_date}): ${r.reservation_status}`).join('\n');
    } else if (has(['penalt', 'fee', 'fine', 'late', 'damage', 'multa'])) {
      reply = `Late returns are charged PHP ${money(LATE_FEE_PER_HOUR)} per hour, and damaged or lost items have their own penalty. Unpaid penalties block new reservations until you settle them at the Property Office.`;
      if (me.role === 'user') reply += unpaid > 0 ? ` You currently owe PHP ${money(unpaid)}.` : ' You have no unpaid penalties.';
    } else if (has(['how to reserve', 'how do i reserve', 'how to borrow', 'paano', 'book', 'reserve'])) reply = '1) Open the Catalog and add the equipment you need. 2) Go to Reserve, pick the date and time, and submit. 3) Wait for the Property Office to approve it; you will get an email. 4) Claim the items at the Property Office and return them on time.';
    else if (has(['cancel'])) reply = 'You can cancel a Pending or Approved reservation from My Reservations. Once the items are released it can no longer be cancelled.';
    else if (has(['return'])) reply = 'Return the items to the Property Office by the end time of your event. Each item is inspected; late, damaged or missing items may incur penalties.';
    else {
      const hits = equipment.filter(e => e.equipment_name.toLowerCase().split(/\s+/).some(w => w.length > 3 && t.includes(w.replace(/s$/, ''))) || t.includes(e.category_name.toLowerCase()));
      if (hits.length || has(['available', 'stock', 'equipment', 'catalog', 'meron', 'avail']))
        reply = 'Equipment in stock (exact availability for your date is shown on the Reserve page):\n' + (hits.length ? hits : equipment).slice(0, 10).map(e => `- ${e.equipment_name}: ${e.quantity_available} (${e.availability_status})`).join('\n');
    }
    return { reply: reply ?? "I'm not sure about that one. I can help with equipment availability, how to reserve, reservation status, penalties and returns, or please ask the Property Office.", mode: 'basic' };
  };


  /* =====================================================================================================
   * ONLINE MODE (Supabase). Used when assets/js/site-config.js has the project URL and public key.
   *  - Accounts, passwords and the e-mail verification code are handled by Supabase Authentication (server side).
   *  - Everything else lives in the Postgres tables created by database/supabase_setup.sql. Each API call loads a
   *    snapshot of what the signed-in person may see (get_snapshot), runs the same logic as the offline mode above,
   *    then saves only what changed (apply_changes). The database decides what each person is allowed to change.
   * ===================================================================================================== */
  const SB = 'plmun_sb_session_v1', EMPTY = () => Object.fromEntries(Object.keys(TABLES).map(k => [k, []]));
  let baseline = null, snapAt = 0;
  const sbGet = () => { try { return JSON.parse(localStorage.getItem(SB)); } catch (e) { return null; } };
  const sbSet = v => { try { v ? localStorage.setItem(SB, JSON.stringify(v)) : localStorage.removeItem(SB); } catch (e) {} };
  const errText = j => (j && (j.msg || j.message || j.error_description || (typeof j.error === 'string' && j.error))) || '';

  async function sbFetch(path, { method = 'POST', body, token } = {}) {
    const c = CLOUD();
    let res, text;
    try {
      res = await fetch(c.url + path, { method, headers: { apikey: c.key, ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      text = await res.text();
    } catch (e) { fail('Cannot reach the online database. Check your internet connection and the Supabase URL in site-config.js.', 503); }
    let j = null; try { j = text ? JSON.parse(text) : null; } catch (e) {}
    if (!res.ok) { const e = new Error(errText(j) || `Request failed (${res.status}).`); e.status = res.status; e.code = (j && (j.error_code || j.code)) || ''; e.body = j; throw e; }
    return j;
  }
  async function accessToken() {
    let s = sbGet();
    if (!s) return null;
    if (s.expires_at && s.expires_at - 30 < Date.now() / 1000) {
      try { s = toSession(await sbFetch('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: s.refresh_token } })); sbSet(s); }
      catch (e) { sbSet(null); return null; }
    }
    return s.access_token;
  }
  const toSession = j => ({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600) });
  async function rpc(fn, args = {}) {
    const token = await accessToken();
    if (!token && fn !== 'email_registered') fail('Please log in first.', 401);
    try { return await sbFetch('/rest/v1/rpc/' + fn, { body: args, token }); }
    catch (e) { if (e.status === 401 || e.code === 'PGRST301') { sbSet(null); cloudMe = null; fail('Your session expired. Please log in again.', 401); } throw e; }
  }

  async function cloudSnapshot() {
    if (!await accessToken()) { cloudMe = null; db = EMPTY(); baseline = EMPTY(); return; }
    const snap = await rpc('get_snapshot');
    db = EMPTY();
    for (const k of Object.keys(TABLES)) db[k] = snap[k] || [];
    baseline = JSON.parse(JSON.stringify(db));
    const me = snap.me || {};
    const row = me.role === 'admin' ? find(db.admin, 'admin_id', me.id) : find(db.users, 'user_id', me.id);
    cloudMe = row ? { role: me.role, id: me.id, name: fullName(row), first_name: row.first_name, email: row.email, type: me.role === 'admin' ? 'Admin' : row.user_type, department: row.department || null } : null;
  }
  function diffChanges() {
    const changes = {}; let any = false;
    for (const [k, [table, pk]] of Object.entries(TABLES)) {
      const before = new Map(baseline[k].map(r => [r[pk], r])), seen = new Set(), ch = { inserts: [], updates: [], deletes: [] };
      for (const r of db[k]) {
        seen.add(r[pk]);
        const o = before.get(r[pk]);
        if (!o) { ch.inserts.push(r); continue; }
        const d = {};
        for (const f of Object.keys(r)) if (JSON.stringify(r[f]) !== JSON.stringify(o[f])) d[f] = r[f];
        if (Object.keys(d).length) { d[pk] = r[pk]; ch.updates.push(d); }
      }
      for (const id of before.keys()) if (!seen.has(id)) ch.deletes.push(id);
      if (ch.inserts.length || ch.updates.length || ch.deletes.length) { changes[table] = ch; any = true; }
    }
    return any ? changes : null;
  }
  async function flush() {   // save what changed so far (online), or write to this browser (offline)
    if (!CLOUD()) return save();
    const changes = diffChanges();
    if (!changes) return;
    await rpc('apply_changes', { changes });
    baseline = JSON.parse(JSON.stringify(db));
  }
  async function cloudCall(file, query, { method = 'GET', body = null, form = null } = {}) {
    if (file === 'auth.php') return { ok: true, ...await cloudAuth(new URLSearchParams(query || '').get('action'), body || {}) };
    for (let attempt = 0; ; attempt++) {
      await cloudSnapshot();
      if (!E[file]) fail('Unknown endpoint.', 404);
      const out = await E[file]({ method, q: new URLSearchParams(query || ''), body: body || {}, form });
      try { await flush(); }
      catch (e) { if (e.code === '23505' && attempt < 2) continue; throw e; }   // someone saved at the same moment: reload and redo
      return { ok: true, ...out };
    }
  }

  async function cloudAuth(action, body) {
    if (action === 'me') {
      if (!await accessToken()) return { user: null };
      try { await rpc('ensure_profile'); await cloudSnapshot(); } catch (e) { if (e.status === 401) return { user: null }; throw e; }
      if (!cloudMe) return { user: null };
      const a = { ...cloudMe };
      refreshOverdue();
      if (a.role === 'user') {
        a.unpaid = unpaidFor(a.id);
        a.notify = db.pen.filter(p => p.penalty_status === 'Unpaid').length
          + db.bor.filter(b => b.borrowing_status === 'Overdue' && find(db.res, 'reservation_id', b.reservation_id)?.user_id === a.id).length;
      } else a.notify = db.res.filter(r => r.reservation_status === 'Pending').length + db.bor.filter(b => b.borrowing_status === 'Overdue').length;
      return { user: a };
    }
    if (action === 'logout') {
      const t = await accessToken(); sbSet(null); cloudMe = null;
      if (t) { try { await sbFetch('/auth/v1/logout', { token: t }); } catch (e) {} }
      return {};
    }
    if (action === 'login') {
      const role = s(body.role) === 'admin' ? 'admin' : 'user', email = s(body.email).toLowerCase(), pass = String(body.password ?? '');
      if (!email || !pass) fail('Please enter your email and password.');
      let j;
      try { j = await sbFetch('/auth/v1/token?grant_type=password', { body: { email, password: pass } }); }
      catch (e) {
        if (/not confirmed/i.test(e.message) || e.code === 'email_not_confirmed') fail('Please verify your email first. Sign up again with this email to get a new code.', 403);
        if (e.status === 400 || e.status === 422) fail('Wrong email or password.', 401);
        throw e;
      }
      sbSet(toSession(j));
      await rpc('ensure_profile'); await cloudSnapshot();
      if (!cloudMe || cloudMe.role !== role) { sbSet(null); cloudMe = null; fail('Wrong email or password.', 401); }
      if (role === 'user') {
        const st = find(db.users, 'user_id', cloudMe.id).account_status;
        const msg = { Pending: 'Your account is still waiting for approval.', Suspended: 'Your account is suspended. Please see the Property Office.', Deactivated: 'Your account is deactivated.' };
        if (msg[st]) { sbSet(null); cloudMe = null; fail(msg[st], 403); }
      }
      return { user: { ...cloudMe } };
    }
    if (action === 'register') {
      const last = s(body.last_name), first = s(body.first_name), mi = s(body.middle_initial).replace(/[. ]+$/, '').toUpperCase();
      const email = s(body.email).toLowerCase(), pass = String(body.password ?? '');
      const type = ['Student', 'Faculty', 'Staff'].includes(body.user_type) ? body.user_type : 'Student', contact = s(body.contact_number);
      if (!last || !first || !email || !pass) fail('Please fill in all required fields.');
      if (last.length > 60 || first.length > 60) fail('Surname and first name must be 60 characters or fewer.');
      if (mi && !/^\p{L}$/u.test(mi)) fail('Middle initial must be a single letter.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Please enter a valid email address.');
      if (pass.length < 6) fail('Password must be at least 6 characters.');
      if (contact && !/^[0-9+\-\s]{7,20}$/.test(contact)) fail('Contact number looks invalid.');
      if (await rpc('email_registered', { p_email: email })) fail('That email is already registered.', 409);
      let j;
      try {
        j = await sbFetch('/auth/v1/signup', { body: { email, password: pass, data: { last_name: last, first_name: first, middle_initial: mi, user_type: type, contact_number: contact,
          department: s(body.department), course: type === 'Student' ? s(body.course) : '', year_level: type === 'Student' ? s(body.year_level) : '' } } });
      } catch (e) {
        if (/already registered/i.test(e.message) || e.code === 'user_already_exists') fail('That email is already registered.', 409);
        if (e.status === 429 || /rate limit/i.test(e.message)) fail('Too many emails were sent just now. Please wait a few minutes and try again.', 429);
        if (/password/i.test(e.message)) fail(e.message);
        fail('We could not send the verification code. ' + e.message, 502);
      }
      const u = (j && j.user) || j;
      if (u && Array.isArray(u.identities) && u.identities.length === 0) fail('That email is already registered.', 409);
      try { sessionStorage.setItem(PENDING, JSON.stringify({ email, sent_at: Date.now() })); } catch (e) {}
      return { verify: true, email, minutes: 60, resend_after: VERIFY_RESEND_SECONDS };
    }
    if (action === 'resend_code') {
      const p = pending() || fail('Your sign-up session expired. Please fill in the form again.', 409);
      const wait = VERIFY_RESEND_SECONDS - Math.floor((Date.now() - p.sent_at) / 1000);
      if (wait > 0) fail(`Please wait ${wait} second(s) before requesting another code.`, 429);
      try { await sbFetch('/auth/v1/resend', { body: { type: 'signup', email: p.email } }); }
      catch (e) { fail(e.status === 429 ? 'Too many emails were sent just now. Please wait a few minutes and try again.' : 'We could not send the verification code. ' + e.message, e.status || 502); }
      p.sent_at = Date.now(); setPending(p);
      return { email: p.email, resend_after: VERIFY_RESEND_SECONDS };
    }
    if (action === 'verify_email') {
      const p = pending() || fail('Your sign-up session expired. Please fill in the form again.', 409);
      const code = String(body.code ?? '').replace(/\D/g, '');
      if (code.length < 6 || code.length > 8) fail('Enter the code from your email.');
      let j;
      for (const type of ['email', 'signup']) {
        try { j = await sbFetch('/auth/v1/verify', { body: { type, email: p.email, token: code } }); break; }
        catch (e) { if (type === 'signup') fail('That code is wrong or has expired. Try again, or tap “Resend code” to get a new one.', 401); }
      }
      const token = j.access_token;
      try { await sbFetch('/rest/v1/rpc/ensure_profile', { body: {}, token }); } finally { try { await sbFetch('/auth/v1/logout', { token }); } catch (e) {} }
      setPending(null);
      return { message: 'Email verified. Account created. You can log in now.' };
    }
    if (action === 'forgot_password') {
      const email = s(body.email).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Please enter a valid email address.');
      try { await sbFetch('/auth/v1/recover', { body: { email } }); }
      catch (e) {
        if (e.status === 429 || /rate limit|security purposes/i.test(e.message)) fail('Please wait a minute before requesting another code.', 429);
        fail('We could not send the code. ' + e.message, 502);
      }
      // Supabase answers the same way whether or not the email has an account, so nobody can use this form to find out who is registered.
      return { email, minutes: 60, resend_after: VERIFY_RESEND_SECONDS };
    }
    if (action === 'reset_password') {
      const email = s(body.email).toLowerCase(), code = String(body.code ?? '').replace(/\D/g, ''), pass = String(body.password ?? '');
      if (!email) fail('Please start again and enter your email.');
      if (code.length < 6 || code.length > 8) fail('Enter the code from your email.');
      if (pass.length < 6) fail('Password must be at least 6 characters.');
      let j;
      try { j = await sbFetch('/auth/v1/verify', { body: { type: 'recovery', email, token: code } }); }
      catch (e) { fail('That code is wrong or has expired. Try again, or tap “Resend code” to get a new one.', 401); }
      try { await sbFetch('/auth/v1/user', { method: 'PUT', body: { password: pass }, token: j.access_token }); }
      catch (e) {
        if (/different from the old|same as the old/i.test(e.message)) fail('Your new password must be different from the old one.', 422);
        fail(/password/i.test(e.message) ? e.message : 'We could not update your password. ' + e.message, e.status || 502);
      }
      try { await sbFetch('/auth/v1/logout', { token: j.access_token }); } catch (e) {}
      sbSet(null); cloudMe = null;
      return { message: 'Password updated. You can log in now.' };
    }
    fail('Unknown action.', 404);
  }

  /* ---------- entry point used by app.js ---------- */
  async function call(file, query, { method = 'GET', body = null, form = null } = {}) {
    await ready;
    if (CLOUD()) return cloudCall(file, query, { method, body, form });
    fail('This site is not connected to its online database yet. Fill in the Supabase URL and anon key in assets/js/site-config.js (see README).', 503);
    const fn = E[file] || fail('Unknown endpoint.', 404);
    const out = await fn({ method, q: new URLSearchParams(query || ''), body: body || {}, form });
    if (method !== 'GET') save();
    else if (file === 'auth.php' || file === 'overview.php') save();   // refreshOverdue may have changed a status
    return { ok: true, ...out };
  }
  async function reset() { localStorage.removeItem(KEY); localStorage.removeItem(SESSION); db = null; location.reload(); }
  return { call, reset };
})();
