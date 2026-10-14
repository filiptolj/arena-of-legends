import * as THREE from 'three';
import type { Team } from '@lol/shared';
import { TEAM_COLOR, makeGlow, mesh, std } from './util';

/** A champion described as parts: body type, head and weapon, plus colors. */
export interface HeroSpec {
  build: 'robe' | 'armored' | 'slim' | 'mech' | 'hulking';
  head: 'hood' | 'helm' | 'crown' | 'hair' | 'horns' | 'visor' | 'rock' | 'hat' | 'ears';
  weapon: 'greatsword' | 'axe' | 'bow' | 'gun' | 'hookArm' | 'staff' | 'claws' | 'katana' | 'orb' | 'lantern' | 'none';
  primary: number;
  secondary: number;
  /** Hair, hood or skin color depending on the head. */
  headColor: number;
  glow: number;
  scale?: number;
}

export const CHAMPION_MODEL_SPECS: Record<string, HeroSpec> = {
  ironhook: { build: 'mech', head: 'visor', weapon: 'hookArm', primary: 0xb08a3a, secondary: 0x6a5a40, headColor: 0xb08a3a, glow: 0xffb84a, scale: 1.15 },
  valor: { build: 'armored', head: 'helm', weapon: 'greatsword', primary: 0xc0c8d8, secondary: 0x3a5fb0, headColor: 0xc0c8d8, glow: 0xffe8a0 },
  sunweaver: { build: 'robe', head: 'hair', weapon: 'staff', primary: 0xf2efe6, secondary: 0xd9c47a, headColor: 0xf5d76e, glow: 0xfff3a0 },
  frostbloom: { build: 'slim', head: 'hood', weapon: 'bow', primary: 0x6aa8d8, secondary: 0xe8f4ff, headColor: 0x9fd8ff, glow: 0x9fd8ff },
  bloodreaver: { build: 'armored', head: 'horns', weapon: 'axe', primary: 0x3a2a2a, secondary: 0x7a1a1a, headColor: 0x3a2a2a, glow: 0xff3030, scale: 1.1 },
  mistweaver: { build: 'robe', head: 'crown', weapon: 'staff', primary: 0xd8f0e8, secondary: 0x5ab8a0, headColor: 0xc8a8ff, glow: 0x6aff9a },
  nightstalker: { build: 'slim', head: 'horns', weapon: 'claws', primary: 0x2a1a3a, secondary: 0x8a40c0, headColor: 0x2a1a3a, glow: 0xff4bd8 },
  stonewall: { build: 'hulking', head: 'rock', weapon: 'none', primary: 0x7a6a5a, secondary: 0xff9a40, headColor: 0x7a6a5a, glow: 0xff9a40, scale: 1.15 },
  volt: { build: 'slim', head: 'hat', weapon: 'gun', primary: 0x6a3aa0, secondary: 0x2a2a3a, headColor: 0x2a2a3a, glow: 0xffe0a0 },
  tempest: { build: 'slim', head: 'hair', weapon: 'katana', primary: 0x3a6a9a, secondary: 0xd8d0c0, headColor: 0x2a2a2a, glow: 0xcfe8ff },
  kitsu: { build: 'slim', head: 'ears', weapon: 'orb', primary: 0xd04a7a, secondary: 0xffe0f0, headColor: 0x2a1a2a, glow: 0xff7ab8 },
  lanternkeeper: { build: 'robe', head: 'hood', weapon: 'lantern', primary: 0x1a3a2a, secondary: 0x6aff9a, headColor: 0x14281e, glow: 0x6aff9a },
  firecracker: { build: 'slim', head: 'hair', weapon: 'gun', primary: 0xd05a9a, secondary: 0x2a2a3a, headColor: 0x3a8aff, glow: 0xff4a8a },
  pyra: { build: 'robe', head: 'hair', weapon: 'orb', primary: 0x8a2a5a, secondary: 0xffb040, headColor: 0xd03a2a, glow: 0xff7a30, scale: 0.8 },
  umbra: { build: 'slim', head: 'helm', weapon: 'claws', primary: 0x1a1a1a, secondary: 0xd03a3a, headColor: 0x2a2a2a, glow: 0xff3a3a },
  dawnshield: { build: 'armored', head: 'crown', weapon: 'greatsword', primary: 0xd0a030, secondary: 0xfff0c0, headColor: 0xd0a030, glow: 0xffd060 },
};

const SKIN = 0xe8c09a;

