import * as THREE from 'three';
import { type Entity, type EntityId, type Team, type World, dist, lerp } from '@lol/shared';
import { TEAM_COLOR, disposeObject, makeGlow, makeGroundRing } from './util';

interface ViewParts {
  root: THREE.Group;
  /** Rotates with the unit's facing and bobs while walking. */
  body: THREE.Group;
  height: number;
  /** Something to pulse when attacking (staff orb, tower crystal...). */
  pulse?: THREE.Object3D;
  /** Rotating ornament (tower/nexus crystal). */
  spinner?: THREE.Object3D;
}

/** Visual representation of one simulation entity. */
export class EntityView {
  readonly root: THREE.Group;
  readonly body: THREE.Group;
  readonly height: number;
  private readonly pulse?: THREE.Object3D;
  private readonly spinner?: THREE.Object3D;
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private flash = 0;
  private attackAnim = 0;
  private walkPhase = 0;
  private deathTime = 0;
  private recallFx: THREE.Group | null = null;
  private rangeRing: THREE.Mesh | null = null;
  private statusFx: { shield: THREE.Mesh; aura: THREE.Mesh; stun: THREE.Group; slow: THREE.Mesh } | null = null;
  /** Interpolated ground position for overlays. */
  readonly renderPos = new THREE.Vector3();
  dying = false;
  /** Set once the death animation finishes and the view can be removed. */
  done = false;

  constructor(
    readonly id: EntityId,
    readonly kind: Entity['kind'],
    readonly team: Team,
    parts: ViewParts,
  ) {
    this.root = parts.root;
    this.body = parts.body;
    this.height = parts.height;
    this.pulse = parts.pulse;
    this.spinner = parts.spinner;
    this.root.traverse((o) => {
      const mat = (o as THREE.Mesh).material;
      if (mat instanceof THREE.MeshStandardMaterial) this.materials.push(mat);
    });
  }

  hit(): void {
    this.flash = 1;
  }

  attack(): void {
    this.attackAnim = 1;
  }

  /** Called each frame with the interpolated entity state. */
  update(e: Entity, alpha: number, dt: number, time: number): void {
    const x = lerp(e.prevPos.x, e.pos.x, alpha);
    const z = lerp(e.prevPos.y, e.pos.y, alpha);
    this.renderPos.set(x, 0, z);
    this.root.position.set(x, 0, z);

    const moving = dist(e.prevPos, e.pos) > 1e-3;
    if (e.kind === 'champion' || e.kind === 'minion') {
      // Smoothly turn toward facing.
      let diff = e.facing - this.body.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.body.rotation.y += diff * Math.min(1, dt * 14);
      if (moving) this.walkPhase += dt * 11;
      const bob = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.18 : 0;
      this.body.position.y = bob;
      // Lean into attacks.
      this.body.rotation.x = this.attackAnim * 0.35;
    }

    if (this.spinner) {
      this.spinner.rotation.y = time * 0.8;
      this.spinner.position.y = this.spinner.userData.baseY + Math.sin(time * 2) * 0.25;
    }
    if (this.pulse) this.pulse.scale.setScalar(1 + this.attackAnim * 0.8);

    this.attackAnim = Math.max(0, this.attackAnim - dt * 5);
    this.flash = Math.max(0, this.flash - dt * 7);
    for (const m of this.materials) {
      m.emissiveIntensity = (m.userData.baseEmissive ?? 0) + this.flash * 0.9;
      if (this.flash > 0 && !m.userData.flashing) {
        m.userData.savedEmissive = m.emissive.getHex();
        m.userData.flashing = true;
        m.emissive.setHex(0xffffff);
      } else if (this.flash === 0 && m.userData.flashing) {
        m.emissive.setHex(m.userData.savedEmissive);
        m.userData.flashing = false;
      }
    }

    this.updateRecall(e, time);
    if (e.kind === 'champion' || e.kind === 'minion') this.updateStatusFx(e, time);

    if (e.kind === 'champion') {
      // Champions fall over when they die and pop back on respawn.
      this.root.visible = !e.dead || this.deathTime < 2.5;
      if (e.dead) {
        this.deathTime += dt;
        this.body.rotation.z = Math.min(Math.PI / 2, this.deathTime * 4);
      } else {
        this.deathTime = 0;
        this.body.rotation.z = 0;
      }
    }
  }

