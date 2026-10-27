import { mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { verifyDist } from './verify-dist.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist'), output = join(root, 'release');
const verified = await verifyDist(dist);
await mkdir(output, { recursive: true });
const temporary = join(output, `chesslab-${randomUUID()}.zip`);
const archive = join(output, 'chesslab-hostinger.zip');
// Start with a new archive every time, so obsolete hashed assets cannot linger.
const result = spawnSync('zip', ['-0', '-q', '-r', temporary, ...await readdir(dist)], { cwd: dist, encoding: 'utf8' });
if (result.error || result.status !== 0) throw new Error(`ZIP packaging failed. Install the zip command and retry. ${result.error?.message ?? result.stderr}`);
const listing = spawnSync('unzip', ['-Z', '-1', temporary], { encoding: 'utf8' });
if (listing.status !== 0) throw new Error('Could not verify the upload ZIP.');
const archived = listing.stdout.split('\n').filter(name => name && !name.endsWith('/')).sort();
const expected = verified.files.map(file => file.path).sort();
if (JSON.stringify(archived) !== JSON.stringify(expected)) throw new Error('Upload ZIP does not match the verified build.');
await rename(temporary, archive);
const archiveSha256 = createHash('sha256').update(await readFile(archive)).digest('hex');
await writeFile(join(output, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), archive: 'chesslab-hostinger.zip', archiveSha256, ...verified }, null, 2) + '\n');
await writeFile(join(output, 'UPLOAD.txt'), `ChessLab static upload\n\nExtract chesslab-hostinger.zip into the selected Hostinger website directory.\nindex.html must sit directly in public_html/ (or the chosen subdirectory),\nwith assets/, stockfish/, .htaccess and THIRD_PARTY_NOTICES.txt beside it.\nDo not wrap these files in an extra dist/ folder.\n\nNo domain has been configured and nothing has been published by this command.\nNo Node server, database credentials, or build tools are needed on Hostinger.\nThe source archive is included for Stockfish redistribution; keep it in place.\nSee docs/DEPLOYMENT.md in the project for verification and rollback steps.\n\nArchive SHA-256: ${archiveSha256}\n`);
console.log(`Upload package: ${archive}\nVerified ${expected.length} files. SHA-256: ${archiveSha256}`);