/** Builds the body and returns where the head sits. */
function buildBody(spec: HeroSpec, team: Team, body: THREE.Group): number {
  const p = std(spec.primary);
  const s = std(spec.secondary);
  const trim = std(TEAM_COLOR[team], { metalness: 0.4 });
  switch (spec.build) {
    case 'robe': {
      body.add(mesh(new THREE.ConeGeometry(0.85, 2.2, 10), p, 1.1));
      body.add(mesh(new THREE.CylinderGeometry(0.32, 0.45, 0.8, 8), s, 2.0));
      body.add(mesh(new THREE.TorusGeometry(0.52, 0.07, 6, 16).rotateX(Math.PI / 2), trim, 1.3));
      return 2.6;
    }
    case 'armored': {
      body.add(mesh(new THREE.BoxGeometry(1.1, 1.1, 0.7), p, 1.75));
      body.add(mesh(new THREE.BoxGeometry(0.95, 0.4, 0.6), trim, 1.05));
      for (const side of [-1, 1]) {
        const leg = mesh(new THREE.BoxGeometry(0.32, 0.9, 0.36), s, 0.45);
        leg.position.x = side * 0.25;
        body.add(leg);
        const pauldron = mesh(new THREE.SphereGeometry(0.35, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), s, 2.25);
        pauldron.position.x = side * 0.7;
        body.add(pauldron);
        const arm = mesh(new THREE.BoxGeometry(0.24, 0.9, 0.24), p, 1.65);
        arm.position.x = side * 0.72;
        body.add(arm);
      }
      return 2.65;
    }
    case 'slim': {
      body.add(mesh(new THREE.CylinderGeometry(0.3, 0.42, 1.1, 8), p, 1.6));
      body.add(mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.25, 8), trim, 1.05));
      for (const side of [-1, 1]) {
        const leg = mesh(new THREE.CylinderGeometry(0.12, 0.1, 1.0, 6), s, 0.5);
        leg.position.x = side * 0.18;
        body.add(leg);
        const arm = mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.9, 6), p, 1.6);
        arm.position.x = side * 0.48;
        body.add(arm);
      }
      // A short cape.
      const cape = mesh(new THREE.PlaneGeometry(0.8, 1.2), std(spec.secondary, { side: THREE.DoubleSide }), 1.5);
      cape.position.z = -0.32;
      cape.rotation.x = 0.15;
      body.add(cape);
      return 2.45;
    }
    case 'mech': {
      body.add(mesh(new THREE.CylinderGeometry(0.75, 0.65, 1.5, 12), p, 1.6));
      body.add(mesh(new THREE.TorusGeometry(0.72, 0.1, 6, 18).rotateX(Math.PI / 2), trim, 1.2));
      body.add(mesh(new THREE.TorusGeometry(0.72, 0.1, 6, 18).rotateX(Math.PI / 2), s, 2.0));
      for (const side of [-1, 1]) {
        const leg = mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.9, 8), s, 0.45);
        leg.position.x = side * 0.35;
        body.add(leg);
      }
      // Exhaust stacks.
      for (const side of [-1, 1]) {
        const pipe = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 6), s, 2.5);
        pipe.position.set(side * 0.35, 2.5, -0.5);
        body.add(pipe);
      }
      return 2.55;
    }
    case 'hulking': {
      const torso = mesh(new THREE.IcosahedronGeometry(0.95, 0), p, 1.7);
      torso.scale.set(1.15, 1, 0.9);
      body.add(torso);
      const crack = std(spec.secondary, { emissive: spec.secondary, emissiveIntensity: 1.2 });
      for (let i = 0; i < 4; i++) {
        const c = mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), crack, 1.4 + i * 0.25);
        c.position.set(-0.4 + i * 0.25, 1.4 + (i % 2) * 0.3, 0.78);
        body.add(c);
      }
      for (const side of [-1, 1]) {
        const fist = mesh(new THREE.DodecahedronGeometry(0.5, 0), p, 1.0);
        fist.position.x = side * 1.15;
        body.add(fist);
        const leg = mesh(new THREE.DodecahedronGeometry(0.4, 0), p, 0.4);
        leg.position.x = side * 0.4;
        body.add(leg);
      }
      body.add(mesh(new THREE.BoxGeometry(1.0, 0.25, 0.6), std(TEAM_COLOR[team]), 0.95));
      return 2.55;
    }
  }
}

