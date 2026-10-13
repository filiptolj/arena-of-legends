import {
  type BuyFailure,
  CHAMPIONS,
  type Command,
  type EntityId,
  ITEMS,
  ITEM_STAT_LABELS,
  type ItemDef,
  type ItemId,
  type ItemStats,
  SELL_RATIO,
  type World,
  buildsInto,
  buyBlocker,
  canShop,
  purchasePrice,
} from '@lol/shared';

const BLOCK_REASON: Record<BuyFailure, string> = {
  location: 'Return to base to shop',
  gold: 'Not enough gold',
  full: 'Inventory full',
  unique: 'Only one of these allowed',
  unknown: 'Unavailable',
};

const TIERS: { tier: ItemDef['tier']; label: string }[] = [
  { tier: 'basic', label: 'Basic' },
  { tier: 'epic', label: 'Epic' },
  { tier: 'legendary', label: 'Legendary' },
];

export function statLines(stats: ItemStats): string[] {
  return Object.entries(stats).map(([k, v]) => ITEM_STAT_LABELS[k as keyof ItemStats](v as number));
}

/** Item shop: browse, buy (click Buy, double-click or right-click) and sell. */
export class Shop {
  private readonly el = document.createElement('div');
  private selected: ItemId = 'boots';
  private selectedSlot: number | null = null;
  isOpen = false;

