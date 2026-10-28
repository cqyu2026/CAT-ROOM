import { Part } from './common.js';

export function build(def) {
  const p = new Part(def);
  const paper = '#dfc7a2';
  p.box(0.48, 0.015, 0.13, 0.18, -0.025, 0.02, paper,
    { rot: [0, 0.12, 0], round: 0.005 });
  for (let i = 0; i < 14; i++) {
    const a = i * 0.61;
    const r = 0.11 - i * 0.005;
    p.box(0.067, 0.012, 0.025, Math.cos(a) * r, 0, Math.sin(a) * r, paper,
      { rot: [0, -a, 0], round: 0.004 });
  }
  for (let i = 0; i < 6; i++) p.box(0.08, 0.01, 0.065, 0.12 + i * 0.07, -0.015, 0.05 + Math.sin(i) * 0.035, paper,
    { rot: [0, Math.sin(i) * 0.22, 0], round: 0.003 });
  return p.finish();
}
