// Builds the offline Xiaohongshu edition from the original renderer.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { transformSync } from 'esbuild';

const root = new URL('../', import.meta.url);
const output = new URL('.tmp/xhs-garden/', root);
const previewOutput = new URL('xhs-preview.html', root);
const read = path => readFile(new URL(path, root), 'utf8');
const source = name => read('source/src/' + name + '.js');
const [quality, math, shaders, human, humanMesh, diver, world, journal, main, audio, template, license, shell, style, platform, journalStorage] = await Promise.all([
  ...['quality', 'math', 'shaders', 'human', 'human-mesh', 'diver', 'world', 'journal', 'main', 'audio'].map(source),
  read('source/template.html'), read('LICENSE'), read('source/xhs/shell.html'), read('source/xhs/style.css'), read('source/xhs/platform.js'),
  read('source/xhs/journal-storage.js')
]);
function swap(source, pattern, text) {
  if (!pattern.test(source)) throw new Error('Original source changed: ' + pattern);
  return source.replace(pattern, text);
}

const settings = swap(quality, /const keep = .*?(?=const THIN)/s,
  'const keep = () => {}; const SV = []; const LV = 2;\n');
// 小工具内没有 pointer lock：按住鼠标/手指拖动控制视角，与触摸摇杆一致
let runtime = main;
runtime = swap(runtime, /const rot = matchMedia\('[^']+'\);/, "const rot = matchMedia('(orientation: portrait)');");
runtime = swap(runtime, /  \/\/ phones: go fullscreen[^\n]*\n  if \(mob\)[^\n]*/s, '');
runtime = swap(runtime, /bDive\.onclick = go; \$\('o'\)\.onclick = \(\) => ui\(true\);/,
  "bDive.addEventListener('click', go); $('o').addEventListener('click', () => ui(true));");
runtime = swap(runtime, /\$\('q'\)\.querySelectorAll[^\n]+\n/, '');
runtime = swap(runtime, /const PIXMAX = 2560 \* 1440/, 'let PIXMAX = 410000');
runtime = swap(runtime, /PIXMIN = mob \? 25e4 : 5e5/, 'PIXMIN = 250000');
runtime = swap(runtime, /此场景需要 WebGPU[^。]+。/, '当前小红书容器无法启动 WebGPU 场景。');
let html = swap(template, /<script>\s*\/\*SCRIPT\*\/\s*<\/script>/, '<script src="./app.js" defer></script>');
html = html.replace('(orientation: portrait) and (pointer: coarse)', '(orientation: portrait)')
  .replace('width: 100dvh; height: 100dvw;', 'width: 100vh; height: 100vw; width: 100dvh; height: 100dvw;');
html = swap(html, /<div id=m>[^]*?(?=<pre id=i>)/, shell.trimStart());
html = html.replace('</head>', '<link rel="stylesheet" href="./style.css"></head>');
const safeAudio = swap(audio, /function sound\(\) \{/, 'function sound() {\n  try { startSound(); } catch (error) { console.warn("Audio unavailable", error); }\n}\nfunction startSound() {');
const body = [settings, math, shaders, human, humanMesh, diver, world, journal, journalStorage, runtime, safeAudio, platform].join('\n');
const js = transformSync(`(async()=>{${body}\n})().catch(error=>{
  console.error(error); document.body.className='l e'; document.getElementById('s').textContent=error.message;
});`, { target: ['chrome61', 'es2017'], minify: true, charset: 'utf8' }).code;
if (/requestFullscreen|requestPointerLock|screen\.orientation|localStorage|window\.open|\.(?:fetch|eval)\s*\(/.test(js)) {
  throw new Error('Unexpected unsupported API in Xiaohongshu build');
}
await mkdir(output, { recursive: true });
await writeFile(new URL('index.html', output), html);
const app = '/*!\n' + license + '\n' + await read('source/src/HUMAN-LICENSE') + '\n*/\n' + js;
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
