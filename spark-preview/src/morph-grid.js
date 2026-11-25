// Each row follows the same fraction of the silhouette, each column the same
// fraction of that row. Matching grid vertices stay ordered even on a fast scrub.
const bins = 128;
export const divisions = 48;

function quantiles(weights) {
  // Reserve vertices for the actual silhouette edges. Without those anchors the
  // stretch from the canvas margin to the first interior row can produce two outlines.
  const peak = weights.reduce((a, b) => Math.max(a, b), 0);
  if (!peak) return Array.from({ length: divisions + 1 }, (_, i) => i / divisions);
  const threshold = peak * .012;
  const first = weights.findIndex(weight => weight > threshold);
  let last = bins - 1;
  while (last > first && weights[last] <= threshold) last--;
  const count = last - first + 1;
  const mass = weights.subarray(first, last + 1).reduce((a, b) => a + b, 0);
  const floor = Math.max(1e-6, mass * .02 / count);
  const padding = 3;
  // Keep vertices distinct even when the subject touches the image boundary.
  const left = Math.max(.0001, first / bins);
  const right = Math.min(.9999, (last + 1) / bins);
  const result = Array.from({ length: padding + 1 }, (_, i) => left * i / padding);
  let bin = first, before = 0;
  const interior = divisions - 2 * padding;
  for (let i = 1; i < interior; i++) {
    const target = (mass + floor * count) * i / interior;
    while (bin < last && before + weights[bin] + floor < target) before += weights[bin++] + floor;
    result.push((bin + (target - before) / (weights[bin] + floor)) / bins);
  }
  for (let i = 0; i <= padding; i++) result.push(right + (1 - right) * i / padding);
  return result;
}

export function shapeGrid(image, bounds = [0, 0, 1, 1]) {
  const sample = document.createElement("canvas");
  sample.width = sample.height = bins;
  const ctx = sample.getContext("2d");
  ctx.drawImage(image, 0, 0, bins, bins);
  const rgba = ctx.getImageData(0, 0, bins, bins).data;
  const [left, top, width, height] = bounds;
  const x0 = Math.min(bins - 1, Math.ceil(left * bins)), y0 = Math.min(bins - 1, Math.ceil(top * bins));
  const x1 = Math.max(x0, Math.min(bins - 1, Math.floor((left + width) * bins) - 1));
  const y1 = Math.max(y0, Math.min(bins - 1, Math.floor((top + height) * bins) - 1));
  const border = [[], [], []];
  function backgroundSample(x, y) {
    const k = (y * bins + x) * 4;
    border.forEach((channel, c) => channel.push(rgba[k + c]));
  }
  for (let x = x0; x <= x1; x++) { backgroundSample(x, y0); backgroundSample(x, y1); }
  for (let y = y0; y <= y1; y++) { backgroundSample(x0, y); backgroundSample(x1, y); }
  const paper = border.map(channel => channel.sort((a,b) => a-b)[Math.floor(channel.length / 2)]);
  const rows = new Float32Array(bins);
  const density = new Float32Array(bins * bins);
  for (let y = y0; y <= y1; y++) {
    let first = -1, last = -1;
    for (let x = x0; x <= x1; x++) {
      const k = (y * bins + x) * 4;
      const contrast = Math.max(...paper.map((v, c) => Math.abs(rgba[k + c] - v)));
      if (contrast <= 12) continue;
      if (first < 0) first = x;
      last = x;
      density[y * bins + x] = Math.min(1, (contrast - 12) / 70);
    }
    // Give the interior of a line drawing mass too, so an outline can become a solid.
    for (let x = first; first >= 0 && x <= last; x++) {
      const k = y * bins + x;
      density[k] = 0.72 + 0.28 * density[k];
      rows[y] += density[k];
    }
  }
  if (!rows.some(Boolean)) return null;
  const data = [];
  for (const y of quantiles(rows)) {
    const center = y * (bins - 1);
    const columns = new Float32Array(bins);
    for (let row = Math.max(0, Math.ceil(center - 5)); row <= Math.min(bins - 1, Math.floor(center + 5)); row++) {
      const weight = 5 - Math.abs(row - center);
      for (let x = 0; x < bins; x++) columns[x] += weight * density[row * bins + x];
    }
    for (const x of quantiles(columns)) data.push(x, y);
  }
  return new Float32Array(data);
}

