// Staff/admin dashboard at /admin. PIN-protected by the server (x-admin-pin header).
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import './admin.css';
import { esc } from '../ui.ts';

interface Overview {
  llmOk: boolean;
  model: string;
  stats: {
    players: number; attempts: number; wins: number; winRate: number; prizesClaimed: number; prizesRemaining: number;
    avgLatencyMs: number; totalPlayers: number;
  };
  settings: Record<string, number>;
  recent: {
    id: string; started_at: string; status: string; end_reason: string | null; trust: number; turns: number; active_ms: number;
    prize_claimed_at: string | null; first_name: string; last_name: string; email: string;
  }[];
}

const SETTINGS: { key: string; label: string; step: number; hint: string }[] = [
  { key: 'prizesPerDay', label: 'Prizes per day', step: 1, hint: 'Counted when staff confirm a hand-over' },
  { key: 'difficulty', label: 'Difficulty multiplier', step: 0.1, hint: '0.7 = harder · 1.0 = base · 1.3 = easier (positive trust only)' },
  { key: 'maxTurns', label: 'Messages per attempt', step: 1, hint: '' },
  { key: 'timeLimitS', label: 'Time limit (seconds)', step: 10, hint: 'Paused while the monster is thinking' },
  { key: 'minTurnsToWin', label: 'Minimum turns to win', step: 1, hint: '' },
  { key: 'volume', label: 'Volume', step: 0.1, hint: '0 – 1, applied on the attract screen' },
];

const app = document.getElementById('app')!;
let pin = sessionStorage.getItem('adminPin') ?? '';

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'x-admin-pin': pin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    sessionStorage.removeItem('adminPin');
    pin = '';
    login('Wrong PIN');
    throw new Error('unauthorized');
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

