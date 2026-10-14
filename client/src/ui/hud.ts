import {
  type AbilitySlot,
  CHAMPIONS,
  type Entity,
  type GameEvent,
  RECALL_TIME,
  type Team,
  type World,
  ITEMS,
  abilityCooldown,
  abilityDamage,
  attackSpeedOf,
  castBlocker,
  moveSpeedOf,
  shieldOf,
  xpToNext,
} from '@lol/shared';
import { statLines } from './shop';
const KEYS = ['Q', 'W', 'E', 'R'];

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html !== undefined) el.innerHTML = html;
  return el;
};

const fmtTime = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

interface AbilityEl {
  root: HTMLDivElement;
  cd: HTMLDivElement;
  cdText: HTMLDivElement;
}

/** Screen-space HUD: champion panel, scoreboard, kill feed, announcements and overlays. */
export class Hud {
  private readonly blueKills = h('span', 'blue', '0');
  private readonly redKills = h('span', 'red', '0');
  private readonly clock = h('span', 'time', '0:00');
  private readonly gold = h('div', 'gold-display panel');
  private readonly killfeed = h('div', 'killfeed');
  private readonly levelEl = h('div', 'level');
  private readonly xpRing: SVGCircleElement;
  private readonly stats = h('div', 'stats');
  private readonly abilities: AbilityEl[] = [];
  private readonly hpFill = h('div', 'fill');
  private readonly hpText = h('span');
  private readonly manaFill = h('div', 'fill');
  private readonly manaText = h('span');
  private readonly tooltip = h('div', 'tooltip panel');
  private readonly channel = h('div', 'channel panel');
  private readonly channelFill = h('div', 'fill');
  private readonly death = h('div', 'death-overlay');
  private readonly deathText = h('div');
  private readonly gameOver = h('div', 'game-over');
  private readonly help = h('div', 'help panel');
  private readonly fps = h('div', 'fps');
  private readonly inventory: { root: HTMLDivElement; icon: HTMLSpanElement; cd: HTMLDivElement }[] = [];
  private readonly buffs = h('div', 'buffs');
  private hoveredSlot: AbilitySlot | null = null;
  private hoveredItem: number | null = null;
  private fpsAcc = 0;
  private fpsFrames = 0;
  onRestart: () => void = () => {};

  /** Called when the player clicks the gold display or inventory. */
  onOpenShop: () => void = () => {};

