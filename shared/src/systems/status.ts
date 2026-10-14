import { type Vec2, dist, moveToward, normalize, sub } from '../math.js';
import { type Blessing, type Entity, type OnHitStatus, isStructure } from '../types.js';
import type { World } from '../world.js';

const MAX_ATTACK_SPEED = 2.5;

/** Stunned or in stasis: can't move, attack or cast. */
export function isStunned(e: Entity): boolean {
  return e.statuses.some((s) => s.type === 'stun' || s.type === 'stasis');
}

export function isRooted(e: Entity): boolean {
  return e.statuses.some((s) => s.type === 'root');
}

export function isStealthed(e: Entity): boolean {
  return e.statuses.some((s) => s.type === 'stealth');
}

export function inStasis(e: Entity): boolean {
  return e.statuses.some((s) => s.type === 'stasis');
}

export function hasBlessing(e: Entity, b: Blessing): boolean {
  return e.statuses.some((s) => s.type === 'blessing' && s.blessing === b);
}

export function attackSpeedOf(e: Entity): number {
  let bonus = 0;
  for (const s of e.statuses) if (s.type === 'buff') bonus += s.attackSpeedPct;
  return Math.min(MAX_ATTACK_SPEED, e.attackSpeed * (1 + bonus));
}

export function moveSpeedOf(e: Entity): number {
  let slow = 0;
  let haste = 0;
  for (const s of e.statuses) {
    if (s.type === 'slow') slow = Math.max(slow, s.amount);
    else if (s.type === 'buff') haste += s.moveSpeedPct;
  }
  return e.moveSpeed * (1 + haste) * (1 - slow);
}

export function armorOf(e: Entity): number {
  let armor = e.armor;
  for (const s of e.statuses) if (s.type === 'buff') armor += s.armor;
  return armor;
}

export function shieldOf(e: Entity): number {
  let total = 0;
  for (const s of e.statuses) if (s.type === 'shield') total += s.amount;
  return total;
}

/** Where an effect came from, for pulls and knockbacks. */
export interface StatusContext {
  world: World;
  origin: Vec2;
}

export function applyStatus(e: Entity, st: OnHitStatus, ctx?: StatusContext): void {
  if (e.dead || isStructure(e) || e.kind === 'ward' || inStasis(e)) return;
  switch (st.type) {
    case 'stun':
      e.statuses.push({ type: 'stun', remaining: st.duration });
      break;
    case 'root':
      e.statuses.push({ type: 'root', remaining: st.duration });
      break;
    case 'slow':
      e.statuses.push({ type: 'slow', amount: st.amount ?? 0.3, remaining: st.duration });
      break;
    case 'pull':
      if (ctx) displace(e, ctx.world, moveToward(ctx.origin, e.pos, 1.8 + e.radius));
      if (st.duration > 0) e.statuses.push({ type: 'stun', remaining: st.duration });
      break;
    case 'knockback': {
      if (!ctx) break;
      let away = normalize(sub(e.pos, ctx.origin));
      if (away.x === 0 && away.y === 0) away = { x: 0, y: 1 };
      const amount = st.amount ?? 3;
      displace(e, ctx.world, { x: e.pos.x + away.x * amount, y: e.pos.y + away.y * amount });
      if (st.duration > 0) e.statuses.push({ type: 'stun', remaining: st.duration });
      break;
    }
  }
}

/** Slides a unit toward `to`, stopping at the last walkable point (no wall clipping). */
function displace(e: Entity, world: World, to: Vec2): void {
  const from = { ...e.pos };
  const total = dist(from, to);
  const steps = Math.max(1, Math.ceil(total / 0.4));
  let last = from;
  for (let i = 1; i <= steps; i++) {
    const p = moveToward(from, to, (total * i) / steps);
    if (!world.nav.isWalkable(p)) break;
    last = p;
  }
  e.pos = last;
  e.path = [];
  e.pathGoal = null;
  if (e.champion) e.champion.dash = null;
}

/** Removes crowd control (cleanse effects). */
export function cleanse(e: Entity): void {
  e.statuses = e.statuses.filter((s) => s.type !== 'slow' && s.type !== 'stun' && s.type !== 'root');
}

/** Consumes shields; returns the damage left over. */
export function absorbWithShields(e: Entity, amount: number): number {
  let left = amount;
  for (const s of e.statuses) {
    if (s.type !== 'shield' || left <= 0) continue;
    const used = Math.min(s.amount, left);
    s.amount -= used;
    left -= used;
  }
  e.statuses = e.statuses.filter((s) => s.type !== 'shield' || s.amount > 0);
  return left;
}

export function tickStatuses(e: Entity, dt: number): void {
  if (e.statuses.length === 0) return;
  e.statuses = e.statuses.filter((s) => (s.remaining -= dt) > 0);
}
