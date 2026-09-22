import process from "process";
import { nodeBuiltinExternals } from "./node-module-shim.mjs";

/**
 * Options shared by the production plugin bundle and the development-only
 * component gallery
 *
 * Both load in the same Electron renderer, so both keep Node builtins external,
 * stub `global`, and import `*.md` skill text as a string.
 *
 * Anything only one bundle needs (banner, extra externals or plugins, outfile)
 * stays in that bundle's own config.
 *
 * @param {boolean} prod - production build when true, watch-friendly dev build otherwise.
 * @param {{ extraExternal?: string[], extraDefine?: Record<string, string> }} [overrides]
 */
export function baseEsbuildOptions(prod, overrides = {}) {
  const { extraExternal = [], extraDefine = {} } = overrides;
  return {
    bundle: true,
    external: ["obsidian", "electron", ...nodeBuiltinExternals, ...extraExternal],
    format: "cjs",
    target: "es2020",
    logLevel: "info",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    // Skill text shipped by the openartifacts package is imported as a string.
    loader: { ".md": "text" },
    define: {
      global: "window",
      "process.env.NODE_ENV": prod ? '"production"' : '"development"',
      ...extraDefine,
    },
  };
}

/**
 * Rebuild once for production, otherwise watch. Shared tail of both configs.
 */
export async function runEsbuildContext(context, prod) {
  if (prod) {
    await context.rebuild();
    process.exit(0);
  } else {
    await context.watch();
  }
}