  constructor(
    private readonly root: HTMLElement,
    world: World,
    private readonly playerId: number,
    private readonly playerTeam: Team,
  ) {
    const def = CHAMPIONS[world.get(playerId)!.champion!.defId];
    const score = h('div', 'scoreboard panel');
    score.append(this.blueKills, h('span', undefined, '⚔'), this.clock, h('span', undefined, '⚔'), this.redKills);

    // Champion panel.
    const panel = h('div', 'champ-panel panel');
    const portrait = h('div', 'portrait', def.icon);
    portrait.style.background = `radial-gradient(circle at 40% 35%, #${def.color.toString(16).padStart(6, '0')}, #0b0f1a 75%)`;
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    this.xpRing = document.createElementNS(svgNs, 'circle');
    this.xpRing.setAttribute('cx', '50');
    this.xpRing.setAttribute('cy', '50');
    this.xpRing.setAttribute('r', '47');
    this.xpRing.setAttribute('fill', 'none');
    this.xpRing.setAttribute('stroke', '#b18cff');
    this.xpRing.setAttribute('stroke-width', '4');
    this.xpRing.setAttribute('stroke-dasharray', `${2 * Math.PI * 47}`);
    svg.appendChild(this.xpRing);
    portrait.append(svg, this.levelEl);

    const center = h('div', 'center-col');
    const abilityRow = h('div', 'abilities');
    for (let i = 0; i < 4; i++) {
      const root = h('div', 'ability');
      const a = def.abilities[i];
      const tint = `#${a.color.toString(16).padStart(6, '0')}`;
      root.style.background = `radial-gradient(circle at 50% 40%, ${tint}55, #10141f 80%)`;
      root.style.borderColor = `${tint}aa`;
      const cd = h('div', 'cd');
      const cdText = h('div', 'cd-text');
      root.append(a.icon, cd, cdText, h('span', 'key', KEYS[i]), h('span', 'cost', String(a.manaCost)));
      root.addEventListener('mouseenter', () => (this.hoveredSlot = i as AbilitySlot));
      root.addEventListener('mouseleave', () => (this.hoveredSlot = null));
      abilityRow.appendChild(root);
      this.abilities.push({ root, cd, cdText });
    }
    const recall = h('div', 'ability small', '🏠');
    recall.style.background = '#1d3340';
    recall.title = 'Recall (B)';
    recall.appendChild(h('span', 'key', 'B'));
    abilityRow.appendChild(recall);

    const bars = h('div', 'bars');
    const hp = h('div', 'bar hp');
    hp.append(this.hpFill, this.hpText);
    const mana = h('div', 'bar mana');
    mana.append(this.manaFill, this.manaText);
    bars.append(hp, mana);
    center.append(abilityRow, bars);

    const inv = h('div', 'inventory');
    for (let i = 0; i < 6; i++) {
      const slot = h('div', 'inv-slot');
      const icon = h('span');
      const cd = h('div', 'cd');
      slot.append(icon, cd, h('span', 'key', String(i + 1)));
      slot.addEventListener('mouseenter', () => (this.hoveredItem = i));
      slot.addEventListener('mouseleave', () => (this.hoveredItem = null));
      slot.addEventListener('click', () => this.onOpenShop());
      inv.appendChild(slot);
      this.inventory.push({ root: slot, icon, cd });
    }
    panel.append(portrait, this.stats, center, inv);
    this.gold.addEventListener('click', () => this.onOpenShop());
    this.gold.title = 'Open shop (P)';

    this.channel.append(h('div', undefined, 'Recalling…'), (() => {
      const b = h('div', 'bar');
      b.appendChild(this.channelFill);
      return b;
    })());

    this.death.appendChild(this.deathText);

    this.help.innerHTML = `
      <h2>Arena of Legends</h2>
      <p>Destroy the enemy Nexus. Push lanes with your minions, take down towers, and outplay the enemy bots.</p>
      <table>
        <tr><td>Right click</td><td>Move / attack target</td></tr>
        <tr><td>A + Left click</td><td>Attack-move</td></tr>
        <tr><td>Q W E R</td><td>Cast at cursor (R unlocks at level 6)</td></tr>
        <tr><td>S</td><td>Stop</td></tr>
        <tr><td>B</td><td>Recall to base</td></tr>
        <tr><td>P</td><td>Open shop (buy in base or while dead)</td></tr>
        <tr><td>1 – 6</td><td>Use item actives (e.g. Ward Totem)</td></tr>
        <tr><td>Y / Space</td><td>Toggle camera lock / center camera</td></tr>
        <tr><td>Mouse wheel</td><td>Zoom</td></tr>
        <tr><td>Minimap</td><td>Left: move camera · Right: move champion</td></tr>
        <tr><td>H</td><td>Show this help</td></tr>
      </table>`;
    const close = h('button', undefined, 'Close');
    close.addEventListener('click', () => (this.help.style.display = 'none'));
    this.help.appendChild(close);
    this.help.style.display = 'none';

    root.append(score, this.gold, this.killfeed, this.buffs, panel, this.tooltip, this.channel, this.death, this.gameOver, this.fps, this.help);
  }

  toggleHelp(): void {
    this.help.style.display = this.help.style.display === 'none' ? '' : 'none';
  }

  get helpVisible(): boolean {
    return this.help.style.display !== 'none';
  }

