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