  constructor(
    root: HTMLElement,
    private readonly world: World,
    private readonly playerId: EntityId,
    private readonly send: (cmd: Command) => void,
  ) {
    this.el.className = 'shop panel';
    this.el.style.display = 'none';
    root.appendChild(this.el);

    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.el.addEventListener('mousedown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('dblclick', (e) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-item]')?.dataset.item;
      if (id) this.buy(id);
    });
    this.el.addEventListener('mouseup', (e) => {
      if (e.button !== 2) return;
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-item]')?.dataset.item;
      if (id) this.buy(id);
      const slot = (e.target as HTMLElement).closest<HTMLElement>('[data-slot]')?.dataset.slot;
      if (slot !== undefined) this.sell(Number(slot));
    });
  }

  toggle(force?: boolean): void {
    this.isOpen = force ?? !this.isOpen;
    this.el.style.display = this.isOpen ? 'flex' : 'none';
  }

  private buy(id: ItemId): void {
    this.selected = id;
    this.send({ type: 'buy', unitId: this.playerId, itemId: id });
  }

  private sell(slot: number): void {
    this.send({ type: 'sell', unitId: this.playerId, slot });
    this.selectedSlot = null;
  }

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (t.closest('.shop-close')) return this.toggle(false);
    if (t.closest('.shop-buy')) return this.buy(this.selected);
    if (t.closest('.shop-sell') && this.selectedSlot !== null) return this.sell(this.selectedSlot);
    const item = t.closest<HTMLElement>('[data-item]')?.dataset.item;
    if (item) {
      this.selected = item;
      this.selectedSlot = null;
        return;
    }
    const slot = t.closest<HTMLElement>('[data-slot]')?.dataset.slot;
    if (slot !== undefined) {
      const id = this.world.get(this.playerId)?.champion?.items[Number(slot)];
      if (id) {
        this.selected = id;
        this.selectedSlot = Number(slot);
          }
    }
  }

  private built = false;
  private goldEl!: HTMLElement;
  private detailEl!: HTMLElement;
  private inventoryEl!: HTMLElement;
  private detailKey = '';
  private inventoryKey = '';

  private cardHtml(def: ItemDef): string {
    return `<div class="item-card" data-item="${def.id}" title="${def.name}">
      <div class="item-icon tier-${def.tier}">${def.icon}</div>
      <span class="item-price"></span>
    </div>`;
  }

  /** Builds the static skeleton once; later updates patch it in place so clicks never hit replaced nodes. */
  private build(defId: string): void {
    const champ = CHAMPIONS[defId];
    const sections = [
      `<div class="shop-section"><h4>Recommended for ${champ.name}</h4><div class="item-row">${champ.build.map((id) => this.cardHtml(ITEMS[id])).join('')}</div></div>`,
      ...TIERS.map(
        ({ tier, label }) =>
          `<div class="shop-section"><h4>${label}</h4><div class="item-row">${Object.values(ITEMS)
            .filter((i) => i.tier === tier)
            .map((i) => this.cardHtml(i))
            .join('')}</div></div>`,
      ),
    ].join('');
    this.el.innerHTML = `
      <div class="shop-header"><h2>Shop</h2><span class="gold"></span><button class="shop-close">✕</button></div>
      <div class="shop-body">
        <div class="shop-items">${sections}</div>
        <div class="shop-detail"></div>
      </div>
      <div class="shop-inventory"></div>`;
    this.goldEl = this.el.querySelector('.shop-header .gold')!;
    this.detailEl = this.el.querySelector('.shop-detail')!;
    this.inventoryEl = this.el.querySelector('.shop-inventory')!;
    this.built = true;
  }

  update(): void {
    if (!this.isOpen) return;
    const me = this.world.get(this.playerId);
    const c = me?.champion;
    if (!me || !c) return;
    if (!this.built) this.build(c.defId);

    const gold = `💰 ${Math.floor(c.gold)}`;
    if (this.goldEl.textContent !== gold) this.goldEl.textContent = gold;

    const sel = ITEMS[this.selected];
    const price = purchasePrice(sel.id, c.items).cost;
    const blocker = buyBlocker(me, sel.id);
    const shopping = canShop(me);
    const sellSlot = this.selectedSlot;

    const detailKey = `${sel.id}|${sellSlot}|${price}|${blocker}|${shopping}|${c.items.join(',')}`;
    if (detailKey !== this.detailKey) {
      this.detailKey = detailKey;
      const into = buildsInto(sel.id);
      this.detailEl.innerHTML = `
        <div class="detail-title"><div class="item-icon big tier-${sel.tier}">${sel.icon}</div>
          <div><h3>${sel.name}</h3><div class="gold">💰 ${price}${price !== sel.cost ? ` <s class="muted">${sel.cost}</s>` : ''}</div></div>
        </div>
        <ul class="stat-list">${statLines(sel.stats).map((l) => `<li>${l}</li>`).join('')}</ul>
        ${sel.active ? `<div class="small"><b>Active – ${sel.active.name}</b> (${sel.active.cooldown}s)<br><span class="muted">${sel.active.description}</span></div>` : ''}
        ${sel.unique ? `<div class="muted small">Unique: ${sel.unique}</div>` : ''}
        ${sel.from.length ? `<div class="muted small">Recipe</div><div class="item-row">${sel.from.map((id) => this.cardHtml(ITEMS[id])).join('')}</div>` : ''}
        ${into.length ? `<div class="muted small">Builds into</div><div class="item-row">${into.map((i) => this.cardHtml(i)).join('')}</div>` : ''}
        <div class="detail-actions">
          ${
            sellSlot !== null
              ? `<button class="shop-sell" ${shopping ? '' : 'disabled'}>Sell for ${Math.floor(sel.cost * SELL_RATIO)}</button>`
              : `<button class="shop-buy" ${blocker ? 'disabled' : ''}>Buy</button>`
          }
          <div class="muted small">${sellSlot === null && blocker ? BLOCK_REASON[blocker] : shopping ? 'Right-click to buy/sell quickly' : BLOCK_REASON.location}</div>
        </div>`;
    }

    // Patch every card's price and state in place.
    for (const card of this.el.querySelectorAll<HTMLElement>('[data-item]')) {
      const id = card.dataset.item!;
      const cardPrice = String(purchasePrice(id, c.items).cost);
      const priceEl = card.querySelector('.item-price')!;
      if (priceEl.textContent !== cardPrice) priceEl.textContent = cardPrice;
      card.classList.toggle('selected', id === this.selected);
      card.classList.toggle('expensive', buyBlocker(me, id) === 'gold');
      card.classList.toggle('owned', c.items.includes(id));
    }

    const inventoryKey = `${c.items.join(',')}|${sellSlot}`;
    if (inventoryKey !== this.inventoryKey) {
      this.inventoryKey = inventoryKey;
      this.inventoryEl.innerHTML = `<span class="muted">Inventory</span>${c.items
        .map(
          (id, i) =>
            `<div class="inv-slot ${i === sellSlot ? 'selected' : ''}" data-slot="${i}" title="${id ? ITEMS[id].name : 'Empty'}">${id ? ITEMS[id].icon : ''}</div>`,
        )
        .join('')}`;
    }
  }
}
