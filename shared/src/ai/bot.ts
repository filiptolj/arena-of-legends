import { CHAMPIONS } from '../champions.js';
import { DT } from '../constants.js';
import { nextPurchase, purchasePrice } from '../items.js';
import { MAP, laneWaypoints } from '../map.js';
import { type Vec2, dist, moveToward } from '../math.js';
import { abilityDamage, abilityOf, castBlocker } from '../systems/abilities.js';
import { canTarget } from '../systems/combat.js';
import type { AbilitySlot, Entity, EntityId } from '../types.js';
import type { World } from '../world.js';

const THINK_INTERVAL = 0.25;
const ENGAGE_RANGE = 12;
const FARM_RANGE = 10;
const SLOTS: AbilitySlot[] = [0, 1, 2, 3];
/** Gold at which a bot heads home to shop when it's safe. */
const SHOPPING_GOLD = 1300;

/**
 * Simple lane bot: holds behind its minion wave, farms and pushes, trades with
 * enemy champions when it's ahead on health, recalls when low, and buys its
 * champion's recommended build.
 */
export class BotController {
  private thinkTimer: number;
  private retreating = false;

  constructor(readonly id: EntityId) {
    this.thinkTimer = (id % 5) * 0.05;
  }

  update(world: World, dt: number): void {
    this.thinkTimer -= dt;
    if (this.thinkTimer > 0) return;
    this.thinkTimer += THINK_INTERVAL;

    const me = world.get(this.id);
    if (!me?.champion) return;
    if (me.dead) {
      this.shop(world, me);
      return;
    }
    const c = me.champion;
    if (c.recallTimer > 0 || c.dash) return;

    const fountain = MAP.fountains[me.team];
    const hpPct = me.hp / me.maxHp;
    if (dist(me.pos, fountain) <= MAP.fountainRadius) {
      this.retreating = false;
      if (this.shop(world, me)) return;
      if (hpPct < 0.95 || me.mana < me.maxMana * 0.6) {
        if (me.order.type !== 'idle') world.issue({ type: 'stop', unitId: me.id });
        return;
      }
    }

    const enemyChamp = this.nearestEnemyChampion(world, me, ENGAGE_RANGE);

    if (hpPct < 0.3 || this.retreating) {
      this.retreating = true;
      if (!enemyChamp) {
        world.issue({ type: 'recall', unitId: me.id });
      } else {
        if (hpPct < 0.25) this.escape(world, me, fountain);
        this.moveTo(world, me, fountain);
      }
      return;
    }

    if (!enemyChamp && hpPct < 0.8 && this.wantsToShop(me)) {
      world.issue({ type: 'recall', unitId: me.id });
      return;
    }

    if (enemyChamp && this.fight(world, me, enemyChamp)) return;
    if (this.farm(world, me)) return;
    if (this.siege(world, me)) return;
    this.moveTo(world, me, this.holdPosition(world, me));
  }

  /** Buys the next step of the build. Returns true if a purchase was issued. */
  private shop(world: World, me: Entity): boolean {
    const c = me.champion!;
    for (const target of CHAMPIONS[c.defId].build) {
      if (c.items.includes(target)) continue;
      const step = nextPurchase(me, target);
      if (step) {
        world.issue({ type: 'buy', unitId: me.id, itemId: step });
        return true;
      }
      return false;
    }
    return false;
  }

  private wantsToShop(me: Entity): boolean {
    const c = me.champion!;
    const target = CHAMPIONS[c.defId].build.find((id) => !c.items.includes(id));
    if (!target || !c.items.includes(null)) return false;
    return c.gold >= Math.min(SHOPPING_GOLD, purchasePrice(target, c.items).cost);
  }

  /** Uses any mobility ability to get away. */
  private escape(world: World, me: Entity, toward: Vec2): void {
    for (const slot of SLOTS) {
      if (castBlocker(me, slot)) continue;
      const fx = abilityOf(me, slot).effect;
      if (fx.type === 'blink' || fx.type === 'dash' || (fx.type === 'buff' && (fx.moveSpeedPct || fx.shield))) {
        this.cast(world, me, slot, toward);
        return;
      }
    }
  }

