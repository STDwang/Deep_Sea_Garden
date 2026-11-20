function readJournalClientVersion(options) {
  const env = options && options.miniToolEnv;
  const value = env && env.buildVersion;
  if (typeof value !== 'number' && typeof value !== 'string') return 0;
  const build = Number(value);
  return /^[1-9]\d{6,}$/.test(String(value)) && Number.isSafeInteger(build) ? Math.floor(build / 1000) : 0;
}

const journalStorage = {
  async read(key) {
    const xhs = window.xhs || {};
    const api = xhs.miniTool || {};
    let version = readJournalClientVersion(xhs.launchOptions);
    if (!version && typeof api.getLaunchOptions === 'function') version = readJournalClientVersion(await api.getLaunchOptions());
    if (version < 9460 || typeof api.getStorage !== 'function' || typeof api.setStorage !== 'function') {
      throw new Error('Journal storage unavailable');
    }
    const result = await api.getStorage({ key });
    if (!result || result.errMsg !== 'getStorage:ok' || (result.data !== null && typeof result.data !== 'string')) {
      throw new Error('Journal read not confirmed');
    }
    return result.data;
  },
  async write(key, data) {
    const result = await window.xhs.miniTool.setStorage({ key, data });
    if (!result || result.errMsg !== 'setStorage:ok') throw new Error('Journal write not confirmed');
  },
};