function buildHead(spec: HeroSpec, body: THREE.Group, y: number): number {
  const hc = std(spec.headColor);
  const skin = std(SKIN);
  switch (spec.head) {
    case 'hood': {
      body.add(mesh(new THREE.SphereGeometry(0.34, 12, 10), skin, y));
      const hood = mesh(new THREE.ConeGeometry(0.48, 0.95, 8), hc, y + 0.3);
      hood.rotation.x = -0.25;
      body.add(hood);
      return y + 0.8;
    }
    case 'helm': {
      body.add(mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.62, 10), std(spec.headColor, { metalness: 0.7, roughness: 0.3 }), y));
      const plume = mesh(new THREE.BoxGeometry(0.08, 0.35, 0.6), std(spec.secondary), y + 0.45);
      body.add(plume);
      const slit = mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), std(0x111111), y + 0.05);
      slit.position.z = 0.38;
      body.add(slit);
      return y + 0.7;
    }
    case 'crown': {
      body.add(mesh(new THREE.SphereGeometry(0.34, 12, 10), skin, y));
      body.add(mesh(new THREE.SphereGeometry(0.37, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hc, y + 0.04));
      const horn = mesh(new THREE.ConeGeometry(0.07, 0.6, 6), std(0xfff6d0, { emissive: spec.glow, emissiveIntensity: 0.6 }), y + 0.5);
      horn.position.z = 0.15;
      horn.rotation.x = 0.3;
      body.add(horn);
      return y + 0.8;
    }
    case 'hair': {
      body.add(mesh(new THREE.SphereGeometry(0.34, 12, 10), skin, y));
      const hair = mesh(new THREE.SphereGeometry(0.37, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), hc, y + 0.02);
      body.add(hair);
      const tail = mesh(new THREE.ConeGeometry(0.14, 0.9, 6).rotateX(Math.PI), hc, y - 0.3);
      tail.position.z = -0.32;
      body.add(tail);
      return y + 0.45;
    }
    case 'horns': {
      body.add(mesh(new THREE.SphereGeometry(0.34, 12, 10), hc, y));
      for (const side of [-1, 1]) {
        const horn = mesh(new THREE.ConeGeometry(0.08, 0.55, 6), std(0xe8e0d0), y + 0.35);
        horn.position.x = side * 0.22;
        horn.rotation.z = -side * 0.5;
        body.add(horn);
      }
      const eyes = mesh(new THREE.BoxGeometry(0.3, 0.05, 0.05), std(spec.glow, { emissive: spec.glow, emissiveIntensity: 1.5 }), y + 0.03);
      eyes.position.z = 0.3;
      body.add(eyes);
      return y + 0.7;
    }
    case 'visor': {
      body.add(mesh(new THREE.SphereGeometry(0.45, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(spec.headColor, { metalness: 0.6 }), y - 0.1));
      const visor = mesh(new THREE.BoxGeometry(0.55, 0.12, 0.08), std(spec.glow, { emissive: spec.glow, emissiveIntensity: 1.5 }), y + 0.05);
      visor.position.z = 0.4;
      body.add(visor);
      return y + 0.45;
    }
    case 'rock': {
      body.add(mesh(new THREE.DodecahedronGeometry(0.42, 0), hc, y));
      const eyes = mesh(new THREE.BoxGeometry(0.32, 0.06, 0.05), std(spec.glow, { emissive: spec.glow, emissiveIntensity: 1.5 }), y + 0.05);
      eyes.position.z = 0.36;
      body.add(eyes);
      return y + 0.5;
    }
    case 'ears': {
      body.add(mesh(new THREE.SphereGeometry(0.34, 12, 10), std(SKIN), y));
      body.add(mesh(new THREE.SphereGeometry(0.37, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hc, y + 0.02));
      for (const side of [-1, 1]) {
        const ear = mesh(new THREE.ConeGeometry(0.13, 0.4, 4), std(spec.primary), y + 0.42);
        ear.position.x = side * 0.2;
        ear.rotation.z = -side * 0.25;
        body.add(ear);
      }
      // Tails fanning out behind.
      for (let i = -2; i <= 2; i++) {
        const tail = mesh(new THREE.ConeGeometry(0.12, 1.1, 6), std(0xfff4f8), 1.3);
        tail.position.set(i * 0.15, 1.3, -0.5);
        tail.rotation.set(-1.0, 0, i * 0.3);
        body.add(tail);
      }
      return y + 0.7;
    }
    case 'hat': {
      body.add(mesh(new THREE.SphereGeometry(0.33, 12, 10), skin, y));
      body.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 16), hc, y + 0.28));
      body.add(mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.6, 12), hc, y + 0.6));
      body.add(mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.1, 12), std(spec.primary), y + 0.36));
      return y + 0.95;
    }
  }
}

