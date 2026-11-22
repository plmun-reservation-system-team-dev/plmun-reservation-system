(async () => {
  await App.init({ need: 'user', active: 'my-penalties' });
  try {
    const p = (await App.api('penalties.php')).penalties, sum = st => p.filter(x => x.penalty_status === st).reduce((a, x) => a + x.amount, 0);
    document.querySelector('#sum').innerHTML = `<div class="due"><b>${App.money(sum('Unpaid'))}</b><span>Unpaid balance</span></div><div><b>${App.money(sum('Paid'))}</b><span>Paid so far</span></div><div><b>${App.money(sum('Waived'))}</b><span>Waived</span></div>`;
    document.querySelector('#rows').innerHTML = p.map(x => `<tr><td class="nowrap">${App.date(x.assessed_at.slice(0, 10))}</td><td>${App.esc(x.event_name)}</td><td>${App.badge(x.penalty_type)}</td>
      <td>${App.esc(x.reason || '—')}</td><td class="right nowrap"><b>${App.money(x.amount)}</b></td><td>${App.badge(x.penalty_status)}</td></tr>`).join('')
      || '<tr><td colspan="6"><div class="empty"><b>No penalties</b>Keep returning items on time and in good shape.</div></td></tr>';
  } catch (e) { App.toast(e.message, true); }
})();
