// Texture-only rig for the approved deer PNG. Source pixels and alpha are
// sampled unchanged; the shared MonsterArt cache owns the finite pose images.
const TAU = Math.PI * 2;
const SCALE = 128 / 1125;
const ANCHOR_X = 731.25, GROUND_Y = 1200, FOOT = 40;
const CROP = Object.freeze({ x: 215, y: 71, width: 831, height: 1134 });
const DUTY = .55, STRIDE = 48;
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const smooth = n => { const t = clamp(n); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const project = (x, y) => ({ x: (ANCHOR_X - x) * SCALE, y: FOOT + (y - GROUND_Y) * SCALE });

const LEGS = Object.freeze([
  { id: 'frontFar', fore: true, far: true, offset: .5, width: 90, root: [510, 930], knee: [500, 1040], foot: [481, 1161] },
  { id: 'hindFar', fore: false, far: true, offset: 0, width: 85, root: [835, 950], knee: [828, 1050], foot: [811, 1147] },
  { id: 'frontNear', fore: true, far: false, offset: 0, width: 90, root: [625, 900], knee: [620, 1055], foot: [619.5, 1200] },
  { id: 'hindNear', fore: false, far: false, offset: .5, width: 100, root: [925, 920], knee: [975, 1055], foot: [981.5, 1177] }
]);

// Dense below the belly, coarse over the rigid skull/antlers. Every adjacent
// triangle references the same vertex; no cut-out parts or per-limb images.
const XS = [215, 320, 400, 450, 505, 550, 570, 620, 700, 750, 810, 875, 915, 980, 1046];
const YS = [71, 510, 650, 770, 850, 940, 980, 1040, 1070, 1110, 1145, 1152, 1165, 1177, 1205];
const GAPS = [
  [1040, 560, 564, 886, 910], [1070, 550, 571, 877, 923],
  [1110, 543, 570, 867, 927], [1145, 536, 559, 855, 917],
  [1152, 533, 555, 835, 916], [1165, 530, 552, 833, 915],
  [1177, 530, 550, 833, 915], [1205, 530, 550, 833, 915]
];
function sourceColumn(x, y, col) {
  if (![5, 6, 11, 12].includes(col) || y < 1040) return x;
  let a = GAPS[0], b = GAPS.at(-1);
  for (let i = 1; i < GAPS.length; i++) if (y <= GAPS[i][0]) { a = GAPS[i - 1]; b = GAPS[i]; break; }
  const index = col === 5 ? 1 : col === 6 ? 2 : col === 11 ? 3 : 4;
  return mix(a[index], b[index], clamp((y - a[0]) / Math.max(1, b[0] - a[0])));
}
const SOURCE_VERTICES = Object.freeze(YS.flatMap(y => XS.map((x, col) => Object.freeze({ sourceX: sourceColumn(x, y, col), sourceY: y }))));
const TRIANGLES = Object.freeze(YS.slice(1).flatMap((_, row) => XS.slice(1).flatMap((_, col) => {
  const a = row * XS.length + col, b = a + 1, d = a + XS.length, e = d + 1;
  return (row + col) % 2 ? [Object.freeze([a, b, d]), Object.freeze([b, e, d])] : [Object.freeze([a, b, e]), Object.freeze([a, e, d])];
})).sort((a, b) => triangleDepth(a) - triangleDepth(b)));

function nearestLeg(x, y) {
  let nearest = null, distance = Infinity;
  for (let i = 0; i < LEGS.length; i++) {
    const leg = LEGS[i], upper = y <= leg.knee[1];
    // A far hoof which has already ended in the PNG cannot control pixels
    // below it. Those pixels include the wider, lower near-hoof silhouette.
    if (y > leg.foot[1] + 5) continue;
    const a = upper ? leg.root : leg.knee, b = upper ? leg.knee : leg.foot;
    const t = clamp((y - a[1]) / Math.max(1, b[1] - a[1]));
    const d = Math.abs(x - mix(a[0], b[0], t)) / leg.width;
    if (d < distance) { distance = d; nearest = { index: i, leg, distance }; }
  }
  return nearest;
}

function triangleDepth(indices) {
  const points = indices.map(i => SOURCE_VERTICES[i]);
  const x = points.reduce((sum, v) => sum + v.sourceX, 0) / 3;
  const y = points.reduce((sum, v) => sum + v.sourceY, 0) / 3;
  if (y < 920) return 1;
  const nearest = nearestLeg(x, y);
  return nearest && y > nearest.leg.root[1] + 35 ? nearest.leg.far ? 0 : 2 : 1;
}

export const FROSTCROWN_RIG = Object.freeze({ scale: SCALE, anchorX: ANCHOR_X, groundY: GROUND_Y,
  foot: FOOT, crop: CROP, stride: STRIDE, stanceFraction: DUTY, triangles: TRIANGLES.length });

function poseState(pose) {
  const mode = pose.mode || 'idle', action = pose.action || '', t = clamp(finite(pose.progress));
  const cycle = finite(pose.cycle), moving = pose.moving ?? ['move', 'rush', 'air'].includes(mode);
  const ready = mode === 'windup' ? smooth(t) : 0;
  const release = ['active', 'rush'].includes(mode) ? 1 : 0;
  const rest = mode === 'recovery' ? 1 - smooth(t) : 0;
  const hit = mode === 'hit' ? 1 - smooth(t) : 0;
  const charge = action === 'frostCharge', running = mode === 'rush';
  const pulse = moving ? Math.sin(cycle * 2) : 0;
  const bodyY = (charge ? ready * 15 + (running ? 10 : 0) + rest * 5 : 0)
    + (action === 'shatter' ? ready * 18 - release * 8 : 0)
    + (action === 'frostRing' ? ready * 6 - release * 4 : 0) + hit * 11 - Math.abs(pulse) * 4;
  const bodyX = (moving ? Math.sin(cycle) * 1.6 : 0) + hit * 4;
  const compress = (charge ? ready : 0) + (action === 'shatter' ? ready * .65 : 0) + hit * .8;
  let headAngle = charge ? -ready * .075 - (running ? .11 : release * .085) - rest * .04 : 0;
  if (action === 'frostbolt') headAngle += ready * .015 + release * .028 + rest * .012;
  if (action === 'frostRing') headAngle += ready * .024 + release * .035 + rest * .018;
  if (action === 'shatter') headAngle += -ready * .025 + release * .022 - rest * .012;
  headAngle += -hit * .045 + (moving ? Math.sin(cycle) * .006 : 0);
  return { mode, action, t, cycle, moving, ready, release, rest, hit, running, bodyX, bodyY,
    compress, headAngle, static: mode === 'idle' && !moving };
}

function feetFor(s) {
  return LEGS.map(leg => {
    const rest = project(...leg.foot);
    const phase = ((s.cycle / TAU + leg.offset) % 1 + 1) % 1;
    let dx = 0, lift = 0, planted = true;
    if (s.moving) {
      const reach = STRIDE * DUTY * .5;
      planted = phase < DUTY;
      if (planted) dx = mix(reach, -reach, phase / DUTY);
      else {
        const swing = (phase - DUTY) / (1 - DUTY);
        dx = mix(-reach, reach, smooth(swing));
        lift = Math.sin(swing * Math.PI) * (s.running ? 5.2 : 3.8);
      }
    }
    if (s.action === 'frostCharge' && !s.moving) dx += (leg.fore ? 1.7 : -1.1) * (s.ready + s.rest * .6);
    if (s.action === 'frostbolt') dx += (leg.fore ? .7 : -.3) * (s.ready + s.rest * .5);
    if (s.action === 'frostRing') dx += (rest.x >= 0 ? 1 : -1) * (s.ready + s.release * 1.6 + s.rest * .5);
    if (s.action === 'shatter' && leg.fore) {
      lift += s.ready * (leg.far ? 1 : 2.6) + s.rest * .7;
      dx += s.ready * 1.2;
    }
    if (s.hit) {
      dx += (rest.x >= 0 ? -1 : 1) * s.hit * 1.8;
      if (leg.id === 'frontNear' || leg.id === 'hindFar') lift += s.hit * 1.6;
    }
    if (lift > .0001) planted = false;
    return { id: leg.id, fore: leg.fore, far: leg.far, phase, planted, lift, dx, rest,
      source: { x: leg.foot[0], y: leg.foot[1] }, target: { x: rest.x + dx, y: rest.y - lift } };
  });
}

/** Pure canonical-right hoof positions, shared with body geometry checks. */
export function frostcrownRigFeet(pose = {}) { return feetFor(poseState(pose)); }

function torsoPoint(x, y, s) {
  return { x: 770 + (x - 770) * (1 + s.compress * .018) + s.bodyX,
    y: 870 + (y - 870) * (1 - s.compress * .026) + s.bodyY };
}

function boneMap(restA, restB, nextA, nextB) {
  const dx = restB[0] - restA[0], dy = restB[1] - restA[1], length = Math.max(.001, Math.hypot(dx, dy));
  const ux = dx / length, uy = dy / length;
  const nx = nextB.x - nextA.x, ny = nextB.y - nextA.y, nextLength = Math.max(.001, Math.hypot(nx, ny));
  const vx = nx / nextLength, vy = ny / nextLength, stretch = nextLength / length;
  return (x, y) => {
    const a = (x - restA[0]) * ux + (y - restA[1]) * uy;
    const b = -(x - restA[0]) * uy + (y - restA[1]) * ux;
    return { x: nextA.x + vx * a * stretch - vy * b, y: nextA.y + vy * a * stretch + vx * b };
  };
}

function legBones(leg, foot, s) {
  const root = torsoPoint(...leg.root, s);
  const target = { x: ANCHOR_X - foot.target.x / SCALE, y: GROUND_Y + (foot.target.y - FOOT) / SCALE };
  const dx = target.x - root.x, dy = target.y - root.y, distance = Math.max(.001, Math.hypot(dx, dy));
  let upperLength = Math.hypot(leg.knee[0] - leg.root[0], leg.knee[1] - leg.root[1]);
  let lowerLength = Math.hypot(leg.foot[0] - leg.knee[0], leg.foot[1] - leg.knee[1]);
  // A small longitudinal stretch accommodates the stride without changing
  // hoof width; transverse material thickness stays equal to the PNG.
  const stretch = Math.max(1, distance / (upperLength + lowerLength) * 1.001);
  upperLength *= stretch; lowerLength *= stretch;
  const along = clamp((upperLength * upperLength + distance * distance - lowerLength * lowerLength) / (2 * distance), 0, upperLength);
  const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
  const cross = (leg.foot[0] - leg.root[0]) * (leg.knee[1] - leg.root[1]) - (leg.foot[1] - leg.root[1]) * (leg.knee[0] - leg.root[0]);
  const side = cross < 0 ? -1 : 1, ux = dx / distance, uy = dy / distance;
  const knee = { x: root.x + ux * along - uy * height * side, y: root.y + uy * along + ux * height * side };
  const restKnee = torsoPoint(...leg.knee, s);
  // Keep the thick upper legs under the rump/chest. Unconstrained IK swings
  // the two knees across their still-connected source fork before the feet
  // cross, folding the black fork outline into a blade.
  knee.x = mix(restKnee.x, knee.x, .35); knee.y = mix(restKnee.y, knee.y, .7);
  return { leg, foot, root, knee, target,
    upper: boneMap(leg.root, leg.knee, root, knee), lower: boneMap(leg.knee, leg.foot, knee, target) };
}

/** Prepare once, then reuse point()/localPoint() for any number of QA vertices. */
export function createFrostcrownRigDeformer(pose = {}) {
  const state = poseState(pose), feet = feetFor(state);
  const bones = LEGS.map((leg, i) => legBones(leg, feet[i], state));
  const headPivot = torsoPoint(620, 830, state), cos = Math.cos(state.headAngle), sin = Math.sin(state.headAngle);
  function point(sourceX, sourceY) {
    const x = finite(sourceX), y = finite(sourceY);
    if (state.static) return project(x, y);
    let body = torsoPoint(x, y, state);
    const headY = 1 - smooth((y - 630) / 260);
    const sideGate = smooth((x - 790) / 90) * smooth((y - 560) / 90);
    const headWeight = headY * (1 - sideGate);
    if (headWeight > 0) {
      const dx = body.x - headPivot.x, dy = body.y - headPivot.y;
      body = { x: mix(body.x, headPivot.x + dx * cos - dy * sin, headWeight),
        y: mix(body.y, headPivot.y + dx * sin + dy * cos, headWeight) };
    }
    const match = y > 850 ? nearestLeg(x, y) : null;
    if (match && match.distance < 2.8) {
      const nearest = bones[match.index], leg = nearest.leg;
      // The transparent skirt beside a limb follows that limb as well. A
      // narrow falloff at its black outline would invert opaque edge cells
      // when a hoof crosses the original rest position.
      const influence = smooth((y - leg.root[1] + 20) / 150) * (1 - smooth((match.distance - 1.6) / 1.2));
      const bend = smooth((y - leg.knee[1] + 35) / 70);
      const upper = nearest.upper(x, y), lower = nearest.lower(x, y);
      const joint = { x: mix(upper.x, lower.x, bend), y: mix(upper.y, lower.y, bend) };
      const hoof = smooth((y - leg.foot[1] + 120) / 60);
      const hoofX = x + nearest.target.x - leg.foot[0], hoofY = y + nearest.target.y - leg.foot[1];
      // A third, level hoof bone keeps the approved boot silhouette planted
      // while the shin bends above it. Swinging hooves lift without tipping
      // their toes beneath the established ground line.
      body.x = mix(body.x, mix(joint.x, hoofX, hoof), influence);
      body.y = mix(body.y, mix(joint.y, hoofY, hoof), influence);
    }
    return project(body.x, body.y);
  }
  function localPoint(x, y) { return point(ANCHOR_X - finite(x) / SCALE, GROUND_Y + (finite(y) - FOOT) / SCALE); }
  return { point, localPoint, feet, state };
}

/** Pure source-pixel to canonical-right deformation; no Canvas/image needed. */
export function frostcrownRigPoint(sourceX, sourceY, pose = {}) {
  return createFrostcrownRigDeformer(pose).point(sourceX, sourceY);
}

export function buildFrostcrownRigGeometry(pose = {}) {
  const deformer = createFrostcrownRigDeformer(pose);
  const vertices = SOURCE_VERTICES.map(v => ({ ...v, ...deformer.point(v.sourceX, v.sourceY) }));
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const v of vertices) {
    bounds.left = Math.min(bounds.left, v.x); bounds.right = Math.max(bounds.right, v.x);
    bounds.top = Math.min(bounds.top, v.y); bounds.bottom = Math.max(bounds.bottom, v.y);
  }
  return { vertices, triangles: TRIANGLES, bounds, feet: deformer.feet, state: deformer.state };
}

