(async () => {
  await App.init({ need: 'admin', active: 'admin-penalties' });
  const $ = s => document.querySelector(s), E = App.esc;
  let all = [], f = 'Unpaid';
  async function load() {
    try { all = (await App.api('penalties.php')).penalties; } catch (e) { return App.toast(e.message, true); }
    const sum = st => all.filter(p => p.penalty_status === st).reduce((a, p) => a + p.amount, 0);
    $('#strip').innerHTML = `<div class="due"><b>${App.money(sum('Unpaid'))}</b><span>Outstanding</span></div><div class="got"><b>${App.money(sum('Paid'))}</b><span>Collected</span></div><div><b>${App.money(sum('Waived'))}</b><span>Waived</span></div>`;
    $('#flt').innerHTML = ['Unpaid', 'Paid', 'Waived', 'All'].map(s => `<button class="chip ${s === f ? 'on' : ''}" data-f="${s}">${s}</button>`).join('');
    $('#rows').innerHTML = all.filter(p => f === 'All' || p.penalty_status === f).map(p => `<tr><td class="nowrap">${App.date(p.assessed_at.slice(0, 10))}</td><td><b>${E(p.full_name)}</b><br><span class="muted small">${E(p.email)}</span></td>
      <td>${E(p.event_name)}</td><td>${App.badge(p.penalty_type)}</td><td>${E(p.reason || '—')}</td><td class="right nowrap"><b>${App.money(p.amount)}</b></td><td>${App.badge(p.penalty_status)}</td>
      <td><div class="acts">${p.penalty_status === 'Unpaid' ? `<button class="btn green sm" data-s="Paid" data-id="${p.penalty_id}">Mark paid</button><button class="btn ghost sm" data-s="Waived" data-id="${p.penalty_id}">Waive</button>`
        : `<button class="btn ghost sm" data-s="Unpaid" data-id="${p.penalty_id}">Reopen</button>`}</div></td></tr>`).join('')
      || '<tr><td colspan="8"><div class="empty"><b>No penalties</b></div></td></tr>';
  }
  $('#flt').onclick = e => { if (e.target.dataset.f) { f = e.target.dataset.f; load(); } };
  $('#rows').onclick = async e => { const s = e.target.dataset.s; if (!s) return;
    try { await App.post('penalties.php', { action: 'status', id: +e.target.dataset.id, status: s }); App.toast('Penalty marked ' + s); load(); } catch (er) { App.toast(er.message, true); } };
  $('#add').onclick = async () => {
    let bs = []; try { bs = (await App.api('borrowings.php')).borrowings; } catch (e) { return App.toast(e.message, true); }
    const m = App.modal('Add manual penalty', `<div class="field"><label class="f" for="b">Borrowing record</label><select id="b">${bs.map(b => `<option value="${b.borrowing_id}">#${b.borrowing_id} · ${E(b.full_name)} · ${E(b.event_name)}</option>`).join('')}</select></div>
      <div class="field"><label class="f" for="a">Amount (₱)</label><input type="number" id="a" min="1" step="0.01"></div>
      <div class="field"><label class="f" for="r">Reason</label><textarea id="r"></textarea></div><div id="em"></div><button class="btn block" id="ok">Save penalty</button>`);
    m.el.querySelector('#ok').onclick = async () => {
      try { await App.post('penalties.php', { action: 'create', borrowing_id: +m.el.querySelector('#b').value, amount: +m.el.querySelector('#a').value, reason: m.el.querySelector('#r').value }); m.close(); App.toast('Penalty added'); load(); }
      catch (er) { m.el.querySelector('#em').innerHTML = `<div class="err">${E(er.message)}</div>`; }
    };
  };
  load();
})();
