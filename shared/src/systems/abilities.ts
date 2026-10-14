import { type AbilityDef, CHAMPIONS, type DamageSpec, getAbility } from '../champions.js';
import { AZURE_CDR, SIGHT_RANGE, WARD_LIFETIME } from '../constants.js';
import { ITEMS, spendCharge } from '../items.js';
import { type Vec2, dist, distToSegment, moveToward, normalize, sub } from '../math.js';
import type { Team } from '../map.js';
import type { AbilitySlot, Entity } from '../types.js';
import type { World } from '../world.js';
import { applyDamage, canTarget, reveal } from './combat.js';
import { clearPath, faceToward } from './movement.js';
import { applyStatus, cleanse, hasBlessing, isRooted, isStunned } from './status.js';

/** How close to the cursor a targeted ability looks for its victim. */
const STRIKE_CURSOR_RADIUS = 3;

const MAX_WARDS_PER_CHAMPION = 2;
const MAX_TOTAL_CDR = 0.55;

export type CastFailure = 'dead' | 'stunned' | 'cooldown' | 'mana' | 'level';

/** Damage (or shield) an ability spec deals for this caster right now. */
export function scaledValue(spec: DamageSpec, caster: Entity): number {
  const level = caster.champion?.level ?? 1;
  return spec.base + spec.perLevel * (level - 1) + (spec.ad ?? 0) * caster.attackDamage + (spec.ap ?? 0) * caster.abilityPower;
}

export function abilityDamage(def: AbilityDef, caster: Entity): number {
  return def.damage ? scaledValue(def.damage, caster) : 0;
}

/** Damage against a specific target, including missing-health execute scaling. */
export function damageAgainst(def: AbilityDef, caster: Entity, target: Entity): number {
  if (!def.damage) return 0;
  return scaledValue(def.damage, caster) + (def.damage.missingHp ?? 0) * Math.max(0, target.maxHp - target.hp);
}

