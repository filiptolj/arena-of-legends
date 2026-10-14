import * as THREE from 'three';
import { type GameEvent, type Projectile, type ProjectileVisual, type Vec2, type World, getAbility, isStructure, lerp } from '@lol/shared';
import { TEAM_COLOR, disposeObject, makeGlow, makeGroundRing } from './util';

interface Particle {
  obj: THREE.Object3D;
  life: number;
  maxLife: number;
  tick: (p: Particle, t: number, dt: number) => void;
}

const PROJECTILE_STYLE: Record<ProjectileVisual, { color: (team: 'blue' | 'red') => number; size: number; height: number }> = {
  attack: { color: (t) => (t === 'blue' ? 0x8fe3ff : 0xffa48f), size: 1.0, height: 3 },
  caster: { color: (t) => (t === 'blue' ? 0x9be4ff : 0xffb08a), size: 0.7, height: 2 },
  tower: { color: (t) => TEAM_COLOR[t], size: 1.8, height: 8 },
  ability: { color: () => 0xc77dff, size: 2.2, height: 1.5 },
};

const abilityColor = (id: string | undefined, fallback = 0xffffff): number => (id && getAbility(id)?.color) || fallback;

function projectileLook(p: Pick<Projectile, 'visual' | 'team' | 'abilityId' | 'width'>): { color: number; size: number; height: number } {
  const style = PROJECTILE_STYLE[p.visual];
  if (p.visual === 'ability') return { color: abilityColor(p.abilityId), size: 1.2 + (p.width ?? 0.8) * 1.4, height: style.height };
  return { color: style.color(p.team), size: style.size, height: style.height };
}

/** Projectiles, ground zones and short-lived particle effects. */
export class Effects {
  private readonly projectiles = new Map<number, THREE.Object3D>();
  private readonly zones = new Map<number, { group: THREE.Group; fill: THREE.Mesh; meteor: THREE.Object3D }>();
  private particles: Particle[] = [];
  /** Screen shake intensity, read by the camera. */
  shake = 0;

  constructor(private readonly scene: THREE.Scene) {}

