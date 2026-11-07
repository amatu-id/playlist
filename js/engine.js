// engine.js — one player facade over three engines:
//   yt : YouTube IFrame player (full songs + video)
//   au : Hi-Fi <audio> → Web Audio FX chain (Spotify/iTunes previews, radio, local files)
//   sp : Spotify embed (iFrame API)
window.Engine = (function () {
  const ev = {};
  const on = (n, f) => (ev[n] = ev[n] || []).push(f);
  const emit = (n, ...a) => (ev[n] || []).forEach((f) => f(...a));

  let cur = null, vol = 0.8, muted = false, fadeK = 1, rate = 1, eqState = null, fxBypass = false;
  const eff = () => (muted ? 0 : vol * fadeK);

  // Phones. iOS suspends Web Audio when the screen locks and an element routed through it falls silent with it, so
  // on iOS songs always play from a plain element. Other phones do so too unless an EQ setting actually changes the sound.
  const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const PHONE = IOS || /Android/.test(navigator.userAgent);
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari */ }
  const fxUseful = (e) => !!e && e.on && (e.bands.some(Boolean) || !!e.pre || !!e.bass || !!e.treble || e.width !== 100 || !!e.bal || !!e.comp || e.room !== 'off');
  const noGraph = () => IOS || (PHONE && !fxUseful(eqState));

  // ---------- YouTube
  const yt = { p: null, ready: null, lastState: -1, err: false };
  function ytInit() {
    if (yt.ready) return yt.ready;
    yt.ready = new Promise((res, rej) => {
      window.onYouTubeIframeAPIReady = () => {
        yt.p = new YT.Player('ytp', {
          width: '100%', height: '100%',
          playerVars: { autoplay: 1, controls: 0, disablekb: 1, rel: 0, playsinline: 1, iv_load_policy: 3, fs: 0, modestbranding: 1, origin: location.origin },
          events: {
            onReady: () => res(yt.p),
            onStateChange: (e) => {
              yt.lastState = e.data;
              if (cur !== 'yt') return;
              if (e.data === 1) { applyVol(); applyRate(); emit('state', true); }
              else if (e.data === 2) emit('state', false);
              else if (e.data === 0) { emit('state', false); finish(); }
              else if (e.data === 3) emit('buffering');
            },
            onError: (e) => { yt.err = true; if (cur === 'yt') emit('error', { eng: 'yt', code: e.data }); },
          },
        });
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { yt.ready = null; rej(new Error('YouTube tidak dapat dimuat')); };
      document.head.appendChild(s);
    });
    return yt.ready;
  }

  // ---------- Hi-Fi audio
  // spare: the next song buffers in a second FX element and takes over the moment the current one ends, so no gap.
  // Not on phones or Safari, where a second element can't start without a touch (the same element keeps the session).
  const SPARE = !PHONE && !/^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const au = { el: new Audio(), raw: new Audio(), spare: new Audio(), spareUrl: '', ctx: null, fx: null, a: null, live: false, src: '', bridging: false, noCors: '' };
  for (const a of [au.el, au.spare]) a.crossOrigin = 'anonymous';
  for (const a of [au.el, au.raw, au.spare]) a.preload = 'auto';
  const main = () => (noGraph() || au.noCors === au.src ? au.raw : au.el);
  const isCur = (a) => cur === 'au' && au.a === a && !au.bridging;
  const fresh = (u) => u.replace(/([?&])_r=[^&]*&?/, '$1').replace(/[?&]$/, '') + (u.includes('?') ? '&' : '?') + '_r=' + Date.now().toString(36);
  for (const a of [au.el, au.raw, au.spare]) {
    a.addEventListener('playing', () => { if (isCur(a)) { wd.began = true; emit('state', true); } });
    a.addEventListener('pause', () => { if (isCur(a)) emit('state', false); });
    a.addEventListener('waiting', () => { if (isCur(a)) emit('buffering'); });
    a.addEventListener('ended', () => { if (isCur(a)) { emit('state', false); finish(); } });
    a.addEventListener('loadedmetadata', () => { if (isCur(a)) emit('meta'); });
    a.addEventListener('progress', () => { if (isCur(a)) wd.prog = performance.now(); });
  }
  for (const x of [au.el, au.spare]) x.addEventListener('error', () => {
    if (x === au.spare) { au.spareUrl = ''; return; }
    if (!isCur(x) || !x.getAttribute('src') || x.src.startsWith('data:')) return;
    // CORS refused (common for radio) → play untouched without FX
    if (au.live || au.src.startsWith('http')) {
      const at = au.el.currentTime;
      au.noCors = au.src;
      au.a = au.raw; au.raw.src = au.src;
      if (at && !au.live) startAt(au.raw, at);
      applyVol(); applyRate();
      au.raw.play().catch(() => { /* a failed load reports through the element's error event, a refusal through the watchdog */ });
      emit('fx', false);
    } else emit('error', { eng: 'au', code: au.el.error && au.el.error.code });
  });
  au.raw.addEventListener('error', () => { if (isCur(au.raw) && au.raw.getAttribute('src') && !au.raw.src.startsWith('data:')) emit('error', { eng: 'au', code: au.raw.error && au.raw.error.code }); });

  function fxInit() {
    if (au.ctx) return;
    const C = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
    au.ctx = C;
    au.fx = FX.make(C);
    C.createMediaElementSource(au.el).connect(au.fx.input);
    if (SPARE) C.createMediaElementSource(au.spare).connect(au.fx.input);
    au.fx.apply(fxBypass ? Object.assign({}, eqState, { on: false }) : eqState);
  }

  // One second of silence (8 kHz, 8 bit) for priming and bridging.
  const SILENT = (() => {
    const n = 8000, b = new Uint8Array(44 + n).fill(128), d = new DataView(b.buffer);
    const tag = (at, t) => { for (let i = 0; i < 4; i++) b[at + i] = t.charCodeAt(i); };
    tag(0, 'RIFF'); d.setUint32(4, 36 + n, true); tag(8, 'WAVE'); tag(12, 'fmt '); d.setUint32(16, 16, true);
    d.setUint16(20, 1, true); d.setUint16(22, 1, true); d.setUint32(24, 8000, true); d.setUint32(28, 8000, true);
    d.setUint16(32, 1, true); d.setUint16(34, 8, true); tag(36, 'data'); d.setUint32(40, n, true);
    return 'data:audio/wav;base64,' + btoa(String.fromCharCode.apply(null, b));
  })();

  // A user gesture (tap/click/key) unlocks the Hi-Fi element + AudioContext once, so a track whose stream URL
  // arrives seconds later (ad-free server) still starts by itself — Safari/iOS otherwise blocks that play().
  let unlocked = false;
  function unlock() {
    if (!IOS) try { fxInit(); if (au.ctx.state === 'suspended') au.ctx.resume(); } catch (e) { /* no Web Audio */ }
    const a = main();
    if (unlocked || cur === 'au' || a.getAttribute('src')) return;
    unlocked = true;
    a.src = SILENT;
    const p = a.play();
    const done = () => { if (a.src === SILENT && !au.bridging) { a.pause(); a.removeAttribute('src'); a.load(); } };
    if (p && p.then) p.then(done, () => { unlocked = false; done(); }); else done();
  }

  // Between two songs nothing would be playing while the next stream is looked up, and a locked iPhone freezes the
  // page in that gap so the next song never starts. Silence keeps the audio session, and with it this page, alive.
  function bridge() {
    if (!PHONE || cur === 'yt' || cur === 'sp') return;
    const a = main();
    if (au.bridging && !a.paused) return;
    if (au.a && au.a !== a) au.a.pause();
    au.bridging = true; au.a = a;
    a.loop = true; a.src = SILENT;
    a.play().catch(() => { /* not unlocked yet: the song itself asks again */ });
  }
  // A start position set before the metadata is loaded is ignored by some Safari versions.
  function startAt(a, t) {
    a.currentTime = t;
    a.addEventListener('loadedmetadata', () => { if (a.src !== SILENT && Math.abs(a.currentTime - t) > 2) a.currentTime = t; }, { once: true });
  }

  // May this page start sound with no gesture? A silent clip must play and Web Audio must run, otherwise a song
  // would look like it is playing while nothing is heard.
  async function canAutoplay() {
    try { const a = new Audio(SILENT); await a.play(); a.pause(); } catch (e) { return false; }
    if (noGraph()) return true;
    try {
      fxInit();
      if (au.ctx.state === 'suspended') await Promise.race([au.ctx.resume(), new Promise((r) => setTimeout(r, 400))]);
      return au.ctx.state === 'running';
    } catch (e) { return false; }
  }

  // ---------- Spotify embed
  const sp = { api: null, ready: null, c: null, paused: true, pos: 0, dur: 0, auto: false, lastPos: 0 };
  function spInit() {
    if (sp.ready) return sp.ready;
    sp.ready = new Promise((res, rej) => {
      window.onSpotifyIframeApiReady = (api) => { sp.api = api; res(api); };
      const s = document.createElement('script');
      s.src = 'https://open.spotify.com/embed/iframe-api/v1';
      s.async = true;
      s.onerror = () => { sp.ready = null; rej(new Error('Spotify tidak dapat dimuat')); };
      document.head.appendChild(s);
    });
    return sp.ready;
  }
  function spUpdate(e) {
    const d = e.data || e;
    const wasPaused = sp.paused;
    sp.paused = !!d.isPaused; sp.pos = (d.position || 0) / 1000; sp.dur = (d.duration || 0) / 1000;
    if (cur !== 'sp') return;
    if (sp.paused !== wasPaused) emit('state', !sp.paused);
    if (sp.paused && sp.dur && sp.lastPos > sp.dur - 1.6 && sp.pos < 1) { sp.lastPos = 0; finish(); return; }
    sp.lastPos = sp.pos;
  }

  // ---------- facade
  function applyVol() {
    const v = eff();
    if (cur === 'yt' && yt.p && yt.p.setVolume) { yt.p.setVolume(Math.round(v * 100)); if (v > 0 && yt.p.isMuted && yt.p.isMuted()) yt.p.unMute(); }
    if (au.a) au.a.volume = Math.min(1, Math.max(0, v));
  }
  function applyRate() {
    if (cur === 'yt' && yt.p && yt.p.setPlaybackRate) yt.p.setPlaybackRate(rate);
    if (au.a) { au.a.playbackRate = rate; au.a.preservesPitch = true; }
  }

  // Android: an EQ setting turned on or off mid-song moves the song between the plain and the EQ element, same second.
  function reroute() {
    const m = main();
    if (cur !== 'au' || !au.a || au.a === m || au.bridging || !au.src) return;
    const t = au.a.currentTime, on = !au.a.paused, o = au.a;
    if (m === au.el) { fxInit(); if (au.ctx.state === 'suspended') au.ctx.resume(); }
    o.pause(); o.removeAttribute('src');
    au.a = m; m.loop = false; m.src = au.src;
    if (t && !au.live) startAt(m, t);
    applyVol(); applyRate();
    emit('fx', m === au.el);
    if (on) m.play().catch(() => {});
  }

  function stopOthers(keep) {
    if (keep !== 'yt' && yt.p && yt.p.pauseVideo) try { yt.p.pauseVideo(); } catch (e) { /* not ready */ }
    if (keep !== 'au') { for (const a of [au.el, au.raw]) { a.pause(); } }
    if (keep !== 'sp' && sp.c && !sp.paused) try { sp.c.pause(); } catch (e) { /* ignore */ }
  }

  async function load(spec, opt) {
    opt = opt || {};
    const start = opt.start || 0, auto = opt.autoplay !== false;
    au.bridging = false;
    stopOthers(spec.eng);
    cur = spec.eng;
    want = auto; resetWd(); wd.resumes = [];
    plan = null; endSent = false;
    // a fade-out of the previous song must never carry over: that plays the whole song at volume 0 while the seconds run
    if (!opt.keepFade) fade(1, 0);
    emit('engine', cur);
    if (spec.eng === 'yt') {
      const p = await ytInit();
      if (cur !== 'yt') return;
      yt.err = false; yt.lastState = -1; yt.id = spec.id; wd.at = performance.now();
      if (auto) p.loadVideoById({ videoId: spec.id, startSeconds: start });
      else p.cueVideoById({ videoId: spec.id, startSeconds: start });
      applyVol();
    } else if (spec.eng === 'au') {
      au.live = !!spec.live; au.src = spec.url;
      au.startMs = opt.startMs || 0; wd.began = false; wd.loadAt = performance.now();
      let a = main();
      const o = a === au.el ? au.raw : au.el;
      if (a === au.el) { fxInit(); if (au.ctx.state === 'suspended') au.ctx.resume(); }
      o.pause(); o.removeAttribute('src');
      if (a === au.el && au.spareUrl === spec.url) {
        const old = au.el;
        au.el = au.spare; au.spare = old; au.spareUrl = '';
        old.pause(); old.removeAttribute('src'); old.load();
        a = au.el;
      } else {
        a.src = spec.url;
      }
      au.a = a; a.loop = false;
      if (start) startAt(a, start);
      applyVol(); applyRate();
      emit('fx', a === au.el);
      // refused while the page is hidden: keep the intent, it starts when the watchdog or the user's return allows it
      if (auto) await a.play().catch((e) => { if (e.name === 'NotAllowedError' && !document.hidden) { emit('state', false); emit('blocked'); } });
    } else if (spec.eng === 'sp') {
      const api = await spInit();
      if (cur !== 'sp') return;
      sp.auto = auto; sp.lastPos = 0;
      if (!sp.c) {
        await new Promise((res) => api.createController(document.getElementById('spp'), { uri: spec.uri, width: '100%', height: 152 }, (c) => {
          sp.c = c;
          c.addListener('playback_update', spUpdate);
          c.addListener('ready', () => { if (sp.auto) { sp.auto = false; c.play(); } });
          res();
        }));
      } else {
        sp.c.loadUri(spec.uri);
        if (auto) setTimeout(() => { if (cur === 'sp') sp.c.play(); }, 700);
      }
    }
  }

  function play(auto) {
    want = true;
    if (!auto) wd.resumes = [];
    wd.at = performance.now();
    if (cur === 'yt' && yt.p) yt.p.playVideo();
    else if (cur === 'au' && au.a) { if (au.ctx && au.ctx.state !== 'running') au.ctx.resume(); au.a.play().catch(() => {}); }
    else if (cur === 'sp' && sp.c) sp.c.resume();
  }
  function preload(url) {
    if (!SPARE || au.spareUrl === url || !url) return;
    try { fxInit(); } catch (e) { return; }
    au.spareUrl = url;
    au.spare.src = url;
    au.spare.load();
  }
  function pause() {
    want = false;
    if (au.bridging) { au.bridging = false; if (au.a) au.a.pause(); }
    if (cur === 'yt' && yt.p) yt.p.pauseVideo();
    else if (cur === 'au' && au.a) au.a.pause();
    else if (cur === 'sp' && sp.c) sp.c.pause();
  }
  function playing() {
    if (cur === 'yt') return yt.lastState === 1 || yt.lastState === 3;
    if (cur === 'au') return !!au.a && !au.a.paused && !au.bridging;
    if (cur === 'sp') return !sp.paused;
    return false;
  }
  function time() {
    if (cur === 'yt' && yt.p && yt.p.getCurrentTime) return yt.p.getCurrentTime() || 0;
    if (au.bridging) return 0;
    if (cur === 'au' && au.a) return au.a.currentTime || 0;
    if (cur === 'sp') return sp.pos;
    return 0;
  }
  function rawDuration() {
    if (cur === 'yt' && yt.p && yt.p.getDuration) return yt.p.getDuration() || 0;
    if (au.bridging) return 0;
    if (cur === 'au' && au.a) return isFinite(au.a.duration) ? au.a.duration : 0;
    if (cur === 'sp') return sp.dur;
    return 0;
  }
  // a song followed by silence ends where the sound ends: the bar shows that length and the next song starts there
  function duration() {
    const d = rawDuration();
    return plan && plan.end && d > plan.end ? plan.end : d;
  }
  function buffered() {
    if (cur === 'yt' && yt.p && yt.p.getVideoLoadedFraction) return yt.p.getVideoLoadedFraction() || 0;
    if (cur === 'au' && au.a && !au.bridging && au.a.buffered.length && duration()) return au.a.buffered.end(au.a.buffered.length - 1) / duration();
    return 0;
  }
  function seek(t) {
    endSent = false; resetWd();
    if (cur === 'yt' && yt.p) yt.p.seekTo(t, true);
    else if (cur === 'au' && au.a && !au.live && !au.bridging) au.a.currentTime = t;
    else if (cur === 'sp' && sp.c) sp.c.seek(t);
  }
  // Timer-driven (not requestAnimationFrame): rAF never fires while the window is minimized or the tab is in the
  // background, which left the next song stuck at volume 0 and media-key "next" waiting forever.
  let fadeT = 0, fadeDone = null;
  function fade(to, ms) {
    clearTimeout(fadeT);
    if (fadeDone) { fadeDone(); fadeDone = null; }
    const from = fadeK, t0 = performance.now();
    if (!ms) { fadeK = to; applyVol(); return Promise.resolve(); }
    return new Promise((res) => {
      fadeDone = res;
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / ms);
        fadeK = from + (to - from) * k;
        applyVol();
        if (k < 1) fadeT = setTimeout(step, 30); else { fadeDone = null; res(); }
      };
      step();
    });
  }

  // ---------- keep playing: the page wants music unless the user paused it. A song the browser or YouTube paused
  // on its own (window minimized, tab in the background, audio device change) is resumed, and a stream that stops
  // advancing (audio server / radio connection dropped) is reconnected at the same spot, then handed to the error path.
  let want = false, plan = null, endSent = false;
  const wd = { t: -1, at: 0, fixes: 0, resumes: [], seekAt: 0, flat: 0, quiet: 0, ctxBad: 0, began: false, loadAt: 0, prog: 0 };
  function resetWd() { wd.t = -1; wd.at = performance.now(); wd.fixes = 0; wd.seekAt = 0; wd.flat = 0; wd.quiet = 0; wd.ctxBad = 0; }
  function finish() { if (endSent) return; endSent = true; emit('end'); }
  function resume() {
    const now = performance.now(), win = document.hidden ? 600e3 : 60e3;   // another app taking the audio on a phone must win
    wd.resumes = wd.resumes.filter((x) => now - x < win);
    if (wd.resumes.length >= 4) return;   // something keeps pausing it: stop fighting
    wd.resumes.push(now);
    play(true);
  }
  // Silent stretches found in the stream: jump over them, end the song where its sound ends.
  function followPlan() {
    if (!plan || !want || au.bridging || !cur || !playing()) return;
    const t = time();
    for (const [a, b] of plan.skips) if (t >= a && t < b - 0.5) { seek(b); return; }
    if (plan.end && t >= plan.end) finish();
  }
  setInterval(followPlan, 400);
  // Volume stuck low though nothing is fading: whatever left it there, the song must be heard.
  function volumeGuard() {
    if (fadeK > 0.99 || fadeDone || !playing()) { wd.flat = 0; return; }
    if (++wd.flat >= 3) { wd.flat = 0; fade(1, 300); emit('fadefix'); }
  }
  // The element runs but nothing comes out of Web Audio: first wake it, then play without it. Digital silence for
  // seconds on end is reported too, the app checks the stream itself to tell a silent song from a dead output.
  const anBuf = new Float32Array(4096);
  function outputGuard(a, t) {
    if (a !== au.el || !au.ctx || au.live) { wd.quiet = 0; wd.ctxBad = 0; return; }
    if (au.ctx.state !== 'running') {
      au.ctx.resume().catch(() => {});
      if (++wd.ctxBad >= 3) { wd.ctxBad = 0; useRaw(); }
      return;
    }
    wd.ctxBad = 0;
    if (!au.fx || fadeK < 0.5 || a.volume <= 0 || t < 1) { wd.quiet = 0; return; }
    au.fx.n.an.getFloatTimeDomainData(anBuf);
    let peak = 0;
    for (let i = 0; i < anBuf.length; i += 2) { const x = Math.abs(anBuf[i]); if (x > peak) peak = x; }
    if (peak / a.volume >= 0.002) { wd.quiet = 0; return; }
    if (++wd.quiet >= 6) { wd.quiet = -20; emit('silent', t); }   // asks again in 26 s if it stays silent
  }
  function useRaw() {
    if (cur !== 'au' || au.a !== au.el) return;
    au.noCors = au.src;
    reroute();
  }
  setInterval(() => {
    if (!want || !cur) return;
    volumeGuard();
    const now = performance.now();
    if (cur === 'yt' && yt.p && !yt.err) {
      const st = yt.lastState;
      if (st === 0) { wd.at = now; return; }
      if (st === 2 || st === 5 || (st === -1 && now - wd.at > 6000)) { resume(); return; }
      if (st !== 1 && st !== 3) return;
      const t = yt.p.getCurrentTime ? yt.p.getCurrentTime() : 0;
      if (t !== wd.t) { wd.t = t; wd.at = now; return; }
      if (now - wd.at < 20e3) return;
      wd.at = now;
      if (wd.fixes++ < 1 && yt.id) yt.p.loadVideoById({ videoId: yt.id, startSeconds: t });
      else emit('error', { eng: 'yt', code: 'stall' });
    } else if (cur === 'au' && au.a && au.a.getAttribute('src')) {
      const a = au.a;
      if (au.bridging) { if (a.paused && now - wd.at > 1500) { wd.at = now; a.play().catch(() => {}); } return; }
      if (a.ended) { wd.at = now; finish(); return; }
      // A stream that gives nothing right after it was asked for usually never will, and a hanging connection raises
      // no error event at all. Report it soon, the app has other ways to get the song.
      if (au.startMs && !wd.began && !a.paused) {
        // data still arriving, only slowly, gets more time
        if ((now - Math.max(wd.loadAt, wd.prog) < au.startMs && now - wd.loadAt < 20e3) || navigator.onLine === false) return;
        wd.loadAt = now;
        emit('error', { eng: 'au', code: 'start' });
        return;
      }
      if (a.seeking && (!wd.seekAt || now - wd.seekAt < 10e3)) { wd.seekAt = wd.seekAt || now; wd.at = now; return; }
      wd.seekAt = 0;
      if (a.paused) { wd.loadAt = now; if (now - wd.at > 1500) resume(); return; }
      const t = a.currentTime;
      if (t !== wd.t) { wd.t = t; wd.at = now; outputGuard(a, t); return; }
      const d = duration();
      if (d && d - t < 2.5 && now - wd.at > 3000) { finish(); return; }   // the last bytes never came: the song is over anyway
      if (now - wd.at < (t > 0.5 ? 8e3 : 15e3) || navigator.onLine === false) return;
      wd.at = now;
      if (wd.fixes++ < 1) {
        if (au.ctx && au.ctx.state !== 'running') au.ctx.resume();
        // a new address: the browser holds a second request for the same one back while the stuck one is alive
        if (au.startMs) { const was = au.src; au.src = fresh(was); if (au.noCors === was) au.noCors = au.src; wd.began = false; wd.loadAt = now; }
        a.src = a === au.raw && !au.startMs ? au.raw.src : au.src;
        if (t && !au.live) startAt(a, t);
        a.play().catch(() => {});
      } else emit('error', { eng: 'au', code: 'stall' });
    }
  }, 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) wd.resumes = [];
    if (!document.hidden && want && !playing() && !au.bridging) play(true);
    if (!document.hidden && au.ctx && au.ctx.state !== 'running' && cur === 'au') au.ctx.resume();
  });

  return {
    on, load, play: () => play(), pause, began: () => wd.began, unlock, bridge, canAutoplay, phone: PHONE, ios: IOS, noGraph, wanted: () => want, ytInit, playing, time, duration, buffered, seek, fade, useRaw, preload,
    setPlan(p) { plan = p && (p.end || p.skips.length) ? p : null; if (plan && !plan.end) endSent = false; },
    finish,
    toggle() { playing() ? pause() : play(); },
    get eng() { return cur; },
    setVol(v) { vol = v; applyVol(); },
    setMuted(m) { muted = m; applyVol(); },
    setRate(r) { rate = r; applyRate(); },
    rates() { return cur === 'yt' && yt.p && yt.p.getAvailablePlaybackRates ? yt.p.getAvailablePlaybackRates() : [0.5, 0.75, 1, 1.25, 1.5, 2]; },
    eq(e, bypass) { eqState = e; fxBypass = !!bypass; if (au.fx) au.fx.apply(bypass ? Object.assign({}, e, { on: false }) : e); reroute(); },
    fx() { return au.fx; },
    hasFx() { return cur === 'au' && au.a === au.el && !au.bridging; },
    isLive() { return cur === 'au' && au.live; },
    ytVideo() { return yt.p && yt.p.getVideoData ? yt.p.getVideoData() : null; },
    stop(keepBridge) {
      want = false;
      if (keepBridge && au.bridging) stopOthers('au'); else { au.bridging = false; stopOthers(null); }
      cur = null; emit('engine', null);
    },
  };
})();
