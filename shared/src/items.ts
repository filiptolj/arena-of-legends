import { type AbilityEffect, CHAMPIONS } from './champions.js';
import { MAP, type Team } from './map.js';
import { dist } from './math.js';
import { type Entity, INVENTORY_SIZE, type ItemId } from './types.js';

export interface ItemStats {
  attackDamage?: number;
  abilityPower?: number;
  /** Fractional attack speed bonus (0.25 = +25%). */
  attackSpeedPct?: number;
  maxHp?: number;
  maxMana?: number;
  armor?: number;
  magicResist?: number;
  moveSpeed?: number;
  hpRegen?: number;
  manaRegen?: number;
  lifesteal?: number;
  cooldownReduction?: number;
}

export type ItemTier = 'consumable' | 'basic' | 'epic' | 'legendary';

/** Potions: drink with keys 1-6; stack in one slot and restore health/mana over time. */
export interface Consumable {
  hpPerSec?: number;
  manaPerSec?: number;
  duration: number;
  maxStack: number;
}

/** An activatable item effect, cast with number keys 1-6. Reuses the ability effect system. */
export interface ItemActive {
  name: string;
  description: string;
  cooldown: number;
  range: number;
  effect: AbilityEffect;
}

export interface ItemDef {
  id: ItemId;
  name: string;
  icon: string;
  tier: ItemTier;
  /** Total cost, including components. */
  cost: number;
  from: ItemId[];
  stats: ItemStats;
  /** Only one item of a unique group may be owned (e.g. boots). */
  unique?: string;
  active?: ItemActive;
  consumable?: Consumable;
}

export const SELL_RATIO = 0.7;
export const MAX_COOLDOWN_REDUCTION = 0.4;

const item = (
  id: ItemId,
  name: string,
  icon: string,
  tier: ItemTier,
  cost: number,
  stats: ItemStats,
  from: ItemId[] = [],
  unique?: string,
  active?: ItemActive,
): ItemDef => ({ id, name, icon, tier, cost, stats, from, unique, active });

