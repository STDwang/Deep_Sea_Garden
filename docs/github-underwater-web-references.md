# GitHub 同技术路线海底网页游戏调研（小红书小工具过滤版）

> 查询时间：2026-11-20；数据源：GitHub Search API（按 star 排序）。
> "同技术路线"定义为：**浏览器单页 / 原生 WebGPU 或 WebGL2 / 纯代码程序化生成 / 无商业引擎 / 零外部素材（无贴图、模型、音频文件）**。
> 本项目即 `Noniv/abyssal-garden` 的衍生线，原版 2561★ 也是这条路线在 GitHub 上的 star 天花板。
>
> **本文档已按小红书小工具的硬约束重新过滤**。过滤结果见下方第一部分；未过滤的全量调研清单保留在文末附录。

---

## 小红书小工具过滤结果（先看这里）

### 1. 硬限制清单

依据：当前 `source/build-xhs.mjs` 的构建期检测、`docs/original-abyssal-garden-xhs-study.md` 的移植验证记录、README 的小工具说明。

| 限制 | 证据 | 对参考项目的筛选含义 |
|---|---|---|
| 产物只能是 `index.html` / `app.js` / `style.css`，三文件平铺 ZIP 根目录 | 构建脚本只写这三个文件；当前包约 47 KB | 需要额外 wasm、纹理、模型、音频文件的一律淘汰；资源必须内联或纯代码生成 |
| 构建期禁用 `requestFullscreen` / `requestPointerLock` / `screen.orientation` / `localStorage` / `window.open` / `fetch` / `eval` | 构建脚本正则命中即抛错 | 依赖指针锁定、全屏、浏览器本地存储、运行时网络请求的项目全部改造或淘汰 |
| 脚本须能转译到 ES2017 / Chrome 61 | esbuild `target` 配置 | 依赖很新语法或新 API 的项目不可用 |
| **WebGPU 未被平台公开承诺**；官方基线只到 WebGL / WebGL2；最低 iOS 18.4 | 移植验证文档：Safari 与桌面模拟器结果不能作为宿主覆盖承诺 | WebGPU-only 项目只能当论文读，不能当代码源；优先选 WebGL2 实现，或从 WGSL 里摘公式移植 |
| 像素预算上限约 410k、下限约 250k；4 GB 内存机型从低档起步 | 构建脚本 `PIXMAX = 410000` / `PIXMIN = 250000` | 多 pass 后处理、大 MSAA、大纹理、大状态 buffer 直接淘汰 |
| 音频需用户手势触发，且平台可能不可用 | 构建脚本给 `sound()` 包了 try/catch | 依赖 Web Audio 精确时序的项目要降级 |
| 竖屏容器内 CSS 旋转横置，需按 `getWindowInfo` 安全区避让原生菜单 | 移植验证文档 | 全屏沉浸式 UI 要重做 |
| 排行榜需头像昵称授权，AI 报告需单独平台权限 | README | 相关玩法要预留授权申请，核心体验不能依赖它们 |

**核心矛盾：star 越高，工程通常越大，越塞不进小工具。** 过滤后不存在"整个项目直接搬进来"的高星候选，只有"摘取单个公式/机制"这一种用法。

### 2. 🟢 可摘取代码或公式（同源 MIT / 纯代码 / 能压进三文件）

