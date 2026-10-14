import * as THREE from 'three';
import type { Team, Vec2 } from '@lol/shared';

export const TEAM_COLOR: Record<Team, number> = { blue: 0x3b82f6, red: 0xef4444 };

/** Simulation (x, y) lies on the world XZ plane. */
export const toWorld = (p: Vec2, height = 0, out = new THREE.Vector3()): THREE.Vector3 => out.set(p.x, height, p.y);

let glowTexture: THREE.Texture | null = null;

/** Soft radial gradient used for glows and particles. */
export function getGlowTexture(): THREE.Texture {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(c);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

export function makeGlow(color: number, size: number, opacity = 1): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  return s;
}

/** Flat ring lying on the ground. */
export function makeGroundRing(inner: number, outer: number, color: number, opacity = 0.8): THREE.Mesh {
  const geo = new THREE.RingGeometry(inner, outer, 64);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = 0.05;
  m.renderOrder = 1;
  return m;
}

/** Deterministic PRNG so scenery is identical every load. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}

// ---------------------------------------------------------------------------
// Model building helpers.

export function std(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: true, ...opts });
  m.userData.baseEmissive = opts.emissiveIntensity ?? 0;
  return m;
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, y = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.y = y;
  m.castShadow = true;
  return m;
}
