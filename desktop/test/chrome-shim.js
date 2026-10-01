// Experiment for check-turnstile-bare.js: fill window.chrome the way Chrome
// does (Electron leaves it empty) in every frame.
const { contextBridge } = require("electron");
function shim() {
  const c = window.chrome || (window.chrome = {});
  const def = (k, v) => { if (!(k in c)) Object.defineProperty(c, k, { value: v, writable: true, enumerable: true, configurable: true }); };
  def("app", {
    isInstalled: false,
    InstallState: { DISABLED: "disabled", INSTALLED: "installed", NOT_INSTALLED: "not_installed" },
    RunningState: { CANNOT_RUN: "cannot_run", READY_TO_RUN: "ready_to_run", RUNNING: "running" },
    getDetails() { return null; },
    getIsInstalled() { return false; },
    runningState() { return "cannot_run"; },
  });
  def("csi", function csi() {
    const t = performance.timing;
    return { startE: t.navigationStart, onloadT: t.domContentLoadedEventEnd, pageT: performance.now(), tran: 15 };
  });
  def("loadTimes", function loadTimes() {
    const t = performance.timing;
    const nav = performance.getEntriesByType("navigation")[0] || {};
    return {
      requestTime: t.navigationStart / 1000, startLoadTime: t.navigationStart / 1000, commitLoadTime: t.responseStart / 1000,
      finishDocumentLoadTime: t.domContentLoadedEventEnd / 1000, finishLoadTime: t.loadEventEnd / 1000, firstPaintTime: t.responseEnd / 1000,
      firstPaintAfterLoadTime: 0, navigationType: "Other", wasFetchedViaSpdy: nav.nextHopProtocol === "h2", wasNpnNegotiated: true,
      npnNegotiatedProtocol: nav.nextHopProtocol || "unknown", wasAlternateProtocolAvailable: false, connectionInfo: nav.nextHopProtocol || "unknown",
    };
  });
}
try { contextBridge.executeInMainWorld({ func: shim }); } catch {}
