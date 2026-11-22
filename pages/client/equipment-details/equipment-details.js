(async () => {
  await App.init({ need: 'user', active: 'catalog' });
  const id = new URLSearchParams(location.search).get('id'), $ = s => document.querySelector(s);
  try {
    const { equipment: e, reviews } = await App.api('equipment.php?id=' + encodeURIComponent(id));
    document.title = e.equipment_name + ' | PLMun Reservation & Borrowing';
    const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0;
    $('#view').innerHTML = `<section class="top"><div>${App.thumb(e, 340)}</div><div class="info">
      <p class="muted" style="margin:0">${App.esc(e.category_name)}</p><h1>${App.esc(e.equipment_name)}</h1>
      ${reviews.length ? `<p>${App.stars(avg)} <span class="muted small">${avg.toFixed(1)} from ${reviews.length} review(s)</span></p>` : ''}
      <p>${App.esc(e.description || 'No description yet.')}</p>
      <div class="specs"><div class="spec"><small>In stock</small><b>${e.in_stock} units</b></div>
        <div class="spec"><small>Condition</small><b>${App.badge(e.condition_status)}</b></div>
        <div class="spec"><small>Status</small><b>${App.badge(e.reservable ? 'Available' : e.availability_status)}</b></div>
        <div class="spec"><small>Times borrowed</small><b>${e.total_released}</b></div></div>
      ${e.reservable && e.in_stock > 0 ? `<div class="buyrow"><div class="qty"><button id="m">−</button><input type="number" id="n" min="1" max="${e.in_stock}" value="1" aria-label="Quantity"><button id="p">+</button></div>
        <button class="btn" id="add">Add to request</button><a class="btn ghost" href="../reserve/reserve.html">Go to request</a></div>`
        : '<div class="warn">This item can’t be reserved right now.</div>'}
      </div></section>
      <h2>Reviews from borrowers</h2>
      <div class="revs">${reviews.map(r => `<article class="rev">${App.stars(r.rating)} <small class="muted">${App.date(r.review_date.slice(0, 10))}</small>
        <p style="margin:8px 0">${App.esc(r.comment || 'No comment left.')}</p><small class="muted"><b>${App.esc(r.full_name)}</b> · ${App.esc(r.event_name)}</small></article>`).join('')
        || '<div class="empty"><b>No reviews for this item yet</b>Reviews appear after a reservation using it is completed.</div>'}</div>`;
    if (e.reservable && e.in_stock > 0) {
      const n = $('#n'), max = e.in_stock;
      $('#m').onclick = () => n.value = Math.max(1, +n.value - 1);
      $('#p').onclick = () => n.value = Math.min(max, +n.value + 1);
      $('#add').onclick = () => { const q = Math.min(Math.max(1, +n.value || 1), max); App.cart.add(e, q); App.toast(`${q} × ${e.equipment_name} added to your request`); };
    }
  } catch (err) { $('#view').innerHTML = `<div class="empty"><b>${App.esc(err.message)}</b></div>`; }
})();
