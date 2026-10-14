import { describe, expect, it } from 'vitest';
import {
  CHAMPIONS,
  CHAMPION_IDS,
  ITEMS,
  TICK_RATE,
  World,
  dist,
  isVisibleTo,
  type AbilitySlot,
  type ChampionSpawn,
  type Entity,
} from '../src/index.js';

const run = (world: World, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
};

/** Two champions facing each other in the middle of the map, at level 6 with full mana. */
function duel(blue: string, red = 'warden', gap = 4): [World, Entity, Entity] {
  const w = new World({
    champions: [
      { team: 'blue', defId: blue, name: 'B', lane: 'mid', isBot: false },
      { team: 'red', defId: red, name: 'R', lane: 'mid', isBot: false },
    ],
  });
  const [b, r] = w.champions();
  b.pos = { x: 100, y: 100 };
  r.pos = { x: 100 + gap, y: 100 };
  b.champion!.level = 6;
  // Let vision (updated every few ticks) catch up with the teleport.
  run(w, 0.1);
  return [w, b, r];
}

const cast = (w: World, e: Entity, slot: AbilitySlot, target = { x: 0, y: 0 }) => {
  e.mana = e.maxMana;
  w.issue({ type: 'cast', unitId: e.id, slot, target });
  w.step();
};

describe('content', () => {
  it('has at least 20 champions with unique ability ids', () => {
    expect(CHAMPION_IDS.length).toBeGreaterThanOrEqual(20);
    const ids = CHAMPION_IDS.flatMap((c) => CHAMPIONS[c].abilities.map((a) => a.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only recommends real items, and recipes only use real items', () => {
    for (const c of CHAMPION_IDS) for (const id of CHAMPIONS[c].build) expect(ITEMS[id], `${c}: ${id}`).toBeDefined();
    for (const item of Object.values(ITEMS)) {
      for (const comp of item.from) expect(ITEMS[comp], `${item.id} <- ${comp}`).toBeDefined();
      const parts = item.from.reduce((sum, comp) => sum + ITEMS[comp].cost, 0);
      expect(item.cost, `${item.id} costs at least its parts`).toBeGreaterThanOrEqual(parts);
    }
  });

  it('has a real mid tier between the basics and the legendaries', () => {
    const mid = Object.values(ITEMS).filter((i) => i.cost >= 650 && i.cost <= 1500);
    expect(mid.length).toBeGreaterThanOrEqual(15);
  });
});

describe('new mechanics', () => {
  it('pull drags the target to the caster', () => {
    const [w, hook, victim] = duel('ironhook', 'warden', 10);
    cast(w, hook, 0, victim.pos);
    run(w, 1);
    expect(dist(hook.pos, victim.pos)).toBeLessThan(4);
  });

  it('root stops movement but not attacks', () => {
    const [w, lux, victim] = duel('sunweaver', 'ranger', 6);
    cast(w, lux, 0, victim.pos);
    run(w, 0.4);
    expect(victim.statuses.some((s) => s.type === 'root')).toBe(true);
    const before = { ...victim.pos };
    w.issue({ type: 'move', unitId: victim.id, target: { x: 130, y: 100 } });
    run(w, 0.5);
    expect(dist(victim.pos, before)).toBeLessThan(0.01);
    const hp = lux.hp;
    w.issue({ type: 'attack', unitId: victim.id, targetId: lux.id });
    run(w, 1.5);
    expect(lux.hp).toBeLessThan(hp);
  });

  it('strikes need a target, and execute harder at low health', () => {
    const [w, garen, victim] = duel('valor', 'arcanist', 4);
    cast(w, garen, 3, { x: 60, y: 60 }); // nobody near the cursor
    expect(garen.champion!.abilities[3].cooldown).toBe(0);

    // Give the victim a big health pool so the strike doesn't overkill.
    victim.maxHp = 3000;
    victim.hp = 1000;
    w.drainEvents();
    cast(w, garen, 3, victim.pos);
    expect(garen.champion!.abilities[3].cooldown).toBeGreaterThan(0);
    const hit = w.drainEvents().find((e) => e.type === 'damage' && e.targetId === victim.id);
    // True damage: 150 + 50*5 = 400 base, plus 30% of 2000 missing = 1000.
    expect(hit && 'amount' in hit ? hit.amount : 0).toBeCloseTo(1000, 0);
  });

  it('heals allied champions in range', () => {
    const w = new World({
      champions: [
        { team: 'blue', defId: 'mistweaver', name: 'S', lane: 'bot', isBot: false },
        { team: 'blue', defId: 'ranger', name: 'A', lane: 'bot', isBot: false },
      ],
    });
    const [soraka, ally] = w.champions();
    soraka.pos = { x: 100, y: 100 };
    ally.pos = { x: 103, y: 100 };
    ally.hp = 100;
    cast(w, soraka, 1);
    expect(ally.hp).toBeGreaterThan(150);
  });

  it('stealth hides you from enemies until you attack', () => {
    const [w, eve, enemy] = duel('nightstalker', 'warden', 8);
    run(w, 0.2);
    expect(isVisibleTo(w, 'red', eve)).toBe(true);
    cast(w, eve, 1);
    run(w, 0.2);
    expect(isVisibleTo(w, 'red', eve)).toBe(false);
    w.issue({ type: 'attack', unitId: eve.id, targetId: enemy.id });
    run(w, 2);
    expect(isVisibleTo(w, 'red', eve)).toBe(true);
  });

  it('backward dash moves away from the cursor', () => {
    const [w, cait] = duel('volt', 'warden', 20);
    cast(w, cait, 2, { x: 110, y: 100 });
    run(w, 0.5);
    expect(cait.pos.x).toBeLessThan(97);
  });

  it('Quicksilver cleanses a stun', () => {
    const [w, b] = duel('ranger');
    b.champion!.items[0] = 'quicksilverSaber';
    b.statuses.push({ type: 'stun', remaining: 3 });
    w.issue({ type: 'useItem', unitId: b.id, slot: 0, target: b.pos });
    w.step();
    expect(b.statuses.some((s) => s.type === 'stun')).toBe(false);
  });
});

describe('every champion as a bot', () => {
  // Three short games cover all champions, so a broken kit shows up as a crash or a stalled bot.
  const starts = Array.from({ length: Math.ceil(CHAMPION_IDS.length / 6) }, (_, i) => i * 6);
  const groups = starts.map((start) => Array.from({ length: 6 }, (_, i) => CHAMPION_IDS[(start + i) % CHAMPION_IDS.length]));
  it.each(groups.map((g) => [g.join(', '), g]))('plays %s', (_name, group) => {
    const champions: ChampionSpawn[] = (group as string[]).map((defId, i) => ({
      team: i < 3 ? 'blue' : 'red',
      lane: (['top', 'mid', 'bot'] as const)[i % 3],
      defId,
      name: defId,
      isBot: true,
    }));
    const w = new World({ champions });
    run(w, 240);
    for (const c of w.champions()) {
      expect(c.champion!.level, c.champion!.defId).toBeGreaterThan(1);
      expect(c.champion!.items.some(Boolean), c.champion!.defId).toBe(true);
    }
  }, 120_000);
});