export const ITEMS: Record<ItemId, ItemDef> = Object.fromEntries(
  [
    {
      id: 'healthPotion', name: 'Health Potion', icon: '🧪', tier: 'consumable', cost: 50, stats: {}, from: [],
      consumable: { hpPerSec: 10, duration: 15, maxStack: 5 },
    } satisfies ItemDef,
    {
      id: 'manaPotion', name: 'Mana Potion', icon: '🫙', tier: 'consumable', cost: 40, stats: {}, from: [],
      consumable: { manaPerSec: 7, duration: 15, maxStack: 5 },
    } satisfies ItemDef,
    item('ironBlade', 'Iron Blade', '🗡️', 'basic', 350, { attackDamage: 10 }),
    item('spellTome', 'Spell Tome', '📘', 'basic', 435, { abilityPower: 20 }),
    item('quickDagger', 'Quick Dagger', '🔪', 'basic', 300, { attackSpeedPct: 0.12 }),
    item('vitalGem', 'Vital Gem', '❤️', 'basic', 400, { maxHp: 150 }),
    item('manaGem', 'Mana Gem', '💧', 'basic', 350, { maxMana: 250 }),
    item('paddedVest', 'Padded Vest', '🦺', 'basic', 300, { armor: 15 }),
    item('wardingCloak', 'Warding Cloak', '🧣', 'basic', 450, { magicResist: 25 }),
    item('boots', 'Traveler\'s Boots', '👢', 'basic', 300, { moveSpeed: 0.6 }, [], 'boots'),
    item('rejuvBead', 'Rejuvenation Bead', '🟢', 'basic', 150, { hpRegen: 1.5 }),
    item('faerieCharm', 'Faerie Charm', '🧚', 'basic', 200, { manaRegen: 1.2 }),
    item('wardTotem', 'Ward Totem', '🏮', 'basic', 75, {}, [], 'trinket', {
      name: 'Place Ward',
      description: 'Place a ward that reveals the area (and brush) for 90s.',
      cooldown: 60,
      range: 9,
      effect: { type: 'ward' },
    }),

    item('vampiricBlade', 'Vampiric Blade', '🩸', 'epic', 900, { attackDamage: 15, lifesteal: 0.1 }, ['ironBlade']),
    item('arcaneCodex', 'Arcane Codex', '📜', 'epic', 1100, { abilityPower: 40, cooldownReduction: 0.1 }, ['spellTome']),
    item('warAxe', 'War Axe', '🪓', 'epic', 1100, { attackDamage: 25, cooldownReduction: 0.1 }, ['ironBlade']),
    item('huntersBow', 'Hunter\'s Bow', '🎯', 'epic', 1000, { attackSpeedPct: 0.25 }, ['quickDagger', 'quickDagger']),
    item('swiftstrideBoots', 'Swiftstride Boots', '🥾', 'epic', 900, { moveSpeed: 1.2, attackSpeedPct: 0.1 }, ['boots'], 'boots'),
    item('sorcererBoots', 'Sorcerer\'s Shoes', '🩰', 'epic', 1000, { moveSpeed: 1.0, abilityPower: 15 }, ['boots'], 'boots'),
    item('platedBoots', 'Plated Greaves', '🥿', 'epic', 1000, { moveSpeed: 1.0, armor: 20 }, ['boots'], 'boots'),
    item('mercuryBoots', 'Mercury Treads', '👟', 'epic', 1000, { moveSpeed: 1.0, magicResist: 25 }, ['boots'], 'boots'),

    // Mid-tier components: the step between basics and legendaries.
    item('minersPick', 'Miner\'s Pick', '⛏️', 'epic', 875, { attackDamage: 25 }, ['ironBlade']),
    item('chainmail', 'Chainmail', '⛓️', 'epic', 800, { armor: 40 }, ['paddedVest']),
    item('spiritMantle', 'Spirit Mantle', '🌀', 'epic', 900, { magicResist: 40, hpRegen: 1 }, ['wardingCloak']),
    item('giantsBelt', 'Giant\'s Belt', '🎗️', 'epic', 900, { maxHp: 380 }, ['vitalGem']),
    item('kindleStone', 'Kindle Stone', '💎', 'epic', 800, { maxHp: 200, cooldownReduction: 0.1 }, ['vitalGem']),
    item('aetherOrb', 'Aether Orb', '🔮', 'epic', 850, { abilityPower: 30, moveSpeed: 0.3 }, ['spellTome']),
    item('lostGrimoire', 'Lost Grimoire', '📕', 'epic', 1200, { abilityPower: 40, maxMana: 300, cooldownReduction: 0.1 }, ['spellTome', 'manaGem']),
    item('zealSaber', 'Zealot\'s Saber', '🤺', 'epic', 1200, { attackSpeedPct: 0.2, moveSpeed: 0.4 }, ['quickDagger']),
    item('phageMace', 'Phage Mace', '🔨', 'epic', 1100, { attackDamage: 20, maxHp: 200 }, ['ironBlade', 'vitalGem']),
    item('thornVest', 'Thorn Vest', '🌵', 'epic', 1000, { armor: 30, maxHp: 150 }, ['paddedVest']),
    item('spellbreaker', 'Spellbreaker Blade', '🗡', 'epic', 1300, { attackDamage: 25, magicResist: 35 }, ['ironBlade', 'wardingCloak']),
    item('crystalScepter', 'Crystal Scepter', '❄️', 'epic', 1100, { abilityPower: 25, maxHp: 200 }, ['spellTome', 'vitalGem']),
    item('fiendishTome', 'Fiendish Tome', '📗', 'epic', 900, { abilityPower: 25, cooldownReduction: 0.1 }, ['spellTome']),
    item('watchfulCharm', 'Watchful Charm', '🧿', 'epic', 650, { manaRegen: 2, hpRegen: 1, cooldownReduction: 0.05 }, ['faerieCharm', 'rejuvBead']),
    item('cutlass', 'Bilge Cutlass', '⚓', 'epic', 1350, { attackDamage: 25, lifesteal: 0.08 }, ['vampiricBlade']),

    item('crimsonEdge', 'Crimson Edge', '⚔️', 'legendary', 3200, { attackDamage: 60, lifesteal: 0.15 }, ['vampiricBlade', 'ironBlade'], undefined, {
      name: 'Bloodlust',
      description: 'Heal 15% of max health and gain 30% attack speed for 4s.',
      cooldown: 60,
      range: 0,
      effect: { type: 'buff', duration: 4, attackSpeedPct: 0.3, healPctMaxHp: 0.15 },
    }),
    item('stormBow', 'Storm Bow', '🌩️', 'legendary', 2800, { attackDamage: 35, attackSpeedPct: 0.4, moveSpeed: 0.4 }, ['huntersBow', 'ironBlade'], undefined, {
      name: 'Gale',
      description: 'Dash a short distance toward the cursor.',
      cooldown: 45,
      range: 5,
      effect: { type: 'dash', speed: 32, hitRadius: 0 },
    }),
    item('archmageStaff', 'Archmage Staff', '🪄', 'legendary', 3000, { abilityPower: 100, maxMana: 250, cooldownReduction: 0.1 }, ['arcaneCodex', 'spellTome'], undefined, {
      name: 'Time Stop',
      description: 'Enter stasis for 2s: invulnerable and untargetable, but unable to act.',
      cooldown: 120,
      range: 0,
      effect: { type: 'stasis', duration: 2 },
    }),
    item('voidScepter', 'Void Scepter', '🔱', 'legendary', 2900, { abilityPower: 70, maxMana: 300, cooldownReduction: 0.2 }, ['arcaneCodex', 'manaGem']),
    item('titanPlate', 'Titan Plate', '🏰', 'legendary', 2800, { maxHp: 450, armor: 45 }, ['vitalGem', 'paddedVest'], undefined, {
      name: 'Stoneskin',
      description: 'Gain a shield of 150 + 10% max health for 3s.',
      cooldown: 60,
      range: 0,
      effect: { type: 'buff', duration: 3, shield: { base: 150, perLevel: 0, kind: 'true' }, shieldPctMaxHp: 0.1 },
    }),
    item('spellguardMail', 'Spellguard Mail', '🔰', 'legendary', 2500, { maxHp: 350, magicResist: 55 }, ['vitalGem', 'wardingCloak']),
    item('sunforgeAegis', 'Sunforge Aegis', '☀️', 'legendary', 2700, { maxHp: 450, armor: 40 }, ['giantsBelt', 'chainmail']),
    item('verdantVisage', 'Verdant Visage', '🌿', 'legendary', 2700, { maxHp: 400, magicResist: 50, cooldownReduction: 0.1, hpRegen: 2 }, ['kindleStone', 'spiritMantle']),
    item('trinityEdge', 'Trinity Edge', '✨', 'legendary', 3300, { attackDamage: 30, attackSpeedPct: 0.3, maxHp: 250, cooldownReduction: 0.2 }, ['phageMace', 'zealSaber']),
    item('cometStaff', 'Comet Staff', '☄️', 'legendary', 3000, { abilityPower: 85, maxMana: 300, cooldownReduction: 0.15, moveSpeed: 0.3 }, ['lostGrimoire', 'aetherOrb']),
    item('frostboundRod', 'Frostbound Rod', '🧊', 'legendary', 2800, { abilityPower: 70, maxHp: 400 }, ['crystalScepter', 'giantsBelt']),
    item('quicksilverSaber', 'Quicksilver Saber', '🪽', 'legendary', 3000, { attackDamage: 50, magicResist: 40 }, ['spellbreaker', 'minersPick'], undefined, {
      name: 'Quicksilver',
      description: 'Remove all slows, stuns and roots and gain 50% move speed for 1.5s.',
      cooldown: 90,
      range: 0,
      effect: { type: 'cleanse', moveSpeedPct: 0.5, duration: 1.5 },
    }),
    item('warlordsCleaver', 'Warlord\'s Cleaver', '⚒️', 'legendary', 3100, { attackDamage: 40, maxHp: 300, cooldownReduction: 0.2 }, ['warAxe', 'vitalGem']),
  ].map((i) => [i.id, i]),
);

