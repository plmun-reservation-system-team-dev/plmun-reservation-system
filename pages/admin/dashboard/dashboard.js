(async () => {
  await App.init({ need: 'admin', active: 'admin-dashboard' });
  const $ = s => document.querySelector(s);
  const E = App.esc, IC = App.IC, money = x => '₱' + Number(x).toLocaleString('en-PH');
  const AI = { request: IC.cal, release: IC.send, return: IC.ret, overdue: IC.clock, penalty: IC.pen };
  try {
    const [d, ov] = await Promise.all([App.api('analytics.php'), App.api('overview.php')]);
    const k = d.kpi;

    // the five required modules, each with one live number
    const LIVE = {
      1: [`../reservations/reservations.html`, `${k.pending} pending approval${k.pending === 1 ? '' : 's'}`],
      2: [`../borrowing/borrowing.html`, `${k.to_release} waiting for release`],
      3: [`../returns/returns.html`, `${k.overdue} overdue · ${App.money(k.outstanding)} unpaid`],
      4: [`../inventory/inventory.html`, `${d.attention.length} item${d.attention.length === 1 ? '' : 's'} need attention`],
      5: [`#trend`, `${k.ontime_rate === null ? '—' : k.ontime_rate + '%'} on-time returns`],
    };
    $('#mods').innerHTML = App.MODULES.map(m => `<a class="mod" href="${LIVE[m.n][0]}"><span class="n">${m.n}</span><b>${E(m.title)}</b><span>${E(m.desc)}</span><em>${E(LIVE[m.n][1])}</em></a>`).join('');

    $('#ops').innerHTML = `
      <a class="stat gold" href="../reservations/reservations.html"><span class="ic">${IC.cal}</span><div><b>${k.pending}</b><span class="lb">Pending approvals</span></div></a>
      <a class="stat" href="../borrowing/borrowing.html"><span class="ic">${IC.send}</span><div><b>${k.to_release}</b><span class="lb">Approved, waiting for release</span></div></a>
      <a class="stat" href="../returns/returns.html"><span class="ic">${IC.cat}</span><div><b>${k.active}</b><span class="lb">Items currently out</span></div></a>
      <a class="stat ${k.overdue ? 'red' : ''}" href="../returns/returns.html"><span class="ic">${IC.clock}</span><div><b>${k.overdue}</b><span class="lb">Overdue borrowings</span></div></a>`;
    $('#rev').innerHTML = `
      <div class="stat"><span class="ic">${IC.bars}</span><div><b>${App.money(k.collected)}</b><span class="lb">Penalty revenue collected</span></div></div>
      <a class="stat red" href="../penalties/penalties.html"><span class="ic">${IC.pen}</span><div><b>${App.money(k.outstanding)}</b><span class="lb">Outstanding (unpaid)</span></div></a>
      <div class="stat"><span class="ic">${IC.check}</span><div><b>${k.ontime_rate === null ? '—' : k.ontime_rate + '%'}</b><span class="lb">On-time return rate</span></div></div>
      <div class="stat gold"><span class="ic">${IC.star}</span><div><b>${k.reviews ? k.avg_rating : '—'}</b><span class="lb">Service rating (${k.reviews} reviews)</span></div></div>`;

    const t = ov.trend;
    Charts.line($('#trend'), t.labels, [
      { name: 'Reservations', color: '#14502f', values: t.reservations, area: true },
      { name: 'Approved', color: '#e8b13a', values: t.approved },
      { name: 'Rejected', color: '#b9c4bb', values: t.rejected }]);

    const top = ov.top_equipment;
    const head = top.slice(0, 3).map(r => ({ label: r.equipment_name, value: +r.bookings }));
    const rest = top.slice(3).reduce((a, r) => a + +r.bookings, 0);
    if (rest) head.push({ label: 'Others', value: rest });
    Charts.donut($('#usage'), head, { big: top.reduce((a, r) => a + +r.bookings, 0), small: 'bookings' });
    Charts.hbars($('#top'), top.slice(0, 5).map(r => ({ label: r.equipment_name, value: +r.bookings, icon: App.icon(r) })));

    Charts.vbars($('#revm'), d.revenue_monthly.map(r => ({ label: r.label.slice(0, 3), value: +r.total })), { fmt: money, cls: 'y' });
    Charts.hbars($('#ptype'), d.penalty_types.map(r => ({ label: r.penalty_type, value: +r.total })), { fmt: money, cls: 'y' });
    Charts.hbars($('#mix'), d.status_mix.map(r => ({ label: r.label, value: +r.total })), { cls: 'g' });

    $('#att').innerHTML = d.attention.map(a => `<div class="li"><span><b>${E(a.equipment_name)}</b><br><span class="muted small">${a.quantity_available} left</span></span><span>${App.badge(a.availability_status === 'Under Maintenance' ? a.availability_status : a.condition_status)}</span></div>`).join('')
      || '<div class="empty"><b>All good</b>No stock or condition issues.</div>';
    const ini = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    $('#who').innerHTML = d.top_borrowers.map((b, i) => `<div class="bor"><span class="rk">${i + 1}</span><span class="av">${E(ini(b.full_name))}</span>
        <div class="who"><b>${E(b.full_name)}</b><span class="muted small">${E(b.user_type)}${b.department ? ' · ' + E(b.department) : ''} · ${E(b.email)}</span></div>
        <span class="cnt"><b>${b.bookings}</b><small>booking${+b.bookings === 1 ? '' : 's'}</small></span></div>`).join('') || '<div class="empty"><b>No data yet</b></div>';
    $('#acts').innerHTML = ov.activities.slice(0, 4).map(a => `<div class="act ${a.kind}"><span class="ai">${AI[a.kind] || IC.clock}</span><div><b>${E(a.title)}</b><span class="ev">${E(a.detail)}</span><small>${E(App.datetime(a.ts))}</small></div></div>`).join('')
      || '<div class="empty" style="grid-column:1/-1"><b>No activity yet</b></div>';
  } catch (e) { App.toast(e.message, true); }
})();
