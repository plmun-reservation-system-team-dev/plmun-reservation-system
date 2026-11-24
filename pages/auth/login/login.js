App.init({ need: 'guest' });
let role = 'user';
const $ = s => document.querySelector(s);
document.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
  role = b.dataset.role;
  document.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b));
  $('#email').placeholder = role === 'admin' ? 'admin@plmun.edu.ph' : 'you@plmun.edu.ph';
});
if (new URLSearchParams(location.search).has('reset')) $('#msg').innerHTML = '<div class="ok">Password updated! Log in with your new password.</div>';
else if (new URLSearchParams(location.search).has('registered')) $('#msg').innerHTML = '<div class="ok">Email verified! Your account request was sent to the Property Office. We will email you once it is approved, then you can log in.</div>';
$('#f').onsubmit = async e => {
  e.preventDefault();
  const email = $('#email').value.trim(), password = $('#pw').value;
  if (!email || !password) { $('#msg').innerHTML = '<div class="err">Please enter your email and password.</div>'; return; }
  await App.busy($('#go'), async () => {
    try {
      const r = await App.post('auth.php?action=login', { role, email, password });
      location.href = App.url(r.user.role === 'admin' ? 'admin-dashboard' : 'home');
    } catch (err) { $('#msg').innerHTML = `<div class="err">${App.esc(err.message)}</div>`; }
  });
};
