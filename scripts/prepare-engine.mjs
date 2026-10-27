import { readFile, copyFile, mkdir, writeFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const source = new URL('../node_modules/stockfish/', import.meta.url);
const target = new URL('../public/stockfish/', import.meta.url);
const vendor = new URL('../vendor/stockfish/', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', source), 'utf8'));
const provenance = JSON.parse(await readFile(new URL('SOURCE.json', vendor), 'utf8'));
if (pkg.version !== provenance.version) throw new Error('Review the engine source and integration before changing Stockfish version.');
const sha256 = data => createHash('sha256').update(data).digest('hex');
const archive = new URL(provenance.archive, vendor);
if (sha256(await readFile(archive)) !== provenance.sha256) throw new Error('Stockfish source archive is missing or corrupt. Release stopped.');
await mkdir(new URL('source/', target), { recursive: true });
for (const [name, expected] of Object.entries(provenance.engineFiles)) {
  const input = new URL(`src/${name}`, source);
  if (sha256(await readFile(input)) !== expected) throw new Error(`Engine file does not match the source release: ${name}`);
  await copyFile(input, new URL(name, target));
}
await copyFile(archive, new URL(`source/${provenance.download}`, target));
// Older preview builds served .gz as an HTTP encoding. Remove only that generated copy.
await unlink(new URL(`source/${provenance.archive}`, target)).catch(error => { if (error.code !== 'ENOENT') throw error; });
await copyFile(new URL('Copying.txt', source), new URL('COPYING.txt', target));
await copyFile(new URL('AUTHORS', source), new URL('AUTHORS', target));
await writeFile(new URL('PROVENANCE.json', target), JSON.stringify({ package: pkg.name, version: pkg.version,
  files: provenance.engineFiles, source: { commit: provenance.commit, url: provenance.url,
    archive: `source/${provenance.download}`, sha256: provenance.sha256 } }, null, 2) + '\n');
