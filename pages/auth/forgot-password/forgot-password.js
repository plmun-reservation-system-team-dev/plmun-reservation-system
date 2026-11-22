App.init({ need: 'guest' });
const $ = s => document.querySelector(s);
const show = (m, ok) => $('#msg').innerHTML = `<div class="${ok ? 'ok' : 'err'}">${App.esc(m)}</div>`;
let email = '', tick;

function cooldown(sec) {
  clearInterval(tick);
  const b = $('#resend');
  const upd = () => { b.disabled = sec > 0; b.textContent = sec > 0 ? `Resend code (${sec}s)` : 'Resend code'; if (sec-- <= 0) clearInterval(tick); };
  upd(); tick = setInterval(upd, 1000);
}

// step 1: ask for the code
$('#f').onsubmit = async e => {
  e.preventDefault();
  email = $('#email').value.trim().toLowerCase();
  if (!email) return show('Please enter your email.');
  await App.busy($('#go'), async () => {
    try {
      const r = await App.post('auth.php?action=forgot_password', { email });
      $('#f').hidden = true; $('#rf').hidden = false; $('#msg').innerHTML = '';
      $('#sub').textContent = 'Enter the code and choose a new password.';
      $('#rinfo').textContent = `If ${r.email} has an account, we sent a 6-digit code to it. It expires in ${r.minutes} minutes. Check your spam folder if you don't see it.`;
      $('#code').value = ''; $('#code').focus();
      cooldown(r.resend_after || 60);
    } catch (err) { show(err.message); }
  });
};

// step 2: code + new password
$('#code').oninput = () => $('#code').value = $('#code').value.replace(/\D/g, '').slice(0, 8);
$('#rf').onsubmit = async e => {
  e.preventDefault();
  const code = $('#code').value.trim(), password = $('#pw').value;
  if (code.length < 6) return show('Enter the code from your email.');
  if (password.length < 6) return show('Password must be at least 6 characters.');
  if (password !== $('#pw2').value) return show('Passwords do not match.');
  await App.busy($('#rgo'), async () => {
    try { await App.post('auth.php?action=reset_password', { email, code, password }); location.href = '../../../index.html?reset=1'; }
    catch (err) { show(err.message); }
  });
};
$('#resend').onclick = async () => {
  try { const r = await App.post('auth.php?action=forgot_password', { email }); show(`A new code was sent to ${r.email}.`, true); cooldown(r.resend_after || 60); }
  catch (err) { show(err.message); }
};
$('#back').onclick = () => {
  clearInterval(tick);
  $('#rf').hidden = true; $('#f').hidden = false; $('#msg').innerHTML = '';
  $('#sub').textContent = 'Enter your account email and we will send you a 6-digit code.';
};