| 项目 | Star | 摘什么 | 不摘什么 |
|---|---|---|---|
| `Noniv/web-ocean` | 1070 | LEAN 斜率 mip 与各向异性 sun glitter、泡沫随风向漂移衰减公式、URL 参数化调参思路、单文件 build 脚本 | 六层级联 FFT、17 级 CDLOD、大气 LUT、bloom（手机撑不住）；且 WebGPU-only，只能移植公式 |
| `Humpalumps/Ultra-Water` | 682 | Evan Wallace 面积比焦散（降采样）、marine snow 粒子、Snell 窗折射方向与全内反射判定、简化浮力公式、**色彩预设含紫色** | 半分辨率平面反射、24 步体积光、240 Hz 物理、4× MSAA；整套 three.js 管线不搬。优势是 WebGL2，属平台承诺后端 |
| `Noniv/snowflow_demo` | 622 | clipmap 顶点只存 `(gridIndex, ringLevel)`、世界坐标由 shader 算；toroidal 状态 buffer 思路（**降到 256²/512²**）；程序化骨骼表格 + 脚掌落地写死 | 原尺寸 4096² 高度图 / 2048² ping-pong buffer、三级 PCSS 阴影；Babylon 依赖不搬 |
| `Token-Gremlin/natural-disasters` | 305 | 可触发事件的状态机、电影巡游 / 自由沙盒双模式、运行时自适应画质 | TAA、景深、运动模糊、体积云、全套后处理；约 400 KB shader 全搬必爆 |

### 3. 🟡 机制可用，逻辑层重写（只搬玩法，不搬渲染）

| 项目 | Star | 在小工具里变成什么 |
|---|---|---|
| `triple6xseven/Akvarium` | 1 | 隐藏金币收集 → 用容器 Storage 记数，纯逻辑零渲染开销 |
| `tanuu5/aqua-blue` | 0 | 拍照 + 记忆碎片 → 改成"发现生物图鉴 + 走平台分享 API" |
| `DrTsunamy/Blue-run` | 3 | 只借鉴目标引导与节奏，不搬跑酷关卡 |
| `forbiddenlink/ocean-simulator` | 1 | 食物链涌现 → 轻量状态机即可 |
| `CircuitGhost/neuralaquarium` | 3 | 发光生物 AI → 简化成规则驱动 |
| `reed-soul/SeedOcean` | 11 | 10 种海况的参数表可直接抄（数据量小） |
| `Strezia/ocean-shallows` | 3 | 蝠鲼 / 水母的顶点动画公式可摘 |
| `hughsk/boids` | 229 | **仅在要做捕食交互时引入**；现有程序化鱼群更省，别无脑替换 |

### 4. 🔴 不适用（直接淘汰）

- **WebGPU-only 且无 WebGL2 fallback 的完整项目**：`Noniv/web-ocean`（作为代码源）、`matsuoka-601/WebGPU-Ocean`、`daforce1984/deepsea`、`wass08/under-the-sea`、`estebanrfp/webgpu-world`
- **重库 / 重后端 / 需联网**：`Nautilus`（Django + Channels + WebSocket）、需要多文件 bundle 的 three.js / R3F / Babylon 完整工程
- **依赖被禁 API**：运行时 `fetch` / CDN 素材、`requestPointerLock`、`requestFullscreen`、`localStorage`
- **大纹理 / 大 buffer 方案**：原版 512×80×512 float32 密度场（80 MiB）、4096² 高度图
- **全套重后处理管线**：`natural-disasters` 完整渲染、`Ultra-Water` 完整渲染
- **非浏览器原生栈**：Unity / Godot / Flutter / Python / C# 项目（`pax-britannica` 100★、`Blue-Abyss` 等）

### 5. 过滤后的落地优先级（针对小工具）

1. **色彩分区 + 海洋雪 + Snell 窗**：纯 shader 改动，零新增文件，视觉提升最大
2. **容器 Storage 驱动的收集 / 图鉴**：Akvarium 与 aqua-blue 的机制，纯逻辑
3. **轻量持久沙地痕迹**：snowflow 思路，状态 buffer 降到 256²
4. **可触发环境事件状态机**：natural-disasters 机制，复用现有 shader
5. **环境参数面板**：web-ocean 的参数化思路，落到容器内 UI

---

## 海底生物专题（海龟 / 多品种海鱼 / 鱼群）

同样按小工具限制过滤。这一轮结论比上一轮乐观：**生物这一块有真正零素材、能摘代码的项目**，而且有一个中文项目几乎就是按你需要的形态做的。