function clipTriangle(c, vertices, area, pad) {
  const normals = vertices.map((a, i) => {
    const b = vertices[(i + 1) % 3], dx = b.x - a.x, dy = b.y - a.y;
    const length = Math.max(.00001, Math.hypot(dx, dy)), side = area > 0 ? 1 : -1;
    return { x: dy / length * side, y: -dx / length * side };
  });
  const expanded = vertices.map((v, i) => {
    const a = normals[(i + 2) % 3], b = normals[i];
    const amount = pad / Math.max(.25, 1 + a.x * b.x + a.y * b.y);
    return { x: v.x + (a.x + b.x) * amount, y: v.y + (a.y + b.y) * amount };
  });
  c.beginPath(); c.moveTo(expanded[0].x, expanded[0].y);
  c.lineTo(expanded[1].x, expanded[1].y); c.lineTo(expanded[2].x, expanded[2].y); c.closePath(); c.clip();
}

function triangle(c, image, a, b, d, pad) {
  const sx = b.sourceX - a.sourceX, sy = b.sourceY - a.sourceY;
  const tx = d.sourceX - a.sourceX, ty = d.sourceY - a.sourceY;
  const denominator = sx * ty - tx * sy;
  const area = (b.x - a.x) * (d.y - a.y) - (d.x - a.x) * (b.y - a.y);
  if (Math.abs(area) < .000001) return;
  const A = ((b.x - a.x) * ty - (d.x - a.x) * sy) / denominator;
  const B = ((b.y - a.y) * ty - (d.y - a.y) * sy) / denominator;
  const C = ((d.x - a.x) * sx - (b.x - a.x) * tx) / denominator;
  const D = ((d.y - a.y) * sx - (b.y - a.y) * tx) / denominator;
  c.save(); clipTriangle(c, [a, b, d], area, pad);
  c.transform(A, B, C, D, a.x - A * a.sourceX - C * a.sourceY, a.y - B * a.sourceX - D * a.sourceY);
  c.drawImage(image, CROP.x, CROP.y, CROP.width, CROP.height, CROP.x, CROP.y, CROP.width, CROP.height); c.restore();
}

