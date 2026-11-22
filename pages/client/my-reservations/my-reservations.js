(async () => {
  await App.init({ need: 'user', active: 'my-reservations' });
  const $ = s => document.querySelector(s);
  if (new URLSearchParams(location.search).has('submitted')) $('#msg').innerHTML = '<div class="ok">Request submitted! The Property Office will review it shortly.</div>';
  let all = [], f = 'All';
  const STEPS = ['Pending', 'Approved', 'Borrowed', 'Completed'];

  async function load() {
    try { all = (await App.api('reservations.php')).reservations; } catch (e) { return App.toast(e.message, true); }
    const sts = ['All', ...new Set(all.map(r => r.reservation_status))];
    $('#flt').innerHTML = sts.map(s => `<button class="chip ${s === f ? 'on' : ''}" data-f="${s}">${s}</button>`).join('');
    draw();
  }
  const IC = App.IC, E = App.esc;
  const STEP_IC = { Pending: IC.clock, Approved: IC.check, Borrowed: IC.truck, Completed: IC.clip };
  const X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const PIN = '<svg viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>';
  const HINT = { Pending: 'Waiting for the Property Office to review your request.', Approved: 'Approved. Pick up your items on the event day.',
    Borrowed: 'Items are with you. Please return them on time.', Completed: 'All done. Thanks for returning everything!',
    Rejected: 'This request was not approved.', Cancelled: 'You cancelled this request.' };

  function track(r) {
    if (['Rejected', 'Cancelled'].includes(r.reservation_status))
      return `<ol class="steps"><li class="done"><span class="dot">${IC.check}</span><b>Submitted</b></li><li class="bad"><span class="dot">${X}</span><b>${r.reservation_status}</b></li></ol>`;
    const at = STEPS.indexOf(r.reservation_status), last = r.reservation_status === 'Completed';
    return `<ol class="steps">${STEPS.map((st, i) => {
      const cls = i < at || (last && i === at) ? 'done' : i === at ? 'now' : '';
      return `<li class="${cls}"><span class="dot">${cls === 'done' ? IC.check : STEP_IC[st]}</span><b>${st}</b></li>`; }).join('')}</ol>`;
  }
  const chip = (ic, t) => `<span class="mchip">${ic}${E(t)}</span>`;
  const dueNote = r => {
    if (!r.borrowing_id || r.reservation_status !== 'Borrowed') return '';
    const ms = App.dt(r.expected_return_datetime) - Date.now();
    if (r.borrowing_status === 'Overdue' || ms < 0) return '<span class="due late">Overdue, please return now</span>';
    const h = Math.floor(ms / 36e5), d = Math.floor(h / 24);
    return `<span class="due">${d >= 1 ? `Due in ${d} day${d === 1 ? '' : 's'}` : h >= 1 ? `Due in ${h} hr${h === 1 ? '' : 's'}` : 'Due within the hour'}</span>`;
  };
  // bottom strip only appears when there is something to say or do
  function foot(r, rateable, left) {
    const st = r.reservation_status, parts = [];
    if (r.approval_remarks) parts.push(`<span class="remark">Office remarks: ${E(r.approval_remarks)}</span>`);
    else parts.push('<span class="remark"></span>');
    if (['Pending', 'Approved'].includes(st)) parts.push(`<button class="btn danger sm" data-c="${r.reservation_id}">Cancel request</button>`);
    if (rateable && !left) parts.push('<span class="badge b-Completed">Reviewed ★</span>');
    return parts.length > 1 || r.approval_remarks ? `<div class="res-f">${parts.join('')}</div>` : '';
  }
  function draw() {
    const rows = all.filter(r => f === 'All' || r.reservation_status === f);
    $('#list').innerHTML = rows.map(r => {
      const st = r.reservation_status, rateable = ['Borrowed', 'Completed'].includes(st), left = +r.unreviewed;
      return `<article class="res s-${st}">
      <div class="res-h"><span class="ev-ic">${IC.cal}</span><div class="res-t"><h3>${E(r.event_name)}</h3>
        <div class="mchips">${chip(IC.cal, App.date(r.event_date))}${chip(IC.clock, `${App.time(r.start_time)} – ${App.time(r.end_time)}`)}${chip(PIN, r.event_location)}</div></div>${App.badge(st)}</div>
      ${track(r)}
      <p class="hint">${E(HINT[st] || '')} ${dueNote(r)}</p>
      <div class="res-b"><div><b class="lbl">Items borrowed</b><ul class="items">${r.items.map(i => `<li><span class="ip"><img src="${App.iconSrc(i)}" alt=""></span><span class="in">${E(i.equipment_name)}<small>${E(i.category_name)}${rateable && +i.reviewed ? ' · <em>reviewed ★</em>' : ''}</small></span><span class="q">× ${i.quantity_requested}</span></li>`).join('')}</ul></div>
        <dl class="info"><div><dt>Request no.</dt><dd>#${r.reservation_id}</dd></div><div><dt>Filed</dt><dd>${App.datetime(r.reservation_date)}</dd></div>
        ${r.borrowing_id ? `<div><dt>Return by</dt><dd>${App.datetime(r.expected_return_datetime)}</dd></div><div><dt>Borrowing</dt><dd>${App.badge(r.borrowing_status)}</dd></div>` : ''}</dl></div>
      ${rateable && left ? `<div class="rate-cta"><span class="rc-ic">${IC.star}</span><div><b>How was your borrowed equipment?</b><span>${left} item${left === 1 ? '' : 's'} waiting for your review. It stays here until you rate ${left === 1 ? 'it' : 'them'}.</span></div><button class="btn gold sm" data-v="${r.reservation_id}">Rate now</button></div>` : ''}
      ${foot(r, rateable, left)}</article>`; }).join('')
      || '<div class="empty"><b>Nothing here yet</b>Your reservations will show up in this list.</div>';
  }
  $('#flt').onclick = e => { if (e.target.dataset.f) { f = e.target.dataset.f; load(); } };
  $('#list').onclick = async e => {
    const c = e.target.dataset.c, v = e.target.dataset.v;
    if (c && confirm('Cancel this reservation request?')) {
      try { await App.post('reservations.php', { action: 'cancel', id: +c }); App.toast('Request cancelled'); load(); } catch (er) { App.toast(er.message, true); }
    }
    if (v) {
      let todo = [];
      try { todo = (await App.api('reviews.php')).eligible.filter(x => x.reservation_id == v); } catch (er) { return App.toast(er.message, true); }
      if (!todo.length) { App.toast('You already reviewed every product in this reservation.'); return load(); }
      const ratings = {};
      const m = App.modal('Rate the products you borrowed', `<p class="muted small" style="margin-top:0">Tap the stars for each product. Leave a product unrated to skip it.</p>` +
        todo.map(t => `<div class="rate-item" data-e="${t.equipment_id}"><b>${App.esc(t.equipment_name)}</b>
          <div class="starpick">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-n="${n}" aria-label="${n} stars">★</button>`).join('')}</div>
          <div class="field"><textarea placeholder="Comment (optional)" rows="2"></textarea></div></div>`).join('') +
        `<div id="em"></div><button class="btn block" id="sv">Submit reviews</button>`);
      m.el.onclick = ev => { const b = ev.target.closest('.starpick button'); if (!b) return;
        const box = b.closest('.rate-item'), n = +b.dataset.n; ratings[box.dataset.e] = n;
        box.querySelectorAll('.starpick button').forEach((x, i) => x.classList.toggle('on', i < n)); };
      m.el.querySelector('#sv').onclick = async () => {
        const rated = [...m.el.querySelectorAll('.rate-item')].filter(b => ratings[b.dataset.e]);
        if (!rated.length) { m.el.querySelector('#em').innerHTML = '<div class="err">Please rate at least one product.</div>'; return; }
        try {
          for (const b of rated) await App.post('reviews.php', { reservation_id: +v, equipment_id: +b.dataset.e, rating: ratings[b.dataset.e], comment: b.querySelector('textarea').value });
          m.close(); App.toast('Thanks for your reviews!'); load();
        } catch (er) { m.el.querySelector('#em').innerHTML = `<div class="err">${App.esc(er.message)}</div>`; }
      };
    }
  };
  load();
})();
