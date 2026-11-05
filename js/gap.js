// gap.js — where is an audio stream actually silent? Some uploads carry minutes of silence after the song. YouTube's
// audio is constant bitrate, so byte sizes say nothing: a few 10-second fragments are fetched (the small 48 kbps
// format when there is one) and decoded. Only samples the song, so it costs a fraction of playing it.
window.Gap = (function () {
  const LOUD = 0.003;          // peak of a 0.1 s block: about -50 dB
  const TAIL_MIN = 5, MID_MIN = 8, MARGIN = 0.8, PROBE_EVERY = 60, FULL_SCAN_FROM = 300;
  const num = (r) => String(r || '').split('-').map(Number);

  async function range(url, a, b, signal) {
    const r = await fetch(url, { headers: { Range: `bytes=${a}-${b}` }, signal });
    if (r.status !== 206 && r.status !== 200) throw new Error('http ' + r.status);
    const buf = await r.arrayBuffer();
    return r.status === 200 ? buf.slice(a, b + 1) : buf;
  }
  // ISO BMFF segment index: byte size and length of every fragment
  function parseSidx(buf, fileAt) {
    const v = new DataView(buf);
    let p = 0;
    while (p + 8 <= v.byteLength && v.getUint32(p + 4) !== 0x73696478) { const s = v.getUint32(p); if (s < 8) return null; p += s; }
    if (p + 32 > v.byteLength) return null;
    const box = p, size = v.getUint32(p), ver = v.getUint8(p + 8), scale = v.getUint32(p + 16);
    p += 20;
    let first;
    if (ver === 0) { first = v.getUint32(p + 4); p += 8; } else { first = v.getUint32(p + 8) * 4294967296 + v.getUint32(p + 12); p += 16; }
    const n = v.getUint16(p + 2);
    p += 4;
    let at = fileAt + box + size + first, t = 0;
    const segs = [];
    for (let i = 0; i < n; i++, p += 12) {
      const bytes = v.getUint32(p) & 0x7fffffff, d = v.getUint32(p + 4) / scale;
      segs.push({ from: at, to: at + bytes - 1, t, d });
      at += bytes; t += d;
    }
    return segs;
  }

  let dec = null;
  const decoder = () => dec || (dec = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 22050));
  function decode(buf) {
    return new Promise((res, rej) => { const p = decoder().decodeAudioData(buf, res, rej); if (p && p.catch) p.catch(rej); });
  }

  // first and last moment with sound inside a fragment (null = all silent)
  function envelope(ab) {
    const block = Math.max(1, Math.floor(ab.sampleRate / 10)), blocks = Math.floor(ab.length / block);
    let first = -1, last = -1;
    const chans = [];
    for (let c = 0; c < ab.numberOfChannels; c++) chans.push(ab.getChannelData(c));
    for (let b = 0; b < blocks; b++) {
      let peak = 0;
      for (const d of chans) for (let i = b * block, e = i + block; i < e; i += 4) { const x = d[i] < 0 ? -d[i] : d[i]; if (x > peak) peak = x; }
      if (peak >= LOUD) { if (first < 0) first = b; last = b; }
    }
    return first < 0 ? null : { first: first / 10, last: (last + 1) / 10 };
  }

  // fm: { url, init:'0-722', index:'723-1018' }
  async function open(fm, signal) {
    const [ia, ib] = num(fm.init), [xa, xb] = num(fm.index);
    if (!(ib >= 0 && xb > xa)) throw new Error('no index');
    const [init, idx] = await Promise.all([range(fm.url, ia, ib, signal), range(fm.url, xa, xb, signal)]);
    const segs = parseSidx(idx, xa);
    if (!segs || !segs.length) throw new Error('no segments');
    const memo = new Map();
    const sound = (i) => {
      if (memo.has(i)) return memo.get(i);
      const p = (async () => {
        const s = segs[i], body = await range(fm.url, s.from, s.to, signal);
        const all = new Uint8Array(init.byteLength + body.byteLength);
        all.set(new Uint8Array(init), 0); all.set(new Uint8Array(body), init.byteLength);
        return envelope(await decode(all.buffer));
      })();
      memo.set(i, p);
      return p;
    };
    const total = segs[segs.length - 1].t + segs[segs.length - 1].d;
    return { segs, sound, total };
  }
  // first index in (lo, hi] whose state differs from lo's, the two ends being known to differ
  async function edge(S, lo, hi, loSound) {
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (!!(await S.sound(m)) === loSound) lo = m; else hi = m;
    }
    return hi;
  }

  // → { end: second the song is really over (0 = plays to the end), skips: [[from, to], …] }
  async function scan(fm, signal) {
    const S = await open(fm, signal), n = S.segs.length, last = n - 1;
    const step = Math.max(1, Math.round(PROBE_EVERY / S.segs[0].d));
    const probes = [0];
    if (S.total >= FULL_SCAN_FROM) for (let i = step; i < last; i += step) probes.push(i);
    if (last > 0) probes.push(last);
    const st = [];
    for (const i of probes) st.push(await S.sound(i));
    const plan = { end: 0, skips: [] };
    if (!st.some(Boolean)) return plan;   // nothing loud anywhere: not something to act on

    // silent stretches between the probes, as [first silent fragment, last silent fragment]
    const runs = [];
    let open_ = null;
    for (let k = 0; k < probes.length; k++) {
      const quiet = !st[k];
      if (quiet && !open_) {
        const from = k === 0 ? 0 : await edge(S, probes[k - 1], probes[k], true);
        open_ = { from };
      } else if (!quiet && open_) {
        const firstLoud = await edge(S, probes[k - 1], probes[k], false);
        runs.push({ from: open_.from, to: firstLoud - 1 });
        open_ = null;
      }
    }
    if (open_) runs.push({ from: open_.from, to: last, tail: true });

    for (const r of runs) {
      const before = r.from > 0 ? await S.sound(r.from - 1) : null;
      const a = before ? S.segs[r.from - 1].t + before.last + MARGIN : S.segs[r.from].t;
      if (r.tail) { if (S.total - a >= TAIL_MIN) plan.end = a; continue; }
      const after = await S.sound(r.to + 1);
      const b = S.segs[r.to + 1].t + (after ? after.first : 0);
      if (b - a >= MID_MIN) plan.skips.push([a, Math.max(a, b - 0.2)]);
    }
    if (!plan.end && st[st.length - 1]) {   // a shorter silence inside the very last fragment
      const s = S.segs[last], e = await S.sound(last);
      if (e && S.total - (s.t + e.last + MARGIN) >= TAIL_MIN) plan.end = s.t + e.last + MARGIN;
    }
    return plan;
  }

  // Heard nothing at second t. → { now:true } the stream has sound here (so the fault is in the output),
  // { at } sound comes back at that second, or { over:true } nothing more until the end.
  async function ahead(fm, t, signal) {
    const S = await open(fm, signal), last = S.segs.length - 1;
    let i = S.segs.findIndex((s) => t < s.t + s.d);
    if (i < 0) return { over: true };
    const here = await S.sound(i);
    if (here && S.segs[i].t + here.last > t + 0.3) {
      const at = S.segs[i].t + here.first;
      return at <= t + 1 ? { now: true } : { at };
    }
    let lo = i, hi = i + 1, stepUp = 1;
    while (hi <= last && !(await S.sound(hi))) { lo = hi; stepUp *= 2; hi = Math.min(last + 1, hi + stepUp); }
    if (hi > last) {
      if (lo === last || !(await S.sound(last))) return { over: true };
      hi = last;
    }
    const f = await edge(S, lo, hi, false);
    const e = await S.sound(f);
    return { at: S.segs[f].t + (e ? e.first : 0) };
  }

  return { scan, ahead };
})();
