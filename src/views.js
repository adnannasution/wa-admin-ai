import { ORDER_STATUSES, isAiPaused } from "./db.js";
import { rupiah } from "./fonnte.js";

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Escapes text, then renders WhatsApp *bold* and _italic_. */
export const waFormat = (s) =>
  esc(s)
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<b>$2</b>")
    .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<i>$2</i>");

// ---------- small helpers ----------

/** "2026-11-18 01:54:38" (UTC from SQLite) → "5 menit lalu". */
export function timeAgo(sqlTime) {
  if (!sqlTime) return "";
  const t = new Date(String(sqlTime).replace(" ", "T") + "Z").getTime();
  if (Number.isNaN(t)) return esc(sqlTime);
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} hari lalu`;
  return new Date(t).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

const AVATAR_COLORS = ["#10b981", "#6366f1", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6", "#ef4444", "#14b8a6"];
function avatar(name, size = 40) {
  const n = String(name || "?").trim();
  const initials = n.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  let h = 0;
  for (const ch of n) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const bg = AVATAR_COLORS[h % AVATAR_COLORS.length];
  return `<span class="avatar" style="--av:${bg};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px">${esc(initials)}</span>`;
}

const STATUS_TONE = { menunggu_bayar: "amber", dibayar: "blue", dikirim: "violet", selesai: "green", batal: "red" };
const statusPill = (s) => `<span class="pill ${STATUS_TONE[s] || ""}">${esc(ORDER_STATUSES[s] || s)}</span>`;

// Inline icons (stroke = currentColor), 24px grid.
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  wa: '<path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3.5 20.5l1.4-4.2A8.5 8.5 0 1 1 20.5 11.6z"/><path d="M9 9.2c.2 1.6 2.2 4.4 4.6 5 .6.1 1.3-.4 1.5-1l-1.5-.9-.8.6c-.9-.4-1.8-1.3-2.2-2.2l.6-.8L10.3 8.4c-.6.2-1.4.3-1.3.8z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h7M8.5 14h4"/>',
  bag: '<path d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  out: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2.5 3.5h2.6l2.4 12h11.4l2-8H6.3"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M16 13h2M3 10h18M6 6V4.5A1.5 1.5 0 0 1 7.5 3H17"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5v.01"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 13v1M15 13v1M9.5 17h5"/><circle cx="12" cy="3.5" r="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="m7 4 13 8-13 8z"/>',
  store: '<path d="M4 9.5 5.5 4h13L20 9.5M4 9.5V20h16V9.5M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M10 20v-5h4v5"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
};
const icon = (name, size = 20) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;

const LOGO = `<span class="logo-mark">${icon("wa", 22)}</span>`;

const OWNER_HELP_HTML = `<div class="cmds">
  <div><code>#stop 0812xxxx</code><span>AI berhenti membalas pelanggan itu (kamu balas manual dari HP)</span></div>
  <div><code>#start 0812xxxx</code><span>AI aktif lagi untuk pelanggan itu</span></div>
  <div><code>#stop semua</code> <code>#start semua</code><span>matikan / nyalakan AI untuk semua chat</span></div>
  <div><code>#status</code><span>cek status AI</span></div></div>`;

