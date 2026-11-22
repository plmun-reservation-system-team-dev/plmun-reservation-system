(async () => {
  await App.init({ need: 'admin', active: 'admin-reservations' });
  const $ = s => document.querySelector(s), E = App.esc;
  let all = [], f = 'Pending';
  async function load() {
    try { all = (await App.api('reservations.php')).reservations; } catch (e) { return App.toast(e.message, true); }
    const sts = ['All', 'Pending', 'Approved', 'Borrowed', 'Completed', 'Rejected', 'Cancelled'];
    $('#flt').innerHTML = sts.map(s => `<button class="chip ${s === f ? 'on' : ''}" data-f="${s}">${s}${s !== 'All' ? ' (' + all.filter(r => r.reservation_status === s).length + ')' : ''}</button>`).join('');
    const rows = all.filter(r => f === 'All' || r.reservation_status === f);
    $('#rows').innerHTML = rows.map(r => `<tr><td>#${r.reservation_id}</td><td class="who2"><b>${E(r.full_name)}</b><small>${E(r.user_type)}${r.department ? ' · ' + E(r.department) : ''}</small></td>
      <td><b>${E(r.event_name)}</b><small class="muted" style="display:block">${E(r.event_location)}</small></td>
      <td class="nowrap">${App.date(r.event_date)}<br><span class="muted small">${App.time(r.start_time)} – ${App.time(r.end_time)}</span></td>
      <td><ul>${r.items.map(i => `<li>${i.quantity_requested} × ${E(i.equipment_name)}</li>`).join('')}</ul></td>
      <td>${App.badge(r.reservation_status)}</td><td><button class="btn sm ${r.reservation_status === 'Pending' ? '' : 'ghost'}" data-o="${r.reservation_id}">${r.reservation_status === 'Pending' ? 'Review' : 'View'}</button></td></tr>`).join('')
      || '<tr><td colspan="7"><div class="empty"><b>No requests</b>Nothing in this category.</div></td></tr>';
  }
  $('#flt').onclick = e => { if (e.target.dataset.f) { f = e.target.dataset.f; load(); } };
  $('#rows').onclick = e => {
    const id = e.target.dataset.o; if (!id) return;
    const r = all.find(x => x.reservation_id == id), pending = r.reservation_status === 'Pending';
    const m = App.modal(`Request #${r.reservation_id}: ${r.event_name}`, `
      <div class="box2"><dl class="kv"><dt>Requester</dt><dd>${E(r.full_name)} (${E(r.user_type)})</dd><dt>Contact</dt><dd>${E(r.contact_number || r.email)}</dd>
        <dt>Date & time</dt><dd>${App.date(r.event_date)}, ${App.time(r.start_time)} – ${App.time(r.end_time)}</dd><dt>Venue</dt><dd>${E(r.event_location)}</dd>
        <dt>Purpose</dt><dd>${E(r.purpose || '—')}</dd><dt>Status</dt><dd>${App.badge(r.reservation_status)}</dd></dl></div>
      <b>Items requested</b><ul>${r.items.map(i => `<li>${i.quantity_requested} × ${E(i.equipment_name)} <span class="muted small">(${E(i.category_name)})</span></li>`).join('')}</ul>
      ${pending ? `<div class="field"><label class="f" for="rm">Remarks (required when rejecting)</label><textarea id="rm"></textarea></div><div id="em"></div>
        <div style="display:flex;gap:10px"><button class="btn green" id="ap" style="flex:1">Approve</button><button class="btn danger" id="rj" style="flex:1">Reject</button></div>`
        : `<p class="muted">${r.approval_remarks ? 'Remarks: ' + E(r.approval_remarks) : 'No remarks.'}</p>`}`);
    if (!pending) return;
    const act = async decision => {
      try { const res = await App.post('reservations.php', { action: 'decide', id: +id, decision, remarks: m.el.querySelector('#rm').value }); m.close(); App.toast(decision === 'approve' ? 'Request approved. ' + (res.emailed ? 'Borrower was emailed.' : res.email_message) : 'Request rejected'); load(); }
      catch (er) { m.el.querySelector('#em').innerHTML = `<div class="err">${E(er.message)}</div>`; }
    };
    m.el.querySelector('#ap').onclick = () => act('approve'); m.el.querySelector('#rj').onclick = () => act('reject');
  };
  load();
})();
