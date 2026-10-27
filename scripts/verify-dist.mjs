import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, dirname, isAbsolute, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = data => createHash('sha256').update(data).digest('hex');
export async function verifyDist(directory = join(root, 'dist')) {
  const required = ['index.html', '.htaccess', 'THIRD_PARTY_NOTICES.txt', 'stockfish/COPYING.txt',
    'stockfish/AUTHORS', 'stockfish/PROVENANCE.json', 'stockfish/source/README.txt'];
  for (const path of required) {
    if (!(await stat(join(directory, path)).catch(() => null))?.isFile()) throw new Error(`Missing release file: ${path}`);
  }
  const source = JSON.parse(await readFile(join(root, 'vendor/stockfish/SOURCE.json'), 'utf8'));
  const provenance = JSON.parse(await readFile(join(directory, 'stockfish/PROVENANCE.json'), 'utf8'));
  if (provenance.version !== source.version || provenance.source.commit !== source.commit || provenance.source.sha256 !== source.sha256) throw new Error('Engine source provenance is inconsistent.');
  for (const [name, hash] of Object.entries(source.engineFiles)) {
    if (sha256(await readFile(join(directory, 'stockfish', name))) !== hash) throw new Error(`Engine checksum mismatch: ${name}`);
  }
  if (sha256(await readFile(join(directory, 'stockfish/source', source.download))) !== source.sha256) throw new Error('Source archive checksum mismatch.');
  const index = await readFile(join(directory, 'index.html'), 'utf8');
  if (/https?:\/\/(localhost|127\.0\.0\.1)/.test(index)) throw new Error('Release HTML points at a local development server.');
  for (const match of index.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const url = match[1];
    if (/^(https?:|data:|#)/.test(url)) continue;
    if (isAbsolute(url) || !url.startsWith('./')) throw new Error(`Asset URL must be relative for subdirectory hosting: ${url}`);
    if (!(await stat(join(directory, url)).catch(() => null))?.isFile()) throw new Error(`Missing HTML asset: ${url}`);
  }
  const files = [];
  async function walk(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Release files must not be symlinks.');
      if (entry.isDirectory()) await walk(path);
      else {
        const data = await readFile(path);
        files.push({ path: relative(directory, path).replaceAll('\\', '/'), bytes: data.length, sha256: sha256(data) });
      }
    }
  }
  await walk(directory);
  return { sourceCommit: source.commit, files: files.sort((a, b) => a.path.localeCompare(b.path)),
    bytes: files.reduce((sum, file) => sum + file.bytes, 0) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await verifyDist(process.argv[2] ? resolve(process.argv[2]) : undefined);
  console.log(`Verified ${result.files.length} static files, ${(result.bytes / 1024 / 1024).toFixed(1)} MiB, Stockfish source ${result.sourceCommit}.`);
}