### 🏆 最对口：`cjhgit/aquarium-threejs`「未来水族馆 · STILLWATER」— 0★
https://github.com/cjhgit/aquarium-threejs

**全程序化生成 14 种居民，零外部素材，WebGL + Three.js r160，中文文档。** star 为 0 但代码与文档质量远超星数。

- **海龟**：按 WWF 绿海龟实拍重做。低拱椭圆背甲由 5 块中央盾片 + 两侧各 4 块肋盾 + 一圈缘盾组成，24 向 × 6 圈低多边形，8 段鳍肢，闭合喙、嵌入式眼睛；左右前鳍同步下压、每轮约 4.6 秒，鳍尖柔性弯曲，划水与滑翔交替，后鳍掌舵，转弯时身体内倾；小鱼把海龟当实体障碍绕开
- **鱼类**：7 种原创固定设计（琥珀扇尾、青瓷帆鳍、月纱神仙、霞金绸尾、碧潮燕尾、星河灯鱼、蓝礁巡游鲨），体态/配色/纹样/鳍型由一份设计决定，不随机混搭；连续脊柱曲线驱动，头稳、躯干尾部随转向和游速弯曲，GPU 顶点变形，法线随脊柱转动
- **行为**：按鱼种活跃度交替巡游/滑行/停留/短冲刺；灯鱼只跟随**可见邻近同类**，不向全局中心聚拢；小鱼按鲨鱼体长和预判路径提前避让；投喂争食（每鱼每轮最多 2 颗、吃完休息 2.5 秒）；日常啄草觅食；鲨鱼偶尔追玩 5–7 秒
- **其他居民**：2 青蟹（三段关节步足、足尖世界坐标锁定、至少四脚支撑）、3 扇贝、2 海星、2 水母（危险度最高，鱼群提前远离）、1 橄榄海龟
- **图鉴**：14 种居民，可切换鱼种、拖动旋转**与场景共用的同一 3D 模型**，五项属性五级展示
- **文件**：`index.html` / `style.css` / `fish-species.js` / `aquarium.js` / `fish-motion.js` / `crab-rig.js` / `turtle.js` / `vendor/three.min.js`

**小工具适配**：🟢 零素材、WebGL、有现成 esbuild 流程可把 8 个文件合并进 `app.js`。要改的：删掉全屏按钮，鱼数从 35 降到 15–20，海龟保留 1 只，图鉴接容器 Storage。这是目前最值得整体移植的一个。

### 🟢 其他可直接摘的

| 项目 | Star | 摘什么 |
|---|---|---|
| `ZhaoChaoqun/fish-school`（Pelagic） | 0 | **850 条真 3D Boids 的工程细节**：空间网格搜 27 格、每鱼最多 160 候选 / 40 可见邻居、旋转搜索顺序减偏差、后方盲锥、球形岩石避让；身体+鳍+尾+眼合并成一个实例网格，顶点着色器摆尾；固定 1/60 步长、delta 钳制。CPU @850 鱼 0.75 ms / 2000 鱼 1.58 ms、12 draw calls（M5 Pro 实测）。手机上鱼数降到 80–200 |
| `Strezia/ocean-shallows` | 3 | 单文件 WebGL 热带浅滩，含**蝠鲼 + 水母**，零依赖，形态最接近小工具 |
| `aeiouvcode/kin-living-pond` | 1 | 单 HTML，程序化金鱼 + 焦散光 |
| `ir272/fishbowl` | 1 | 单 HTML 3D 水族馆生态模拟 |
| `Andrijo/Oceancide` | 0 | 操控海龟清理海洋垃圾，玩法点子 |

### 🟡 只摘设定 / 公式，不搬工程

