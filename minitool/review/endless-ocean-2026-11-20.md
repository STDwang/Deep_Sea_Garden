# 无限海底复刻《雪迹》大雪场机制（2026-11-20）

## 研究结论：滑雪「永远滑不到头」靠什么

深挖 `red_skiing` 源码（`03_course.js`/`04_terrain.js`/`14_trees.js`/`90_render.js`），「无限」是五层解耦叠加，不是单一技巧：

| 层 | 滑雪实现 | 海底复刻 |
|---|---|---|
| 解析世界 | `Course.height(x,z)` 纯函数、无界 | 已有 `height(x,z)`，直接复用 |
| 滚动/分块 | clipmap 环形纹理 + 嵌套网格环，GPU 算世界坐标 | 单块跟随相机的局部网格 + GPU 解析高度（雾重，可见 ~55m，一块 224m 足够）|
| floating origin | 1024m 重定位 | 未做（海底游速慢，float32 在 ±8000m 内精度够；如要真无限需补）|
| 规则散布 | `treeInCell` 格子哈希 + chunk + 视锥打包 | `scatter.update()` 格子哈希 + 动态实例 buffer |
| 雾遮边 | 指数高度雾把远地形融入天空 | `oceanFog` + 水色背景已遮掩生成边界 |

## 改动清单

### 1. GPU 同构高度（20_render.js）
- 新增 `ENDLESS_SSL`：`jsHashU/jsHash2U/jsHash3U/jsHash3/jsVnoise2/jsFbm2/terrainH`，**逐位镜像** CPU `vendor/00_util.js` 的哈希/vnoise/fbm 与 `10_world.js` 的 `height()`。
- 关键：GPU 与 CPU 算出的高度一致，手工摆放的鲸骨/喷口/岩拱/珊瑚才能精准贴地。
- `ENDLESS_VERT`：顶点 = 局部偏移，世界坐标 = 局部 + `M.p.xyz` 锚点，高度现场解析计算；顶点色按坡度/深度/暖紫分区混合。

### 2. 滚动地形网格（10_world.js）
- 删除固定 100×100 地面网格（146×146），改为 `floorPatch()`：140×140 局部网格覆盖 ±112m。
- `drawFloor()` 每帧把锚点吸附到格点（1.6m）跟随相机 → 地形无限延伸，无边界。
- 阴影 pass 用 `floorShadowP`（无 color target），主 pass 用 `floorP`。

### 3. 无限植被散布（10_world.js `scatter` + 20_render.js）
- `CELL=3.2m` 世界格子，`hash2U(ci,cj)` 决定有无草、位置、高度、朝向、颜色、相位——**同格恒定，零存储**。
- 复用 `leaf` mesh + `kelpP` 管线，动态实例 buffer 每帧随相机更新（预分配 1700 实例，零 GC）。
- 规则：中央航道 |x|<3.6 留白、地标区（鲸尾/珊瑚湾）稀疏、暖区/紫区/深水按色带染色。

### 4. 解除移动边界（30_app.js / 14_diver.js）
- `constrain()` 与潜水员 `step()` 的 x/z 硬边界从 [-9,30]×[-44,17] 放宽到 ±8000；y 上限改为相对地面 +22m。玩家可一直向外游。
- 巡航模式仍保留四景点导览路线（功能不变）。

## 验证结果

- 构建 + 自动检查 PASS（120.4 万三角形，20.87MiB）。
- **真实 Chrome WebGPU 与 WebGL2 均编译通过、零运行时错误**。
- 越界截图：相机飞到 (-140,-160)、(+130,-130) 等远超原边界处，地形连绵无断崖/空白/接缝，散散步持续生成、被水雾自然淡出。
- 核心区截图：手工高海草 + 动态矮草丛层次协调；光柱/焦散/阴影/色彩无回退。
- 存档：`endless-core/farwest/extreme/webgl2.png`。

## 踩坑（真机验证抓到，静态检查抓不到）

1. WebGPU：有 color target 的 `floorP` 不能画进只有 depth 的阴影 pass → 拆成 `drawFloor`/`drawFloorShadow`。
2. WebGL2：SSL 转换器要求 `let` 带显式类型（WGSL 可推断），`jsVnoise2` 里所有 `let` 补 `:f32`。
3. `world.scatter` 必须挂到 build 返回值（不是 GardenWorld 顶层）。
4. WebGPU `g.buffer()` 要传数组而非字节数。
5. 散布颜色 bug：`h1>>>16` 是 16 位值，除以 255 得到 0~257 的蓝通道 → 蓝色碎片；应 `&0xff` 再除 255。

## 已知不足 / 下一步

1. **未做 floating origin**：坐标超过约 ±1e5 后 float32 精度会退化；±8000m 内无问题。若要真·无限需移植滑雪的 1024m rebase。
2. 单块 224m 网格无 LOD/分块，雾外地形靠雾遮掩；若雾变淡会看到网格边缘。滑雪用 8 级 clipmap 覆盖 16km。
3. 散布目前只有海草一种；滑雪是 5 种树形 + 三级 LOD。可补珊瑚/礁石原型增加远景层次。
4. 只做了桌面浏览器验收，小红书模拟器/Android/iOS 真机未测。