  private fight(world: World, me: Entity, enemy: Entity): boolean {
    const myPct = me.hp / me.maxHp;
    const enemyPct = enemy.hp / enemy.maxHp;
    const d = dist(me.pos, enemy.pos);
    const ultReady = !castBlocker(me, 3);
    const ultDamage = abilityDamage(abilityOf(me, 3), me);
    const canExecute = ultReady && ultDamage * 0.8 >= enemy.hp && d <= abilityOf(me, 3).range + 3;
    const aggressive = canExecute || (myPct > 0.45 && myPct >= enemyPct && this.isSafe(world, me, enemy.pos));

    if (!aggressive) {
      if (d < 8) {
        // Peel with crowd control if they're on top of us, then back off.
        for (const slot of SLOTS) {
          const def = abilityOf(me, slot);
          if (!castBlocker(me, slot) && def.effect.type === 'nova' && def.effect.status && d <= def.effect.radius) {
            this.cast(world, me, slot, enemy.pos);
          }
        }
        this.moveTo(world, me, this.holdPosition(world, me, 6));
        return true;
      }
      return false;
    }

    for (const slot of SLOTS) {
      if (castBlocker(me, slot)) continue;
      // Save the ultimate for when it matters.
      if (slot === 3 && !canExecute && enemyPct > 0.5) continue;
      this.useAbilityOn(world, me, slot, enemy, d);
    }
    this.attack(world, me, enemy);
    return true;
  }

  private useAbilityOn(world: World, me: Entity, slot: AbilitySlot, enemy: Entity, d: number): void {
    const def = abilityOf(me, slot);
    const fx = def.effect;
    switch (fx.type) {
      case 'skillshot':
        if (d <= def.range) this.cast(world, me, slot, this.predict(enemy, d / fx.speed));
        break;
      case 'zone':
        if (fx.atSelf ? d <= fx.radius * 0.8 : d <= def.range + fx.radius * 0.5) {
          this.cast(world, me, slot, fx.atSelf ? me.pos : this.predict(enemy, fx.delay * 0.6));
        }
        break;
      case 'nova':
        if (d <= fx.radius + enemy.radius) this.cast(world, me, slot, me.pos);
        break;
      case 'dash':
        // Only damaging dashes are used to engage.
        if (def.damage && d > me.attackRange + 1 && d <= def.range + 1) this.cast(world, me, slot, enemy.pos);
        break;
      case 'buff':
        if (fx.attackSpeedPct && d <= me.attackRange + 2) this.cast(world, me, slot, me.pos);
        else if ((fx.shield || fx.armor) && d <= 5) this.cast(world, me, slot, me.pos);
        else if (fx.moveSpeedPct && d > me.attackRange + 2) this.cast(world, me, slot, me.pos);
        break;
      case 'blink':
        break;
    }
  }

  private farm(world: World, me: Entity): boolean {
    const minions = world.unitsNear(
      me.pos,
      FARM_RANGE,
      (o) => o.kind === 'minion' && canTarget(world, me, o) && this.isSafe(world, me, o.pos),
    );
    if (minions.length === 0) return false;

    minions.sort((a, b) => a.hp - b.hp);
    if (me.mana > me.maxMana * 0.6) {
      for (const slot of SLOTS) {
        const fx = abilityOf(me, slot).effect;
        if (slot === 3 || fx.type !== 'nova' || castBlocker(me, slot)) continue;
        const inRange = minions.filter((m) => dist(m.pos, me.pos) <= fx.radius).length;
        if (inRange >= 3) this.cast(world, me, slot, me.pos);
      }
    }
    this.attack(world, me, minions[0]);
    return true;
  }

  private siege(world: World, me: Entity): boolean {
    for (const s of world.entities.values()) {
      if ((s.kind !== 'tower' && s.kind !== 'nexus') || !canTarget(world, me, s)) continue;
      if (dist(me.pos, s.pos) > 16) continue;
      if (s.kind === 'tower' && !this.towerBusy(world, s)) continue;
      this.attack(world, me, s);
      return true;
    }
    return false;
  }

