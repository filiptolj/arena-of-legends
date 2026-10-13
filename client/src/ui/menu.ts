import { CHAMPIONS, CHAMPION_IDS, LANES, type LaneId, type LobbyState, type ServerMessage, type Team } from '@lol/shared';
import { Connection } from '../net/connection';
import { NetSession } from '../session';
import { showChampionSelect } from './select';

export type MenuResult = { kind: 'local'; champion: string } | { kind: 'online'; session: NetSession };

const NAME_KEY = 'aol.playerName';
const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Private mode etc. — not important.
  }
}

/** Title screen: play offline against bots, or create/join an online room. */
export function showMainMenu(root: HTMLElement): Promise<MenuResult> {
  return new Promise((resolve) => {
    const screen = document.createElement('div');
    screen.className = 'select-screen';
    root.appendChild(screen);

    const renderHome = (error = '') => {
      screen.innerHTML = `
        <h1>Arena of Legends</h1>
        <p class="subtitle">A 3D browser MOBA</p>
        <div class="menu-card panel">
          <button class="big-btn local">⚔ Play vs Bots</button>
          <div class="menu-divider"><span>or play online</span></div>
          <label class="muted small">Your name</label>
          <input class="name" maxlength="16" placeholder="Summoner" value="${escapeHtml(loadName())}" />
          <button class="big-btn create">Create room</button>
          <div class="join-row">
            <input class="code" maxlength="5" placeholder="ROOM CODE" />
            <button class="join">Join</button>
          </div>
          <div class="menu-error">${escapeHtml(error)}</div>
        </div>`;
      const nameInput = screen.querySelector<HTMLInputElement>('.name')!;
      const codeInput = screen.querySelector<HTMLInputElement>('.code')!;
      screen.querySelector('.local')!.addEventListener('click', async () => {
        screen.remove();
        resolve({ kind: 'local', champion: await showChampionSelect(root) });
      });
      const goOnline = async (first: { t: 'create' } | { t: 'join'; code: string }) => {
        const name = nameInput.value.trim();
        saveName(name);
        let conn: Connection;
        try {
          conn = await Connection.open();
        } catch (e) {
          renderHome((e as Error).message);
          return;
        }
        runLobby(conn);
        conn.send(first.t === 'create' ? { t: 'create', name } : { t: 'join', code: first.code, name });
      };
      screen.querySelector('.create')!.addEventListener('click', () => goOnline({ t: 'create' }));
      const join = () => {
        const code = codeInput.value.trim().toUpperCase();
        if (code) goOnline({ t: 'join', code });
      };
      screen.querySelector('.join')!.addEventListener('click', join);
      codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && join());
    };

    const runLobby = (conn: Connection) => {
      let clientId = '';
      let lobby: LobbyState | null = null;
      let error = '';
      screen.innerHTML = '<p class="subtitle">Connecting…</p>';

      const me = () => lobby?.players.find((p) => p.clientId === clientId);
      const pick = (team: Team, lane: LaneId, champion: string) => conn.send({ t: 'pick', team, lane, champion });

      const render = () => {
        if (!lobby) return;
        const mine = me();
        const isHost = lobby.hostId === clientId;
        const slot = (team: Team, lane: LaneId) => {
          const p = lobby!.players.find((x) => x.team === team && x.lane === lane);
          if (!p) return `<button class="slot empty" data-team="${team}" data-lane="${lane}"><span class="muted">Bot</span><small>click to take</small></button>`;
          const def = CHAMPIONS[p.champion];
          return `<div class="slot ${p.clientId === clientId ? 'me' : ''}">
            <span class="slot-icon" style="background:${hex(def.color)}">${def.icon}</span>
            <span><b>${escapeHtml(p.name)}</b>${p.clientId === lobby!.hostId ? ' 👑' : ''}<br><small class="muted">${def.name}</small></span>
          </div>`;
        };
        screen.innerHTML = `
          <h1>Lobby</h1>
          <div class="lobby panel">
            <div class="lobby-head">
              <span>Room code</span><b class="room-code">${lobby.code}</b>
              <button class="copy">Copy</button>
              <span class="muted small">Share it with friends · empty slots are filled by bots</span>
            </div>
            <div class="slots">
              <div class="slot-col blue"><h4>Blue team</h4>${LANES.map((l) => `<div class="lane-label">${l}</div>${slot('blue', l)}`).join('')}</div>
              <div class="slot-col red"><h4>Red team</h4>${LANES.map((l) => `<div class="lane-label">${l}</div>${slot('red', l)}`).join('')}</div>
            </div>
            <h4 class="muted">Your champion</h4>
            <div class="champ-row">${CHAMPION_IDS.map((id) => {
              const d = CHAMPIONS[id];
              return `<button class="champ-pick ${mine?.champion === id ? 'selected' : ''}" data-champ="${id}" title="${d.name} — ${d.role}"><span style="background:${hex(d.color)}">${d.icon}</span>${d.name}</button>`;
            }).join('')}</div>
            <div class="lobby-actions">
              <button class="leave">Leave</button>
              ${isHost ? '<button class="lock-in start">Start match</button>' : '<span class="muted">Waiting for the host to start…</span>'}
            </div>
            <div class="menu-error">${escapeHtml(error)}</div>
          </div>`;

        screen.querySelectorAll<HTMLElement>('.slot.empty').forEach((el) =>
          el.addEventListener('click', () => mine && pick(el.dataset.team as Team, el.dataset.lane as LaneId, mine.champion)),
        );
        screen.querySelectorAll<HTMLElement>('.champ-pick').forEach((el) =>
          el.addEventListener('click', () => mine && pick(mine.team, mine.lane, el.dataset.champ!)),
        );
        screen.querySelector('.copy')!.addEventListener('click', () => navigator.clipboard?.writeText(lobby!.code).catch(() => {}));
        screen.querySelector('.leave')!.addEventListener('click', () => {
          conn.send({ t: 'leave' });
          unsubscribe();
          renderHome();
        });
        screen.querySelector('.start')?.addEventListener('click', () => conn.send({ t: 'start' }));
      };

      const unsubscribe = conn.on((msg: ServerMessage) => {
        switch (msg.t) {
          case 'welcome':
            clientId = msg.clientId;
            break;
          case 'lobby':
            lobby = msg.lobby;
            error = '';
            render();
            break;
          case 'error':
            error = msg.message;
            if (lobby) render();
            else {
              unsubscribe();
              renderHome(msg.message);
            }
            break;
          case 'start': {
            unsubscribe();
            // Subscribe the session before any snapshot arrives.
            const session = new NetSession(conn, msg.entityId, msg.team, msg.tickRate, msg.snapshotEvery);
            screen.remove();
            resolve({ kind: 'online', session });
            break;
          }
          default:
            break;
        }
      });
      conn.onClose(() => {
        if (screen.isConnected) renderHome('Disconnected from the server');
      });
    };

    renderHome();
  });
}
