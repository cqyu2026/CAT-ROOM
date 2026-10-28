import * as THREE from 'three';
import { Part } from './common.js';

export function build(def) {
  const p = new Part(def);
  const fabric = '#d9dcde';
  const opening = '#777f82';
  const shell = p.add(new THREE.CylinderGeometry(0.26, 0.26, 0.94, 48, 1, true),
    0, 0, 0, fabric, { rot: [0, 0, Math.PI / 2] });
  shell.material.side = THREE.DoubleSide;
  for (const x of [-0.47, 0.47]) {
    p.add(new THREE.TorusGeometry(0.245, 0.017, 8, 48), x, 0, 0,
      '#bfc5c7', { rot: [0, Math.PI / 2, 0] });
  }
  p.add(new THREE.CircleGeometry(0.105, 40), 0, 0, 0.265, opening,
    { noShadow: true });
  p.add(new THREE.TorusGeometry(0.108, 0.012, 8, 40), 0, 0, 0.272,
    '#c9cecf', { noShadow: true });
  return p.finish();
}