const CSS = `
:root{
  --bg:#f3f6f4;--bg2:#e9f0ec;--card:#ffffff;--text:#0f1f17;--muted:#5f6f67;--line:#e2e8e4;
  --brand:#0e9f6e;--brand2:#047857;--brand-soft:#e3f6ee;--ink:#0b1712;
  --amber:#b45309;--amber-soft:#fef3c7;--blue:#1d4ed8;--blue-soft:#dbeafe;--violet:#6d28d9;--violet-soft:#ede9fe;
  --green:#047857;--green-soft:#d1fae5;--red:#b91c1c;--red-soft:#fee2e2;
  --chat-bg:#efeae2;--bubble-in:#ffffff;--bubble-out:#d9fdd3;--bubble-out-text:#0f1f17;
  --shadow:0 1px 2px rgba(15,31,23,.04),0 8px 24px -12px rgba(15,31,23,.12);
  --radius:16px;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#0c1210;--bg2:#111a16;--card:#141e1a;--text:#e6efe9;--muted:#93a39a;--line:#22302a;
  --brand:#2fd18f;--brand2:#10b981;--brand-soft:#123326;--ink:#e6efe9;
  --amber:#fbbf24;--amber-soft:#3a2a0a;--blue:#93c5fd;--blue-soft:#13233f;--violet:#c4b5fd;--violet-soft:#241a3d;
  --green:#6ee7b7;--green-soft:#0f3226;--red:#fca5a5;--red-soft:#3b1414;
  --chat-bg:#0b141a;--bubble-in:#1f2c34;--bubble-out:#005c4b;--bubble-out-text:#e9fff6;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px -12px rgba(0,0,0,.6);
}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font:15px/1.55 "Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--text)}
a{color:var(--brand);text-decoration:none}a:hover{text-decoration:underline}
h1,h2,h3{line-height:1.25;margin:0 0 .4em;letter-spacing:-.01em}
h1{font-size:26px;font-weight:800}h2{font-size:20px;font-weight:750}h3{font-size:16px;font-weight:700}
.ic{flex:none;display:block}
code{background:var(--bg2);padding:2px 7px;border-radius:6px;font-size:.88em;word-break:break-all}

/* shell */
.shell{display:grid;grid-template-columns:252px 1fr;min-height:100vh;background:linear-gradient(90deg,var(--card) 251px,var(--line) 251px,var(--line) 252px,transparent 252px)}
.side{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;gap:4px;padding:20px 14px;background:var(--card);border-right:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:17px;color:var(--text);padding:4px 8px 18px}
.brand:hover{text-decoration:none}
.logo-mark{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;color:#fff;background:linear-gradient(135deg,#34d399,#059669);box-shadow:0 6px 16px -6px #059669}
.brand small{display:block;font-size:11.5px;font-weight:600;color:var(--muted);margin-top:-2px}
.nav a{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;color:var(--muted);font-weight:600;transition:background .15s,color .15s}
.nav a:hover{background:var(--bg2);color:var(--text);text-decoration:none}
.nav a.on{background:var(--brand-soft);color:var(--brand)}
.nav a .count{margin-left:auto;background:var(--amber);color:#fff;font-size:11px;padding:1px 7px;border-radius:99px}
.side-foot{margin-top:auto;display:flex;flex-direction:column;gap:10px}
.shop-chip{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--line);border-radius:14px}
.shop-chip b{display:block;font-size:13.5px;line-height:1.2}.shop-chip>div>span{display:block;font-size:12px;color:var(--muted)}
.main{min-width:0;padding:28px clamp(16px,3vw,40px) 48px;max-width:1180px;width:100%}
.topbar{display:none}

/* page header */
.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:22px}
.page-head p{margin:0;color:var(--muted)}
.actions{display:flex;gap:8px;flex-wrap:wrap}

/* cards */
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:20px;margin-bottom:18px;box-shadow:var(--shadow)}
.card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
.card-head h3{margin:0;display:flex;align-items:center;gap:8px}
.grid{display:grid;gap:18px}
.g2{grid-template-columns:repeat(2,minmax(0,1fr))}.g3{grid-template-columns:repeat(3,minmax(0,1fr))}.g4{grid-template-columns:repeat(4,minmax(0,1fr))}
.grid>.card{margin-bottom:0}
.muted{color:var(--muted)}.warn{color:var(--amber);font-weight:700}
.small{font-size:13px}

/* hero */
.hero{position:relative;overflow:hidden;border-radius:22px;padding:26px;color:#fff;margin-bottom:18px;
  background:radial-gradient(1200px 300px at 100% 0,rgba(255,255,255,.18),transparent 60%),linear-gradient(135deg,#059669 0%,#0e9f6e 45%,#0f766e 100%);box-shadow:0 18px 40px -22px #047857}
.hero h1{color:#fff;margin-bottom:6px}.hero p{margin:0;opacity:.9}
.hero .pills{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
.hero .pill{background:rgba(255,255,255,.16);color:#fff;border:1px solid rgba(255,255,255,.25);backdrop-filter:blur(4px)}
.hero .pill a{color:#fff;text-decoration:underline}
.hero-art{position:absolute;right:-10px;bottom:-30px;opacity:.16;pointer-events:none}
.hero-art .ic{width:210px;height:210px}

/* stats */
.stat{position:relative;overflow:hidden;transition:transform .2s,box-shadow .2s}
.stat:hover{transform:translateY(-2px)}
.stat .chip{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;margin-bottom:14px}
.stat .label{color:var(--muted);font-size:13.5px;font-weight:600}
.stat .value{font-size:28px;font-weight:800;letter-spacing:-.02em;margin-top:2px}
.tone-green .chip{background:var(--green-soft);color:var(--green)}
.tone-blue .chip{background:var(--blue-soft);color:var(--blue)}
.tone-amber .chip{background:var(--amber-soft);color:var(--amber)}
.tone-violet .chip{background:var(--violet-soft);color:var(--violet)}
.tone-red .chip{background:var(--red-soft);color:var(--red)}
.stat.hot{border-color:var(--amber)}
.stat.hot .value{color:var(--amber)}

/* pills */
.pill{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:99px;font-size:12.5px;font-weight:700;background:var(--bg2);color:var(--muted);white-space:nowrap}
.pill.green{background:var(--green-soft);color:var(--green)}.pill.amber{background:var(--amber-soft);color:var(--amber)}
.pill.blue{background:var(--blue-soft);color:var(--blue)}.pill.violet{background:var(--violet-soft);color:var(--violet)}
.pill.red{background:var(--red-soft);color:var(--red)}
.dot{width:8px;height:8px;border-radius:50%;background:currentColor;display:inline-block}
.dot.live{box-shadow:0 0 0 0 currentColor;animation:ping 1.8s infinite}
@keyframes ping{0%{box-shadow:0 0 0 0 color-mix(in srgb,currentColor 60%,transparent)}100%{box-shadow:0 0 0 8px transparent}}

/* forms */
label{display:block;margin:14px 0 6px;color:var(--text);font-size:13.5px;font-weight:650}
label .hint{display:block;font-weight:500;color:var(--muted);font-size:12.5px;margin-top:2px}
input,textarea,select{width:100%;padding:11px 13px;border:1px solid var(--line);border-radius:12px;background:var(--bg);color:var(--text);font:inherit;transition:border-color .15s,box-shadow .15s}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 4px var(--brand-soft)}
textarea{min-height:100px;resize:vertical}
.check{display:flex;align-items:center;gap:10px;font-weight:600;margin:14px 0}
.check input{width:18px;height:18px;accent-color:var(--brand)}
.switch{position:relative;display:inline-flex;align-items:center;gap:12px;cursor:pointer;font-weight:650;margin:14px 0}
.switch input{position:absolute;opacity:0;width:1px;height:1px}
.switch .track{width:46px;height:26px;border-radius:99px;background:var(--line);position:relative;transition:background .2s;flex:none}
.switch .track::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .2s}
.switch input:checked+.track{background:var(--brand)}
.switch input:checked+.track::after{transform:translateX(20px)}
.switch input:focus-visible+.track{box-shadow:0 0 0 4px var(--brand-soft)}
button,.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:linear-gradient(180deg,var(--brand),var(--brand2));color:#fff;border:0;border-radius:12px;padding:10px 18px;font:inherit;font-weight:700;cursor:pointer;text-decoration:none;box-shadow:0 6px 16px -8px var(--brand2);transition:transform .12s,box-shadow .2s,filter .2s}
button:hover,.btn:hover{filter:brightness(1.05);text-decoration:none;transform:translateY(-1px)}
button:active,.btn:active{transform:translateY(0)}
button.secondary,.btn.secondary{background:var(--card);color:var(--text);border:1px solid var(--line);box-shadow:none}
button.secondary:hover,.btn.secondary:hover{background:var(--bg2)}
button.danger{background:var(--card);color:var(--red);border:1px solid var(--line);box-shadow:none}
button.sm,.btn.sm{padding:7px 12px;font-size:13.5px;border-radius:10px}
.form-row{display:grid;gap:0 16px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}

/* tables & lists */
.scroll{overflow-x:auto}
table{width:100%;border-collapse:collapse}
th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700;text-align:left;padding:10px 12px;border-bottom:1px solid var(--line)}
td{padding:14px 12px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
tbody tr{transition:background .15s}tbody tr:hover{background:var(--bg)}
.list a.item,.list .item{display:flex;align-items:center;gap:12px;padding:12px;border-radius:12px;color:var(--text)}
.list a.item:hover{background:var(--bg);text-decoration:none}
.item .grow{flex:1;min-width:0}
.item .title{font-weight:700;display:flex;gap:8px;align-items:center}
.item .sub{color:var(--muted);font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.item .meta .pill{font-size:11.5px;padding:2px 8px}
.item .meta{text-align:right;font-size:12.5px;color:var(--muted);white-space:nowrap;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.avatar{display:inline-grid;place-items:center;border-radius:50%;color:#fff;font-weight:800;background:var(--av);flex:none;box-shadow:inset 0 -2px 0 rgba(0,0,0,.12)}
.empty{text-align:center;padding:36px 16px;color:var(--muted)}
.empty .big{display:grid;place-items:center;width:64px;height:64px;margin:0 auto 12px;border-radius:20px;background:var(--brand-soft);color:var(--brand)}
.empty .big .ic{width:30px;height:30px}

/* tabs */
.tabs{display:flex;gap:6px;flex-wrap:wrap}
.tabs a{padding:8px 14px;border-radius:99px;font-weight:650;font-size:14px;color:var(--muted);background:var(--card);border:1px solid var(--line)}
.tabs a:hover{text-decoration:none;color:var(--text)}
.tabs a.on{background:var(--ink);color:var(--card);border-color:var(--ink)}

/* products */
.products{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.product{display:flex;flex-direction:column;gap:10px;padding:16px;border:1px solid var(--line);border-radius:var(--radius);background:var(--card);box-shadow:var(--shadow);transition:transform .2s;color:var(--text)}
.product:hover{transform:translateY(-3px);text-decoration:none}
.product .thumb{height:96px;border-radius:12px;display:grid;place-items:center;font-size:36px;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--av),color-mix(in srgb,var(--av) 55%,#000))}
.product .name{font-weight:750}.product .price{font-weight:800;font-size:18px;color:var(--brand)}
.product.off{opacity:.55}
details.add summary{list-style:none;cursor:pointer}
details.add summary::-webkit-details-marker{display:none}

/* chat */
.chat{border-radius:var(--radius);overflow:hidden;border:1px solid var(--line);box-shadow:var(--shadow);background:var(--card);margin-bottom:18px}
.chat-head{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.chat-head .grow{flex:1;min-width:160px}
.chat-body{padding:22px clamp(12px,3vw,32px);background-color:var(--chat-bg);
  background-image:radial-gradient(color-mix(in srgb,var(--muted) 18%,transparent) 1px,transparent 1.2px);background-size:18px 18px;
  display:flex;flex-direction:column;gap:6px;max-height:62vh;overflow-y:auto}
.msg{position:relative;max-width:min(78%,560px);padding:8px 12px 6px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word;box-shadow:0 1px 1px rgba(0,0,0,.08);animation:pop .25s ease both}
.msg.user{align-self:flex-start;background:var(--bubble-in);border-top-left-radius:4px}
.msg.assistant,.msg.admin{align-self:flex-end;background:var(--bubble-out);color:var(--bubble-out-text);border-top-right-radius:4px}
.msg .who{display:flex;align-items:center;gap:4px;white-space:normal;font-size:11.5px;font-weight:800;margin-bottom:2px;color:var(--brand)}
.msg.admin .who{color:#7c3aed}.msg.user .who{color:var(--blue)}
.msg time{display:block;text-align:right;font-size:11px;opacity:.6;margin-top:2px}
.day{align-self:center;font-size:12px;font-weight:700;padding:4px 12px;border-radius:8px;background:var(--card);color:var(--muted);margin:8px 0;box-shadow:0 1px 1px rgba(0,0,0,.06)}
.composer{display:flex;gap:10px;align-items:flex-end;padding:14px 18px;border-top:1px solid var(--line);background:var(--card)}
.composer textarea{min-height:46px;height:46px;border-radius:24px;padding:12px 18px}
.composer button{border-radius:50%;width:46px;height:46px;padding:0;flex:none}

/* banners & toast */
.banner{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border-radius:14px;margin-bottom:18px;font-weight:600}
.banner.amber{background:var(--amber-soft);color:var(--amber)}.banner.red{background:var(--red-soft);color:var(--red)}
.toast{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:50;display:flex;gap:10px;align-items:center;max-width:min(560px,calc(100vw - 32px));
  padding:12px 16px;border-radius:14px;background:var(--ink);color:var(--card);font-weight:650;box-shadow:0 16px 40px -12px rgba(0,0,0,.45);animation:toast 5s ease forwards}
@keyframes toast{0%{opacity:0;transform:translate(-50%,-12px)}6%,88%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-12px);visibility:hidden}}

/* steps / commands */
.steps{counter-reset:s;list-style:none;padding:0;margin:0;display:grid;gap:12px}
.steps li{counter-increment:s;display:flex;gap:12px;align-items:flex-start}
.steps li::before{content:counter(s);flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--brand-soft);color:var(--brand);font-weight:800;font-size:13px}
.cmds{display:grid;gap:8px}
.cmds>div{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:10px 12px;border-radius:12px;background:var(--bg)}
.cmds span{color:var(--muted);font-size:13.5px}

/* whatsapp connect */
.qr-wrap{position:relative;width:280px;height:280px;margin:0 auto;border-radius:24px;display:grid;place-items:center;background:#fff;box-shadow:0 0 0 1px var(--line),0 24px 50px -24px rgba(5,150,105,.6)}
.qr-wrap::before{content:"";position:absolute;inset:-6px;border-radius:28px;border:2px solid var(--brand);opacity:.5;animation:breathe 2.4s ease-in-out infinite}
@keyframes breathe{50%{inset:-12px;opacity:.1}}
.code-box{font:800 30px/1.2 ui-monospace,Menlo,monospace;letter-spacing:6px;padding:24px 18px;border-radius:20px;background:var(--brand-soft);color:var(--brand);text-align:center}
.connected{text-align:center;padding:24px 8px}
.connected .check-big{display:grid;place-items:center;width:84px;height:84px;margin:0 auto 14px;border-radius:50%;color:#fff;background:linear-gradient(135deg,#34d399,#059669);box-shadow:0 18px 36px -14px #059669;animation:pop .5s cubic-bezier(.3,1.6,.6,1) both}
.spinner{width:28px;height:28px;border-radius:50%;border:3px solid var(--line);border-top-color:var(--brand);animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* auth */
.auth{display:grid;grid-template-columns:1.1fr 1fr;min-height:100vh}
.auth-art{position:relative;overflow:hidden;padding:48px;color:#fff;display:flex;flex-direction:column;justify-content:space-between;
  background:radial-gradient(800px 400px at 0 0,rgba(255,255,255,.16),transparent 60%),linear-gradient(150deg,#065f46,#059669 55%,#10b981)}
.auth-art h1{color:#fff;font-size:clamp(28px,3.4vw,40px);max-width:16ch;margin:28px 0 10px}
.auth-art p{opacity:.9;max-width:42ch;margin:0}
.phone{width:min(330px,100%);margin:28px 0;border-radius:28px;padding:16px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);backdrop-filter:blur(6px);display:flex;flex-direction:column;gap:8px}
.phone .b{max-width:85%;padding:8px 12px;border-radius:12px;font-size:13.5px;line-height:1.4;color:#0f1f17;animation:pop .4s ease both}
.phone .in{background:#fff;align-self:flex-start;border-top-left-radius:4px}
.phone .out{background:#d9fdd3;align-self:flex-end;border-top-right-radius:4px}
.phone .b:nth-child(2){animation-delay:.5s}.phone .b:nth-child(3){animation-delay:1.1s}.phone .b:nth-child(4){animation-delay:1.7s}
.perks{display:flex;gap:10px;flex-wrap:wrap}
.perks span{display:inline-flex;gap:8px;align-items:center;padding:6px 12px;border-radius:99px;background:rgba(255,255,255,.14);font-size:13px;font-weight:650}
.auth-form{display:grid;place-items:center;padding:32px 20px;background:var(--bg)}
.auth-card{width:100%;max-width:400px}
.auth-card .card{padding:28px}
.auth-card h2{font-size:24px}

/* motion */
@keyframes pop{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:none}}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.main>*{animation:rise .45s ease both}
.main>*:nth-child(2){animation-delay:.05s}.main>*:nth-child(3){animation-delay:.1s}.main>*:nth-child(4){animation-delay:.15s}.main>*:nth-child(5){animation-delay:.2s}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}

/* responsive */
@media (max-width:1000px){.g4{grid-template-columns:repeat(2,minmax(0,1fr))}.g3{grid-template-columns:1fr}}
@media (max-width:900px){
  .shell{grid-template-columns:1fr;background:none}
  .side{display:none}
  .topbar{display:flex;position:sticky;top:0;z-index:20;flex-direction:column;background:var(--card);border-bottom:1px solid var(--line)}
  .topbar .row1{display:flex;align-items:center;justify-content:space-between;padding:12px 16px}
  .topbar nav{display:flex;gap:6px;overflow-x:auto;padding:0 12px 10px;scrollbar-width:none}
  .topbar nav::-webkit-scrollbar{display:none}
  .topbar nav a{display:flex;align-items:center;gap:6px;padding:8px 12px;border-radius:99px;white-space:nowrap;color:var(--muted);font-weight:650;font-size:14px;background:var(--bg)}
  .topbar nav a.on{background:var(--brand-soft);color:var(--brand)}
  .topbar nav a:hover{text-decoration:none}
  .main{padding:18px 16px 40px}
  .g2{grid-template-columns:1fr}
  .auth{grid-template-columns:1fr}
  .auth-art{padding:28px 20px}.phone{display:none}
  h1{font-size:22px}
}
@media (max-width:520px){.g4{grid-template-columns:1fr 1fr}.stat .value{font-size:22px}.card{padding:16px}.msg{max-width:88%}}
`;