  private updateRecall(e: Entity, time: number): void {
    const recalling = !!e.champion && e.champion.recallTimer > 0 && !e.dead;
    if (recalling && !this.recallFx) {
      this.recallFx = new THREE.Group();
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 1, 6, 20, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0x7fc4ff,
          transparent: true,
          opacity: 0.25,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      col.position.y = 3;
      this.recallFx.add(col, makeGroundRing(1.1, 1.5, 0x7fc4ff, 0.8));
      this.root.add(this.recallFx);
    } else if (!recalling && this.recallFx) {
      this.root.remove(this.recallFx);
      disposeObject(this.recallFx);
      this.recallFx = null;
    }
    if (this.recallFx) this.recallFx.rotation.y = time * 2;
  }

  /** Shield bubble, buff aura, stun stars and slow ring, created lazily. */
  private updateStatusFx(e: Entity, time: number): void {
    if (!this.statusFx && e.statuses.length === 0) return;
    if (!this.statusFx) {
      const r = e.radius;
      const shield = new THREE.Mesh(
        new THREE.SphereGeometry(r * 1.6, 20, 14),
        new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      shield.position.y = this.height * 0.45;
      shield.scale.y = this.height / (r * 3);
      const aura = makeGroundRing(r * 1.3, r * 1.9, 0xfff27a, 0.6);
      const stun = new THREE.Group();
      stun.position.y = this.height + 0.3;
      for (let i = 0; i < 3; i++) {
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
        const a = (i / 3) * Math.PI * 2;
        star.position.set(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6);
        stun.add(star);
      }
      const slow = makeGroundRing(r * 1.1, r * 1.35, 0x6ab7ff, 0.7);
      this.statusFx = { shield, aura, stun, slow };
      this.root.add(shield, aura, stun, slow);
    }
    const fx = this.statusFx;
    const has = (t: string) => !e.dead && e.statuses.some((s) => s.type === t);
    fx.shield.visible = has('shield');
    fx.aura.visible = has('buff');
    fx.stun.visible = has('stun');
    fx.slow.visible = has('slow');
    fx.stun.rotation.y = time * 5;
    fx.aura.rotation.y = time;
    (fx.shield.material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.sin(time * 6) * 0.05;
  }

  /** Shows a tower's attack range, red when it's targeting `watchId`. */
  setRangeRing(visible: boolean, radius: number, danger: boolean): void {
    if (visible && !this.rangeRing) {
      this.rangeRing = makeGroundRing(radius - 0.15, radius, 0xffffff, 0.35);
      this.root.add(this.rangeRing);
    }
    if (!this.rangeRing) return;
    this.rangeRing.visible = visible;
    const mat = this.rangeRing.material as THREE.MeshBasicMaterial;
    mat.color.setHex(danger ? 0xff3030 : 0xffffff);
    mat.opacity = danger ? 0.8 : 0.3;
  }

  /** Plays the death animation; returns true while still animating. */
  animateDeath(dt: number): void {
    this.deathTime += dt;
    const t = this.deathTime;
    if (this.kind === 'minion') {
      this.root.position.y = -t * 1.5;
      this.body.rotation.z = Math.min(1.4, t * 5);
      if (t > 0.8) this.done = true;
    } else if (this.kind === 'tower' || this.kind === 'nexus') {
      this.root.position.y = -t * 3;
      this.root.rotation.z = Math.sin(t * 40) * 0.03;
      if (t > 2.5) this.done = true;
    } else {
      this.done = true;
    }
  }

  dispose(): void {
    disposeObject(this.root);
  }
}

// ---------------------------------------------------------------------------
// Model factories (built from primitives; swap for glTF later).

function std(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: true, ...opts });
  m.userData.baseEmissive = opts.emissiveIntensity ?? 0;
  return m;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, y = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.y = y;
  m.castShadow = true;
  return m;
}

