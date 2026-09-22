import imports from "lucide-react/dynamicIconImports.mjs";
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const target = fileURLToPath(new URL("../sdk/web/icons.json", import.meta.url));
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
const icons = {};
for (const name of Object.keys(imports).sort()) {
  if (!/^[a-z0-9-]{1,40}$/.test(name)) throw new Error(`Icon name exceeds protocol: ${name}`);
  const { __iconNode } = await imports[name]();
  icons[name] = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + __iconNode.map(([tag, attributes]) => {
    if (!["circle","ellipse","g","line","path","polygon","polyline","rect"].includes(tag)) throw new Error(`Unsupported SVG tag: ${tag}`);
    return `<${tag} ${Object.entries(attributes).filter(([key]) => key !== "key").map(([key,value]) => {
      if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(key) || key.toLowerCase().startsWith("on") || /href/i.test(key)) throw new Error(`Unsafe attribute ${key}`);
      return `${key}="${escape(value)}"`;
    }).join(" ")}/>`;
  }).join("") + '</svg>';
}
const contents = JSON.stringify(icons) + "\n";
if (process.argv.includes("--check")) {
  if (await readFile(target, "utf8") !== contents) throw new Error("Icon catalog is stale: run npm run icons:generate");
} else await writeFile(target, contents);
console.log(`Lucide: ${Object.keys(icons).length} offline icons`);
