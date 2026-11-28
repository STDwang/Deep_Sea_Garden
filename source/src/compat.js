// ---------------------------------------------------------------------------
// WebGPU adapter compatibility: different mobile WebViews accept adapter
// options differently.  Try hardware paths first, then a software fallback.
// ---------------------------------------------------------------------------
async function requestGpuAdapter(gpu) {
  if (!gpu || typeof gpu.requestAdapter !== 'function') return null;
  const plans = [
    { powerPreference: 'high-performance' },
    {},
    { powerPreference: 'low-power' },
    { forceFallbackAdapter: true },
  ];
  for (const options of plans) {
    try {
      let timer;
      const adapter = await Promise.race([
        gpu.requestAdapter(options),
        new Promise((resolve) => { timer = setTimeout(() => resolve(null), 2500); }),
      ]);
      clearTimeout(timer);
      if (adapter) return adapter;
    } catch (error) {
      // Try the next supported adapter request shape.
    }
  }
  return null;
}
