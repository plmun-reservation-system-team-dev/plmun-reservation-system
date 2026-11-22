(async () => {
  const me = await App.init({ need: 'user', active: 'reserve' });
  const $ = s => document.querySelector(s);
  $('#date').min = App.today();
  const q = new URLSearchParams(location.search);
  if (q.get('date')) $('#date').value = q.get('date');
  let ok = true;
  if (me.unpaid > 0) { $('#block').innerHTML = `<div class="warn" style="margin-bottom:18px">You have unpaid penalties of ${App.money(me.unpaid)}. Settle them at the Property Office to make new reservations. <a href="../my-penalties/my-penalties.html">View penalties</a></div>`; }

  function drawLines() {
    const c = App.cart.get();
    $('#lines').innerHTML = c.length ? c.map(i => `<div class="line"><div class="thumb">${App.picture({ image: i.image, equipment_name: i.name, category_name: i.cat })}</div>
      <div><b>${App.esc(i.name)}</b><span class="muted small">${App.esc(i.cat || '')}</span></div>
      <div class="qty"><button data-m="${i.id}" aria-label="Less">−</button><input type="number" min="1" value="${i.qty}" data-q="${i.id}" aria-label="Quantity"><button data-p="${i.id}" aria-label="More">+</button></div>
      <button class="rm" data-r="${i.id}">Remove</button></div>`).join('')
      : '<div class="empty"><b>Your request is empty</b>Browse the catalog and add what you need.</div>';
    checkAvail();
  }
  $('#lines').onclick = e => { const t = e.target, c = App.cart.get(); let id;
    if ((id = t.dataset.r)) App.cart.remove(+id);
    else if ((id = t.dataset.m || t.dataset.p)) { const it = c.find(x => x.id == id); it.qty = Math.max(1, it.qty + (t.dataset.p ? 1 : -1)); App.cart.set(c); }
    else return; drawLines(); };
  $('#lines').onchange = e => { if (!e.target.dataset.q) return; const c = App.cart.get(); c.find(x => x.id == e.target.dataset.q).qty = Math.max(1, +e.target.value || 1); App.cart.set(c); drawLines(); };

  async function checkAvail() {
    const c = App.cart.get(), d = $('#date').value, s = $('#s').value, e = $('#e').value;
    ok = true; $('#avail').innerHTML = '';
    if (!c.length || !d || !s || !e || s >= e) return;
    try {
      const list = (await App.api(`equipment.php?date=${d}&start=${s}&end=${e}`)).equipment;
      const rows = c.map(i => { const x = list.find(y => y.equipment_id == i.id);
        if (!x || !x.reservable) { ok = false; return `<div class="err" style="margin:0">${App.esc(i.name)} is no longer available.</div>`; }
        if (i.qty > x.available) { ok = false; return `<div class="err" style="margin:0">${App.esc(i.name)}: only ${x.available} free for that time (you asked for ${i.qty}).</div>`; }
        return ''; }).join('');
      $('#avail').innerHTML = rows || '<div class="ok" style="margin:0">All items are available for that time slot.</div>';
    } catch (err) {}
  }
  ['date', 's', 'e'].forEach(i => $('#' + i).onchange = checkAvail);

  $('#f').onsubmit = async ev => {
    ev.preventDefault();
    const err = m => $('#msg').innerHTML = `<div class="err">${App.esc(m)}</div>`;
    const c = App.cart.get();
    if (!c.length) return err('Add at least one equipment item first.');
    if (!ok) return err('Please fix the availability problems above.');
    const body = { action: 'create', event_name: $('#name').value.trim(), event_date: $('#date').value, start_time: $('#s').value, end_time: $('#e').value,
      event_location: $('#loc').value.trim(), purpose: $('#purpose').value.trim(), items: c.map(i => ({ equipment_id: i.id, qty: i.qty })) };
    if (!body.event_name || !body.event_date || !body.event_location) return err('Please complete the required event details.');
    if (body.start_time >= body.end_time) return err('End time must be later than start time.');
    await App.busy($('#go'), async () => {
      try { await App.post('reservations.php', body); App.cart.clear(); location.href = '../my-reservations/my-reservations.html?submitted=1'; }
      catch (e) { err(e.message); }
    });
  };
  drawLines();
})();
