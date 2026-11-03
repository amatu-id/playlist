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

  // ---------- YouTube
  const yt = { p: null, ready: null, lastState: -1, wantPlay: false };
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
              else if (e.data === 0) { emit('state', false); emit('end'); }
              else if (e.data === 3) emit('buffering');
            },
            onError: (e) => { if (cur === 'yt') emit('error', { eng: 'yt', code: e.data }); },
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
  const au = { el: new Audio(), raw: new Audio(), ctx: null, fx: null, a: null, live: false, src: '' };
  au.el.crossOrigin = 'anonymous';
  au.el.preload = 'auto';
  au.raw.preload = 'none';
  for (const a of [au.el, au.raw]) {
    a.addEventListener('playing', () => { if (cur === 'au' && au.a === a) emit('state', true); });
    a.addEventListener('pause', () => { if (cur === 'au' && au.a === a) emit('state', false); });
    a.addEventListener('waiting', () => { if (cur === 'au' && au.a === a) emit('buffering'); });
    a.addEventListener('ended', () => { if (cur === 'au' && au.a === a) { emit('state', false); emit('end'); } });
    a.addEventListener('loadedmetadata', () => { if (cur === 'au' && au.a === a) emit('meta'); });
  }
  au.el.addEventListener('error', () => {
    if (cur !== 'au' || au.a !== au.el || !au.el.getAttribute('src') || au.el.src.startsWith('data:')) return;
    // CORS refused (common for radio) → play untouched without FX
    if (au.live || au.src.startsWith('http')) {
      au.a = au.raw; au.raw.src = au.src; applyVol(); applyRate();
      au.raw.play().catch((e) => emit('error', { eng: 'au', code: 'play', msg: e.message }));
      emit('fx', false);
    } else emit('error', { eng: 'au', code: au.el.error && au.el.error.code });
  });
  au.raw.addEventListener('error', () => { if (cur === 'au' && au.a === au.raw && au.raw.getAttribute('src')) emit('error', { eng: 'au', code: au.raw.error && au.raw.error.code }); });

  function fxInit() {
    if (au.ctx) return;
    const C = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
    au.ctx = C;
    au.fx = FX.make(C);
    C.createMediaElementSource(au.el).connect(au.fx.input);
    au.fx.apply(fxBypass ? Object.assign({}, eqState, { on: false }) : eqState);
  }

  // A user gesture (tap/click/key) unlocks the Hi-Fi element + AudioContext once, so a track whose stream URL
  // arrives seconds later (ad-free relay) still starts by itself — Safari/iOS otherwise blocks that play().
  let unlocked = false;
  const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  function unlock() {
    try { fxInit(); if (au.ctx.state === 'suspended') au.ctx.resume(); } catch (e) { /* no Web Audio */ }
    if (unlocked || cur === 'au' || au.el.getAttribute('src')) return;
    unlocked = true;
    au.el.src = SILENT;
    const p = au.el.play();
    const done = () => { if (au.el.src === SILENT) { au.el.pause(); au.el.removeAttribute('src'); au.el.load(); } };
    if (p && p.then) p.then(done, () => { unlocked = false; done(); }); else done();
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
    if (sp.paused && sp.dur && sp.lastPos > sp.dur - 1.6 && sp.pos < 1) { sp.lastPos = 0; emit('end'); return; }
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

  function stopOthers(keep) {
    if (keep !== 'yt' && yt.p && yt.p.pauseVideo) try { yt.p.pauseVideo(); } catch (e) { /* not ready */ }
    if (keep !== 'au') { for (const a of [au.el, au.raw]) { a.pause(); } }
    if (keep !== 'sp' && sp.c && !sp.paused) try { sp.c.pause(); } catch (e) { /* ignore */ }
  }

  async function load(spec, opt) {
    opt = opt || {};
    const start = opt.start || 0, auto = opt.autoplay !== false;
    stopOthers(spec.eng);
    cur = spec.eng;
    emit('engine', cur);
    if (spec.eng === 'yt') {
      const p = await ytInit();
      if (cur !== 'yt') return;
      if (auto) p.loadVideoById({ videoId: spec.id, startSeconds: start });
      else p.cueVideoById({ videoId: spec.id, startSeconds: start });
      applyVol();
    } else if (spec.eng === 'au') {
      fxInit();
      if (au.ctx.state === 'suspended') au.ctx.resume();
      au.live = !!spec.live; au.src = spec.url;
      au.raw.pause(); au.raw.removeAttribute('src');
      au.a = au.el;
      au.el.src = spec.url;
      if (start) au.el.currentTime = start;
      applyVol(); applyRate();
      emit('fx', true);
      if (auto) await au.el.play().catch((e) => { if (e.name === 'NotAllowedError') emit('state', false); });
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

  function play() {
    if (cur === 'yt' && yt.p) yt.p.playVideo();
    else if (cur === 'au' && au.a) { if (au.ctx && au.ctx.state === 'suspended') au.ctx.resume(); au.a.play().catch(() => {}); }
    else if (cur === 'sp' && sp.c) sp.c.resume();
  }
  function pause() {
    if (cur === 'yt' && yt.p) yt.p.pauseVideo();
    else if (cur === 'au' && au.a) au.a.pause();
    else if (cur === 'sp' && sp.c) sp.c.pause();
  }
  function playing() {
    if (cur === 'yt') return yt.lastState === 1 || yt.lastState === 3;
    if (cur === 'au') return !!au.a && !au.a.paused;
    if (cur === 'sp') return !sp.paused;
    return false;
  }
  function time() {
    if (cur === 'yt' && yt.p && yt.p.getCurrentTime) return yt.p.getCurrentTime() || 0;
    if (cur === 'au' && au.a) return au.a.currentTime || 0;
    if (cur === 'sp') return sp.pos;
    return 0;
  }
  function duration() {
    if (cur === 'yt' && yt.p && yt.p.getDuration) return yt.p.getDuration() || 0;
    if (cur === 'au' && au.a) return isFinite(au.a.duration) ? au.a.duration : 0;
    if (cur === 'sp') return sp.dur;
    return 0;
  }
  function buffered() {
    if (cur === 'yt' && yt.p && yt.p.getVideoLoadedFraction) return yt.p.getVideoLoadedFraction() || 0;
    if (cur === 'au' && au.a && au.a.buffered.length && duration()) return au.a.buffered.end(au.a.buffered.length - 1) / duration();
    return 0;
  }
  function seek(t) {
    if (cur === 'yt' && yt.p) yt.p.seekTo(t, true);
    else if (cur === 'au' && au.a && !au.live) au.a.currentTime = t;
    else if (cur === 'sp' && sp.c) sp.c.seek(t);
  }
  let fadeRaf = 0;
  function fade(to, ms) {
    cancelAnimationFrame(fadeRaf);
    const from = fadeK, t0 = performance.now();
    if (!ms) { fadeK = to; applyVol(); return Promise.resolve(); }
    return new Promise((res) => {
      const step = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        fadeK = from + (to - from) * k;
        applyVol();
        if (k < 1) fadeRaf = requestAnimationFrame(step); else res();
      };
      fadeRaf = requestAnimationFrame(step);
    });
  }

  return {
    on, load, play, pause, unlock, ytInit, playing, time, duration, buffered, seek, fade,
    toggle() { playing() ? pause() : play(); },
    get eng() { return cur; },
    setVol(v) { vol = v; applyVol(); },
    setMuted(m) { muted = m; applyVol(); },
    setRate(r) { rate = r; applyRate(); },
    rates() { return cur === 'yt' && yt.p && yt.p.getAvailablePlaybackRates ? yt.p.getAvailablePlaybackRates() : [0.5, 0.75, 1, 1.25, 1.5, 2]; },
    eq(e, bypass) { eqState = e; fxBypass = !!bypass; if (au.fx) au.fx.apply(bypass ? Object.assign({}, e, { on: false }) : e); },
    fx() { return au.fx; },
    hasFx() { return cur === 'au' && au.a === au.el; },
    isLive() { return cur === 'au' && au.live; },
    ytVideo() { return yt.p && yt.p.getVideoData ? yt.p.getVideoData() : null; },
    stop() { stopOthers(null); cur = null; emit('engine', null); },
  };
})();
