(async () => {
  await App.init({ need: 'admin', active: 'admin-borrowing' });
  const $ = s => document.querySelector(s), E = App.esc;
  let data, f = 'Active';
  const toDisp = c => ['Excellent', 'Good', 'Fair'].includes(c) ? c : 'Needs Repair';
  async function load() {
    try { data = await App.api('borrowings.php'); } catch (e) { return App.toast(e.message, true); }
    $('#ready').innerHTML = data.ready.map(r => `<tr><td>#${r.reservation_id}</td><td><b>${E(r.full_name)}</b><br><span class="muted small">${E(r.user_type)} · ${E(r.contact_number || '')}</span></td>
      <td><b>${E(r.event_name)}</b><br><span class="muted small">${App.date(r.event_date)} ${App.time(r.start_time)}</span></td><td class="nowrap">${App.date(r.event_date)} ${App.time(r.end_time)}</td>
      <td><ul>${r.items.map(i => `<li>${i.quantity_requested} × ${E(i.equipment_name)}</li>`).join('')}</ul></td><td><button class="btn sm" data-r="${r.reservation_id}">Release items</button> <button class="btn sm ghost" data-n="${r.reservation_id}" title="Email the borrower that the items are ready">Notify</button></td></tr>`).join('')
      || '<tr><td colspan="6"><div class="empty"><b>Nothing to release</b>Approved reservations will appear here.</div></td></tr>';
    const fl = ['Active', 'Overdue', 'Returned', 'All'];
    $('#flt').innerHTML = fl.map(s => `<button class="chip ${s === f ? 'on' : ''}" data-f="${s}">${s}</button>`).join('');
    const rows = data.borrowings.filter(b => f === 'All' || (f === 'Active' ? ['Borrowed', 'Partially Returned', 'Overdue'].includes(b.borrowing_status) : b.borrowing_status === f));
    $('#rows').innerHTML = rows.map(b => `<tr><td>#${b.borrowing_id}<br><span class="muted small">Res #${b.reservation_id}</span></td><td><b>${E(b.full_name)}</b><br><span class="muted small">${E(b.event_name)}</span></td>
      <td class="nowrap">${App.datetime(b.release_datetime)}</td><td class="nowrap">${App.datetime(b.expected_return_datetime)}</td>
      <td><ul>${b.items.map(i => `<li>${i.quantity_released} × ${E(i.equipment_name)} <span class="muted small">(${i.outstanding} out)</span></li>`).join('')}</ul></td>
      <td>${App.badge(b.borrowing_status)}</td><td>${b.borrowing_status !== 'Returned' ? `<a class="btn sm gold" href="../returns/returns.html?id=${b.borrowing_id}">Receive return</a>` : ''}</td></tr>`).join('')
      || '<tr><td colspan="7"><div class="empty"><b>No records</b></div></td></tr>';
  }
  $('#flt').onclick = e => { if (e.target.dataset.f) { f = e.target.dataset.f; load(); } };
  $('#ready').onclick = async e => {
    if (e.target.dataset.n) {
      const btn = e.target;
      return App.busy(btn, async () => { try { const r = await App.post('borrowings.php', { action: 'notify', reservation_id: +btn.dataset.n }); App.toast(r.emailed ? 'Borrower emailed' : r.email_message, !r.emailed); } catch (er) { App.toast(er.message, true); } });
    }
    const id = e.target.dataset.r; if (!id) return;
    const r = data.ready.find(x => x.reservation_id == id);
    const m = App.modal(`Release items: ${r.event_name}`, `<p class="muted">Confirm the quantity and condition of each item as it leaves the office.</p>
      ${r.items.map(i => `<div class="rl" data-i="${i.reservation_item_id}"><div><b>${E(i.equipment_name)}</b><br><span class="muted small">requested ${i.quantity_requested} · stock ${i.quantity_available}</span></div>
        <input type="number" min="0" max="${i.quantity_requested}" value="${i.quantity_requested}" aria-label="Quantity released">
        <select aria-label="Condition">${['Excellent', 'Good', 'Fair', 'Needs Repair'].map(c => `<option ${c === toDisp(i.condition_status) ? 'selected' : ''}>${c}</option>`).join('')}</select></div>`).join('')}
      <div class="field" style="margin-top:14px"><label class="f" for="nt">Dispatch notes</label><textarea id="nt" placeholder="Received by, pick-up person, accessories included…"></textarea></div>
      <div id="em"></div><button class="btn block" id="ok">Confirm release</button>`);
    m.el.querySelector('#ok').onclick = async () => {
      const items = [...m.el.querySelectorAll('.rl')].map(row => ({ reservation_item_id: +row.dataset.i, qty: +row.querySelector('input').value, condition: row.querySelector('select').value }));
      try { await App.post('borrowings.php', { action: 'release', reservation_id: +id, items, notes: m.el.querySelector('#nt').value }); m.close(); App.toast('Items released'); load(); }
      catch (er) { m.el.querySelector('#em').innerHTML = `<div class="err">${E(er.message)}</div>`; }
    };
  };
  load();
})();
