import fs from 'node:fs';
import path from 'node:path';

export function materializeShared(root) {
  const target = path.join(root, 'plugin-for-vscode');
  const files = JSON.parse(fs.readFileSync(path.join(target, 'shared-files.json'), 'utf8'));
  if (!Array.isArray(files) || new Set(files).size !== files.length) throw new Error('Invalid shared source manifest');
  for (const relative of files) {
    if (typeof relative !== 'string' || !/^(src|api)\//.test(relative) || relative.split('/').some(part => part === '..' || !part) || relative.includes('\\')) {
      throw new Error('Invalid shared source path');
    }
    const from = path.join(root, relative), to = path.join(target, relative);
    if (!fs.statSync(from).isFile()) throw new Error(`Missing shared source: ${relative}`);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  return files.length;
}