  /** Where to stand: just behind our frontmost lane minion, or behind our outermost tower. */
  private holdPosition(world: World, me: Entity, backOff = 3): Vec2 {
    const lane = me.champion!.lane;
    const enemyNexus = laneWaypoints(me.team, lane).at(-1)!;
    const ownNexus = laneWaypoints(me.team, lane)[0];
    let front: Entity | null = null;
    for (const o of world.entities.values()) {
      if (o.kind !== 'minion' || o.dead || o.team !== me.team || o.minion?.lane !== lane) continue;
      if (!front || dist(o.pos, enemyNexus) < dist(front.pos, enemyNexus)) front = o;
    }

    let hold: Vec2;
    if (front?.minion) {
      const prev = front.minion.waypoints[Math.max(0, front.minion.waypointIndex - 1)];
      hold = moveToward(front.pos, prev, backOff);
    } else {
      let tower: Entity | null = null;
      for (const o of world.entities.values()) {
        if (o.kind !== 'tower' || o.dead || o.team !== me.team || o.structure?.lane !== lane) continue;
        if (!tower || dist(o.pos, enemyNexus) < dist(tower.pos, enemyNexus)) tower = o;
      }
      hold = tower ? moveToward(tower.pos, ownNexus, 4) : moveToward(ownNexus, enemyNexus, 8);
    }

    // Never wait inside an enemy tower's reach.
    for (let i = 0; i < 10 && this.threateningTower(world, me, hold); i++) {
      hold = moveToward(hold, ownNexus, 3);
    }
    return world.nav.nearestWalkable(hold);
  }

  private threateningTower(world: World, me: Entity, pos: Vec2): Entity | null {
    for (const t of world.entities.values()) {
      if (t.kind !== 'tower' || t.dead || t.team === me.team) continue;
      if (dist(pos, t.pos) <= t.attackRange + t.radius + me.radius + 1.5) return t;
    }
    return null;
  }

  /** A tower is "busy" when it's shooting at one of our minions and has more of them in range. */
  private towerBusy(world: World, tower: Entity): boolean {
    const target = world.get(tower.targetId);
    if (!target || target.kind !== 'minion') return false;
    const tanks = world.unitsNear(tower.pos, tower.attackRange, (o) => o.kind === 'minion' && o.team !== tower.team);
    return tanks.length >= 2;
  }

  private isSafe(world: World, me: Entity, pos: Vec2): boolean {
    const tower = this.threateningTower(world, me, pos);
    if (!tower) return true;
    return this.towerBusy(world, tower) && me.hp > me.maxHp * 0.4;
  }

  private nearestEnemyChampion(world: World, me: Entity, range: number): Entity | null {
    let best: Entity | null = null;
    for (const o of world.champions()) {
      if (o.dead || o.team === me.team) continue;
      const d = dist(o.pos, me.pos);
      if (d <= range && (!best || d < dist(best.pos, me.pos))) best = o;
    }
    return best;
  }

  private predict(target: Entity, leadTime: number): Vec2 {
    const vx = (target.pos.x - target.prevPos.x) / DT;
    const vy = (target.pos.y - target.prevPos.y) / DT;
    return { x: target.pos.x + vx * leadTime, y: target.pos.y + vy * leadTime };
  }

  private cast(world: World, me: Entity, slot: AbilitySlot, target: Vec2): void {
    world.issue({ type: 'cast', unitId: me.id, slot, target: { ...target } });
  }

  private attack(world: World, me: Entity, target: Entity): void {
    if (me.order.type === 'attack' && me.order.targetId === target.id) return;
    world.issue({ type: 'attack', unitId: me.id, targetId: target.id });
  }

  private moveTo(world: World, me: Entity, target: Vec2): void {
    if (me.order.type === 'move' && dist(me.order.target, target) < 1.5) return;
    if (me.order.type === 'idle' && dist(me.pos, target) < 1.5) return;
    world.issue({ type: 'move', unitId: me.id, target: { ...target } });
  }
}
