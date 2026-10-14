import {
  CHAMPION_AGGRO_TIME,
  CHAMPION_KILL_GOLD,
  DRAKE_TEAM_GOLD,
  INHIBITOR_GOLD,
  INHIBITOR_RESPAWN,
  MONSTERS,
  REVEAL_TIME,
  WARD_GOLD,
  crimsonBurn,
  MAX_LEVEL,
  MINION_STATS,
  PROJECTILE_SPEED,
  TOWER_GOLD,
  XP_SHARE_RANGE,
  respawnTime,
  xpToNext,
} from '../constants.js';
import { getAbility } from '../champions.js';
import { recomputeChampionStats } from '../items.js';
import { BLESSING_DURATION, CAMP_SPECS, type MonsterType } from '../constants.js';
import { MAP, type Team, otherTeam } from '../map.js';
import { dist, distToSegment, moveToward } from '../math.js';
import { type DamageKind, type Entity, type EntityId, type ProjectileVisual, isStructure } from '../types.js';
import type { World } from '../world.js';
import { clearPath } from './movement.js';
import { onMonsterDamaged } from './jungle.js';
import { absorbWithShields, applyStatus, armorOf, attackSpeedOf, hasBlessing, inStasis } from './status.js';
import { isVisibleTo } from './vision.js';

/** Damage within this many seconds before a champion kill earns an assist. */
const ASSIST_WINDOW = 10;

/** Edge-to-edge distance check against the attacker's range. */
export function inAttackRange(a: Entity, b: Entity, extra = 0): boolean {
  return dist(a.pos, b.pos) - a.radius - b.radius <= a.attackRange + extra;
}

/** Inner towers are protected by outer towers; the nexus by all inner towers. */
/**
 * League's destruction order: each lane's towers fall outer → inner → inhibitor turret,
 * then the inhibitor; nexus turrets need an inhibitor down; the nexus needs both nexus turrets down.
 */
export function isInvulnerable(world: World, e: Entity): boolean {
  if (inStasis(e)) return true;
  if (!isStructure(e)) return false;
  const tier = e.structure?.tier ?? 0;
  const lane = e.structure?.lane;
  const allies = [...world.entities.values()].filter((o) => !o.dead && o.team === e.team && o.structure);
  if (e.kind === 'tower' && lane) {
    return allies.some((o) => o.kind === 'tower' && o.structure!.lane === lane && (o.structure!.tier ?? 0) < tier);
  }
  if (e.kind === 'inhibitor') {
    return allies.some((o) => o.kind === 'tower' && o.structure!.lane === lane);
  }
  if (e.kind === 'tower' && tier === 4) {
    // Dead inhibitors stay in the world (they rebuild), so look for one that's down.
    return ![...world.entities.values()].some((o) => o.kind === 'inhibitor' && o.team === e.team && o.dead);
  }
  if (e.kind === 'nexus') {
    return allies.some((o) => o.kind === 'tower' && o.structure!.tier === 4);
  }
  return false;
}

/** Alive, hostile, damageable and visible to the attacker's team. */
export function canTarget(world: World, attacker: Entity, target: Entity | undefined): target is Entity {
  return (
    !!target &&
    !target.dead &&
    target.team !== attacker.team &&
    !isInvulnerable(world, target) &&
    isVisibleTo(world, attacker.team, target)
  );
}

/** Attacking or casting gives away your position, even from brush. */
export function reveal(world: World, e: Entity): void {
  if (!e.champion) return;
  e.revealedUntil = world.time + REVEAL_TIME;
  if (e.statuses.some((s) => s.type === 'stealth')) e.statuses = e.statuses.filter((s) => s.type !== 'stealth');
}

