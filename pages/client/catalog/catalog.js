(async () => {
  await App.init({ need: 'user', active: 'catalog' });
  const $ = s => document.querySelector(s);
  const qs = new URLSearchParams(location.search);
  let cat = '', cats = [], items = [];
  if (qs.get('date')) { $('#d').value = qs.get('date'); $('#s').value = qs.get('start') || '08:00'; $('#e').value = qs.get('end') || '17:00'; }
  $('#d').min = App.today();
  const sync = () => { const el = $('#cartPip2'); const n = App.cart.count(); el.textContent = n; el.hidden = !n; };

  async function load() {
    const p = new URLSearchParams();
    if ($('#q').value.trim()) p.set('q', $('#q').value.trim());
    if (cat) p.set('category', cat);
    if ($('#d').value && $('#s').value && $('#e').value) { p.set('date', $('#d').value); p.set('start', $('#s').value); p.set('end', $('#e').value); }
    try { items = (await App.api('equipment.php?' + p)).equipment; } catch (e) { return App.toast(e.message, true); }
    draw();
  }
  function draw() {
    const w = items[0]?.window_checked;
    $('#winNote').textContent = w ? `Showing how many are free on ${App.date($('#d').value)}, ${App.time($('#s').value)} – ${App.time($('#e').value)}.` : 'Pick a date and time to see live availability for your event.';
    const key = $('#sort').value;
    const list = [...items].sort((a, b) => key === 'pop' ? b.popularity - a.popularity : key === 'avail' ? b.available - a.available : a.equipment_name.localeCompare(b.equipment_name));
    const kept = {}; document.querySelectorAll('#grid input[id^="q"]').forEach(i => kept[i.id] = i.value);
    $('#grid').innerHTML = list.map(e => {
      const free = w ? e.available : (e.reservable ? e.in_stock : 0);
      const rate = +e.rating_count ? `<div class="rate">${App.stars(e.rating_avg)} <b>${Number(e.rating_avg).toFixed(1)}</b> <span>(${e.rating_count})</span></div>` : '<div class="rate none">No reviews yet</div>';
      return `<article class="item ${e.reservable ? '' : 'off'}">
        <div class="item-open" data-open="${e.equipment_id}" role="button" tabindex="0" aria-label="View details and reviews for ${App.esc(e.equipment_name)}">${App.thumb(e)}
          <h3>${App.esc(e.equipment_name)}</h3>
          <div class="meta">${App.esc(e.category_name)} · ${App.badge(e.condition_status)}</div>
          ${rate}
          <p class="desc">${App.esc(e.description || '')}</p>
          <span class="view">View info &amp; reviews →</span></div>
        <div class="buy"><span class="left ${free <= 2 ? 'low' : ''}">${e.reservable ? free + (w ? ' free' : ' in stock') : e.availability_status}</span>
          <span style="flex:1"></span>
          ${free > 0 ? `<div class="qty"><button data-m="${e.equipment_id}" aria-label="Less">−</button><input type="number" min="1" max="${free}" value="1" id="q${e.equipment_id}" aria-label="Quantity"><button data-p="${e.equipment_id}" aria-label="More">+</button></div>
          <button class="btn sm" data-add="${e.equipment_id}">Add</button>` : '<span class="badge b-Unavailable">Not available</span>'}
        </div></article>`;
    }).join('') || '<div class="empty wide"><b>No equipment found</b>Try another search or category.</div>';
    for (const id in kept) { const i = document.getElementById(id); if (i) i.value = Math.min(Math.max(1, +kept[id] || 1), +i.max || 1); }
  }
  const openItem = id => App.equipmentModal(id, {
    win: $('#d').value && $('#s').value && $('#e').value ? { date: $('#d').value, start: $('#s').value, end: $('#e').value } : null,
    onAdd: (e, qty) => { App.cart.add(e, qty); sync(); App.toast(`${qty} × ${e.equipment_name} added to your request`); } });
  $('#grid').onkeydown = ev => { const o = ev.target.closest('[data-open]'); if (o && ev.target === o && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); openItem(o.dataset.open); } };
  $('#grid').onclick = ev => {
    const op = ev.target.closest('[data-open]'); if (op) return openItem(op.dataset.open);
    const t = ev.target, id = t.dataset.m || t.dataset.p || t.dataset.add; if (!id) return;
    const inp = $('#q' + id), max = +inp.max || 1;
    if (t.dataset.m) inp.value = Math.max(1, +inp.value - 1);
    if (t.dataset.p) inp.value = Math.min(max, +inp.value + 1);
    if (t.dataset.add) {
      const e = items.find(x => x.equipment_id == id), qty = Math.min(Math.max(1, +inp.value || 1), max);
      App.cart.add(e, qty); sync(); App.toast(`${qty} × ${e.equipment_name} added to your request`);
    }
  };
  let tm; $('#q').oninput = () => { clearTimeout(tm); tm = setTimeout(load, 250); };
  ['d', 's', 'e'].forEach(i => $('#' + i).onchange = load);
  $('#sort').onchange = draw;

  try {
    cats = (await App.api('categories.php')).categories;
    $('#cats').innerHTML = `<button class="chip on" data-c="">All</button>` + cats.map(c => `<button class="chip" data-c="${c.category_id}">${App.esc(c.category_name)}</button>`).join('');
    $('#cats').onclick = e => { if (!e.target.dataset.hasOwnProperty('c')) return; cat = e.target.dataset.c;
      document.querySelectorAll('#cats .chip').forEach(c => c.classList.toggle('on', c === e.target)); load(); };
  } catch (e) {}
  sync(); load();
  // keep stock figures live: refresh every 15 s while the tab is open, and when returning to it
  setInterval(() => { if (!document.hidden) load(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
})();
