(async () => {
  await App.init({ need: 'admin', active: 'admin-users' });
  const $ = s => document.querySelector(s), E = App.esc;
  let users = [];
  function draw() {
    const q = $('#q').value.toLowerCase();
    $('#rows').innerHTML = users.filter(u => !q || (u.last_name + ' ' + u.first_name + ' ' + u.email).toLowerCase().includes(q)).map(u => `<tr><td><b>${E(u.last_name)}</b></td><td>${E(u.first_name)}</td><td>${E(u.middle_initial ? u.middle_initial + '.' : '—')}</td><td class="small">${E(u.email)}</td><td>${E(u.user_type)}</td>
      <td>${E(u.department || '—')}${u.course ? '<br><span class="muted small">' + E(u.course) + ' ' + E(u.year_level || '') + '</span>' : ''}</td><td>${E(u.contact_number || '—')}</td>
      <td class="right">${u.reservations}</td><td class="right ${+u.unpaid ? 'low' : ''}">${App.money(u.unpaid)}</td>
      <td><select data-id="${u.user_id}" aria-label="Account status">${['Active', 'Pending', 'Suspended', 'Deactivated'].map(s => `<option ${s === u.account_status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td class="nowrap"><button class="btn sm ghost" data-adm="${u.user_id}">Make admin</button> <button class="btn sm danger" data-del="${u.user_id}">Delete</button></td></tr>`).join('')
      || '<tr><td colspan="11"><div class="empty"><b>No users found</b></div></td></tr>';
  }
  $('#q').oninput = draw;
  $('#rows').onchange = async e => { if (!e.target.dataset.id) return;
    try { await App.post('users.php', { action: 'status', id: +e.target.dataset.id, status: e.target.value }); App.toast('Account status updated'); } catch (er) { App.toast(er.message, true); } };
  async function reload() { users = (await App.api('users.php')).users; draw(); }
  $('#rows').onclick = async e => {
    const del = e.target.dataset.del, adm = e.target.dataset.adm, id = del || adm;
    if (!id) return;
    const u = users.find(x => x.user_id == id);
    try {
      if (del) {
        if (!confirm(`Delete the account of ${u.first_name} ${u.last_name} (${u.email})? This cannot be undone.`)) return;
        await App.post('users.php', { action: 'delete', id: +id }); App.toast('Account deleted');
      } else {
        if (!confirm(`Make ${u.first_name} ${u.last_name} (${u.email}) an admin?\nThey will log in with the same email and password, using the Admin option on the login page.`)) return;
        const r = await App.post('users.php', { action: 'make_admin', id: +id });
        App.toast(r.kept_as_deactivated ? 'Now an admin. The old user account was kept as Deactivated because it has reservations.' : 'Now an admin');
      }
      await reload();
    } catch (er) { App.toast(er.message, true); }
  };
  try { await reload(); } catch (e) { App.toast(e.message, true); }
})();
