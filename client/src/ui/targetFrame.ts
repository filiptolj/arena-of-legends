import {
  CHAMPIONS,
  type Entity,
  type EntityId,
  ITEMS,
  MONSTERS,
  type MonsterType,
  type World,
  attackSpeedOf,
  isInvulnerable,
  moveSpeedOf,
  shieldOf,
} from '@lol/shared';

const TOWER_NAMES = ['', 'Outer Turret', 'Inner Turret', 'Inhibitor Turret', 'Nexus Turret'];

/** Display name and icon for any unit. */
export function describeUnit(e: Entity): { name: string; subtitle: string; icon: string } {
  const team = e.team === 'blue' ? 'Blue' : e.team === 'red' ? 'Red' : 'Neutral';
  switch (e.kind) {
    case 'champion': {
      const def = CHAMPIONS[e.champion!.defId];
      return { name: e.champion!.name, subtitle: `${def.name} · ${def.role}`, icon: def.icon };
    }
    case 'minion': {
      const type = e.minion!.type;
      return { name: `${team} ${type[0].toUpperCase()}${type.slice(1)} Minion`, subtitle: 'Minion', icon: type === 'caster' ? '🧙' : type === 'super' ? '💪' : '💀' };
    }
    case 'monster':
      return { name: MONSTERS[e.monster!.type as MonsterType].name, subtitle: 'Jungle monster', icon: '🐺' };
    case 'tower':
      return { name: `${team} ${TOWER_NAMES[e.structure?.tier ?? 1]}`, subtitle: e.structure?.lane ? `${e.structure.lane} lane` : 'Base', icon: '🗼' };
    case 'inhibitor':
      return { name: `${team} Inhibitor`, subtitle: `${e.structure?.lane} lane`, icon: '💠' };
    case 'nexus':
      return { name: `${team} Nexus`, subtitle: 'Destroy it to win', icon: '🔷' };
    case 'ward':
      return { name: `${team} Ward`, subtitle: 'Reveals the area', icon: '🏮' };
  }
}

/** Panel showing health, mana and stats of the unit you left-clicked. */
export class TargetFrame {
  private readonly el = document.createElement('div');
  private selected: EntityId | null = null;
  private lastHtml = '';

  constructor(root: HTMLElement) {
    this.el.className = 'target-frame panel';
    this.el.style.display = 'none';
    root.appendChild(this.el);
  }

  get selectedId(): EntityId | null {
    return this.selected;
  }

  select(id: EntityId | null): void {
    this.selected = id;
  }

  update(world: World, visible: Set<EntityId>): void {
    const e = world.get(this.selected);
    // Lose the selection when the unit dies or disappears into the fog.
    if (!e || (e.dead && e.kind !== 'champion') || !visible.has(e.id)) {
      if (this.selected !== null && (!e || e.kind !== 'champion')) this.selected = null;
      this.el.style.display = 'none';
      return;
    }
    const info = describeUnit(e);
    const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`;
    const shield = shieldOf(e);
    const c = e.champion;
    const stats: [string, string][] = [
      ['⚔ AD', Math.round(e.attackDamage).toString()],
      ...(c ? ([['🔮 AP', Math.round(e.abilityPower).toString()]] as [string, string][]) : []),
      ['⚡ AS', e.attackSpeed > 0 ? attackSpeedOf(e).toFixed(2) : '–'],
      ['🛡 Armor', Math.round(e.armor).toString()],
      ['✨ MR', Math.round(e.magicResist).toString()],
      ['👟 MS', e.moveSpeed > 0 ? moveSpeedOf(e).toFixed(1) : '–'],
      ['🎯 Range', e.attackRange > 0 ? e.attackRange.toFixed(1) : '–'],
    ];
    const items = c
      ? `<div class="tf-items">${c.items
          .map((id, i) => `<span class="tf-item">${id ? ITEMS[id].icon : ''}${c.itemCharges[i] > 1 ? `<small>${c.itemCharges[i]}</small>` : ''}</span>`)
          .join('')}</div>`
      : '';
    const html = `
      <div class="tf-head">
        <div class="tf-icon ${e.team}">${info.icon}${c ? `<span class="tf-level">${c.level}</span>` : ''}</div>
        <div><b>${info.name}</b><div class="muted small">${info.subtitle}${isInvulnerable(world, e) ? ' · invulnerable' : ''}${e.dead ? ' · dead' : ''}</div></div>
      </div>
      <div class="bar hp ${e.team === 'neutral' ? 'neutral' : ''}"><div class="fill" style="width:${pct(e.hp, e.maxHp)}"></div>
        <span>${Math.ceil(Math.max(0, e.hp))}${shield > 0 ? ` (+${Math.round(shield)})` : ''} / ${Math.round(e.maxHp)}</span></div>
      ${e.maxMana > 0 ? `<div class="bar mana"><div class="fill" style="width:${pct(e.mana, e.maxMana)}"></div><span>${Math.floor(e.mana)} / ${Math.round(e.maxMana)}</span></div>` : ''}
      <div class="tf-stats">${stats.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')}</div>
      ${c ? `<div class="muted small">K/D/A ${c.kills}/${c.deaths}/${c.assists} · CS ${c.cs}</div>` : ''}
      ${items}`;
    if (html !== this.lastHtml) {
      this.el.innerHTML = html;
      this.lastHtml = html;
    }
    this.el.style.display = 'block';
  }
}
