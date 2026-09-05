import * as esbuild from "esbuild";
import { mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateIconPng } from "./generate-icon.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");

function copyStatic() {
  mkdirSync(join(dist, "icons"), { recursive: true });
  copyFileSync(join(root, "src/manifest.json"), join(dist, "manifest.json"));
  copyFileSync(join(root, "src/sidepanel/index.html"), join(dist, "sidepanel.html"));
  copyFileSync(join(root, "src/options/index.html"), join(dist, "options.html"));
  copyFileSync(join(root, "src/shared/shared.css"), join(dist, "shared.css"));
  copyFileSync(join(root, "src/sidepanel/sidepanel.css"), join(dist, "sidepanel.css"));
  copyFileSync(join(root, "src/options/options.css"), join(dist, "options.css"));
  writeFileSync(join(dist, "icons/icon128.png"), generateIconPng(128));
}

const bundles = [
  {
    entryPoints: [join(root, "src/background/index.ts")],
    outfile: join(dist, "background.js"),
    format: "esm",
  },
  {
    entryPoints: [join(root, "src/content/index.ts")],
    outfile: join(dist, "content.js"),
    format: "iife",
  },
  {
    entryPoints: [join(root, "src/sidepanel/index.ts")],
    outfile: join(dist, "sidepanel.js"),
    format: "iife",
  },
  {
    entryPoints: [join(root, "src/options/index.ts")],
    outfile: join(dist, "options.js"),
    format: "iife",
  },
];

const common = {
  bundle: true,
  sourcemap: true,
  target: "chrome114",
  logLevel: "info",
};

async function buildOnce() {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  copyStatic();
  await Promise.all(bundles.map((opts) => esbuild.build({ ...common, ...opts })));
}

async function buildWatch() {
  mkdirSync(dist, { recursive: true });
  copyStatic();
  const contexts = await Promise.all(
    bundles.map((opts) =>
      esbuild.context({
        ...common,
        ...opts,
        plugins: [
          {
            name: "copy-static-on-rebuild",
            setup(build) {
              build.onEnd((result) => {
                if (!result.errors.length) copyStatic();
              });
            },
          },
        ],
      }),
    ),
  );
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.info("[canvas-companion] watching… load the unpacked dist/ folder in Chrome.");
}

if (watch) {
  await buildWatch();
} else {
  await buildOnce();
  console.info("[canvas-companion] built dist/ — Load unpacked this folder in chrome://extensions");
}
