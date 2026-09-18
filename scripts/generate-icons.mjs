/**
 * Generates the whole Savanna icon set from one glyph definition.
 *
 * The icons used to be hand-exported, so the glyph's size drifted between files
 * and nothing kept the tile geometry in step. This script owns the glyph and
 * emits every cut, so the mark is identical everywhere and a resize is a
 * one-line change.
 *
 * Run it with a puppeteer-core available (the project does not depend on it):
 *
 *   NODE_PATH=/Users/<user>/.workbuddy-ai/binaries/node/workspace/node_modules \
 *     /Users/<user>/.workbuddy-ai/binaries/node/versions/22.22.2/bin/node \
 *     scripts/generate-icons.mjs
 *
 * The glyph is measured in the browser rather than assumed: the SVG path data is
 * the source of truth, and a hardcoded translate/scale rots the moment the path
 * data changes.
 */
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(ROOT, "client/public/icons");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** Lucide `message-circle` — the Savanna mark. */
const GLYPH = {
  viewBox: 24,
  strokeWidth: 2,
  paths: [
    "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
    "M8 12h.01",
    "M12 12h.01",
    "M16 12h.01",
  ],
};

const CANVAS = 1024;
const TILE_FILL = "#000000";
const GLYPH_COLOR = "#D9A441";
/** Corner radius as a fraction of the tile. 224/1024, kept from the original art. */
const TILE_RADIUS_RATIO = 224 / 1024;

/**
 * How much of the tile the mark's ink box should span.
 *
 * The `any` cut is what a browser tab and an installed home-screen icon show, so
 * the mark should sit as large as it can without looking cropped. 0.86 is the
 * largest value that still keeps 4% of the tile clear on every side — the
 * binding point is the speech-bubble tail, which reaches diagonally towards the
 * tile's rounded bottom-left corner long before the circle gets near an edge.
 * Pushing past ~0.87 leaves the tail with under a pixel of clearance at 32px,
 * where it reads as clipped. (It was 0.63 before this — the mark was floating in
 * a lot of dead space.)
 *
 * `maskable` is deliberately much smaller: Android may mask it to a circle of
 * 80% diameter, so its ink has to stay inside that circle. It will look
 * undersized next to the `any` cut, and that is correct.
 */
const DEFAULT_COVERAGE = {
  any: 0.86,
  maskable: 0.516,
};

/** Optional overrides, so a candidate size can be rendered without shipping it. */
function readArgs(argv) {
  const out = { outDir: OUT_DIR, any: DEFAULT_COVERAGE.any, maskable: DEFAULT_COVERAGE.maskable };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out-dir") out.outDir = resolve(argv[++i]);
    else if (argv[i] === "--any") out.any = Number(argv[++i]);
    else if (argv[i] === "--maskable") out.maskable = Number(argv[++i]);
  }
  return out;
}

const CUTS = [
  { file: "icon.svg", kind: "svg", role: "any" },
  { file: "icon-maskable.svg", kind: "svg", role: "maskable" },
  { file: "favicon-32.png", kind: "png", role: "any", px: 32 },
  { file: "icon-192.png", kind: "png", role: "any", px: 192 },
  { file: "icon-512.png", kind: "png", role: "any", px: 512 },
  { file: "apple-touch-icon.png", kind: "png", role: "any", px: 180 },
  { file: "icon-maskable-512.png", kind: "png", role: "maskable", px: 512 },
];

