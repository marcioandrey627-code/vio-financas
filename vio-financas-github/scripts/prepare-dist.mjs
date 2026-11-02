import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of [
  'index.html', 'app.js', 'config.js', 'finance-core.js',
  'reports-ui.js', 'visual.css', 'v2.css', 'favicon.svg'
]) {
  await cp(join(root, file), join(dist, file));
}
await cp(join(root, 'assets'), join(dist, 'assets'), { recursive: true });
console.log('Arquivos de produção preparados em dist/.');
