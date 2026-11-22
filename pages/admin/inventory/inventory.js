(async () => {
  await App.init({ need: 'admin', active: 'admin-inventory' });
  const $ = s => document.querySelector(s), E = App.esc;
  const CONDS = ['Excellent', 'Good', 'Fair', 'Needs Repair', 'Damaged', 'Retired'], AVS = ['Available', 'Reserved', 'Borrowed', 'Unavailable', 'Under Maintenance'];
  let items = [], cats = [];
  const opts = (arr, v) => arr.map(x => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('');
  async function load() {
    try { [items, cats] = [(await App.api('equipment.php')).equipment, (await App.api('categories.php')).categories]; } catch (e) { return App.toast(e.message, true); }
    draw();
  }
  const attn = e => ['Needs Repair', 'Damaged'].includes(e.condition_status) || e.availability_status === 'Under Maintenance' || e.quantity_available <= 2;
  function draw() {
    const q = $('#q').value.toLowerCase(), fs = $('#fs').value;
    $('#rows').innerHTML = items.filter(e => (!q || (e.equipment_name + e.category_name).toLowerCase().includes(q)) && (!fs || (fs === 'attn' ? attn(e) && e.condition_status !== 'Retired' : e.condition_status === fs)))
      .map(e => `<tr><td><div class="eqn" data-v="${e.equipment_id}" title="View info and reviews">${App.thumb(e, 46)}<div><b>${E(e.equipment_name)}</b> ${+e.rating_count ? `<span class="rt">★ ${Number(e.rating_avg).toFixed(1)} <span class="muted small">(${e.rating_count})</span></span>` : ''}<br><span class="muted small">#${e.equipment_id}</span></div></div></td><td>${E(e.category_name)}</td>
        <td class="right ${e.quantity_available <= 2 && e.condition_status !== 'Retired' ? 'low' : ''}">${e.quantity_available}</td><td>${App.badge(e.condition_status)}</td><td>${App.badge(e.availability_status)}</td>
        <td class="right">${e.total_released}</td><td class="right ${e.incidents ? 'low' : ''}">${e.incidents}</td>
        <td class="nowrap"><button class="btn ghost sm" data-v="${e.equipment_id}">Info &amp; reviews</button> <button class="btn ghost sm" data-e="${e.equipment_id}">Edit</button></td></tr>`).join('') || '<tr><td colspan="8"><div class="empty"><b>No equipment</b></div></td></tr>';
  }
  $('#q').oninput = draw; $('#fs').onchange = draw;
  function form(e) {
    const n = e || { equipment_name: '', description: '', quantity_available: 1, condition_status: 'Good', availability_status: 'Available', category_id: cats[0]?.category_id };
    const m = App.modal(e ? 'Edit equipment' : 'Add equipment', `<form id="ef"><div class="field"><label class="f" for="nm">Name *</label><input type="text" id="nm" value="${E(n.equipment_name)}" required></div>
      <div class="row"><div class="field"><label class="f" for="ct">Category *</label><select id="ct">${cats.map(c => `<option value="${c.category_id}" ${c.category_id == n.category_id ? 'selected' : ''}>${E(c.category_name)}</option>`).join('')}</select></div>
        <div class="field"><label class="f" for="qt">Quantity in stock</label><input type="number" id="qt" min="0" value="${n.quantity_available}"></div></div>
      <div class="row"><div class="field"><label class="f" for="cd">Condition</label><select id="cd">${opts(CONDS, n.condition_status)}</select></div>
        <div class="field"><label class="f" for="av">Availability</label><select id="av">${opts(AVS, n.availability_status)}</select></div></div>
      <div class="field"><label class="f" for="ds">Description</label><textarea id="ds">${E(n.description || '')}</textarea></div>
      <div class="field"><label class="f" for="im">Photo (JPG/PNG/WEBP, max 2 MB)</label><input type="file" id="im" accept="image/png,image/jpeg,image/webp"></div>
      <p class="note small">Retiring an item (Condition: Retired) removes it from the catalog but keeps its history.</p><div id="em"></div>
      <div style="display:flex;gap:10px"><button class="btn" style="flex:1" type="submit">Save</button>${e ? '<button class="btn danger" type="button" id="del">Delete</button>' : ''}</div></form>`);
    m.el.querySelector('#ef').onsubmit = async ev => {
      ev.preventDefault();
      const fd = new FormData(); const g = i => m.el.querySelector('#' + i);
      fd.append('action', 'save'); if (e) fd.append('equipment_id', e.equipment_id);
      fd.append('equipment_name', g('nm').value); fd.append('category_id', g('ct').value); fd.append('quantity_available', g('qt').value);
      fd.append('condition_status', g('cd').value); fd.append('availability_status', g('av').value); fd.append('description', g('ds').value);
      if (g('im').files[0]) fd.append('image', g('im').files[0]);
      try { await App.api('equipment.php', { form: fd }); m.close(); App.toast('Equipment saved'); load(); } catch (er) { g('em').innerHTML = `<div class="err">${E(er.message)}</div>`; }
    };
    m.el.querySelector('#del')?.addEventListener('click', async () => {
      if (!confirm('Delete this equipment permanently?')) return;
      try { await App.post('equipment.php', { action: 'delete', id: e.equipment_id }); m.close(); App.toast('Equipment deleted'); load(); }
      catch (er) { m.el.querySelector('#em').innerHTML = `<div class="err">${E(er.message)}</div>`; }
    });
  }
  $('#add').onclick = () => form(null);
  $('#rows').onclick = ev => {
    const ed = ev.target.closest('[data-e]'), vw = ev.target.closest('[data-v]');
    if (ed) return form(items.find(x => x.equipment_id == ed.dataset.e));
    if (vw) App.equipmentModal(vw.dataset.v, { admin: true, onEdit: eq => form(items.find(x => x.equipment_id == eq.equipment_id)) });
  };
  $('#cats').onclick = () => {
    const m = App.modal('Equipment categories', `<div id="cl"></div><hr style="border:0;border-top:1px solid var(--line);margin:16px 0"><div class="row"><div class="field"><label class="f" for="cn">New category</label><input type="text" id="cn"></div>
      <div class="field"><label class="f" for="cd2">Description</label><input type="text" id="cd2"></div></div><div id="em"></div><button class="btn" id="ca">Add category</button>`);
    const draw2 = () => m.el.querySelector('#cl').innerHTML = cats.map(c => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--line)"><span><b>${E(c.category_name)}</b> <span class="muted small">${c.items} item(s)</span></span><button class="btn ghost sm" data-d="${c.category_id}">Remove</button></div>`).join('');
    draw2();
    m.el.querySelector('#cl').onclick = async ev => { const id = ev.target.dataset.d; if (!id) return;
      try { await App.post('categories.php', { action: 'delete', id: +id }); await load(); draw2(); } catch (er) { m.el.querySelector('#em').innerHTML = `<div class="err">${E(er.message)}</div>`; } };
    m.el.querySelector('#ca').onclick = async () => {
      try { await App.post('categories.php', { action: 'add', category_name: m.el.querySelector('#cn').value, description: m.el.querySelector('#cd2').value }); m.el.querySelector('#cn').value = ''; await load(); draw2(); m.el.querySelector('#em').innerHTML = ''; }
      catch (er) { m.el.querySelector('#em').innerHTML = `<div class="err">${E(er.message)}</div>`; }
    };
  };
  load();
})();
