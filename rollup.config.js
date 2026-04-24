import terser from "@rollup/plugin-terser";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

// d3-dispatch is an external peer dep; map it to the global "d3" object in UMD builds.
const external = Object.keys(pkg.dependencies);
const globals  = Object.fromEntries(external.map((dep) => [dep, "d3"]));

const banner = `// ${pkg.name} v${pkg.version} Copyright ${new Date().getFullYear()} ${pkg.homepage}`;

const base = {
  input: "src/index.js",
  external,
};

export default [
  {
    ...base,
    output: {
      file: `dist/${pkg.name}.js`,
      format: "umd",
      name: "d3",
      extend: true, // merges exports into any existing "d3" global
      globals,
      banner,
    },
  },
  {
    ...base,
    output: {
      file: `dist/${pkg.name}.min.js`,
      format: "umd",
      name: "d3",
      extend: true,
      globals,
      banner,
      plugins: [terser()],
    },
  },
];
