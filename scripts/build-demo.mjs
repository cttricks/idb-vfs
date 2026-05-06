import { build } from "esbuild";

await build({
  entryPoints: ["demo/app.js"],
  outfile: "demo/app.bundle.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  external: ["dexie"],
  logLevel: "info",
});
