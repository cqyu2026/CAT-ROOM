import * as THREE from 'three';
import { Part } from './common.js';

export function build(def) {
  const p = new Part(def);
  for (const [x, fill] of [[-0.19, '#84644a'], [0.19, '#9dc7d1']]) {
    p.cyl(0.28, 0.065, x, -0.012, 0, '#f9f4eb');
    p.cyl(0.225, 0.004, x, 0.023, 0, fill);
    p.add(new THREE.TorusGeometry(0.121, 0.018, 8, 28), x, 0.026, 0, '#fffdf8', { rot: [-Math.PI / 2, 0, 0] });
  }
  return p.finish();
}
