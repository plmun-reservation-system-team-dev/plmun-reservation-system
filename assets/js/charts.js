/* PLMun - tiny dependency-free chart helpers (SVG / CSS). Loaded after app.js on the dashboards. */
const Charts = (() => {
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = ['#14502f', '#e8b13a', '#a9b8ac', '#6aa57e', '#c9d6cc'];
  const empty = (msg = 'No data yet') => `<div class="empty"><b>${msg}</b>Charts fill in as reservations come in.</div>`;

  /** Multi-series line chart. series: [{name, color, values, area}] */
  function line(el, labels, series) {
    const W = 400, H = 230, L = 34, R = 14, T = 12, B = 28;
    const max = Math.max(...series.flatMap(s => s.values), 1);
    const step = max <= 5 ? 1 : max <= 20 ? 5 : max <= 60 ? 10 : max <= 150 ? 25 : Math.pow(10, Math.floor(Math.log10(max)));
    const top = Math.ceil(max / step) * step;
    const x = i => L + (labels.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (labels.length - 1));
    const y = v => T + (H - T - B) * (1 - v / top);
    let g = '';
    for (let v = 0; v <= top; v += step) g += `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    labels.forEach((l, i) => { g += `<text x="${x(i)}" y="${H - 7}" text-anchor="middle">${E(l)}</text>`; });
    let defs = '', body = '';
    series.forEach((s, k) => {
      const pts = s.values.map((v, i) => [x(i), y(v)]);
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
      const len = pts.reduce((a, p, i) => i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0) + 4;
      if (s.area) {
        defs += `<linearGradient id="ar${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".28"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`;
        body += `<path d="${d} L${x(labels.length - 1)} ${y(0)} L${x(0)} ${y(0)}Z" fill="url(#ar${k})"/>`;
      }
      body += `<path class="ln" d="${d}" stroke="${s.color}" style="--len:${len.toFixed(0)}"/>`;
      body += pts.map((p, i) => `<circle class="pt" cx="${p[0]}" cy="${p[1]}" r="4.5" fill="${s.color}"><title>${E(s.name)} · ${E(labels[i])}: ${s.values[i]}</title></circle>`).join('');
    });
    el.innerHTML = `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${E(s.name)}</span>`).join('')}</div>
      <svg class="lc" viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart"><defs>${defs}</defs>${g}${body}</svg>`;
  }

  /** Donut. items: [{label, value}] ; center: {big, small} */
  function donut(el, items, center) {
    const total = items.reduce((a, i) => a + i.value, 0);
    if (!total) { el.innerHTML = empty(); return; }
    const R = 64, C = 2 * Math.PI * R; let off = 0;
    const segs = items.map((it, i) => {
      const len = it.value / total * C, col = COLORS[i % COLORS.length];
      const s = `<circle cx="80" cy="80" r="${R}" stroke="${col}" stroke-dasharray="0 ${C}" data-len="${len}" stroke-dashoffset="${-off}"/>`;
      off += len; return s;
    }).join('');
    el.innerHTML = `<div class="donut-w"><div class="donut"><svg viewBox="0 0 160 160" role="img" aria-label="Donut chart"><circle cx="80" cy="80" r="${R}" stroke="#f1ecdc"/>${segs}</svg>
      <div class="mid"><div><b>${E(center.big)}</b><span>${E(center.small)}</span></div></div></div>
      <div class="dl">${items.map((it, i) => `<div><i style="background:${COLORS[i % COLORS.length]}"></i><span>${E(it.label)}</span><b>${Math.round(it.value / total * 100)}%</b></div>`).join('')}</div></div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => el.querySelectorAll('circle[data-len]').forEach(c => c.setAttribute('stroke-dasharray', `${Math.max(c.dataset.len - 1.5, 0)} ${C}`))));
  }

  /** Horizontal bars. rows: [{label, value, icon?}] */
  function hbars(el, rows, { fmt = x => x, cls = '' } = {}) {
    if (!rows.length) { el.innerHTML = empty(); return; }
    const max = Math.max(...rows.map(r => +r.value), 1);
    el.innerHTML = rows.map(r => `<div class="hb ${cls} ${r.icon ? '' : 'noic'}">${r.icon ? `<span class="ico">${r.icon}</span>` : ''}<span class="nm" title="${E(r.label)}">${E(r.label)}</span><span class="v">${fmt(+r.value)}</span><i><b data-w="${(+r.value / max * 100).toFixed(1)}"></b></i></div>`).join('');
    requestAnimationFrame(() => requestAnimationFrame(() => el.querySelectorAll('i b').forEach(b => { b.style.width = b.dataset.w + '%'; })));
  }

  /** Vertical bars. rows: [{label, value}] */
  function vbars(el, rows, { fmt = x => x, cls = '' } = {}) {
    if (!rows.length) { el.innerHTML = empty(); return; }
    const max = Math.max(...rows.map(r => +r.value), 1);
    el.innerHTML = `<div class="vb ${cls}">${rows.map(r => `<div><em>${fmt(+r.value)}</em><b data-h="${Math.max(+r.value / max * 82, 2).toFixed(1)}"></b><small>${E(r.label)}</small></div>`).join('')}</div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => el.querySelectorAll('.vb b').forEach(b => { b.style.height = b.dataset.h + '%'; })));
  }

  return { line, donut, hbars, vbars, empty };
})();
