(async () => {
  const me = await App.init({ need: 'user', active: 'home' });
  const $ = s => document.querySelector(s);
  const E = App.esc, IC = App.IC;
  $('#hi').textContent = `Good day, ${me.first_name || me.name}! Everything you need for your event needs, now just a few clicks away.`;
  $('#d').min = App.today(); $('#d').value = App.today();
  $('#chk').onsubmit = e => { e.preventDefault();
    location.href = `../catalog/catalog.html?date=${$('#d').value}&start=${$('#s').value}&end=${$('#e').value}`; };

  // the five required modules, linked where a client can use them
  const LINKS = { 1: ['../catalog/catalog.html', 'Open catalog →'], 2: ['../my-reservations/my-reservations.html', 'Track my requests →'],
    3: ['../my-penalties/my-penalties.html', 'My penalties →'], 4: [null, 'Managed by the Property Office'], 5: ['../reviews/reviews.html', 'Service reviews →'] };
  $('#mods').innerHTML = App.MODULES.map(m => { const [href, cta] = LINKS[m.n];
    return `<${href ? `a href="${href}"` : 'div'} class="mod ${href ? '' : 'static'}"><span class="n">${m.n}</span><b>${E(m.title)}</b><span>${E(m.desc)}</span><em>${E(cta)}</em></${href ? 'a' : 'div'}>`; }).join('');

  const when = s => App.datetime(s);
  const AI = { request: IC.cal, release: IC.send, return: IC.ret, overdue: IC.clock, penalty: IC.pen };
  try {
    const [ov, eq, pn, rv] = await Promise.all([App.api('overview.php'), App.api('equipment.php'), App.api('penalties.php'), App.api('reviews.php')]);
    const s = ov.stats;
    const unpaid = pn.penalties.filter(p => p.penalty_status === 'Unpaid').reduce((a, p) => a + p.amount, 0);
    const ch = s.reservations_change;
    $('#stats').innerHTML = `
      <div class="stat"><span class="ic">${IC.cat}</span><div><b>${s.equipment_types}</b><span class="lb">Equipment Types</span></div></div>
      <div class="stat"><span class="ic">${IC.check}</span><div><b>${s.reservations}</b><span class="lb">Total Reservations</span></div>${ch === null ? '' : `<span class="up ${ch < 0 ? 'dn' : ''}">${ch < 0 ? '↓' : '↑'} ${Math.abs(ch)}%</span>`}</div>
      <div class="stat"><span class="ic">${IC.people}</span><div><b>${s.borrowers}</b><span class="lb">Active Borrowers</span></div></div>
      <div class="stat gold"><span class="ic">${IC.star}</span><div><b>${s.reviews ? s.avg_rating : '—'}</b><span class="lb">Average Rating (${s.reviews} review${s.reviews === 1 ? '' : 's'})</span></div></div>
      `;
    const toRate = rv.eligible.length;
    if (toRate) $('#stats').insertAdjacentHTML('beforebegin', `<a class="alert rate-alert" href="../my-reservations/my-reservations.html">★ You have ${toRate} borrowed item${toRate === 1 ? '' : 's'} waiting for your review. Rate now →</a>`);
    if (unpaid) $('#stats').insertAdjacentHTML('beforebegin', `<a class="alert" href="../my-penalties/my-penalties.html">⚠ You have ${App.money(unpaid)} in unpaid penalties. New reservations are blocked until they are settled. View penalties →</a>`);

    const t = ov.trend;
    Charts.line($('#trend'), t.labels, [
      { name: 'Reservations', color: '#14502f', values: t.reservations, area: true },
      { name: 'Approved', color: '#e8b13a', values: t.approved },
      { name: 'Rejected', color: '#b9c4bb', values: t.rejected }]);

    const top = ov.top_equipment;
    const head = top.slice(0, 3).map(r => ({ label: r.equipment_name, value: +r.bookings }));
    const rest = top.slice(3).reduce((a, r) => a + +r.bookings, 0);
    if (rest) head.push({ label: 'Others', value: rest });
    const total = top.reduce((a, r) => a + +r.bookings, 0);
    Charts.donut($('#usage'), head, { big: total, small: 'bookings' });

    Charts.hbars($('#top'), top.slice(0, 5).map(r => ({ label: r.equipment_name, value: +r.bookings, icon: App.icon(r) })));

    $('#acts').innerHTML = ov.activities.map(a => `<div class="act ${a.kind}"><span class="ai">${AI[a.kind] || IC.clock}</span><div><b>${E(a.title)}</b><span class="ev">${E(a.detail)}</span><small>${E(when(a.ts))}</small></div></div>`).join('')
      || '<div class="empty" style="grid-column:1/-1"><b>No activity yet</b>Your requests, releases and returns will show up here.</div>';
  } catch (e) { App.toast(e.message, true); }
})();