function arcanistModel(team: Team, body: THREE.Group): Partial<ViewParts> {
  const tc = TEAM_COLOR[team];
  const robe = mesh(new THREE.ConeGeometry(0.85, 2.2, 8), std(tc), 1.1);
  const belt = mesh(new THREE.TorusGeometry(0.5, 0.08, 6, 16).rotateX(Math.PI / 2), std(0xd9b44a, { metalness: 0.6 }), 1.25);
  const head = mesh(new THREE.SphereGeometry(0.42, 12, 10), std(0xf0c9a0), 2.45);
  const hat = mesh(new THREE.ConeGeometry(0.6, 1.3, 8), std(0x2b1f4a), 3.2);
  hat.rotation.z = -0.15;
  const brim = mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 16), std(0x2b1f4a), 2.7);

  const staff = new THREE.Group();
  staff.position.set(0.75, 0, 0.25);
  staff.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 3, 6), std(0x6b4a2a), 1.5));
  const orbColor = team === 'blue' ? 0x7fd8ff : 0xff9a7f;
  const orbGroup = new THREE.Group();
  orbGroup.position.y = 3.1;
  orbGroup.add(mesh(new THREE.IcosahedronGeometry(0.22, 0), std(orbColor, { emissive: orbColor, emissiveIntensity: 1.2 })), makeGlow(orbColor, 1.4, 0.8));
  staff.add(orbGroup);

  body.add(robe, belt, head, hat, brim, staff);
  return { height: 4.2, pulse: orbGroup };
}

function rangerModel(team: Team, body: THREE.Group): Partial<ViewParts> {
  const tc = TEAM_COLOR[team];
  const cloak = std(0x2f5a2a);
  body.add(mesh(new THREE.CylinderGeometry(0.35, 0.55, 1.6, 8), std(tc), 1.0));
  body.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.9, 6), std(0x4a3524), 0.35).translateX(0.2));
  body.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.9, 6), std(0x4a3524), 0.35).translateX(-0.2));
  body.add(mesh(new THREE.SphereGeometry(0.36, 12, 10), std(0xe8c09a), 2.15));
  const hood = mesh(new THREE.ConeGeometry(0.5, 0.9, 8), cloak, 2.55);
  hood.rotation.x = -0.25;
  body.add(hood);
  const cape = mesh(new THREE.ConeGeometry(0.7, 1.8, 8, 1, true), cloak, 1.3);
  cape.position.z = -0.2;
  body.add(cape);
  // Bow held to the side.
  const bow = new THREE.Group();
  bow.position.set(0.6, 1.5, 0.35);
  bow.add(mesh(new THREE.TorusGeometry(0.8, 0.05, 6, 16, Math.PI), std(0x7a5230)).rotateZ(-Math.PI / 2));
  const tip = new THREE.Group();
  tip.position.set(0.1, 0, 0);
  tip.add(makeGlow(0xe8f59a, 0.8, 0.7));
  bow.add(tip);
  body.add(bow);
  // Quiver.
  const quiver = mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.9, 6), std(0x5a3d22), 1.6);
  quiver.position.set(-0.25, 1.6, -0.35);
  quiver.rotation.z = 0.3;
  body.add(quiver);
  return { height: 3.3, pulse: tip };
}

function wardenModel(team: Team, body: THREE.Group): Partial<ViewParts> {
  const tc = TEAM_COLOR[team];
  const steel = std(0x8a8f99, { metalness: 0.7, roughness: 0.35 });
  body.add(mesh(new THREE.BoxGeometry(1.5, 1.5, 1.0), steel, 1.5));
  body.add(mesh(new THREE.BoxGeometry(1.3, 0.9, 0.9), std(tc), 0.5));
  body.add(mesh(new THREE.BoxGeometry(0.75, 0.7, 0.75), steel, 2.6));
  const visor = mesh(new THREE.BoxGeometry(0.5, 0.08, 0.05), std(0xffd36b, { emissive: 0xffd36b, emissiveIntensity: 1 }), 2.65);
  visor.position.z = 0.39;
  body.add(visor);
  for (const side of [-1, 1]) {
    const pauldron = mesh(new THREE.SphereGeometry(0.45, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), std(tc), 2.2);
    pauldron.position.x = side * 0.85;
    body.add(pauldron);
  }
  const shield = mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.12, 6).rotateX(Math.PI / 2), std(tc, { metalness: 0.5 }), 1.5);
  shield.position.set(-0.95, 1.5, 0.45);
  shield.rotation.y = 0.3;
  body.add(shield);
  const hammer = new THREE.Group();
  hammer.position.set(0.95, 1.2, 0.3);
  hammer.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 6), std(0x5a3d22), 0.4));
  hammer.add(mesh(new THREE.BoxGeometry(0.5, 0.4, 0.8), steel, 1.3));
  body.add(hammer);
  return { height: 3.6, pulse: hammer };
}

