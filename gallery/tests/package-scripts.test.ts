import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

interface PackageJson {
  scripts: Record<string, string>;
}

const REPO_ROOT = process.cwd();
const packageJson = JSON.parse(
  readFileSync(path.resolve(REPO_ROOT, "package.json"), "utf8")
) as PackageJson;

function galleryScriptRefs(script: string): string[] {
  return script.match(/gallery:[\w:.-]+/g) ?? [];
}

function fileRefs(script: string): string[] {
  return [
    ...script.matchAll(/(?:node|bash)\s+([^\s'"]+)/g),
  ].map((match) => match[1]);
}

describe("package-scripts", () => {
  describe("gallery pipelines", () => {
    it("defines every gallery script referenced by another gallery script", () => {
      const defined = new Set(
        Object.keys(packageJson.scripts).filter((name) => name.startsWith("gallery:"))
      );
      const referenced = new Set(
        Object.entries(packageJson.scripts)
          .filter(([name]) => name.startsWith("gallery:"))
          .flatMap(([, script]) => galleryScriptRefs(script))
      );

      expect(referenced.size).toBeGreaterThan(0);
      for (const name of referenced) {
        expect(defined.has(name)).toBe(true);
      }
    });

    it("points every node/bash step at a file that exists in the repo", () => {
      const missing: string[] = [];
      for (const [name, script] of Object.entries(packageJson.scripts)) {
        if (!name.startsWith("gallery:")) continue;
        for (const ref of fileRefs(script)) {
          if (!existsSync(path.resolve(REPO_ROOT, ref))) {
            missing.push(`${name} -> ${ref}`);
          }
        }
      }

      expect(missing).toEqual([]);
    });

    it("generates gallery stories before the steps that bundle them", () => {
      for (const name of ["gallery:build", "gallery:dev"]) {
        const order = galleryScriptRefs(packageJson.scripts[name]);
        expect(order.indexOf("gallery:stories")).toBeLessThan(order.indexOf("gallery:esbuild"));
      }
    });

    it("builds the gallery before deploying it to a vault", () => {
      const order = galleryScriptRefs(packageJson.scripts["gallery:vault"]);

      expect(order[0]).toBe("gallery:build");
    });

    it("prepares the gallery CSS source before Tailwind consumes it", () => {
      const order = galleryScriptRefs(packageJson.scripts["gallery:css"]);

      expect(order.indexOf("gallery:css:source")).toBeLessThan(
        order.indexOf("gallery:css:tailwind")
      );
    });
  });
});