/** The victim a targeted ability would hit: the visible enemy nearest the cursor, in range. */
export function strikeTarget(world: World, caster: Entity, def: AbilityDef, cursor: Vec2): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const o of world.entities.values()) {
    if (!isUnit(o) || !canTarget(world, caster, o)) continue;
    const d = dist(o.pos, cursor);
    if (d > STRIKE_CURSOR_RADIUS + o.radius || dist(o.pos, caster.pos) - o.radius > def.range) continue;
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

export function abilityCooldown(def: AbilityDef, caster: Entity): number {
  const cdr = caster.cooldownReduction + (hasBlessing(caster, 'azure') ? AZURE_CDR : 0);
  return def.cooldown * (1 - Math.min(MAX_TOTAL_CDR, cdr));
}

/** An item's active presented as an ability, so it runs through the same effect code. */
export function itemActiveAbility(itemId: string): AbilityDef | null {
  const item = ITEMS[itemId];
  if (!item?.active) return null;
  const a = item.active;
  return {
    id: `item:${itemId}`,
    name: a.name,
    description: a.description,
    icon: item.icon,
    color: 0xffe9a8,
    cooldown: a.cooldown,
    manaCost: 0,
    range: a.range,
    requiredLevel: 1,
    effect: a.effect,
  };
}

export type ItemUseFailure = 'dead' | 'stunned' | 'cooldown' | 'empty' | 'noActive';

export function itemUseBlocker(e: Entity, slot: number): ItemUseFailure | null {
  const c = e.champion;
  if (!c || e.dead) return 'dead';
  const id = c.items[slot];
  if (!id) return 'empty';
  // Potions can be drunk any time (even stunned).
  if (ITEMS[id].consumable) return null;
  if (!ITEMS[id].active) return 'noActive';
  if ((c.itemCooldowns[id] ?? 0) > 0) return 'cooldown';
  const isCleanse = ITEMS[id].active!.effect.type === 'cleanse';
  if (c.dash || (isStunned(e) && !isCleanse)) return 'stunned';
  return null;
}

/** Uses the active of the item in `slot`; returns true on success. Item cooldowns ignore CDR. */
export function useItemActive(world: World, e: Entity, slot: number, target: Vec2): boolean {
  if (itemUseBlocker(e, slot)) return false;
  const c = e.champion!;
  const id = c.items[slot]!;
  const potion = ITEMS[id].consumable;
  if (potion) {
    e.statuses.push({ type: 'regen', hpPerSec: potion.hpPerSec ?? 0, manaPerSec: potion.manaPerSec ?? 0, remaining: potion.duration });
    spendCharge(e, slot);
    world.emit({ type: 'itemUsed', id: e.id, itemId: id, pos: { ...e.pos } });
    return true;
  }
  const def = itemActiveAbility(id)!;
  if (!performAbility(world, e, def, target)) return false;
  c.itemCooldowns[id] = def.cooldown;
  world.emit({ type: 'itemUsed', id: e.id, itemId: id, pos: { ...target } });
  return true;
}

export function abilityOf(e: Entity, slot: AbilitySlot): AbilityDef {
  return CHAMPIONS[e.champion!.defId].abilities[slot];
}

/** Why an ability can't be cast right now, or null if it can. */
export function castBlocker(e: Entity, slot: AbilitySlot): CastFailure | null {
  const c = e.champion;
  if (!c || e.dead) return 'dead';
  const def = abilityOf(e, slot);
  if (c.level < def.requiredLevel) return 'level';
  if (c.abilities[slot].cooldown > 0) return 'cooldown';
  if (e.mana < def.manaCost) return 'mana';
  if (isStunned(e) || c.dash) return 'stunned';
  if (isRooted(e) && (def.effect.type === 'dash' || def.effect.type === 'blink')) return 'stunned';
  return null;
}

/** Attempts to cast; returns true on success. */
export function castAbility(world: World, e: Entity, slot: AbilitySlot, target: Vec2): boolean {
  if (castBlocker(e, slot)) return false;
  const c = e.champion!;
  const def = abilityOf(e, slot);
  if (!performAbility(world, e, def, target)) return false;
  e.mana -= def.manaCost;
  c.abilities[slot].cooldown = abilityCooldown(def, e);
  world.emit({ type: 'cast', id: e.id, slot, abilityId: def.id, pos: { ...e.pos }, target: { ...target } });
  return true;
}

/** Runs an ability's effect (no cost or cooldown handling). Returns false if it had nothing to hit. */
function performAbility(world: World, e: Entity, def: AbilityDef, target: Vec2): boolean {
  const c = e.champion!;
  const team = e.team as Team;
  const dir = normalize(sub(target, e.pos));
  const aim = dir.x === 0 && dir.y === 0 ? { x: Math.sin(e.facing), y: Math.cos(e.facing) } : dir;
  const damage = abilityDamage(def, e);
  const kind = def.damage?.kind ?? 'magic';
  const fx = def.effect;

  switch (fx.type) {
    case 'skillshot': {
      const count = fx.count ?? 1;
      const spread = fx.spread ?? 0;
      const base = Math.atan2(aim.y, aim.x);
      for (let i = 0; i < count; i++) {
        const angle = count === 1 ? base : base - spread / 2 + (spread * i) / (count - 1);
        world.projectiles.push({
          id: world.newId(),
          team,
          sourceId: e.id,
          visual: 'ability',
          abilityId: def.id,
          pos: { ...e.pos },
          prevPos: { ...e.pos },
          speed: fx.speed,
          damage,
          damageKind: kind,
          isAttack: false,
          dir: { x: Math.cos(angle), y: Math.sin(angle) },
          width: fx.width,
          remainingRange: def.range,
          pierce: fx.pierce,
          status: fx.status,
        });
      }
      break;
    }
    case 'blink': {
      const from = { ...e.pos };
      const to = world.nav.nearestWalkable(moveToward(e.pos, target, def.range), 8);
      e.pos = { ...to };
      e.prevPos = { ...to };
      clearPath(e);
      world.emit({ type: 'blink', id: e.id, abilityId: def.id, from, to });
      break;
    }
    case 'dash': {
      // Stop at the last walkable point along the line so dashes don't cross walls.
      const sign = fx.backward ? -1 : 1;
      const wanted = { x: e.pos.x + sign * aim.x * def.range, y: e.pos.y + sign * aim.y * def.range };
      let to = { ...e.pos };
      const steps = Math.ceil(def.range / 0.4);
      for (let i = 1; i <= steps; i++) {
        const p = moveToward(e.pos, wanted, (def.range * i) / steps);
        if (!world.nav.isWalkable(p)) break;
        to = p;
      }
      c.dash = { to, speed: fx.speed, abilityId: def.id, hitRadius: fx.hitRadius, hitIds: [] };
      clearPath(e);
      break;
    }
    case 'nova': {
      world.emit({ type: 'nova', id: e.id, abilityId: def.id, pos: { ...e.pos }, radius: fx.radius });
      const victims = world.unitsNear(e.pos, fx.radius, (o) => o.team !== e.team && isUnit(o));
      for (const v of victims) {
        applyDamage(world, e.id, v, damageAgainst(def, e, v), kind);
        if (fx.status) applyStatus(v, fx.status, { world, origin: e.pos });
      }
      break;
    }
    case 'strike': {
      const victim = strikeTarget(world, e, def, target);
      if (!victim) return false;
      world.emit({ type: 'strike', id: e.id, targetId: victim.id, abilityId: def.id, pos: { ...victim.pos } });
      applyDamage(world, e.id, victim, damageAgainst(def, e, victim), kind);
      if (fx.status) applyStatus(victim, fx.status, { world, origin: e.pos });
      faceToward(e, victim.pos);
      break;
    }
    case 'heal': {
      world.emit({ type: 'heal', id: e.id, abilityId: def.id, pos: { ...e.pos }, radius: fx.radius });
      const amount = def.damage ? scaledValue(def.damage, e) : 0;
      const allies = world.unitsNear(e.pos, fx.radius, (o) => o.team === e.team && o.kind === 'champion');
      for (const a of allies) {
        const healed = Math.min(amount, a.maxHp - a.hp);
        a.hp += healed;
        if (healed > 0) world.emit({ type: 'healed', id: a.id, sourceId: e.id, amount: healed });
      }
      break;
    }
    case 'cleanse':
      cleanse(e);
      e.statuses.push({ type: 'buff', remaining: fx.duration, attackSpeedPct: 0, moveSpeedPct: fx.moveSpeedPct, armor: 0 });
      world.emit({ type: 'buff', id: e.id, abilityId: def.id });
      break;
    case 'zone': {
      const pos = fx.atSelf ? { ...e.pos } : dist(e.pos, target) > def.range ? moveToward(e.pos, target, def.range) : { ...target };
      world.zones.push({
        id: world.newId(),
        team,
        sourceId: e.id,
        abilityId: def.id,
        pos,
        radius: fx.radius,
        delay: fx.delay,
        totalDelay: fx.delay,
        damage,
        damageKind: kind,
        status: fx.status,
      });
      break;
    }
    case 'buff':
      e.statuses.push({
        type: 'buff',
        remaining: fx.duration,
        attackSpeedPct: fx.attackSpeedPct ?? 0,
        moveSpeedPct: fx.moveSpeedPct ?? 0,
        armor: fx.armor ?? 0,
      });
      if (fx.shield || fx.shieldPctMaxHp) {
        const amount = (fx.shield ? scaledValue(fx.shield, e) : 0) + (fx.shieldPctMaxHp ?? 0) * e.maxHp;
        e.statuses.push({ type: 'shield', amount, remaining: fx.duration });
      }
      if (fx.healPctMaxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * fx.healPctMaxHp);
      if (fx.stealth) e.statuses.push({ type: 'stealth', remaining: fx.duration });
      world.emit({ type: 'buff', id: e.id, abilityId: def.id });
      break;
    case 'stasis':
      e.statuses.push({ type: 'stasis', remaining: fx.duration });
      e.order = { type: 'idle' };
      e.targetId = null;
      clearPath(e);
      world.emit({ type: 'buff', id: e.id, abilityId: def.id });
      break;
    case 'ward':
      placeWard(world, e, dist(e.pos, target) > def.range ? moveToward(e.pos, target, def.range) : target, fx.lifetime ?? WARD_LIFETIME);
      break;
  }

  const aimed = fx.type === 'skillshot' || fx.type === 'blink' || (fx.type === 'dash' && !fx.backward) || (fx.type === 'zone' && !fx.atSelf);
  if (aimed) faceToward(e, target);
  // Casting gives away your position — except wards and going invisible.
  const quiet = fx.type === 'ward' || (fx.type === 'buff' && fx.stealth);
  if (!quiet) reveal(world, e);
  return true;
}

const isUnit = (o: Entity): boolean => o.kind === 'champion' || o.kind === 'minion' || o.kind === 'monster';

function placeWard(world: World, owner: Entity, at: Vec2, lifetime: number): void {
  const pos = world.nav.nearestWalkable(at, 6);
  // Only the newest few wards per champion survive.
  const mine = [...world.entities.values()]
    .filter((w) => w.kind === 'ward' && !w.dead && w.ward?.ownerId === owner.id)
    .sort((a, b) => a.ward!.expiresAt - b.ward!.expiresAt);
  while (mine.length >= MAX_WARDS_PER_CHAMPION) mine.shift()!.dead = true;

  const w = world.createEntity('ward', owner.team, pos, {
    maxHp: 3, maxMana: 0, hpRegen: 0, manaRegen: 0, armor: 0, magicResist: 0,
    attackDamage: 0, attackRange: 0, attackSpeed: 0, moveSpeed: 0, radius: 0.4, ranged: false,
  });
  w.sightRange = SIGHT_RANGE.ward;
  w.ward = { ownerId: owner.id, expiresAt: world.time + lifetime };
  world.emit({ type: 'wardPlaced', id: w.id, ownerId: owner.id, pos: { ...pos } });
}

/** Advances an active dash. Returns true while the champion is still dashing. */
export function updateDash(world: World, e: Entity, dt: number): boolean {
  const c = e.champion;
  const dash = c?.dash;
  if (!c || !dash) return false;
  const from = { ...e.pos };
  e.pos = moveToward(e.pos, dash.to, dash.speed * dt);
  faceToward(e, dash.to);

  const def = getAbility(dash.abilityId);
  if (def && dash.hitRadius > 0) {
    const fx = def.effect;
    for (const o of world.entities.values()) {
      if (o.dead || o.team === e.team || !isUnit(o)) continue;
      if (dash.hitIds.includes(o.id)) continue;
      if (distToSegment(o.pos, from, e.pos) > dash.hitRadius + o.radius) continue;
      dash.hitIds.push(o.id);
      const damage = damageAgainst(def, e, o);
      if (damage > 0) applyDamage(world, e.id, o, damage, def.damage?.kind ?? 'physical');
      if (fx.type === 'dash' && fx.status) applyStatus(o, fx.status, { world, origin: e.pos });
    }
  }

  if (dist(e.pos, dash.to) < 1e-3) {
    c.dash = null;
    return false;
  }
  return true;
}
