// Baseline for check-google-signin.js in real Google Chrome (DevTools protocol).
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9334;
const proc = spawn(process.env.CHROME_BIN || "google-chrome", [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "g-"))}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
let targets = null;
for (let i = 0; i < 40 && !targets; i++) { await wait(500); targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => null); }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) pending.get(d.id)(d.result); };
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true }))?.result?.value;
await send("Page.navigate", { url: "https://accounts.google.com/ServiceLogin?hl=en&continue=https://www.google.com/" });
let ok = false;
for (let i = 0; i < 40 && !ok; i++) { await wait(500); ok = await ev(`(() => { const e = document.querySelector('#identifierId, input[name=identifier], input[type=email]'); if (!e) return false; e.focus(); return true; })()`); }
await send("Input.insertText", { text: `strata.signin.check.${Date.now()}@gmail.com` });
await wait(300);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
let text = "";
for (let i = 0; i < 24; i++) { await wait(500); text = (await ev("document.body.innerText.replace(/\\s+/g, ' ')")) || ""; if (/may not be secure|Couldn.t find (your Google Account|this account)|Enter your password|Verify it.s you|couldn.t sign you in/i.test(text)) break; }
const verdict = /may not be secure|couldn.t sign you in/i.test(text) ? "BLOCKED (browser refused)" : /Couldn.t find (your Google Account|this account)|Enter your password|Verify it.s you/i.test(text) ? "ALLOWED" : "UNCLEAR";
console.log("[google CHROME]", verdict, JSON.stringify(text.slice(0, 160)));
proc.kill();
process.exit(0);