export function performAttack(world: World, attacker: Entity, target: Entity): void {
  attacker.attackCooldown = 1 / attackSpeedOf(attacker);
  reveal(world, attacker);
  world.emit({ type: 'attack', sourceId: attacker.id, targetId: target.id });
  if (!attacker.ranged) {
    applyDamage(world, attacker.id, target, attacker.attackDamage, 'physical', true);
    return;
  }
  const visual: ProjectileVisual =
    attacker.kind === 'tower' ? 'tower' : attacker.kind === 'minion' ? 'caster' : 'attack';
  world.projectiles.push({
    id: world.newId(),
    team: attacker.team as Team, // Only champions, casters and towers fire projectiles.
    sourceId: attacker.id,
    visual,
    pos: { ...attacker.pos },
    prevPos: { ...attacker.pos },
    speed: PROJECTILE_SPEED[visual as keyof typeof PROJECTILE_SPEED],
    damage: attacker.attackDamage,
    damageKind: 'physical',
    isAttack: true,
    targetId: target.id,
  });
}

/** Applies mitigated damage (shields absorb first). Auto-attacks heal the source by its lifesteal. */
export function applyDamage(world: World, sourceId: EntityId, target: Entity, raw: number, kind: DamageKind, isAttack = false): void {
  if (target.dead || isInvulnerable(world, target)) return;
  // Wards ignore abilities and break after a few hits.
  if (target.kind === 'ward') {
    if (!isAttack) return;
    raw = 1;
    kind = 'true';
  }
  const resist = kind === 'physical' ? armorOf(target) : kind === 'magic' ? target.magicResist : 0;
  const amount = raw * (100 / (100 + Math.max(0, resist)));
  target.hp -= absorbWithShields(target, amount);
  target.lastDamagedAt = world.time;
  world.emit({ type: 'damage', sourceId, targetId: target.id, amount, kind });

  const source = world.get(sourceId);
  if (isAttack && source && !source.dead && source.lifesteal > 0) {
    source.hp = Math.min(source.maxHp, source.hp + amount * source.lifesteal);
  }
  if (target.monster && source) onMonsterDamaged(world, target, source);
  // Crimson blessing: attacks burn and slow.
  if (isAttack && source && hasBlessing(source, 'crimson') && !target.dead && !isStructure(target)) {
    target.hp -= crimsonBurn(source.champion?.level ?? 1);
    applyStatus(target, { type: 'slow', amount: 0.15, duration: 1 });
  }
  if (target.champion) {
    world.cancelRecall(target);
    if (source?.champion) {
      source.champion.aggroUntil = world.time + CHAMPION_AGGRO_TIME;
      target.champion.lastChampionAttacker = { id: source.id, time: world.time };
      const recent = target.champion.recentAttackers.filter((a) => a.id !== source.id && world.time - a.time < ASSIST_WINDOW);
      recent.push({ id: source.id, time: world.time });
      target.champion.recentAttackers = recent;
    }
  }
  if (target.hp <= 0) handleDeath(world, target, source);
}