export const ITEM_STAT_LABELS: Record<keyof ItemStats, (v: number) => string> = {
  attackDamage: (v) => `+${v} Attack Damage`,
  abilityPower: (v) => `+${v} Ability Power`,
  attackSpeedPct: (v) => `+${Math.round(v * 100)}% Attack Speed`,
  maxHp: (v) => `+${v} Health`,
  maxMana: (v) => `+${v} Mana`,
  armor: (v) => `+${v} Armor`,
  magicResist: (v) => `+${v} Magic Resist`,
  moveSpeed: (v) => `+${v} Move Speed`,
  hpRegen: (v) => `+${v} Health Regen`,
  manaRegen: (v) => `+${v} Mana Regen`,
  lifesteal: (v) => `+${Math.round(v * 100)}% Lifesteal`,
  cooldownReduction: (v) => `+${Math.round(v * 100)}% Cooldown Reduction`,
};

/** Items whose recipe includes `id` (for "builds into" in the shop). */
export function buildsInto(id: ItemId): ItemDef[] {
  return Object.values(ITEMS).filter((i) => i.from.includes(id));
}

/**
 * Cost of `itemId` after discounting components already in `inventory`.
 * Returns the inventory slots that would be consumed by the purchase.
 */
export function purchasePrice(itemId: ItemId, inventory: (ItemId | null)[]): { cost: number; consumed: number[] } {
  const consumed: number[] = [];
  const walk = (id: ItemId): number => {
    const def = ITEMS[id];
    let cost = def.cost;
    for (const comp of def.from) {
      const slot = inventory.findIndex((it, i) => it === comp && !consumed.includes(i));
      if (slot >= 0) {
        consumed.push(slot);
        cost -= ITEMS[comp].cost;
      } else {
        // Partial credit for owned sub-components.
        cost -= ITEMS[comp].cost - walk(comp);
      }
    }
    return cost;
  };
  return { cost: walk(itemId), consumed };
}

