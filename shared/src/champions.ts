import type { UnitStats } from './constants.js';
import type { DamageKind, ItemId, OnHitStatus } from './types.js';

export interface DamageSpec {
  base: number;
  perLevel: number;
  /** Ratio of total attack damage added. */
  ad?: number;
  /** Ratio of ability power added. */
  ap?: number;
  kind: DamageKind;
}

export type AbilityEffect =
  /** Projectile fired toward the cursor. */
  | { type: 'skillshot'; speed: number; width: number; pierce?: boolean; status?: OnHitStatus }
  /** Instant teleport toward the cursor. */
  | { type: 'blink' }
  /** Fast slide toward the cursor, damaging enemies passed through. */
  | { type: 'dash'; speed: number; hitRadius: number; status?: OnHitStatus }
  /** Instant burst around the caster. */
  | { type: 'nova'; radius: number; status?: OnHitStatus }
  /** Delayed area at the cursor (or on the caster with `atSelf`). */
  | { type: 'zone'; radius: number; delay: number; atSelf?: boolean; status?: OnHitStatus }
  /** Temporary self buff. */
  | {
      type: 'buff';
      duration: number;
      attackSpeedPct?: number;
      moveSpeedPct?: number;
      armor?: number;
      shield?: DamageSpec;
      /** Shield bonus as a fraction of max health. */
      shieldPctMaxHp?: number;
      /** Instant heal as a fraction of max health. */
      healPctMaxHp?: number;
    }
  /** Place a vision ward at the cursor. */
  | { type: 'ward' }
  /** Become invulnerable and untargetable, unable to act. */
  | { type: 'stasis'; duration: number };

export interface AbilityDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Visual tint for projectiles and effects. */
  color: number;
  cooldown: number;
  manaCost: number;
  range: number;
  /** Champion level needed before the ability can be cast. */
  requiredLevel: number;
  damage?: DamageSpec;
  effect: AbilityEffect;
}

export type ChampionRole = 'Mage' | 'Marksman' | 'Tank' | 'Assassin';

export interface ChampionDef {
  id: string;
  name: string;
  title: string;
  role: ChampionRole;
  icon: string;
  /** Primary color of the model (team color is used for accents). */
  color: number;
  base: UnitStats;
  perLevel: Partial<Record<'maxHp' | 'maxMana' | 'hpRegen' | 'manaRegen' | 'armor' | 'magicResist' | 'attackDamage', number>> & {
    /** Fractional attack speed bonus per level (0.02 = +2%). */
    attackSpeedPct?: number;
  };
  abilities: [AbilityDef, AbilityDef, AbilityDef, AbilityDef];
  /** Suggested items, in purchase order. Bots follow it; the shop recommends it. */
  build: ItemId[];
}

const ULT_LEVEL = 6;