// Align small, distinctive details after the larger silhouette has been matched.
// Compare patches in grid coordinates, where differences in framing are removed.
function luminanceGrid(canvas, grid) {
  const {data} = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  return Float32Array.from({length: grid.length / 2}, (_, i) => {
    // Bilinear samples keep a subpixel shift from jumping to a different texel.
    const x = Math.max(0, Math.min(canvas.width - 1, grid[i * 2] * canvas.width - .5));
    const y = Math.max(0, Math.min(canvas.height - 1, grid[i * 2 + 1] * canvas.height - .5));
    const left = Math.floor(x), top = Math.floor(y);
    const right = Math.min(canvas.width - 1, left + 1), bottom = Math.min(canvas.height - 1, top + 1);
    const fx = x - left, fy = y - top;
    function luma(col, row) {
      const k = 4 * (row * canvas.width + col);
      return .299 * data[k] + .587 * data[k + 1] + .114 * data[k + 2];
    }
    return (1 - fy) * ((1 - fx) * luma(left, top) + fx * luma(right, top))
      + fy * ((1 - fx) * luma(left, bottom) + fx * luma(right, bottom));
  });
}

const stride = divisions + 1;

function correlation(a, b, ia, ib) {
  let sumA = 0, sumB = 0, aa = 0, bb = 0, ab = 0;
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
    const k = y * stride + x, p = a[ia+k], q = b[ib+k];
    sumA += p; sumB += q; aa += p*p; bb += q*q; ab += p*q;
  }
  const va = aa - sumA*sumA/25, vb = bb - sumB*sumB/25;
  if (Math.min(va, vb) < 1000) return 0;
  return (ab - sumA*sumB/25) / Math.sqrt(va*vb);
}

function ordered(vertices) {
  function area(a,b,c) {
    return (vertices[b]-vertices[a])*(vertices[c+1]-vertices[a+1])
      - (vertices[b+1]-vertices[a+1])*(vertices[c]-vertices[a]);
  }
  for (let y=0; y<divisions; y++) for (let x=0; x<divisions; x++) {
    const i=2*(y*stride+x), j=i+2*stride;
    if (area(i,i+2,j)<=0 || area(i+2,j+2,j)<=0) return false;
  }
  return true;
}

export function matchDetails(from, to, a, b) {
  const src = luminanceGrid(from, a), dst = luminanceGrid(to, b);
  const shiftX = new Float32Array(src.length), shiftY = new Float32Array(src.length);
  const weights = new Float32Array(src.length);
  for (let y=5; y<=divisions-5; y+=2) for (let x=5; x<=divisions-5; x+=2) {
    const i=y*stride+x;
    const initial = correlation(src, dst, i, i);
    let best = initial, dx = 0, dy = 0;
    for (let v=-3; v<=3; v++) for (let u=-3; u<=3; u++) {
      const score=correlation(src,dst,i,i+v*stride+u) - .012*(u*u+v*v);
      if (score>best) { best=score; dx=u; dy=v; }
    }
    if (best < .65) continue;
    // Well-matched stationary patches anchor their neighbours too.
    if (best-initial < .09) { dx=0; dy=0; }
    for (let v=-4; v<=4; v++) for (let u=-4; u<=4; u++) {
      const k=i+v*stride+u, weight=best * Math.exp(-(u*u+v*v)/8);
      shiftX[k]+=weight*dx; shiftY[k]+=weight*dy; weights[k]+=weight;
    }
  }
  // Limit deformation if neighbouring landmarks disagree, keeping triangles upright.
  for (const amount of [1, .5, .25]) {
    const result = b.slice();
    for (let y=1; y<divisions; y++) for (let x=1; x<divisions; x++) {
      const k=y*stride+x, denom=weights[k]+.2;
      const xx=Math.min(divisions-1e-5,Math.max(0,x+amount*shiftX[k]/denom));
      const yy=Math.min(divisions-1e-5,Math.max(0,y+amount*shiftY[k]/denom));
      const j=2*(Math.floor(yy)*stride+Math.floor(xx)), fx=xx%1, fy=yy%1;
      for(let c=0;c<2;c++) {
        const top=b[j+c]*(1-fx)+b[j+2+c]*fx;
        const bottom=b[j+2*stride+c]*(1-fx)+b[j+2*stride+2+c]*fx;
        result[2*k+c]=top*(1-fy)+bottom*fy;
      }
    }
    // The in-between shape matters as well as the destination.
    if (ordered(result) && ordered(result.map((v,i)=>(a[i]+v)/2))) return result;
  }
  return b;
}
