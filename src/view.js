// Total paper-strip width at Fit, in CSS pixels. PDF and markup coordinates
// remain independent of this presentation calculation.
export function fittedDrawingWidth(width, height, aspect, split = false, gap = 16) {
  if (![width, height, aspect].every(value => Number.isFinite(value) && value > 0)) return 1;
  return Math.min(width, height * aspect * (split ? 2 : 1) + (split ? gap : 0));
}
