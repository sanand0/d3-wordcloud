# d3-wordcloud

A modern word cloud layout for D3 workflows.

This project keeps the proven bitmap placement algorithm from Jason Davies' `d3-cloud`, but updates the package around how people build with D3 today: ESM-first distribution, incremental placement, promise-friendly layout control, and a rendering helper that plugs straight into D3 selections.

## Why this version

- Built for modern D3 usage instead of legacy browser globals.
- Supports incremental placement with `add()` so existing words stay put.
- Exposes `startAsync()` and `addAsync()` for `await`-based flows.
- Includes `renderWords(selection, words, options)` for D3 data joins.
- Keeps a persistent collision board for streaming and interactive clouds.
- Adds `placed()` and `bounds()` accessors for inspection and reuse.

## Install

```sh
npm install d3-wordcloud
```

Browser UMD build:

```html
<script src="https://cdn.jsdelivr.net/npm/d3-wordcloud/dist/d3-wordcloud.min.js"></script>
```

## Usage

### Layout + render with D3

```js
import { cloud, renderWords } from "d3-wordcloud";
import * as d3 from "d3";

const width = 800;
const height = 480;
const svg = d3.select("svg").attr("viewBox", `0 0 ${width} ${height}`);

const layout = cloud()
  .size([width, height])
  .words(data)
  .font("Inter, sans-serif")
  .fontSize((d) => Math.sqrt(d.value) * 2)
  .padding(2);

const { words } = await layout.startAsync();

renderWords(svg, words, {
  width,
  height,
  fill: (d, i) => d3.schemeTableau10[i % 10],
  title: (d) => `${d.text}: ${d.value}`,
});
```

### Incremental updates

```js
const layout = cloud()
  .size([800, 480])
  .fontSize((d) => d.size)
  .on("word", (d) => {
    console.log("placed", d.text, d.x, d.y);
  });

await layout.addAsync(firstBatch);   // initializes automatically
await layout.addAsync(secondBatch);  // extends the same board

console.log(layout.placed());
console.log(layout.bounds());
```

### Selection-friendly rendering

`renderWords()` works with any D3 selection-like object that supports `selectAll()`, `data()`, and `join()`:

```js
renderWords(group, placed, {
  width: 800,
  height: 480,
  key: (d) => d.text,
  fill: (d) => color(d.group),
  attrs: {
    "data-group": (d) => d.group,
  },
  styles: {
    cursor: "pointer",
  },
  title: (d) => `${d.text} (${d.value})`,
});
```

The helper applies:

- `text-anchor="middle"`
- `transform="translate(x + width / 2, y + height / 2) rotate(...)"`
- font family, style, weight, size
- fill and opacity
- optional `attrs`, `styles`, and `<title>`

## API

### `cloud()`

Creates a new layout instance.

### Layout control

- `cloud.start()`: clears the board and places `cloud.words()`
- `cloud.startAsync()`: same as `start()`, but resolves `{ words, bounds, layout }`
- `cloud.add(newWords)`: adds a batch without moving already placed words
- `cloud.addAsync(newWords)`: promise-based version of `add()`
- `cloud.stop()`: stops any in-flight async placement
- `cloud.clear()`: resets board, bounds, and placed words
- `cloud.placed()`: returns all placed words so far
- `cloud.bounds()`: returns the current cumulative bounding box

### Configuration

All configuration setters are chainable and accept either constants or accessors.

| Method | Default |
| --- | --- |
| `words(array)` | `[]` |
| `size([w, h])` | `[256, 256]` |
| `text(d)` | `d.text` |
| `font()` | `"serif"` |
| `fontStyle()` | `"normal"` |
| `fontWeight()` | `"normal"` |
| `fontSize(d)` | `Math.sqrt(d.value)` |
| `rotate()` | random multiples of 30 |
| `padding()` | `1` |
| `spiral(nameOrFactory)` | `"archimedean"` |
| `random(fn)` | `Math.random` |
| `timeInterval(ms)` | `Infinity` |
| `canvas(factory)` | `document.createElement("canvas")` |

### Events

- `word`: fired for every placed word
- `end`: fired for every completed batch as `(batchPlaced, bounds)`

### Utilities

- `spirals.archimedean(size)`
- `spirals.rectangular(size)`
- `renderWords(selection, words, options)`

## Build

```sh
npm install
npm run build
```

Build outputs:

- `dist/d3-wordcloud.js` - ESM
- `dist/d3-wordcloud.umd.js` - readable UMD
- `dist/d3-wordcloud.min.js` - minified UMD

## License

MIT. Original placement work by Jason Davies and Jonathan Feinberg; modernization and API updates in this package.