| 项目 | Star | 摘什么 |
|---|---|---|
| `dtounjian-lab/hatchling` | 0 | **5 种海龟物种设定**：Loggerhead / Green / Leatherback（7 道脊、只吃水母）/ Hawksbill（玳瑁纹）/ Kemp's Ridley；壳纹 shader 为 scute Voronoi、火焰纹、棱皮龟脊；60 龟 boids 大聚集；划鳍推进=前冲后滑翔、转弯侧倾、升降俯仰。全程序化 + Web Audio 合成，但 Vite / postprocessing / pointer lock 不搬 |
| `cvcwebsolutions/reef-aquarium` | 0 | **物种行为最丰富**：刺尾鱼、神仙鱼、小丑鱼、花鮨群、豆娘鱼群、河豚（遇鲨膨胀）、礁鲨、锤头鲨、鳐鱼（半埋沙）、海龟、海鳗（洞中伏击）、蟹虾、水母、鲸鲨路过；URL `?visit=turtle,whaleshark` 强制稀有访客、`?hunt=60` 调捕食频率。**但有生成照片/模型/WebP，不符合零素材**，只摘行为设计与"稀有访客"参数思路 |
| `milcktoast/particulate-medusae` | 345 | 软体水母模拟，摘伞盖形变思路 |
| `arodic/jellyfish` / `arodic/Chrysaora` | 63 / 50 | WebGL 水母 shader（作者是 GLSL 噪声库作者），摘脉动与触须公式 |
| `sebastianvasquezechavarria1234/jellyfish-three.js` | 3 | GPU compute 水母，摘运动规律 |
| `hb-mw/fish-up` | 0 | **50 种真实鱼类数据** + 900 m 深海 + 昼夜，摘物种参数表 |
| `BCWalters/AiBoids` | 1 | 10 种程序化生物类型 + 自定义 GLSL |

### 🔴 淘汰

`AgileLens/tidepool`（WebGPU compute + WebXR）、`unclemattmakes/polyfish`（WebGPU + WASM + WebXR）、`mutomasa/smart-3d-ecosystem`（FastAPI + PyTorch 后端）、任何需要下载模型/贴图的项目。

### 生物方向的落地顺序

1. **海龟**：从 `aquarium-threejs` 的 `turtle.js` 摘盾片背甲 + 4.6 秒划鳍；想做多品种就从 `hatchling` 摘壳纹 shader 接到图鉴
2. **鱼种图鉴**：`aquarium-threejs` 的 `fish-species.js` 七种鱼设计表改造成小工具图鉴（已有容器 Storage）
3. **鱼群**：Pelagic 的空间网格 Boids，数量降到 100–200，与收集玩法联动
4. **水母**：先摘 `ocean-shallows` 单文件版的伞盖脉动
5. **稀有访客**：抄 `reef-aquarium` 的 `?visit=` 思路，做成"每日随机访客"事件

---

## 附录：未过滤的全量调研清单

## 结论速览

| 判断 | 说明 |
|---|---|
| 高 star 同类确实少 | 严格同路线的海底网页游戏，除原版外几乎没有千星级项目；千星级集中在**海洋渲染器**（web-ocean、Ultra-Water）和**程序化场景 demo**（snowflow_demo）上 |
| 最值得抄的 4 个 | `Noniv/web-ocean` 1070★、`Humpalumps/Ultra-Water` 682★、`Noniv/snowflow_demo` 622★、`Token-Gremlin/natural-disasters` 305★ |
| 玩法灵感要去低星区找 | 单文件海底世界、收集/摄影/生存/生态链类项目多为 0–3★，但点子密集、代码可直接读 |

---

## 一、同源 / 高星：场景与渲染（优先读源码）

### 1. Noniv/abyssal-garden — 2561★
https://github.com/Noniv/abyssal-garden

**本项目的原版。** 你现在的工程是它的分支衍生线。价值在于"它是基准"——你想加的任何效果，先确认原版后续有没有加。作者另有几个同路线项目，见下面 2、4。

### 2. Noniv/web-ocean — 1070★
https://github.com/Noniv/web-ocean

