import type { UnitStats } from './constants.js';
import type { DamageKind, ItemId, OnHitStatus } from './types.js';

export interface DamageSpec {
  base: number;
  perLevel: number;
  /** Ratio of total attack damage added. */
  ad?: number;
  /** Ratio of ability power added. */
  ap?: number;
  /** Fraction of the target's missing health added (executes). */
  missingHp?: number;
  kind: DamageKind;
}

export type AbilityEffect =
  /** Projectile fired toward the cursor. */
  | {
      type: 'skillshot';
      speed: number;
      width: number;
      pierce?: boolean;
      status?: OnHitStatus;
      /** Fire several projectiles in a cone of `spread` radians. */
      count?: number;
      spread?: number;
    }
  /** Instant teleport toward the cursor. */
  | { type: 'blink' }
  /** Fast slide toward the cursor, damaging enemies passed through. */
  | { type: 'dash'; speed: number; hitRadius: number; status?: OnHitStatus; backward?: boolean }
  /** Point-and-click: hits the enemy unit nearest the cursor within range. */
  | { type: 'strike'; status?: OnHitStatus }
  /** Heals the caster and nearby allied champions by the ability's damage spec. */
  | { type: 'heal'; radius: number }
  /** Removes slows, stuns and roots, then grants bonus move speed. */
  | { type: 'cleanse'; moveSpeedPct: number; duration: number }
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
      /** Become invisible to enemies for the duration (until attacking or casting). */
      stealth?: boolean;
    }
  /** Place a vision ward at the cursor. */
  | { type: 'ward'; lifetime?: number }
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