const FONT = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">`;

function doc(title, inner) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#059669"><title>${esc(title)} · WA Admin AI</title>${FONT}<style>${CSS}</style></head><body>${inner}</body></html>`;
}

const NAV = [
  ["dashboard", "/dashboard", "home", "Dashboard"],
  ["whatsapp", "/whatsapp", "wa", "WhatsApp"],
  ["percakapan", "/percakapan", "chat", "Percakapan"],
  ["pesanan", "/pesanan", "bag", "Pesanan"],
  ["produk", "/produk", "box", "Produk"],
  ["pengaturan", "/pengaturan", "gear", "Pengaturan"],
];

export function layout(title, body, { tenant, flash, active } = {}) {
  if (!tenant) return doc(title, `<main class="main">${flash ? toast(flash) : ""}${body}</main>`);
  const items = [...NAV, ...(tenant.is_super ? [["admin", "/admin", "shield", "Admin Platform"]] : [])];
  const link = (k, href, ic, label, cls = "") =>
    `<a href="${href}" class="${k === active ? "on" : ""} ${cls}">${icon(ic)}<span>${label}</span></a>`;
  const connected = tenant.fonnte_token && tenant.wa_status === "connect";
  const side = `<aside class="side">
      <a class="brand" href="/dashboard">${LOGO}<span>WA Admin AI<small>Admin WhatsApp 24 jam</small></span></a>
      <nav class="nav">${items.map((i) => link(...i)).join("")}</nav>
      <div class="side-foot">
        <div class="shop-chip">${avatar(tenant.name, 36)}<div style="min-width:0"><b>${esc(tenant.name)}</b>
          <span>${tenant.is_super ? "Admin platform" : connected ? '<span style="color:var(--green)">● WA tersambung</span>' : '<span style="color:var(--amber)">● WA belum tersambung</span>'}</span></div></div>
        <form method="post" action="/logout"><button class="secondary sm" style="width:100%">${icon("out", 16)} Keluar</button></form>
      </div></aside>`;
  const top = `<div class="topbar"><div class="row1"><a class="brand" style="padding:0" href="/dashboard">${LOGO}<span>WA Admin AI</span></a>
      <form method="post" action="/logout"><button class="secondary sm" aria-label="Keluar">${icon("out", 16)}</button></form></div>
      <nav>${items.map((i) => link(...i)).join("")}</nav></div>`;
  const banner =
    tenant && !tenant.active
      ? `<div class="banner red">${icon("alert")}<div>Akun toko ini sedang nonaktif, jadi AI tidak membalas chat. Hubungi admin WA Admin AI.</div></div>`
      : "";
  return doc(title, `<div class="shell">${side}<div>${top}<main class="main">${banner}${body}</main></div></div>${flash ? toast(flash) : ""}`);
}

