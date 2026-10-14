import * as THREE from 'three';
import { type AbilitySlot, type Command, type Entity, type EntityId, type Vec2, type World, isInvulnerable } from '@lol/shared';
import type { CameraController } from './camera';
import type { EntityViewManager } from './render/entityViews';

const ABILITY_KEYS: Record<string, AbilitySlot> = { KeyQ: 0, KeyW: 1, KeyE: 2, KeyR: 3 };
const HOLD_MOVE_INTERVAL = 0.12;

export interface InputCallbacks {
  /** Sends a command to the simulation (later: to the server). */
  send: (cmd: Command) => void;
  clickMarker: (pos: Vec2, attack: boolean) => void;
  toggleHelp: () => void;
  /** Toggles the shop, or forces it open/closed. */
  toggleShop: (open?: boolean) => void;
  /** Left-clicking a unit inspects it (null clears the selection). */
  select: (id: EntityId | null) => void;
  /** Hold Tab for the scoreboard. */
  showScore: (show: boolean) => void;
}

/** Translates mouse and keyboard into champion commands, LoL-style. */
export class InputController {
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly ndc = new THREE.Vector2();
  private rightHeld = false;
  private holdTimer = 0;
  private attackMoveArmed = false;
  hovered: Entity | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly cam: CameraController,
    private readonly world: World,
    private readonly playerId: EntityId,
    private readonly views: EntityViewManager,
    private readonly cb: InputCallbacks,
  ) {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.rightHeld = false;
    });
    window.addEventListener('mousemove', (e) => {
      this.cam.mouse = { x: e.clientX, y: e.clientY, inside: true };
    });
    document.addEventListener('mouseleave', () => (this.cam.mouse.inside = false));
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cam.zoom(e.deltaY);
    }, { passive: false });
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => {
      this.cam.keys.delete(e.code);
      if (e.code === 'Space') this.cam.centerHeld = false;
      if (e.code === 'Tab') this.cb.showScore(false);
    });
    window.addEventListener('blur', () => {
      this.cb.showScore(false);
      this.rightHeld = false;
      this.cam.keys.clear();
      this.cam.centerHeld = false;
    });
  }

  private get player(): Entity | undefined {
    return this.world.get(this.playerId);
  }

  private setNdc(clientX: number, clientY: number): void {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  }

  pickGround(clientX: number, clientY: number): Vec2 | null {
    this.setNdc(clientX, clientY);
    this.raycaster.setFromCamera(this.ndc, this.cam.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, hit) ? { x: hit.x, y: hit.z } : null;
  }

  /**
   * Enemy under the cursor. Projects each unit's vertical axis to screen space and
   * checks distance to it, which is forgiving and handles tall structures.
   */
  pickEnemy(clientX: number, clientY: number): Entity | null {
    const player = this.player;
    if (!player) return null;
    return this.pickUnit(clientX, clientY, (e) => e.team !== player.team);
  }

  /** The visible unit under the cursor that passes `filter`. */
  pickUnit(clientX: number, clientY: number, filter: (e: Entity) => boolean): Entity | null {
    const r = this.canvas.getBoundingClientRect();
    const mx = clientX - r.left;
    const my = clientY - r.top;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const e of this.world.entities.values()) {
      if (e.dead || !filter(e)) continue;
      const view = this.views.get(e.id);
      if (!view || !view.seen) continue;
      a.copy(view.renderPos).project(this.cam.camera);
      b.copy(view.renderPos).setY(view.height * 0.8).project(this.cam.camera);
      // Points behind the camera project mirrored onto the screen and can "hit" clicks far
      // from the unit; only consider units whose feet and head are both in front of it.
      if (Math.abs(a.z) > 1 || Math.abs(b.z) > 1) continue;
      const ax = (a.x * 0.5 + 0.5) * r.width;
      const ay = (-a.y * 0.5 + 0.5) * r.height;
      const bx = (b.x * 0.5 + 0.5) * r.width;
      const by = (-b.y * 0.5 + 0.5) * r.height;
      // Pixel radius scales with how big one world unit looks at that depth.
      const edge = a.clone().copy(view.renderPos).setX(view.renderPos.x + e.radius + 0.4).project(this.cam.camera);
      const radiusPx = Math.abs((edge.x * 0.5 + 0.5) * r.width - ax);
      const d = distToSegment2d(mx, my, ax, ay, bx, by);
      if (d <= radiusPx && d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private onMouseDown(e: MouseEvent): void {
    // Plain left-click inspects whatever is under the cursor (works while dead too).
    if (e.button === 0 && !this.attackMoveArmed) {
      this.cb.select(this.pickUnit(e.clientX, e.clientY, () => true)?.id ?? null);
      return;
    }
    const player = this.player;
    if (!player || player.dead || this.world.winner) return;
    if (e.button === 2) {
      this.attackMoveArmed = false;
      this.rightHeld = true;
      this.holdTimer = HOLD_MOVE_INTERVAL;
      this.commandAt(e.clientX, e.clientY, true);
    } else if (e.button === 0 && this.attackMoveArmed) {
      this.attackMoveArmed = false;
      const target = this.pickEnemy(e.clientX, e.clientY);
      if (target) {
        this.cb.send({ type: 'attack', unitId: this.playerId, targetId: target.id });
        this.cb.clickMarker(target.pos, true);
        return;
      }
      const g = this.pickGround(e.clientX, e.clientY);
      if (g) {
        this.cb.send({ type: 'attackMove', unitId: this.playerId, target: g });
        this.cb.clickMarker(g, true);
      }
    }
  }

  /** Right-click: attack the enemy under the cursor, otherwise move. */
  private commandAt(clientX: number, clientY: number, showMarker: boolean): void {
    const target = this.pickEnemy(clientX, clientY);
    if (target && !isInvulnerable(this.world, target)) {
      this.cb.send({ type: 'attack', unitId: this.playerId, targetId: target.id });
      if (showMarker) this.cb.clickMarker(target.pos, true);
      return;
    }
    const g = this.pickGround(clientX, clientY);
    if (!g) return;
    this.cb.send({ type: 'move', unitId: this.playerId, target: g });
    if (showMarker) this.cb.clickMarker(g, false);
  }

  /** Move the champion to a world point (used by the minimap). */
  moveTo(p: Vec2): void {
    this.cb.send({ type: 'move', unitId: this.playerId, target: p });
    this.cb.clickMarker(p, false);
  }

  private onKeyDown(e: KeyboardEvent): void {
    // Tab would otherwise move keyboard focus around the page.
    if (e.code === 'Tab') e.preventDefault();
    if (e.repeat && e.code !== 'Space') return;
    this.cam.keys.add(e.code);
    const slot = ABILITY_KEYS[e.code];
    if (slot !== undefined) {
      const g = this.pickGround(this.cam.mouse.x, this.cam.mouse.y);
      if (g) this.cb.send({ type: 'cast', unitId: this.playerId, slot, target: g });
      return;
    }
    const itemSlot = /^Digit([1-6])$/.exec(e.code);
    if (itemSlot) {
      const g = this.pickGround(this.cam.mouse.x, this.cam.mouse.y);
      if (g) this.cb.send({ type: 'useItem', unitId: this.playerId, slot: Number(itemSlot[1]) - 1, target: g });
      return;
    }
    switch (e.code) {
      case 'KeyA':
        this.attackMoveArmed = true;
        break;
      case 'KeyS':
        this.cb.send({ type: 'stop', unitId: this.playerId });
        break;
      case 'KeyB':
        this.cb.send({ type: 'recall', unitId: this.playerId });
        break;
      case 'KeyY':
        this.cam.locked = !this.cam.locked;
        break;
      case 'Space':
        e.preventDefault();
        this.cam.centerHeld = true;
        break;
      case 'KeyH':
      case 'F1':
        e.preventDefault();
        this.cb.toggleHelp();
        break;
      case 'KeyP':
        this.cb.toggleShop();
        break;
      case 'Tab':
        e.preventDefault();
        this.cb.showScore(true);
        break;
      case 'Escape':
        this.attackMoveArmed = false;
        this.cb.toggleShop(false);
        break;
    }
  }

  /** Per-frame: hover detection and continuous movement while right mouse is held. */
  update(dt: number): void {
    const m = this.cam.mouse;
    this.hovered = m.inside ? this.pickEnemy(m.x, m.y) : null;
    this.canvas.parentElement?.classList.toggle('attack-cursor', !!this.hovered || this.attackMoveArmed);
    if (this.rightHeld) {
      this.holdTimer -= dt;
      if (this.holdTimer <= 0) {
        this.holdTimer = HOLD_MOVE_INTERVAL;
        const player = this.player;
        if (player && !player.dead) this.commandAt(m.x, m.y, false);
      }
    }
  }
}

function distToSegment2d(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const l2 = abx * abx + aby * aby;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / l2));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}
