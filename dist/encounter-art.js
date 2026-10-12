// Woodland hunting arena. All scenery is visual: the hunt's circular rule
// remains exactly event.r, and the four open approaches never create blockers.
// Static materials use one bounded atlas. Cast shadows belong to the scene mask.
const TAU = Math.PI * 2;
const TEMPLATE_R = 210;
const FLOOR_SIZE = 496;
const PIXEL_LIMIT = 1024 * 1024;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const rng = seed => { let n = seed >>> 0; return () => { n ^= n << 13; n ^= n >>> 17; n ^= n << 5; return (n >>> 0) / 4294967296; }; };
const polygon = (c, points, color, edge, width = 1) => {
  c.beginPath(); points.forEach(([x, y], i) => c[i ? 'lineTo' : 'moveTo'](x, y)); c.closePath();
  if (color) { c.fillStyle = color; c.fill(); }
  if (edge) { c.lineWidth = width; c.strokeStyle = edge; c.stroke(); }
};
const line = (c, points, color, width = 1) => {
  c.beginPath(); points.forEach(([x, y], i) => c[i ? 'lineTo' : 'moveTo'](x, y));
  c.lineWidth = width; c.strokeStyle = color; c.stroke();
};
const leaf = (c, x, y, length, width, angle, color) => {
  c.save(); c.translate(x, y); c.rotate(angle); c.beginPath(); c.moveTo(-length / 2, 0);
  c.quadraticCurveTo(0, -width, length / 2, 0); c.quadraticCurveTo(0, width, -length / 2, 0);
  c.fillStyle = color; c.fill(); c.restore();
};
const circle = (c, x, y, radius, color) => { c.beginPath(); c.arc(x, y, radius, 0, TAU); c.fillStyle = color; c.fill(); };
const polar = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
const bandPath = (c, inner, outer, from, to) => {
  c.beginPath(); c.arc(0, 0, outer, from, to); c.arc(0, 0, inner, to, from, true); c.closePath();
};