/** Paint into MonsterArt's empty sprite canvas using an already decoded PNG. */
export function paintFrostcrownRig(c, image, pose = {}) {
  const state = poseState(pose);
  c.save();
  if (state.static) {
    // The approved idle remains an exact mirrored texture draw, including all
    // original shading, outlines, proportions and antler/ear relationships.
    c.translate(ANCHOR_X * SCALE, FOOT - GROUND_Y * SCALE); c.scale(-SCALE, SCALE);
    c.drawImage(image, CROP.x, CROP.y, CROP.width, CROP.height, CROP.x, CROP.y, CROP.width, CROP.height);
  } else {
    const mesh = buildFrostcrownRigGeometry(pose);
    // Source-over retains normal near/far occlusion when the legs cross.
    // A subpixel internal clip overlap prevents antialiased triangle cracks;
    // the texture and its original alpha remain the only painted material.
    c.globalCompositeOperation = 'source-over';
    const transform = c.getTransform?.();
    const ratio = transform ? Math.max(.1, Math.hypot(transform.a, transform.b), Math.hypot(transform.c, transform.d)) : 1;
    const pad = .48 / ratio;
    for (const [a, b, d] of mesh.triangles) triangle(c, image, mesh.vertices[a], mesh.vertices[b], mesh.vertices[d], pad);
  }
  c.restore();
}
