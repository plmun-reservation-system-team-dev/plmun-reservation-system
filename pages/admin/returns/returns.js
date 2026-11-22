(async () => {
  await App.init({ need: 'admin', active: 'admin-returns' });
  const $ = s => document.querySelector(s), E = App.esc;
  const COND = ['Excellent', 'Good', 'Fair', 'Needs Repair', 'Damaged', 'Lost'];
  let open = [], rate = 50;
  async function load(sel) {
    try {
      const [b, h] = await Promise.all([App.api('borrowings.php'), App.api('returns.php')]);
      rate = h.late_fee_per_hour;
      open = b.borrowings.filter(x => x.borrowing_status !== 'Returned');
      $('#sel').innerHTML = open.length ? open.map(x => `<option value="${x.borrowing_id}">#${x.borrowing_id} · ${E(x.full_name)} · ${E(x.event_name)} (${x.borrowing_status})</option>`).join('') : '<option value="">No open borrowings</option>';
      if (sel && open.some(x => x.borrowing_id == sel)) $('#sel').value = sel;
      draw();
      $('#hist').innerHTML = h.returns.map(r => `<tr><td class="nowrap">${App.datetime(r.return_datetime)}</td><td><b>${E(r.full_name)}</b><br><span class="muted small">${E(r.event_name)}</span></td>
        <td><ul>${r.items.map(i => `<li>${i.quantity_returned} × ${E(i.equipment_name)} ${App.badge(i.condition_on_return)}</li>`).join('')}</ul></td>
        <td>${App.badge(r.return_status)}<br><span class="muted small">${E(r.inspection_notes || '')}</span></td><td>${E(r.received_by_name || '—')}</td></tr>`).join('')
        || '<tr><td colspan="5"><div class="empty"><b>No returns yet</b></div></td></tr>';
    } catch (e) { App.toast(e.message, true); }
  }
  function draw() {
    const b = open.find(x => x.borrowing_id == $('#sel').value);
    if (!b) { $('#detail').innerHTML = '<div class="empty"><b>Nothing to receive</b>Borrowed items will show up here once released.</div>'; return; }
    const exp = App.dt(b.expected_return_datetime), late = new Date() > exp, hrs = late ? Math.ceil((Date.now() - exp) / 36e5) : 0;
    $('#detail').innerHTML = `<dl class="kv" style="margin-bottom:12px"><dt>Borrower</dt><dd>${E(b.full_name)} · ${E(b.contact_number || '')}</dd><dt>Return by</dt><dd>${App.datetime(b.expected_return_datetime)} ${late ? App.badge('Late') : ''}</dd></dl>
      <div class="ri head"><span>Item</span><span>Qty back</span><span>Condition</span><span>Inspection notes</span><span>Penalty (₱)</span></div>
      ${b.items.filter(i => i.outstanding > 0).map(i => `<div class="ri" data-i="${i.borrowing_item_id}"><div><b>${E(i.equipment_name)}</b><br><span class="muted small">${i.outstanding} still out</span></div>
        <input type="number" min="0" max="${i.outstanding}" value="${i.outstanding}" aria-label="Quantity returned">
        <select aria-label="Condition">${COND.map(c => `<option ${c === 'Good' ? 'selected' : ''}>${c}</option>`).join('')}</select>
        <input type="text" placeholder="e.g. scratched lens" aria-label="Notes"><input type="number" min="0" step="0.01" value="0" disabled aria-label="Penalty amount"></div>`).join('')}
      ${late ? `<div class="latebox"><b>Late by ~${hrs} hour(s)</b><span>Auto fee: ${App.money(hrs * rate)} (₱${rate}/hr)</span><label class="f" style="margin:0" for="lf">Override</label><input type="number" id="lf" min="0" step="0.01" placeholder="${(hrs * rate).toFixed(2)}"></div>` : ''}
      <p class="note small">Damaged, Needs Repair and Lost units are removed from available stock. Add them back under Inventory once repaired.</p>
      <div class="field" style="margin-top:14px"><label class="f" for="in">Overall inspection notes</label><textarea id="in"></textarea></div>
      <div id="em"></div><button class="btn" id="go">Record return</button>`;
    $('#detail').querySelectorAll('.ri[data-i]').forEach(row => {
      const sel = row.querySelector('select'), fee = row.querySelectorAll('input')[2];
      sel.onchange = () => { const bad = ['Needs Repair', 'Damaged', 'Lost'].includes(sel.value); fee.disabled = !bad; if (!bad) fee.value = 0; };
    });
    $('#go').onclick = async () => {
      const items = [...$('#detail').querySelectorAll('.ri[data-i]')].map(r => { const [q, , n, p] = [...r.querySelectorAll('input,select')];
        return { borrowing_item_id: +r.dataset.i, qty: +q.value, condition: r.querySelector('select').value, notes: r.querySelectorAll('input')[1].value, penalty: +r.querySelectorAll('input')[2].value }; });
      try {
        const r = await App.post('returns.php', { action: 'process', borrowing_id: +b.borrowing_id, items, inspection_notes: $('#in').value, late_fee: $('#lf')?.value ?? '' });
        App.toast(r.complete ? 'Return recorded. Borrowing closed.' : 'Partial return recorded.'); load();
      } catch (er) { $('#em').innerHTML = `<div class="err">${E(er.message)}</div>`; }
    };
  }
  $('#sel').onchange = draw;
  load(new URLSearchParams(location.search).get('id'));
})();
