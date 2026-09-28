// Which Jupiter link opens the swap with the token already selected? (needs internet)
const { app, BrowserWindow } = require("electron");
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const SOL = "So11111111111111111111111111111111111111112";
const CANDIDATES = [
  `https://jup.ag/swap/SOL-${BONK}`,
  `https://jup.ag/swap?sell=${SOL}&buy=${BONK}`,
  `https://jup.ag/?sell=${SOL}&buy=${BONK}`,
  `https://jup.ag/swap/USDC-${BONK}`,
  `https://jup.ag/tokens/${BONK}`,
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  for (const url of CANDIDATES) {
    const w = new BrowserWindow({ show: false, width: 1280, height: 900 });
    w.webContents.setUserAgent(w.webContents.getUserAgent().replace(/\sElectron\/\S+/, ""));
    try {
      await w.loadURL(url);
      await sleep(9000);
      const info = await w.webContents.executeJavaScript(`(() => {
        const text = document.body.innerText.replace(/\\s+/g, " ");
        const inputs = [...document.querySelectorAll("input")].map((i) => i.placeholder || i.value).slice(0, 6);
        const buttons = [...document.querySelectorAll("button")].map((b) => (b.innerText || "").trim()).filter((t) => t && t.length < 20).slice(0, 25);
        return { finalUrl: location.href, bonkMentions: (text.match(/BONK|Bonk/g) || []).length, solMentions: (text.match(/\\bSOL\\b/g) || []).length, buttons, inputs, text: text.slice(0, 300) };
      })()`);
      console.log("[jup]", url, JSON.stringify(info));
    } catch (e) {
      console.log("[jup]", url, "ERROR", String(e));
    }
    w.destroy();
  }
  app.exit(0);
});
