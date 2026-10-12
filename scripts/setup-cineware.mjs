import { mkdir, readFile, writeFile, stat, rm, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const sdkVersion = '22.008';
export const sdkSha256 = '44f3372322161f7062c3f664181758d7e2938929f2257717c54f61d6ff1f3c2b';
export const sdkUrl = 'https://developers.maxon.net/downloads/Cineware_22_008.zip';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function setupCineware() {
  if (process.platform !== 'win32' || process.env.EMBER_CINEWARE_SDK) return;
  const destination = path.join(root, 'target', 'cineware-sdk');
  if (await readFile(path.join(destination, 'sdk.sha256'), 'utf8').catch(() => '') === sdkSha256) return;
  console.log('Preparing external Cineware S22.008 SDK (proprietary; see docs/specs/model-preview.md).');
  await mkdir(path.join(root, 'target'), { recursive: true });
  const archive = path.join(root, 'target', 'Cineware_22_008.zip');
  let bytes = await readFile(archive).catch(() => null);
  if (!bytes || createHash('sha256').update(bytes).digest('hex') !== sdkSha256) {
    const response = await fetch(sdkUrl, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`Cineware download failed: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 128 * 1024 * 1024 || createHash('sha256').update(bytes).digest('hex') !== sdkSha256)
      throw new Error('Cineware SDK checksum mismatch');
    await writeFile(archive, bytes);
  }
  const staging = destination + '.staging-' + process.pid;
  const cacheRoot = path.resolve(root, 'target') + path.sep;
  for (const directory of [destination, staging]) {
    if (!path.resolve(directory).startsWith(cacheRoot)) throw new Error('SDK cache must remain inside the workspace target directory');
  }
  await mkdir(staging, { recursive: true });
  // Extract only headers and the two release libraries; never redistribute SDK examples or docs.
  const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[System.IO.Compression.ZipFile]::OpenRead($env:EMBER_SDK_ARCHIVE); try { foreach($e in $z.Entries) { $n=$e.FullName; if(($n.StartsWith('includes/') -and !$n.Contains('/._')) -or $n -eq 'libraries/win/cinewarelib_2019/cinewarelib_release.lib' -or $n -eq 'libraries/win/jpeglib_2019/jpeglib_release.lib') { if($n.Contains('..') -or $n.Contains(':') -or $n.StartsWith('/')) {throw 'Invalid SDK entry'}; if($n.EndsWith('/')) {continue}; $p=[System.IO.Path]::GetFullPath([System.IO.Path]::Combine($env:EMBER_SDK_STAGING,$n)); if(!$p.StartsWith($env:EMBER_SDK_STAGING+[System.IO.Path]::DirectorySeparatorChar)) {throw 'Invalid SDK path'}; [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($p)) | Out-Null; [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e,$p,$true) } } } finally {$z.Dispose()}`;
  try {
    await new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        windowsHide: true, stdio: 'inherit', env: { ...process.env, EMBER_SDK_ARCHIVE: archive, EMBER_SDK_STAGING: staging },
      });
      child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error('SDK extraction failed')));
    });
    await stat(path.join(staging, 'includes', 'c4d.h'));
    await writeFile(path.join(staging, 'sdk.sha256'), sdkSha256);
    // Only replace this ignored, fixed workspace cache directory.
    await rm(destination, { recursive: true, force: true });
    await rename(staging, destination);
  } finally { await rm(staging, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await setupCineware();
