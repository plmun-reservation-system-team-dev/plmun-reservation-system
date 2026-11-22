App.init({ need: 'guest' });
const $ = s => document.querySelector(s);
const show = (m, ok) => $('#msg').innerHTML = `<div class="${ok ? 'ok' : 'err'}">${App.esc(m)}</div>`;
$('#type').onchange = () => $('#studentOnly').hidden = $('#type').value !== 'Student';
$('#f').onsubmit = async e => {
  e.preventDefault();
  const d = { last_name: $('#last').value.trim(), first_name: $('#first').value.trim(), middle_initial: $('#mi').value.trim().replace(/\./g, '').toUpperCase(), email: $('#email').value.trim(), user_type: $('#type').value, contact_number: $('#contact').value.trim(),
    department: $('#dept').value.trim(), course: $('#course').value.trim(), year_level: $('#year').value, password: $('#pw').value };
  if (!d.last_name || !d.first_name || !d.email || !d.password) return show('Please fill in all required fields.');
  if (d.middle_initial && !/^\p{L}$/u.test(d.middle_initial)) return show('Middle initial must be a single letter.');
  if (d.password.length < 6) return show('Password must be at least 6 characters.');
  if (d.password !== $('#pw2').value) return show('Passwords do not match.');
  await App.busy($('#go'), async () => {
    try { const r = await App.post('auth.php?action=register', d); showVerify(r); }
    catch (err) { show(err.message); scrollTo({ top: 0, behavior: 'smooth' }); }
  });
};

// ---- step 2: e-mail verification ----
let tick;
function cooldown(sec) {
  clearInterval(tick);
  const b = $('#resend');
  const upd = () => { b.disabled = sec > 0; b.textContent = sec > 0 ? `Resend code (${sec}s)` : 'Resend code'; if (sec-- <= 0) clearInterval(tick); };
  upd(); tick = setInterval(upd, 1000);
}
function showVerify(r) {
  $('#f').hidden = true; $('#vf').hidden = false;
  $('h2').textContent = 'Verify your email';
  document.querySelector('.box > .muted').textContent = 'One last step to confirm this email is yours.';
  $('#vinfo').textContent = `We sent a 6-digit code to ${r.email}. Enter it below (it expires in ${r.minutes} minutes). Check your spam folder if you don't see it.`;
  $('#code').value = ''; $('#code').focus();
  cooldown(r.resend_after || 60);
}
$('#code').oninput = () => $('#code').value = $('#code').value.replace(/\D/g, '').slice(0, 8);
$('#vf').onsubmit = async e => {
  e.preventDefault();
  const code = $('#code').value.trim();
  if (code.length < 6) return show('Enter the code from your email.');
  await App.busy($('#vgo'), async () => {
    try { await App.post('auth.php?action=verify_email', { code }); location.href = '../../../index.html?registered=1'; }
    catch (err) { show(err.message); }
  });
};
$('#resend').onclick = async () => {
  try { const r = await App.post('auth.php?action=resend_code', {}); show(`A new code was sent to ${r.email}.`, true); cooldown(r.resend_after || 60); }
  catch (err) { show(err.message); }
};
$('#back').onclick = () => {
  clearInterval(tick);
  $('#vf').hidden = true; $('#f').hidden = false; $('#msg').innerHTML = '';
  $('h2').textContent = 'Create your account';
  document.querySelector('.box > .muted').textContent = 'Your details are saved to the PLMun reservation database.';
};
