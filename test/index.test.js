// Unit tests for d3-wordcloud using Node's built-in test runner (node --test).
// A lightweight canvas mock is used so tests run without a browser or native addon.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cloud, renderWords, spirals } from "../src/index.js";

// ─── Canvas mock ──────────────────────────────────────────────────────────────
// Returns a canvas whose context reports every pixel as "lit" (red channel = 128).
// This makes cloudSprite mark all rendered words as hasText=true and fills their
// sprites with 1-bits, which is enough to test placement logic.
function mockCanvas() {
  let elWidth = 1, elHeight = 1;
  const ctx = {
    font: "", fillStyle: "", strokeStyle: "", lineWidth: 1,
    save() {}, restore() {}, clearRect() {}, translate() {}, rotate() {},
    fillText() {}, strokeText() {},
    measureText(text) { return { width: text.length * 8 }; },
    getImageData(x, y, w, h) {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < data.length; i += 4) data[i] = 128; // red channel
      return { data };
    },
  };
  return {
    get width()  { return elWidth; },
    set width(v) { elWidth = v; },
    get height()  { return elHeight; },
    set height(v) { elHeight = v; },
    getContext() { return ctx; },
  };
}

// Helper: run a cloud layout to completion and resolve with placed words.
function run(c) {
  return new Promise((resolve, reject) => {
    c.on("end.test", () => {
      c.on("end.test", null); // deregister so subsequent add() calls don't re-fire
      resolve(c.placed());
    });
  });
}

function mockSelection() {
  const nodes = [];

  function createSelection(getNodes) {
    return {
      selectAll(selector) {
        if (selector === "title") {
          return createTitleSelection(getNodes);
        }
        return createDataSelection(nodes);
      },
      attr(name, value) {
        for (const [index, node] of getNodes().entries()) {
          node.attrs[name] = typeof value === "function" ? value(node.datum, index) : value;
        }
        return this;
      },
      style(name, value) {
        for (const [index, node] of getNodes().entries()) {
          node.styles[name] = typeof value === "function" ? value(node.datum, index) : value;
        }
        return this;
      },
      text(value) {
        for (const [index, node] of getNodes().entries()) {
          node.text = typeof value === "function" ? value(node.datum, index) : value;
        }
        return this;
      },
    };
  }

  function createDataSelection(store) {
    return {
      data(data) {
        store.length = 0;
        for (const datum of data) {
          store.push({ datum, attrs: {}, styles: {}, text: "", titles: [] });
        }
        return this;
      },
      join() {
        return createSelection(() => store);
      },
    };
  }

  function createTitleSelection(getNodes) {
    return {
      data(values) {
        const source = getNodes();
        for (const [index, node] of source.entries()) {
          node.titles = typeof values === "function" ? values(node.datum, index) : values;
        }
        return this;
      },
      join() {
        return {
          text(value) {
            for (const [index, node] of getNodes().entries()) {
              node.titles = node.titles.map((entry) =>
                typeof value === "function" ? value(entry, index) : value,
              );
            }
            return this;
          },
        };
      },
    };
  }

  return { selection: createSelection(() => nodes), nodes };
}

// ─── API shape ────────────────────────────────────────────────────────────────

test("cloud() returns an object with all public methods", () => {
  const c = cloud();
  for (const m of [
    "start", "stop", "add", "clear", "placed", "bounds", "startAsync", "addAsync", "on",
    "words", "size", "font", "fontStyle", "fontWeight", "fontSize",
    "rotate", "text", "padding", "spiral", "random", "timeInterval", "canvas",
  ]) {
    assert.equal(typeof c[m], "function", `cloud.${m} should be a function`);
  }
});

test("spirals exports archimedean and rectangular", () => {
  assert.equal(typeof spirals.archimedean, "function");
  assert.equal(typeof spirals.rectangular, "function");
  const s = spirals.archimedean([400, 400]);
  const [dx, dy] = s(1);
  assert.equal(typeof dx, "number");
  assert.equal(typeof dy, "number");
});

// ─── Configuration getters / setters ─────────────────────────────────────────

test("configuration methods are chainable and return stored values", () => {
  const c = cloud();

  assert.deepEqual(c.size(), [256, 256]);
  assert.equal(c.size([800, 400]), c);
  assert.deepEqual(c.size(), [800, 400]);

  assert.equal(c.timeInterval(100), c);
  assert.equal(c.timeInterval(), 100);

  assert.equal(c.timeInterval(null), c);
  assert.equal(c.timeInterval(), Infinity);

  // Constant value wrapped as function
  c.font("monospace");
  assert.equal(typeof c.font(), "function");
  assert.equal(c.font()({ text: "x" }), "monospace");

  // Function passthrough
  const fn = (d) => d.size * 2;
  c.fontSize(fn);
  assert.equal(c.fontSize(), fn);

  // Spiral by name
  assert.equal(c.spiral("rectangular"), c);
  assert.equal(c.spiral(), spirals.rectangular);
});

// ─── start() ─────────────────────────────────────────────────────────────────

