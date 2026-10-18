import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'webview2-sdk');
const required = 'lib/net45/Microsoft.Web.WebView2.Core.dll';
if (fs.existsSync(path.join(outDir, required))) {
  console.log('WebView2 SDK is ready.');
} else {
  if (process.platform !== 'win32') throw new Error('The Windows desktop build requires Windows.');
  const version = '1.0.2151.40';
  const expected = '64091274371a98a7b815dccd31363632f8ecbb08977b9f9119542932733e87e7';
  const url = `https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/${version}/microsoft.web.webview2.${version}.nupkg`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`WebView2 download failed: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (crypto.createHash('sha256').update(data).digest('hex') !== expected) throw new Error('WebView2 SHA-256 mismatch');
  const archive = path.join(root, 'webview2.zip');
  const stage = path.join(root, 'webview2-sdk-stage');
  if (fs.existsSync(stage)) throw new Error('Move the stale webview2-sdk-stage folder aside before retrying.');
  fs.writeFileSync(archive, data);
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:DAGAMI_WEBVIEW_ARCHIVE -DestinationPath $env:DAGAMI_WEBVIEW_STAGE -ErrorAction Stop'], {
      stdio: 'inherit', windowsHide: true,
      env: { ...process.env, DAGAMI_WEBVIEW_ARCHIVE: archive, DAGAMI_WEBVIEW_STAGE: stage },
    });
    if (!fs.existsSync(path.join(stage, required))) throw new Error('WebView2 package is incomplete');
    if (fs.existsSync(outDir)) throw new Error('The existing WebView2 SDK is incomplete; move it aside and retry.');
    fs.renameSync(stage, outDir);
    console.log(`WebView2 ${version} downloaded and SHA-256 verified.`);
  } finally {
    fs.unlinkSync(archive);
  }
}