export function canShop(e: Entity): boolean {
  return e.dead || dist(e.pos, MAP.fountains[e.team as Team]) <= MAP.fountainRadius + 2;
}

export type BuyFailure = 'location' | 'gold' | 'full' | 'unique' | 'stack' | 'unknown';

/** A slot holding this consumable that still has room in its stack, or -1. */
function stackSlot(e: Entity, itemId: ItemId): number {
  const c = e.champion!;
  const max = ITEMS[itemId].consumable?.maxStack ?? 1;
  return c.items.findIndex((it, i) => it === itemId && c.itemCharges[i] < max);
}

/** Why `itemId` can't be bought right now, or null if it can. */
export function buyBlocker(e: Entity, itemId: ItemId): BuyFailure | null {
  const c = e.champion;
  const def = ITEMS[itemId];
  if (!c || !def) return 'unknown';
  if (!canShop(e)) return 'location';
  const { cost, consumed } = purchasePrice(itemId, c.items);
  if (c.gold < cost) return 'gold';
  if (def.unique) {
    const clash = c.items.some((it, i) => it && ITEMS[it].unique === def.unique && !consumed.includes(i));
    if (clash) return 'unique';
  }
  if (def.consumable && stackSlot(e, itemId) >= 0) return null;
  const free = c.items.filter((it) => it === null).length + consumed.length;
  if (free < 1) return def.consumable && c.items.includes(itemId) ? 'stack' : 'full';
  return null;
}

/** Applies a purchase; returns false if it isn't allowed. */
export function buyItem(e: Entity, itemId: ItemId): boolean {
  if (buyBlocker(e, itemId)) return false;
  const c = e.champion!;
  const { cost, consumed } = purchasePrice(itemId, c.items);
  c.gold -= cost;
  // Potions stack into an existing slot when there's room.
  const stack = ITEMS[itemId].consumable ? stackSlot(e, itemId) : -1;
  if (stack >= 0) {
    c.itemCharges[stack]++;
    return true;
  }
  for (const slot of consumed) {
    c.items[slot] = null;
    c.itemCharges[slot] = 0;
  }
  const slot = c.items.indexOf(null);
  c.items[slot] = itemId;
  c.itemCharges[slot] = ITEMS[itemId].consumable ? 1 : 0;
  recomputeChampionStats(e);
  return true;
}

