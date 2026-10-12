import type { Entity, OnHitStatus } from '../types.js';

const MAX_ATTACK_SPEED = 2.5;

export function isStunned(e: Entity): boolean {
  return e.statuses.some((s) => s.type === 'stun');
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

export function applyStatus(e: Entity, st: OnHitStatus): void {
  if (e.dead || e.kind === 'tower' || e.kind === 'nexus') return;
  if (st.type === 'stun') e.statuses.push({ type: 'stun', remaining: st.duration });
  else e.statuses.push({ type: 'slow', amount: st.amount ?? 0.3, remaining: st.duration });
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