const toast = (msg) => `<div class="toast" role="status">${icon("sparkle", 18)}<span>${esc(msg)}</span></div>`;

const pageHead = (title, sub, actions = "") =>
  `<div class="page-head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div>${actions ? `<div class="actions">${actions}</div>` : ""}</div>`;

const statCard = (tone, ic, label, value, hot = false) =>
  `<div class="card stat tone-${tone} ${hot ? "hot" : ""}"><div class="chip">${icon(ic, 22)}</div><div class="label">${label}</div><div class="value">${value}</div></div>`;

const emptyState = (ic, title, sub = "") => `<div class="empty"><div class="big">${icon(ic)}</div><b>${title}</b>${sub ? `<div class="small">${sub}</div>` : ""}</div>`;

// ---------- auth ----------
export function authPage(mode, error) {
  const isReg = mode === "register";
  return doc(
    isReg ? "Daftar" : "Masuk",
    `<div class="auth">
      <section class="auth-art">
        <div class="brand" style="color:#fff;padding:0">${LOGO}<span>WA Admin AI</span></div>
        <div>
          <h1>Admin WhatsApp yang kerja 24 jam untuk tokomu.</h1>
          <p>AI membalas pertanyaan pelanggan, mencatat pesanan, dan mengingatkan pembayaran — langsung dari nomor WhatsApp tokomu sendiri.</p>
          <div class="phone" aria-hidden="true">
            <div class="b in">Kak, brownies masih ada? 🍫</div>
            <div class="b out">Masih ada kak! <b>Brownies Panggang</b> Rp65.000 per loyang. Mau pesan berapa? 😊</div>
            <div class="b in">2 ya kak, kirim ke Jl. Kenari 5</div>
            <div class="b out">Siap! Pesanan <b>INV-MB7L</b> sudah dibuat ✅</div>
          </div>
        </div>
        <div class="perks"><span>⚡ Balas instan</span><span>🧾 Pesanan otomatis</span><span>🔔 Pengingat bayar</span></div>
      </section>
      <section class="auth-form"><div class="auth-card">
        <div class="card">
          <h2>${isReg ? "Daftarkan tokomu" : "Selamat datang kembali 👋"}</h2>
          <p class="muted" style="margin-top:0">${isReg ? "Gratis dicoba. Siap dalam 5 menit." : "Masuk untuk mengelola chat & pesanan."}</p>
          ${error ? `<div class="banner red" style="margin:12px 0 0">${icon("alert")}<div>${esc(error)}</div></div>` : ""}
          <form method="post" action="/${isReg ? "register" : "login"}">
            ${isReg ? `<label>Nama toko</label><input name="name" required placeholder="mis. Dapur Kue Bunda">` : ""}
            <label>Email</label><input name="email" type="email" required placeholder="kamu@email.com">
            <label>Password</label><input name="password" type="password" minlength="8" required placeholder="minimal 8 karakter">
            <p style="margin:20px 0 0"><button style="width:100%">${isReg ? "Daftar sekarang" : "Masuk"} ${icon("arrow", 18)}</button></p>
          </form>
        </div>
        <p class="muted" style="text-align:center">${isReg ? `Sudah punya akun? <a href="/login">Masuk</a>` : `Belum punya akun? <a href="/register">Daftar gratis</a>`}</p>
      </div></section>
    </div>`
  );
}

// ---------- dashboard ----------
export function waStatusHtml(tenant) {
  if (tenant.fonnte_token && tenant.wa_status === "connect")
    return `<span class="pill green"><span class="dot live"></span>WhatsApp tersambung${tenant.wa_number ? ` · ${esc(tenant.wa_number)}` : ""}</span>`;
  if (!tenant.wa_number)
    return `<span class="pill amber">⏳ Belum tersambung</span> <span>Isi <b>nomor WhatsApp toko</b> di <a href="/pengaturan">Pengaturan</a> dulu.</span>`;
  if (tenant.fonnte_token && tenant.wa_status === "disconnect" && tenant.wa_status_reason)
    return `<span class="pill red">⚠️ WhatsApp terputus</span> <span>(${esc(tenant.wa_status_reason)}) <a href="/whatsapp">Sambungkan lagi →</a></span>`;
  return `<span class="pill amber">⏳ Belum tersambung</span> <a href="/whatsapp">Sambungkan WhatsApp sekarang →</a>`;
}

