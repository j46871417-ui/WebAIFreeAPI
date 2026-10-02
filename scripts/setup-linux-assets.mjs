import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const linuxDir = path.join(root, "linux");
const assetsDir = path.join(linuxDir, "assets");
const hicolorBase = path.join(assetsDir, "icons", "hicolor");

fs.mkdirSync(assetsDir, { recursive: true });

// 1. Copy SVG icon
const srcSvg = path.join(root, "plugin-for-vscode", "media", "icon.svg");
const dstSvg = path.join(assetsDir, "ai-free.svg");
fs.copyFileSync(srcSvg, dstSvg);
console.log(`Copied SVG: ${srcSvg} -> ${dstSvg}`);

// Copy scalable icon to hicolor scalable/apps/
const scalableDir = path.join(hicolorBase, "scalable", "apps");
fs.mkdirSync(scalableDir, { recursive: true });
fs.copyFileSync(srcSvg, path.join(scalableDir, "ai-free.svg"));

// 2. Extract PNGs from ai-free.ico
const icoPath = path.join(root, "ai-free.ico");
if (fs.existsSync(icoPath)) {
  const icoBuffer = fs.readFileSync(icoPath);
  const count = icoBuffer.readUInt16LE(4);

  for (let i = 0; i < count; i += 1) {
    const w = icoBuffer[6 + i * 16] || 256;
    const h = icoBuffer[7 + i * 16] || 256;
    const size = icoBuffer.readUInt32LE(6 + i * 16 + 8);
    const offset = icoBuffer.readUInt32LE(6 + i * 16 + 12);
    const pngData = icoBuffer.subarray(offset, offset + size);

    // Verify PNG header
    if (pngData.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
      const sizeStr = `${w}x${h}`;

      // In hicolor
      const hicolorDir = path.join(hicolorBase, sizeStr, "apps");
      fs.mkdirSync(hicolorDir, { recursive: true });
      const hicolorDst = path.join(hicolorDir, "ai-free.png");
      fs.writeFileSync(hicolorDst, pngData);

      // In linux/assets/
      const directDst = path.join(assetsDir, `ai-free-${sizeStr}.png`);
      fs.writeFileSync(directDst, pngData);

      if (w === 256) {
        fs.writeFileSync(path.join(assetsDir, "ai-free.png"), pngData);
      }

      console.log(`Extracted PNG: ${sizeStr} (${pngData.length} bytes)`);
    }
  }
}

console.log("Assets setup completed successfully.");