test("start() places words and fires end event", async () => {
  const c = cloud()
    .size([400, 400])
    .canvas(mockCanvas)
    .words([
      { text: "alpha", value: 100 },
      { text: "beta",  value: 60 },
      { text: "gamma", value: 40 },
    ])
    .timeInterval(Infinity);

  const promise = run(c);
  c.start();
  const placed = await promise;

  assert.ok(placed.length > 0, "at least one word should be placed");
});

test("startAsync() resolves with the placed words and bounds", async () => {
  const c = cloud()
    .size([400, 400])
    .canvas(mockCanvas)
    .words([
      { text: "alpha", value: 100 },
      { text: "beta", value: 60 },
    ])
    .timeInterval(Infinity);

  const result = await c.startAsync();

  assert.equal(result.layout, c);
  assert.equal(result.words.length, c.placed().length);
  assert.deepEqual(result.bounds, c.bounds());
});

test("start() fires word event for each placed word", async () => {
  const wordEvents = [];
  const c = cloud()
    .size([400, 400])
    .canvas(mockCanvas)
    .words([{ text: "hello", value: 80 }, { text: "world", value: 50 }])
    .timeInterval(Infinity)
    .on("word", (d) => wordEvents.push(d.text));

  const promise = run(c);
  c.start();
  await promise;

  assert.deepEqual(wordEvents, c.placed().map((d) => d.text));
});

test("placed word coordinates are centre-relative and within cloud bounds", async () => {
  const [w, h] = [500, 300];
  const c = cloud()
    .size([w, h])
    .canvas(mockCanvas)
    .words([{ text: "test", value: 64 }])
    .timeInterval(Infinity);

  const promise = run(c);
  c.start();
  const placed = await promise;

  for (const d of placed) {
    // Coordinates are relative to centre so valid range is [-w/2, w/2] × [-h/2, h/2]
    assert.ok(d.x >= -w / 2 && d.x <= w / 2, `x=${d.x} out of range`);
    assert.ok(d.y >= -h / 2 && d.y <= h / 2, `y=${d.y} out of range`);
  }
});

test("start() sets text, font, size, rotate on each datum", async () => {
  const c = cloud()
    .size([400, 400])
    .canvas(mockCanvas)
    .words([{ text: "hi", value: 100 }])
    .font("sans-serif")
    .fontSize(() => 32)
    .rotate(() => 45)
    .timeInterval(Infinity);

  const promise = run(c);
  c.start();
  const placed = await promise;

  if (placed.length > 0) {
    assert.equal(placed[0].font, "sans-serif");
    assert.equal(placed[0].size, 32);
    assert.equal(placed[0].rotate, 45);
  }
});

// ─── add() ───────────────────────────────────────────────────────────────────

test("add() appends words without changing positions of already-placed words", async () => {
  const c = cloud()
    .size([800, 600])
    .canvas(mockCanvas)
    .words([{ text: "alpha", value: 100 }])
    .timeInterval(Infinity);

  // First pass
  const p1 = run(c);
  c.start();
  await p1;

  const snapshot = c.placed().map((d) => ({ text: d.text, x: d.x, y: d.y }));

  // Second pass — add more words
  const p2 = run(c);
  c.add([{ text: "beta", value: 60 }, { text: "gamma", value: 40 }]);
  await p2;

  // All words from the first pass must keep their positions
  for (const orig of snapshot) {
    const current = c.placed().find((d) => d.text === orig.text);
    assert.ok(current, `"${orig.text}" should still be in placed()`);
    assert.equal(current.x, orig.x, `x changed for "${orig.text}"`);
    assert.equal(current.y, orig.y, `y changed for "${orig.text}"`);
  }
});

test("add() without prior start() initialises the layout automatically", async () => {
  const c = cloud()
    .size([400, 400])
    .canvas(mockCanvas)
    .timeInterval(Infinity);

  const promise = run(c);
  c.add([{ text: "solo", value: 80 }]);
  await promise;

  assert.ok(c.placed().length > 0);
});

test("add() accumulates placed() across multiple calls", async () => {
  const c = cloud()
    .size([800, 800])
    .canvas(mockCanvas)
    .words([{ text: "first", value: 90 }])
    .timeInterval(Infinity);

  const p1 = run(c);
  c.start();
  await p1;
  const afterStart = c.placed().length;

  const p2 = run(c);
  c.add([{ text: "second", value: 70 }]);
  await p2;

  assert.ok(c.placed().length >= afterStart, "placed() should grow after add()");
});

test("addAsync() resolves after incrementally placing a batch", async () => {
  const c = cloud()
    .size([800, 800])
    .canvas(mockCanvas)
    .words([{ text: "first", value: 90 }])
    .fontSize(() => 24)
    .timeInterval(Infinity);

  const before = (await c.startAsync()).words.length;
  const result = await c.addAsync([{ text: "second", value: 70 }]);

  assert.equal(result.layout, c);
  assert.ok(Array.isArray(result.words));
  assert.deepEqual(result.bounds, c.bounds());
  assert.ok(c.placed().length >= before);
});

// ─── clear() ─────────────────────────────────────────────────────────────────

