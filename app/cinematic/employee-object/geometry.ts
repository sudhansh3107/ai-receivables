export function polygonPoints(
  cx: number,
  cy: number,
  r: number,
  sides: number,
  rotation: number
): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

// A straight-edged radial slice between two radii — a constructed panel
// or tile, not a curved orbital arc.
export function sectorPanel(
  cx: number,
  cy: number,
  angleStart: number,
  angleEnd: number,
  rInner: number,
  rOuter: number
): [number, number][] {
  return [
    [cx + Math.cos(angleStart) * rInner, cy + Math.sin(angleStart) * rInner],
    [cx + Math.cos(angleEnd) * rInner, cy + Math.sin(angleEnd) * rInner],
    [cx + Math.cos(angleEnd) * rOuter, cy + Math.sin(angleEnd) * rOuter],
    [cx + Math.cos(angleStart) * rOuter, cy + Math.sin(angleStart) * rOuter],
  ];
}

export function strokePolygon(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][]
) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.stroke();
}

export function fillPolygon(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  fillStyle: string | CanvasGradient
) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

// A faint gradient fill across a shape's own bounding box, so a plate
// reads as a lit metal surface rather than a flat wireframe outline.
export function plateFill(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  alpha: number,
  rgb: string
) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const grad = ctx.createLinearGradient(
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys)
  );
  grad.addColorStop(0, `rgba(${rgb}, ${alpha * 1.5})`);
  grad.addColorStop(1, `rgba(${rgb}, ${alpha * 0.25})`);
  fillPolygon(ctx, pts, grad);
}

export function drawRadialTicks(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  count: number,
  rotation: number,
  tickLen: number,
  color: string,
  lineWidth = 1,
  longEvery = 0
) {
  for (let i = 0; i < count; i++) {
    const a = rotation + (i / count) * Math.PI * 2;
    const len = longEvery && i % longEvery === 0 ? tickLen * 1.8 : tickLen;
    const x1 = cx + Math.cos(a) * r;
    const y1 = cy + Math.sin(a) * r;
    const x2 = cx + Math.cos(a) * (r + len);
    const y2 = cy + Math.sin(a) * (r + len);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

// Interpolates each corner of `from` toward the corresponding corner of
// `to` — a quad-to-quad morph, not a resize. Both quads must share
// point order (see `focusTargetCorners`) or the morph will twist.
export function morphQuad(
  from: [number, number][],
  to: [number, number][],
  t: number
): [number, number][] {
  return from.map(([x, y], i) => {
    const [tx, ty] = to[i];
    return [x + (tx - x) * t, y + (ty - y) * t];
  });
}

// Scales a quad's x-coordinates toward its own centroid — the "edge-on"
// squeeze used mid-roll when one focused panel hands off to the next.
export function squeezeQuadX(
  pts: [number, number][],
  factor: number
): [number, number][] {
  if (factor === 1) return pts;
  const cx = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
  return pts.map(([x, y]) => [cx + (x - cx) * factor, y]);
}

// The four corners of a screen-space rect, in the same point order
// `sectorPanel`/`articulatedPanel` return ([innerLeft, innerRight,
// outerRight, outerLeft]) — bottom-left/bottom-right/top-right/top-left
// — so morphing a natural panel quad into this rect never twists.
export function focusTargetCorners(
  width: number,
  height: number,
  target: { xFrac: number; yFrac: number; wFrac: number; hFrac: number }
): [number, number][] {
  const cx = width * target.xFrac;
  const cy = height * target.yFrac;
  const hw = (width * target.wFrac) / 2;
  const hh = (height * target.hFrac) / 2;
  return [
    [cx - hw, cy + hh],
    [cx + hw, cy + hh],
    [cx + hw, cy - hh],
    [cx - hw, cy - hh],
  ];
}

// Scopes a soft cast shadow around a draw call, then restores state —
// the cheapest convincing depth cue for a plate sitting above the layer
// behind it.
export function withShadow<T>(
  ctx: CanvasRenderingContext2D,
  color: string,
  blur: number,
  offsetY: number,
  fn: () => T
): T {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = offsetY;
  const result = fn();
  ctx.restore();
  return result;
}