/** Builds the weapon in the right hand; returns the part that pulses when attacking. */
function buildWeapon(spec: HeroSpec, body: THREE.Group): THREE.Object3D | undefined {
  const metal = std(0xd0d6e0, { metalness: 0.85, roughness: 0.25 });
  const wood = std(0x6b4a2a);
  const hand = new THREE.Group();
  hand.position.set(0.75, 1.3, 0.3);
  body.add(hand);
  const tip = new THREE.Group();
  switch (spec.weapon) {
    case 'greatsword': {
      const blade = mesh(new THREE.BoxGeometry(0.16, 2.0, 0.05), metal, 1.0);
      blade.rotation.x = 0.4;
      hand.add(blade, mesh(new THREE.BoxGeometry(0.5, 0.08, 0.12), std(spec.glow), 0));
      tip.position.set(0, 1.6, 0.6);
      break;
    }
    case 'axe': {
      const handle = mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.0, 6), wood, 0.5);
      const head = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 12, 1, false, 0, Math.PI), std(spec.secondary, { metalness: 0.7 }), 1.3);
      head.rotation.set(Math.PI / 2, 0, Math.PI / 2);
      hand.add(handle, head);
      tip.position.set(0, 1.3, 0);
      break;
    }
    case 'bow': {
      const bow = mesh(new THREE.TorusGeometry(0.85, 0.05, 6, 18, Math.PI), std(spec.secondary));
      bow.rotation.z = -Math.PI / 2;
      hand.add(bow);
      tip.position.set(0.1, 0, 0.2);
      break;
    }
    case 'gun': {
      const barrel = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 8).rotateX(Math.PI / 2), std(0x3a3a44, { metalness: 0.8 }));
      barrel.position.z = 0.6;
      const stock = mesh(new THREE.BoxGeometry(0.14, 0.25, 0.5), wood);
      stock.position.z = -0.2;
      hand.add(barrel, stock);
      tip.position.set(0, 0, 1.45);
      break;
    }
    case 'hookArm': {
      hand.position.set(0.95, 1.5, 0.2);
      const arm = mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.3, 8), std(spec.primary, { metalness: 0.6 }));
      arm.position.y = -0.3;
      const fist = mesh(new THREE.BoxGeometry(0.55, 0.5, 0.55), std(spec.secondary, { metalness: 0.6 }), -1.05);
      hand.add(arm, fist);
      tip.position.set(0, -1.05, 0.3);
      break;
    }
    case 'staff': {
      hand.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.0, 6), wood, 0.4));
      tip.position.set(0, 2.0, 0);
      tip.add(mesh(new THREE.OctahedronGeometry(0.22), std(spec.glow, { emissive: spec.glow, emissiveIntensity: 1.4 })));
      break;
    }
    case 'claws': {
      for (const side of [-1, 1]) {
        const claws = new THREE.Group();
        claws.position.set(side === 1 ? 0 : -1.5, 0, 0.2);
        for (let i = -1; i <= 1; i++) {
          const c = mesh(new THREE.ConeGeometry(0.04, 0.7, 4).rotateX(Math.PI / 2), std(spec.glow, { emissive: spec.glow, emissiveIntensity: 0.8 }));
          c.position.set(i * 0.1, 0, 0.35);
          claws.add(c);
        }
        hand.add(claws);
      }
      tip.position.set(0, 0, 0.6);
      break;
    }
    case 'katana': {
      const blade = mesh(new THREE.BoxGeometry(0.06, 1.7, 0.12), metal, 0.95);
      blade.rotation.x = 0.6;
      hand.add(blade, mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 10), std(0xb08a3a), 0.05));
      tip.position.set(0, 1.4, 0.8);
      break;
    }
    case 'orb': {
      // A spirit orb hovering in front of the open hand.
      tip.position.set(0, 0.2, 0.5);
      tip.add(mesh(new THREE.SphereGeometry(0.22, 12, 10), std(spec.glow, { emissive: spec.glow, emissiveIntensity: 1.6 })));
      break;
    }
    case 'lantern': {
      hand.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 4), std(0x444444), -0.3));
      tip.position.set(0, -0.85, 0);
      tip.add(
        mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), std(0x2a2a2a, { metalness: 0.6, transparent: true, opacity: 0.7 })),
        mesh(new THREE.OctahedronGeometry(0.16), std(spec.glow, { emissive: spec.glow, emissiveIntensity: 1.8 })),
      );
      break;
    }
    case 'none':
      return undefined;
  }
  tip.add(makeGlow(spec.glow, 1.4, 0.8));
  hand.add(tip);
  return tip;
}

/** Builds a champion model from its spec into `body`. */
export function heroModel(spec: HeroSpec, team: Team, body: THREE.Group): { height: number; pulse?: THREE.Object3D } {
  const headY = buildBody(spec, team, body);
  const top = buildHead(spec, body, headY);
  const pulse = buildWeapon(spec, body);
  const scale = spec.scale ?? 1;
  body.scale.setScalar(scale);
  return { height: top * scale + 0.4, pulse };
}
