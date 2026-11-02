import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

await mkdir(new URL('../assets/', import.meta.url), { recursive: true });
await build({
  absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
  entryPoints: { 'vio-ui': 'ui/main.jsx', 'vio-pdf': 'reports/pdf.js' },
  outdir: 'assets',
  entryNames: '[name]',
  chunkNames: 'chunks/[name]-[hash]',
  bundle: true,
  splitting: true,
  format: 'esm',
  jsx: 'automatic',
  target: ['es2022'],
  minify: true,
  legalComments: 'eof',
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: '// Vio presentation islands. OrbitImages component by Dominik Koch: https://x.com/dominikkoch' },
  logLevel: 'info'
});
