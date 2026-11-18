# Sumber video promo

Video promo dibuat dari animasi HTML/CSS yang dirender per frame (30 fps).

- `build.mjs`: naskah, durasi tiap adegan, dan desain. Menghasilkan `yt.html`/`tt.html` dan `*.timeline.json`.
- `render.cjs`: merender HTML menjadi MP4 dengan Playwright (Chromium) dan ffmpeg.

Menyesuaikan timing dengan narasi ElevenLabs: ubah angka durasi adegan di array `YT`/`TT` pada `build.mjs`, lalu jalankan:

```bash
node build.mjs .
node render.cjs yt video Promo-YouTube-WA-Admin-AI.mp4 30
node render.cjs tt video Promo-TikTok-WA-Admin-AI.mp4 30
```

Butuh: Node.js 22, paket `playwright` (Chromium), dan `ffmpeg`. Path gambar di `build.mjs` (konstanta `IMG`) menunjuk ke `docs/manual/img`, jadi sesuaikan dengan lokasi repo di komputermu.
