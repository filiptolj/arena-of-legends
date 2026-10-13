export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

export const MAX_LEVEL = 18;
/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level: number): number => 180 + 100 * level;

export const STARTING_GOLD = 500;
export const PASSIVE_GOLD_PER_SEC = 2;
export const XP_SHARE_RANGE = 16;
export const CHAMPION_KILL_GOLD = 300;
export const TOWER_GOLD = 250;
export const respawnTime = (level: number): number => 6 + 2 * level;
export const RECALL_TIME = 8;

export const FIRST_WAVE_AT = 5;
export const WAVE_INTERVAL = 30;
export const MINION_SPAWN_SPACING = 1.8;

export const FOUNTAIN_HEAL_PCT = 0.12;
export const FOUNTAIN_DPS = 600;

/** How long towers and minions focus a champion after it hits an enemy champion near them. */
export const CHAMPION_AGGRO_TIME = 2.5;

export const MINION_AGGRO_RANGE = 8;
export const MINION_LEASH = 14;

export interface UnitStats {
  maxHp: number;
  maxMana: number;
  hpRegen: number;
  manaRegen: number;
  armor: number;
  magicResist: number;
  attackDamage: number;
  attackRange: number;
  attackSpeed: number;
  moveSpeed: number;
  radius: number;
  ranged: boolean;
}

export const MINION_STATS: Record<'melee' | 'caster', UnitStats & { gold: number; xp: number }> = {
  melee: {
    maxHp: 480, maxMana: 0, hpRegen: 0, manaRegen: 0, armor: 0, magicResist: 0,
    attackDamage: 12, attackRange: 1.2, attackSpeed: 1.25, moveSpeed: 5.2, radius: 0.6, ranged: false,
    gold: 21, xp: 60,
  },
  caster: {
    maxHp: 300, maxMana: 0, hpRegen: 0, manaRegen: 0, armor: 0, magicResist: 0,
    attackDamage: 23, attackRange: 6, attackSpeed: 0.67, moveSpeed: 5.2, radius: 0.5, ranged: true,
    gold: 14, xp: 30,
  },
};

export const TOWER_STATS: UnitStats = {
  maxHp: 3000, maxMana: 0, hpRegen: 0, manaRegen: 0, armor: 40, magicResist: 40,
  attackDamage: 150, attackRange: 10, attackSpeed: 0.83, moveSpeed: 0, radius: 2, ranged: true,
};

export const NEXUS_STATS: UnitStats = {
  maxHp: 4000, maxMana: 0, hpRegen: 0, manaRegen: 0, armor: 0, magicResist: 0,
  attackDamage: 0, attackRange: 0, attackSpeed: 0, moveSpeed: 0, radius: 4, ranged: false,
};

export const PROJECTILE_SPEED = {
  attack: 25,
  caster: 20,
  tower: 30,
} as const;

// ---------------------------------------------------------------------------
// Vision

export const SIGHT_RANGE: Record<'champion' | 'minion' | 'tower' | 'nexus' | 'monster' | 'ward', number> = {
  champion: 14,
  minion: 10,
  tower: 15,
  nexus: 18,
  monster: 0,
  ward: 11,
};
/** How long a unit stays visible after attacking or casting from brush. */
export const REVEAL_TIME = 1.2;

// ---------------------------------------------------------------------------
// Jungle

export interface MonsterDef extends UnitStats {
  name: string;
  gold: number;
  xp: number;
}

const monster = (name: string, maxHp: number, attackDamage: number, radius: number, gold: number, xp: number, extra: Partial<UnitStats> = {}): MonsterDef => ({
  name, maxHp, attackDamage, radius, gold, xp,
  maxMana: 0, hpRegen: 0, manaRegen: 0, armor: 15, magicResist: 15,
  attackRange: 1.4, attackSpeed: 0.7, moveSpeed: 5.5, ranged: false,
  ...extra,
});

export const MONSTERS = {
  alphaWolf: monster('Alpha Wolf', 1000, 32, 1.0, 55, 90),
  wolf: monster('Wolf', 420, 14, 0.7, 20, 35),
  raptorMatriarch: monster('Raptor Matriarch', 850, 26, 0.9, 50, 80),
  raptor: monster('Raptor', 260, 10, 0.55, 12, 20),
  golem: monster('Azure Golem', 2000, 48, 1.5, 100, 160, { armor: 20 }),
  sentinel: monster('Crimson Sentinel', 2000, 55, 1.5, 100, 160, { armor: 20 }),
  drake: monster('Ember Drake', 4500, 95, 2.4, 0, 400, { armor: 30, magicResist: 30, attackRange: 2.5 }),
} satisfies Record<string, MonsterDef>;

export type MonsterType = keyof typeof MONSTERS;

export interface CampSpec {
  /** Monster types with offsets from the camp center. */
  monsters: { type: MonsterType; offset: { x: number; y: number } }[];
  firstSpawn: number;
  respawn: number;
  epic?: boolean;
}

export const CAMP_SPECS = {
  wolves: {
    monsters: [
      { type: 'alphaWolf', offset: { x: 0, y: 0 } },
      { type: 'wolf', offset: { x: -2, y: 1.5 } },
      { type: 'wolf', offset: { x: 2, y: 1.5 } },
    ],
    firstSpawn: 60,
    respawn: 75,
  },
  raptors: {
    monsters: [
      { type: 'raptorMatriarch', offset: { x: 0, y: 0 } },
      { type: 'raptor', offset: { x: -1.6, y: -1.2 } },
      { type: 'raptor', offset: { x: 1.6, y: -1.2 } },
      { type: 'raptor', offset: { x: 0, y: 1.8 } },
    ],
    firstSpawn: 60,
    respawn: 75,
  },
  golem: { monsters: [{ type: 'golem', offset: { x: 0, y: 0 } }], firstSpawn: 75, respawn: 150 },
  sentinel: { monsters: [{ type: 'sentinel', offset: { x: 0, y: 0 } }], firstSpawn: 75, respawn: 150 },
  drake: { monsters: [{ type: 'drake', offset: { x: 0, y: 0 } }], firstSpawn: 180, respawn: 300, epic: true },
} satisfies Record<string, CampSpec>;

/** Monsters give up the chase beyond this distance from home. */
export const MONSTER_LEASH = 11;
export const MONSTER_MAX_CHASE = 8;

export const BLESSING_DURATION = 90;
/** Crimson: auto-attacks burn for bonus true damage and slow. */
export const crimsonBurn = (level: number): number => 8 + 2 * level;
/** Azure: extra cooldown reduction and mana regen. */
export const AZURE_CDR = 0.15;
export const AZURE_MANA_REGEN = 4;
/** Drake: every living champion on the slaying team gets this much gold. */
export const DRAKE_TEAM_GOLD = 150;
export const WARD_LIFETIME = 90;
export const WARD_GOLD = 30;
