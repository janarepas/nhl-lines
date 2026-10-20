// Reproducible, checked-in production assets; Cloudflare needs no runtime build.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "..");
const check = process.argv.includes("--check");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const modules = [
  "stats",
  "games",
  "published-lines",
  "penalty-kill",
  "injuries",
  "motion",
  "player-cache",
  "profile-stats",
  "dom",
  "app",
];
const script = esbuild.transformSync(
  modules.map((name) => read(`static/${name}.js`)).join("\n;\n"),
  { minify: true, target: "es2020", legalComments: "none", charset: "utf8" },
).code;
const stylesheetResult = esbuild.transformSync(read("static/style.css"), {
  loader: "css",
  minify: true,
  target: "es2020",
  legalComments: "none",
  charset: "utf8",
});
const css = { styles: stylesheetResult.code };
const directory = path.join(root, "static/assets");
if (!check) fs.mkdirSync(directory, { recursive: true });
const asset = (extension, content) => {
  const hash = crypto
    .createHash("sha256")
    .update(content)
    .digest("hex")
    .slice(0, 12);
  const name = `site-${hash}.${extension}`;
  if (check) {
    if (
      !fs.existsSync(path.join(directory, name)) ||
      fs.readFileSync(path.join(directory, name), "utf8") !== content
    )
      throw Error("Production assets are stale. Run npm run build.");
  } else fs.writeFileSync(path.join(directory, name), content);
  return `/assets/${name}`;
};
const stylesheet = asset("css", css.styles);
const javascript = asset("js", script);
const html = read("src/index.html")
  .replace(
    "<!-- BUILD_STYLES -->",
    `<link rel="stylesheet" href="${stylesheet}" />`,
  )
  .replace(
    "<!-- BUILD_SCRIPT -->",
    `<script defer src="${javascript}"></script>`,
  );
if (check) {
  if (read("static/index.html") !== html)
    throw Error("Production HTML is stale. Run npm run build.");
} else fs.writeFileSync(path.join(root, "static/index.html"), html);
for (const name of fs.readdirSync(directory))
  if (
    /^site-[a-f0-9]{12}\.(css|js)$/.test(name) &&
    ![stylesheet, javascript].includes(`/assets/${name}`)
  )
    if (check) throw Error("Obsolete production asset. Run npm run build.");
    else fs.unlinkSync(path.join(directory, name));
console.log(
  `Production CSS ${Buffer.byteLength(css.styles)} bytes; JS ${Buffer.byteLength(script)} bytes.`,
);
