/* Floating chat assistant. Loaded by App.init() on every logged-in page. */
(() => {
  if (document.getElementById('cbFab')) return;
  const E = App.esc, history = [];
  const fab = document.createElement('button');
  fab.id = 'cbFab'; fab.className = 'cb-fab'; fab.setAttribute('aria-label', 'Open chat assistant');
  fab.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/></svg>';
  const box = document.createElement('section');
  box.className = 'cb-box'; box.hidden = true; box.setAttribute('aria-label', 'Chat assistant');
  box.innerHTML = `<div class="cb-head"><div><b>PLMun Assistant</b><small>Ask about equipment, reservations, penalties</small></div><button type="button" aria-label="Close chat">×</button></div>
    <div class="cb-log" id="cbLog" aria-live="polite"></div>
    <div class="cb-chips" id="cbChips"></div>
    <form class="cb-form" id="cbForm"><input id="cbIn" maxlength="500" autocomplete="off" placeholder="Type your question…" aria-label="Message"><button type="submit">Send</button></form>`;
  document.body.append(box, fab);
  const log = box.querySelector('#cbLog'), inp = box.querySelector('#cbIn'), form = box.querySelector('#cbForm');

  const add = (txt, cls) => { const d = document.createElement('div'); d.className = 'cb-m ' + cls; d.textContent = txt; log.append(d); log.scrollTop = log.scrollHeight; return d; };
  const chips = ['What equipment is available?', 'How do I reserve?', 'Status of my reservations', 'What are the penalties?'];
  box.querySelector('#cbChips').innerHTML = chips.map(c => `<button type="button">${E(c)}</button>`).join('');

  async function send(text) {
    text = text.trim(); if (!text) return;
    box.querySelector('#cbChips').hidden = true;
    add(text, 'me'); history.push({ role: 'user', content: text });
    const wait = add('Typing…', 'bot typing'); form.querySelector('button').disabled = true;
    try {
      const r = await App.post('chat.php', { messages: history });
      wait.className = 'cb-m bot'; wait.textContent = r.reply; history.push({ role: 'assistant', content: r.reply });
    } catch (e) { wait.className = 'cb-m bot'; wait.textContent = e.message; history.pop(); }
    form.querySelector('button').disabled = false; log.scrollTop = log.scrollHeight; inp.focus();
  }
  form.onsubmit = e => { e.preventDefault(); const t = inp.value; inp.value = ''; send(t); };
  box.querySelector('#cbChips').onclick = e => { if (e.target.tagName === 'BUTTON') send(e.target.textContent); };
  const toggle = open => { box.hidden = !open; if (open) { if (!log.children.length) add('Hi! I’m the PLMun assistant. How can I help you today?', 'bot'); inp.focus(); } };
  fab.onclick = () => toggle(box.hidden);
  box.querySelector('.cb-head button').onclick = () => toggle(false);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !box.hidden) toggle(false); });
})();
