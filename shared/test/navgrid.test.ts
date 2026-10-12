import { describe, expect, it } from 'vitest';
import { LANES, MAP, NavGrid, dist, laneWaypoints, vec } from '../src/index.js';

describe('NavGrid', () => {
  const grid = new NavGrid();

  it('keeps every lane waypoint (except the nexus endpoints) walkable', () => {
    for (const lane of LANES) {
      for (const wp of laneWaypoints('blue', lane).slice(1, -1)) {
        expect(grid.isWalkable(wp), `${lane} ${wp.x},${wp.y}`).toBe(true);
      }
    }
  });

  it('blocks rocks and the map edge', () => {
    expect(grid.isWalkable(vec(2, 2))).toBe(false);
    expect(grid.isWalkable(vec(45, 110))).toBe(false);
  });

  it('paths around a rock instead of through it', () => {
    const path = grid.findPath(vec(40, 90), vec(46, 132));
    expect(path).not.toBeNull();
    let prev = vec(40, 90);
    for (const p of path!) {
      expect(grid.lineOfSight(prev, p)).toBe(true);
      prev = p;
    }
    expect(dist(path!.at(-1)!, vec(46, 132))).toBeLessThan(1.5);
  });

  it('finds a path between the two fountains', () => {
    const path = grid.findPath(MAP.fountains.blue, MAP.fountains.red);
    expect(path).not.toBeNull();
  });
});