test("clear() resets placed list so start() rebuilds from scratch", async () => {
  const c = cloud()
    .size([400, 400])
    .canvas(mockCanvas)
    .words([{ text: "one", value: 80 }])
    .timeInterval(Infinity);

  const p1 = run(c);
  c.start();
  await p1;
  assert.ok(c.placed().length > 0);

  c.clear();
  assert.equal(c.placed().length, 0, "clear() should empty placed()");

  // start() after clear() re-places everything
  const p2 = run(c);
  c.start();
  await p2;
  assert.ok(c.placed().length > 0, "start() after clear() should place words");
});

test("bounds() returns a defensive copy of the current bounds", async () => {
  const c = cloud()
    .size([400, 400])
    .canvas(mockCanvas)
    .words([{ text: "one", value: 80 }])
    .timeInterval(Infinity);

  await c.startAsync();
  const bounds = c.bounds();

  assert.ok(bounds);
  bounds[0].x = 99999;
  assert.notEqual(c.bounds()[0].x, 99999);
});

// ─── stop() ──────────────────────────────────────────────────────────────────

test("stop() halts an in-progress layout", async () => {
  let endFired = false;
  const c = cloud()
    .size([400, 400])
    .canvas(mockCanvas)
    .words(Array.from({ length: 200 }, (_, i) => ({ text: `w${i}`, value: 50 })))
    .timeInterval(1) // very short — layout spans many ticks
    .on("end", () => { endFired = true; });

  c.start();
  c.stop(); // stop immediately

  // Wait a tick to confirm "end" was not fired after stop()
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(endFired, false, "end should not fire after stop()");
});

// ─── Spiral patterns ─────────────────────────────────────────────────────────

test("archimedean spiral produces increasing offsets", () => {
  const s = spirals.archimedean([400, 400]);
  const points = Array.from({ length: 20 }, (_, i) => s(i + 1));
  // Distance from origin should generally increase
  const dists = points.map(([x, y]) => Math.hypot(x, y));
  const increasing = dists.slice(1).every((d, i) => d >= dists[i] * 0.8);
  assert.ok(increasing, "archimedean spiral should expand outward");
});

test("rectangular spiral visits all four quadrants", () => {
  const s = spirals.rectangular([400, 400]);
  const points = Array.from({ length: 100 }, (_, i) => s(i + 1));
  const hasPos = (fn) => points.some(fn);
  assert.ok(hasPos(([x]) => x > 0), "should reach positive x");
  assert.ok(hasPos(([x]) => x < 0), "should reach negative x");
  assert.ok(hasPos(([, y]) => y > 0), "should reach positive y");
  assert.ok(hasPos(([, y]) => y < 0), "should reach negative y");
});

// ─── Seeded random ───────────────────────────────────────────────────────────

test("seeded random produces identical layouts on repeated runs", async () => {
  const words = [
    { text: "reproducible", value: 100 },
    { text: "layout", value: 70 },
    { text: "test", value: 40 },
  ];

  function makeSeeded() {
    // Simple LCG for deterministic output
    let s = 42;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
  }

  async function runSeeded() {
    const c = cloud()
      .size([500, 500])
      .canvas(mockCanvas)
      .words(words.map((d) => ({ ...d })))
      .random(makeSeeded())
      .timeInterval(Infinity);
    const promise = run(c);
    c.start();
    return promise;
  }

  const a = await runSeeded();
  const b = await runSeeded();

  assert.equal(a.length, b.length, "same number of words placed");
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].text, b[i].text);
    assert.equal(a[i].x, b[i].x, `x differs for "${a[i].text}"`);
    assert.equal(a[i].y, b[i].y, `y differs for "${a[i].text}"`);
  }
});

test("renderWords() binds positioned text nodes onto a D3-like selection", () => {
  const { selection, nodes } = mockSelection();
  const words = [
    {
      id: "alpha",
      text: "Alpha",
      x: 10,
      y: -5,
      rotate: 15,
      size: 24,
      font: "Inter",
      style: "italic",
      weight: "700",
      fill: "#3366ff",
    },
  ];

  const result = renderWords(selection, words, {
    width: 400,
    height: 200,
    key: (d) => d.id,
    fill: (d) => d.fill,
    title: (d) => `${d.text}:${d.size}`,
    attrs: { "data-id": (d) => d.id },
    styles: { cursor: "pointer" },
  });

  assert.equal(typeof result.attr, "function");
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].text, "Alpha");
  assert.equal(nodes[0].attrs.transform, "translate(210,95) rotate(15)");
  assert.equal(nodes[0].attrs["data-id"], "alpha");
  assert.equal(nodes[0].styles["font-family"], "Inter");
  assert.equal(nodes[0].styles["font-style"], "italic");
  assert.equal(nodes[0].styles["font-weight"], "700");
  assert.equal(nodes[0].styles["font-size"], "24px");
  assert.equal(nodes[0].styles.fill, "#3366ff");
  assert.equal(nodes[0].styles.cursor, "pointer");
  assert.deepEqual(nodes[0].titles, ["Alpha:24"]);
});
