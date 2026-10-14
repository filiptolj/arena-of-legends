import { CHAMPIONS, type Entity, ITEMS, type Team, type World } from '@lol/shared';

/** Hold Tab: both teams' K/D/A, CS, level and items, plus team totals. */
export class Scoreboard {
  private readonly el = document.createElement('div');
  private visible = false;
  private lastHtml = '';

  constructor(
    root: HTMLElement,
    private readonly playerId: number,
  ) {
    this.el.className = 'scoreboard-overlay panel';
    this.el.style.display = 'none';
    root.appendChild(this.el);
  }

  show(on: boolean): void {
    this.visible = on;
    this.el.style.display = on ? 'block' : 'none';
    this.lastHtml = '';
  }

  private row(e: Entity): string {
    const c = e.champion!;
    const def = CHAMPIONS[c.defId];
    const items = c.items
      .map((id, i) => `<span class="sb-item">${id ? ITEMS[id].icon : ''}${c.itemCharges[i] > 1 ? `<small>${c.itemCharges[i]}</small>` : ''}</span>`)
      .join('');
    const status = e.dead ? `<span class="sb-dead">💀 ${Math.ceil(c.respawnTimer)}</span>` : '';
    return `<tr class="${e.id === this.playerId ? 'me' : ''}">
      <td><div class="sb-champ"><span class="sb-icon">${def.icon}<span class="sb-level">${c.level}</span></span>
        <span><b>${c.name}</b><br><small class="muted">${def.name}</small></span>${status}</div></td>
      <td class="sb-items">${items}</td>
      <td class="sb-kda">${c.kills} / ${c.deaths} / ${c.assists}</td>
      <td class="sb-cs">${c.cs}</td>
    </tr>`;
  }

  private teamBlock(world: World, team: Team): string {
    const champs = world.champions().filter((c) => c.team === team);
    const kills = champs.reduce((n, c) => n + c.champion!.kills, 0);
    // Towers start at 11 per team; the other team destroyed the missing ones.
    const enemyTowersLeft = [...world.entities.values()].filter((e) => e.kind === 'tower' && e.team !== team && !e.dead).length;
    const towers = 11 - enemyTowersLeft;
    return `<div class="sb-team ${team}">
      <div class="sb-team-head"><b>${team === 'blue' ? 'Blue' : 'Red'} team</b><span>⚔ ${kills}</span><span>🗼 ${towers}</span></div>
      <table><thead><tr><th>Champion</th><th>Items</th><th>K / D / A</th><th>CS</th></tr></thead>
      <tbody>${champs.map((c) => this.row(c)).join('')}</tbody></table></div>`;
  }

  update(world: World): void {
    if (!this.visible) return;
    const html = this.teamBlock(world, 'blue') + this.teamBlock(world, 'red');
    if (html !== this.lastHtml) {
      this.el.innerHTML = html;
      this.lastHtml = html;
    }
  }
}