/** Ask the browser for the ink box of the glyph, stroke included. */
async function measureGlyph(page) {
  const geo = await page.evaluate(({ paths, viewBox }) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${viewBox} ${viewBox}`);
    document.body.appendChild(svg);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const d of paths) {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", d);
      svg.appendChild(p);
      const b = p.getBBox(); // geometry only — stroke is NOT included
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    return { minX, minY, maxX, maxY };
  }, { paths: GLYPH.paths, viewBox: GLYPH.viewBox });
  return geo;
}

/**
 * Build the transform that centres the ink box on the canvas at the requested
 * coverage. Centring on the ink box (not the viewBox) is what keeps the mark
 * optically centred — the glyph does not fill its own 24-unit box.
 */
function buildTransform(geo, coverage) {
  const inkWidth = geo.maxX - geo.minX + GLYPH.strokeWidth;
  const inkHeight = geo.maxY - geo.minY + GLYPH.strokeWidth;
  const target = coverage * CANVAS;
  const scale = Math.min(target / inkWidth, target / inkHeight);
  const midX = (geo.minX + geo.maxX) / 2;
  const midY = (geo.minY + geo.maxY) / 2;
  return {
    scale,
    inkWidth,
    inkHeight,
    transform:
      `translate(${CANVAS / 2} ${CANVAS / 2}) scale(${scale.toFixed(6)}) ` +
      `translate(${(-midX).toFixed(6)} ${(-midY).toFixed(6)})`,
  };
}

function buildSvg(role, transform) {
  const radius = role === "maskable" ? 0 : Math.round(TILE_RADIUS_RATIO * CANVAS);
  const rect = radius
    ? `<rect width="${CANVAS}" height="${CANVAS}" rx="${radius}" fill="${TILE_FILL}" />`
    : `<rect width="${CANVAS}" height="${CANVAS}" fill="${TILE_FILL}" />`;
  const paths = GLYPH.paths.map(d => `    <path d="${d}" />`).join("\n");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" role="img" aria-label="Savanna">`,
    `  ${rect}`,
    `  <g transform="${transform}" fill="none" stroke="${GLYPH_COLOR}" stroke-width="${GLYPH.strokeWidth}" stroke-linecap="round" stroke-linejoin="round">`,
    paths,
    `  </g>`,
    `</svg>`,
    ``,
  ].join("\n");
}

/** Rasterise one SVG at an exact pixel size, keeping the rounded corners transparent. */
async function rasterise(page, svg, px) {
  const sized = svg.replace(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}"`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${CANVAS} ${CANVAS}"`,
  );
  await page.setViewport({ width: px, height: px, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><html><head><style>
       html,body{margin:0;padding:0;background:transparent;overflow:hidden}
       svg{display:block}
     </style></head><body>${sized}</body></html>`,
    { waitUntil: "domcontentloaded" },
  );
  return page.screenshot({
    clip: { x: 0, y: 0, width: px, height: px },
    omitBackground: true,
    type: "png",
  });
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const args = readArgs(process.argv.slice(2));
  mkdirSync(args.outDir, { recursive: true });

  const page = await browser.newPage();
  await page.goto("about:blank");
  const geo = await measureGlyph(page);
  console.log(
    `glyph ink box (${GLYPH.viewBox}-unit space, stroke included): ` +
      `${(geo.maxX - geo.minX + GLYPH.strokeWidth).toFixed(3)} x ` +
      `${(geo.maxY - geo.minY + GLYPH.strokeWidth).toFixed(3)}`,
  );

  const svgByRole = {};
  for (const role of ["any", "maskable"]) {
    const built = buildTransform(geo, args[role]);
    svgByRole[role] = buildSvg(role, built.transform);
    console.log(
      `${role.padEnd(9)} coverage ${args[role]} -> scale ${built.scale.toFixed(4)}, ` +
        `ink ${Math.round(built.inkWidth * built.scale)}px of ${CANVAS}`,
    );
  }

  for (const cut of CUTS) {
    const svg = svgByRole[cut.role];
    const out = resolve(args.outDir, cut.file);
    if (cut.kind === "svg") {
      writeFileSync(out, svg);
      console.log(`wrote ${cut.file}`);
    } else {
      writeFileSync(out, await rasterise(page, svg, cut.px));
      console.log(`wrote ${cut.file} (${cut.px}x${cut.px})`);
    }
  }
} finally {
  await browser.close();
}
