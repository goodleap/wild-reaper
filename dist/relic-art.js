// Persistent rescue ruins: shallow masonry is split at its real foot positions
// so actors can walk in front of or behind each wall. No gameplay RNG, baked
// cast shadows or invisible collision geometry is introduced by this module.
const TAU = Math.PI * 2, PIXEL_LIMIT = 1024 * 1024;
const hash = (a, b = 0) => { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); };
const poly = (c, p, fill, edge, width = 1) => {
  c.beginPath(); p.forEach(([x, y], i) => c[i ? 'lineTo' : 'moveTo'](x, y)); c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (edge) { c.strokeStyle = edge; c.lineWidth = width; c.stroke(); }
};
const line = (c, p, color, width = 1) => {
  c.beginPath(); p.forEach(([x, y], i) => c[i ? 'lineTo' : 'moveTo'](x, y)); c.strokeStyle = color; c.lineWidth = width; c.stroke();
};
const oval = (c, x, y, rx, ry, color, angle = 0) => { c.beginPath(); c.ellipse(x, y, rx, ry, angle, 0, TAU); c.fillStyle = color; c.fill(); };
const leaf = (c, x, y, w, h, angle, color) => {
  c.save(); c.translate(x, y); c.rotate(angle); c.beginPath(); c.moveTo(-w, 0);
  c.quadraticCurveTo(-w * .15, -h, w, 0); c.quadraticCurveTo(w * .15, h, -w, 0); c.fillStyle = color; c.fill(); c.restore();
};
function stone(c, x, y, w, h, seed = 0, depth = 4) {
  const tone = ['#828a71', '#92947a', '#738269', '#8c9479', '#7d886e'][seed % 5];
  // Small height/depth facets make every block read as dressed stone, including
  // on a phone at 1x. Grain is stamped only once into the sprite atlas.
  poly(c, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], tone, '#344b38', .85);
  poly(c, [[x, y], [x + 3, y - depth], [x + w + 3, y - depth], [x + w, y]], '#adb097', '#56624a', .5);
  poly(c, [[x + w, y], [x + w + 3, y - depth], [x + w + 3, y + h - depth], [x + w, y + h]], '#4f654b');
  line(c, [[x + 1, y + 1], [x + w - 1, y + 1]], '#d3cfad9b', .8);
  line(c, [[x + 1, y + h - 1], [x + w - 1, y + h - 1]], '#3e573caf', .7);
  for (let i = 0; i < Math.max(5, w * h / 13); i++) {
    c.fillStyle = i % 3 ? '#334b3833' : '#e0d5ae62';
    c.fillRect(x + 1 + hash(i, seed) * (w - 2), y + 1 + hash(i + 40, seed + 2) * (h - 2), .6 + hash(i + 2, seed) * 1.7, .55);
  }
  if (seed % 3 === 1) line(c, [[x + w * .65, y], [x + w * .52, y + h * .37], [x + w * .57, y + h * .6]], '#3b523d86', .7);
}
function moss(c, x, y, width, seed) {
  for (let i = 0; i < 18; i++) {
    const px = x + (hash(i, seed) - .5) * width, py = y + (hash(i, seed + 1) - .5) * 8;
    leaf(c, px, py, 1.3 + hash(i, seed + 2) * 2.6, .7 + hash(i, seed + 3), hash(i, seed + 4) * TAU,
      ['#527042', '#799050', '#a4ac6d', '#3f633b'][i % 4]);
  }
}
function post(c, tall = false) {
  stone(c, -13, -6, 23, 7, 1, 5);
  const blocks = tall ? 4 : 3;
  for (let i = 0; i < blocks; i++) stone(c, -8 - (i % 2), -15 - i * 11, 16 + i % 2, 10, i + 4, 4);
  const top = -15 - (blocks - 1) * 11;
  poly(c, [[-12, top - 2], [-9, top - 8], [-2, top - 9], [1, top - 5], [8, top - 8], [12, top - 2], [9, top + 2], [-11, top + 2]], '#99a080', '#415b42', .85);
  line(c, [[-9, top - 6], [-3, top - 7], [0, top - 4]], '#d5d3ad9c', .8);
  // Recessed leaf relief is deliberately small, keeping the hero the focal point.
  poly(c, [[-2, -33], [3, -28], [0, -22], [-5, -28]], '#405e44', '#bbbe9390', .65);
  line(c, [[-1, -31], [-1, -24]], '#a4af7b', .7);
  moss(c, 0, 0, 25, tall ? 13 : 27);
}

