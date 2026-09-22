import { readFileSync } from "node:fs";
import path from "node:path";

interface PluginManifest {
  id: string;
  minAppVersion: string;
}

function readManifest(relativePath: string): PluginManifest {
  return JSON.parse(
    readFileSync(path.resolve(process.cwd(), relativePath), "utf8")
  ) as PluginManifest;
}

describe("gallery-manifest", () => {
  describe("dev plugin manifest", () => {
    it("tracks the production minimum app version so the gallery loads wherever the plugin does", () => {
      const gallery = readManifest("dev/gallery/manifest.json");
      const production = readManifest("manifest.json");

      expect(gallery.minAppVersion).toBe(production.minAppVersion);
    });

    it("uses a distinct plugin id so the dev gallery never collides with the production plugin", () => {
      const gallery = readManifest("dev/gallery/manifest.json");
      const production = readManifest("manifest.json");

      expect(gallery.id).not.toBe(production.id);
    });
  });
});