同作者、从零手写 WebGPU、**无引擎无渲染库**的海洋渲染器，自包含 HTML（min 版 61 KB），和你一样从 `file://` 直接打开。

- 六层级联 Tessendorf FFT 波（1103 m → 0.26 m），radix-2 compute shader 在 workgroup memory 里做 IFFT
- 17 级 CDLOD 四叉树海面，近处 6.25 cm 顶点间距，延伸到 160 km，级间连续 morph
- LEAN mapping 斜率 mip + 各向异性 sun glitter + Smith masking；逐帧重建环境立方图做粗糙度过滤反射
- 泡沫由表面 Jacobian 折叠产生，两张跟随相机的世界空间贴图（128 m / 1 km）随时间衰减、顺风漂移
- Hillaire 大气 + 两层云（自阴影、银边、透射），HDR 4× MSAA + 8 级 bloom + AgX
- `H` 面板实时调风/浪/浊度/泡沫/太阳/曝光；URL 参数 `cam=`、`windSpeed=`、`swellHs=` 便于做截图对照

**对你有用**：水面与天空的光照管线、画质档位的参数化方式、单文件 build 脚本（esbuild + WGSL 注释剥离）几乎可以照搬。

### 3. Humpalumps/Ultra-Water — 682★
https://github.com/Humpalumps/Ultra-Water

three.js + WebGL2，**这份对"丰富海底场景+玩法"的价值最高**。

- **水下渲染**：水面双面着色，从下方看是 Snell 窗口 + 全内反射；半分辨率太阳光柱（24 步 Henyey-Greenstein 单次散射，每采样点在海面入口处采样波焦散与地形阴影）；Beer-Lambert 消光；**marine snow 海洋雪**；出水后镜头挂着水珠几秒
- **焦散**：Evan Wallace 面积比 splatting，三次 B 样条采样斜率，4× MSAA 目标，海床/道具/水下光柱共用同一套图案
- **可交互物体**：箱子、桶、浮标、小船的浮力刚体，逐格浮力 + 局部水速阻力，240 Hz 子步，能搁浅到岛屿高度场
- **相机预设 8 种**，含 `Underwater`、`Flotsam`、`Breakers`；色彩预设含 clear / tropical / **purple** / rust orange 等
- 手机自动降档（分辨率、MSAA、反射比例、bloom），掉帧时动态步进、锁 30 fps

**对你有用**：你现在的光柱/焦散是"看起来像"，这套是真的按水体光学算的；浮力漂浮物是现成的**玩法钩子**（推箱子、浮标、沉船碎片），海洋雪和 Snell 窗能明显提升水下沉浸感。RTX 3060 实测 Underwater 机位 4.93 ms/帧，开销可接受。

### 4. Noniv/snowflow_demo — 622★
https://github.com/Noniv/snowflow_demo

同作者，WebGPU + Babylon.js + 手写 WGSL 的程序化雪地技术 demo。**路线和你完全一致**：无贴图、无网格文件、无 HDRI、无动画数据。

- 嵌套环 clipmap：8 环、内圈 8.5 cm、半径约 870 m、33 万三角形、一个静态网格一次 draw call；顶点只存 `(gridIndex, ringLevel)`，世界放置/LOD morph/位移全在顶点着色器
- 高度场烘焙进 4096² RG32F 并镜像回 CPU，**角色落地采样的是真正画出来的那个表面**，不是另写一份解析式——这条正好对应你之前踩过的"GPU 高度必须和 CPU 逐位一致"
- **持久地形状态 buffer**：2048² RGBA16F ping-pong，toroidal 寻址跟随玩家不搬 buffer；脚印、雪橇痕迹、压缩、冰四通道；各向异性扩散回填料，1 分钟后仍留 71% 痕迹；位移同时作用于 beauty pass 和三级阴影
- 全程序化角色：18 骨表格化 bind pose，几何从表格放样，locomotion 由运动状态求解而非播放动画；脚掌落地后世界坐标写死，IK 去够，脚不会滑
- 每个美术参数都是实时滑杆，含帧时间中位数/P95/1% low、draw call、三角形数