function handleDeath(world: World, victim: Entity, killer: Entity | undefined): void {
  victim.hp = 0;
  victim.dead = true;
  victim.targetId = null;
  // Jungle blessings pass to the champion who takes them down.
  const blessing = victim.statuses.find((s) => s.type === 'blessing');
  if (blessing && killer?.champion && killer.team !== victim.team) killer.statuses.push({ ...blessing });
  victim.statuses = [];
  clearPath(victim);
  world.emit({ type: 'death', id: victim.id, killerId: killer?.id ?? null, pos: { ...victim.pos } });

  if (victim.team === 'neutral') {
    handleMonsterDeath(world, victim, killer);
    return;
  }
  const enemyTeam = otherTeam(victim.team);
  const nearbyEnemyChamps = world.champions().filter(
    (c) => !c.dead && c.team === enemyTeam && dist(c.pos, victim.pos) <= XP_SHARE_RANGE,
  );

  switch (victim.kind) {
    case 'minion': {
      const stats = MINION_STATS[victim.minion!.type];
      if (killer?.champion) {
        addGold(world, killer, stats.gold, victim);
        killer.champion.cs++;
      }
      shareXp(world, nearbyEnemyChamps, stats.xp);
      break;
    }
    case 'champion': {
      const c = victim.champion!;
      c.deaths++;
      c.respawnTimer = respawnTime(c.level);
      c.recallTimer = 0;
      c.dash = null;
      victim.order = { type: 'idle' };
      let credit = killer?.champion ? killer : undefined;
      if (!credit && c.lastChampionAttacker && world.time - c.lastChampionAttacker.time < 10) {
        credit = world.get(c.lastChampionAttacker.id);
      }
      if (credit?.champion) {
        credit.champion.kills++;
        addGold(world, credit, CHAMPION_KILL_GOLD, victim);
      }
      // Everyone else who hit the victim recently gets an assist.
      for (const a of c.recentAttackers) {
        if (a.id === credit?.id || world.time - a.time > ASSIST_WINDOW) continue;
        const helper = world.get(a.id);
        if (helper?.champion) helper.champion.assists++;
      }
      c.recentAttackers = [];
      world.emit({ type: 'championKill', killerId: credit?.id ?? killer?.id ?? null, victimId: victim.id });
      shareXp(world, nearbyEnemyChamps, 100 + 40 * c.level);
      break;
    }
    case 'tower': {
      world.nav.unblockCircle(victim.pos, victim.radius);
      for (const c of world.champions()) if (c.team === enemyTeam) addGold(world, c, TOWER_GOLD, c);
      world.emit({ type: 'structureDestroyed', id: victim.id, kind: victim.kind, team: victim.team });
      break;
    }
    case 'ward':
      if (killer?.champion) addGold(world, killer, WARD_GOLD, victim);
      break;
    case 'inhibitor': {
      world.nav.unblockCircle(victim.pos, victim.radius);
      victim.structure!.respawnAt = world.time + INHIBITOR_RESPAWN;
      for (const c of world.champions()) if (c.team === enemyTeam) addGold(world, c, INHIBITOR_GOLD, c);
      world.emit({ type: 'structureDestroyed', id: victim.id, kind: victim.kind, team: victim.team as Team });
      break;
    }
    case 'nexus': {
      world.emit({ type: 'structureDestroyed', id: victim.id, kind: victim.kind, team: victim.team });
      world.winner = enemyTeam;
      world.emit({ type: 'gameOver', winner: enemyTeam });
      break;
    }
  }
}

function handleMonsterDeath(world: World, victim: Entity, killer: Entity | undefined): void {
  const m = victim.monster!;
  const def = MONSTERS[m.type as MonsterType];
  const team: Team | null = killer && killer.team !== 'neutral' ? killer.team : null;
  if (team) {
    if (killer?.champion && def.gold > 0) addGold(world, killer, def.gold, victim);
    if (killer?.champion) killer.champion.cs++;
    const nearby = world.champions().filter((c) => !c.dead && c.team === team && dist(c.pos, victim.pos) <= XP_SHARE_RANGE);
    shareXp(world, nearby, def.xp);
  }
  const camp = MAP.camps.find((c) => c.id === m.campId);
  const epic = !!camp && !!(CAMP_SPECS[camp.type] as { epic?: boolean }).epic;
  if (epic && team) {
    for (const c of world.champions()) if (c.team === team && !c.dead) addGold(world, c, DRAKE_TEAM_GOLD, c);
  }
  if (killer?.champion && (m.type === 'golem' || m.type === 'sentinel')) {
    const kind = m.type === 'golem' ? 'azure' : 'crimson';
    killer.statuses = killer.statuses.filter((s) => s.type !== 'blessing' || s.blessing !== kind);
    killer.statuses.push({ type: 'blessing', blessing: kind, remaining: BLESSING_DURATION });
    world.emit({ type: 'blessingGained', id: killer.id, blessing: kind });
  }
  world.emit({ type: 'monsterSlain', campId: m.campId, monsterType: m.type, killerId: killer?.id ?? null, team, epic });
}

export function addGold(world: World, champ: Entity, amount: number, at: Entity): void {
  if (!champ.champion) return;
  champ.champion.gold += amount;
  world.emit({ type: 'gold', id: champ.id, amount, pos: { ...at.pos } });
}

function shareXp(world: World, champs: Entity[], total: number): void {
  if (champs.length === 0) return;
  const each = champs.length === 1 ? total : (total * 1.3) / champs.length;
  for (const c of champs) addXp(world, c, each);
}

