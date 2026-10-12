import { CHAMPIONS, CHAMPION_IDS, abilityDamage } from '@lol/shared';

const KEYS = ['Q', 'W', 'E', 'R'];
const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** Champion select screen. Resolves with the chosen champion id. */
export function showChampionSelect(root: HTMLElement): Promise<string> {
  return new Promise((resolve) => {
    const screen = document.createElement('div');
    screen.className = 'select-screen';
    screen.innerHTML = `
      <h1>Arena of Legends</h1>
      <p class="subtitle">Choose your champion</p>
      <div class="select-body">
        <div class="champ-grid"></div>
        <div class="champ-detail panel"></div>
      </div>
      <div class="select-footer">
        <span class="controls-hint">Right click: move/attack · QWER: abilities · P: shop · B: recall · H: help</span>
        <button class="lock-in">Lock In</button>
      </div>`;
    root.appendChild(screen);

    const grid = screen.querySelector('.champ-grid')!;
    const detail = screen.querySelector('.champ-detail')!;
    let selected = CHAMPION_IDS[0];

    const render = () => {
      grid.querySelectorAll('.champ-card').forEach((el) => el.classList.toggle('selected', (el as HTMLElement).dataset.id === selected));
      const def = CHAMPIONS[selected];
      const b = def.base;
      // A fake level-1 caster just to show base damage numbers.
      const preview = { champion: { level: 1 }, attackDamage: b.attackDamage, abilityPower: 0 } as Parameters<typeof abilityDamage>[1];
      detail.innerHTML = `
        <div class="detail-head">
          <div class="detail-icon" style="background:${hex(def.color)}">${def.icon}</div>
          <div><h2>${def.name}</h2><div class="muted">${def.title} · ${def.role}</div></div>
        </div>
        <div class="detail-stats">
          <span>Health <b>${b.maxHp}</b></span><span>Mana <b>${b.maxMana}</b></span>
          <span>Attack <b>${b.attackDamage}</b></span><span>Range <b>${b.ranged ? 'Ranged' : 'Melee'}</b></span>
          <span>Armor <b>${b.armor}</b></span><span>Speed <b>${b.moveSpeed}</b></span>
        </div>
        ${def.abilities
          .map((a, i) => {
            const dmg = abilityDamage(a, preview);
            return `<div class="detail-ability">
              <div class="ab-icon" style="border-color:${hex(a.color)}">${a.icon}<span>${KEYS[i]}</span></div>
              <div><b>${a.name}</b>${dmg ? ` <span class="muted">${Math.round(dmg)} ${a.damage!.kind}</span>` : ''}<div class="muted">${a.description}</div></div>
            </div>`;
          })
          .join('')}`;
    };

    for (const id of CHAMPION_IDS) {
      const def = CHAMPIONS[id];
      const card = document.createElement('div');
      card.className = 'champ-card panel';
      card.dataset.id = id;
      card.innerHTML = `<div class="card-icon" style="background:${hex(def.color)}">${def.icon}</div><b>${def.name}</b><span class="muted">${def.role}</span>`;
      card.addEventListener('click', () => {
        selected = id;
        render();
      });
      card.addEventListener('dblclick', () => lockIn());
      grid.appendChild(card);
    }

    const lockIn = () => {
      screen.remove();
      resolve(selected);
    };
    screen.querySelector('.lock-in')!.addEventListener('click', lockIn);
    render();
  });
}
