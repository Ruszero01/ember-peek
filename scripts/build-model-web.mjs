import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function buildModelWeb() {
  const vendor = path.join(root, 'plugins', 'model', 'ui', 'vendor');
  await mkdir(vendor, { recursive: true });
  const result = await build({absWorkingDir:root,entryPoints:[path.join(root,'plugins','model','web-bundle.mjs')],bundle:true,format:'esm',minify:true,target:'es2022',write:false,legalComments:'eof'});
  const worker = await build({absWorkingDir:root,entryPoints:[path.join(root,'plugins','model','csg-worker.mjs')],bundle:true,format:'iife',minify:true,target:'es2022',write:false,legalComments:'eof'});
  for (const [name, bytes] of [['model.js', result.outputFiles[0].contents], ['csg-worker.js', worker.outputFiles[0].contents], ['CSG-LICENSE.txt', await readFile(path.join(root,'node_modules','three-bvh-csg','LICENSE'))], ['BVH-LICENSE.txt', await readFile(path.join(root,'node_modules','three-mesh-bvh','LICENSE'))], ['THREE-LICENSE.txt', await readFile(path.join(root,'node_modules','three','LICENSE'))]]) {
    const destination = path.join(vendor,name);
    const previous = await readFile(destination).catch(() => null);
    if (!previous || !previous.equals(Buffer.from(bytes))) await writeFile(destination,bytes);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await buildModelWeb();
