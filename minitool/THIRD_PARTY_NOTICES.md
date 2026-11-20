# Cold Smoke core

Source: https://github.com/huiskylabs/cold-smoke
Snapshot: 2f820ca3f9e376d47be66d179da2f912df9ff4b9
Copyright (c) 2026 Huisky. MIT.

Vendored modules: 00_util.js, 01_gfx.js, 02_shaderlib.js, 06_sdfmesh.js; the noise and detail texture generation functions at the beginning of 04_terrain.js, stored locally as 04_textures.js.
Local changes: native-only blocks removed; smoothstep numeric folding uses Number rather than dynamic JavaScript execution; underwater far plane is 120 m.

The post-processing bloom filter, depth-aware light integration, camera-centred analytic dust, quality governor and photo flow follow the corresponding Cold Smoke algorithms, adapted to the underwater renderer. Its skiing simulation, motion capture data, animals, menus and native applications are not included in the underwater runtime. The visible experience now includes a code-built diver and PC swimming; photo interfaces remain hidden. The diver follows the reference's procedural-body and joint-deformation approach but does not copy or embed its 59-bone Human module or skiing motion data.

The full MIT text is in vendor/LICENSE and embedded in the built app.js. The source reference snapshot remains separate at D:/Ai_RedTool/red_skiing.

# Original Abyssal Garden

The asymmetric rising whale-fluke silhouette is adapted from source/src/world.js in this workspace. Copyright (c) 2026 Maksymilian Dendra, MIT. Its complete license is in ../LICENSE and is also embedded in the built app.js.