  announce(text: string, bad = false): void {
    this.root.querySelectorAll('.announcement').forEach((el) => el.remove());
    const el = h('div', `announcement${bad ? ' bad' : ''}`, text);
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  private feed(html: string): void {
    const item = h('div', 'killfeed-item panel', html);
    this.killfeed.prepend(item);
    setTimeout(() => item.remove(), 6000);
    while (this.killfeed.children.length > 5) this.killfeed.lastChild?.remove();
  }

  private nameOf(e: Entity | undefined): string {
    if (!e) return 'Unknown';
    if (e.id === this.playerId) return `<span class="${e.team}">You</span>`;
    if (e.champion) return `<span class="${e.team}">${e.champion.name}</span>`;
    const label = e.kind === 'minion' ? 'Minions' : e.kind === 'tower' ? 'Tower' : e.kind === 'inhibitor' ? 'Inhibitor' : 'Nexus';
    return `<span class="${e.team}">${label}</span>`;
  }

  handleEvent(ev: GameEvent, world: World): void {
    switch (ev.type) {
      case 'championKill': {
        const killer = world.get(ev.killerId);
        const victim = world.get(ev.victimId);
        this.feed(`${this.nameOf(killer)} ⚔ ${this.nameOf(victim)}`);
        if (ev.victimId === this.playerId) this.announce('You have been slain', true);
        else if (ev.killerId === this.playerId) this.announce('You have slain an enemy');
        else if (victim?.team === this.playerTeam) this.announce('An ally has been slain', true);
        else this.announce('An enemy has been slain');
        break;
      }
      case 'structureDestroyed':
        if (ev.kind === 'tower' || ev.kind === 'inhibitor') {
          const ours = ev.team === this.playerTeam;
          const what = ev.kind === 'tower' ? 'tower' : 'inhibitor';
          this.announce(ours ? `Your ${what} has been destroyed` : `Enemy ${what} destroyed`, ours);
        }
        break;
      case 'inhibitorRespawned': {
        const ours = ev.team === this.playerTeam;
        this.announce(ours ? 'Your inhibitor is respawning' : 'Enemy inhibitor is respawning', !ours);
        break;
      }
      case 'waveSpawned':
        if (world.time < 10) this.announce('Minions have spawned!');
        break;
      case 'monsterSlain':
        if (ev.epic) {
          const ours = ev.team === this.playerTeam;
          this.announce(ours ? 'Your team slew the Ember Drake!' : 'The enemy team slew the Ember Drake', !ours);
        }
        break;
      case 'blessingGained':
        if (ev.id === this.playerId) {
          this.announce(ev.blessing === 'crimson' ? 'Crimson Blessing: attacks burn' : 'Azure Blessing: faster cooldowns');
        }
        break;
      case 'levelUp':
        if (ev.id === this.playerId && ev.level === 6) {
          const ult = CHAMPIONS[world.get(ev.id)!.champion!.defId].abilities[3];
          this.announce(`${ult.name} unlocked! (R)`);
        }
        break;
      case 'gameOver': {
        const won = ev.winner === this.playerTeam;
        this.gameOver.innerHTML = '';
        const title = h('h1', won ? 'victory' : 'defeat', won ? 'VICTORY' : 'DEFEAT');
        const btn = h('button', undefined, 'Play again');
        btn.addEventListener('click', () => this.onRestart());
        this.gameOver.append(title, btn);
        this.gameOver.style.display = 'flex';
        break;
      }
      default:
        break;
    }
  }

  update(world: World, dt: number): void {
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps.textContent = `${Math.round(this.fpsFrames / this.fpsAcc)} fps`;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }

    let blue = 0;
    let red = 0;
    for (const c of world.champions()) {
      if (c.team === 'blue') blue += c.champion!.kills;
      else red += c.champion!.kills;
    }
    this.blueKills.textContent = String(blue);
    this.redKills.textContent = String(red);
    this.clock.textContent = fmtTime(world.time);

    const me = world.get(this.playerId);
    if (!me?.champion) return;
    const c = me.champion;
    const def = CHAMPIONS[c.defId];

    this.gold.textContent = `💰 ${Math.floor(c.gold)}`;
    this.levelEl.textContent = String(c.level);
    const xpFrac = c.level >= 18 ? 1 : c.xp / xpToNext(c.level);
    const circ = 2 * Math.PI * 47;
    this.xpRing.setAttribute('stroke-dashoffset', String(circ * (1 - xpFrac)));

    this.stats.innerHTML = `
      <span>⚔ AD</span><b>${Math.round(me.attackDamage)}</b>
      <span>🔮 AP</span><b>${Math.round(me.abilityPower)}</b>
      <span>⚡ AS</span><b>${attackSpeedOf(me).toFixed(2)}</b>
      <span>🛡 Armor</span><b>${Math.round(me.armor)}</b>
      <span>✨ MR</span><b>${Math.round(me.magicResist)}</b>
      <span>👟 MS</span><b>${moveSpeedOf(me).toFixed(1)}</b>
      <span>⏳ CDR</span><b>${Math.round(me.cooldownReduction * 100)}%</b>
      <span>☠ K/D</span><b>${c.kills}/${c.deaths}</b>`;

    c.items.forEach((id, i) => {
      const el = this.inventory[i];
      const icon = id ? ITEMS[id].icon : '';
      if (el.icon.textContent !== icon) el.icon.textContent = icon;
      const active = id ? ITEMS[id].active : undefined;
      el.root.classList.toggle('has-active', !!active);
      const cd = id && active ? (c.itemCooldowns[id] ?? 0) / active.cooldown : 0;
      el.cd.style.setProperty('--p', `${Math.max(0, cd) * 100}%`);
    });

    // Timed buffs: jungle blessings.
    const buffHtml = me.statuses
      .filter((st) => st.type === 'blessing')
      .map((st) => {
        const crimson = st.type === 'blessing' && st.blessing === 'crimson';
        return `<div class="buff" style="border-color:${crimson ? '#ff4b4b' : '#3bb8ff'}" title="${crimson ? 'Crimson Blessing: attacks burn and slow' : 'Azure Blessing: +15% CDR, +4 mana/s'}">${crimson ? '🔥' : '💠'}<span>${Math.ceil(st.remaining)}</span></div>`;
      })
      .join('');
    if (this.buffs.innerHTML !== buffHtml) this.buffs.innerHTML = buffHtml;

    def.abilities.forEach((a, i) => {
      const el = this.abilities[i];
      const st = c.abilities[i];
      const blocker = castBlocker(me, i as AbilitySlot);
      el.root.classList.toggle('locked', blocker === 'level');
      el.root.classList.toggle('no-mana', blocker === 'mana');
      el.root.classList.toggle('ready', blocker === null);
      const frac = st.cooldown > 0 ? Math.min(1, st.cooldown / abilityCooldown(a, me)) : 0;
      el.cd.style.setProperty('--p', `${frac * 100}%`);
      el.cdText.textContent = st.cooldown > 0 ? (st.cooldown < 1 ? st.cooldown.toFixed(1) : String(Math.ceil(st.cooldown))) : '';
    });

    this.hpFill.style.width = `${(me.hp / me.maxHp) * 100}%`;
    const shield = shieldOf(me);
    this.hpText.textContent = `${Math.ceil(me.hp)}${shield > 0 ? ` (+${Math.round(shield)} shield)` : ''} / ${Math.round(me.maxHp)}  (+${me.hpRegen.toFixed(1)})`;
    this.manaFill.style.width = `${(me.mana / me.maxMana) * 100}%`;
    this.manaText.textContent = `${Math.floor(me.mana)} / ${Math.round(me.maxMana)}`;

    if (this.hoveredSlot !== null) {
      const a = def.abilities[this.hoveredSlot];
      const dmg = abilityDamage(a, me);
      const scaling = a.damage
        ? [
            a.damage.ad && `${Math.round(a.damage.ad * 100)}% AD`,
            a.damage.ap && `${Math.round(a.damage.ap * 100)}% AP`,
            a.damage.missingHp && `${Math.round(a.damage.missingHp * 100)}% of target's missing health`,
          ]
            .filter(Boolean)
            .join(' + ')
        : '';
      const verb = a.effect.type === 'heal' ? 'Heals' : 'Damage';
      this.tooltip.innerHTML = `
        <h4>${a.name} <small>[${KEYS[this.hoveredSlot]}]</small></h4>
        <div>${a.description}</div>
        <div class="meta">${dmg ? `${verb}: ${Math.round(dmg)}${a.effect.type === 'heal' ? '' : ` ${a.damage!.kind}`}${scaling ? ` (+${scaling})` : ''}<br>` : ''}Cooldown: ${abilityCooldown(a, me).toFixed(1)}s · Mana: ${a.manaCost}${a.range ? ` · Range: ${a.range}` : ''}${a.requiredLevel > 1 ? ` · Unlocks at level ${a.requiredLevel}` : ''}</div>`;
      this.tooltip.style.display = 'block';
    } else if (this.hoveredItem !== null && c.items[this.hoveredItem]) {
      const item = ITEMS[c.items[this.hoveredItem]!];
      const a = item.active;
      const activeHtml = a ? `<div style="margin-top:6px"><b>Active – ${a.name}</b> [${this.hoveredItem + 1}]<br>${a.description}<div class="meta">Cooldown: ${a.cooldown}s</div></div>` : '';
      this.tooltip.innerHTML = `<h4>${item.icon} ${item.name}</h4><div>${statLines(item.stats).join('<br>')}</div>${activeHtml}<div class="meta">Click to open the shop</div>`;
      this.tooltip.style.display = 'block';
    } else {
      this.tooltip.style.display = 'none';
    }

    if (c.recallTimer > 0 && !me.dead) {
      this.channel.style.display = 'block';
      this.channelFill.style.width = `${(1 - c.recallTimer / RECALL_TIME) * 100}%`;
    } else {
      this.channel.style.display = 'none';
    }

    this.death.style.display = me.dead ? 'flex' : 'none';
    if (me.dead) this.deathText.textContent = `Respawning in ${Math.ceil(c.respawnTimer)}…`;
  }
}