export const CHAMPIONS: Record<string, ChampionDef> = {
  arcanist: {
    id: 'arcanist',
    name: 'Arcanist',
    title: 'the Wandering Spark',
    role: 'Mage',
    icon: '🧙',
    color: 0x2b1f4a,
    base: {
      maxHp: 620, maxMana: 400, hpRegen: 1.5, manaRegen: 2.5, armor: 25, magicResist: 30,
      attackDamage: 55, attackRange: 7, attackSpeed: 0.7, moveSpeed: 6, radius: 0.8, ranged: true,
    },
    perLevel: { maxHp: 95, maxMana: 40, hpRegen: 0.15, manaRegen: 0.15, armor: 4, magicResist: 1.3, attackDamage: 3.5, attackSpeedPct: 0.02 },
    abilities: [
      {
        id: 'arcaneBolt', name: 'Arcane Bolt', icon: '🔮', color: 0xc77dff,
        description: 'Fire a bolt that damages the first enemy hit.',
        cooldown: 4, manaCost: 45, range: 14, requiredLevel: 1,
        damage: { base: 70, perLevel: 25, ap: 0.6, kind: 'magic' },
        effect: { type: 'skillshot', speed: 32, width: 0.8 },
      },
      {
        id: 'blink', name: 'Blink', icon: '💨', color: 0xb18cff,
        description: 'Teleport a short distance toward the cursor.',
        cooldown: 12, manaCost: 60, range: 7, requiredLevel: 1,
        effect: { type: 'blink' },
      },
      {
        id: 'frostNova', name: 'Frost Nova', icon: '❄️', color: 0x9fe8ff,
        description: 'Blast nearby enemies, slowing them by 40% for 2s.',
        cooldown: 9, manaCost: 70, range: 0, requiredLevel: 1,
        damage: { base: 50, perLevel: 20, ap: 0.4, kind: 'magic' },
        effect: { type: 'nova', radius: 5, status: { type: 'slow', amount: 0.4, duration: 2 } },
      },
      {
        id: 'meteor', name: 'Meteor', icon: '☄️', color: 0xff6a22,
        description: 'After 1s, a meteor crashes into the target area.',
        cooldown: 60, manaCost: 100, range: 20, requiredLevel: ULT_LEVEL,
        damage: { base: 200, perLevel: 45, ap: 0.8, kind: 'magic' },
        effect: { type: 'zone', radius: 5, delay: 1 },
      },
    ],
    build: ['boots', 'wardTotem', 'arcaneCodex', 'archmageStaff', 'voidScepter', 'spellguardMail'],
  },

  ranger: {
    id: 'ranger',
    name: 'Ranger',
    title: 'the Keen Eye',
    role: 'Marksman',
    icon: '🏹',
    color: 0x2f5a2a,
    base: {
      maxHp: 580, maxMana: 300, hpRegen: 1.4, manaRegen: 1.8, armor: 24, magicResist: 30,
      attackDamage: 60, attackRange: 8, attackSpeed: 0.68, moveSpeed: 6.1, radius: 0.75, ranged: true,
    },
    perLevel: { maxHp: 90, maxMana: 35, hpRegen: 0.15, manaRegen: 0.1, armor: 4, magicResist: 1.3, attackDamage: 3.2, attackSpeedPct: 0.03 },
    abilities: [
      {
        id: 'piercingArrow', name: 'Piercing Arrow', icon: '➶', color: 0xe8f59a,
        description: 'Loose an arrow that passes through every enemy in a line.',
        cooldown: 6, manaCost: 40, range: 16, requiredLevel: 1,
        damage: { base: 30, perLevel: 20, ad: 1.0, kind: 'physical' },
        effect: { type: 'skillshot', speed: 42, width: 0.6, pierce: true },
      },
      {
        id: 'rapidFire', name: 'Rapid Fire', icon: '⚡', color: 0xfff27a,
        description: 'Gain 60% attack speed for 4s.',
        cooldown: 14, manaCost: 50, range: 0, requiredLevel: 1,
        effect: { type: 'buff', duration: 4, attackSpeedPct: 0.6 },
      },
      {
        id: 'tumble', name: 'Tumble', icon: '🌀', color: 0xc8f0a0,
        description: 'Roll a short distance toward the cursor.',
        cooldown: 10, manaCost: 30, range: 5, requiredLevel: 1,
        effect: { type: 'dash', speed: 30, hitRadius: 0 },
      },
      {
        id: 'arrowStorm', name: 'Arrow Storm', icon: '🌧️', color: 0xffe066,
        description: 'Rain arrows on a distant area after 0.6s, slowing enemies by 30%.',
        cooldown: 70, manaCost: 100, range: 24, requiredLevel: ULT_LEVEL,
        damage: { base: 150, perLevel: 35, ad: 0.9, kind: 'physical' },
        effect: { type: 'zone', radius: 6, delay: 0.6, status: { type: 'slow', amount: 0.3, duration: 1.5 } },
      },
    ],
    build: ['boots', 'wardTotem', 'stormBow', 'crimsonEdge', 'swiftstrideBoots', 'titanPlate'],
  },

  warden: {
    id: 'warden',
    name: 'Warden',
    title: 'the Iron Bulwark',
    role: 'Tank',
    icon: '🛡️',
    color: 0x6e6e78,
    base: {
      maxHp: 700, maxMana: 300, hpRegen: 2.2, manaRegen: 1.6, armor: 35, magicResist: 32,
      attackDamage: 62, attackRange: 1.6, attackSpeed: 0.65, moveSpeed: 5.8, radius: 1.0, ranged: false,
    },
    perLevel: { maxHp: 110, maxMana: 40, hpRegen: 0.25, manaRegen: 0.1, armor: 4.5, magicResist: 2, attackDamage: 3.5, attackSpeedPct: 0.02 },
    abilities: [
      {
        id: 'shieldBash', name: 'Shield Bash', icon: '🔨', color: 0xffd36b,
        description: 'Slam the ground, damaging and stunning nearby enemies for 1s.',
        cooldown: 8, manaCost: 50, range: 0, requiredLevel: 1,
        damage: { base: 60, perLevel: 25, ad: 0.6, kind: 'physical' },
        effect: { type: 'nova', radius: 3.5, status: { type: 'stun', duration: 1 } },
      },
      {
        id: 'ironWill', name: 'Iron Will', icon: '🪨', color: 0x9fd0ff,
        description: 'Gain a shield and 30 armor for 3s.',
        cooldown: 14, manaCost: 60, range: 0, requiredLevel: 1,
        effect: { type: 'buff', duration: 3, armor: 30, shield: { base: 80, perLevel: 30, kind: 'true' } },
      },
      {
        id: 'charge', name: 'Charge', icon: '🐂', color: 0xffb36b,
        description: 'Charge forward, damaging and slowing enemies in your path.',
        cooldown: 11, manaCost: 50, range: 8, requiredLevel: 1,
        damage: { base: 40, perLevel: 20, ad: 0.4, kind: 'physical' },
        effect: { type: 'dash', speed: 22, hitRadius: 1.6, status: { type: 'slow', amount: 0.5, duration: 1 } },
      },
      {
        id: 'earthshatter', name: 'Earthshatter', icon: '🌋', color: 0xd08a4a,
        description: 'After 0.4s, shatter the earth around you, stunning enemies for 1.5s.',
        cooldown: 75, manaCost: 100, range: 0, requiredLevel: ULT_LEVEL,
        damage: { base: 150, perLevel: 40, ad: 0.5, kind: 'physical' },
        effect: { type: 'zone', radius: 7, delay: 0.4, atSelf: true, status: { type: 'stun', duration: 1.5 } },
      },
    ],
    build: ['boots', 'wardTotem', 'titanPlate', 'warlordsCleaver', 'spellguardMail', 'swiftstrideBoots'],
  },

  shade: {
    id: 'shade',
    name: 'Shade',
    title: 'the Silent Blade',
    role: 'Assassin',
    icon: '🗡️',
    color: 0x1c1c26,
    base: {
      maxHp: 600, maxMana: 280, hpRegen: 1.6, manaRegen: 1.8, armor: 26, magicResist: 30,
      attackDamage: 64, attackRange: 1.5, attackSpeed: 0.7, moveSpeed: 6.3, radius: 0.75, ranged: false,
    },
    perLevel: { maxHp: 95, maxMana: 30, hpRegen: 0.18, manaRegen: 0.1, armor: 4, magicResist: 1.3, attackDamage: 3.8, attackSpeedPct: 0.025 },
    abilities: [
      {
        id: 'shadowStrike', name: 'Shadow Strike', icon: '🌑', color: 0x9b5cff,
        description: 'Dash through enemies toward the cursor, cutting everything you pass.',
        cooldown: 6, manaCost: 40, range: 7, requiredLevel: 1,
        damage: { base: 60, perLevel: 30, ad: 0.9, kind: 'physical' },
        effect: { type: 'dash', speed: 35, hitRadius: 1.4 },
      },
      {
        id: 'smokeVeil', name: 'Smoke Veil', icon: '🌫️', color: 0xb0b0c0,
        description: 'Gain 45% move speed for 3s.',
        cooldown: 15, manaCost: 40, range: 0, requiredLevel: 1,
        effect: { type: 'buff', duration: 3, moveSpeedPct: 0.45 },
      },
      {
        id: 'fanOfKnives', name: 'Fan of Knives', icon: '✴️', color: 0xd9d9ff,
        description: 'Throw knives in all directions, slowing enemies by 30%.',
        cooldown: 7, manaCost: 45, range: 0, requiredLevel: 1,
        damage: { base: 50, perLevel: 22, ad: 0.6, kind: 'physical' },
        effect: { type: 'nova', radius: 4.5, status: { type: 'slow', amount: 0.3, duration: 1.5 } },
      },
      {
        id: 'deathLotus', name: 'Death Lotus', icon: '💀', color: 0xff3b6b,
        description: 'Mark an area; after 0.25s, blades shred enemies inside.',
        cooldown: 60, manaCost: 80, range: 10, requiredLevel: ULT_LEVEL,
        damage: { base: 220, perLevel: 60, ad: 1.3, kind: 'physical' },
        effect: { type: 'zone', radius: 3, delay: 0.25 },
      },
    ],
    build: ['boots', 'wardTotem', 'warlordsCleaver', 'crimsonEdge', 'swiftstrideBoots', 'titanPlate'],
  },
};

export const CHAMPION_IDS = Object.keys(CHAMPIONS);

const abilityIndex = new Map<string, AbilityDef>();
for (const c of Object.values(CHAMPIONS)) for (const a of c.abilities) abilityIndex.set(a.id, a);

export function getAbility(id: string): AbilityDef | undefined {
  return abilityIndex.get(id);
}