export class RelicArt {
  constructor(makeCanvas = () => document.createElement('canvas')) {
    this.makeCanvas = makeCanvas; this.cache = new Map(); this.pixels = 0; this.builds = 0;
    this.siteProps = new WeakMap();
  }
  get diagnostics() { return { entries: this.cache.size, size: this.cache.size, pixels: this.pixels, bytes: this.pixels * 4, limitBytes: PIXEL_LIMIT * 4, builds: this.builds }; }
  get cacheStats() { return this.diagnostics; }
  _sprite(key, w, h, ox, oy, paint) {
    if (this.cache.has(key)) return this.cache.get(key);
    const canvas = this.makeCanvas(); canvas.width = w * 2; canvas.height = h * 2;
    const c = canvas.getContext('2d'); c.setTransform(2, 0, 0, 2, ox * 2, oy * 2); c.lineJoin = 'round'; c.lineCap = 'round';
    paint(c); const image = { canvas, w, h, ox, oy, pixels: canvas.width * canvas.height };
    while (this.pixels + image.pixels > PIXEL_LIMIT && this.cache.size) {
      const oldest = this.cache.keys().next().value; this.pixels -= this.cache.get(oldest).pixels; this.cache.delete(oldest);
    }
    this.cache.set(key, image); this.pixels += image.pixels; this.builds++; return image;
  }
  _floor() {
    return this._sprite('rescue-floor', 220, 206, 110, 92, c => {
      // Grass grows through an imperfect rectangle of ancient courtyard paving.
      for (let i = 0; i < 38; i++) {
        const angle = hash(i, 2) * TAU, x = Math.cos(angle) * (79 + hash(i, 8) * 12), y = 9 + Math.sin(angle) * (72 + hash(i, 3) * 11);
        oval(c, x, y, 3 + hash(i, 1) * 4, 1.5 + hash(i, 4) * 2, '#53654262', angle);
      }
      poly(c, [[-73, -51], [-55, -58], [72, -53], [78, 61], [57, 73], [-63, 69], [-79, 54]], '#445940');
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const n = row * 8 + col, x = -72 + col * 18 + (row % 2) * 4, y = -51 + row * 15;
          if ((col === 7 && row % 2) || (row === 0 && col === 0) || n === 54) continue;
          const w = 16.1 + hash(n, 9) * 1.3, h = 12.4 + hash(n, 10) * 1.1;
          poly(c, [[x, y], [x + w, y - .8], [x + w + .5, y + h], [x + .8, y + h + 1]], ['#747e60', '#7f8568', '#8d8e71', '#6a795b', '#82876a'][n % 5], '#334d3e68', .6);
          line(c, [[x + 1, y + 1], [x + w - 1, y + .2]], '#cac69e66', .7);
          if (n % 7 === 0) line(c, [[x + w * .3, y], [x + w * .43, y + 4], [x + w * .28, y + 8]], '#455c3b', .8);
          for (let i = 0; i < 9; i++) {
            c.fillStyle = i % 3 ? '#2b483029' : '#d3c9a12e'; c.fillRect(x + hash(i + n, 11) * w, y + hash(i + n, 12) * h, 1.2, .6);
          }
        }
      }
      // Worn, deliberately non-glowing central mosaic and broad entry steps.
      poly(c, [[0, -32], [25, -6], [0, 21], [-25, -6]], '#a3a17b66', '#b8b5894d', 1);
      poly(c, [[0, -26], [19, -6], [0, 15], [-19, -6]], '#52644780', '#424f393b', 1);
      for (const s of [-1, 1]) {
        line(c, [[s * 3, 4], [s * 12, -6], [s * 10, -15]], '#aaa77a', 1.1);
        for (let i = 0; i < 4; i++) leaf(c, s * (7 + i * 1.6), -i * 4, 4.2, 1.8, s * -.8, '#a4a87c83');
      }
      for (let i = 0; i < 3; i++) {
        const y = 68 + i * 8, w = 74 - i * 7;
        poly(c, [[-w / 2, y], [w / 2, y - 1], [w / 2 + 1, y + 6], [-w / 2 - 2, y + 7]], ['#969878', '#848e6d', '#71815d'][i], '#405839', .8);
        line(c, [[-w / 2 + 1, y + 1], [w / 2 - 1, y]], '#d6cda183', .9);
        line(c, [[4, y + 1], [1, y + 4], [2, y + 6]], '#435b3966', .6);
      }
      for (const [x, y, w, seed] of [[-68, -35, 20, 1], [61, -27, 22, 5], [-65, 45, 22, 12], [60, 57, 18, 19], [-44, 67, 13, 32], [46, 72, 16, 24], [20, 21, 13, 15]]) moss(c, x, y, w, seed);
      // Fallen masonry remains on the ground after a successful rescue.
      for (const [x, y, s] of [[-85, -29, 0], [83, -45, 1], [-85, 60, 2], [71, 76, 3]]) {
        poly(c, [[x - 7, y], [x - 4, y - 5], [x + 5, y - 6], [x + 9, y - 1], [x + 5, y + 5], [x - 5, y + 4]], '#788568', '#455d42', .7);
        line(c, [[x - 4, y - 4], [x + 4, y - 5], [x + 7, y - 1]], '#c3c39d91', .9); moss(c, x - 4, y + 3, 12, s + 9);
      }
    });
  }
  _back() {
    return this._sprite('rescue-back', 182, 115, 91, 104, c => {
      // A broken small sanctuary: two piers and an incomplete arch above a
      // waist-high rear wall. The open silhouette leaves the captive readable.
      for (let row = 0; row < 2; row++) for (let col = 0; col < 5; col++) stone(c, -66 + col * 26, -12 - row * 11, 25, 10, row * 5 + col, 5);
      for (const s of [-1, 1]) {
        c.save(); c.translate(s * 57, 0); post(c, true); c.restore();
        for (let i = 0; i < 2; i++) stone(c, s * 57 - 8, -58 - i * 11, 16, 10, i + (s > 0 ? 5 : 2), 4);
      }
      // Individually shaped voussoirs are interrupted at the crown, rather than
      // forming a flat circle or a complete decorative outline.
      for (const [from, to] of [[-2.96, -2.66], [-2.63, -2.32], [-2.29, -1.98], [-1.96, -1.77], [-1.34, -1.11], [-1.08, -.78], [-.75, -.45], [-.42, -.16]]) {
        const point = (a, r) => [Math.cos(a) * r, -52 + Math.sin(a) * r * .64];
        const a = point(from, 47), b = point(to, 47), d = point(from, 62), e = point(to, 62);
        poly(c, [a, b, e, d], from < -1.57 ? '#7b8a70' : '#969d82', '#3a543e', .8);
        line(c, [[d[0] + .5, d[1] + 1], [e[0] - .5, e[1] + 1]], '#d5d2ada6', .8);
        const mx = (a[0] + b[0] + d[0] + e[0]) / 4, my = (a[1] + b[1] + d[1] + e[1]) / 4;
        line(c, [[mx - 1, my - 2], [mx + 2, my + .6]], '#4b604445', .7);
      }
      // Tattered cloth distinguishes a former shelter from a plain cage.
      line(c, [[-43, -64], [-26, -64]], '#665d43', 2.2);
      poly(c, [[-41, -63], [-27, -63], [-28, -34], [-32, -39], [-36, -34], [-40, -40]], '#536f5e', '#3d5844', .65);
      poly(c, [[-29, -62], [-27, -62], [-28, -35], [-31, -39]], '#334f42');
      line(c, [[-38, -60], [-37, -40]], '#a9ba8190', .8);
      poly(c, [[-34, -55], [-30, -50], [-34, -45], [-38, -50]], '#c0bd86a0');
      line(c, [[-62, -73], [-67, -57], [-62, -40], [-66, -23]], '#5b7140', 1.6);
      for (let i = 0; i < 9; i++) leaf(c, -64 + Math.sin(i) * 3, -67 + i * 4.9, 3.2, 1.6, (i % 2 ? 1 : -1) * .8, i % 3 ? '#7e9250' : '#a5ae66');
      moss(c, 45, -70, 23, 44); moss(c, -50, -4, 35, 47); moss(c, 30, -3, 40, 14);
    });
  }
  _side() {
    return this._sprite('rescue-side', 42, 79, 21, 69, c => {
      // Short returning wall, viewed from above with a useful walking gap.
      poly(c, [[-8, -46], [6, -51], [11, -7], [-5, 1]], '#556c4e', '#354f39', .8);
      for (let i = 0; i < 3; i++) {
        const y = -44 + i * 14;
        poly(c, [[-9, y - 15], [5, y - 20], [8, y - 7], [-6, y - 2]], i % 2 ? '#8e9878' : '#a0a487', '#425c40', .7);
        poly(c, [[-9, y - 15], [-6, y - 2], [-5, y + 14], [-8, y + 2]], '#657d58');
        poly(c, [[-6, y - 2], [8, y - 7], [10, y + 8], [-5, y + 14]], i % 2 ? '#77866a' : '#819170', '#3a563c', .7);
        line(c, [[-8, y - 14], [5, y - 18]], '#d1cea398', .8);
        line(c, [[-4, y + 4], [8, y]], '#a4ad8399', .55);
        if (i === 1) line(c, [[3, y - 4], [1, y + 2], [4, y + 6]], '#354f38', .75);
      }
      moss(c, -1, 7, 24, 41); moss(c, -3, -50, 19, 43);
    });
  }
  _post() { return this._sprite('rescue-post', 38, 65, 19, 56, c => post(c)); }
  _gate(open) {
    return this._sprite(open ? 'rescue-gate-open' : 'rescue-gate-closed', 55, 75, 12, 45, c => {
      const project = (x, y) => open ? [x * .3, y + x * .72] : [x, y];
      const shape = (p, fill, edge, w) => poly(c, p.map(([x, y]) => project(x, y)), fill, edge, w);
      const trace = (p, color, w) => line(c, p.map(([x, y]) => project(x, y)), color, w);
      // Iron bands and broad weathered timber bars have real filled faces.
      for (let i = 0; i < 4; i++) {
        const x = 2 + i * 8;
        shape([[x, -30], [x + 2, -35], [x + 4.5, -30], [x + 4.5, -2], [x, -2]], i % 2 ? '#6f6246' : '#807151', '#34483a', .7);
        trace([[x + 1, -29], [x + 1, -5]], '#c4ac7994', .7);
        trace([[x + 3, -20], [x + 2, -16], [x + 3, -9]], '#3c483280', .7);
      }
      for (const y of [-25, -9]) {
        shape([[0, y], [33, y], [33, y + 3], [0, y + 3]], '#566259', '#2b4236', .7);
        trace([[1, y + .5], [32, y + .5]], '#b7b6979c', .7);
        for (const x of [3, 13, 23, 31]) { const p = project(x, y + 1.4); oval(c, p[0], p[1], .75, .75, '#d0c6a0'); }
      }
      for (const y of [-27, -10]) shape([[-3, y], [3, y], [3, y + 4], [-3, y + 4]], '#676c58', '#b1b39783', .7);
      if (!open) {
        for (let i = 0; i < 5; i++) oval(c, 29 + (i % 2) * 2, -20 + i * 2.1, 2, 1.2, '#a69871', .65);
        shape([[28, -14], [34, -14], [34, -7], [28, -7]], '#a18e61', '#4c513c', .7);
      } else {
        for (let i = 0; i < 4; i++) { const p = project(30 + (i % 2), -11 + i * 2.5); oval(c, p[0], p[1], 1.6, 1.1, '#a29972', .4); }
      }
    });
  }
  _runeFloor() {
    return this._sprite('rune-floor', 168, 146, 84, 72, c => {
      // A low, asymmetric octagonal dais with separate stones, not a floating
      // magic-circle outline. Its three standing tablets are sorted separately.
      const rim = [[-37, -48], [30, -49], [59, -28], [62, 27], [34, 48], [-31, 50], [-61, 28], [-63, -22]];
      poly(c, rim.map(([x, y]) => [x, y + 4]), '#43583e', '#314932', 1);
      poly(c, rim, '#7a8569', '#3b523b', .9);
      line(c, [[-59, -23], [-35, -45], [28, -46], [56, -27]], '#c0c29a9a', 1);
      const sectors = [
        [[-34, -43], [-5, -43], [-7, -22], [-21, -14], [-49, -28]],
        [[-2, -43], [28, -44], [48, -29], [23, -13], [0, -22]],
        [[51, -25], [55, 2], [30, 7], [24, -10]],
        [[55, 5], [56, 24], [32, 42], [16, 21], [29, 10]],
        [[29, 44], [-1, 45], [-1, 27], [13, 23]],
        [[-4, 45], [-29, 45], [-48, 30], [-22, 14], [-4, 25]],
        [[-52, 26], [-57, 3], [-28, -2], [-25, 11]],
        [[-58, 0], [-57, -22], [-51, -26], [-23, -11], [-27, -5]],
      ];
      sectors.forEach((p, i) => {
        poly(c, p, ['#8e9577', '#808d70', '#99a080', '#75866b'][i % 4], '#3e593e', .85);
        line(c, [[p[0][0] + 1, p[0][1] + 1], [p[1][0] - 1, p[1][1] + 1]], '#cfd0a477', .7);
      });
      poly(c, [[0, -21], [23, -8], [22, 12], [0, 25], [-22, 11], [-24, -8]], '#697e65', '#b9bf9093', 1);
      poly(c, [[0, -16], [17, -6], [16, 9], [0, 19], [-16, 8], [-18, -6]], '#3e604c8c', '#304e3c94', .7);
      // Three interlocking leaf-shaped cuts are visibly set into the center tile.
      for (let i = 0; i < 3; i++) {
        c.save(); c.translate(0, 2); c.rotate(i * TAU / 3);
        poly(c, [[-1, -1], [-9, -9], [-3, -14], [4, -8], [2, -2]], '#b5bea183', '#2e51435c', .7);
        line(c, [[-2, -3], [-5, -9]], '#d1d9b395', .65); c.restore();
      }
      for (let i = 0; i < 360; i++) {
        const x = (hash(i, 61) - .5) * 111, y = (hash(i, 62) - .5) * 83;
        c.fillStyle = i % 3 ? '#263f282b' : '#ddd4ad35'; c.fillRect(x, y, 1.2, .5);
      }
      for (const [x, y, width, seed] of [[-41, -41, 22, 75], [53, -20, 20, 76], [-49, 29, 22, 77], [32, 46, 21, 78]]) moss(c, x, y, width, seed);
      for (let i = 0; i < 9; i++) {
        const a = i * TAU / 9, x = Math.cos(a) * 69, y = Math.sin(a) * 56;
        poly(c, [[x - 4, y], [x - 2, y - 3], [x + 3, y - 2], [x + 4, y + 1], [x, y + 3]], '#849070', '#475f44', .6);
      }
    });
  }
  _runeTablet() {
    return this._sprite('rune-tablet', 42, 54, 21, 44, c => {
      poly(c, [[-14, -2], [-8, -7], [10, -7], [15, -2], [10, 4], [-10, 4]], '#7c8b6c', '#364f3a', .8);
      poly(c, [[-14, -2], [-2, 1], [15, -2], [10, 4], [-10, 4]], '#536e50');
      poly(c, [[-9, -5], [-10, -28], [-7, -36], [3, -38], [10, -31], [10, -5], [0, 0]], '#83947a', '#3c5742', 1);
      poly(c, [[3, -38], [10, -31], [10, -5], [0, 0], [1, -28]], '#556f57');
      line(c, [[-8, -28], [-6, -34], [2, -36]], '#d0d0a785', .9);
      poly(c, [[-6, -28], [1, -31], [6, -27], [5, -10], [-6, -9]], '#3d604d', '#a6b39393', .7);
      line(c, [[-2, -26], [2, -23], [-2, -19], [2, -16], [-2, -12]], '#9fac8e', 1.2);
      line(c, [[-7, -6], [-3, -4], [0, -5]], '#c5c5a289', .7);
      for (let i = 0; i < 35; i++) { c.fillStyle = i % 3 ? '#2f4d393b' : '#d7d3af45'; c.fillRect(-8 + hash(i, 52) * 17, -29 + hash(i, 53) * 22, 1, .6); }
      moss(c, -5, 1, 18, 88);
    });
  }
  drawGround(c, site, options = {}) {
    if (site?.type === 'rune') {
      const image = this._runeFloor(); c.drawImage(image.canvas, site.x - image.ox, site.y - image.oy, image.w, image.h);
      if (site.state === 'active') {
        const time = options.reduced ? 0 : Number.isFinite(options.time) ? options.time : 0;
        c.save(); c.translate(site.x, site.y + 2); c.globalAlpha *= .65 + Math.sin(time * 2) * .13;
        for (let i = 0; i < 3; i++) {
          c.save(); c.rotate(i * TAU / 3);
          poly(c, [[-1, -1], [-9, -9], [-3, -14], [4, -8], [2, -2]], '#c4e9c9');
          line(c, [[0, -20], [0, -30], [-5, -35]], '#bfdac48c', 1.2); c.restore();
        }
        c.restore();
      }
      return true;
    }
    if (site?.type !== 'rescue') return false;
    const image = this._floor(); c.drawImage(image.canvas, site.x - image.ox, site.y - image.oy, image.w, image.h);
    // No animated ring surrounds the ruin; a small freed chain remains after use.
    if (site.state === 'cleared') {
      c.save(); for (let i = 0; i < 5; i++) oval(c, site.x + 16 + i * 2.4, site.y + 69 + Math.sin(i) * 1.6, 1.6, 1, '#ab9b6b', -.25); c.restore();
    }
    return true;
  }
  props(site) {
    if (site?.type !== 'rescue' && site?.type !== 'rune') return [];
    let props = this.siteProps.get(site);
    if (!props) {
      const pieces = site.type === 'rune' ? [
        ['tabletLeft', -45, -15, 13, 40, 22], ['tabletBack', 0, -42, 13, 40, 22], ['tabletRight', 44, -15, 13, 40, 22],
      ] : [
        ['back', 0, -46, 72, 98, 111],
        ['sideLeft', -63, 20, 13, 58, 18], ['sideRight', 63, 20, 13, 58, 18],
        ['gateLeft', -34, 60, 18, 35, 32], ['gateRight', 34, 60, 18, 35, 32],
        ['postLeft', -39, 61, 13, 48, 21], ['postRight', 39, 61, 13, 48, 21],
      ];
      props = pieces.map(([part, dx, dy, r, height, shadowWidth]) => ({ id: `${site.id}:${part}`, type: site.type === 'rune' ? 'runeRelicPart' : 'rescueRelicPart', part, site,
        x: site.x + dx, y: site.y + dy, sortY: site.y + dy, r, height, shadowHeight: height * .72, shadowWidth, dx, dy }));
      this.siteProps.set(site, props);
    }
    for (const p of props) {
      p.x = site.x + p.dx; p.y = site.y + p.dy;
      p.sortY = p.y + (site.gateOpen && p.part.startsWith('gate') ? 13 : 0);
    }
    return props;
  }
  drawProp(c, prop, options = {}) {
    if (prop?.type === 'runeRelicPart') {
      const image = this._runeTablet(); c.drawImage(image.canvas, prop.x - image.ox, prop.y - image.oy, image.w, image.h);
      if (prop.site?.state === 'active') {
        const time = options.reduced ? 0 : Number.isFinite(options.time) ? options.time : 0;
        c.save(); c.globalAlpha *= .8 + Math.sin(time * 2 + prop.dx * .03) * .12;
        line(c, [[prop.x - 2, prop.y - 26], [prop.x + 2, prop.y - 23], [prop.x - 2, prop.y - 19], [prop.x + 2, prop.y - 16], [prop.x - 2, prop.y - 12]], '#c9efce', 1.4); c.restore();
      }
      return true;
    }
    if (prop?.type !== 'rescueRelicPart') return false;
    const part = prop.part, open = !!prop.site?.gateOpen;
    const image = part === 'back' ? this._back() : part.startsWith('side') ? this._side() : part.startsWith('post') ? this._post() : this._gate(open);
    c.save(); c.translate(prop.x, prop.y);
    if (part === 'sideRight' || part === 'gateRight') c.scale(-1, 1);
    c.drawImage(image.canvas, -image.ox, -image.oy, image.w, image.h); c.restore(); return true;
  }
}