export class EncounterArt {
  constructor(makeCanvas = () => document.createElement('canvas')) {
    this.makeCanvas = makeCanvas; this.cache = new Map(); this.pixels = 0; this.builds = 0;
    this.eventProps = new WeakMap();
  }
  get cacheStats() { return { entries: this.cache.size, size: this.cache.size, pixels: this.pixels, bytes: this.pixels * 4, limitBytes: PIXEL_LIMIT * 4, builds: this.builds }; }
  get diagnostics() { return this.cacheStats; }
  _image(key, w, h, scale, paint) {
    if (this.cache.has(key)) return this.cache.get(key);
    const canvas = this.makeCanvas(); canvas.width = Math.ceil(w * scale); canvas.height = Math.ceil(h * scale);
    const c = canvas.getContext('2d'); c.setTransform(scale, 0, 0, scale, 0, 0); c.lineJoin = 'round'; c.lineCap = 'round';
    paint(c);
    const image = { canvas, w, h, pixels: canvas.width * canvas.height };
    while (this.pixels + image.pixels > PIXEL_LIMIT && this.cache.size) {
      const keyToRemove = this.cache.keys().next().value;
      this.pixels -= this.cache.get(keyToRemove).pixels; this.cache.delete(keyToRemove);
    }
    this.cache.set(key, image); this.pixels += image.pixels; this.builds++; return image;
  }
  _floor() {
    return this._image('arena-floor', FLOOR_SIZE, FLOOR_SIZE, 1.5, c => {
      c.translate(FLOOR_SIZE / 2, FLOOR_SIZE / 2);
      const random = rng(581932), tones = ['#68715b', '#727860', '#77806a', '#63735e', '#7d8167', '#6a765f'];
      // Earth and tiny displaced stones tie the platform to the forest floor.
      for (let i = 0; i < 130; i++) {
        const a = random() * TAU, r = 216 + random() * 19, [x, y] = polar(r, a), s = 1.3 + random() * 2.5;
        polygon(c, [[x - s, y], [x - s * .5, y - s], [x + s, y - s * .4], [x + s * .7, y + s * .7]],
          ['#5f6e4880', '#6d765080', '#a6a17b60', '#3e593e70'][i % 4]);
      }
      // Shallow, chipped plinth: local stone thickness, never a cast shadow.
      for (let i = 0; i < 48; i++) {
        const a = i * TAU / 48, b = (i + 1) * TAU / 48;
        if (Math.min(Math.abs(Math.sin((a + b) / 2)), Math.abs(Math.cos((a + b) / 2))) < .15) continue;
        const p1 = polar(222, a + .006), p2 = polar(222, b - .006);
        polygon(c, [p1, p2, [p2[0], p2[1] + 4], [p1[0], p1[1] + 4]], '#48553f', '#334731', .65);
      }
      circle(c, 0, 0, 220, '#394d3b');
      // Radial slabs are individually beveled and chipped, with varied seams.
      for (const [inner, outer, count, offset] of [[67, 127, 14, .05], [130, 192, 23, -.08]]) {
        for (let i = 0; i < count; i++) {
          const from = i * TAU / count + offset + .009, to = (i + 1) * TAU / count + offset - .009;
          const ir = inner + random() * 2, or = outer - random() * 2;
          bandPath(c, ir, or, from, to); c.fillStyle = tones[Math.floor(random() * tones.length)]; c.fill();
          c.strokeStyle = '#263d2b69'; c.lineWidth = 1.5; c.stroke();
          c.beginPath(); c.arc(0, 0, ir + 1.6, from + .005, to - .005); c.strokeStyle = '#c7c3a26b'; c.lineWidth = .8; c.stroke();
          line(c, [polar(ir + 3, from + .008), polar(or - 3, from + .008)], '#d0c6a138', .7);
          if (i % 3 === 1) {
            const a = from + (to - from) * .5, [x, y] = polar(or - 1, a);
            line(c, [[x, y], [x - Math.cos(a) * 8 + 2, y - Math.sin(a) * 8], [x - Math.cos(a) * 12 - 1, y - Math.sin(a) * 12 + 3]], '#334a3790', 1.1);
          }
          if (i % 4 === 0) {
            const [x, y] = polar((ir + or) * .5, (from + to) * .5);
            line(c, [[x - 4, y + 1], [x - 1, y - 2], [x + 4, y - 1]], '#c8c29d39', .8);
          }
        }
      }
      // Slim carved band separates the floor from the rim.
      bandPath(c, 193, 198, 0, TAU); c.fillStyle = '#7e8766'; c.fill();
      for (let i = 0; i < 80; i++) {
        c.save(); c.rotate(i * TAU / 80); polygon(c, [[194.4, -2], [196.7, 0], [194.4, 2]], '#3c553e85'); c.restore();
      }
      // Four real-width thresholds break the raised lip at the cardinal points.
      for (let i = 0; i < 40; i++) {
        const from = i * TAU / 40 + .007, to = (i + 1) * TAU / 40 - .007;
        const mid = (from + to) * .5;
        if (Math.min(Math.abs(Math.sin(mid)), Math.abs(Math.cos(mid))) < .17) continue;
        bandPath(c, 199, 221, from, to); c.fillStyle = ['#969778', '#8c9273', '#9ca081', '#899273'][i % 4]; c.fill();
        c.strokeStyle = '#344b377f'; c.lineWidth = 1; c.stroke();
        c.beginPath(); c.arc(0, 0, 219.8, from + .006, to - .006); c.strokeStyle = '#d7d0a985'; c.lineWidth = 1.1; c.stroke();
        line(c, [polar(201, from + .006), polar(219, from + .006)], '#ddd0aa60', .8);
      }
      // The scoring boundary is a narrow engraved track, centered at r = 210.
      // It is an inlay in the stone rather than a floating gameplay outline.
      c.beginPath(); c.arc(0, 0, TEMPLATE_R, 0, TAU); c.strokeStyle = '#465b3c8c'; c.lineWidth = 1.3; c.stroke();
      c.beginPath(); c.arc(0, 0, TEMPLATE_R - 1, 0, TAU); c.strokeStyle = '#d5c98b50'; c.lineWidth = .6; c.stroke();
      for (let i = 0; i < 4; i++) {
        c.save(); c.rotate(i * Math.PI / 2);
        for (let step = 0; step < 3; step++) {
          const x = 198 + step * 11;
          polygon(c, [[x, -31], [x + 10, -30], [x + 10, 30], [x, 31]], ['#949679', '#828a6c', '#717e60'][step], '#354b3670', .8);
          line(c, [[x + 1, -29], [x + 1, 29]], '#dbd2ad70', .85);
          line(c, [[x + 9, -28], [x + 9, 28]], '#253f2e75', .8);
          line(c, [[x + 2, 0], [x + 8, 1]], '#44594070', .75);
        }
        polygon(c, [[187, -6], [194, 0], [187, 6], [189, 0]], '#b4ad78a0'); c.restore();
      }
      // Center seal is a worn hunting crest: an antlered stag within a leaf wreath.
      circle(c, 0, 0, 65.5, '#334b36'); circle(c, 0, 0, 63.5, '#9a9e7c'); circle(c, 0, 0, 60.5, '#777f65');
      const medallion = c.createRadialGradient(-19, -20, 2, 0, 0, 60);
      medallion.addColorStop(0, '#8d9373'); medallion.addColorStop(1, '#69785c'); circle(c, 0, 0, 58.8, medallion);
      for (let side of [-1, 1]) {
        line(c, [[side * 15, 38], [side * 35, 27], [side * 45, 6], [side * 39, -17], [side * 28, -32]], '#c0bc8580', 1.2);
        for (let i = 0; i < 9; i++) {
          const a = .58 + i * .21, x = side * Math.sin(a) * 44, y = Math.cos(a) * 42;
          leaf(c, x, y, 10, 3.4, -side * (a + .7), '#b4b38475');
          leaf(c, x - side * 5, y - 2, 8, 2.6, -side * (a - .3), '#a6ad7960');
        }
      }
      // Engraved, slightly offset light and dark lines suggest shallow carving.
      const stag = [[-7, -16], [-17, -26], [-13, -12], [-12, 0], [-5, 18], [0, 26], [5, 18], [12, 0], [13, -12], [17, -26], [7, -16], [0, -20]];
      polygon(c, stag, '#344f3c65', '#d0c48e66', 1.3);
      line(c, [[0, -17], [0, 16], [-3, 19], [0, 23], [3, 19]], '#b3b582a0', 1.1);
      for (const side of [-1, 1]) {
        line(c, [[side * 8, -17], [side * 18, -31], [side * 18, -42], [side * 23, -46]], '#3b553e', 3);
        line(c, [[side * 18, -31], [side * 27, -32], [side * 31, -38]], '#3b553e', 2.2);
        line(c, [[side * 18, -37], [side * 10, -41], [side * 8, -46]], '#3b553e', 1.8);
        line(c, [[side * 8 + .7, -17.5], [side * 18 + .7, -31.5], [side * 18 + .7, -42.5]], '#d3c7927a', .8);
        line(c, [[side * 4, -2], [side * 8, -4]], '#d4c890a0', 1.2);
      }
      line(c, [[-15, 43], [-5, 43], [0, 47], [5, 43], [15, 43]], '#c2bc8275', 1.5);
      // A single clipped pass gives all the stone a coherent fine-grained finish.
      c.save(); c.beginPath(); c.arc(0, 0, 221, 0, TAU); c.clip();
      for (let i = 0; i < 5300; i++) {
        const x = random() * 444 - 222, y = random() * 444 - 222;
        c.fillStyle = i % 3 ? '#213f2823' : '#e5d9ac29'; c.fillRect(x, y, .5 + random() * 1.6, .4 + random() * .8);
      }
      for (let i = 0; i < 30; i++) {
        const [x, y] = polar(72 + random() * 115, random() * TAU);
        line(c, [[x - 5, y], [x + 1, y - 2], [x + 6, y], [x + 9, y - 1]], '#d5d0a627', .7);
      }
      c.restore();
      // Moss grows in discrete joints rather than painting a second green circle.
      for (let cluster = 0; cluster < 20; cluster++) {
        const a = random() * TAU;
        if (Math.min(Math.abs(Math.sin(a)), Math.abs(Math.cos(a))) < .22) continue;
        const [cx, cy] = polar(199 + random() * 21, a);
        for (let i = 0; i < 24; i++) {
          const x = cx + (random() - .5) * 17, y = cy + (random() - .5) * 13;
          leaf(c, x, y, 2 + random() * 5, 1 + random() * 1.6, random() * TAU, ['#405f36a8', '#698048b0', '#8c9a59a0', '#a2a56665'][i % 4]);
        }
      }
      for (let i = 0; i < 17; i++) {
        const a = random() * TAU, [x, y] = polar(207 + random() * 16, a);
        polygon(c, [[x - 4, y + 2], [x - 2, y - 3], [x + 2, y - 4], [x + 4, y + 1]], '#687855', '#ccd09a55', .6);
      }
    });
  }
  _inlay(lit) {
    return this._image(lit ? 'inlay-lit' : 'inlay-unlit', 28, 20, 2, c => {
      c.translate(14, 10);
      polygon(c, [[-10, 0], [-4, -5], [6, -5], [10, 0], [4, 5], [-6, 5]], '#384c35', '#bab58b87', .8);
      polygon(c, [[-7.5, 0], [-3, -3.2], [4.8, -3.2], [7.4, 0], [3, 3.2], [-4.8, 3.2]], lit ? '#dac576' : '#596744');
      if (lit) {
        line(c, [[-6, -.5], [-2.5, -2.5], [4, -2.5]], '#fff0bb', .9);
        polygon(c, [[-1.7, -2], [1.7, 0], [-1.7, 2], [-.2, 0]], '#fff2c1');
      } else line(c, [[-5, 0], [4, 0]], '#8f997455', .65);
    });
  }
  _marker() {
    return this._image('arena-marker', 48, 56, 2, c => {
      c.translate(24, 46);
      // Low carved footing, shaft and bowl. The highest solid point is 31px.
      polygon(c, [[-13, -2], [-9, -7], [9, -7], [13, -2], [10, 4], [-10, 4]], '#7d8769', '#334b36', .9);
      polygon(c, [[-13, -2], [-1, 1], [13, -2], [10, 4], [-10, 4]], '#536c4d');
      line(c, [[-11, -2], [-1, 0], [11, -2]], '#c3c29a86', .8);
      polygon(c, [[-7, -7], [-6, -24], [0, -27], [7, -23], [7, -6], [0, -3]], '#7f8b6c', '#3c533c', .8);
      polygon(c, [[0, -27], [7, -23], [7, -6], [0, -3]], '#536e4e');
      line(c, [[-5, -22], [-5, -8]], '#bdc19975', .8);
      polygon(c, [[-3, -20], [0, -22], [3, -18], [0, -14], [-3, -17]], '#3d5b3f', '#a8b58485', .65);
      polygon(c, [[-10, -27], [-6, -31], [7, -31], [11, -27], [6, -22], [-6, -22]], '#849073', '#344f38', .9);
      polygon(c, [[-9, -27], [-5, -30], [6, -30], [9, -27], [5, -25], [-5, -25]], '#293e2d');
      line(c, [[-9, -27], [-5, -24], [5, -24], [10, -27]], '#d0c6a0a0', 1);
      for (const x of [-5, 0, 5]) polygon(c, [[x - 2, -26], [x, -28], [x + 2, -27], [x + 1, -25]], '#ad7d3a');
      line(c, [[4, -12], [3, -8], [5, -5]], '#253f2e85', .8);
      for (let i = 0; i < 7; i++) leaf(c, -9 + i * 2.7, 1 + (i % 3), 4, 1.6, i * 1.8, ['#648749', '#92a25c', '#416c3b'][i % 3]);
    });
  }
  drawGround(c, active, options = {}) {
    if (active?.type !== 'hunt' || !(active.r > 0)) return;
    const scale = active.r / TEMPLATE_R, floor = this._floor(), goal = clamp(Math.round(active.goal || 12), 1, 36);
    const completed = clamp(Math.floor((active.progress || 0) / (active.goal || 12) * goal), 0, goal);
    const dim = this._inlay(false), lit = this._inlay(true);
    c.save(); c.translate(active.x, active.y); c.scale(scale, scale);
    c.drawImage(floor.canvas, -FLOOR_SIZE / 2, -FLOOR_SIZE / 2, FLOOR_SIZE, FLOOR_SIZE);
    // Each inlay is centered on the precise gameplay boundary, including through
    // the four thresholds; walking onto the inner half is walking into the hunt.
    for (let i = 0; i < goal; i++) {
      const angle = -Math.PI / 2 + (i + .5) * TAU / goal, image = i < completed ? lit : dim;
      c.save(); c.rotate(angle); c.translate(TEMPLATE_R, 0); c.rotate(Math.PI / 2);
      c.drawImage(image.canvas, -14, -10, 28, 20); c.restore();
    }
    c.restore();
  }
  props(active) {
    if (active?.type !== 'hunt' || !(active.r > 0)) return [];
    let props = this.eventProps.get(active);
    if (!props) {
      const scale = active.r / TEMPLATE_R;
      props = Object.freeze(Array.from({ length: 4 }, (_, i) => {
        const angle = Math.PI / 4 + i * Math.PI / 2, x = active.x + Math.cos(angle) * (active.r + 30 * scale), y = active.y + Math.sin(angle) * (active.r + 30 * scale);
        return Object.freeze({ id: `${active.id}:marker:${i}`, type: 'huntMarker', x, y, sortY: y, r: 13 * scale, scale, index: i, height: 36 * scale, shadowHeight: 29 * scale, shadowWidth: 21 * scale });
      }));
      this.eventProps.set(active, props);
    }
    return props;
  }
  drawMarker(c, prop, options = {}) {
    if (prop?.type !== 'huntMarker') return;
    const marker = this._marker(), scale = prop.scale || 1;
    const time = options.reduced ? 0 : (Number.isFinite(options.time) ? options.time : 0), phase = time * 5 + prop.index * 1.7;
    const lean = Math.sin(phase) * 1.1, height = 8.2 + Math.sin(phase * .7) * .9;
    c.save(); c.translate(prop.x, prop.y); c.scale(scale, scale);
    c.drawImage(marker.canvas, -24, -46, 48, 56);
    // Tiny warm flames provide scale without obscuring combat or changing RNG.
    c.beginPath(); c.moveTo(-4, -26); c.quadraticCurveTo(-5, -30, lean - 1, -27 - height);
    c.quadraticCurveTo(lean + 1, -31, 3.6, -29); c.quadraticCurveTo(5, -26, 0, -25); c.closePath();
    c.fillStyle = '#dca759'; c.fill();
    c.beginPath(); c.moveTo(-1.9, -26); c.quadraticCurveTo(-2.1, -29, lean * .5, -31.5); c.quadraticCurveTo(2.2, -27.5, 1.5, -25.8); c.closePath();
    c.fillStyle = '#f5dd9a'; c.fill();
    c.restore();
  }
}