function greeting() {
  const h = (new Date().getUTCHours() + 7) % 24; // WIB
  return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 18 ? "Selamat sore" : "Selamat malam";
}

export function dashboardPage(tenant, stats, flash, recent = { orders: [], chats: [] }) {
  const orders = recent.orders.length
    ? `<div class="list">${recent.orders
        .map(
          (o) => `<a class="item" href="/pesanan">${avatar(o.customer_name, 38)}<div class="grow"><div class="title">${esc(o.customer_name)}</div>
            <div class="sub">${esc(o.code)} · ${rupiah(o.total)}</div></div><div class="meta">${statusPill(o.status)}<span>${timeAgo(o.created_at)}</span></div></a>`
        )
        .join("")}</div>`
    : emptyState("bag", "Belum ada pesanan", "Pesanan dari chat WhatsApp akan muncul di sini.");
  const chats = recent.chats.length
    ? `<div class="list">${recent.chats
        .map(
          (c) => `<a class="item" href="/percakapan/${c.id}">${avatar(c.name || c.phone, 38)}<div class="grow"><div class="title">${esc(c.name || c.phone)}</div>
            <div class="sub">${esc((c.last_text || "").replace(/\s+/g, " ").slice(0, 70))}</div></div>
            <div class="meta">${c.needs_attention ? '<span class="pill amber">Perlu admin</span>' : ""}<span>${timeAgo(c.last_message_at)}</span></div></a>`
        )
        .join("")}</div>`
    : emptyState("chat", "Belum ada chat", "Chat pelanggan akan muncul di sini setelah WhatsApp tersambung.");

  return layout(
    "Dashboard",
    `<section class="hero">
      <div class="hero-art">${icon("wa")}</div>
      <p>${greeting()} 👋</p>
      <h1>${esc(tenant.name)}</h1>
      <p>${stats.attention ? `Ada <b>${stats.attention}</b> chat yang menunggu kamu.` : "AI sedang menjaga chat pelanggan untukmu."}</p>
      <div class="pills">${waStatusHtml(tenant)}
        <span class="pill">${icon("bot", 14)} AI auto-reply: ${tenant.ai_enabled ? "aktif" : "nonaktif"}</span></div>
    </section>
    <div class="grid g4" style="margin-bottom:18px">
      ${statCard("blue", "cart", "Pesanan hari ini", stats.ordersToday)}
      ${statCard("green", "wallet", "Omzet dibayar (30 hari)", rupiah(stats.revenue30))}
      ${statCard("violet", "clock", "Menunggu bayar", stats.unpaid)}
      ${statCard("amber", "alert", "Perlu admin", stats.attention, stats.attention > 0)}
    </div>
    <div class="grid g2" style="margin-bottom:18px">
      <div class="card"><div class="card-head"><h3>${icon("bag", 18)} Pesanan terbaru</h3><a href="/pesanan" class="small">Lihat semua →</a></div>${orders}</div>
      <div class="card"><div class="card-head"><h3>${icon("chat", 18)} Chat terbaru</h3><a href="/percakapan" class="small">Lihat semua →</a></div>${chats}</div>
    </div>
    <div class="card">
      <div class="card-head"><h3>${icon("pause", 18)} Mau balas sendiri dari HP?</h3></div>
      <p class="muted" style="margin-top:0">Kirim perintah dari <b>nomor pemilik</b> ${tenant.owner_phone ? `(${esc(tenant.owner_phone)})` : '(isi dulu di <a href="/pengaturan">Pengaturan</a>)'} ke nomor toko supaya AI tidak ikut membalas:</p>
      ${OWNER_HELP_HTML}
      <p class="muted small" style="margin-bottom:0">Kalau kamu membalas dari halaman Percakapan di sini, AI otomatis diam selama 1 jam untuk chat itu.</p>
    </div>`,
    { tenant, flash, active: "dashboard" }
  );
}

// ---------- products ----------
export function productsPage(tenant, products, flash) {
  const cards = products
    .map((p) => {
      const stock =
        p.stock === null
          ? '<span class="pill">Stok ∞</span>'
          : p.stock === 0
            ? '<span class="pill red">Habis</span>'
            : p.stock <= 3
              ? `<span class="pill amber">Sisa ${p.stock}</span>`
              : `<span class="pill green">Stok ${p.stock}</span>`;
      const av = avatar(p.name).match(/--av:([^;]+)/)[1];
      return `<a class="product ${p.active ? "" : "off"}" href="/produk/${p.id}">
        <div class="thumb" style="--av:${av}">${esc(p.name.trim()[0] || "?").toUpperCase()}</div>
        <div><div class="name">${esc(p.name)}</div><div class="muted small">${esc(p.description) || "&nbsp;"}</div></div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="price">${rupiah(p.price)}</span>${p.active ? stock : '<span class="pill">Nonaktif</span>'}</div>
        <div class="muted small">ID ${p.id} · ketuk untuk ubah</div></a>`;
    })
    .join("");
  return layout(
    "Produk",
    `${pageHead("Produk", "Katalog yang dipakai AI untuk menjawab harga &amp; stok. AI tidak akan menawarkan produk di luar daftar ini.")}
    <details class="card add" ${products.length ? "" : "open"}><summary><div class="card-head" style="margin:0"><h3>${icon("plus", 18)} Tambah produk</h3><span class="btn sm secondary">Buka form</span></div></summary>
      <div style="margin-top:8px">${productForm({}, "/produk")}</div></details>
    ${products.length ? `<div class="products">${cards}</div>` : `<div class="card">${emptyState("box", "Belum ada produk", "Tambahkan produk pertamamu supaya AI bisa mulai berjualan.")}</div>`}`,
    { tenant, flash, active: "produk" }
  );
}

export function productForm(p, action) {
  return `<form method="post" action="${action}">
    <div class="form-row"><div><label>Nama</label><input name="name" required value="${esc(p.name)}" placeholder="mis. Brownies Panggang"></div>
    <div><label>Harga (Rp)</label><input name="price" type="number" min="0" required value="${esc(p.price)}" placeholder="65000"></div>
    <div><label>Stok <span class="hint">kosongkan = tak terbatas</span></label><input name="stock" type="number" min="0" value="${p.stock ?? ""}"></div></div>
    <label>Deskripsi <span class="hint">ukuran, rasa, varian — makin jelas, makin pintar AI menjawab</span></label><input name="description" value="${esc(p.description)}">
    ${p.id ? `<label class="switch"><input type="checkbox" name="active" value="1" ${p.active ? "checked" : ""}><span class="track"></span> Aktif (ditawarkan AI)</label>` : ""}
    <p style="margin-bottom:0"><button>Simpan</button></p></form>`;
}

