(async () => {
  await App.init({ need: 'admin', active: 'admin-users' });
  const $ = s => document.querySelector(s), E = App.esc;
  let users = [];
  const STATUSES = ['Active', 'Suspended', 'Deactivated', 'Rejected', 'Pending'];
  const pend = () => users.filter(u => u.account_status === 'Pending').length;
  function draw() {
    const q = $('#q').value.toLowerCase().trim(), fs = $('#fs').value, n = pend();
    $('#banner').innerHTML = n ? `<div class="banner">🪪 ${n} new account request${n > 1 ? 's are' : ' is'} waiting for your review.<button class="btn sm" id="showPend">Show them</button></div>` : '';
    $('#showPend')?.addEventListener('click', () => { $('#fs').value = 'Pending'; draw(); });
    const list = users.filter(u => (!fs || u.account_status === fs) && (!q || (u.last_name + ' ' + u.first_name + ' ' + u.email + ' ' + (u.id_number || '')).toLowerCase().includes(q)))
      .sort((a, b) => (b.account_status === 'Pending') - (a.account_status === 'Pending'));   // requests waiting for review first
    $('#rows').innerHTML = list.map(u => {
      const pending = u.account_status === 'Pending';
      return `<tr><td><b>${E(u.last_name)}</b></td><td>${E(u.first_name)}</td><td>${E(u.middle_initial ? u.middle_initial + '.' : '—')}</td><td class="small">${E(u.email)}</td><td class="small">${E(u.id_number || '—')}</td><td>${E(u.user_type)}</td>
      <td>${E(u.department || '—')}${u.course ? '<br><span class="muted small">' + E(u.course) + ' ' + E(u.year_level || '') + '</span>' : ''}</td><td>${E(u.contact_number || '—')}</td>
      <td class="right">${u.reservations}</td><td class="right ${+u.unpaid ? 'low' : ''}">${App.money(u.unpaid)}</td>
      <td>${pending ? App.badge('Pending')
        : `<select data-id="${u.user_id}" aria-label="Account status">${STATUSES.map(s => `<option ${s === u.account_status ? 'selected' : ''}>${s}</option>`).join('')}</select>`}</td>
      <td class="nowrap">${pending ? `<button class="btn sm" data-rev="${u.user_id}">Review</button> ` : (+u.has_id_photo ? `<button class="btn sm ghost" data-rev="${u.user_id}">View ID</button> ` : '')}${pending ? '' : `<button class="btn sm ghost" data-adm="${u.user_id}">Make admin</button> `}<button class="btn sm danger" data-del="${u.user_id}">Delete</button></td></tr>`;
    }).join('') || '<tr><td colspan="12"><div class="empty"><b>No users found</b></div></td></tr>';
  }
  $('#q').oninput = draw; $('#fs').onchange = draw;
  $('#rows').onchange = async e => { if (!e.target.dataset.id) return;
    try { await App.post('users.php', { action: 'status', id: +e.target.dataset.id, status: e.target.value }); App.toast('Account status updated'); await reload(); } catch (er) { App.toast(er.message, true); } };
  async function reload() { users = (await App.api('users.php')).users; draw(); }

  // ---- review window: details + ID photo, then approve / reject ----
  function review(u) {
    const pending = u.account_status === 'Pending';
    const m = App.modal(pending ? 'Review account request' : 'ID on file', `<div class="rv">
      <dl><dt>Name</dt><dd>${E(u.first_name)} ${E(u.middle_initial ? u.middle_initial + '. ' : '')}${E(u.last_name)}</dd>
        <dt>Email</dt><dd>${E(u.email)}</dd><dt>ID number</dt><dd>${E(u.id_number || '—')}</dd><dt>Role</dt><dd>${E(u.user_type)}</dd>
        <dt>Department</dt><dd>${E(u.department || '—')}</dd>${u.course ? `<dt>Course</dt><dd>${E(u.course)} ${E(u.year_level || '')}</dd>` : ''}
        <dt>Contact</dt><dd>${E(u.contact_number || '—')}</dd><dt>Status</dt><dd>${App.badge(u.account_status)}</dd></dl>
      <div class="ph" id="rvPh"><span class="muted">Loading ID photo…</span></div></div>
      ${pending ? `<div class="field" style="margin-top:14px"><label class="f" for="rvWhy">Note for the person (optional, added to the rejection email)</label><textarea id="rvWhy" maxlength="300" placeholder="e.g. The ID number does not match the photo."></textarea></div>
      <p class="muted small" style="margin:6px 0 0">The person is emailed either way. Their email address was already verified with a code.</p>
      <div class="rv-actions"><button class="btn danger" id="rvNo">Reject</button><button class="btn" id="rvYes">Approve</button></div>` : ''}`, { wide: true });
    App.api('users.php?photo=' + u.user_id).then(r => {
      $('#rvPh').innerHTML = r.photo ? `<img src="${E(r.photo)}" alt="ID photo of ${E(u.first_name)} ${E(u.last_name)}">` : '<span class="muted">No ID photo was uploaded.</span>';
    }).catch(er => { $('#rvPh').innerHTML = `<span class="muted">${E(er.message)}</span>`; });
    if (!pending) return;
    const decide = (decision) => async e => {
      if (decision === 'reject' && !confirm(`Reject the account request of ${u.first_name} ${u.last_name}?`)) return;
      await App.busy(e.target, async () => {
        try {
          const r = await App.post('users.php', { action: 'decide', id: u.user_id, decision, reason: $('#rvWhy').value.trim() });
          m.close();
          const what = decision === 'approve' ? 'Account approved' : 'Account rejected';
          App.toast(r.emailed ? `${what}. The person was emailed.` : `${what}, but the email was not sent: ${r.email_message}`, !r.emailed);
          await reload();
        } catch (er) { App.toast(er.message, true); }
      });
    };
    $('#rvYes').onclick = decide('approve'); $('#rvNo').onclick = decide('reject');
  }

  $('#rows').onclick = async e => {
    const rev = e.target.dataset.rev; if (rev) return review(users.find(x => x.user_id == rev));
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