function shadeModel(team: Team, body: THREE.Group): Partial<ViewParts> {
  const tc = TEAM_COLOR[team];
  const dark = std(0x1c1c26);
  body.add(mesh(new THREE.ConeGeometry(0.55, 1.9, 6), dark, 0.95));
  body.add(mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.9, 6), std(tc), 1.7));
  body.add(mesh(new THREE.SphereGeometry(0.33, 10, 8), dark, 2.45));
  const eyes = mesh(new THREE.BoxGeometry(0.35, 0.06, 0.05), std(0xff3b6b, { emissive: 0xff3b6b, emissiveIntensity: 1.5 }), 2.5);
  eyes.position.z = 0.3;
  body.add(eyes);
  const scarf = mesh(new THREE.BoxGeometry(0.15, 0.08, 1.2), std(tc), 2.1);
  scarf.position.set(0.1, 2.1, -0.6);
  scarf.rotation.x = 0.3;
  body.add(scarf);
  const blades = new THREE.Group();
  blades.position.y = 1.4;
  for (const side of [-1, 1]) {
    const blade = mesh(new THREE.ConeGeometry(0.08, 1.0, 4).rotateX(Math.PI / 2), std(0xd9d9ff, { metalness: 0.9, roughness: 0.2, emissive: 0x9b5cff, emissiveIntensity: 0.3 }));
    blade.position.set(side * 0.6, 0, 0.5);
    blades.add(blade);
  }
  body.add(blades);
  return { height: 3.0, pulse: blades };
}

const CHAMPION_MODELS: Record<string, (team: Team, body: THREE.Group) => Partial<ViewParts>> = {
  arcanist: arcanistModel,
  ranger: rangerModel,
  warden: wardenModel,
  shade: shadeModel,
};

function championModel(defId: string, team: Team, isPlayer: boolean): ViewParts {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const extra = (CHAMPION_MODELS[defId] ?? arcanistModel)(team, body);
  root.add(makeGroundRing(1.0, 1.25, isPlayer ? 0x4cff7a : TEAM_COLOR[team], isPlayer ? 0.9 : 0.6));
  return { root, body, height: extra.height ?? 4, pulse: extra.pulse };
}

function minionModel(team: Team, type: 'melee' | 'caster'): ViewParts {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const tc = TEAM_COLOR[team];
  const dark = new THREE.Color(tc).multiplyScalar(0.55).getHex();

  if (type === 'melee') {
    body.add(mesh(new THREE.BoxGeometry(0.9, 0.9, 0.7), std(tc), 0.7));
    body.add(mesh(new THREE.BoxGeometry(0.55, 0.5, 0.5), std(dark), 1.4));
    const sword = mesh(new THREE.BoxGeometry(0.08, 0.08, 1.0), std(0xcfd6e0, { metalness: 0.8, roughness: 0.3 }), 0.8);
    sword.position.set(0.55, 0.8, 0.4);
    body.add(sword);
    return { root, body, height: 2.0 };
  }
  body.add(mesh(new THREE.ConeGeometry(0.5, 1.3, 6), std(tc), 0.65));
  body.add(mesh(new THREE.SphereGeometry(0.3, 8, 6), std(dark), 1.45));
  const orbColor = team === 'blue' ? 0x9be4ff : 0xffb08a;
  const orb = new THREE.Group();
  orb.position.set(0, 2.05, 0);
  orb.add(mesh(new THREE.OctahedronGeometry(0.16), std(orbColor, { emissive: orbColor, emissiveIntensity: 1 })), makeGlow(orbColor, 0.9, 0.7));
  body.add(orb);
  return { root, body, height: 2.3, pulse: orb };
}