**对你有用**：把"雪地留痕"换成"海底沙地划痕/挖掘/珊瑚破坏"就是一个可持续积累的玩法系统；程序化骨骼方案可替换你现在偏抽象的潜水员和蝠鲼；调试面板设计值得抄。

### 5. Token-Gremlin/natural-disasters（ABYSSAL）— 305★
https://github.com/Token-Gremlin/natural-disasters

**全程序化**电影级海洋 + 极端天气，约 400 KB JS+GLSL，仓库里没有任何贴图/网格/HDRI/音频文件，和你一样"全部由代码生成"。

- 多级联 FFT + JONSWAP 方向扩展，GPU 蝶形 IFFT 每帧演化；泡沫由 Jacobian 与陡度积累衰减
- 屏幕空间投影网格；光线对灾害场做 raymarch + 二分，海啸墙不会撕裂
- Bruneton/Hillaire 风格大气 LUT；Perlin-Worley 体积云由天气图塑造（层云→积云→带砧状云的积雨云）；云影投到水面
- **事件系统**：暴雨、浪花、分叉闪电、龙卷风、漩涡、飓风（有眼和眼墙）、疯狗浪、海啸——每个都真实 deformation 水面
- 两种体验模式：自动电影序列 / 自由飞行沙盒，看向哪里就在哪里触发灾害
- TAA、EV100 自动曝光、bloom、景深、运动模糊、AgX/ACES、色差、胶片颗粒、暗角；运行时自适应画质保帧预算

**对你有用**：直接给了"动态事件玩法"的模板——把飓风/漩涡/海啸换成海底版的**暗流、漩涡、热液喷发、泥沙暴**，配合沙盒式触发，比单纯观景耐玩得多。

### 6. 其他高星技术参考

| 项目 | Star | 看点 |
|---|---|---|
| `Erkaman/gl-water2d` | 312★ | WebGL 2D 液体模拟，流体手感参考 |
| `hughsk/boids` | 229★ | 经典快速 Boids 实现，鱼群捕食/逃逸交互的基础 |
| `anoopelias/boids` | 138★ | 同类但更新更近 |
| `nhtoby311/WaterSurface` | 145★ | React Three Fiber 交互水面 shader 组件，参数化写法可借鉴 |
| `matsuoka-601/WebGPU-Ocean` | 573★ | WebGPU 实时 3D 流体（MLS-MPM），偏流体物理不是海底 |
| `owenyuwono/poseidon` | 325★ | Three.js WebGPU/TSL GPU 驱动 FFT 海洋 |

---

## 二、星少但极对口：单文件海底游戏与玩法点子

这些 star 多为 0–3★（很多是 2026 年新项目），但技术路线与你完全同源，且**带玩法**，适合直接扒机制。

