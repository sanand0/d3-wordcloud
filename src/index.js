// Word cloud layout by Jason Davies, https://www.jasondavies.com/wordcloud/
// Modernized for D3 v7+ with incremental word placement support.
// Algorithm due to Jonathan Feinberg, https://s3.amazonaws.com/static.mrfeinberg.com/bv_ch03.pdf

import { dispatch } from "d3-dispatch";

const RADIANS = Math.PI / 180;
const cw = 1 << 11 >> 5; // sprite sheet width in 32-bit words (64)
const ch = 1 << 11;       // sprite sheet height in pixels (2048)

// Spiral generators — each returns a function of t → [dx, dy].
function archimedeanSpiral(size) {
  const e = size[0] / size[1];
  return (t) => [e * (t *= 0.1) * Math.cos(t), t * Math.sin(t)];
}

function rectangularSpiral(size) {
  const dy = 4, dx = dy * size[0] / size[1];
  let x = 0, y = 0;
  return (t) => {
    const sign = t < 0 ? -1 : 1;
    switch ((Math.sqrt(1 + 4 * sign * t) - sign) & 3) {
      case 0: x += dx; break;
      case 1: y += dy; break;
      case 2: x -= dx; break;
      default: y -= dy; break;
    }
    return [x, y];
  };
}

export const spirals = { archimedean: archimedeanSpiral, rectangular: rectangularSpiral };

