// Hidden test menu. Open it by typing  t e s t  anywhere on the page, or by adding #test to the URL.
// Esc closes it. It only appears when testing is enabled (mock mode, or the static browser demo).
(function () {
  let panel = null;
  let typed = '';

  // Goes to the server's /api/test, or to the in-browser mock engine on static hosting (see Data in app.js).
  const api = (body) => Data.test(body).catch(() => null);

  const refreshDashboard = () => (typeof load === 'function' ? load().catch(() => {}) : null);

  async function act(body) {
    const data = await api(body);
    if (data) render(data);
    refreshDashboard();
  }

  function button(label, onClick, cls = '') {
    const b = document.createElement('button');
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener('click', onClick);
    return b;
  }

  function render(data) {
    panel.replaceChildren();

    const head = document.createElement('div');
    head.className = 'tm-head';
    head.innerHTML = '<b>Test controls</b><span>mock data only</span>';
    head.append(button('×', close, 'tm-close'));
    panel.append(head);

    const row = document.createElement('div');
    row.className = 'tm-row';
    row.append(
      button('Run check now', () => act({ action: 'runNow' })),
      button('All down', () => act({ action: 'all', mode: 'down' }), 'tm-danger'),
      button('All up', () => act({ action: 'all', mode: 'up' })),
      button('Clear overrides', () => act({ action: 'all', mode: 'auto' })),
    );
    panel.append(row);

    const row2 = document.createElement('div');
    row2.className = 'tm-row';
    row2.append(
      button('Reseed 24 h history', () => act({ action: 'reseed' })),
      button('Wipe history', () => { if (confirmWipe()) act({ action: 'reset' }); }),
    );
    panel.append(row2);

    const hours = document.createElement('label');
    hours.className = 'tm-check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = data.ignoreHours;
    box.addEventListener('change', () => act({ action: 'ignoreHours', value: box.checked }));
    hours.append(box, ' Ignore office hours (treat every VAC as open)');
    panel.append(hours);

    const list = document.createElement('div');
    list.className = 'tm-list';
    for (const v of data.vacs) {
      const item = document.createElement('div');
      item.className = 'tm-vac';
      const name = document.createElement('span');
      name.textContent = `${v.name}, ${v.country}`;
      const select = document.createElement('select');
      for (const [value, text] of [['auto', 'Normal'], ['up', 'Force up'], ['down', 'Force down']]) {
        const opt = document.createElement('option');
        opt.value = value; opt.textContent = text;
        if ((data.overrides[v.id] || 'auto') === value) opt.selected = true;
        select.append(opt);
      }
      select.addEventListener('change', () => act({ action: 'set', id: v.id, mode: select.value }));
      item.append(name, select);
      list.append(item);
    }
    panel.append(list);

    const hint = document.createElement('p');
    hint.className = 'tm-hint';
    hint.textContent = 'Forced results apply from the next check. A VAC turns DOWN after 3 failed checks in a row, so press "Run check now" 3 times to see it straight away.';
    panel.append(hint);
  }

  // Inline confirm without browser dialogs: second click within 3 s confirms.
  let wipeArmed = 0;
  function confirmWipe() {
    if (Date.now() - wipeArmed < 3000) { wipeArmed = 0; return true; }
    wipeArmed = Date.now();
    const meta = document.getElementById('meta');
    if (meta) meta.textContent = 'Click "Wipe history" again within 3 seconds to confirm.';
    return false;
  }

  async function open() {
    if (panel) return;
    const data = await api().catch(() => null);
    if (!data || !data.enabled) return; // stays hidden in live mode
    panel = document.createElement('aside');
    panel.id = 'test-menu';
    document.body.append(panel);
    render(data);
  }

  function close() {
    if (panel) panel.remove();
    panel = null;
    if (location.hash === '#test') history.replaceState(null, '', location.pathname + location.search);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return close();
    if (e.target.closest('input, select, textarea')) return;
    typed = (typed + e.key.toLowerCase()).slice(-4);
    if (typed === 'test') { typed = ''; open(); }
  });
  if (location.hash === '#test') open();
  window.addEventListener('hashchange', () => { if (location.hash === '#test') open(); });
})();
