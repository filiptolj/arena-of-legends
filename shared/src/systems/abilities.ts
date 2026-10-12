import { type AbilityDef, CHAMPIONS, type DamageSpec, getAbility } from '../champions.js';
import { type Vec2, dist, distToSegment, moveToward, normalize, sub } from '../math.js';
import type { AbilitySlot, Entity } from '../types.js';
import type { World } from '../world.js';
import { applyDamage } from './combat.js';
import { clearPath, faceToward } from './movement.js';
import { applyStatus, isStunned } from './status.js';

export type CastFailure = 'dead' | 'stunned' | 'cooldown' | 'mana' | 'level';

/** Damage (or shield) an ability spec deals for this caster right now. */
export function scaledValue(spec: DamageSpec, caster: Entity): number {
  const level = caster.champion?.level ?? 1;
  return spec.base + spec.perLevel * (level - 1) + (spec.ad ?? 0) * caster.attackDamage + (spec.ap ?? 0) * caster.abilityPower;
}

export function abilityDamage(def: AbilityDef, caster: Entity): number {
  return def.damage ? scaledValue(def.damage, caster) : 0;
}

export function abilityCooldown(def: AbilityDef, caster: Entity): number {
  return def.cooldown * (1 - caster.cooldownReduction);
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
  return null;
}

/** Attempts to cast; returns true on success. */
export function castAbility(world: World, e: Entity, slot: AbilitySlot, target: Vec2): boolean {
  if (castBlocker(e, slot)) return false;
  const c = e.champion!;
  const def = abilityOf(e, slot);
  const dir = normalize(sub(target, e.pos));
  const aim = dir.x === 0 && dir.y === 0 ? { x: Math.sin(e.facing), y: Math.cos(e.facing) } : dir;
  const damage = abilityDamage(def, e);
  const kind = def.damage?.kind ?? 'magic';
  const fx = def.effect;

  switch (fx.type) {
    case 'skillshot':
      world.projectiles.push({
        id: world.newId(),
        team: e.team,
        sourceId: e.id,
        visual: 'ability',
        abilityId: def.id,
        pos: { ...e.pos },
        prevPos: { ...e.pos },
        speed: fx.speed,
        damage,
        damageKind: kind,
        isAttack: false,
        dir: aim,
        width: fx.width,
        remainingRange: def.range,
        pierce: fx.pierce,
        status: fx.status,
      });
      break;
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
      const wanted = { x: e.pos.x + aim.x * def.range, y: e.pos.y + aim.y * def.range };
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
      const victims = world.unitsNear(e.pos, fx.radius, (o) => o.team !== e.team && (o.kind === 'champion' || o.kind === 'minion'));
      for (const v of victims) {
        applyDamage(world, e.id, v, damage, kind);
        if (fx.status) applyStatus(v, fx.status);
      }
      break;
    }
    case 'zone': {
      const pos = fx.atSelf ? { ...e.pos } : dist(e.pos, target) > def.range ? moveToward(e.pos, target, def.range) : { ...target };
      world.zones.push({
        id: world.newId(),
        team: e.team,
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
      if (fx.shield) e.statuses.push({ type: 'shield', amount: scaledValue(fx.shield, e), remaining: fx.duration });
      world.emit({ type: 'buff', id: e.id, abilityId: def.id });
      break;
  }

  if (fx.type === 'skillshot' || fx.type === 'blink' || fx.type === 'dash' || (fx.type === 'zone' && !fx.atSelf)) {
    faceToward(e, target);
  }
  e.mana -= def.manaCost;
  c.abilities[slot].cooldown = abilityCooldown(def, e);
  world.emit({ type: 'cast', id: e.id, slot, abilityId: def.id, pos: { ...e.pos }, target: { ...target } });
  return true;
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
    const damage = abilityDamage(def, e);
    for (const o of world.entities.values()) {
      if (o.dead || o.team === e.team || (o.kind !== 'champion' && o.kind !== 'minion')) continue;
      if (dash.hitIds.includes(o.id)) continue;
      if (distToSegment(o.pos, from, e.pos) > dash.hitRadius + o.radius) continue;
      dash.hitIds.push(o.id);
      if (damage > 0) applyDamage(world, e.id, o, damage, def.damage?.kind ?? 'physical');
      if (fx.type === 'dash' && fx.status) applyStatus(o, fx.status);
    }
  }

  if (dist(e.pos, dash.to) < 1e-3) {
    c.dash = null;
    return false;
  }
  return true;
}