function towerModel(team: Team): ViewParts {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const stone = std(0x9a9a92, { roughness: 0.85 });
  const tc = TEAM_COLOR[team];
  body.add(mesh(new THREE.CylinderGeometry(2.2, 2.6, 1.2, 8), stone, 0.6));
  body.add(mesh(new THREE.CylinderGeometry(1.3, 1.9, 5.5, 8), stone, 3.9));
  body.add(mesh(new THREE.CylinderGeometry(1.8, 1.4, 0.8, 8), std(0x6e6e66), 7));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const spike = mesh(new THREE.ConeGeometry(0.25, 1.4, 5), std(tc), 7.9);
    spike.position.x = Math.cos(a) * 1.4;
    spike.position.z = Math.sin(a) * 1.4;
    body.add(spike);
  }
  const crystal = new THREE.Group();
  crystal.userData.baseY = 9.2;
  crystal.position.y = 9.2;
  crystal.add(
    mesh(new THREE.OctahedronGeometry(0.9), std(tc, { emissive: tc, emissiveIntensity: 1.1, metalness: 0.3 })),
    makeGlow(tc, 4.5, 0.6),
  );
  body.add(crystal);
  root.traverse((o) => (o.receiveShadow = true));
  return { root, body, height: 10.5, pulse: crystal, spinner: crystal };
}

function nexusModel(team: Team): ViewParts {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const tc = TEAM_COLOR[team];
  body.add(mesh(new THREE.CylinderGeometry(4.6, 5.2, 1.2, 6), std(0x8f8f88), 0.6));
  body.add(mesh(new THREE.CylinderGeometry(3.4, 4.2, 1.2, 6), std(0x75756f), 1.8));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const pillar = mesh(new THREE.BoxGeometry(0.6, 4, 0.6), std(0xb0ada0), 4);
    pillar.position.set(Math.cos(a) * 3.6, 3.5, Math.sin(a) * 3.6);
    body.add(pillar);
  }
  const crystal = new THREE.Group();
  crystal.userData.baseY = 6;
  crystal.position.y = 6;
  const gem = mesh(new THREE.OctahedronGeometry(2.2), std(tc, { emissive: tc, emissiveIntensity: 1.0, metalness: 0.4 }));
  gem.scale.y = 1.6;
  crystal.add(gem, makeGlow(tc, 12, 0.55));
  body.add(crystal);
  const light = new THREE.PointLight(tc, 40, 25, 2);
  light.position.y = 6;
  body.add(light);
  return { root, body, height: 11, spinner: crystal };
}

export function createView(e: Entity, isPlayer: boolean): EntityView {
  let parts: ViewParts;
  switch (e.kind) {
    case 'champion':
      parts = championModel(e.champion?.defId ?? 'arcanist', e.team, isPlayer);
      break;
    case 'minion':
      parts = minionModel(e.team, e.minion?.type ?? 'melee');
      break;
    case 'tower':
      parts = towerModel(e.team);
      break;
    case 'nexus':
      parts = nexusModel(e.team);
      break;
  }
  parts.body.rotation.y = e.facing;
  return new EntityView(e.id, e.kind, e.team, parts);
}

/** Keeps one EntityView per simulation entity, including death animations after removal. */
export class EntityViewManager {
  readonly views = new Map<EntityId, EntityView>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly playerId: EntityId,
  ) {}

  get(id: EntityId): EntityView | undefined {
    return this.views.get(id);
  }

  sync(world: World, alpha: number, dt: number, time: number): void {
    for (const e of world.entities.values()) {
      let view = this.views.get(e.id);
      if (!view) {
        view = createView(e, e.id === this.playerId);
        this.views.set(e.id, view);
        this.scene.add(view.root);
      }
      view.update(e, alpha, dt, time);
    }
    for (const [id, view] of this.views) {
      if (world.entities.has(id)) continue;
      view.dying = true;
      view.animateDeath(dt);
      if (view.done) {
        this.scene.remove(view.root);
        view.dispose();
        this.views.delete(id);
      }
    }
  }
}