export type ChampionRole = 'Mage' | 'Marksman' | 'Tank' | 'Assassin' | 'Fighter' | 'Support';

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
    build: ['sorcererBoots', 'wardTotem', 'archmageStaff', 'cometStaff', 'voidScepter', 'frostboundRod'],
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
    build: ['swiftstrideBoots', 'wardTotem', 'stormBow', 'crimsonEdge', 'trinityEdge', 'quicksilverSaber'],
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
    build: ['platedBoots', 'wardTotem', 'titanPlate', 'sunforgeAegis', 'warlordsCleaver', 'spellguardMail'],
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
    build: ['swiftstrideBoots', 'wardTotem', 'warlordsCleaver', 'crimsonEdge', 'quicksilverSaber', 'titanPlate'],
  },

  ironhook: {
    id: 'ironhook',
    name: 'Ironhook',
    title: 'the Steam Golem',
    role: 'Tank',
    icon: '🤖',
    color: 0xb08a3a,
    base: {
      maxHp: 680, maxMana: 330, hpRegen: 2, manaRegen: 1.8, armor: 33, magicResist: 32,
      attackDamage: 60, attackRange: 1.6, attackSpeed: 0.62, moveSpeed: 5.9, radius: 1.05, ranged: false,
    },
    perLevel: { maxHp: 105, maxMana: 40, hpRegen: 0.2, manaRegen: 0.1, armor: 4.5, magicResist: 2, attackDamage: 3.5, attackSpeedPct: 0.015 },
    abilities: [
      {
        id: 'rocketGrab', name: 'Rocket Grab', icon: '🪝', color: 0xffb84a,
        description: 'Fire your hand forward; the first enemy hit is pulled to you and stunned briefly.',
        cooldown: 16, manaCost: 90, range: 16, requiredLevel: 1,
        damage: { base: 80, perLevel: 30, ap: 0.8, kind: 'magic' },
        effect: { type: 'skillshot', speed: 32, width: 0.9, status: { type: 'pull', duration: 0.6 } },
      },
      {
        id: 'overdrive', name: 'Overdrive', icon: '⚙️', color: 0xffe066,
        description: 'Gain 40% move speed and 30% attack speed for 4s.',
        cooldown: 15, manaCost: 60, range: 0, requiredLevel: 1,
        effect: { type: 'buff', duration: 4, moveSpeedPct: 0.4, attackSpeedPct: 0.3 },
      },
      {
        id: 'powerFist', name: 'Power Fist', icon: '👊', color: 0xffa040,
        description: 'Slam everything next to you, stunning for 1s.',
        cooldown: 9, manaCost: 30, range: 0, requiredLevel: 1,
        damage: { base: 60, perLevel: 20, ad: 0.5, kind: 'physical' },
        effect: { type: 'nova', radius: 2.6, status: { type: 'stun', duration: 1 } },
      },
      {
        id: 'staticField', name: 'Static Field', icon: '⚡', color: 0x7fd8ff,
        description: 'Discharge a huge electric field, slowing enemies by 50%.',
        cooldown: 60, manaCost: 100, range: 0, requiredLevel: ULT_LEVEL,
        damage: { base: 200, perLevel: 60, ap: 1.0, kind: 'magic' },
        effect: { type: 'nova', radius: 7, status: { type: 'slow', amount: 0.5, duration: 1.5 } },
      },
    ],
    build: ['platedBoots', 'wardTotem', 'sunforgeAegis', 'verdantVisage', 'titanPlate', 'spellguardMail'],
  },

  valor: {
    id: 'valor',
    name: 'Valor',
    title: 'the Might of the Realm',
    role: 'Fighter',
    icon: '⚜️',
    color: 0x3a5fb0,
    base: {
      maxHp: 690, maxMana: 250, hpRegen: 2.4, manaRegen: 2, armor: 36, magicResist: 32,
      attackDamage: 66, attackRange: 1.6, attackSpeed: 0.63, moveSpeed: 6.1, radius: 0.95, ranged: false,
    },
    perLevel: { maxHp: 100, maxMana: 20, hpRegen: 0.25, manaRegen: 0.1, armor: 4.2, magicResist: 1.8, attackDamage: 4, attackSpeedPct: 0.02 },
    abilities: [
      {
        id: 'decisiveStrike', name: 'Decisive Strike', icon: '⚔️', color: 0xffe8a0,
        description: 'Lunge forward and strike, stunning the first enemies you pass.',
        cooldown: 8, manaCost: 20, range: 4, requiredLevel: 1,
        damage: { base: 30, perLevel: 25, ad: 1.4, kind: 'physical' },
        effect: { type: 'dash', speed: 26, hitRadius: 1.4, status: { type: 'stun', duration: 0.75 } },
      },
      {
        id: 'courage', name: 'Courage', icon: '🛡️', color: 0xa0c8ff,
        description: 'Gain a shield and 25 armor for 3s.',
        cooldown: 18, manaCost: 20, range: 0, requiredLevel: 1,
        effect: { type: 'buff', duration: 3, armor: 25, shield: { base: 70, perLevel: 25, kind: 'true' }, shieldPctMaxHp: 0.08 },
      },
      {
        id: 'judgment', name: 'Judgment', icon: '🌀', color: 0xd0d8ff,
        description: 'Spin your sword, cutting all nearby enemies.',
        cooldown: 8, manaCost: 20, range: 0, requiredLevel: 1,
        damage: { base: 40, perLevel: 20, ad: 0.8, kind: 'physical' },
        effect: { type: 'nova', radius: 4 },
      },
      {
        id: 'finalVerdict', name: 'Final Verdict', icon: '⚖️', color: 0xffd700,
        description: 'Call down a giant sword on the enemy nearest the cursor. Deals more damage the more health they are missing.',
        cooldown: 70, manaCost: 50, range: 7, requiredLevel: ULT_LEVEL,
        damage: { base: 150, perLevel: 50, missingHp: 0.3, kind: 'true' },
        effect: { type: 'strike' },
      },
    ],
    build: ['platedBoots', 'wardTotem', 'trinityEdge', 'sunforgeAegis', 'verdantVisage', 'warlordsCleaver'],
  },

  sunweaver: {
    id: 'sunweaver',
    name: 'Sunweaver',
    title: 'the Lady of Light',
    role: 'Mage',
    icon: '🌟',
    color: 0xd9c47a,
    base: {
      maxHp: 560, maxMana: 420, hpRegen: 1.3, manaRegen: 2.6, armor: 21, magicResist: 30,
      attackDamage: 52, attackRange: 7.5, attackSpeed: 0.67, moveSpeed: 6, radius: 0.75, ranged: true,
    },
    perLevel: { maxHp: 88, maxMana: 45, hpRegen: 0.12, manaRegen: 0.15, armor: 4, magicResist: 1.3, attackDamage: 3.3, attackSpeedPct: 0.015 },
    abilities: [
      {
        id: 'lightBinding', name: 'Light Binding', icon: '✨', color: 0xfff3a0,
        description: 'Throw a sphere of light that roots the first enemy hit for 1.6s.',
        cooldown: 11, manaCost: 50, range: 14, requiredLevel: 1,
        damage: { base: 70, perLevel: 25, ap: 0.6, kind: 'magic' },
        effect: { type: 'skillshot', speed: 30, width: 0.8, status: { type: 'root', duration: 1.6 } },
      },
      {
        id: 'prismBarrier', name: 'Prism Barrier', icon: '💠', color: 0xc8f0ff,
        description: 'Shield yourself for 2.5s.',
        cooldown: 14, manaCost: 60, range: 0, requiredLevel: 1,
        effect: { type: 'buff', duration: 2.5, shield: { base: 60, perLevel: 25, ap: 0.35, kind: 'true' } },
      },
      {
        id: 'lucentSingularity', name: 'Lucent Singularity', icon: '🔆', color: 0xfff8c8,
        description: 'Throw an orb of light that detonates after 0.7s, slowing enemies by 40%.',
        cooldown: 10, manaCost: 70, range: 13, requiredLevel: 1,
        damage: { base: 60, perLevel: 25, ap: 0.6, kind: 'magic' },
        effect: { type: 'zone', radius: 3.5, delay: 0.7, status: { type: 'slow', amount: 0.4, duration: 1.5 } },
      },
      {
        id: 'finalSpark', name: 'Final Spark', icon: '🌞', color: 0xffffff,
        description: 'Fire an enormous laser that hits every enemy in a long line.',
        cooldown: 50, manaCost: 100, range: 30, requiredLevel: ULT_LEVEL,
        damage: { base: 250, perLevel: 60, ap: 1.0, kind: 'magic' },
        effect: { type: 'skillshot', speed: 110, width: 1.4, pierce: true },
      },
    ],
    build: ['sorcererBoots', 'wardTotem', 'cometStaff', 'archmageStaff', 'frostboundRod', 'voidScepter'],
  },

  frostbloom: {
    id: 'frostbloom',
    name: 'Frostbloom',
    title: 'the Frost Archer',
    role: 'Marksman',
    icon: '🌨️',
    color: 0x6aa8d8,
    base: {
      maxHp: 570, maxMana: 280, hpRegen: 1.4, manaRegen: 1.8, armor: 23, magicResist: 30,
      attackDamage: 59, attackRange: 8, attackSpeed: 0.66, moveSpeed: 6, radius: 0.75, ranged: true,
    },
    perLevel: { maxHp: 90, maxMana: 35, hpRegen: 0.15, manaRegen: 0.1, armor: 3.8, magicResist: 1.3, attackDamage: 3, attackSpeedPct: 0.03 },
    abilities: [
      {
        id: 'rangersFocus', name: "Ranger's Focus", icon: '🎯', color: 0xbfe8ff,
        description: 'Gain 50% attack speed for 4s.',
        cooldown: 12, manaCost: 50, range: 0, requiredLevel: 1,
        effect: { type: 'buff', duration: 4, attackSpeedPct: 0.5 },
      },
      {
        id: 'volley', name: 'Volley', icon: '🏹', color: 0x9fd8ff,
        description: 'Fire a cone of 7 frost arrows that slow by 25%.',
        cooldown: 8, manaCost: 60, range: 12, requiredLevel: 1,
        damage: { base: 30, perLevel: 15, ad: 1.0, kind: 'physical' },
        effect: { type: 'skillshot', speed: 32, width: 0.4, count: 7, spread: 0.9, status: { type: 'slow', amount: 0.25, duration: 2 } },
      },
      {
        id: 'hawkshot', name: 'Hawkshot', icon: '🦅', color: 0xd8f0ff,
        description: 'Send a hawk that reveals a far-away area for 5s.',
        cooldown: 25, manaCost: 0, range: 30, requiredLevel: 1,
        effect: { type: 'ward', lifetime: 5 },
      },
      {
        id: 'crystalArrow', name: 'Crystal Arrow', icon: '💎', color: 0x7fd0ff,
        description: 'Fire a huge arrow across the map that stuns the first enemy hit for 2s.',
        cooldown: 80, manaCost: 100, range: 55, requiredLevel: ULT_LEVEL,
        damage: { base: 200, perLevel: 50, ap: 1.0, kind: 'magic' },
        effect: { type: 'skillshot', speed: 32, width: 1.2, status: { type: 'stun', duration: 2 } },
      },
    ],
    build: ['swiftstrideBoots', 'wardTotem', 'stormBow', 'trinityEdge', 'crimsonEdge', 'quicksilverSaber'],
  },

  bloodreaver: {
    id: 'bloodreaver',
    name: 'Bloodreaver',
    title: 'the Hand of War',
    role: 'Fighter',
    icon: '🪓',
    color: 0x7a1a1a,
    base: {
      maxHp: 680, maxMana: 260, hpRegen: 2.2, manaRegen: 1.6, armor: 37, magicResist: 32,
      attackDamage: 64, attackRange: 1.7, attackSpeed: 0.62, moveSpeed: 6, radius: 1.0, ranged: false,
    },
    perLevel: { maxHp: 105, maxMana: 25, hpRegen: 0.2, manaRegen: 0.1, armor: 4.5, magicResist: 2, attackDamage: 4.2, attackSpeedPct: 0.02 },
    abilities: [
      {
        id: 'decimate', name: 'Decimate', icon: '🌪️', color: 0xd04040,
        description: 'Swing your axe in a wide circle.',
        cooldown: 8, manaCost: 30, range: 0, requiredLevel: 1,
        damage: { base: 50, perLevel: 30, ad: 1.0, kind: 'physical' },
        effect: { type: 'nova', radius: 4.5 },
      },
      {
        id: 'cripplingStrike', name: 'Crippling Strike', icon: '🩸', color: 0xff6060,
        description: 'Gain 40% attack speed for 3s.',
        cooldown: 7, manaCost: 30, range: 0, requiredLevel: 1,
        effect: { type: 'buff', duration: 3, attackSpeedPct: 0.4 },
      },
      {
        id: 'apprehend', name: 'Apprehend', icon: '⛓️', color: 0x9a3030,
        description: 'Hook every enemy in front of you and pull them in.',
        cooldown: 18, manaCost: 45, range: 7, requiredLevel: 1,
        damage: { base: 20, perLevel: 10, kind: 'physical' },
        effect: { type: 'skillshot', speed: 40, width: 1.4, pierce: true, status: { type: 'pull', duration: 0.3 } },
      },
      {
        id: 'guillotine', name: 'Guillotine', icon: '⚰️', color: 0xff2020,
        description: 'Leap at the enemy nearest the cursor and execute them: bonus true damage for missing health.',
        cooldown: 60, manaCost: 100, range: 6, requiredLevel: ULT_LEVEL,
        damage: { base: 120, perLevel: 40, ad: 0.75, missingHp: 0.25, kind: 'true' },
        effect: { type: 'strike' },
      },
    ],
    build: ['platedBoots', 'wardTotem', 'trinityEdge', 'sunforgeAegis', 'warlordsCleaver', 'verdantVisage'],
  },

  mistweaver: {
    id: 'mistweaver',
    name: 'Mistweaver',
    title: 'the Starchild',
    role: 'Support',
    icon: '💫',
    color: 0x5ab8a0,
    base: {
      maxHp: 540, maxMana: 420, hpRegen: 1.6, manaRegen: 3, armor: 24, magicResist: 30,
      attackDamage: 50, attackRange: 7, attackSpeed: 0.62, moveSpeed: 6, radius: 0.75, ranged: true,
    },
    perLevel: { maxHp: 85, maxMana: 45, hpRegen: 0.15, manaRegen: 0.2, armor: 4, magicResist: 1.3, attackDamage: 3, attackSpeedPct: 0.015 },
    abilities: [
      {
        id: 'starcall', name: 'Starcall', icon: '🌠', color: 0xb8f0ff,
        description: 'Call down a star that slows enemies by 30%.',
        cooldown: 6, manaCost: 55, range: 12, requiredLevel: 1,
        damage: { base: 70, perLevel: 30, ap: 0.4, kind: 'magic' },
        effect: { type: 'zone', radius: 3, delay: 0.5, status: { type: 'slow', amount: 0.3, duration: 1.5 } },
      },
      {
        id: 'astralInfusion', name: 'Astral Infusion', icon: '💚', color: 0x6aff9a,
        description: 'Heal yourself and nearby allied champions.',
        cooldown: 8, manaCost: 60, range: 0, requiredLevel: 1,
        damage: { base: 80, perLevel: 30, ap: 0.6, kind: 'true' },
        effect: { type: 'heal', radius: 7 },
      },
      {
        id: 'equinox', name: 'Equinox', icon: '🌓', color: 0xe0d0ff,
        description: 'Create a rune that roots enemies inside it after 0.9s.',
        cooldown: 18, manaCost: 70, range: 11, requiredLevel: 1,
        damage: { base: 50, perLevel: 20, ap: 0.3, kind: 'magic' },
        effect: { type: 'zone', radius: 3.5, delay: 0.9, status: { type: 'root', duration: 1.4 } },
      },
      {
        id: 'wish', name: 'Wish', icon: '🙏', color: 0xffffa0,
        description: 'Heal every allied champion on the map.',
        cooldown: 120, manaCost: 100, range: 0, requiredLevel: ULT_LEVEL,
        damage: { base: 150, perLevel: 60, ap: 0.5, kind: 'true' },
        effect: { type: 'heal', radius: 300 },
      },
    ],
    build: ['sorcererBoots', 'wardTotem', 'frostboundRod', 'verdantVisage', 'cometStaff', 'archmageStaff'],
  },

  nightstalker: {
    id: 'nightstalker',
    name: 'Nightstalker',
    title: "Agony's Embrace",
    role: 'Assassin',
    icon: '🦇',
    color: 0x4a2a6a,
    base: {
      maxHp: 590, maxMana: 300, hpRegen: 1.6, manaRegen: 1.8, armor: 26, magicResist: 30,
      attackDamage: 62, attackRange: 1.5, attackSpeed: 0.67, moveSpeed: 6.3, radius: 0.75, ranged: false,
    },
    perLevel: { maxHp: 92, maxMana: 30, hpRegen: 0.18, manaRegen: 0.1, armor: 4, magicResist: 1.3, attackDamage: 3.8, attackSpeedPct: 0.025 },
    abilities: [
      {
        id: 'hateSpike', name: 'Hate Spike', icon: '🗡', color: 0xc070ff,
        description: 'Fire three spikes in a narrow fan.',
        cooldown: 4, manaCost: 30, range: 9, requiredLevel: 1,
        damage: { base: 30, perLevel: 15, ad: 0.6, kind: 'physical' },
        effect: { type: 'skillshot', speed: 35, width: 0.6, count: 3, spread: 0.25 },
      },
      {
        id: 'ambush', name: 'Ambush', icon: '👁️', color: 0x8060a0,
        description: 'Turn invisible and gain 30% move speed for 5s. Attacking or casting reveals you.',
        cooldown: 18, manaCost: 50, range: 0, requiredLevel: 1,
        effect: { type: 'buff', duration: 5, moveSpeedPct: 0.3, stealth: true },
      },
      {
        id: 'whiplash', name: 'Whiplash', icon: '〰️', color: 0xb070e0,
        description: 'Dash forward, lashing every enemy you pass.',
        cooldown: 8, manaCost: 40, range: 5, requiredLevel: 1,
        damage: { base: 60, perLevel: 25, ad: 0.7, kind: 'physical' },
        effect: { type: 'dash', speed: 30, hitRadius: 1.3 },
      },
      {
        id: 'lastCaress', name: 'Last Caress', icon: '💜', color: 0xff4bd8,
        description: 'Unleash a burst around you that deals more damage to wounded enemies.',
        cooldown: 60, manaCost: 100, range: 0, requiredLevel: ULT_LEVEL,
        damage: { base: 200, perLevel: 60, ad: 1.0, missingHp: 0.15, kind: 'physical' },
        effect: { type: 'nova', radius: 5 },
      },
    ],
    build: ['swiftstrideBoots', 'wardTotem', 'warlordsCleaver', 'crimsonEdge', 'quicksilverSaber', 'sunforgeAegis'],
  },

  stonewall: {
    id: 'stonewall',
    name: 'Stonewall',
    title: 'Shard of the Monolith',
    role: 'Tank',
    icon: '🗿',
    color: 0x7a6a5a,
    base: {
      maxHp: 700, maxMana: 300, hpRegen: 2.2, manaRegen: 1.6, armor: 40, magicResist: 30,
      attackDamage: 60, attackRange: 1.6, attackSpeed: 0.63, moveSpeed: 5.9, radius: 1.1, ranged: false,
    },
    perLevel: { maxHp: 108, maxMana: 40, hpRegen: 0.2, manaRegen: 0.1, armor: 4.8, magicResist: 2, attackDamage: 3.5, attackSpeedPct: 0.015 },
    abilities: [
      {
        id: 'seismicShard', name: 'Seismic Shard', icon: '🪨', color: 0xb09070,
        description: 'Hurl a shard of rock that slows the first enemy hit by 35%.',
        cooldown: 8, manaCost: 60, range: 13, requiredLevel: 1,
        damage: { base: 70, perLevel: 25, ap: 0.6, kind: 'magic' },
        effect: { type: 'skillshot', speed: 34, width: 0.8, status: { type: 'slow', amount: 0.35, duration: 2 } },
      },
      {
        id: 'thunderclap', name: 'Thunderclap', icon: '🏔️', color: 0xd0c0a0,
        description: 'Gain 40 armor and 20% attack speed for 4s.',
        cooldown: 12, manaCost: 30, range: 0, requiredLevel: 1,
        effect: { type: 'buff', duration: 4, armor: 40, attackSpeedPct: 0.2 },
      },
      {
        id: 'groundSlam', name: 'Ground Slam', icon: '💥', color: 0xc0a080,
        description: 'Slam the ground, slowing nearby enemies by 30%.',
        cooldown: 7, manaCost: 50, range: 0, requiredLevel: 1,
        damage: { base: 60, perLevel: 25, ap: 0.6, kind: 'magic' },
        effect: { type: 'nova', radius: 4, status: { type: 'slow', amount: 0.3, duration: 2 } },
      },
      {
        id: 'unstoppableForce', name: 'Unstoppable Force', icon: '🚀', color: 0xff9a40,
        description: 'Charge a long distance, knocking up (stunning) everyone in your path for 1.5s.',
        cooldown: 70, manaCost: 100, range: 12, requiredLevel: ULT_LEVEL,
        damage: { base: 150, perLevel: 50, ap: 0.8, kind: 'magic' },
        effect: { type: 'dash', speed: 40, hitRadius: 3, status: { type: 'stun', duration: 1.5 } },
      },
    ],
    build: ['platedBoots', 'wardTotem', 'sunforgeAegis', 'titanPlate', 'verdantVisage', 'spellguardMail'],
  },

  volt: {
    id: 'volt',
    name: 'Volt',
    title: 'the Sheriff',
    role: 'Marksman',
    icon: '🔫',
    color: 0x6a3aa0,
    base: {
      maxHp: 560, maxMana: 300, hpRegen: 1.4, manaRegen: 1.8, armor: 22, magicResist: 30,
      attackDamage: 58, attackRange: 9, attackSpeed: 0.62, moveSpeed: 6, radius: 0.7, ranged: true,
    },
    perLevel: { maxHp: 88, maxMana: 35, hpRegen: 0.15, manaRegen: 0.1, armor: 3.6, magicResist: 1.3, attackDamage: 3.2, attackSpeedPct: 0.03 },
    abilities: [
      {
        id: 'peacemaker', name: 'Peacemaker', icon: '📍', color: 0xffe0a0,
        description: 'Fire a long-range round that pierces every enemy in a line.',
        cooldown: 9, manaCost: 50, range: 18, requiredLevel: 1,
        damage: { base: 50, perLevel: 30, ad: 1.2, kind: 'physical' },
        effect: { type: 'skillshot', speed: 50, width: 0.7, pierce: true },
      },
      {
        id: 'snapTrap', name: 'Snap Trap', icon: '🪤', color: 0xc08040,
        description: 'Set a trap that snaps shut after 1.2s, rooting enemies on it.',
        cooldown: 12, manaCost: 40, range: 10, requiredLevel: 1,
        damage: { base: 40, perLevel: 20, ad: 0.4, kind: 'physical' },
        effect: { type: 'zone', radius: 1.8, delay: 1.2, status: { type: 'root', duration: 1.5 } },
      },
      {
        id: 'caliberNet', name: 'Caliber Net', icon: '🕸️', color: 0xa0a0ff,
        description: 'Kick back, hopping away from the cursor.',
        cooldown: 12, manaCost: 40, range: 5, requiredLevel: 1,
        effect: { type: 'dash', speed: 30, hitRadius: 0, backward: true },
      },
      {
        id: 'aceInTheHole', name: 'Ace in the Hole', icon: '🎖️', color: 0xff3030,
        description: 'Take careful aim and shoot the enemy nearest the cursor from very far away.',
        cooldown: 70, manaCost: 100, range: 30, requiredLevel: ULT_LEVEL,
        damage: { base: 250, perLevel: 60, ad: 1.5, kind: 'physical' },
        effect: { type: 'strike' },
      },
    ],
    build: ['swiftstrideBoots', 'wardTotem', 'stormBow', 'crimsonEdge', 'trinityEdge', 'quicksilverSaber'],
  },

  tempest: {
    id: 'tempest',
    name: 'Tempest',
    title: 'the Unforgiven',
    role: 'Fighter',
    icon: '⛩️',
    color: 0x3a6a9a,
    base: {
      maxHp: 600, maxMana: 250, hpRegen: 1.8, manaRegen: 2, armor: 30, magicResist: 32,
      attackDamage: 62, attackRange: 1.6, attackSpeed: 0.7, moveSpeed: 6.3, radius: 0.8, ranged: false,
    },
    perLevel: { maxHp: 95, maxMana: 20, hpRegen: 0.2, manaRegen: 0.1, armor: 4.2, magicResist: 1.8, attackDamage: 3.6, attackSpeedPct: 0.03 },
    abilities: [
      {
        id: 'steelTempest', name: 'Steel Tempest', icon: '🍃', color: 0xcfe8ff,
        description: 'Thrust forward, piercing every enemy in a short line.',
        cooldown: 3, manaCost: 0, range: 5, requiredLevel: 1,
        damage: { base: 30, perLevel: 25, ad: 1.0, kind: 'physical' },
        effect: { type: 'skillshot', speed: 45, width: 0.9, pierce: true },
      },
      {
        id: 'windShield', name: 'Wind Shield', icon: '🧱', color: 0xa8d8ff,
        description: 'Wrap yourself in wind, gaining a shield for 2.5s.',
        cooldown: 16, manaCost: 0, range: 0, requiredLevel: 1,
        effect: { type: 'buff', duration: 2.5, shield: { base: 70, perLevel: 25, ad: 0.2, kind: 'true' } },
      },
      {
        id: 'sweepingBlade', name: 'Sweeping Blade', icon: '🌊', color: 0x9fd0ff,
        description: 'Dash through enemies, cutting each one you pass.',
        cooldown: 4, manaCost: 0, range: 5, requiredLevel: 1,
        damage: { base: 40, perLevel: 15, ad: 0.6, kind: 'physical' },
        effect: { type: 'dash', speed: 32, hitRadius: 1.3 },
      },
      {
        id: 'lastBreath', name: 'Last Breath', icon: '🌬️', color: 0x7fc0ff,
        description: 'Blink to the enemy nearest the cursor, slicing and stunning them for 1s.',
        cooldown: 50, manaCost: 0, range: 9, requiredLevel: ULT_LEVEL,
        damage: { base: 200, perLevel: 60, ad: 1.2, kind: 'physical' },
        effect: { type: 'strike', status: { type: 'stun', duration: 1 } },
      },
    ],
    build: ['swiftstrideBoots', 'wardTotem', 'trinityEdge', 'crimsonEdge', 'sunforgeAegis', 'quicksilverSaber'],
  },
};

export const CHAMPION_IDS = Object.keys(CHAMPIONS);

const abilityIndex = new Map<string, AbilityDef>();
for (const c of Object.values(CHAMPIONS)) for (const a of c.abilities) abilityIndex.set(a.id, a);

export function getAbility(id: string): AbilityDef | undefined {
  return abilityIndex.get(id);
}
