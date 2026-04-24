# d3-wordcloud

A modern D3 word cloud layout plugin — a ground-up rewrite of [Jason Davies' d3-cloud](https://github.com/jasondavies/d3-cloud) for **D3 v7+**.

Key improvements over the original:

- **Incremental placement** — add words to an existing cloud without disturbing what is already placed, enabling animated, streaming word clouds.
- **Persistent board state** — the collision bitmap is kept alive between `add()` calls so new words find free space correctly.
- **`placed()` accessor** — inspect every successfully placed word datum at any time.
- **Modern ESM** — `"type": "module"` package, proper `exports` field, tree-shakeable.
- **`Int32Array` board** — faster bitwise operations than a plain Array.
- All original features preserved: two spiral patterns, bitmap collision detection, per-word font/size/rotation/padding accessors, HiDPI canvas rendering, `timeInterval`-based async stepping, and the `word`/`end` event API.

---

## Install

```sh
npm install d3-wordcloud
```

Or load from a CDN (adds `d3.cloud` to the global `d3` object):

```html
<script src="https://cdn.jsdelivr.net/npm/d3-wordcloud/dist/d3-wordcloud.min.js"></script>
```

---

## Usage

### Basic (one-shot)

```js
import { cloud } from "d3-wordcloud";
import { scaleLinear } from "d3-scale";

const fontSize = scaleLinear().domain([0, 100]).range([10, 80]);

cloud()
  .size([800, 500])
  .words([
    { text: "Hello",  value: 90 },
    { text: "World",  value: 60 },
    { text: "D3",     value: 40 },
  ])
  .fontSize((d) => fontSize(d.value))
  .on("end", (placed, bounds) => draw(placed))
  .start();
```

### Incremental / animated

```js
const layout = cloud()
  .size([800, 500])
  .fontSize((d) => d.size)
  .on("word", (d) => animateIn(d))   // called as each word is placed
  .on("end",  (placed) => {})
  .words(initialWords)
  .start();

// Later — new words slot into free space without touching existing ones:
layout.add(moreWords);
layout.add(evenMoreWords);

// Reset and start over:
layout.clear().words(freshWords).start();
```

---

## API

### `cloud()`

Returns a new word cloud layout instance.

---

### Layout control

#### `cloud.start()`

Clears the board and places all words currently in `cloud.words()`.  
Returns `cloud`.

Words are sorted largest-first, then placed one-by-one using the configured spiral. Each placement fires a **`"word"`** event. When the batch finishes, an **`"end"`** event fires.

Because placement is async (via `setInterval`), the method returns immediately. Set `cloud.timeInterval(Infinity)` for synchronous-ish behaviour (one giant step per tick).

#### `cloud.stop()`

Cancels the running timer and frees sprite memory.  
Returns `cloud`.

#### `cloud.add(newWords)`

Places `newWords` into the existing layout **without** re-placing already-placed words. The shared collision board is extended in-place so new words find genuinely free positions.

If `start()` has not been called yet, `add()` merges `newWords` into `cloud.words()` and calls `start()` automatically.  
Returns `cloud`.

#### `cloud.clear()`

Stops the layout and resets all persistent state (board, bounds, placed list). The next `start()` begins from an empty board.  
Returns `cloud`.

#### `cloud.placed()`

Returns a snapshot array of every word datum that has been successfully placed since the last `start()` or `clear()`.

---

### Configuration

All setters accept either a **constant value** or an **accessor function** `(datum, index) → value` and return `cloud` for chaining. Calling with no argument returns the current setting.

| Method | Default | Description |
|---|---|---|
| `cloud.words(array)` | `[]` | Input word data. Each element should have at minimum a `text` property. |
| `cloud.size([w, h])` | `[256, 256]` | Layout area in pixels. |
| `cloud.text(fn)` | `d => d.text` | Text string accessor. |
| `cloud.fontSize(fn)` | `d => Math.sqrt(d.value)` | Font size in pixels. |
| `cloud.font(fn)` | `"serif"` | Font family. |
| `cloud.fontStyle(fn)` | `"normal"` | CSS font-style (`"italic"`, etc.). |
| `cloud.fontWeight(fn)` | `"normal"` | CSS font-weight (`"bold"`, `700`, etc.). |
| `cloud.rotate(fn)` | random ±30 °/60 ° | Rotation in degrees. |
| `cloud.padding(fn)` | `1` | Extra padding around each word sprite (pixels). |
| `cloud.spiral(name\|fn)` | `"archimedean"` | Spiral pattern. Built-in: `"archimedean"`, `"rectangular"`. Pass a custom `(size) → t => [dx, dy]` factory for full control. |
| `cloud.random(fn)` | `Math.random` | RNG. Pass a seeded function for reproducible layouts. |
| `cloud.timeInterval(ms)` | `Infinity` | Maximum milliseconds spent per event-loop tick. Lower values keep the UI responsive; `Infinity` places all words in one synchronous burst. |
| `cloud.canvas(fn)` | `() => document.createElement("canvas")` | Canvas factory. Override for server-side rendering (e.g. node-canvas). |

---

### Spirals

```js
import { spirals } from "d3-wordcloud";
// spirals.archimedean(size) → t => [dx, dy]
// spirals.rectangular(size) → t => [dx, dy]
```

You can also pass a custom spiral factory to `cloud.spiral()`:

```js
cloud.spiral((size) => {
  // return a stateful function of t that yields [dx, dy]
  return (t) => [Math.cos(t) * t * 5, Math.sin(t) * t * 5];
});
```

---

### Events

```js
cloud.on("word", (datum) => { /* called once per successfully placed word */ });
cloud.on("end",  (placed, bounds) => { /* called when the current batch finishes */ });
```

`placed` is the array of word datums placed in the **current batch** (not cumulative). Use `cloud.placed()` for the cumulative list.

`bounds` is `[{x, y}, {x, y}]` — the bounding box of all placed words, in board coordinates (origin at top-left). Word `x`/`y` coordinates are relative to the **centre** of the layout area.

---

### Word datum properties set by the layout

After placement each datum is annotated:

| Property | Description |
|---|---|
| `x`, `y` | Position relative to cloud centre (pixels). |
| `rotate` | Applied rotation (degrees). |
| `size` | Applied font size (pixels). |
| `font`, `style`, `weight` | Applied font properties. |
| `width`, `height` | Bounding box of the sprite canvas slot. |
| `x0`, `y0`, `x1`, `y1` | Tight bounding box corners relative to `(x, y)`. |
| `hasText` | `true` if the word was measurable. |

---

## Building the dist bundle

```sh
npm install
npm run build
# → dist/d3-wordcloud.js   (UMD, readable)
# → dist/d3-wordcloud.min.js (UMD, minified)
```

---

## Differences from d3-cloud

| | d3-cloud (original) | d3-wordcloud |
|---|---|---|
| Module format | CommonJS + browserify | ESM (`"type": "module"`) |
| D3 version | v3–v4 dispatch | v7 (dispatch v1–v3) |
| Incremental placement | ✗ | ✓ `cloud.add(words)` |
| Board persistence | ✗ | ✓ across `add()` calls |
| `placed()` accessor | ✗ | ✓ |
| `clear()` reset | ✗ | ✓ |
| Board array type | `Array` | `Int32Array` |
| Build tool | browserify | rollup |

---

## License

BSD-3-Clause © Jason Davies (original algorithm), sanand0 (modernization).