export function cloud() {
  // Configuration (all stored as functions via constant()).
  let size = [256, 256];
  let words = [];
  let timeInterval = Infinity;
  let random = Math.random;
  let spiral = archimedeanSpiral;
  let canvas = defaultCanvas;
  let text      = (d) => d.text;
  let font      = () => "serif";
  let fontSize  = (d) => Math.sqrt(d.value);
  let fontStyle  = () => "normal";
  let fontWeight = () => "normal";
  let rotate    = () => (~~(random() * 6) - 3) * 30;
  let padding   = () => 1;

  // Persistent layout state — survive across add() calls.
  let _board  = null; // Int32Array collision bitmap
  let _bounds = null; // [{x,y}, {x,y}] bounding box of placed words
  let _placed = [];   // all successfully placed word datums
  let _timer  = null;

  const event = dispatch("word", "end");

  // Build an offscreen canvas context scaled for the device pixel ratio.
  function getContext() {
    const el = canvas();
    const ctx = el.getContext("2d", { willReadFrequently: true });
    el.width = el.height = 1;
    const ratio = Math.sqrt(ctx.getImageData(0, 0, 1, 1).data.length >> 2);
    el.width  = (cw << 5) / ratio;
    el.height = ch / ratio;
    ctx.fillStyle = ctx.strokeStyle = "red";
    return { context: ctx, ratio };
  }

  // Core placement loop for a batch of words against the shared board.
  function run(wordList) {
    const cr  = getContext();
    const sw  = size[0] >> 5; // board stride in 32-bit words
    const board = _board;     // capture reference so async steps see same board
    const n = wordList.length;
    const batchPlaced = [];
    let i = -1;

    const data = wordList.map((d, idx) => {
      d.text   = text(d, idx);
      d.font   = font(d, idx);
      d.style  = fontStyle(d, idx);
      d.weight = fontWeight(d, idx);
      d.rotate = rotate(d, idx);
      d.size   = ~~fontSize(d, idx);
      d.padding = padding(d, idx);
      return d;
    }).sort((a, b) => b.size - a.size);

    if (_timer) clearInterval(_timer);
    _timer = setInterval(step, 0);
    step();

    function step() {
      const start = Date.now();
      while (Date.now() - start < timeInterval && ++i < n && _timer) {
        const d = data[i];
        d.x = (size[0] * (random() + 0.5)) >> 1;
        d.y = (size[1] * (random() + 0.5)) >> 1;
        cloudSprite(cr, d, data, i);
        if (d.hasText && placeWord(d, board, sw)) {
          _placed.push(d);
          batchPlaced.push(d);
          event.call("word", cloud, d);
          if (_bounds) cloudBounds(_bounds, d);
          else _bounds = [{ x: d.x + d.x0, y: d.y + d.y0 }, { x: d.x + d.x1, y: d.y + d.y1 }];
          // Shift to centre-relative coordinates for the caller.
          d.x -= size[0] >> 1;
          d.y -= size[1] >> 1;
        }
      }
      if (i >= n) {
        cloud.stop();
        event.call("end", cloud, batchPlaced, _bounds);
      }
    }

    // Spiral outward from the word's starting position until a free spot is found,
    // then stamp the word's bitmask into the shared board.
    function placeWord(tag, board, sw) {
      const startX   = tag.x;
      const startY   = tag.y;
      const maxDelta = Math.sqrt(size[0] * size[0] + size[1] * size[1]);
      const s  = spiral(size);
      let dt = random() < 0.5 ? 1 : -1;
      let t  = -dt;
      let dxdy;

      while ((dxdy = s(t += dt))) {
        const dx = ~~dxdy[0];
        const dy = ~~dxdy[1];
        if (Math.min(Math.abs(dx), Math.abs(dy)) >= maxDelta) break;
        tag.x = startX + dx;
        tag.y = startY + dy;
        if (
          tag.x + tag.x0 < 0 || tag.y + tag.y0 < 0 ||
          tag.x + tag.x1 > size[0] || tag.y + tag.y1 > size[1]
        ) continue;
        // Fast rectangular pre-check before expensive bitmask test.
        if (!_bounds || collideRects(tag, _bounds)) {
          if (!cloudCollide(tag, board, size[0])) {
            // Stamp the word sprite into the board.
            const w   = tag.width >> 5;
            const lx  = tag.x - (w << 4);
            const sx  = lx & 0x7f;
            const msx = 32 - sx;
            const h   = tag.y1 - tag.y0;
            let x = (tag.y + tag.y0) * sw + (lx >> 5);
            for (let j = 0; j < h; j++) {
              let last = 0;
              for (let k = 0; k <= w; k++) {
                board[x + k] |= (last << msx) | (k < w ? (last = tag.sprite[j * w + k]) >>> sx : 0);
              }
              x += sw;
            }
            return true;
          }
        }
      }
      return false;
    }
  }

  // Public API object.
  const cloud = {
    // Start a fresh layout. Clears the board and re-places all current words.
    start() {
      _board  = new Int32Array((size[0] >> 5) * size[1]);
      _bounds = null;
      _placed = [];
      run(words.slice());
      return cloud;
    },

    // Stop any running async layout and free sprite memory.
    stop() {
      if (_timer) {
        clearInterval(_timer);
        _timer = null;
      }
      for (const d of words) delete d.sprite;
      return cloud;
    },

    // Add words to the existing layout without disturbing already-placed words.
    // If the layout has not been started, merges newWords into .words() and starts fresh.
    add(newWords) {
      if (!_board) {
        words = words.concat(newWords);
        return cloud.start();
      }
      words = words.concat(newWords);
      run(newWords.slice());
      return cloud;
    },

    // Reset persistent layout state; the next start() begins from an empty board.
    clear() {
      cloud.stop();
      _board  = null;
      _bounds = null;
      _placed = [];
      return cloud;
    },

    // Return a snapshot of all successfully placed words.
    placed() {
      return _placed.slice();
    },

    // — Configuration (all chainable) ——————————————————————————

    words(_)        { return _ !== undefined ? (words = _, cloud) : words; },
    size(_)         { return _ !== undefined ? (size = [+_[0], +_[1]], cloud) : size; },
    font(_)         { return _ !== undefined ? (font = constant(_), cloud) : font; },
    fontStyle(_)    { return _ !== undefined ? (fontStyle  = constant(_), cloud) : fontStyle; },
    fontWeight(_)   { return _ !== undefined ? (fontWeight = constant(_), cloud) : fontWeight; },
    fontSize(_)     { return _ !== undefined ? (fontSize   = constant(_), cloud) : fontSize; },
    rotate(_)       { return _ !== undefined ? (rotate  = constant(_), cloud) : rotate; },
    text(_)         { return _ !== undefined ? (text    = constant(_), cloud) : text; },
    padding(_)      { return _ !== undefined ? (padding = constant(_), cloud) : padding; },
    random(_)       { return _ !== undefined ? (random  = _, cloud) : random; },
    canvas(_)       { return _ !== undefined ? (canvas  = constant(_), cloud) : canvas; },
    spiral(_)       { return _ !== undefined ? (spiral  = spirals[_] || _, cloud) : spiral; },
    timeInterval(_) { return _ !== undefined ? (timeInterval = _ == null ? Infinity : +_, cloud) : timeInterval; },

    on(...args) {
      const value = event.on(...args);
      return value === event ? cloud : value;
    },
  };

  return cloud;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

function constant(v) {
  return typeof v === "function" ? v : () => v;
}

function defaultCanvas() {
  return document.createElement("canvas");
}

// Render a batch of word sprites onto the offscreen canvas and extract their
// bitmasks. Processes data[di..] until the canvas is full, then reads pixels once.
function cloudSprite({ context: c, ratio }, d, data, di) {
  if (d.sprite) return; // batch already rendered for this word
  c.clearRect(0, 0, (cw << 5) / ratio, ch / ratio);
  let x = 0, y = 0, maxh = 0;
  const n = data.length;
  --di;
  while (++di < n) {
    d = data[di];
    c.save();
    c.font = `${d.style} ${d.weight} ${~~((d.size + 1) / ratio)}px ${d.font}`;
    const metrics = c.measureText(d.text);
    const anchor  = -Math.floor(metrics.width / 2);
    let w = (metrics.width + 1) * ratio;
    let h = d.size << 1;
    if (d.rotate) {
      const sinr = Math.sin(d.rotate * RADIANS);
      const cosr = Math.cos(d.rotate * RADIANS);
      const wcr = w * cosr, wsr = w * sinr, hcr = h * cosr, hsr = h * sinr;
      w = (Math.max(Math.abs(wcr + hsr), Math.abs(wcr - hsr)) + 0x1f) >> 5 << 5;
      h = ~~Math.max(Math.abs(wsr + hcr), Math.abs(wsr - hcr));
    } else {
      w = (w + 0x1f) >> 5 << 5;
    }
    if (h > maxh) maxh = h;
    if (x + w >= cw << 5) { x = 0; y += maxh; maxh = 0; }
    if (y + h >= ch) break;
    c.translate((x + (w >> 1)) / ratio, (y + (h >> 1)) / ratio);
    if (d.rotate) c.rotate(d.rotate * RADIANS);
    c.fillText(d.text, anchor, 0);
    if (d.padding) { c.lineWidth = 2 * d.padding; c.strokeText(d.text, anchor, 0); }
    c.restore();
    d.width = w; d.height = h;
    d.xoff = x; d.yoff = y;
    d.x1 = w >> 1; d.y1 = h >> 1;
    d.x0 = -d.x1;  d.y0 = -d.y1;
    d.hasText = true;
    x += w;
  }
  const pixels = c.getImageData(0, 0, (cw << 5) / ratio, ch / ratio).data;
  const sprite = [];
  while (--di >= 0) {
    d = data[di];
    if (!d.hasText) continue;
    const w   = d.width;
    const w32 = w >> 5;
    let   h   = d.y1 - d.y0;
    for (let i = 0; i < h * w32; i++) sprite[i] = 0;
    x = d.xoff;
    if (x == null) return;
    y = d.yoff;
    let seen = 0, seenRow = -1;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = w32 * j + (i >> 5);
        const m = pixels[((y + j) * (cw << 5) + (x + i)) << 2] ? 1 << (31 - (i % 32)) : 0;
        sprite[k] |= m;
        seen |= m;
      }
      if (seen) seenRow = j;
      else { d.y0++; h--; j--; y++; } // trim empty leading rows
    }
    d.y1 = d.y0 + seenRow;
    d.sprite = sprite.slice(0, (d.y1 - d.y0) * w32);
  }
}

