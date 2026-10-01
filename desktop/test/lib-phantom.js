// Shared by the Phantom checks: read and drive Phantom's pages by what's on
// screen, and walk its onboarding (import a throwaway recovery phrase).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Page helpers (run inside extension pages).
const PAGE_STATE = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  return {
    url: location.href,
    text: document.body ? document.body.innerText.replace(/\\s+/g, " ").slice(0, 300) : "",
    buttons: [...document.querySelectorAll("button, [role=button], a")].filter(vis).map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim()).filter(Boolean).slice(0, 20),
    inputs: [...document.querySelectorAll("input, textarea")].filter(vis).map((i) => i.type || i.tagName).slice(0, 30),
  };
})()`;
const clickText = (re) => `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const els = [...document.querySelectorAll("button, [role=button], a")].filter(vis);
  const label = (b) => (b.innerText || b.getAttribute("aria-label") || "").trim().split("\\n")[0].trim();
  const el = els.find((b) => ${re}.test(label(b)) && !b.disabled);
  if (!el) return false;
  el.click();
  return (el.innerText || "").trim().slice(0, 40) || true;
})()`;
const fillInputs = (values) => `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const set = (el, v) => {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const vals = ${JSON.stringify(values)};
  const inputs = [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]), textarea")].filter(vis);
  inputs.forEach((el, i) => { if (vals[i] !== undefined) set(el, vals[i]); });
  document.querySelectorAll("input[type=checkbox]").forEach((c) => { if (!c.checked) c.click(); });
  return inputs.length;
})()`;

async function drive(wc, words, password, log = console.log) {
  // Walk Phantom's onboarding by what's on screen; log every step.
  for (let step = 0; step < 25; step++) {
    await sleep(1500);
    if (wc.isDestroyed()) return log("onboarding page closed");
    const st = await wc.executeJavaScript(PAGE_STATE).catch((e) => ({ error: String(e) }));
    log(`step ${step}`, JSON.stringify(st));
    if (st.error) continue;
    const text = st.text.toLowerCase();
    if (/you're all (done|set)|all done|welcome to phantom|get started/.test(text) && (await wc.executeJavaScript(clickText("/^(get started|finish|done|open phantom)$/i")))) {
      log("finished onboarding");
      return true;
    }
    if (await wc.executeJavaScript(clickText("/^i already have a wallet$/i"))) continue;
    if (await wc.executeJavaScript(clickText("/^import (secret )?recovery phrase$/i"))) continue;
    const textInputs = st.inputs.filter((t) => t === "text" || t === "TEXTAREA" || t === "password");
    const pw = st.inputs.filter((t) => t === "password").length;
    if (st.inputs.length >= 12 && pw < 2) {
      // Type like a person (Phantom ignores scripted value changes).
      for (let i = 0; i < 12; i++) {
        await wc.executeJavaScript(`(() => { const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; const el = [...document.querySelectorAll("input")].filter(vis)[${i}]; el && el.focus(); })()`);
        await wc.insertText(words[i]);
      }
      log("typed recovery phrase");
      await sleep(800);
      await wc.executeJavaScript(clickText("/^(import wallet|import|continue|next)$/i"));
      continue;
    }
    if (pw >= 1) {
      const n = st.inputs.length;
      for (let i = 0; i < n; i++) {
        if (st.inputs[i] !== "password") continue;
        await wc.executeJavaScript(`(() => { const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; const el = [...document.querySelectorAll("input:not([type=checkbox])")].filter(vis)[${i}]; el && el.focus(); })()`);
        await wc.insertText(password);
      }
      await wc.executeJavaScript(`document.querySelectorAll("input[type=checkbox]").forEach((c) => { if (!c.checked) c.click(); }); [...document.querySelectorAll("[role=checkbox]")].forEach((c) => { if (c.getAttribute("aria-checked") !== "true") c.click(); }); true`);
      log("typed password");
      await sleep(800);
      await wc.executeJavaScript(clickText("/^(continue|next|save|submit)$/i"));
      continue;
    }
    if (textInputs.length === 0 && (await wc.executeJavaScript(clickText("/^(continue|next|import|import wallet|skip|done|got it|agree)$/i")))) continue;
  }
  return false;
}

module.exports = { PAGE_STATE, clickText, fillInputs, drive };
