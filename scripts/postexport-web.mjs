// Runs after `expo export --platform web`:
// - fills %BASE_URL% in dist/index.html and dist/manifest.json
// - copies index.html to 404.html so deep links (/u/<handle>) work on GitHub Pages
// - adds .nojekyll so GitHub Pages serves the `_expo/` folder
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const baseUrl = (process.env.EXPO_BASE_URL ?? '').replace(/\/+$/, '');

for (const file of ['index.html', 'manifest.json']) {
  const path = join(dist, file);
  writeFileSync(path, readFileSync(path, 'utf8').replaceAll('%BASE_URL%', baseUrl));
}
copyFileSync(join(dist, 'index.html'), join(dist, '404.html'));
writeFileSync(join(dist, '.nojekyll'), '');
console.log(`postexport-web: base URL "${baseUrl || '/'}"`);