// Bitmask collision detection between a word sprite and the board.
function cloudCollide(tag, board, sw) {
  sw >>= 5;
  const sprite = tag.sprite;
  const w   = tag.width >> 5;
  const lx  = tag.x - (w << 4);
  const sx  = lx & 0x7f;
  const msx = 32 - sx;
  const h   = tag.y1 - tag.y0;
  let x = (tag.y + tag.y0) * sw + (lx >> 5);
  let last;
  for (let j = 0; j < h; j++) {
    last = 0;
    for (let i = 0; i <= w; i++) {
      if (((last << msx) | (i < w ? (last = sprite[j * w + i]) >>> sx : 0)) & board[x + i]) return true;
    }
    x += sw;
  }
  return false;
}

function cloudBounds(bounds, d) {
  if (d.x + d.x0 < bounds[0].x) bounds[0].x = d.x + d.x0;
  if (d.y + d.y0 < bounds[0].y) bounds[0].y = d.y + d.y0;
  if (d.x + d.x1 > bounds[1].x) bounds[1].x = d.x + d.x1;
  if (d.y + d.y1 > bounds[1].y) bounds[1].y = d.y + d.y1;
}

function collideRects(a, b) {
  return a.x + a.x1 > b[0].x && a.x + a.x0 < b[1].x &&
         a.y + a.y1 > b[0].y && a.y + a.y0 < b[1].y;
}
