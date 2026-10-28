import { Part } from './common.js';

export function build(def) {
  const p = new Part(def);
  p.cyl(0.16, 0.16, 0, 0, 0, '#c4dee2');
  p.cyl(0.145, 0.009, 0, 0.079, 0, '#eef7f4');
  p.cyl(0.125, 0.003, 0, 0.085, 0, '#9ec9d2');
  p.box(0.045, 0.07, 0.028, 0.095, 0.01, 0, '#d8e9e8', { round: 0.012 });
  return p.finish();
}
