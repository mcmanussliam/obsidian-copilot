import esbuild from "esbuild";
import process from "process";
import nodeModuleShim from "../../scripts/build/node-module-shim.mjs";
import svgrPlugin from "../../scripts/build/svgr-plugin.mjs";
import { baseEsbuildOptions, runEsbuildContext } from "../../scripts/build/esbuild-base.mjs";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  ...baseEsbuildOptions(prod),
  entryPoints: ["gallery/src/main.ts"],
  outfile: "gallery/dist/main.js",
  // `module` gets a shim rather than a slot in `external` because the renderer
  // has no ESM `createRequire`; `svgrPlugin` loads the backend logo SVGs.
  plugins: [nodeModuleShim, svgrPlugin],
  minify: prod,
});

await runEsbuildContext(context, prod);