  /** `visible` is the set of entity ids the player's team can see. */
  sync(world: World, alpha: number, visible: Set<number>): void {
    const seen = new Set<number>();
    for (const p of world.projectiles) {
      seen.add(p.id);
      let obj = this.projectiles.get(p.id);
      const style = projectileLook(p);
      if (!obj) {
        obj = this.makeProjectile(p.visual, style.color, style.size);
        this.projectiles.set(p.id, obj);
        this.scene.add(obj);
      }
      obj.position.set(lerp(p.prevPos.x, p.pos.x, alpha), style.height, lerp(p.prevPos.y, p.pos.y, alpha));
      if (p.dir) obj.rotation.y = Math.atan2(p.dir.x, p.dir.y);
    }
    for (const [id, obj] of this.projectiles) {
      if (!seen.has(id)) {
        this.scene.remove(obj);
        disposeObject(obj);
        this.projectiles.delete(id);
      }
    }

    const seenZones = new Set<number>();
    for (const z of world.zones) {
      seenZones.add(z.id);
      let zv = this.zones.get(z.id);
      if (!zv) {
        const color = abilityColor(z.abilityId, 0xff5522);
        const group = new THREE.Group();
        group.position.set(z.pos.x, 0, z.pos.y);
        const ring = makeGroundRing(z.radius - 0.25, z.radius, color, 0.9);
        const fill = new THREE.Mesh(
          new THREE.CircleGeometry(z.radius, 48).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false }),
        );
        fill.position.y = 0.04;
        // Slow zones get something falling from the sky; quick ones are just a telegraph.
        const meteor = new THREE.Group();
        if (z.totalDelay >= 0.5) {
          meteor.add(
            new THREE.Mesh(
              new THREE.IcosahedronGeometry(1.2, 0),
              new THREE.MeshStandardMaterial({ color: 0x331a11, emissive: color, emissiveIntensity: 1.5, flatShading: true }),
            ),
            makeGlow(color, 6, 0.9),
          );
        }
        group.add(ring, fill, meteor);
        this.scene.add(group);
        zv = { group, fill, meteor };
        this.zones.set(z.id, zv);
      }
      const progress = 1 - z.delay / z.totalDelay;
      zv.fill.scale.setScalar(Math.max(0.01, progress));
      zv.meteor.position.set(-8 * (1 - progress), 30 * (1 - progress) + 0.5, 4 * (1 - progress));
      zv.meteor.rotation.x += 0.2;
    }
    // Dash trails.
    for (const c of world.entities.values()) {
      const dash = c.champion?.dash;
      if (!dash || c.dead || !visible.has(c.id)) continue;
      const pos = { x: lerp(c.prevPos.x, c.pos.x, alpha), y: lerp(c.prevPos.y, c.pos.y, alpha) };
      this.burst(pos, 1.2, abilityColor(dash.abilityId), 2.2, 0.3);
    }

    for (const [id, zv] of this.zones) {
      if (!seenZones.has(id)) {
        this.scene.remove(zv.group);
        disposeObject(zv.group);
        this.zones.delete(id);
      }
    }
  }

  private makeProjectile(visual: ProjectileVisual, color: number, size: number): THREE.Object3D {
    const g = new THREE.Group();
    g.add(makeGlow(color, size));
    if (visual === 'ability') {
      const core = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.25, 1.4, 4, 8).rotateX(Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.6) }),
      );
      g.add(core);
      const trail = makeGlow(color, 1.6, 0.6);
      trail.position.z = -1;
      g.add(trail);
    } else {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(size * 0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    }
    return g;
  }

  update(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 3);
    const alive: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.obj);
        disposeObject(p.obj);
        continue;
      }
      p.tick(p, 1 - p.life / p.maxLife, dt);
      alive.push(p);
    }
    this.particles = alive;
  }

  private add(obj: THREE.Object3D, life: number, tick: Particle['tick']): void {
    this.scene.add(obj);
    this.particles.push({ obj, life, maxLife: life, tick });
  }

  /** Expanding, fading ground ring. */
  ring(pos: Vec2, radius: number, color: number, life = 0.5, startScale = 0.2): void {
    const r = makeGroundRing(radius * 0.85, radius, color, 0.9);
    r.position.set(pos.x, 0.08, pos.y);
    this.add(r, life, (p, t) => {
      p.obj.scale.setScalar(lerp(startScale, 1, Math.min(1, t * 2)));
      ((p.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
    });
  }

  /** Bright burst that grows and fades. */
  burst(pos: Vec2, height: number, color: number, size: number, life = 0.35): void {
    const s = makeGlow(color, size);
    s.position.set(pos.x, height, pos.y);
    this.add(s, life, (p, t) => {
      p.obj.scale.setScalar(size * (0.5 + t));
      ((p.obj as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 1 - t;
    });
  }

  /** Sparks flying outward. */
  sparks(pos: Vec2, height: number, color: number, count: number, speed: number, life = 0.6): void {
    for (let i = 0; i < count; i++) {
      const s = makeGlow(color, 0.6);
      s.position.set(pos.x, height, pos.y);
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * speed * (0.5 + Math.random()), speed * Math.random(), Math.sin(a) * speed * (0.5 + Math.random()));
      this.add(s, life, (p, t, dt) => {
        p.obj.position.addScaledVector(v, dt);
        v.y -= 15 * dt;
        ((p.obj as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 1 - t;
      });
    }
  }

  clickMarker(pos: Vec2, attack: boolean): void {
    this.ring(pos, 0.9, attack ? 0xff4040 : 0x4cff7a, 0.35, 1.4);
  }

  /** Reacts to simulation events with one-shot effects. */
  handleEvent(ev: GameEvent, world: World, playerPos: Vec2 | null): void {
    switch (ev.type) {
      case 'projectileHit': {
        const look = projectileLook(ev);
        const isAbility = ev.visual === 'ability';
        this.burst(ev.pos, ev.visual === 'tower' ? 2 : 1.5, look.color, isAbility ? 3 : 1.4);
        if (isAbility) this.sparks(ev.pos, 1.5, look.color, 10, 8);
        break;
      }
      case 'blink': {
        const color = abilityColor(ev.abilityId);
        this.burst(ev.from, 1.5, color, 4, 0.4);
        this.burst(ev.to, 1.5, color, 4, 0.4);
        this.sparks(ev.from, 1.5, color, 8, 6);
        break;
      }
      case 'nova': {
        const color = abilityColor(ev.abilityId);
        this.ring(ev.pos, ev.radius, color, 0.5);
        this.sparks(ev.pos, 1, color, 16, 12, 0.5);
        break;
      }
      case 'buff': {
        const e = world.get(ev.id);
        if (e) {
          const color = abilityColor(ev.abilityId);
          this.ring(e.pos, 2, color, 0.5);
          this.burst(e.pos, 1.8, color, 4, 0.5);
        }
        break;
      }
      case 'zoneExplode': {
        const color = abilityColor(ev.abilityId, 0xff7a30);
        this.ring(ev.pos, ev.radius, color, 0.6, 0.5);
        this.burst(ev.pos, 2, color, ev.radius * 2.5, 0.6);
        this.sparks(ev.pos, 1, color, 30, 18, 0.9);
        if (ev.radius >= 5 && playerPos && Math.hypot(playerPos.x - ev.pos.x, playerPos.y - ev.pos.y) < 40) this.shake = 1;
        break;
      }
      case 'levelUp': {
        const e = world.get(ev.id);
        if (e) {
          this.ring(e.pos, 2.5, 0xffd75a, 0.8);
          this.burst(e.pos, 2, 0xffd75a, 5, 0.6);
        }
        break;
      }
      case 'death': {
        const e = world.get(ev.id);
        if (e && isStructure(e)) {
          this.burst(ev.pos, 6, 0xffa040, 22, 1);
          this.sparks(ev.pos, 6, 0xffc070, 50, 20, 1.4);
          this.shake = 1.2;
        }
        break;
      }
      case 'strike': {
        // A pillar of light slamming into the target.
        const color = abilityColor(ev.abilityId, 0xffd700);
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.6, 0.9, 14, 12, 1, true),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
        );
        beam.position.set(ev.pos.x, 7, ev.pos.y);
        this.add(beam, 0.45, (p, t) => {
          p.obj.scale.set(1 - t * 0.7, 1, 1 - t * 0.7);
          ((p.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t);
        });
        this.burst(ev.pos, 1.5, color, 6, 0.5);
        this.sparks(ev.pos, 1.5, color, 20, 12, 0.7);
        this.shake = Math.max(this.shake, 0.4);
        break;
      }
      case 'heal':
        this.ring(ev.pos, Math.min(ev.radius, 12), 0x6aff9a, 0.7);
        break;
      case 'healed': {
        const e = world.get(ev.id);
        if (e) this.burst(e.pos, 2, 0x6aff9a, 3, 0.5);
        break;
      }
      case 'wardPlaced':
        this.ring(ev.pos, 1.5, 0xffe9a8, 0.5);
        break;
      case 'monsterSlain':
        if (ev.epic) {
          const camp = world.camps.find((c) => c.def.id === ev.campId);
          if (camp) {
            this.burst(camp.def.pos, 4, 0xff7a30, 18, 1);
            this.sparks(camp.def.pos, 3, 0xffb050, 40, 16, 1.2);
          }
        }
        break;
      case 'respawn': {
        const e = world.get(ev.id);
        if (e) this.burst(e.pos, 2, 0xffffff, 6, 0.6);
        break;
      }
      default:
        break;
    }
  }
}