| 项目 | Star | 玩法/场景点子 |
|---|---|---|
| `squall01337/abyssal-ocean` | 57★ | 单 HTML 文件 FFT 海洋，WebGL2 + three.js，JONSWAP/TMA 谱、三级联 |
| `2600th/web-ocean-3d` | 58★ | Three.js WebGPU/TSL 谱海洋 + 热带岛，含焦散 |
| `kanaworksai-hue/minamo` | 23★ | 水上/水下/半浸泡三种状态实时渲染，WGSL + 焦散 |
| `reed-soul/SeedOcean` | 11★ | 开源 FFT 海洋，10 种海况预设、浮力、水下、飞溅与雨 |
| `VictorZakharov/beautiful-water` | 17★ | 程序化浅海，反射/泡沫/水下生物，带视觉回归测试 |
| `Strezia/ocean-shallows` | 3★ | 单文件 WebGL 热带浅滩：GPU 波、程序化沙洲、**蝠鲼和水母**，零依赖 |
| `triple6xseven/Akvarium` | 1★ | 1 KiB 原型长成的单文件海底世界，电影式下潜 + **隐藏金币收集** |
| `DrTsunamy/Blue-run` | 3★ | 单 HTML 3D 海底无尽跑酷，宝藏与地雷，玩法节奏参考 |
| `ProfRino/tideline` | 3★ | 单 HTML Gerstner 波 + 反射折射 + 体积云 |
| `tanuu5/aqua-blue` | 0★ | 全代码生成 3D 海底探索：**给海洋生物拍照 + 收集记忆碎片** |
| `manvendra-wendor/drowned-stars` | 0★ | 纯 HTML/Canvas2D/WebGL/WebAudio，无构建无素材文件——和你的技术栈几乎逐字一致 |
| `daforce1984/deepsea` | 2★ | WebGPU 第一人称下潜到 4000 m，自定义引擎，深度分层压迫感 |
| `forbiddenlink/ocean-simulator` | 1★ | WebGL 海洋生态模拟：复杂食物链 + 涌现行为 |
| `CircuitGhost/neuralaquarium` | 3★ | 生物发光生物由演化中的神经网络驱动的 2.5D 生态缸 |
| `sepivip/ClaudeNautica` | 0★ | 程序化海底**生存**游戏 |
| `Shraman123/Antoplasm` | 0★ | 水下恐怖矛鱼游戏，全程序化 |
| `SongEast5858/the-last-frame-dive` | 0★ | 第一人称沉船探索 + 叙事 |
| `xirtus/narayana-the-hadal-cycle` | 0★ | 程序化 Three.js 海底冒险，神话叙事包装 |
| `cjhgit/aquarium-threejs` | 0★ | 程序化鱼类/海龟/珊瑚礁生态模拟 |
| `Eeman1113/fimsh` | 1★ | 单文件 HTML/Canvas 礁石生态，脊柱 IK 鱼动画 |
| `xianxie6/tidal-field-notes` | 1★ | 中文项目，可实时探索的 2.5D Three.js 海底世界 |

---

## 三、落到你这个项目上的建议

按投入产出排序：

1. **先抄 Ultra-Water 的水下光照与海洋雪**：现有光柱/焦散是近似效果，换成 Snell 窗 + HG 单次散射 + 共用焦散图案，观感提升最大，开销已知可控（RTX 3060 约 5 ms）。
2. **抄 snowflow_demo 的持久地形状态 buffer**：把"海底沙地留痕/拖拽痕迹"做成会缓慢回填的状态层，观景游戏立刻有"我改变了世界"的反馈，且天然适配小红书的累计潜水时长玩法。
3. **抄 natural-disasters 的事件系统**：加 2–3 个可触发事件（暗流、热液喷发、鱼群惊散），沙盒触发 + 自动巡游两种模式，直接丰富玩法。
4. **抄 Akvarium / aqua-blue 的收集目标**：隐藏物、拍照、图鉴，是把"漫游"变成"有目的探索"的最低成本方案。
5. **抄 web-ocean 的 URL 参数 + 实时参数面板**：方便你做截图对照、画质档位和数据埋点。
6. **Boids 只在该用的时候用**：当前鱼群是程序化顶点动画，性能极好；如果做捕食交互再引入 `hughsk/boids`，别无脑替换。

## 备注

- star 数为 2026-11-20 查询时快照，会变动。
- 低 star ≠ 质量差：这一批里大量项目是 2026 年 8–11 月新建，很多由 AI 辅助开发，尚在涨星阶段。
- 搜索词覆盖：`underwater`、`underwater webgl`、`webgpu ocean`、`procedural ocean`、`ocean game html5`、`aquarium threejs`、`boids javascript`、`three.js underwater`、`webgl water simulation` 等，按 star 排序取前 25。
