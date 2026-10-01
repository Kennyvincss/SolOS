// STRATA offline page: Solana questions and answers that slide by until the
// connection comes back (the app reloads the page you wanted then).
"use strict";

const QA = [
  ["What is Solana?", "Solana is a public blockchain built for speed and low fees. Anyone can use it to send money, trade tokens, collect NFTs or run apps, without a bank or company in the middle."],
  ["What is SOL?", "SOL is Solana's own token. It pays the small fee on every transaction and can be staked to help secure the network. The smallest unit is a lamport: one SOL is 1,000,000,000 lamports."],
  ["How fast is Solana?", "Solana produces a new block about every 400 milliseconds, and most transactions confirm in under a second. Fees are usually a fraction of a cent."],
  ["What is Proof of History?", "It's Solana's built-in clock: a verifiable record of how much time has passed between events. Validators can agree on the order of transactions without waiting to talk to each other, which keeps the network fast."],
  ["What is a wallet?", "A wallet, like Phantom, Solflare or Backpack, holds the keys that control your funds. Your recovery phrase is the master key: never type it into a website or share it with anyone, including support staff."],
  ["What is staking?", "Staking means delegating SOL to a validator to help secure the network and earn rewards. Liquid staking (like JitoSOL or mSOL) gives you a token you can still use while your SOL is staked."],
  ["What is a token mint address?", "Every Solana token has a unique mint address. Names and tickers can be copied by anyone, so always check the mint address before buying a token."],
  ["What can you do with DeFi on Solana?", "Swap tokens at the best price (for example with Jupiter), lend or borrow (Kamino, marginfi), trade perpetuals (Drift, Jupiter Perps) or provide liquidity (Raydium, Orca, Meteora), all from your own wallet."],
  ["What are validators?", "Validators are computers run by independent operators around the world. They check transactions, produce blocks and vote on the state of the network. Anyone can run one."],
  ["What is Firedancer?", "Firedancer is a second, independent validator client for Solana built by Jump Crypto. Having more than one client makes the network more resilient: a bug in one doesn't stop the whole chain."],
  ["What is a transaction signature?", "Each transaction has a unique signature, a long string of letters and numbers. Paste one into STRATA's search to see what it did, explained in plain English."],
  ["How do I stay safe on Solana?", "Check the address bar before connecting your wallet, read what you're signing, be wary of tokens and NFTs that appear in your wallet unasked, and never share your recovery phrase."],
];

const track = document.getElementById("track");
const dots = document.getElementById("dots");
let index = 0;
let timer = null;

QA.forEach(([q, a], i) => {
  const card = document.createElement("article");
  card.className = "card";
  card.setAttribute("role", "group");
  card.setAttribute("aria-roledescription", "slide");
  card.setAttribute("aria-label", `${i + 1} of ${QA.length}`);
  const qEl = document.createElement("div");
  qEl.className = "q";
  qEl.textContent = q;
  const aEl = document.createElement("p");
  aEl.className = "a";
  aEl.textContent = a;
  const nEl = document.createElement("div");
  nEl.className = "n";
  nEl.textContent = `${i + 1} / ${QA.length}`;
  card.append(qEl, aEl, nEl);
  track.append(card);
  const dot = document.createElement("button");
  dot.setAttribute("role", "tab");
  dot.setAttribute("aria-label", q);
  dot.addEventListener("click", () => go(i, true));
  dots.append(dot);
});

function go(i, user) {
  index = (i + QA.length) % QA.length;
  track.style.transform = `translateX(${-index * 100}%)`;
  [...dots.children].forEach((d, k) => d.setAttribute("aria-selected", String(k === index)));
  if (user) restart();
}
function restart() {
  clearInterval(timer);
  timer = setInterval(() => go(index + 1), 7000);
}
track.parentElement.addEventListener("mouseenter", () => clearInterval(timer));
track.parentElement.addEventListener("mouseleave", restart);
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") go(index + 1, true);
  if (e.key === "ArrowLeft") go(index - 1, true);
});
go(Math.floor(Math.random() * QA.length));
restart();

// The app reloads the page when the connection returns; show it as it happens.
window.addEventListener("online", () => {
  const s = document.querySelector(".status");
  s.classList.add("back");
  document.getElementById("status-text").textContent = "Back online — reconnecting…";
});