function login(error = '') {
  app.innerHTML = `
    <form class="login card" id="login">
      <h1>Gulyabani Admin</h1>
      <input id="pin" type="password" inputmode="numeric" placeholder="Admin PIN" autofocus />
      <p class="err">${esc(error)}</p>
      <button class="primary">Enter</button>
    </form>`;
  document.getElementById('login')!.addEventListener('submit', (e) => {
    e.preventDefault();
    pin = (document.getElementById('pin') as HTMLInputElement).value;
    sessionStorage.setItem('adminPin', pin);
    void dashboard();
  });
}

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
const fmtMs = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`;

let refreshTimer = 0;

async function dashboard() {
  const o = await call<Overview>('GET', '/api/admin/overview');
  const s = o.stats;
  app.innerHTML = `
    <header class="top">
      <h1>Gulyabani Admin</h1>
      <span class="llm ${o.llmOk ? 'ok' : 'down'}">● LLM ${o.llmOk ? 'online' : 'OFFLINE'} <small>${esc(o.model)}</small></span>
      <button class="ghost" id="logout">Lock</button>
    </header>
    <section class="cards">
      ${card('Players today', s.players)}
      ${card('Attempts', s.attempts)}
      ${card('Wins', `${s.wins} <small>(${Math.round(s.winRate * 100)}%)</small>`)}
      ${card('Prizes given', `${s.prizesClaimed} <small>/ ${o.settings.prizesPerDay}</small>`)}
      ${card('Prizes left', s.prizesRemaining)}
      ${card('Avg LLM latency', `${(s.avgLatencyMs / 1000).toFixed(1)}s`)}
      ${card('All players', s.totalPlayers)}
    </section>
    <div class="grid">
      <section class="card">
        <h2>Settings</h2>
        <form id="settings" class="settings">
          ${SETTINGS.map(
            (f) => `<label><span>${f.label}</span><input name="${f.key}" type="number" step="${f.step}" value="${o.settings[f.key]}" />
              ${f.hint ? `<small>${f.hint}</small>` : ''}</label>`,
          ).join('')}
          <button class="primary">Save</button><span class="msg" id="settings-msg"></span>
        </form>
      </section>
      <section class="card">
        <h2>Test the monster</h2>
        <form id="test" class="test">
          <input name="text" maxlength="200" placeholder="Type a player message…" />
          <div class="inline">
            <label>trust <input name="trust" type="number" value="40" min="0" max="99" /></label>
            <label>turn <input name="turn" type="number" value="4" min="1" max="30" /></label>
            <select name="lang"><option value="tr">TR</option><option value="en">EN</option></select>
            <button class="primary">Ask</button>
          </div>
        </form>
        <pre id="test-out"></pre>
        <h2>Data</h2>
        <div class="inline">
          <button class="ghost" data-export="all">Export all players (CSV)</button>
        </div>
        <form id="delete" class="inline">
          <input name="email" type="email" placeholder="player@email.com" />
          <button class="danger">Delete player</button>
        </form>
        <p class="msg" id="data-msg"></p>
      </section>
    </div>
    <section class="card">
      <h2>Recent attempts</h2>
      <table>
        <thead><tr><th>Time</th><th>Player</th><th>Email</th><th>Status</th><th>Trust</th><th>Msgs</th><th>Play time</th><th>Prize</th></tr></thead>
        <tbody>
          ${o.recent
            .map(
              (r) => `<tr data-id="${esc(r.id)}">
                <td>${fmtTime(r.started_at)}</td><td>${esc(`${r.first_name} ${r.last_name}`)}</td><td>${esc(r.email)}</td>
                <td><span class="tag ${r.status}">${r.status}${r.end_reason && r.status !== 'won' ? ` · ${r.end_reason}` : ''}</span></td>
                <td>${r.trust}</td><td>${r.turns}</td><td>${fmtMs(r.active_ms)}</td><td>${r.prize_claimed_at ? '🎁 ' + fmtTime(r.prize_claimed_at) : ''}</td>
              </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </section>
    <dialog id="dlg"><div id="dlg-body"></div><form method="dialog"><button class="primary">Close</button></form></dialog>`;

  document.getElementById('logout')!.addEventListener('click', () => {
    sessionStorage.removeItem('adminPin');
    pin = '';
    window.clearInterval(refreshTimer);
    login();
  });

  document.getElementById('settings')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const patch = Object.fromEntries(SETTINGS.map((f) => [f.key, Number(fd.get(f.key))]));
    const msg = document.getElementById('settings-msg')!;
    try {
      await call('PUT', '/api/admin/settings', patch);
      msg.textContent = 'Saved ✓';
    } catch (err) {
      msg.textContent = (err as Error).message;
    }
  });

  document.getElementById('test')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const out = document.getElementById('test-out')!;
    out.textContent = '…';
    const res = await call('POST', '/api/admin/test-chat', {
      text: fd.get('text'), trust: Number(fd.get('trust')), turn: Number(fd.get('turn')), lang: fd.get('lang'),
    });
    out.textContent = JSON.stringify(res, null, 2);
  });

  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-export]')) {
    b.addEventListener('click', async () => {
      const res = await fetch(`/api/admin/export.csv?scope=${b.dataset.export}`, { headers: { 'x-admin-pin': pin } });
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'export.csv';
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  document.getElementById('delete')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = String(new FormData(e.target as HTMLFormElement).get('email') ?? '').trim();
    if (!email || !confirm(`Permanently delete all data for ${email}?`)) return;
    const res = await call<{ deleted: boolean }>('DELETE', `/api/admin/players?email=${encodeURIComponent(email)}`);
    document.getElementById('data-msg')!.textContent = res.deleted ? `Deleted ${email}` : `No player with ${email}`;
  });

  for (const row of document.querySelectorAll<HTMLTableRowElement>('tbody tr')) {
    row.addEventListener('click', async () => {
      const msgs = await call<{ turn: number; player_text: string; monster_reply: string; mood: string; category: string | null; quality: number | null; applied_delta: number; flags: string | null; latency_ms: number | null }[]>(
        'GET', `/api/admin/attempts/${row.dataset.id}/messages`,
      );
      document.getElementById('dlg-body')!.innerHTML = msgs.length
        ? msgs
            .map(
              (m) => `<div class="turn"><b>#${m.turn}</b> <span class="d ${m.applied_delta > 0 ? 'up' : m.applied_delta < 0 ? 'down' : ''}">${m.applied_delta > 0 ? '+' : ''}${m.applied_delta}</span>
                <small>${esc(m.category ?? '')}${m.quality ? '/' + m.quality : ''} · ${esc(m.mood ?? '')}${m.flags ? ' · ⚑ ' + esc(m.flags) : ''}${m.latency_ms ? ` · ${(m.latency_ms / 1000).toFixed(1)}s` : ''}</small>
                <p class="p">🧑 ${esc(m.player_text)}</p><p class="m">👹 ${esc(m.monster_reply)}</p></div>`,
            )
            .join('')
        : '<p>No messages.</p>';
      (document.getElementById('dlg') as HTMLDialogElement).showModal();
    });
  }

  window.clearInterval(refreshTimer);
  // Refresh while idle; skip if the admin is typing or a dialog is open.
  refreshTimer = window.setInterval(() => {
    const busy = document.activeElement?.matches('input, select') || (document.getElementById('dlg') as HTMLDialogElement | null)?.open;
    if (!busy) void dashboard().catch(() => {});
  }, 15_000);
}

const card = (label: string, value: string | number) => `<div class="card stat"><small>${label}</small><b>${value}</b></div>`;

if (pin) void dashboard().catch(() => {});
else login();
