import { Part } from './common.js';

export function build(def) {
  const p = new Part(def);
  const wood = '#ad744c';
  const foot = -def.size[1] / 2;
  for (const z of [-0.34, 0.34]) {
    for (const x of [-0.15, 0.15]) p.box(0.045, 1.39, 0.05, x, -0.01, z, wood,
      { rot: [0, 0, x < 0 ? -0.12 : 0.12], round: 0.008 });
  }
  p.box(0.07, 0.07, 0.80, 0, 0.65, 0, wood, { round: 0.015 });
  for (const z of [-0.34, 0.34]) p.box(0.16, 0.075, 0.08, 0, 0.65, z, wood, { round: 0.012 });
  p.box(0.30, 0.04, 0.76, 0, foot + 0.27, 0, '#d8b792');
  const colors = ['#e7afb8', '#efe3d5', '#b8c4c1', '#f2cad2'];
  colors.forEach((color, i) => {
    const z = -0.27 + i * 0.18;
    p.box(0.025, 0.10, 0.10, -0.06, 0.54, z, '#eadfd1', { round: 0.007 });
    p.box(0.10, 0.30 + (i % 2) * 0.05, 0.15, -0.07, 0.34, z, color, { round: 0.025 });
    p.box(0.10, 0.12, 0.08, -0.07, 0.43, z - 0.11, color, { round: 0.017 });
    p.box(0.10, 0.12, 0.08, -0.07, 0.43, z + 0.11, color, { round: 0.017 });
  });
  p.group.scale.y = def.size[1] / 1.44;
  p.group.rotation.y = Math.PI / 2;
  return p.finish();
}
