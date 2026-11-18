// node render.cjs <fmt> <mode: stills|video> <out> [fps] [t1,t2,...]
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const [fmt, mode, out, fpsArg, timesArg] = process.argv.slice(2);
const L = fmt === "yt";
const W = L ? 1920 : 1080, H = L ? 1080 : 1920, fps = Number(fpsArg || 30);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H } });
  await p.goto("file://" + __dirname + "/" + fmt + ".html", { waitUntil: "networkidle" });
  await p.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
  const total = await p.evaluate(() => window.TOTAL);
  await p.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
  const seek = (t) => p.evaluate((ms) => document.getAnimations().forEach((a) => (a.currentTime = ms)), t * 1000);
  if (mode === "stills") {
    for (const t of timesArg.split(",").map(Number)) { await seek(t); await p.screenshot({ path: `${out}-${String(t).replace(".", "_")}.jpg`, quality: 80, type: "jpeg" }); }
  } else {
    const ff = spawn("ffmpeg", ["-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-i", "-",
      "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
    const n = Math.round(total * fps);
    for (let i = 0; i < n; i++) {
      await seek(i / fps);
      const buf = await p.screenshot({ type: "jpeg", quality: 92 });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
      if (i % (fps * 10) === 0) console.log(`${fmt}: ${Math.round((i / n) * 100)}%`);
    }
    ff.stdin.end();
    await new Promise((r) => ff.on("close", r));
  }
  await b.close();
})();