export function productEditPage(tenant, p) {
  return layout(
    "Ubah produk",
    `<p><a href="/produk">${icon("back", 16).replace('class="ic"', 'class="ic" style="display:inline;vertical-align:-3px"')} Semua produk</a></p>
     ${pageHead(esc(p.name), `Produk #${p.id}`)}
     <div class="card">${productForm(p, `/produk/${p.id}`)}</div>`,
    { tenant, active: "produk" }
  );
}

// ---------- orders ----------
export function ordersPage(tenant, orders, status, flash) {
  const tabs = [["", "Semua"], ...Object.entries(ORDER_STATUSES)]
    .map(([k, v]) => `<a href="/pesanan${k ? `?status=${k}` : ""}" class="${k === status ? "on" : ""}">${v}</a>`)
    .join("");
  const rows = orders
    .map((o) => {
      const items = JSON.parse(o.items_json)
        .map((l) => `<div>${l.qty}× ${esc(l.name)}</div>`)
        .join("");
      const opts = Object.entries(ORDER_STATUSES)
        .map(([k, v]) => `<option value="${k}" ${k === o.status ? "selected" : ""}>${v}</option>`)
        .join("");
      return `<tr><td><b>${esc(o.code)}</b><div class="muted small">${timeAgo(o.created_at)}</div><div style="margin-top:6px">${statusPill(o.status)}</div></td>
        <td><div style="display:flex;gap:10px;align-items:flex-start">${avatar(o.customer_name, 34)}<div><b>${esc(o.customer_name)}</b><div class="muted small">${esc(o.phone)}</div><div class="muted small">${esc(o.address)}</div>${o.note ? `<div class="small">📝 ${esc(o.note)}</div>` : ""}</div></div></td>
        <td class="small">${items}</td><td><b>${rupiah(o.total)}</b></td>
        <td style="min-width:210px"><form method="post" action="/pesanan/${o.id}/status"><select name="status">${opts}</select>
          <input name="info" placeholder="No. resi / catatan (opsional)" style="margin-top:8px">
          <label class="check" style="margin:8px 0"><input type="checkbox" name="notify" value="1" checked> Kabari pelanggan via WA</label>
          <button class="sm">Update</button></form></td></tr>`;
    })
    .join("");
  return layout(
    "Pesanan",
    `${pageHead("Pesanan", "Semua invoice yang dibuat AI dari chat WhatsApp.", `<a class="btn secondary" href="/pesanan.csv${status ? `?status=${status}` : ""}">${icon("download", 18)} Export CSV</a>`)}
    <div class="tabs" style="margin-bottom:16px">${tabs}</div>
    <div class="card scroll" style="padding:8px 12px">${
      rows
        ? `<table><thead><tr><th>Kode</th><th>Pelanggan</th><th>Item</th><th>Total</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`
        : emptyState("bag", "Belum ada pesanan", status ? "Tidak ada pesanan dengan status ini." : "Pesanan akan muncul otomatis saat pelanggan memesan lewat WhatsApp.")
    }</div>`,
    { tenant, flash, active: "pesanan" }
  );
}

// ---------- conversations ----------
function contactStatus(c) {
  if (c.needs_attention) return '<span class="pill amber">Perlu admin</span>';
  if (c.ai_paused) return '<span class="pill">AI dijeda</span>';
  if (isAiPaused(c)) return '<span class="pill blue">AI diam sementara</span>';
  return '<span class="pill green">🤖 AI aktif</span>';
}

export function contactsPage(tenant, contacts) {
  const rows = contacts
    .map(
      (c) => `<a class="item" href="/percakapan/${c.id}">${avatar(c.name || c.phone, 46)}
        <div class="grow"><div class="title">${esc(c.name || c.phone)}</div><div class="sub">${esc((c.last_text || "").replace(/\s+/g, " ").slice(0, 90))}</div></div>
        <div class="meta"><span>${timeAgo(c.last_message_at)}</span>${contactStatus(c)}</div></a>`
    )
    .join("");
  return layout(
    "Percakapan",
    `${pageHead("Percakapan", "Chat pelanggan yang dibalas AI. Yang butuh kamu ditaruh paling atas.")}
    <div class="card" style="padding:8px">${rows ? `<div class="list">${rows}</div>` : emptyState("chat", "Belum ada chat masuk", "Setelah WhatsApp tersambung, chat pelanggan akan muncul di sini.")}</div>`,
    { tenant, active: "percakapan" }
  );
}

export function conversationPage(tenant, contact, messages, flash) {
  let lastDay = "";
  const bubbles = messages
    .map((m) => {
      const d = new Date(String(m.created_at).replace(" ", "T") + "Z");
      const day = Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" });
      const time = Number.isNaN(d.getTime()) ? esc(m.created_at) : d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
      const sep = day && day !== lastDay ? `<div class="day">${esc(day)}</div>` : "";
      lastDay = day || lastDay;
      const who = m.role === "user" ? "Pelanggan" : m.role === "admin" ? "👤 Admin" : "🤖 AI";
      return `${sep}<div class="msg ${m.role}"><div class="who">${who}</div>${waFormat(m.content)}<time>${time}</time></div>`;
    })
    .join("");
  const tempPaused = !contact.ai_paused && isAiPaused(contact);
  return layout(
    contact.name || contact.phone,
    `<p style="margin-top:0"><a href="/percakapan">${icon("back", 16).replace('class="ic"', 'class="ic" style="display:inline;vertical-align:-3px"')} Semua percakapan</a></p>
    <div class="chat">
      <div class="chat-head">${avatar(contact.name || contact.phone, 44)}
        <div class="grow"><b style="font-size:16px">${esc(contact.name || contact.phone)}</b><div class="muted small">${esc(contact.phone)}${
          tempPaused ? ` · AI diam sementara sampai ${esc(contact.ai_paused_until)} UTC` : ""
        }</div></div>
        ${contactStatus(contact)}
        <form method="post" action="/percakapan/${contact.id}/ai">
          <input type="hidden" name="paused" value="${contact.ai_paused ? 0 : 1}">
          <button class="secondary sm">${contact.ai_paused ? `${icon("play", 16)} Aktifkan AI lagi` : `${icon("pause", 16)} Jeda AI (ambil alih)`}</button></form>
      </div>
      <div class="chat-body" id="chat">${bubbles || emptyState("chat", "Belum ada pesan.")}</div>
      <form class="composer" method="post" action="/percakapan/${contact.id}/balas">
        <textarea name="message" required placeholder="Balas sebagai admin — AI otomatis diam 1 jam untuk chat ini" aria-label="Balas sebagai admin (AI otomatis diam 1 jam untuk chat ini)"></textarea>
        <button aria-label="Kirim">${icon("send", 20)}</button>
      </form>
    </div>
    <script>const c=document.getElementById("chat");c.scrollTop=c.scrollHeight;
    const t=document.querySelector(".composer textarea");t.addEventListener("input",()=>{t.style.height="46px";t.style.height=Math.min(t.scrollHeight,160)+"px"});
    t.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&t.value.trim()){e.preventDefault();t.form.submit()}});</script>`,
    { tenant, flash, active: "percakapan" }
  );
}

// ---------- settings ----------
export function settingsPage(tenant, flash) {
  const locked = !!tenant.fonnte_token;
  return layout(
    "Pengaturan",
    `${pageHead("Pengaturan", "Info di sini dipakai AI untuk menjawab pelanggan. Makin lengkap, makin sedikit chat yang perlu kamu balas sendiri.")}
    <form method="post" action="/pengaturan">
    <div class="grid g2">
      <div class="card"><div class="card-head"><h3>${icon("store", 18)} Toko &amp; WhatsApp</h3></div>
        <label>Nama toko</label><input name="name" required value="${esc(tenant.name)}">
        <label>Nomor WhatsApp toko <span class="hint">nomor yang dipakai pelanggan untuk chat${locked ? " — terkunci karena sudah dibuat device-nya" : ""}</span></label>
        <input name="wa_number" value="${esc(tenant.wa_number)}" placeholder="0812..." ${locked ? "readonly" : ""}>
        <div style="margin-top:10px">${waStatusHtml(tenant)}</div>
        <label>Nomor WA pemilik <span class="hint">untuk notifikasi pesanan, eskalasi, dan perintah #stop/#start. Harus beda dengan nomor toko.</span></label>
        <input name="owner_phone" value="${esc(tenant.owner_phone)}" placeholder="0813...">
        <label class="switch"><input type="checkbox" name="ai_enabled" value="1" ${tenant.ai_enabled ? "checked" : ""}><span class="track"></span> AI auto-reply aktif</label>
      </div>
      <div class="card"><div class="card-head"><h3>${icon("wallet", 18)} Cara pembayaran</h3></div>
        <label>Rekening / QRIS / e-wallet <span class="hint">dikirim AI setelah pesanan dibuat dan di pengingat bayar</span></label>
        <textarea name="payment_info" style="min-height:150px" placeholder="Transfer BCA 1234567890 a.n. ...">${esc(tenant.payment_info)}</textarea>
      </div>
    </div>
    <div class="card" style="margin-top:18px"><div class="card-head"><h3>${icon("bot", 18)} Pengetahuan AI</h3></div>
      <label>Info toko <span class="hint">jam buka, alamat, ongkir, kebijakan retur, FAQ — tulis bebas seperti menjelaskan ke karyawan baru</span></label>
      <textarea name="store_info" style="min-height:200px" placeholder="Buka setiap hari 08.00–20.00. Alamat: ... Ongkir dalam kota Rp10.000 ...">${esc(tenant.store_info)}</textarea>
      <p style="margin-bottom:0"><button>Simpan pengaturan</button></p>
    </div></form>`,
    { tenant, flash, active: "pengaturan" }
  );
}

// ---------- platform admin ----------
export function adminShopsPage(me, shops, flash) {
  const rows = shops
    .map(
      (t) => `<tr><td><a href="/admin/toko/${t.id}" style="display:flex;gap:10px;align-items:center;color:var(--text)">${avatar(t.name, 36)}<span><b>${esc(t.name)}</b><div class="muted small">${esc(t.email)}</div></span></a></td>
      <td>${esc(t.wa_number) || '<span class="muted">-</span>'}</td>
      <td>${t.fonnte_token ? (t.wa_status === "connect" ? '<span class="pill green">✅ Tersambung</span>' : '<span class="pill blue">Device siap</span>') : '<span class="pill amber">Belum</span>'}</td>
      <td>${t.active ? '<span class="pill green">Aktif</span>' : '<span class="pill red">Nonaktif</span>'}</td>
      <td><b>${t.orders30}</b></td><td><b>${t.ai30}</b></td><td class="muted small">${t.last_in ? timeAgo(t.last_in) : "-"}</td>
      <td class="muted small">${timeAgo(t.created_at)}</td></tr>`
    )
    .join("");
  const pending = shops.filter((t) => !t.fonnte_token).length;
  return layout(
    "Admin Platform",
    `${pageHead("Admin Platform", "Semua toko yang berlangganan WA Admin AI.")}
    <div class="grid g3" style="margin-bottom:18px">
      ${statCard("blue", "store", "Total toko", shops.length)}
      ${statCard("amber", "link", "Menunggu disambungkan", pending, pending > 0)}
      ${statCard("green", "bot", "Balasan AI (30 hari)", shops.reduce((a, t) => a + t.ai30, 0))}
    </div>
    <div class="card scroll" style="padding:8px 12px">${
      rows
        ? `<table><thead><tr><th>Toko</th><th>Nomor WA</th><th>Fonnte</th><th>Status</th><th>Pesanan 30h</th><th>Balasan AI 30h</th><th>Chat terakhir</th><th>Daftar</th></tr></thead><tbody>${rows}</tbody></table>`
        : emptyState("store", "Belum ada toko.")
    }</div>`,
    { tenant: me, flash, active: "admin" }
  );
}

export function adminShopPage(me, shop, webhookUrl, device, autoEnabled, flash) {
  const back = `<p style="margin-top:0"><a href="/admin">${icon("back", 16).replace('class="ic"', 'class="ic" style="display:inline;vertical-align:-3px"')} Semua toko</a></p>`;
  const devInfo = device?.error
    ? `<div class="banner amber">${icon("alert")}<div>${esc(device.error)}</div></div>`
    : device
      ? `<div class="grid g4">
          <div><div class="muted small">Status</div>${device.device_status === "connect" ? '<span class="pill green">✅ connect</span>' : `<span class="pill amber">⚠️ ${esc(device.device_status)}</span>`}</div>
          <div><div class="muted small">Paket</div><b>${esc(device.package)}</b></div>
          <div><div class="muted small">Kuota pesan</div><b>${esc(device.quota)}</b></div>
          <div><div class="muted small">Berlaku sampai</div><b>${esc(device.expired)}</b></div></div>`
      : '<p class="muted">Belum ada device.</p>';
  return layout(
    `Admin · ${shop.name}`,
    `${back}
    <div class="card" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">${avatar(shop.name, 54)}
      <div style="flex:1;min-width:200px"><h2 style="margin:0">${esc(shop.name)}</h2>
      <div class="muted small">${esc(shop.email)} · pemilik: ${esc(shop.owner_phone) || "-"} · daftar ${timeAgo(shop.created_at)}</div></div>
      ${shop.active ? '<span class="pill green">Aktif</span>' : '<span class="pill red">Nonaktif</span>'}</div>
    <div class="card"><div class="card-head"><h3>${icon("wa", 18)} Device Fonnte</h3></div>
      ${devInfo}
      ${shop.wa_status_reason ? `<p class="muted small">Event terakhir: ${esc(shop.wa_status)} — ${esc(shop.wa_status_reason)} (${esc(shop.wa_status_at)})</p>` : ""}
      ${
        autoEnabled
          ? `<form method="post" action="/admin/toko/${shop.id}/setup" style="margin-top:14px"><button>${shop.fonnte_token ? "Atur ulang webhook device" : "Buat device otomatis"}</button></form>
             <p class="muted small">Pemilik lalu scan QR sendiri di menu <b>WhatsApp</b> dashboard-nya. Ingat: tiap device yang tersambung butuh paket Fonnte berbayar (hanya 1 device gratis per akun).</p>`
          : `<div class="banner amber" style="margin-top:14px">${icon("alert")}<div>FONNTE_ACCOUNT_TOKEN belum diisi, jadi pembuatan device otomatis nonaktif. Gunakan langkah manual di bawah.</div></div>`
      }</div>
    <details class="card"><summary><b>Langkah manual (tanpa API)</b></summary>
      <ol class="steps" style="margin-top:14px">
        <li><div>Login dashboard Fonnte → <b>Add device</b> dengan nomor <b>${esc(shop.wa_number) || "(pedagang belum mengisi nomor toko)"}</b>.</div></li>
        <li><div>Edit device: set <b>Autoread ON</b> (wajib, tanpa ini webhook tidak jalan), personal ON, group OFF.</div></li>
        <li><div>Isi <b>Webhook</b>: <code>${esc(webhookUrl)}</code><br>dan <b>Webhook connect</b>: <code>${esc(webhookUrl)}/status</code></div></li>
        <li><div>Salin <b>token device</b> ke form di bawah dan simpan. Pemilik lalu scan QR dari menu WhatsApp di dashboard-nya.</div></li>
      </ol></details>
    <div class="card"><div class="card-head"><h3>${icon("gear", 18)} Pengaturan toko</h3></div>
      <form method="post" action="/admin/toko/${shop.id}">
      <label>Nomor WA toko (device Fonnte)</label><input name="wa_number" value="${esc(shop.wa_number)}">
      <label>Token device Fonnte <span class="hint">${shop.fonnte_token ? `tersimpan: ••••${esc(shop.fonnte_token.slice(-4))} — kosongkan jika tidak diganti` : "belum ada"}</span></label>
      <input name="fonnte_token" type="password" autocomplete="off" placeholder="${shop.fonnte_token ? "biarkan kosong untuk tetap" : "tempel token di sini"}">
      ${shop.fonnte_token ? '<label class="check"><input type="checkbox" name="clear_token" value="1"> Hapus token (putuskan WA)</label>' : ""}
      <label class="switch"><input type="checkbox" name="active" value="1" ${shop.active ? "checked" : ""}><span class="track"></span> Akun aktif <span class="muted small">(matikan untuk menangguhkan, misalnya belum bayar)</span></label>
      <div class="actions"><button>Simpan</button></div></form>
      <form method="post" action="/admin/toko/${shop.id}/tes" style="margin-top:12px">
        ${shop.owner_phone ? "" : '<label>Nomor tujuan tes</label><input name="target" placeholder="0812...">'}
        <button class="secondary">${icon("send", 16)} Tes kirim WA${shop.owner_phone ? ` ke ${esc(shop.owner_phone)}` : ""}</button></form></div>`,
    { tenant: me, flash, active: "admin" }
  );
}

// ---------- WhatsApp connection page ----------
export function whatsappPage(tenant, autoEnabled, flash) {
  const connected = tenant.fonnte_token && tenant.wa_status === "connect";
  let body;
  if (!tenant.wa_number) {
    body = `<div class="card">${emptyState("wa", "Satu langkah lagi", "")}<p style="text-align:center;margin-top:-12px">Isi dulu <b>nomor WhatsApp toko</b> di <a href="/pengaturan">Pengaturan</a>.</p></div>`;
  } else if (connected) {
    body = `<div class="card connected">
      <div class="check-big">${icon("shield", 40)}</div>
      <h2>WhatsApp ${esc(tenant.wa_number)} sudah tersambung.</h2>
      <p class="muted">AI siap membalas chat pelanggan 24 jam. Kamu bisa menutup halaman ini.</p>
      <form method="post" action="/whatsapp/putus" onsubmit="return confirm('Putuskan WhatsApp? AI berhenti membalas sampai disambungkan lagi.')">
        <button class="danger sm">Putuskan WhatsApp</button></form></div>`;
  } else if (!tenant.fonnte_token) {
    body = autoEnabled
      ? `<div class="card" style="text-align:center;padding:36px 20px">
          <div class="empty" style="padding:0 0 8px"><div class="big">${icon("wa")}</div></div>
          <h2>Sambungkan WhatsApp tokomu</h2>
          <p class="muted">Nomor toko: <b>${esc(tenant.wa_number)}</b> · cukup sekali, seperti login WhatsApp Web.</p>
          <form method="post" action="/whatsapp/mulai"><button>Sambungkan WhatsApp</button></form>
          <p class="muted small">Setelah diklik, QR akan muncul di halaman ini.</p></div>`
      : `<div class="card">${emptyState("clock", "Sedang disiapkan")}<p style="text-align:center;margin-top:-12px">⏳ Tim kami akan menyiapkan sambungan untuk nomor <b>${esc(tenant.wa_number)}</b>. Kamu akan dikabari jika QR sudah siap.</p></div>`;
  } else {
    body = `<div class="card"><div class="grid g2" style="align-items:center">
      <div style="text-align:center;padding:12px 0">
        <div class="qr-wrap" id="qrbox"><div class="spinner"></div></div>
        <div id="codebox" class="code-box" style="display:none"></div>
        <p style="margin-top:22px"><button type="button" class="secondary sm" id="toggle">Tidak bisa scan? Pakai kode</button></p>
      </div>
      <div>
        <span class="pill blue"><span class="dot live"></span> Menunggu scan…</span>
        <h2 style="margin-top:12px">Cara menyambungkan</h2>
        <ol class="steps" id="steps-qr">
          <li><div>Buka <b>WhatsApp</b> di HP yang memakai nomor <b>${esc(tenant.wa_number)}</b>.</div></li>
          <li><div>Ketuk <b>⋮ / Pengaturan → Perangkat tertaut → Tautkan perangkat</b>.</div></li>
          <li><div>Arahkan kamera ke QR di samping.</div></li>
        </ol>
        <ol class="steps" id="steps-code" style="display:none">
          <li><div>Buka <b>WhatsApp</b> nomor <b>${esc(tenant.wa_number)}</b>.</div></li>
          <li><div>Ketuk <b>Perangkat tertaut → Tautkan perangkat → Tautkan dengan nomor telepon saja</b>.</div></li>
          <li><div>Masukkan kode yang tampil di samping.</div></li>
        </ol>
        <p class="muted small" style="margin-top:16px">QR diperbarui otomatis. Halaman ini akan berubah sendiri setelah tersambung.</p>
        <p id="err" class="warn"></p>
      </div></div></div>
      <script>
      (() => {
        let mode = "qr";
        const box = document.getElementById("qrbox"), code = document.getElementById("codebox"), err = document.getElementById("err");
        async function load() {
          err.textContent = "";
          try {
            const r = await (await fetch("/whatsapp/qr?type=" + mode)).json();
            if (r.connected) return location.reload();
            if (r.error) { err.textContent = r.error; return; }
            if (mode === "qr") { box.innerHTML = '<img alt="QR WhatsApp" style="width:248px;height:248px" src="data:image/png;base64,' + r.qr + '">'; }
            else { code.textContent = r.code; }
          } catch (e) { err.textContent = "Gagal memuat, mencoba lagi…"; }
        }
        async function poll() {
          try { const r = await (await fetch("/whatsapp/status")).json(); if (r.status === "connect") location.reload(); } catch (e) {}
        }
        document.getElementById("toggle").onclick = (ev) => {
          mode = mode === "qr" ? "code" : "qr";
          box.style.display = mode === "qr" ? "grid" : "none"; code.style.display = mode === "code" ? "block" : "none";
          document.getElementById("steps-qr").style.display = mode === "qr" ? "" : "none";
          document.getElementById("steps-code").style.display = mode === "code" ? "" : "none";
          ev.target.textContent = mode === "qr" ? "Tidak bisa scan? Pakai kode" : "Pakai QR";
          load();
        };
        load(); setInterval(load, 30000); setInterval(poll, 5000);
      })();
      </script>`;
  }
  return layout(
    "Sambungkan WhatsApp",
    `${pageHead("WhatsApp toko", "Hubungkan nomor WhatsApp tokomu supaya AI bisa membalas pelanggan.")}${body}`,
    { tenant, flash, active: "whatsapp" }
  );
}
