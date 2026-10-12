import * as THREE from 'three';
import { MAP, type Vec2, clamp } from '@lol/shared';

const PITCH = THREE.MathUtils.degToRad(56);
const MIN_DIST = 28;
const MAX_DIST = 80;
const EDGE_PX = 18;
const PAN_SPEED = 70;

/** League-style camera: fixed pitch, edge panning, wheel zoom, optional lock to the champion. */
export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  readonly focus = new THREE.Vector3(30, 0, 160);
  private distance = 52;
  private targetDistance = 52;
  locked = true;
  /** Held key (Space) temporarily centers the camera on the champion. */
  centerHeld = false;
  readonly keys = new Set<string>();
  mouse: { x: number; y: number; inside: boolean } = { x: 0, y: 0, inside: false };

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(40, aspect, 1, 600);
  }

  zoom(deltaY: number): void {
    this.targetDistance = clamp(this.targetDistance * (1 + Math.sign(deltaY) * 0.12), MIN_DIST, MAX_DIST);
  }

  jumpTo(p: Vec2): void {
    this.focus.set(p.x, 0, p.y);
  }

  update(dt: number, follow: Vec2 | null, viewport: { w: number; h: number }, shake: number): void {
    if (follow && (this.locked || this.centerHeld)) {
      this.focus.x += (follow.x - this.focus.x) * Math.min(1, dt * 12);
      this.focus.z += (follow.y - this.focus.z) * Math.min(1, dt * 12);
    } else {
      let dx = 0;
      let dz = 0;
      if (this.mouse.inside) {
        if (this.mouse.x <= EDGE_PX) dx -= 1;
        if (this.mouse.x >= viewport.w - EDGE_PX) dx += 1;
        if (this.mouse.y <= EDGE_PX) dz -= 1;
        if (this.mouse.y >= viewport.h - EDGE_PX) dz += 1;
      }
      if (this.keys.has('ArrowLeft')) dx -= 1;
      if (this.keys.has('ArrowRight')) dx += 1;
      if (this.keys.has('ArrowUp')) dz -= 1;
      if (this.keys.has('ArrowDown')) dz += 1;
      this.focus.x += dx * PAN_SPEED * dt;
      this.focus.z += dz * PAN_SPEED * dt;
    }
    this.focus.x = clamp(this.focus.x, 0, MAP.size);
    this.focus.z = clamp(this.focus.z, 0, MAP.size);

    this.distance += (this.targetDistance - this.distance) * Math.min(1, dt * 10);
    const sx = shake > 0 ? (Math.random() - 0.5) * shake * 0.8 : 0;
    const sz = shake > 0 ? (Math.random() - 0.5) * shake * 0.8 : 0;
    this.camera.position.set(
      this.focus.x + sx,
      Math.sin(PITCH) * this.distance,
      this.focus.z + Math.cos(PITCH) * this.distance + sz,
    );
    this.camera.lookAt(this.focus.x + sx, 0, this.focus.z + sz);
  }

  /** Where the four screen corners hit the ground, for the minimap view box. */
  groundFrustum(): Vec2[] {
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const out: Vec2[] = [];
    for (const [x, y] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      ray.setFromCamera(new THREE.Vector2(x, y), this.camera);
      if (ray.ray.intersectPlane(plane, hit)) out.push({ x: hit.x, y: hit.z });
    }
    return out;
  }
}
