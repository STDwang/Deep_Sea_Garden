# Abyssal Garden — 私有归档

一个纯 WebGPU 生成的海底世界：摇曳的海草森林、体积光、沉船与蝠鲼。所有地形、水体与生态都由代码生成，没有图片、模型或音频文件；最终产物是单个 `index.html`。

> **来源**：本项目基于 [Noniv/abyssal-garden](https://github.com/Noniv/abyssal-garden)（MIT，© 2026 Maksymilian Dendra）。详见 [ATTRIBUTION.md](./ATTRIBUTION.md)。

## 内容

- `index.html` — 已构建的单文件版本，可直接用现代桌面浏览器（推荐 Chrome）打开
- `source/` — 源码与 esbuild 构建脚本
  - `src/quality.js` · `math.js` · `shaders.js` · `world.js` · `main.js` · `audio.js`
  - `template.html` — 页面结构与样式模板
  - `build.mjs` — 打包为根目录 `index.html`

## 本地构建

```bash
cd source
npm install
npm run build          # 压缩版 → ../index.html
npm run build:readable # 可读版 → ../index.html
npm run build:dev      # 调试版 → ../dev.html（含快捷键 F / B）
```

## 操作

| 输入 | 行为 |
| --- | --- |
| WASD | 游动 |
| Q / E | 下潜 / 上浮 |
| Shift | 加速 |
| 1–6 | 切换视角 |
| Esc | 菜单 |
| M | 静音 |
| H | 性能统计 |

触屏：按住前进，滑动转向，第二根手指加速。竖屏时页面会自动旋转为横屏。

## 关于小红书小工具

不能在当前技术栈上直接适配。小红书小工具容器官方仅支持 Canvas 2D / WebGL / WebGL2，不提供 WebGPU；本项目的地形雕刻、洞穴查询与生态分布依赖 WGSL compute shader，WebGL2 也没有 compute，需要整体重写渲染层。次要问题包括：必须把内联脚本外置、ES2022 降到 Chrome 61 基线、禁用 eval/WASM/网络请求、指针锁定与全屏不可用。体积（97 KB）与离线要求则完全满足。

若只是想获得小红书流量，优先选择录屏笔记导流至个人站点；或另起一个同主题的轻量 Canvas 2D 小工具，而不是移植本作。
