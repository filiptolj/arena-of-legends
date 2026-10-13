import { describe, expect, it } from 'vitest';
import {
  CAMP_SPECS,
  MAP,
  NavGrid,
  TICK_RATE,
  World,
  brushAt,
  hasBlessing,
  isVisibleTo,
  shieldOf,
  type ChampionSpawn,
  type Entity,
  type GameEvent,
} from '../src/index.js';

const run = (world: World, seconds: number, onEvent?: (e: GameEvent) => void) => {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) {
    world.step();
    for (const e of world.drainEvents()) onEvent?.(e);
  }
};

const duel = (blue = 'warden', red = 'arcanist'): [World, Entity, Entity] => {
  const champions: ChampionSpawn[] = [
    { team: 'blue', defId: blue, name: 'B', lane: 'mid', isBot: false },
    { team: 'red', defId: red, name: 'R', lane: 'mid', isBot: false },
  ];
  const w = new World({ champions });
  const [b, r] = w.champions();
  return [w, b, r];
};

const monstersOf = (w: World, campId: string) => [...w.entities.values()].filter((e) => e.monster?.campId === campId);

describe('map layout', () => {
  const grid = new NavGrid();
  it('puts every camp and brush on walkable ground', () => {
    for (const c of MAP.camps) expect(grid.isWalkable(c.pos), c.id).toBe(true);
    for (const b of MAP.brushes) {
      const cx = b.reduce((a, p) => a + p.x, 0) / b.length;
      const cy = b.reduce((a, p) => a + p.y, 0) / b.length;
      expect(grid.isWalkable({ x: cx, y: cy }), `brush ${cx},${cy}`).toBe(true);
      expect(brushAt({ x: cx, y: cy })).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('jungle', () => {
  it('spawns camps on their timers', () => {
    const [w] = duel();
    run(w, CAMP_SPECS.wolves.firstSpawn - 1);
    expect(monstersOf(w, 'blue-wolves')).toHaveLength(0);
    run(w, 2);
    expect(monstersOf(w, 'blue-wolves')).toHaveLength(3);
  });

  it('fights back, leashes and resets when kited away', () => {
    const [w, champ] = duel();
    run(w, CAMP_SPECS.golem.firstSpawn + 0.5);
    const golem = monstersOf(w, 'blue-golem')[0];
    champ.pos = { x: golem.pos.x + 2.5, y: golem.pos.y };
    w.issue({ type: 'attack', unitId: champ.id, targetId: golem.id });
    run(w, 3);
    expect(golem.hp).toBeLessThan(golem.maxHp);
    expect(champ.hp).toBeLessThan(champ.maxHp);

    // Walk far away: the golem gives up and heals back to full.
    champ.pos = { x: golem.monster!.home.x + 25, y: golem.monster!.home.y };
    w.issue({ type: 'move', unitId: champ.id, target: { x: 100, y: 100 } });
    run(w, 12);
    expect(golem.hp).toBe(golem.maxHp);
    expect(golem.targetId).toBeNull();
  });

  it('grants a blessing for slaying a buff monster', () => {
    const [w, champ] = duel();
    run(w, CAMP_SPECS.golem.firstSpawn + 0.5);
    const golem = monstersOf(w, 'blue-golem')[0];
    champ.pos = { x: golem.pos.x + 2.5, y: golem.pos.y };
    golem.hp = 50;
    w.issue({ type: 'attack', unitId: champ.id, targetId: golem.id });
    let slain = false;
    run(w, 4, (e) => {
      if (e.type === 'monsterSlain' && e.monsterType === 'golem') slain = true;
    });
    expect(slain).toBe(true);
    expect(hasBlessing(champ, 'azure')).toBe(true);
  });
});

describe('vision', () => {
  it('hides units in the fog and in brush', () => {
    const [w, blue, red] = duel();
    // Far apart: fogged.
    blue.pos = { x: 60, y: 140 };
    red.pos = { x: 140, y: 60 };
    run(w, 0.2);
    expect(isVisibleTo(w, 'blue', red)).toBe(false);

    // Close, but red hides in brush.
    const brush = MAP.brushes[MAP.brushes.length - 1];
    const cx = brush.reduce((a, p) => a + p.x, 0) / brush.length;
    const cy = brush.reduce((a, p) => a + p.y, 0) / brush.length;
    red.pos = { x: cx, y: cy };
    blue.pos = { x: cx + 7, y: cy + 7 }; // In sight range, out of attack range.
    run(w, 0.2);
    expect(brushAt(red.pos)).toBeGreaterThanOrEqual(0);
    expect(isVisibleTo(w, 'blue', red)).toBe(false);
    expect(isVisibleTo(w, 'red', blue)).toBe(true);

    // Attacking from brush reveals.
    red.revealedUntil = w.time + 1;
    run(w, 0.2);
    expect(isVisibleTo(w, 'blue', red)).toBe(true);
  });

  it('a ward reveals brush and can be destroyed', () => {
    const [w, blue, red] = duel();
    const brush = MAP.brushes[0];
    const cx = brush.reduce((a, p) => a + p.x, 0) / brush.length;
    const cy = brush.reduce((a, p) => a + p.y, 0) / brush.length;
    red.pos = { x: cx, y: cy };
    blue.pos = { x: cx + 9.5, y: cy }; // In sight range, out of attack range.
    blue.champion!.items[0] = 'wardTotem';
    run(w, 0.2);
    expect(isVisibleTo(w, 'blue', red)).toBe(false);
    w.issue({ type: 'useItem', unitId: blue.id, slot: 0, target: { x: cx, y: cy } });
    run(w, 0.2);
    const ward = [...w.entities.values()].find((e) => e.kind === 'ward')!;
    expect(ward).toBeDefined();
    // Wards inside the brush count as standing in it.
    expect(isVisibleTo(w, 'blue', red)).toBe(true);

    w.issue({ type: 'attack', unitId: red.id, targetId: ward.id });
    run(w, 6);
    expect(w.get(ward.id)).toBeUndefined();
  });
});

describe('item actives', () => {
  it('Stoneskin shields and goes on cooldown', () => {
    const [w, blue] = duel();
    blue.champion!.items[0] = 'titanPlate';
    w.issue({ type: 'useItem', unitId: blue.id, slot: 0, target: blue.pos });
    w.step();
    expect(shieldOf(blue)).toBeGreaterThan(150);
    expect(blue.champion!.itemCooldowns.titanPlate).toBeGreaterThan(0);
  });

  it('Time Stop makes the champion untouchable', () => {
    const [w, blue, red] = duel('arcanist', 'warden');
    blue.champion!.items[0] = 'archmageStaff';
    blue.pos = { x: 100, y: 100 };
    red.pos = { x: 101.5, y: 100 };
    w.issue({ type: 'useItem', unitId: blue.id, slot: 0, target: blue.pos });
    w.step();
    const hp = blue.hp;
    w.issue({ type: 'attack', unitId: red.id, targetId: blue.id });
    run(w, 1.5);
    expect(blue.hp).toBe(hp);
  });
});
