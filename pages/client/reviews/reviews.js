(async () => {
  const me = await App.init({ need: 'user', active: 'reviews' });
  const $ = s => document.querySelector(s), E = App.esc;
  let rating = 0, eligible = [];

  const bars = (p, t) => [5, 4, 3, 2, 1].map(n => `<div class="bar"><span>${n}★</span><i><b style="width:${t ? (p['s' + n] / t * 100) : 0}%"></b></i><span>${p['s' + n] || 0}</span></div>`).join('');

  async function load() {
    try {
      const d = await App.api('reviews.php');
      eligible = d.eligible;
      const t = +d.summary.total;
      $('#overall').innerHTML = `<div class="big">${t ? Number(d.summary.avg).toFixed(1) : '—'}</div><div>${t ? App.stars(d.summary.avg) : ''}<p class="muted small" style="margin:2px 0 0">${t} review(s) across ${d.products.length} product(s)</p></div>`;

      // group reviews by product
      const byProd = {};
      d.reviews.forEach(r => (byProd[r.equipment_id] ||= []).push(r));

      $('#jump').hidden = !d.products.length;
      $('#jump').innerHTML = d.products.map(p => `<a class="chip" href="#p${p.equipment_id}">${E(p.equipment_name)} <small>(${p.total})</small></a>`).join('');

      $('#list').innerHTML = d.products.map(p => {
        const total = +p.total;
        return `<section class="prod" id="p${p.equipment_id}" aria-label="Reviews for ${E(p.equipment_name)}">
          <aside class="card psum">
            ${App.thumb(p, 130)}
            <h2>${E(p.equipment_name)}</h2><p class="muted small" style="margin:0 0 10px">${E(p.category_name)}</p>
            <div class="pavg"><span class="big sm">${Number(p.avg).toFixed(1)}</span>${App.stars(p.avg)}</div>
            <p class="muted small">${total} review(s)</p>${bars(p, total)}
            <a class="btn ghost sm" href="../equipment-details/equipment-details.html?id=${p.equipment_id}">View product</a>
          </aside>
          <div class="plist">${(byProd[p.equipment_id] || []).map(r => `<article class="rev">${App.stars(r.rating)} <small class="muted">${App.date(r.review_date.slice(0, 10))}</small>
            <p style="margin:8px 0">${E(r.comment || 'No comment left.')}</p><small class="muted"><b>${E(r.full_name)}</b> (${E(r.user_type)}) · ${E(r.event_name)}</small></article>`).join('')}</div>
        </section>`;
      }).join('') || '<div class="empty"><b>No reviews yet</b>Once you borrow equipment you can review each product you borrowed.</div>';

      $('#write').hidden = !eligible.length;
      $('#rid').innerHTML = eligible.map((r, i) => `<option value="${i}">${E(r.equipment_name)} — ${E(r.event_name)} · ${App.date(r.event_date)}</option>`).join('');
    } catch (e) { App.toast(e.message, true); }
  }

  $('#sp').onclick = e => { if (!e.target.dataset.n) return; rating = +e.target.dataset.n;
    document.querySelectorAll('#sp button').forEach((b, i) => b.classList.toggle('on', i < rating)); };
  $('#sv').onclick = async () => {
    const it = eligible[+$('#rid').value];
    if (!it) return;
    try {
      await App.post('reviews.php', { reservation_id: it.reservation_id, equipment_id: it.equipment_id, rating, comment: $('#cm').value });
      $('#cm').value = ''; rating = 0;
      document.querySelectorAll('#sp button').forEach(b => b.classList.remove('on')); $('#msg').innerHTML = '';
      App.toast('Thanks for your review!'); load();
    } catch (e) { $('#msg').innerHTML = `<div class="err">${E(e.message)}</div>`; }
  };
  load();
})();