/** Removes one charge of a consumable (or the item itself); returns the item id. */
export function spendCharge(e: Entity, slot: number): ItemId | null {
  const c = e.champion;
  const id = c?.items[slot];
  if (!c || !id) return null;
  if (ITEMS[id].consumable && c.itemCharges[slot] > 1) {
    c.itemCharges[slot]--;
  } else {
    c.items[slot] = null;
    c.itemCharges[slot] = 0;
  }
  return id;
}

export function sellItem(e: Entity, slot: number): number {
  const c = e.champion;
  if (!c || !canShop(e)) return 0;
  const id = c.items[slot];
  if (!id) return 0;
  // Potions sell one at a time.
  const refund = Math.floor(ITEMS[id].cost * SELL_RATIO);
  spendCharge(e, slot);
  c.gold += refund;
  recomputeChampionStats(e);
  return refund;
}

/**
 * Next purchase toward a build: the target item if affordable, otherwise its
 * cheapest affordable missing component (recursively). Null if nothing fits.
 */
export function nextPurchase(e: Entity, target: ItemId): ItemId | null {
  if (!buyBlocker(e, target)) return target;
  const owned = [...(e.champion?.items ?? [])];
  for (const comp of ITEMS[target].from) {
    const idx = owned.indexOf(comp);
    if (idx >= 0) {
      owned[idx] = null;
      continue;
    }
    const step = nextPurchase(e, comp);
    if (step) return step;
  }
  return null;
}

export function emptyInventory(): (ItemId | null)[] {
  return Array.from({ length: INVENTORY_SIZE }, () => null);
}

export function emptyCharges(): number[] {
  return Array.from({ length: INVENTORY_SIZE }, () => 0);
}

/**
 * Recomputes a champion's stats from base + level growth + items.
 * Gaining max health or mana also grants the same amount of current health or mana.
 */
export function recomputeChampionStats(e: Entity): void {
  const c = e.champion;
  if (!c) return;
  const def = CHAMPIONS[c.defId];
  const lv = c.level - 1;
  const g = def.perLevel;
  const b = def.base;
  const total: Required<ItemStats> = {
    attackDamage: 0, abilityPower: 0, attackSpeedPct: 0, maxHp: 0, maxMana: 0, armor: 0, magicResist: 0,
    moveSpeed: 0, hpRegen: 0, manaRegen: 0, lifesteal: 0, cooldownReduction: 0,
  };
  for (const id of c.items) {
    if (!id) continue;
    for (const [k, v] of Object.entries(ITEMS[id].stats)) total[k as keyof ItemStats] += v ?? 0;
  }

  const maxHp = b.maxHp + (g.maxHp ?? 0) * lv + total.maxHp;
  const maxMana = b.maxMana + (g.maxMana ?? 0) * lv + total.maxMana;
  if (!e.dead) e.hp = Math.max(1, Math.min(maxHp, e.hp + (maxHp - e.maxHp)));
  e.mana = Math.max(0, Math.min(maxMana, e.mana + (maxMana - e.maxMana)));
  e.maxHp = maxHp;
  e.maxMana = maxMana;
  e.hpRegen = b.hpRegen + (g.hpRegen ?? 0) * lv + total.hpRegen;
  e.manaRegen = b.manaRegen + (g.manaRegen ?? 0) * lv + total.manaRegen;
  e.armor = b.armor + (g.armor ?? 0) * lv + total.armor;
  e.magicResist = b.magicResist + (g.magicResist ?? 0) * lv + total.magicResist;
  e.attackDamage = b.attackDamage + (g.attackDamage ?? 0) * lv + total.attackDamage;
  e.abilityPower = total.abilityPower;
  e.attackSpeed = b.attackSpeed * (1 + (g.attackSpeedPct ?? 0) * lv + total.attackSpeedPct);
  e.moveSpeed = b.moveSpeed + total.moveSpeed;
  e.lifesteal = total.lifesteal;
  e.cooldownReduction = Math.min(MAX_COOLDOWN_REDUCTION, total.cooldownReduction);
}