export function addXp(world: World, e: Entity, amount: number): void {
  const c = e.champion;
  if (!c || c.level >= MAX_LEVEL) return;
  c.xp += amount;
  while (c.level < MAX_LEVEL && c.xp >= xpToNext(c.level)) {
    c.xp -= xpToNext(c.level);
    levelUp(e);
    world.emit({ type: 'levelUp', id: e.id, level: c.level });
  }
  if (c.level >= MAX_LEVEL) c.xp = 0;
}

function levelUp(e: Entity): void {
  e.champion!.level++;
  recomputeChampionStats(e);
}

export function updateProjectiles(world: World, dt: number): void {
  const keep = [];
  for (const p of world.projectiles) {
    const step = p.speed * dt;
    if (p.targetId !== undefined) {
      const target = world.get(p.targetId);
      if (!target || target.dead) continue;
      if (dist(p.pos, target.pos) <= step + target.radius * 0.5) {
        p.pos = { ...target.pos };
        applyDamage(world, p.sourceId, target, p.damage, p.damageKind, p.isAttack);
        world.emit({ type: 'projectileHit', visual: p.visual, abilityId: p.abilityId, team: p.team, pos: { ...target.pos } });
        continue;
      }
      p.pos = moveToward(p.pos, target.pos, step);
      keep.push(p);
    } else if (p.dir) {
      const from = { ...p.pos };
      p.pos = { x: p.pos.x + p.dir.x * step, y: p.pos.y + p.dir.y * step };
      p.remainingRange = (p.remainingRange ?? 0) - step;
      const hits: Entity[] = [];
      for (const e of world.entities.values()) {
        if (e.dead || e.team === p.team || (e.kind !== 'champion' && e.kind !== 'minion' && e.kind !== 'monster')) continue;
        if (p.hitIds?.includes(e.id)) continue;
        if (distToSegment(e.pos, from, p.pos) > (p.width ?? 0) + e.radius) continue;
        hits.push(e);
      }
      hits.sort((a, b) => dist(from, a.pos) - dist(from, b.pos));
      // Non-piercing skillshots stop at the first unit hit.
      const struck = p.pierce ? hits : hits.slice(0, 1);
      // Execute-style skillshots add a share of the victim's missing health.
      const missingHp = p.abilityId ? (getAbility(p.abilityId)?.damage?.missingHp ?? 0) : 0;
      for (const hit of struck) {
        applyDamage(world, p.sourceId, hit, p.damage + missingHp * Math.max(0, hit.maxHp - hit.hp), p.damageKind);
        // Pulls drag toward the caster; knockbacks push away from the projectile.
        const origin = p.status?.type === 'pull' ? (world.get(p.sourceId)?.pos ?? p.pos) : p.pos;
        if (p.status) applyStatus(hit, p.status, { world, origin });
        world.emit({ type: 'projectileHit', visual: p.visual, abilityId: p.abilityId, team: p.team, pos: { ...hit.pos } });
        (p.hitIds ??= []).push(hit.id);
      }
      if (struck.length > 0 && !p.pierce) continue;
      if (p.remainingRange > 0) keep.push(p);
    }
  }
  world.projectiles = keep;
}

export function updateZones(world: World, dt: number): void {
  const keep = [];
  for (const z of world.zones) {
    z.delay -= dt;
    if (z.delay > 0) {
      keep.push(z);
      continue;
    }
    world.emit({ type: 'zoneExplode', abilityId: z.abilityId, pos: { ...z.pos }, radius: z.radius, team: z.team });
    const victims = world.unitsNear(
      z.pos,
      z.radius,
      (e) => e.team !== z.team && (e.kind === 'champion' || e.kind === 'minion' || e.kind === 'monster'),
    );
    for (const v of victims) {
      applyDamage(world, z.sourceId, v, z.damage, z.damageKind);
      if (z.status) applyStatus(v, z.status, { world, origin: z.pos });
    }
  }
  world.zones = keep;
}
