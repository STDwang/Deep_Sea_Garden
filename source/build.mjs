// Builds the Xiaohongshu package and a browser preview from the same assets.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { transformSync } from 'esbuild';

const root = new URL('../', import.meta.url);
const output = new URL('.tmp/xhs-garden/', root);
const previewOutput = new URL('xhs-preview.html', root);
const read = path => readFile(new URL(path, root), 'utf8');
const sources = [
  'src/quality.js', 'src/math.js', 'src/outer.js', 'src/shaders.js', 'src/human.js', 'src/human-mesh.js',
  'src/diver.js', 'src/world.js', 'src/photo.js', 'src/journal.js', 'xhs/journal-storage.js',
  'src/touch.js', 'src/hud.js', 'src/main.js', 'src/audio.js', 'xhs/platform.js',
];
const [html, style, license, humanLicense, ...scripts] = await Promise.all([
  read('source/xhs/index.html'), read('source/xhs/style.css'),
  read('LICENSE'), read('source/src/HUMAN-LICENSE'),
  ...sources.map(file => read('source/' + file)),
]);
const body = scripts.join('\n');
const js = transformSync(`(async()=>{${body}\n})().catch(error=>{
  console.error(error); document.body.className='l e'; document.getElementById('s').textContent=error.message;
});`, { target: ['chrome61', 'es2017'], minify: true, charset: 'utf8' }).code;
if (/requestFullscreen|requestPointerLock|screen\.orientation|localStorage|window\.open|\.(?:fetch|eval)\s*\(/.test(js)) {
  throw new Error('Unexpected unsupported API in Xiaohongshu build');
}
await mkdir(output, { recursive: true });
await writeFile(new URL('index.html', output), html);
const app = '/*!\n' + license + '\n' + humanLicense + '\n*/\n' + js;
await writeFile(new URL('app.js', output), app);
await writeFile(new URL('style.css', output), style);
// The browser preview uses the same assets without requiring a server or extraction.
// The upload package above keeps its external CSS and JavaScript for container CSP.
const preview = html
  .replace('<title>深海潜水员</title>', '<title>深海潜水员 · 小红书小工具预览</title>')
  .replace('<link rel="stylesheet" href="./style.css">', () => `<style>${style}</style>`)
  .replace('<script src="./app.js" defer></script>', () => `<script>${app.replace(/<\/script/gi, '<\\/script')}</script>`);
await writeFile(previewOutput, preview);
console.log('Xiaohongshu build:', Buffer.byteLength(html), 'HTML bytes and', Buffer.byteLength(js), 'script bytes.');
console.log('Browser preview: xhs-preview.html');
