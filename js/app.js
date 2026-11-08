// app.js — Amatu Playlist UI: library, queue, views, panels, EQ, lyrics, radio, stats
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bg = (u) => (u ? ` style="background-image:url(&quot;${esc(String(u).replace(/"/g, '%22'))}&quot;)"` : '');
  const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  const uid = () => Math.random().toString(36).slice(2, 10);
  const touch = matchMedia('(hover: none)').matches;
  const mobile = () => innerWidth <= 860;
  const icon = (n, cls) => `<svg${cls ? ` class="${cls}"` : ''}><use href="#i-${n}"/></svg>`;
  const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };

  // ---------------------------------------------------------------- state
  const KEY = 'amatu.playlist', QKEY = 'amatu.playlist.q';
  const DEF = {
    v: 1, likes: [], lists: [], saved: [], hist: [], plays: {}, recentCtx: [], recent: [], match: {}, noAf: {},
    eq: JSON.parse(JSON.stringify(FX.DEF)), myPresets: {},
    set: { spMode: 'yt', fade: 2, autoRadio: true, video: true, panel: true, ptab: 'np', adFree: true, floatLy: true, autoResume: true },
    vol: 0.8, muted: false, rate: 1, shuffle: false, repeat: 0, listenSec: 0,
  };
  function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  const S = Object.assign({}, DEF, load(KEY, {}));
  delete S.alt;   // older versions kept a replacement upload for good, see useAlt
  S.set = Object.assign({}, DEF.set, S.set);
  S.eq = Object.assign({}, FX.DEF, S.eq);
  const save = debounce(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Penyimpanan penuh', 'err'); } }, 400);
  let Q = Object.assign({ list: [], i: 0, ctx: null, orig: null, t: 0 }, load(QKEY, {}));
  // the queue syncs to the account (written on changes only); the play position stays in this tab
  const saveQ = debounce(() => { try { localStorage.setItem(QKEY, JSON.stringify({ list: Q.list.filter((t) => t.src !== 'file'), i: Q.i, ctx: Q.ctx, orig: null })); } catch (e) { /* ignore */ } }, 600);
  try { Q.t = +sessionStorage.getItem('amatu.playlist.t') || 0; } catch (e) { Q.t = 0; }
  // lanjut otomatis: song, second and "was it playing" of this device (pt.* keys never sync to the account)
  const POS = 'pt.pl.pos', OTHER_TAB_MS = 12e3;
  const readPos = () => { try { return JSON.parse(localStorage.getItem(POS)); } catch (e) { return null; } };
  const otherTabPlays = (r) => !!(r && r.live && r.on && Date.now() - r.at < OTHER_TAB_MS);
  let posOn = false, disarmResume = null;
  // while a stream is still loading its time reads 0: keep the second it is about to start from
  const posNow = () => (Engine.eng && !$('#bar').classList.contains('loading') ? Engine.time() : Q.t || 0);
  function savePos(live) {
    try { localStorage.setItem(POS, JSON.stringify({ k: curKey(), t: Math.floor(posNow()), on: Engine.wanted(), live: !!live, at: Date.now() })); } catch (e) { /* ignore */ }
  }

  const key = (t) => t ? t.src + ':' + t.id : '';
  const lite = (t) => { const o = { src: t.src, id: t.id, title: t.title, artists: (t.artists || []).map((a) => (a.id ? { name: a.name, id: a.id } : { name: a.name })), sec: t.sec || 0, thumb: t.thumb || '' }; if (t.album) o.album = t.album; if (t.preview) o.preview = t.preview; if (t.kind) o.kind = t.kind; if (t.url && t.src === 'radio') o.url = t.url; return o; };
  const cur = () => Q.list[Q.i] || null;
  const curKey = () => key(cur());
  const liked = (t) => S.likes.some((x) => key(x) === key(t));
  const artistsText = (t) => (t.artists || []).map((a) => a.name).join(', ');
  function arts(t) {
    return (t.artists || []).map((a) => a.id ? `<a href="#artist/${esc(a.id)}">${esc(a.name)}</a>` : (t.src === 'radio' || t.src === 'file' ? esc(a.name) : `<a href="#search/${encodeURIComponent(a.name)}">${esc(a.name)}</a>`)).join(', ');
  }
  const srcIcon = (t) => t.src === 'sp' ? icon('sp', 'src sp') : '';

  // ---------------------------------------------------------------- toast / menu / modal
  function toast(msg, cls) {
    const d = document.createElement('div');
    d.className = 'toast ' + (cls || 'ok');
    d.textContent = msg;
    $('#toasts').appendChild(d);
    setTimeout(() => { d.style.transition = 'opacity .3s'; d.style.opacity = 0; setTimeout(() => d.remove(), 300); }, 2600);
  }
  const menu = $('#menu');
  function openMenu(items, at) {
    menu.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : it.head ? `<div class="mh">${esc(it.head)}</div>` : `<button data-mi="${i}">${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span>${it.check ? `<svg class="chk"><use href="#i-check"/></svg>` : ''}</button>`).join('');
    menu.hidden = false;
    menu.onclick = (e) => { const b = e.target.closest('[data-mi]'); if (!b) return; const it = items[+b.dataset.mi]; closeMenu(); it.run && it.run(); };
    const r = at.getBoundingClientRect ? at.getBoundingClientRect() : { left: at.x, right: at.x, top: at.y, bottom: at.y };
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let x = r.right - mw, y = r.bottom + 4;
    if (x < 8) x = Math.min(r.left, innerWidth - mw - 8);
    if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 4);
    menu.style.left = Math.max(8, x) + 'px'; menu.style.top = y + 'px';
  }
  function closeMenu() { menu.hidden = true; }
  document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); if (!$('#sugg').hidden && !e.target.closest('#sform')) $('#sugg').hidden = true; }, true);

  const modal = $('#modal');
  function openModal(html, bind) {
    $('#mcard').innerHTML = html;
    modal.hidden = false;
    bind && bind($('#mcard'));
    const f = $('#mcard input[type=text]');
    if (f) setTimeout(() => { f.focus(); f.select(); }, 30);
  }
  function closeModal() { modal.hidden = true; $('#mcard').innerHTML = ''; }
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) closeModal(); });
  function ask(title, value, label, cb) {
    openModal(`<h3>${esc(title)}</h3><form><label class="f">${esc(label || 'Nama')}<input type="text" maxlength="80" value="${esc(value || '')}"></label><div class="btns"><button type="button" class="btn" data-close>Batal</button><button class="btn pri">Simpan</button></div></form>`, (c) => {
      $('form', c).onsubmit = (e) => { e.preventDefault(); const v = $('input', c).value.trim(); if (!v) return; closeModal(); cb(v); };
    });
  }
  function confirmBox(title, text, ok, cb) {
    openModal(`<h3>${esc(title)}</h3><p style="color:var(--mut);margin:0 0 16px">${esc(text)}</p><div class="btns"><button class="btn" data-close>Batal</button><button class="btn pri" id="cOk">${esc(ok)}</button></div>`, (c) => { $('#cOk', c).onclick = () => { closeModal(); cb(); }; });
  }

  // ---------------------------------------------------------------- colour from artwork
  const tintCache = new Map();
  function tintOf(url) {
    if (!url) return Promise.resolve('30, 215, 96');
    if (tintCache.has(url)) return tintCache.get(url);
    const p = new Promise((res) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = c.height = 24;
          const g = c.getContext('2d'); g.drawImage(img, 0, 0, 24, 24);
          const d = g.getImageData(0, 0, 24, 24).data;
          let r = 0, gg = 0, b = 0, w = 0;
          for (let i = 0; i < d.length; i += 4) {
            const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
            const sat = mx ? (mx - mn) / mx : 0, k = 0.05 + sat * sat * (mx > 40 && mx < 245 ? 1 : 0.2);
            r += d[i] * k; gg += d[i + 1] * k; b += d[i + 2] * k; w += k;
          }
          r /= w; gg /= w; b /= w;
          const L = 0.299 * r + 0.587 * gg + 0.114 * b, f = L < 70 ? 70 / Math.max(L, 1) : L > 170 ? 170 / L : 1;
          res([r, gg, b].map((v) => Math.min(255, Math.round(v * f))).join(', '));
        } catch (e) { res(hashTint(url)); }
      };
      img.onerror = () => res(hashTint(url));
      img.src = url;
    });
    tintCache.set(url, p);
    return p;
  }
  function hashTint(s) {
    let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const hue = h % 360, a = 0.55, l = 0.42, f = (n) => { const k = (n + hue / 30) % 12; return Math.round(255 * (l - a * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return `${f(0)}, ${f(8)}, ${f(4)}`;
  }

  // ---------------------------------------------------------------- sliders
  function slider(el, o) {
    // o: {min,max,step,value,vertical,onInput(v,final),fmt}
    const st = { v: o.value };
    const pct = (v) => ((v - o.min) / (o.max - o.min)) * 100;
    const paint = () => {
      el.style.setProperty('--p', pct(st.v) + '%');
      if (o.vertical) {
        const z = pct(0 > o.min && 0 < o.max ? 0 : o.min), p = pct(st.v), vf = el.querySelector('.vf');
        if (vf) { vf.style.bottom = Math.min(z, p) + '%'; vf.style.height = Math.abs(p - z) + '%'; }
      }
    };
    const fromEv = (e) => {
      const r = el.getBoundingClientRect();
      let k = o.vertical ? 1 - (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
      k = Math.max(0, Math.min(1, k));
      let v = o.min + k * (o.max - o.min);
      if (o.step) v = Math.round(v / o.step) * o.step;
      return +v.toFixed(4);
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId); el.classList.add('act'); st.drag = true;
      st.v = fromEv(e); paint(); o.onInput && o.onInput(st.v, false);
    });
    el.addEventListener('pointermove', (e) => {
      if (o.tip) { const tip = el.querySelector('.tip'); if (tip) { const r = el.getBoundingClientRect(); tip.style.left = Math.max(0, Math.min(r.width, e.clientX - r.left)) + 'px'; tip.textContent = o.tip(fromEv(e)); } }
      if (!st.drag) return;
      st.v = fromEv(e); paint(); o.onInput && o.onInput(st.v, false);
    });
    const up = (e) => { if (!st.drag) return; st.drag = false; el.classList.remove('act'); o.onInput && o.onInput(st.v, true); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('dblclick', () => { if (o.reset != null) { st.v = o.reset; paint(); o.onInput && o.onInput(st.v, true); } });
    el.addEventListener('wheel', (e) => { if (!o.wheel) return; e.preventDefault(); st.v = Math.max(o.min, Math.min(o.max, st.v + (e.deltaY < 0 ? 1 : -1) * o.wheel)); paint(); o.onInput && o.onInput(st.v, true); }, { passive: false });
    paint();
    return { set(v) { if (!st.drag) { st.v = v; paint(); } }, get dragging() { return !!st.drag; } };
  }

  // ---------------------------------------------------------------- playback core
  let playTok = 0, fadeInMs = 0, curSpec = null, altTries = 0, afFix = 0, afAt = 0, listened = 0, counted = false, fadingOut = false, lastTick = 0, failRun = 0;
  const tried = new Set();

  // ---------------------------------------------------------------- ad-free audio (runs entirely from the web)
  // Public Invidious servers proxy YouTube's audio with CORS + Range → no ads, and it plays in the Hi-Fi engine so the
  // EQ works too. A dropped stream resumes at the same spot, a song no server can fetch tries another upload, and only
  // when nothing ad-free works the YouTube player takes over so the music never stops.
  const AMT = window.AMATU;
  const rtoken = () => (AMT && AMT.sess() && AMT.sess().t) || '';
  // video id → promise of its audio link
  const AF = new Map();
  // cloud: Invidious instances, the last one that worked first; the public list refreshes once a day
  const INV = ['https://yt.chocolatemoo53.com'];
  const C = { list: null, at: 0, ok: null, failAt: 0, hangAt: 0 };
  // never waited for: a song starts with what is known now, the list refreshes behind it
  function invList() {
    if (C.list && Date.now() - C.at < 864e5) return C.list;
    let l = [];
    try { const c = JSON.parse(localStorage.getItem('pt.pl.inv') || 'null'); if (c && Date.now() - c.t < 864e5) l = c.l; } catch (e) { /* ignore */ }
    const use = (x) => { C.list = [...new Set([...INV, ...x])].slice(0, 8); C.at = Date.now(); };
    use(l);
    if (!l.length) {
      fetch('https://api.invidious.io/instances.json?sort_by=health', { signal: AbortSignal.timeout(6000) }).then((r) => r.json()).then((d) => {
        const x = d.filter(([, i]) => i && i.api && i.type === 'https' && i.uri).map(([, i]) => i.uri.replace(/\/$/, ''));
        try { localStorage.setItem('pt.pl.inv', JSON.stringify({ t: Date.now(), l: x })); } catch (e) { /* ignore */ }
        use(x);
      }).catch(() => { /* list offline: built-ins only */ });
    }
    return C.list;
  }
  // what each video's stream is made of: length + the formats the silence scan can read
  const VM = new Map();
  async function askHost(h, id, ms) {
    const r = await fetch(`${h}/api/v1/videos/${encodeURIComponent(id)}?local=true&fields=adaptiveFormats,lengthSeconds`, { signal: AbortSignal.timeout(ms) });
    const d = await r.json();
    const fm = (d.adaptiveFormats || []).filter((f) => /^audio\/mp4/.test(f.type || '') && f.url);
    const f = fm.find((f) => String(f.itag) === '140') || fm.slice().sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    if (!f) throw Object.assign(new Error('no audio'), { answered: true });   // the server is fine, this video is not
    const abs = (x) => new URL(x.url, h).href, small = fm.find((f) => String(f.itag) === '139' && f.index) || f;
    VM.set(id, { sec: +d.lengthSeconds || 0, scan: small.index ? { url: abs(small), init: small.init, index: small.index } : null });
    if (VM.size > 300) VM.delete(VM.keys().next().value);
    return { h, url: withParam(abs(f), '_s', PAGE) };
  }
  // the server repeats a link for hours. A second request for one address waits in the browser while the first is alive,
  // so a page never shares its address with another tab or with what a reload left behind. The server ignores the extra.
  const PAGE = Date.now().toString(36);
  const withParam = (u, k, v) => u + (u.includes('?') ? '&' : '?') + k + '=' + v;
  // one slow answer must not decide the song: ask again after a moment, whichever answers first
  function askHedged(h, id) {
    return new Promise((res, rej) => {
      let left = 2, timer = 0, sent = false;
      const ask = (ms) => askHost(h, id, ms).then((v) => { clearTimeout(timer); sent = true; res(v); }, (e) => { if (e.answered || --left <= 0) { clearTimeout(timer); sent = true; rej(e); } else again(); });
      const again = () => { if (sent) return; sent = true; clearTimeout(timer); ask(5500); };
      ask(8000);
      timer = setTimeout(again, 2500);
    });
  }
  // the server that worked last, then all the others at once: a dead server must not keep the music waiting
  async function cloudUrl(id) {
    const l = invList(), first = C.ok || l[0];
    let answered = false;
    try {
      const a = await askHedged(first, id);
      C.ok = a.h; C.failAt = 0;
      return a.url;
    } catch (e) { answered = !!e.answered; }
    try {
      const a = await Promise.any(l.filter((h) => h !== first).map((h) => askHost(h, id, 4000)));
      C.ok = a.h; C.failAt = 0;
      return a.url;
    } catch (e) { answered = answered || (e.errors || []).some((x) => x.answered); }
    // one removed video says nothing about the server: only silence counts against it
    if (!answered) {
      if (C.ok && l.length) C.ok = null;
      C.failAt = Date.now();
    }
    throw new Error('cloud');
  }
  API.setInvHosts(() => [...new Set([C.ok, ...invList()].filter(Boolean))]);
  function adFreeUrl(id, fresh) {
    let c = AF.get(id);
    if (fresh || !c || Date.now() - c.t > 2 * 3600e3) {
      c = { p: cloudUrl(id), t: Date.now() };
      AF.set(id, c);
      c.p.catch(() => { if (AF.get(id) === c) AF.delete(id); });
      if (AF.size > 200) AF.delete(AF.keys().next().value);
    }
    return c.p.catch(() => null);
  }
  // phones always use the audio stream: the YouTube iframe stops as soon as the screen locks or the browser is minimized
  const adFreeOn = () => !!(S.set.adFree || Engine.phone);
  // How long a stream may stay without a first byte (normally 1–3 s). Just failed on another song: don't wait long again.
  const hungLately = () => Date.now() - C.hangAt < 300e3;
  const startLimit = () => (hungLately() ? 4000 : 6000);
  const wantsVideo = (t) => vidOverride.k === key(t) && vidOverride.v === true;
  async function ytSpec(t, id) {
    if (!adFreeOn() || wantsVideo(t)) return { eng: 'yt', id };
    if (cloudDown()) return { eng: 'af', ar: id };   // the server just failed: no second wait for the same answer
    const url = await adFreeUrl(id);
    if (url && id !== t.id && tooLong(id, t)) return { eng: 'af', ar: id };
    return url ? { eng: 'au', url, ar: id } : { eng: 'af', ar: id };
  }
  // A replacement upload only lasts this visit: it is often another singer's recording, and the song's own upload (which
  // has its lyrics) usually works again later.
  const ALT = {}, ALTBY = {};
  function useAlt(t, alt) {
    const o = t.src === 'yt' ? t.id : S.match[t.id];
    if (o) ALT[o] = alt.id;
    ALTBY[alt.id] = alt.artists || [];
  }
  // another upload of a song may be an extended version, a medley or a video with a long empty end
  const tooLong = (id, t) => { const m = VM.get(id), sec = m && m.sec; return !!sec && (t.sec ? sec > t.sec * 1.4 + 20 : sec > 540); };
  // nothing ad-free answers: the YouTube player keeps the music going (it may show ads)
  let ytFbAt = 0, bgRetry = 0;
  function ytFallback(t, tok, at) {
    if (tok !== playTok) return;
    const id = (curSpec && curSpec.ar) || [...tried][0] || (t.src === 'yt' ? t.id : S.match[t.id]);
    if (!id) return next(true);
    // screen locked: the iframe could not play anyway, so stay alive on silence and ask the audio sources again
    if (Engine.phone && document.hidden && bgRetry < 30) {
      bgRetry++;
      Engine.bridge();
      setTimeout(() => { if (tok === playTok) startCur({ start: at > 1 ? at : 0 }); }, 20e3);
      return;
    }
    if (Date.now() - ytFbAt > 600e3) toast('Server bebas iklan tidak tersedia — memakai pemutar YouTube (bisa ada iklan)', 'err');
    ytFbAt = Date.now();
    curSpec = { eng: 'yt', id }; altTries = 3;
    Engine.load(curSpec, { autoplay: true, start: at > 1 ? at : 0 }).then(() => { if (tok === playTok) $('#bar').classList.remove('loading'); }, () => {});
    renderNow(); scanSong(tok);
    if (!at) { addHist(t); loadLyrics(t); }
  }
  // no source can fetch this upload → another upload of the same song, still ad-free
  async function afAlt(t, tok) {
    const until = Date.now() + 10e3;   // looking for another upload must not take longer than the YouTube player needs
    while (altTries < 3 && Date.now() < until) {
      altTries++;
      const d = await Promise.race([API.search(`${t.title} ${artistsText(t)}`, altTries === 1 ? 'songs' : 'videos').catch(() => null), new Promise((r) => setTimeout(r, 6000, null))]);
      if (tok !== playTok) return;
      const cands = d ? API.tracksOf(d.items).filter((x) => !tried.has(x.id)).slice(0, 4) : [];
      for (const alt of cands) {
        if (Date.now() >= until) break;
        tried.add(alt.id);
        const url = await adFreeUrl(alt.id, true);
        if (tok !== playTok) return;
        if (!url && !C.ok) break;   // the servers are down: other uploads won't help
        if (!url || tooLong(alt.id, t)) continue;
        useAlt(t, alt);
        curSpec = { eng: 'au', url, ar: alt.id }; afFix = 0;
        Engine.load(curSpec, { autoplay: true, start: Q.t > 1 ? Q.t : 0, startMs: startLimit() });   // another upload carries on near the same second
        renderNow(); addHist(t); loadLyrics(t); scanSong(tok);
        return;
      }
      if (cands.length && !C.ok) break;
    }
    ytFallback(t, tok, Q.t);
  }
  // ---------------------------------------------------------------- phones: screen off / browser in the background
  // The YouTube player (fallback, or Video turned on) stops the moment a phone's screen goes off or the browser is
  // minimized. The song moves to the audio stream at the same second.
  let bgMove = 0;
  async function ytToAudio() {
    const t = cur(), spec = curSpec, tok = playTok;
    if (!Engine.phone || !document.hidden || Engine.eng !== 'yt' || !Engine.wanted() || !t || !spec || !spec.id || bgMove === tok) return;
    bgMove = tok;
    const at = Engine.time() || Q.t || 0;
    const url = await adFreeUrl(spec.id, cloudDown());
    if (tok !== playTok || curSpec !== spec || !document.hidden) { if (bgMove === tok) bgMove = 0; return; }
    if (url && !tooLong(spec.id, t)) {
      curSpec = { eng: 'au', url, ar: spec.id };
      Engine.load(curSpec, { autoplay: true, start: Math.max(Engine.time(), at) > 1 ? Math.max(Engine.time(), at) : 0, startMs: startLimit() });
      scanSong(tok);
      return;
    }
    // no stream right now: hold the audio session on silence and ask again (ytFallback keeps retrying while hidden)
    Engine.stop(); Engine.bridge();
    setTimeout(() => { if (tok === playTok) startCur({ start: at > 1 ? at : 0 }); }, 15e3);
  }
  // Back on screen the song stays on the audio stream: a phone would refuse to start the video without a tap, and the
  // Video button brings it back at the same second.
  document.addEventListener('visibilitychange', () => { if (document.hidden) ytToAudio(); else bgMove = 0; });
  // the YouTube player paused itself while hidden (screen off came before the switch could run, or the system paused it)
  Engine.on('state', (p) => { if (!p && document.hidden) ytToAudio(); });
  // on a phone the stream of a song playing in the YouTube player is looked up ahead, so the switch is instant
  Engine.on('engine', (e) => { if (e === 'yt' && Engine.phone && curSpec && curSpec.id && !cloudDown()) adFreeUrl(curSpec.id); });

  // ---------------------------------------------------------------- silence inside the stream
  const GAPS = new Map();
  let scanAbort = null;
  const curVid = () => curSpec && (curSpec.ar || curSpec.id) || '';
  async function scanSong(tok) {
    const id = curVid();
    if (!id || curSpec.live) return;
    if (scanAbort) scanAbort.abort();
    if (GAPS.has(id)) { Engine.setPlan(GAPS.get(id)); return; }
    scanAbort = new AbortController();
    try {
      if (!VM.has(id)) await adFreeUrl(id);
      const m = VM.get(id);
      if (!m || !m.scan || tok !== playTok) return;
      const p = await Gap.scan(m.scan, scanAbort.signal);
      GAPS.set(id, p);
      if (GAPS.size > 300) GAPS.delete(GAPS.keys().next().value);
      if (tok === playTok && curVid() === id) { Engine.setPlan(p); renderNow(); }
    } catch (e) { /* no scan: the live checks still apply */ }
  }
  // The output stayed silent for seconds. Stream silent too → jump to the next sound or the next song; stream has
  // sound here → the fault is the audio path, so play without it at the same second.
  let silentBusy = false;
  Engine.on('silent', async (at) => {
    const id = curVid(), tok = playTok;
    if (silentBusy || !id) return;
    silentBusy = true;
    try {
      if (!VM.has(id)) await adFreeUrl(id);
      const m = VM.get(id);
      const r = m && m.scan ? await Gap.ahead(m.scan, at) : null;
      if (tok !== playTok) return;
      if (!r) return;
      if (r.now) Engine.useRaw();
      else if (r.over) Engine.finish();
      else Engine.seek(r.at);
    } catch (e) { /* stream unreadable: leave the song playing */ }
    finally { silentBusy = false; }
  });
  const cloudDown = () => Date.now() - C.failAt < 60e3;
  // look up the next songs early so they start instantly
  const warmId = (t) => (t.src === 'yt' ? (ALT[t.id] || t.id) : t.src === 'sp' && S.set.spMode === 'yt' ? S.match[t.id] : null);
  function prefetchNext(withCur) {
    if (!adFreeOn() || cloudDown()) return;
    for (const t of Q.list.slice(Q.i + (withCur ? 0 : 1), Q.i + 3)) {
      const id = warmId(t);
      if (id) adFreeUrl(id);
    }
  }
  // the last half minute of a song: buffer the next one, it starts the moment this one ends
  let spareFor = 0;
  async function readySpare() {
    spareFor = playTok;
    if (!adFreeOn() || S.repeat === 2) return;
    const tok = playTok, k = curKey();
    const nx = Q.list[Q.i + 1] || (ahead && ahead.k === k && ahead.list[0]) || (!S.set.autoRadio || S.repeat === 1 ? Q.list[0] : null);
    const id = nx && nx.src !== 'radio' && !wantsVideo(nx) && warmId(nx);
    if (!id) return;
    const url = await adFreeUrl(id);
    if (url && tok === playTok && !tooLong(id, nx)) Engine.preload(url);
  }
  // last song of the queue: find what plays after it now, while it is still playing. On a locked phone the lookup
  // after the song ended may never finish. Kept aside so the visible queue and "add to queue" don't change.
  let ahead = null;
  function warmRadio() {
    if (!S.set.autoRadio || S.repeat === 1 || Q.i < Q.list.length - 1) return;
    const k = curKey();
    similarTo(cur()).then((l) => {
      if (curKey() !== k || !l.length) return;
      ahead = { k, list: l };
      const id = adFreeOn() && !cloudDown() && warmId(l[0]);
      if (id) adFreeUrl(id);
    }, () => {});
  }

  const MTHUMB = {};
  async function specFor(t) {
    if (t.src === 'yt') return ytSpec(t, ALT[t.id] || t.id);
    if (t.src === 'sp') {
      const m = S.set.spMode;
      if (m === 'embed') return { eng: 'sp', uri: 'spotify:track:' + t.id };
      if (m === 'preview' && t.preview) return { eng: 'au', url: t.preview };
      let id = S.match[t.id];
      if (!id) {
        const m2 = await API.match(t).catch(() => null);
        if (m2) { id = m2.id; MTHUMB[id] = m2.thumb; S.match[t.id] = id; const ks = Object.keys(S.match); if (ks.length > 600) delete S.match[ks[0]]; save(); }
      }
      if (id && !t.ownThumb) { t.ownThumb = true; t.thumb = MTHUMB[id] || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`; }
      if (id) return ytSpec(t, ALT[id] || id);
      if (t.preview) return { eng: 'au', url: t.preview };
      return { eng: 'sp', uri: 'spotify:track:' + t.id };
    }
    if (t.src === 'radio') return { eng: 'au', url: t.url, live: true };
    if (t.src === 'file') return { eng: 'au', url: t.url };
    return null;
  }

  async function startCur(opt) {
    opt = opt || {};
    const t = cur();
    if (!t) return;
    const tok = ++playTok;
    fadeInMs = 0;
    if (disarmResume) disarmResume();
    listened = 0; counted = false; fadingOut = false; altTries = 0; afFix = 0; tried.clear();
    Q.t = opt.start || 0;
    renderNow(); saveQ();
    $('#bar').classList.add('loading');
    // a stream already warmed starts at once; only a real wait needs the silent bridge
    // screen off on a phone: the page may be suspended within those 50 ms once the last song's sound stopped
    const wait = opt.autoplay !== false ? setTimeout(() => { if (tok === playTok) Engine.bridge(); }, Engine.phone && document.hidden ? 0 : 50) : 0;
    const spec = await specFor(t).catch(() => null);
    clearTimeout(wait);
    if (tok !== playTok) return;
    if (!spec) { toast('Lagu tidak tersedia', 'err'); return next(true); }
    if (spec.eng === 'af') {
      curSpec = null; tried.add(spec.ar);
      Engine.bridge(); Engine.stop(true);
      return cloudDown() ? ytFallback(t, tok, Q.t) : afAlt(t, tok);
    }
    curSpec = spec;
    if (spec.id) tried.add(spec.id);
    const fade = S.set.fade && opt.autoplay !== false && !spec.live;
    Engine.fade(fade ? 0 : 1, 0);
    // armed before the song starts: its 'playing' event comes first, and a fade-in set after it would leave seconds of silence
    if (fade) { fadeInMs = Math.min(2500, S.set.fade * 700); setTimeout(() => { if (tok === playTok && fadeInMs) { Engine.fade(1, fadeInMs); fadeInMs = 0; } }, 4000); }
    try { await Engine.load(spec, { start: opt.start || 0, autoplay: opt.autoplay !== false, keepFade: true, startMs: spec.ar ? startLimit() : 0 }); }
    catch (e) { toast(e.message || 'Gagal memuat pemutar', 'err'); return; }
    if (tok !== playTok) return;
    $('#bar').classList.remove('loading');
    if (opt.autoplay !== false) addHist(t);
    renderNow();
    loadLyrics(t);
    scanSong(tok);
    setTimeout(() => { if (tok === playTok) { prefetchNext(); warmRadio(); } }, 2500);
  }

  function setQueue(tracks, i, ctx, opt) {
    opt = opt || {};
    tracks = tracks.filter(Boolean);
    if (!tracks.length) return toast('Tidak ada lagu untuk diputar', 'err');
    Q.list = tracks.map((t) => Object.assign({}, t));
    Q.i = Math.max(0, Math.min(i || 0, Q.list.length - 1));
    Q.ctx = ctx || null; Q.orig = null;
    if (opt.shuffle != null) S.shuffle = opt.shuffle;
    if (S.shuffle) {
      if (opt.random) Q.i = Math.floor(Math.random() * Q.list.length);
      shuffleRest();
    }
    if (ctx && ctx.ref) {
      S.recentCtx = [{ ref: ctx.ref, title: ctx.name, thumb: ctx.thumb || tracks[0].thumb, href: ctx.href }].concat(S.recentCtx.filter((x) => x.ref !== ctx.ref)).slice(0, 8);
      save();
    }
    startCur();
    renderSideLists();
  }
  function shuffleRest() {
    Q.orig = Q.list.slice();
    const head = Q.list.splice(Q.i, 1)[0];
    for (let j = Q.list.length - 1; j > 0; j--) { const k = Math.floor(Math.random() * (j + 1)); [Q.list[j], Q.list[k]] = [Q.list[k], Q.list[j]]; }
    Q.list.unshift(head); Q.i = 0;
  }
  function toggleShuffle() {
    S.shuffle = !S.shuffle;
    if (Q.list.length) {
      if (S.shuffle) shuffleRest();
      else if (Q.orig) { const k = curKey(); const known = new Set(Q.orig.map(key)); Q.list = Q.orig.concat(Q.list.filter((t) => !known.has(key(t)))); Q.i = Math.max(0, Q.list.findIndex((t) => key(t) === k)); Q.orig = null; }
    }
    save(); saveQ(); renderControls(); renderPanel();
    toast(S.shuffle ? 'Acak aktif' : 'Acak nonaktif');
  }
  function cycleRepeat() { S.repeat = (S.repeat + 1) % 3; save(); renderControls(); toast(['Ulangi nonaktif', 'Ulangi semua', 'Ulangi satu lagu'][S.repeat]); }

  async function next(auto) {
    if (!Q.list.length) return;
    if (auto && sleep.end) { sleep.end = false; renderSleep(); Engine.pause(); toast('Timer tidur: pemutaran dihentikan'); return; }
    if (!auto && Engine.playing() && S.set.fade) await Engine.fade(0, 180);
    if (Q.i < Q.list.length - 1) { Q.i++; return startCur(); }
    if (S.repeat === 1) { Q.i = 0; return startCur(); }
    if (S.set.autoRadio) {
      const have = new Set(Q.list.map(key));
      let extra = ahead && ahead.k === curKey() ? ahead.list.filter((x) => !have.has(key(x))) : [];
      ahead = null;
      if (!extra.length) extra = await similarTo(cur()).catch(() => []);
      if (!extra.length) extra = await similarTo(cur()).catch(() => []);   // first call can hit a cold server
      if (extra.length) {
        Q.list.push(...extra); Q.i++;
        toast('Autoplay: memutar lagu serupa');
        return startCur();
      }
    }
    // nothing similar to add: start the queue again, even a single song, the music does not stop by itself
    Q.i = 0;
    if (Q.list.length > 1) toast('Mengulang antrean');
    return startCur();
  }
  async function prev() {
    if (Engine.time() > 4 || Q.i === 0) { Engine.seek(0); return; }
    if (Engine.playing() && S.set.fade) await Engine.fade(0, 150);
    Q.i--; startCur();
  }
  async function similarTo(t) {
    if (!t) return [];
    let id = t.src === 'yt' ? t.id : t.src === 'sp' ? S.match[t.id] : null;
    if (!id) return [];
    const have = new Set(Q.list.map(key));
    return (await API.radio(id)).filter((x) => !have.has(key(x))).slice(0, 25);
  }
  async function startRadio(t) {
    toast('Membuat radio dari "' + t.title + '"…');
    let id = t.src === 'yt' ? t.id : null;
    if (t.src === 'sp') { id = S.match[t.id] || ((await API.match(t).catch(() => null)) || {}).id; }
    if (!id) return toast('Radio tidak tersedia untuk lagu ini', 'err');
    const list = await API.radio(id).catch(() => []);
    if (!list.length) return toast('Radio tidak tersedia', 'err');
    if (t.src === 'sp') list[0] = Object.assign({}, t);
    else if (list[0].id !== id) list.unshift(Object.assign({}, t));   // a recommendation list doesn't start with the song itself
    setQueue(list, 0, { name: 'Radio · ' + t.title, href: '#home', ref: 'mix:' + id, thumb: t.thumb }, { shuffle: false });
  }
  function togglePlay() {
    if (!cur()) { const h = S.hist[0]; if (h) setQueue([h.t], 0, null); return; }
    if (!Engine.eng) return startCur({ start: Q.t || 0 });
    Engine.toggle();
  }
  function playNext(tracks) {
    tracks = [].concat(tracks).map((t) => Object.assign({}, t));
    if (!Q.list.length) return setQueue(tracks, 0, null);
    Q.list.splice(Q.i + 1, 0, ...tracks);
    saveQ(); renderPanel();
    toast(tracks.length > 1 ? `${tracks.length} lagu akan diputar berikutnya` : 'Diputar berikutnya');
  }
  function addQueue(tracks) {
    tracks = [].concat(tracks).map((t) => Object.assign({}, t));
    if (!Q.list.length) return setQueue(tracks, 0, null);
    Q.list.push(...tracks);
    saveQ(); renderPanel();
    toast(tracks.length > 1 ? `${tracks.length} lagu ditambahkan ke antrean` : 'Ditambahkan ke antrean');
  }

  // Can this page reach the stream at all? Chrome refuses the audio server's yt-comp hosts while their published ECH key
  // doesn't match (ERR_ECH_FALLBACK_CERTIFICATE_INVALID, curl is fine), then every song fails the same way.
  const unreachable = (url) => fetch(url, { headers: { Range: 'bytes=0-0' }, cache: 'no-store', signal: AbortSignal.timeout(4000) })
    .then((r) => r.status === 429 || r.status >= 500, () => true);
  let errBusy = 0;
  async function audioFailed(t, tok, err) {
    const spec = curSpec, id = spec.ar, at = Engine.time() || Q.t || 0, hang = err.code === 'start';
    if (Date.now() - afAt > 120e3) afFix = 0;   // a song that played for a while earned a new try
    afAt = Date.now();
    const gone = () => tok !== playTok || curSpec !== spec;
    const dead = !hang && !Engine.began() && await unreachable(spec.url);
    if (gone()) return;
    // one new link per song: the server repeats the same link for a while, more tries only keep the music waiting
    if (!dead && afFix++ < 1 && !(hang && hungLately())) {
      const url = await adFreeUrl(id, true);
      if (gone()) return;
      $('#bar').classList.add('loading');
      if (url) { curSpec = { eng: 'au', url: withParam(url, '_r', Date.now().toString(36)), ar: id }; Engine.load(curSpec, { autoplay: true, start: at > 1 ? at : 0, startMs: startLimit() }); return; }
      if (!C.ok) return ytFallback(t, tok, at);
    }
    tried.add(id);
    // the server can't be reached from here: another upload would fail the same way
    if (dead || hang) { C.hangAt = Date.now(); return ytFallback(t, tok, at); }
    return afAlt(t, tok);
  }
  // errors from engines: unembeddable / removed video → try an alternative upload
  Engine.on('error', async (err) => {
    const t = cur();
    if (!t) return;
    const tok = playTok;
    if (err.eng === 'au' && curSpec && curSpec.ar) {
      if (errBusy === tok) return;   // this song's failure is being handled
      errBusy = tok;
      try { await audioFailed(t, tok, err); } finally { if (errBusy === tok) errBusy = 0; }
      return;
    }
    if (err.eng === 'yt' && altTries < 3) {
      altTries++;
      const q = `${t.title} ${artistsText(t)}`;
      const d = await API.search(q, altTries === 1 ? 'songs' : 'videos').catch(() => null);
      if (tok !== playTok) return;
      const alt = d && API.tracksOf(d.items).find((x) => !tried.has(x.id) && !tooLong(x.id, t));
      if (alt) {
        tried.add(alt.id);
        useAlt(t, alt);
        curSpec = { eng: 'yt', id: alt.id };
        Engine.load(curSpec, { autoplay: true });
        scanSong(tok); loadLyrics(t);
        return;
      }
    }
    toast('Tidak dapat memutar "' + t.title + '" — lanjut', 'err');
    // nothing plays (no internet?): keep trying, but not through the queue at full speed
    setTimeout(() => { if (tok === playTok) next(true); }, ++failRun > 5 ? 15e3 : 1200);
  });
  Engine.on('end', () => {
    if (S.repeat === 2) { Engine.seek(0); Engine.play(); return; }
    next(true);
  });
  // other Amatu tabs drop their silent keep-alive (amatu.js) while a song plays here
  const audioBc = 'BroadcastChannel' in window ? new BroadcastChannel('amatu-audio') : null;
  Engine.on('state', (p) => {
    if (p && Engine.eng === 'au') C.hangAt = 0;
    if (p) { bgRetry = 0; failRun = 0; $('#rsm').hidden = true; if (audioBc) audioBc.postMessage('playing'); }
    $('#bar').classList.remove('loading');
    if (p && fadeInMs) { Engine.fade(1, fadeInMs); fadeInMs = 0; }
    renderPlayState(p);
  });
  Engine.on('engine', () => { Engine.setPlan(GAPS.get(curVid()) || null); renderNow(); });
  // the browser refused to start sound: the song stays wanted and starts on the first touch (the watchdog retries)
  Engine.on('blocked', () => {
    if (!cur()) return;
    const hint = $('#rsm');
    $('#rsmT').textContent = cur().title;
    hint.hidden = false;
    const off = () => { document.removeEventListener('click', go, true); document.removeEventListener('keydown', go, true); hint.hidden = true; };
    const go = (e) => { if (e.target.closest && e.target.closest('#rsmX')) return; off(); if (Engine.wanted() && !Engine.playing()) Engine.play(); };
    document.addEventListener('click', go, true);
    document.addEventListener('keydown', go, true);
    $('#rsmX').onclick = (e) => { e.stopPropagation(); off(); Engine.pause(); };
  });
  Engine.on('fx', () => { if (activeTab() === 'eq') renderPanel(); });

  function addHist(t) {
    if (t.src === 'file') return;
    S.hist = [{ t: lite(t), at: Date.now() }].concat(S.hist.filter((h) => key(h.t) !== key(t))).slice(0, 150);
    save();
  }
  function countPlay(t) {
    if (t.src === 'file' || t.src === 'radio') return;
    const k = key(t), p = S.plays[k] || { n: 0, s: 0, t: lite(t) };
    p.n++; p.t = lite(t); S.plays[k] = p;
    const ks = Object.keys(S.plays);
    if (ks.length > 800) { ks.sort((a, b) => S.plays[a].n - S.plays[b].n); delete S.plays[ks[0]]; }
    save();
  }

  // ---------------------------------------------------------------- likes / lists
  function toggleLike(t) {
    if (!t || t.src === 'file') return;
    if (liked(t)) { S.likes = S.likes.filter((x) => key(x) !== key(t)); toast('Dihapus dari Lagu yang Disukai'); }
    else { S.likes.unshift(lite(t)); toast('Ditambahkan ke Lagu yang Disukai'); }
    save();
    $$('.tr').forEach((r) => { if (r.dataset.k === key(t)) { const b = $('.like', r); const on = liked(t); b.classList.toggle('on', on); $('use', b).setAttribute('href', on ? '#i-heartf' : '#i-heart'); } });
    renderLikeBtns(); renderSideLists();
    if (route.name === 'likes') render();
  }
  function newList(name, tracks) {
    const l = { id: uid(), name, desc: '', tracks: (tracks || []).filter((t) => t.src !== 'file').map(lite), created: Date.now() };
    S.lists.unshift(l); save(); renderSideLists();
    return l;
  }
  function addToList(l, tracks) {
    tracks = [].concat(tracks).filter((t) => t.src !== 'file');
    const have = new Set(l.tracks.map(key));
    const add = tracks.filter((t) => !have.has(key(t))).map(lite);
    l.tracks.push(...add); save(); renderSideLists();
    toast(add.length ? `Ditambahkan ke "${l.name}"` : `Sudah ada di "${l.name}"`);
    if (route.name === 'list' && route.arg === l.id) render();
  }
  function listMenu(tracks, at) {
    const items = [{ label: 'Playlist baru…', icon: 'plus', run: () => ask('Playlist baru', '', 'Nama playlist', (n) => { const l = newList(n, []); addToList(l, tracks); }) }];
    if (S.lists.length) items.push('-');
    for (const l of S.lists) items.push({ label: l.name, icon: 'music', run: () => addToList(l, tracks) });
    openMenu(items, at);
  }
  function isSaved(ref) { return S.saved.some((x) => x.ref === ref); }
  function toggleSaved(item) {
    if (isSaved(item.ref)) { S.saved = S.saved.filter((x) => x.ref !== item.ref); toast('Dihapus dari Pustaka'); }
    else { S.saved.unshift(item); toast('Disimpan ke Pustaka'); }
    save(); renderSideLists();
  }

  function share(text, url) {
    if (navigator.share && touch) { navigator.share({ title: text, url }).catch(() => {}); return; }
    navigator.clipboard.writeText(url).then(() => toast('Link disalin'), () => toast(url));
  }
  const shareUrl = (hash) => location.origin + location.pathname + hash;
  const extUrl = (t) => t.src === 'yt' ? 'https://music.youtube.com/watch?v=' + t.id : t.src === 'sp' ? 'https://open.spotify.com/track/' + t.id : t.url || '';

  function trackMenu(t, at, opt) {
    opt = opt || {};
    const items = [
      { label: 'Putar berikutnya', icon: 'next', run: () => playNext(t) },
      { label: 'Tambah ke antrean', icon: 'queue', run: () => addQueue(t) },
    ];
    if (t.src !== 'file' && t.src !== 'radio') {
      items.push({ label: 'Tambah ke playlist…', icon: 'plus', run: () => listMenu([t], at) });
      items.push({ label: liked(t) ? 'Hapus dari Disukai' : 'Simpan ke Disukai', icon: liked(t) ? 'heartf' : 'heart', run: () => toggleLike(t) });
      items.push({ label: 'Mulai radio lagu ini', icon: 'radio', run: () => startRadio(t) });
    }
    items.push('-');
    const a = (t.artists || []).find((x) => x.id);
    if (a) items.push({ label: 'Buka artis', icon: 'music', run: () => go('#artist/' + a.id) });
    if (t.album && t.album.id) items.push({ label: 'Buka album', icon: 'lib', run: () => go('#album/' + t.album.id) });
    if (t.src !== 'file') items.push({ label: 'Bagikan', icon: 'share', run: () => share(t.title, shareUrl('#t=' + key(t))) });
    if (t.src === 'yt' || t.src === 'sp') items.push({ label: t.src === 'yt' ? 'Buka di YouTube Music' : 'Buka di Spotify', icon: t.src === 'yt' ? 'yt' : 'sp', run: () => open(extUrl(t), '_blank', 'noopener') });
    if (opt.my) items.push('-', { label: 'Hapus dari playlist ini', icon: 'trash', run: () => { opt.my.tracks.splice(opt.i, 1); save(); render(); renderSideLists(); } });
    if (opt.queue != null) items.push('-', { label: 'Hapus dari antrean', icon: 'trash', run: () => removeQ(opt.queue) });
    openMenu(items, at);
  }
  function removeQ(i) {
    if (i === Q.i) return;
    Q.list.splice(i, 1);
    if (i < Q.i) Q.i--;
    saveQ(); renderPanel();
  }

  // ---------------------------------------------------------------- collections
  async function collTracks(ref) {
    const ix = ref.indexOf(':'), k = ref.slice(0, ix), id = ref.slice(ix + 1);
    if (k === 'yt' || k === 'album') {
      const d = await API.browse(id);
      return { tracks: API.tracksOf((d.sections[0] || {}).items), name: d.header.title, href: (k === 'album' ? '#album/' : '#playlist/') + id, thumb: d.header.thumb };
    }
    if (k === 'artist') {
      const d = await API.browse(id);
      const s = d.sections.find((x) => x.items.some((i) => i.type === 'song')) || d.sections[0] || { items: [] };
      return { tracks: API.tracksOf(s.items), name: d.header.title, href: '#artist/' + id, thumb: d.header.thumb };
    }
    if (k === 'sp') {
      const d = await API.spotify(id);
      return { tracks: API.tracksOf(d.sections[0].items), name: d.header.title, href: '#sp/' + id, thumb: d.header.thumb };
    }
    if (k === 'my') { const l = S.lists.find((x) => x.id === id); return l ? { tracks: l.tracks, name: l.name, href: '#list/' + id, thumb: (l.tracks[0] || {}).thumb } : { tracks: [] }; }
    if (k === 'likes') return { tracks: S.likes.slice(), name: 'Lagu yang Disukai', href: '#likes' };
    if (k === 'mix') return { tracks: await API.radio(id), name: 'Mix', href: '#home' };
    if (k === 'rock') { const c = rockCat(id); return c ? { tracks: API.tracksOf(c.songs), name: c.title, href: '#rock/' + c.key, thumb: rockThumb(c) } : { tracks: [] }; }
    return { tracks: [] };
  }
  async function playColl(ref, opt) {
    opt = opt || {};
    if (Q.ctx && Q.ctx.ref === ref && !opt.shuffle && Engine.eng) { togglePlay(); return; }
    try {
      const c = await collTracks(ref);
      if (!c.tracks.length) return toast('Koleksi kosong', 'err');
      setQueue(c.tracks, opt.i || 0, { name: c.name, href: c.href, ref, thumb: c.thumb }, { shuffle: opt.shuffle != null ? opt.shuffle : undefined, random: true });
    } catch (e) { toast('Gagal memuat: ' + e.message, 'err'); }
  }
  async function collMenu(ref, at, info) {
    const items = [
      { label: 'Putar', icon: 'play', run: () => playColl(ref) },
      { label: 'Putar acak', icon: 'shuffle', run: () => playColl(ref, { shuffle: true }) },
      { label: 'Putar berikutnya', icon: 'next', run: async () => playNext((await collTracks(ref)).tracks) },
      { label: 'Tambah ke antrean', icon: 'queue', run: async () => addQueue((await collTracks(ref)).tracks) },
      { label: 'Tambah ke playlist…', icon: 'plus', run: async () => listMenu((await collTracks(ref)).tracks, at) },
    ];
    if (info && !ref.startsWith('my:') && ref !== 'likes:') items.push({ label: isSaved(ref) ? 'Hapus dari Pustaka' : 'Simpan ke Pustaka', icon: isSaved(ref) ? 'heartf' : 'heart', run: () => toggleSaved(Object.assign({ ref }, info)) });
    if (info && info.href) items.push('-', { label: 'Bagikan', icon: 'share', run: () => share(info.title, shareUrl(info.href)) });
    openMenu(items, at);
  }

  // ---------------------------------------------------------------- list registry + rows/cards
  const LISTS = new Map();
  let lseq = 0;
  function regList(tracks, ctx) { const id = 'l' + (++lseq); LISTS.set(id, { tracks, ctx: ctx || {} }); return id; }

  function row(t, i, opt) {
    const k = key(t), isCur = curKey() === k, lk = liked(t);
    return `<div class="tr${isCur ? ' cur' : ''}" data-i="${i}" data-k="${esc(k)}"${opt.drag ? ' draggable="true"' : ''}>
      <div class="n"><span class="num">${i + 1}</span><button class="pi" data-act="play" title="Putar">${icon('play')}</button><span class="eqa"><i></i><i></i><i></i></span></div>
      <div class="ti"><div class="th${t.kind === 'video' ? ' v' : ''}"${bg(t.thumb)}></div><div class="nm"><div class="tt">${esc(t.title)}${srcIcon(t)}</div><div class="ar">${arts(t)}</div></div></div>
      <div class="alb">${t.album ? (t.album.id ? `<a href="#album/${esc(t.album.id)}">${esc(t.album.name)}</a>` : esc(t.album.name)) : opt.when ? esc(opt.when(t, i)) : ''}</div>
      ${t.src === 'file' || t.src === 'radio' ? '<span></span>' : `<button class="ib like${lk ? ' on' : ''}" data-act="like" title="Suka">${icon(lk ? 'heartf' : 'heart')}</button>`}
      <div class="du">${t.sec ? fmt(t.sec) : t.src === 'radio' ? 'LIVE' : ''}</div>
      <button class="ib mo" data-act="more" title="Opsi">${icon('more')}</button>
    </div>`;
  }
  function trackList(tracks, ctx, opt) {
    opt = opt || {};
    const lid = regList(tracks, ctx);
    const noalb = opt.noalb != null ? opt.noalb : !tracks.some((t) => t.album) && !opt.when;
    return `<div class="tl${noalb ? ' noalb' : ''}${Engine.playing() ? '' : ' paused'}" data-l="${lid}">
      ${opt.head === false ? '' : `<div class="tl-h"><span style="text-align:center">#</span><span>Judul</span><span class="alb">${opt.whenLabel || 'Album'}</span><span></span><span style="text-align:right">${icon('clock')}</span><span></span></div>`}
      ${tracks.map((t, i) => row(t, i, opt)).join('')}
    </div>`;
  }
  function cardFor(it) {
    // it: edge item or home item → {href, ref, title, sub, thumb, round}
    let href = '', ref = '', round = false, tag = '';
    if (it.id && String(it.id).startsWith('sp:')) { href = '#sp/' + it.id.slice(3); ref = 'sp:' + it.id.slice(3); tag = 'sp'; }
    else if (it.type === 'album') { href = '#album/' + it.id; ref = 'album:' + it.id; }
    else if (it.type === 'artist') { href = '#artist/' + it.id; ref = 'artist:' + it.id; round = true; }
    else if (it.type === 'playlist' || /^VL/.test(it.id)) { href = '#playlist/' + it.id; ref = 'yt:' + it.id; }
    const sub = it.sub != null ? it.sub : [it.info, (it.artists || []).map((a) => a.name).join(', ')].filter(Boolean).join(' • ');
    return { href, ref, title: it.title, sub, thumb: it.thumb, round, tag };
  }
  function card(c) {
    const playing = Q.ctx && Q.ctx.ref === c.ref && Engine.playing();
    return `<div class="card${c.round ? ' art' : ''}${playing ? ' playing' : ''}" data-href="${esc(c.href || '')}" data-ref="${esc(c.ref || '')}" data-title="${esc(c.title)}" data-thumb="${esc(c.thumb || '')}" data-sub="${esc(c.sub || '')}">
      <div class="cv"${bg(c.thumb)}>${c.tag ? `<span class="tag ${c.tag}">${icon(c.tag)}${c.tag === 'sp' ? 'Spotify' : 'YouTube'}</span>` : ''}${c.ref ? `<button class="pb" data-act="pc" title="Putar">${icon(playing ? 'pause' : 'play')}</button>` : ''}</div>
      <div class="t">${esc(c.title)}</div><div class="s">${esc(c.sub || '')}</div></div>`;
  }
  const LIVE = [
    ['sp:37i9dQZEVXbObFQZ3JLcXt', 'Lagu terpopuler di Indonesia hari ini', '#sp/37i9dQZEVXbObFQZ3JLcXt'],
    ['yt:VLOLAK5uy_n7Ig_LAUbKE6_ZeQ1pwHmJcEhwX7BekBo', 'Lagi trending di YouTube Indonesia', '#playlist/VLOLAK5uy_n7Ig_LAUbKE6_ZeQ1pwHmJcEhwX7BekBo'],
    ['yt:VLPL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i', 'Lagu terpopuler dunia minggu ini', '#playlist/VLPL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i'],
    ['sp:37i9dQZF1DXcBWIGoYBM5M', "Today's Top Hits", '#sp/37i9dQZF1DXcBWIGoYBM5M'],
  ];
  function fillLive() {
    LIVE.forEach(([ref], i) => {
      const sec = $(`[data-live="${i}"]`);
      if (!sec) return;
      collTracks(ref).then((c) => {
        const row = sec.isConnected && $('.row', sec);
        if (!row) return;
        if (!c.tracks.length) { sec.remove(); return; }
        row.innerHTML = songCards(c.tracks.slice(0, 24), { name: c.name, href: c.href, ref, thumb: c.thumb });
        $$('.card', row).forEach((el, j) => { const t = $('.t', el); if (t) t.insertAdjacentHTML('afterbegin', `<b class="rk">${j + 1}</b>`); });
      }).catch(() => sec.remove());
    });
  }
  const songCards = (tracks, ctx) => { const lid = regList(tracks, ctx); return tracks.map((t, i) => `<div class="card" data-l="${lid}" data-i="${i}"><div class="cv"${bg(t.thumb)}><button class="pb" data-act="ps">${icon('play')}</button></div><div class="t">${esc(t.title)}</div><div class="s">${esc(artistsText(t))}</div></div>`).join(''); };
  const TR = { 'Songs': 'Lagu', 'Videos': 'Video', 'Albums': 'Album', 'Artists': 'Artis', 'Playlists': 'Playlist', 'Community playlists': 'Playlist komunitas', 'Featured playlists': 'Playlist pilihan', 'Top songs': 'Lagu populer', 'Singles & EPs': 'Single & EP', 'Singles': 'Single', 'Live performances': 'Penampilan live', 'Featured on': 'Ditampilkan di', 'Fans might also like': 'Penggemar juga menyukai', 'Releases for you': 'Rilisan untukmu', 'Other versions': 'Versi lain', 'More from': 'Lainnya dari', 'Episodes': 'Episode' };
  const tr = (t) => TR[t] || String(t || '').replace(/^Playlists by /, 'Playlist oleh ').replace(/^More from /, 'Lainnya dari ');
  const shelf = (title, inner, more) => `<section class="shelf"><div class="shelf-h"><h2>${esc(tr(title))}</h2>${more || ''}</div><div class="row">${inner}</div></section>`;
  const loading = () => '<div class="load"><div class="spin"></div></div>';
  const empty = (ic, b, t) => `<div class="empty">${icon(ic)}<b>${esc(b)}</b><span>${esc(t || '')}</span></div>`;

  // ---------------------------------------------------------------- router
  const view = $('#view');
  const route = { name: 'home', arg: '' };
  let rtok = 0;
  function go(h) { if (location.hash === h) render(); else location.hash = h; }
  function parse() {
    const h = decodeURIComponent(location.hash.slice(1) || 'home');
    const [name, ...rest] = h.split('/');
    route.name = name || 'home'; route.arg = rest.join('/');
  }
  window.addEventListener('hashchange', () => { if (location.hash.startsWith('#t=')) return openShared(); render(); });

  async function render() {
    parse();
    const tok = ++rtok;
    LISTS.clear();
    closeMenu();
    $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === route.name || (a.dataset.nav === 'library' && ['likes', 'history', 'stats', 'list', 'files'].includes(route.name))));
    $('#q').value = route.name === 'search' ? (route.arg.split('/')[0] || '') : $('#q').value;
    view.style.removeProperty('--tint');
    view.scrollTop = 0;
    const fn = VIEWS[route.name] || VIEWS.home;
    view.innerHTML = loading();
    try {
      const html = await fn(route.arg, tok);
      if (tok !== rtok) return;
      if (html != null) view.innerHTML = html;
      afterRender();
    } catch (e) {
      if (tok !== rtok) return;
      view.innerHTML = empty('music', 'Gagal memuat', e.message + ' — periksa koneksi lalu coba lagi.');
    }
    renderSideLists();
  }
  function afterRender() {
    const t = view.dataset.tint;
    if (t) view.style.setProperty('--tint', t);
    markCur();
  }
  async function tintView(url, tok) { const t = await tintOf(url); if (tok === rtok) view.style.setProperty('--tint', t); }

  const greet = () => { const h = new Date().getHours(); return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam'; };
  const GENRES = [
    ['Rock Legend', '#a3201d', '#rock/legend'], ['Pop Rock Viral', '#d84000', '#rock/viral'], ['Rock Terbaik', '#2d2a32', '#rock/terbaik'],
    ['Pop Indonesia', '#e13300'], ['Pop Jazz', '#1e3264'], ['Lagu Hits', '#8d67ab'], ['Indie Indonesia', '#27856a'], ['Galau', '#477d95'],
    ['Akustik', '#bc5900'], ['Dangdut', '#e8115b'], ['City Pop', '#dc148c'], ['Jazz', '#0d73ec'], ['R&B', '#ba5d07'], ['K-Pop', '#e91429'],
    ['Rock Indonesia', '#777777'], ['Lofi', '#503750'], ['90an', '#af2896'], ['2000an', '#148a08'], ['Religi', '#1e3264'], ['Koplo', '#e8115b'], ['Hip-Hop', '#bc5900'],
  ];

  const genreTiles = (list) => list.map(([g, c, href]) => `<div class="genre" style="background:${c}" data-genre="${esc(g)}"${href ? ` data-go="${esc(href)}"` : ''}>${esc(g)}</div>`).join('');
  const rockCat = (k) => (window.ROCK || []).find((c) => c.key === k);
  const rockThumb = (c) => (c.albums[0] || c.songs[0] || {}).thumb || '';
  const rockCtx = (c) => ({ name: c.title, href: '#rock/' + c.key, ref: 'rock:' + c.key, thumb: rockThumb(c) });
  function rockShelves() {
    let h = '';
    for (const c of window.ROCK || []) {
      const more = `<a href="#rock/${c.key}">Lihat semua</a>`;
      h += shelf('Lagu ' + c.title, songCards(API.tracksOf(c.songs).slice(0, 24), rockCtx(c)), more);
      h += shelf('Album ' + c.title, c.albums.slice(0, 24).map((it) => card(cardFor(it))).join(''), more);
    }
    return h;
  }

  const VIEWS = {
    async home() {
      let h = `<div class="v-bg"></div><h1 class="v-title">${greet()}</h1>`;
      if (S.recentCtx.length) {
        h += `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px;margin-bottom:28px">${S.recentCtx.slice(0, 6).map((c) => `<div class="mini-tr qt" data-href="${esc(c.href)}" data-ref="${esc(c.ref)}"><div class="th"${bg(c.thumb)}></div><div><div class="tt">${esc(c.title)}</div></div><button class="playbtn" data-act="pc">${icon('play')}</button></div>`).join('')}</div>`;
      }
      if (S.hist.length) h += shelf('Baru saja diputar', songCards(S.hist.slice(0, 16).map((x) => x.t), { name: 'Baru diputar', href: '#history' }), '<a href="#history">Lihat semua</a>');
      const seeds = [];
      for (const x of S.hist) { const a = artistsText(x.t); if (x.t.src === 'yt' && !seeds.some((s) => artistsText(s) === a)) seeds.push(x.t); if (seeds.length >= 6) break; }
      if (seeds.length) h += shelf('Mix untukmu', seeds.map((t) => card({ href: '', ref: 'mix:' + t.id, title: 'Mix ' + ((t.artists[0] || {}).name || t.title), sub: 'Lagu mirip ' + t.title + ' & lainnya', thumb: t.thumb })).join(''));
      // live chart songs (refreshed by YouTube/Spotify daily/weekly), one tap to play
      h += LIVE.map(([ref, title, href], i) => `<section class="shelf" data-live="${i}"><div class="shelf-h"><h2>${esc(title)}</h2><a href="${href}">Lihat semua</a></div><div class="row">${'<div class="card sk"><div class="cv"></div><div class="t">&nbsp;</div><div class="s">&nbsp;</div></div>'.repeat(8)}</div></section>`).join('');
      setTimeout(fillLive, 0);
      h += rockShelves();
      for (const s of window.HOME || []) h += shelf(s.title, s.items.map((it) => card(cardFor(it))).join(''));
      h += `<section class="shelf"><div class="shelf-h"><h2>Jelajahi genre</h2></div><div class="genres">${genreTiles(GENRES.slice(0, 15))}</div></section>`;
      return h;
    },

    async search(arg, tok) {
      const [q0, t0] = arg.split('/');
      const q = (q0 || '').trim(), t = t0 || 'all';
      if (!q) {
        let h = '<h1 class="v-title">Cari</h1>';
        if (S.recent.length) h += `<div class="shelf-h"><h2 style="font-size:18px">Pencarian terakhir</h2><button id="clrRecent">Hapus</button></div><div class="chips">${S.recent.map((r) => `<a class="chip" href="#search/${encodeURIComponent(r)}">${icon('clock')}${esc(r)}</a>`).join('')}</div>`;
        h += `<div class="shelf-h"><h2 style="font-size:18px">Jelajahi semua</h2></div><div class="genres">${genreTiles(GENRES)}</div>`;
        setTimeout(() => { const b = $('#clrRecent'); if (b) b.onclick = () => { S.recent = []; save(); render(); }; if (!touch) $('#q').focus(); });
        return h;
      }
      S.recent = [q].concat(S.recent.filter((x) => x.toLowerCase() !== q.toLowerCase())).slice(0, 12); save();
      const tabs = [['all', 'Semua'], ['songs', 'Lagu'], ['videos', 'Video'], ['albums', 'Album'], ['artists', 'Artis'], ['playlists', 'Playlist']];
      let h = `<div class="chips">${tabs.map(([k, l]) => `<a class="chip${k === t ? ' on' : ''}" href="#search/${encodeURIComponent(q)}/${k}">${l}</a>`).join('')}</div>`;
      view.innerHTML = h + loading();
      const d = await API.search(q, t);
      if (tok !== rtok) return null;
      const ctx = { name: 'Hasil "' + q + '"', href: '#search/' + encodeURIComponent(q) };
      if (t === 'all') {
        const secs = d.sections || [];
        if (!secs.length) return h + empty('search', 'Tidak ditemukan', 'Coba kata kunci lain.');
        const top = secs[0], rest = secs.slice(1);
        const best = top.items[0];
        const songsSec = secs.find((s) => /^songs$/i.test(s.title)) || secs.find((s) => s.items.some((i) => i.type === 'song'));
        let topHtml = '';
        if (best) {
          const bt = API.track(best);
          if (bt) {
            const lid = regList([bt], ctx);
            topHtml = `<div><div class="shelf-h"><h2>Hasil teratas</h2></div><div class="best" data-l="${lid}" data-i="0"><div class="cv"${bg(bt.thumb)}></div><div class="t">${esc(bt.title)}</div><div class="s"><b>${bt.kind === 'video' ? 'Video' : 'Lagu'}</b>${esc(artistsText(bt))}</div><button class="pb" data-act="ps">${icon('play')}</button></div></div>`;
          } else {
            const c = cardFor(best);
            topHtml = `<div><div class="shelf-h"><h2>Hasil teratas</h2></div><div class="best card${c.round ? ' art' : ''}" data-href="${esc(c.href)}" data-ref="${esc(c.ref)}" data-title="${esc(c.title)}" data-thumb="${esc(c.thumb || '')}"><div class="cv"${bg(c.thumb)}></div><div class="t">${esc(c.title)}</div><div class="s"><b>${esc({ album: 'Album', artist: 'Artis', playlist: 'Playlist' }[best.type] || '')}</b>${esc(c.sub)}</div><button class="pb" data-act="pc">${icon('play')}</button></div></div>`;
          }
        }
        const songs = songsSec ? API.tracksOf(songsSec.items).slice(0, 5) : API.tracksOf(top.items.slice(1)).slice(0, 5);
        h += `<div class="top-res">${topHtml}<div><div class="shelf-h"><h2>Lagu</h2><a href="#search/${encodeURIComponent(q)}/songs">Lihat semua</a></div>${trackList(songs, ctx, { head: false, noalb: true })}</div></div>`;
        for (const s of rest) {
          if (s === songsSec) continue;
          const tr = API.tracksOf(s.items);
          if (tr.length && tr.length >= s.items.length / 2) h += shelf(s.title, songCards(tr, Object.assign({}, ctx, { name: s.title })));
          else h += shelf(s.title, s.items.map((it) => card(cardFor(it))).filter(Boolean).join(''));
        }
        return h;
      }
      const items = d.items || [];
      if (!items.length) return h + empty('search', 'Tidak ditemukan', 'Coba kata kunci lain.');
      if (t === 'songs' || t === 'videos') return h + trackList(API.tracksOf(items), ctx);
      return h + `<div class="grid">${items.map((it) => card(cardFor(it))).join('')}</div>`;
    },

    async album(id, tok) { return collectionView('album', id, tok); },
    async playlist(id, tok) { return collectionView('yt', id, tok); },
    async sp(id, tok) { return collectionView('sp', id, tok); },

    async artist(id, tok) {
      const d = await API.browse(id);
      if (tok !== rtok) return null;
      const hd = d.header || {};
      tintView(hd.thumb, tok);
      const ref = 'artist:' + id;
      let h = `<div class="v-bg"></div><div class="hero art"><div class="cv"${bg(hd.thumb)}></div><div><div class="kind">${icon('check')} Artis</div><h1>${esc(hd.title || '')}</h1><div class="desc">${esc(hd.desc || '')}</div></div></div>
        <div class="actions"><button class="playbtn lg" data-act="pcoll" data-ref="${ref}">${icon('play')}</button><button class="ib" data-act="pshuf" data-ref="${ref}" title="Putar acak">${icon('shuffle')}</button><button class="ib" data-act="radioArtist" title="Radio artis">${icon('radio')}</button><button class="ib" data-act="save" data-ref="${ref}" data-title="${esc(hd.title || '')}" data-thumb="${esc(hd.thumb || '')}" data-href="#artist/${esc(id)}" data-sub="Artis" title="Simpan">${icon(isSaved(ref) ? 'heartf' : 'heart')}</button></div>`;
      for (const s of d.sections) {
        const trs = API.tracksOf(s.items);
        const more = s.more && /^VL/.test(s.more) ? `<a href="#playlist/${esc(s.more)}">Lihat semua</a>` : '';
        if (trs.length && s.items[0].type === 'song') h += `<section class="shelf"><div class="shelf-h"><h2>${esc(tr(s.title))}</h2>${more}</div>${trackList(trs, { name: hd.title, href: '#artist/' + id, ref }, { head: false })}</section>`;
        else if (trs.length) h += shelf(s.title, songCards(trs, { name: hd.title, href: '#artist/' + id }), more);
        else h += shelf(s.title, s.items.map((it) => card(cardFor(it))).join(''), more);
      }
      return h;
    },

    async list(id) {
      const l = S.lists.find((x) => x.id === id);
      if (!l) return empty('music', 'Playlist tidak ditemukan', 'Mungkin sudah dihapus.');
      const covers = l.tracks.slice(0, 4).map((t) => t.thumb);
      const cover = covers.length >= 4 ? `<div class="cv" style="display:grid;grid-template-columns:1fr 1fr;overflow:hidden">${covers.map((c) => `<div style="background:center/cover url(&quot;${esc(c)}&quot;)"></div>`).join('')}</div>` : `<div class="cv"${bg(covers[0])}>${covers[0] ? '' : icon('music')}</div>`;
      view.dataset.tint = '';
      if (covers[0]) tintView(covers[0], rtok); else view.style.setProperty('--tint', hashTint(l.id));
      const total = l.tracks.reduce((a, t) => a + (t.sec || 0), 0);
      let h = `<div class="v-bg"></div><div class="hero">${cover}<div><div class="kind">Playlist saya</div><h1 class="${l.name.length > 22 ? 'long' : ''}">${esc(l.name)}</h1>${l.desc ? `<div class="desc">${esc(l.desc)}</div>` : ''}<div class="meta">${l.tracks.length} lagu${total ? ' · ' + fmtLong(total) : ''}</div></div></div>
        <div class="actions"><button class="playbtn lg" data-act="pcoll" data-ref="my:${l.id}">${icon('play')}</button><button class="ib" data-act="pshuf" data-ref="my:${l.id}" title="Putar acak">${icon('shuffle')}</button><button class="ib" data-act="editList" title="Ubah">${icon('edit')}</button><button class="ib" data-act="moreColl" data-ref="my:${l.id}" data-title="${esc(l.name)}" data-href="#list/${l.id}" title="Opsi">${icon('more')}</button><button class="ib" data-act="delList" title="Hapus playlist">${icon('trash')}</button></div>`;
      h += l.tracks.length ? trackList(l.tracks, { name: l.name, href: '#list/' + l.id, ref: 'my:' + l.id, my: l }, { drag: !touch }) : empty('music', 'Playlist ini masih kosong', 'Cari lagu di bawah lalu tekan + untuk menambahkan.');
      h += `<section class="shelf" style="margin-top:26px"><div class="shelf-h"><h2>Tambahkan lagu</h2></div><div class="sbox" style="max-width:460px;background:#ffffff12">${icon('search')}<input id="addQ" type="search" placeholder="Cari lagu untuk playlist ini"></div><div id="addRes" style="margin-top:12px"></div></section>`;
      setTimeout(() => {
        const inp = $('#addQ');
        if (!inp) return;
        const run = debounce(async () => {
          const q = inp.value.trim(); const box = $('#addRes');
          if (!q) { box.innerHTML = ''; return; }
          box.innerHTML = loading();
          const d = await API.search(q, 'songs').catch(() => ({ items: [] }));
          const tr = API.tracksOf(d.items).slice(0, 10);
          const lid = regList(tr, { name: 'Hasil', href: '' });
          box.innerHTML = tr.map((t, i) => `<div class="mini-tr" data-l="${lid}" data-i="${i}"><div class="th"${bg(t.thumb)}></div><div><div class="tt">${esc(t.title)}</div><div class="ar">${esc(artistsText(t))}${t.sec ? ' · ' + fmt(t.sec) : ''}</div></div><button class="btn sm" data-act="addTo">${icon('plus')}Tambah</button></div>`).join('') || empty('search', 'Tidak ditemukan');
        }, 350);
        inp.oninput = run;
      });
      return h;
    },

    async rock(arg, tok) {
      const c = rockCat(arg) || (window.ROCK || [])[0];
      if (!c) return empty('music', 'Tidak ada lagu');
      const ctx = rockCtx(c), info = { title: c.title, thumb: ctx.thumb, sub: 'Koleksi rock' };
      tintView(ctx.thumb, tok);
      const total = c.songs.reduce((a, t) => a + (t.sec || 0), 0);
      return `<div class="chips">${window.ROCK.map((x) => `<a class="chip${x === c ? ' on' : ''}" href="#rock/${x.key}">${esc(x.title)}</a>`).join('')}</div>
        <div class="v-bg"></div><div class="hero"><div class="cv"${bg(ctx.thumb)}></div><div><div class="kind">Koleksi rock</div><h1 class="${c.title.length > 24 ? 'long' : ''}">${esc(c.title)}</h1><div class="desc">${esc(c.sub)}</div><div class="meta">${c.songs.length} lagu, ${fmtLong(total)} · ${c.albums.length} album</div></div></div>
        <div class="actions"><button class="playbtn lg" data-act="pcoll" data-ref="${esc(ctx.ref)}">${icon(Q.ctx && Q.ctx.ref === ctx.ref && Engine.playing() ? 'pause' : 'play')}</button><button class="ib" data-act="pshuf" data-ref="${esc(ctx.ref)}" title="Putar acak">${icon('shuffle')}</button><button class="ib${isSaved(ctx.ref) ? ' on' : ''}" data-act="save" data-ref="${esc(ctx.ref)}" data-title="${esc(info.title)}" data-thumb="${esc(info.thumb)}" data-href="${esc(ctx.href)}" data-sub="${esc(info.sub)}" title="Simpan ke Pustaka">${icon(isSaved(ctx.ref) ? 'heartf' : 'heart')}</button></div>
        ${trackList(API.tracksOf(c.songs), ctx)}
        <div style="margin-top:30px"></div><div class="shelf-h"><h2>Album</h2></div><div class="grid">${c.albums.map((it) => card(cardFor(it))).join('')}</div>`;
    },

    async likes() {
      view.style.setProperty('--tint', '80, 56, 237');
      return `<div class="v-bg"></div><div class="hero"><div class="cv" style="background:linear-gradient(135deg,#450af5,#8e8ee5);color:#fff">${icon('heartf')}</div><div><div class="kind">Playlist</div><h1>Lagu yang Disukai</h1><div class="meta">${S.likes.length} lagu</div></div></div>
        <div class="actions"><button class="playbtn lg" data-act="pcoll" data-ref="likes:">${icon('play')}</button><button class="ib" data-act="pshuf" data-ref="likes:" title="Putar acak">${icon('shuffle')}</button></div>
        ${S.likes.length ? trackList(S.likes, { name: 'Lagu yang Disukai', href: '#likes', ref: 'likes:' }) : empty('heart', 'Belum ada lagu yang disukai', 'Tekan ikon hati pada lagu untuk menyimpannya di sini.')}`;
    },

    async history() {
      const tr = S.hist.map((x) => x.t);
      return `<h1 class="v-title">Riwayat diputar</h1><div class="actions"><button class="btn sm" data-act="clrHist">${icon('trash')}Hapus riwayat</button></div>${tr.length ? trackList(tr, { name: 'Riwayat', href: '#history' }, { when: (t, i) => ago(S.hist[i].at), whenLabel: 'Diputar' }) : empty('clock', 'Belum ada riwayat')}`;
    },

    async library() {
      let h = '<h1 class="v-title">Pustaka</h1><div class="chips"><a class="chip" href="#likes">' + icon('heartf') + 'Disukai</a><a class="chip" href="#history">' + icon('clock') + 'Riwayat</a><a class="chip" href="#stats">' + icon('chart') + 'Statistik</a><a class="chip" href="#files">' + icon('file') + 'File lokal</a><button class="chip" data-act="newList">' + icon('plus') + 'Playlist baru</button><button class="chip" data-act="importLists">' + icon('upload') + 'Impor</button><button class="chip" data-act="exportAll">' + icon('share') + 'Ekspor</button></div>';
      const cards = [card({ href: '#likes', ref: 'likes:', title: 'Lagu yang Disukai', sub: S.likes.length + ' lagu', thumb: '' }).replace('<div class="cv">', '<div class="cv" style="background:linear-gradient(135deg,#450af5,#8e8ee5);display:grid;place-items:center;color:#fff">' + icon('heartf'))];
      for (const l of S.lists) cards.push(card({ href: '#list/' + l.id, ref: 'my:' + l.id, title: l.name, sub: 'Playlist · ' + l.tracks.length + ' lagu', thumb: (l.tracks[0] || {}).thumb }));
      for (const s of S.saved) cards.push(card({ href: s.href, ref: s.ref, title: s.title, sub: s.sub || '', thumb: s.thumb, round: s.ref.startsWith('artist:'), tag: s.ref.startsWith('sp:') ? 'sp' : '' }));
      h += `<div class="grid">${cards.join('')}</div>`;
      return h;
    },

    async files() {
      const tr = FILES;
      return `<h1 class="v-title">File lokal</h1><div class="dropzone" id="dz">${icon('upload')}<p><b>Seret file audio ke sini</b> atau <button class="btn sm" data-act="pickFiles">Pilih file</button></p><p style="font-size:12.5px">MP3, M4A, FLAC, WAV, OGG — diputar langsung di perangkat ini dengan EQ penuh (tidak diunggah).</p></div>
        <div style="margin-top:20px">${tr.length ? trackList(tr, { name: 'File lokal', href: '#files' }) : ''}</div>`;
    },

    async stats() {
      const ps = Object.values(S.plays).sort((a, b) => b.n - a.n);
      const total = ps.reduce((a, p) => a + p.n, 0);
      const byA = {};
      for (const p of ps) { const a = (p.t.artists[0] || {}).name; if (a) byA[a] = (byA[a] || 0) + p.n; }
      const topA = Object.entries(byA).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const maxA = topA[0] ? topA[0][1] : 1;
      let h = `<h1 class="v-title">Statistik mendengarkan</h1><div class="stat-cards"><div class="stat"><b>${fmtLong(S.listenSec || 0)}</b><span>Total waktu mendengar</span></div><div class="stat"><b>${total}</b><span>Lagu diputar</span></div><div class="stat"><b>${ps.length}</b><span>Lagu berbeda</span></div><div class="stat"><b>${Object.keys(byA).length}</b><span>Artis</span></div></div>`;
      if (!ps.length) return h + empty('chart', 'Belum ada data', 'Putar lagu minimal 30 detik untuk mulai mencatat.');
      h += `<div class="top-res"><section><div class="shelf-h"><h2>Artis teratas</h2></div><div class="bars">${topA.map(([a, n], i) => `<div class="bar-r"><span class="c" style="text-align:center">${i + 1}</span><a class="bt" href="#search/${encodeURIComponent(a)}"><i style="width:${(n / maxA) * 100}%"></i><span>${esc(a)}</span></a><span class="c">${n}×</span></div>`).join('')}</div></section>
        <section><div class="shelf-h"><h2>Lagu teratas</h2></div>${trackList(ps.slice(0, 20).map((p) => p.t), { name: 'Lagu teratas', href: '#stats' }, { when: (t) => (S.plays[key(t)] || {}).n + '× diputar', whenLabel: 'Diputar', head: false })}</section></div>`;
      return h;
    },

    async radio(arg, tok) {
      const tags = [['', 'Populer Indonesia'], ['pop', 'Pop'], ['jazz', 'Jazz'], ['dangdut', 'Dangdut'], ['news', 'Berita'], ['religious', 'Religi'], ['top 40', 'Top 40 dunia'], ['lofi', 'Lo-fi'], ['kpop', 'K-Pop'], ['classical', 'Klasik']];
      const tg = arg || '';
      let h = `<h1 class="v-title">Radio</h1><div class="chips">${tags.map(([k, l]) => `<a class="chip${k === tg ? ' on' : ''}" href="#radio${k ? '/' + encodeURIComponent(k) : ''}">${esc(l)}</a>`).join('')}</div>`;
      view.innerHTML = h + loading();
      const global = ['top 40', 'lofi', 'kpop', 'classical'].includes(tg);
      const st = await API.stations(Object.assign(global ? {} : { countrycode: 'ID' }, tg ? { tag: tg } : {}));
      if (tok !== rtok) return null;
      if (!st.length) return h + empty('radio', 'Stasiun tidak ditemukan', 'Server radio sedang sibuk, coba lagi.');
      const lid = regList(st, { name: 'Radio', href: '#radio' });
      return h + `<div class="grid">${st.map((s, i) => `<div class="card" data-l="${lid}" data-i="${i}"><div class="cv" style="display:grid;place-items:center;background:#1c2029;color:var(--dim)">${icon('radio')}${s.thumb ? `<img src="${esc(s.thumb)}" alt="" loading="lazy" style="position:absolute;inset:19%;width:62%;height:62%;object-fit:contain" onerror="this.remove()">` : ''}<button class="pb" data-act="ps">${icon('play')}</button></div><div class="t">${esc(s.title)}</div><div class="s">${esc(s.artists[0].name)}${s.br ? ' · ' + s.br + ' kbps' : ''}</div></div>`).join('')}</div>`;
    },
  };

  const fmtLong = (s) => { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h} jam ${m} mnt` : `${m} mnt`; };
  function ago(t) { const s = (Date.now() - t) / 1000; if (s < 60) return 'baru saja'; if (s < 3600) return Math.floor(s / 60) + ' mnt lalu'; if (s < 86400) return Math.floor(s / 3600) + ' jam lalu'; return Math.floor(s / 86400) + ' hari lalu'; }

  async function collectionView(kind, id, tok) {
    const ref = (kind === 'album' ? 'album:' : kind === 'sp' ? 'sp:' : 'yt:') + id;
    const d = kind === 'sp' ? await API.spotify(id) : await API.browse(id);
    if (tok !== rtok) return null;
    const hd = d.header || {};
    const tracks = API.tracksOf((d.sections[0] || {}).items);
    tintView(hd.thumb, tok);
    const href = (kind === 'album' ? '#album/' : kind === 'sp' ? '#sp/' : '#playlist/') + id;
    const total = tracks.reduce((a, t) => a + (t.sec || 0), 0);
    const kindLbl = kind === 'sp' ? `${icon('sp')} Spotify · ${id.split('/')[0] === 'album' ? 'Album' : id.split('/')[0] === 'track' ? 'Lagu' : 'Playlist'}` : kind === 'album' ? (hd.info || 'Album').split(' • ')[0] : 'Playlist';
    const meta = kind === 'sp' ? [esc(hd.second || 'Spotify'), tracks.length + ' lagu' + (total ? ', ' + fmtLong(total) : '')].join(' · ') : [(hd.artists || []).map((a) => a.id ? `<a href="#artist/${esc(a.id)}">${esc(a.name)}</a>` : esc(a.name)).join(', '), esc((hd.info || '').split(' • ').slice(kind === 'album' ? 1 : 0).join(' • ')), esc(hd.second || (tracks.length + ' lagu' + (total ? ', ' + fmtLong(total) : '')))].filter(Boolean).join(' · ');
    const info = { title: hd.title, thumb: hd.thumb, href, sub: kind === 'album' ? 'Album' : 'Playlist' };
    let h = `<div class="v-bg"></div><div class="hero"><div class="cv"${bg(hd.thumb)}></div><div><div class="kind">${kindLbl}</div><h1 class="${(hd.title || '').length > 24 ? 'long' : ''}">${esc(hd.title || '')}</h1>${hd.desc ? `<div class="desc">${esc(hd.desc)}</div>` : ''}<div class="meta">${meta}</div></div></div>
      <div class="actions"><button class="playbtn lg" data-act="pcoll" data-ref="${esc(ref)}">${icon(Q.ctx && Q.ctx.ref === ref && Engine.playing() ? 'pause' : 'play')}</button><button class="ib" data-act="pshuf" data-ref="${esc(ref)}" title="Putar acak">${icon('shuffle')}</button><button class="ib${isSaved(ref) ? ' on' : ''}" data-act="save" data-ref="${esc(ref)}" data-title="${esc(info.title || '')}" data-thumb="${esc(info.thumb || '')}" data-href="${esc(href)}" data-sub="${esc(info.sub)}" title="Simpan ke Pustaka">${icon(isSaved(ref) ? 'heartf' : 'heart')}</button><button class="ib" data-act="moreColl" data-ref="${esc(ref)}" data-title="${esc(info.title || '')}" data-thumb="${esc(info.thumb || '')}" data-href="${esc(href)}" title="Opsi">${icon('more')}</button>
      </div>`;
    h += tracks.length ? trackList(tracks, { name: hd.title, href, ref, thumb: hd.thumb }) : empty('music', 'Tidak ada lagu');
    for (const s of d.sections.slice(1)) if (s.items.length) h += `<div style="margin-top:30px"></div>` + shelf(s.title || 'Lainnya', s.items.map((it) => card(cardFor(it))).join(''));
    return h;
  }

  // ---------------------------------------------------------------- shared links (#t=yt:ID)
  async function openShared() {
    const k = decodeURIComponent(location.hash.slice(3));
    history.replaceState(null, '', location.pathname + '#home');
    const [src, id] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
    let t = null;
    if (src === 'yt') {
      const d = await API.search(id, 'songs').catch(() => null);
      t = (d && API.tracksOf(d.items).find((x) => x.id === id)) || { src: 'yt', id, title: 'Lagu YouTube', artists: [], thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, kind: 'video' };
    } else if (src === 'sp') {
      const d = await API.spotify('track/' + id).catch(() => null);
      t = d && API.tracksOf(d.sections[0].items)[0];
    }
    render();
    if (!t) return toast('Link lagu tidak valid', 'err');
    Q.list = [t]; Q.i = 0; Q.ctx = null; Q.t = 0;
    renderNow();
    toast('Tekan ▶ untuk memutar "' + t.title + '"');
  }

  // ---------------------------------------------------------------- search box + suggestions
  const qIn = $('#q'), sugg = $('#sugg');
  let sIdx = -1;
  function submitSearch(q) {
    q = q.trim(); sugg.hidden = true;
    if (!q) return go('#search');
    const yt = q.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/)([\w-]{11})/), ytl = q.match(/[?&]list=([\w-]+)/);
    const spm = q.match(/open\.spotify\.com\/(?:intl-\w+\/)?(playlist|album|track|artist)\/([A-Za-z0-9]{22})/) || q.match(/spotify:(playlist|album|track|artist):([A-Za-z0-9]{22})/);
    if (ytl && !yt) return go('#playlist/VL' + ytl[1]);
    if (yt) { location.hash = '#t=yt:' + yt[1]; return; }
    if (spm) return go('#sp/' + spm[1] + '/' + spm[2]);
    go('#search/' + encodeURIComponent(q));
  }
  $('#sform').addEventListener('submit', (e) => { e.preventDefault(); const hl = $('.hl', sugg); submitSearch(hl ? hl.dataset.s : qIn.value); qIn.blur(); });
  const suggest = debounce(async () => {
    const q = qIn.value.trim();
    if (!q || /^https?:|spotify:/.test(q)) { sugg.hidden = true; return; }
    const items = await API.suggest(q);
    if (qIn.value.trim() !== q || document.activeElement !== qIn) return;
    sIdx = -1;
    sugg.innerHTML = items.map((s) => `<button type="button" data-s="${esc(s)}">${icon('search')}${esc(s)}</button>`).join('');
    sugg.hidden = !items.length;
  }, 180);
  qIn.addEventListener('input', () => { suggest(); if (route.name !== 'search') return; });
  qIn.addEventListener('focus', () => { if (route.name !== 'search' && mobile()) go('#search'); });
  qIn.addEventListener('keydown', (e) => {
    const bs = $$('button', sugg);
    if (sugg.hidden || !bs.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (e.key === 'ArrowDown') sIdx = sIdx + 1 >= bs.length ? -1 : sIdx + 1;
      else sIdx = sIdx - 1 < -1 ? bs.length - 1 : sIdx - 1;
      bs.forEach((b, i) => b.classList.toggle('hl', i === sIdx));
    } else if (e.key === 'Escape') sugg.hidden = true;
  });
  sugg.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) { qIn.value = b.dataset.s; submitSearch(b.dataset.s); } });

  // ---------------------------------------------------------------- delegated clicks
  document.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    const act = a && a.dataset.act;
    const tr = e.target.closest('.tr');
    if (tr && tr.closest('.tl')) {
      const L = LISTS.get(tr.closest('.tl').dataset.l);
      if (!L) return;
      const i = +tr.dataset.i, t = L.tracks[i];
      if (act === 'like') return toggleLike(t);
      if (act === 'more') return trackMenu(t, a, { my: L.ctx.my, i });
      if (e.target.closest('a')) return;
      if (act === 'play' || touch) return playFrom(L, i);
      $$('.tr.sel').forEach((x) => x.classList.remove('sel'));
      tr.classList.add('sel');
      return;
    }
    if (act === 'ps') {
      const c = a.closest('[data-l]'); const L = LISTS.get(c.dataset.l);
      if (L) playFrom(L, +c.dataset.i);
      return;
    }
    if (act === 'pc') {
      e.stopPropagation();
      const c = a.closest('[data-ref]');
      return playColl(c.dataset.ref);
    }
    if (act === 'pcoll') return playColl(a.dataset.ref);
    if (act === 'pshuf') return playColl(a.dataset.ref, { shuffle: true });
    if (act === 'save') { toggleSaved({ ref: a.dataset.ref, title: a.dataset.title, thumb: a.dataset.thumb, href: a.dataset.href, sub: a.dataset.sub }); a.classList.toggle('on', isSaved(a.dataset.ref)); $('use', a).setAttribute('href', isSaved(a.dataset.ref) ? '#i-heartf' : '#i-heart'); return; }
    if (act === 'moreColl') return collMenu(a.dataset.ref, a, { title: a.dataset.title, thumb: a.dataset.thumb, href: a.dataset.href, sub: '' });
    if (act === 'radioArtist') { const L = [...LISTS.values()].find((x) => x.tracks.length); if (L) startRadio(L.tracks[0]); return; }
    if (act === 'editList') { const l = S.lists.find((x) => x.id === route.arg); return editList(l); }
    if (act === 'delList') { const l = S.lists.find((x) => x.id === route.arg); return confirmBox('Hapus playlist?', `"${l.name}" akan dihapus dari Pustaka.`, 'Hapus', () => { S.lists = S.lists.filter((x) => x !== l); save(); go('#library'); }); }
    if (act === 'newList') return createList();
    if (act === 'addTo') { const c = a.closest('[data-l]'); const L = LISTS.get(c.dataset.l); const l = S.lists.find((x) => x.id === route.arg); if (L && l) { addToList(l, L.tracks[+c.dataset.i]); a.innerHTML = icon('check') + 'Ditambahkan'; } return; }
    if (act === 'clrHist') return confirmBox('Hapus riwayat?', 'Riwayat diputar akan dikosongkan.', 'Hapus', () => { S.hist = []; save(); render(); });
    if (act === 'settings') { e.preventDefault(); return openSettings(); }
    if (act === 'exportAll') return exportAll();
    if (act === 'importLists') return $('#impIn').click();
    if (act === 'pickFiles') return $('#fileIn').click();
    if (act === 'liveEq') return openLive();
    if (act === 'stopLive') return stopLive();
    if (act === 'np-radio') { const t = cur(); if (t) startRadio(t); return; }
    if (act === 'np-ext') { const t = cur(); if (t) open(extUrl(t), '_blank', 'noopener'); return; }
    if (act === 'np-share') { const t = cur(); if (t) share(t.title, shareUrl('#t=' + key(t))); return; }
    if (act === 'q-clear') { Q.list = cur() ? [cur()] : []; Q.i = 0; saveQ(); renderPanel(); return; }
    if (act === 'q-save') return ask('Simpan antrean sebagai playlist', Q.ctx ? Q.ctx.name : 'Antrean saya', 'Nama playlist', (n) => { const l = newList(n, Q.list); toast(`Playlist "${l.name}" dibuat`); });
    if (act === 'q-x') { e.stopPropagation(); return removeQ(+a.closest('[data-qi]').dataset.qi); }
    if (act === 'ly-off') { lyOff = Math.round((lyOff + +a.dataset.d) * 10) / 10; renderLyricsHead(); return; }

    const gen = e.target.closest('[data-genre]');
    if (gen && gen.dataset.go) return go(gen.dataset.go);
    if (gen) return go('#search/' + encodeURIComponent(gen.dataset.genre + (/(Pop|Hits|Galau|Akustik|Indie|90an|2000an)/.test(gen.dataset.genre) ? ' playlist' : '')) + '/playlists');

    const qi = e.target.closest('[data-qi]');
    if (qi && !e.target.closest('a')) { const i = +qi.dataset.qi; if (i === Q.i) togglePlay(); else { Q.i = i; startCur(); } return; }

    const cardEl = e.target.closest('.card, .mini-tr[data-href]');
    if (cardEl && !e.target.closest('a')) {
      if (cardEl.dataset.href) return go(cardEl.dataset.href);
      if (cardEl.dataset.ref) return playColl(cardEl.dataset.ref);
      if (cardEl.dataset.l) { const L = LISTS.get(cardEl.dataset.l); if (L) playFrom(L, +cardEl.dataset.i); }
      return;
    }
    const best = e.target.closest('.best[data-l]');
    if (best) { const L = LISTS.get(best.dataset.l); if (L) playFrom(L, 0); }
  });
  document.addEventListener('dblclick', (e) => {
    const tr = e.target.closest('.tr');
    if (!tr || e.target.closest('button,a')) return;
    const L = LISTS.get(tr.closest('.tl').dataset.l);
    if (L) playFrom(L, +tr.dataset.i);
  });
  document.addEventListener('contextmenu', (e) => {
    const tr = e.target.closest('.tr');
    if (tr && tr.closest('.tl')) {
      const L = LISTS.get(tr.closest('.tl').dataset.l);
      if (!L) return;
      e.preventDefault();
      trackMenu(L.tracks[+tr.dataset.i], { x: e.clientX, y: e.clientY }, { my: L.ctx.my, i: +tr.dataset.i });
      return;
    }
    const c = e.target.closest('.card[data-ref]');
    if (c && c.dataset.ref) { e.preventDefault(); collMenu(c.dataset.ref, { x: e.clientX, y: e.clientY }, { title: c.dataset.title, thumb: c.dataset.thumb, href: c.dataset.href, sub: c.dataset.sub }); }
  });

  function playFrom(L, i) {
    const t = L.tracks[i];
    if (curKey() === key(t) && Engine.eng && (!L.ctx.ref || (Q.ctx && Q.ctx.ref === L.ctx.ref))) return togglePlay();
    if (t.src === 'radio') return setQueue(L.tracks, i, { name: 'Radio', href: '#radio' }, { shuffle: false });
    setQueue(L.tracks, i, L.ctx && L.ctx.name ? { name: L.ctx.name, href: L.ctx.href, ref: L.ctx.ref, thumb: L.ctx.thumb } : null, { random: false });
  }

  // drag & drop reordering (my playlist rows + queue)
  let dragFrom = null;
  document.addEventListener('dragstart', (e) => {
    const r = e.target.closest('.tr[draggable], .mini-tr[draggable]');
    if (!r) return;
    dragFrom = r; r.classList.add('drag');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  });
  document.addEventListener('dragover', (e) => {
    const r = e.target.closest('.tr[draggable], .mini-tr[draggable]');
    if (!dragFrom || !r || r.parentNode !== dragFrom.parentNode) return;
    e.preventDefault();
    $$('.over').forEach((x) => x.classList.remove('over'));
    r.classList.add('over');
  });
  document.addEventListener('dragend', () => { if (dragFrom) dragFrom.classList.remove('drag'); $$('.over').forEach((x) => x.classList.remove('over')); dragFrom = null; });
  document.addEventListener('drop', (e) => {
    const r = e.target.closest('.tr[draggable], .mini-tr[draggable]');
    if (!dragFrom || !r || r === dragFrom) return;
    e.preventDefault();
    if (r.dataset.qi != null) {
      const from = +dragFrom.dataset.qi, to = +r.dataset.qi;
      const k = curKey();
      const [m] = Q.list.splice(from, 1); Q.list.splice(to, 0, m);
      Q.i = Q.list.findIndex((t) => key(t) === k);
      saveQ(); renderPanel();
    } else {
      const L = LISTS.get(r.closest('.tl').dataset.l), l = L && L.ctx.my;
      if (!l) return;
      const [m] = l.tracks.splice(+dragFrom.dataset.i, 1); l.tracks.splice(+r.dataset.i, 0, m);
      save(); render();
    }
  });

  // ---------------------------------------------------------------- side lists
  function renderSideLists() {
    const items = [`<div class="sl${route.name === 'likes' ? ' on' : ''}" data-href="#likes"><div class="cv" style="background:linear-gradient(135deg,#450af5,#8e8ee5);color:#fff">${icon('heartf')}</div><div><div class="t">Lagu yang Disukai</div><div class="s">Playlist · ${S.likes.length} lagu</div></div></div>`];
    for (const l of S.lists) items.push(`<div class="sl${route.name === 'list' && route.arg === l.id ? ' on' : ''}${Q.ctx && Q.ctx.ref === 'my:' + l.id ? ' playing' : ''}" data-href="#list/${l.id}"><div class="cv"${bg((l.tracks[0] || {}).thumb)}>${l.tracks[0] ? '' : icon('music')}</div><div><div class="t">${esc(l.name)}</div><div class="s">Playlist · ${l.tracks.length} lagu</div></div></div>`);
    for (const s of S.saved) items.push(`<div class="sl${Q.ctx && Q.ctx.ref === s.ref ? ' playing' : ''}" data-href="${esc(s.href)}"><div class="cv"${bg(s.thumb)} style="${s.ref.startsWith('artist:') ? 'border-radius:50%' : ''}"></div><div><div class="t">${esc(s.title)}</div><div class="s">${esc(s.sub || '')}</div></div></div>`);
    $('#sideLists').innerHTML = items.join('');
  }
  $('#sideLists').addEventListener('click', (e) => { const s = e.target.closest('[data-href]'); if (s) go(s.dataset.href); });
  function createList() { ask('Playlist baru', 'Playlist saya #' + (S.lists.length + 1), 'Nama playlist', (n) => { const l = newList(n, []); go('#list/' + l.id); }); }
  function editList(l) {
    openModal(`<h3>Ubah playlist</h3><form><label class="f">Nama<input type="text" id="eName" maxlength="80" value="${esc(l.name)}"></label><label class="f">Deskripsi<textarea id="eDesc" rows="3" maxlength="300">${esc(l.desc || '')}</textarea></label><div class="btns"><button type="button" class="btn" data-close>Batal</button><button class="btn pri">Simpan</button></div></form>`, (c) => {
      $('form', c).onsubmit = (e) => { e.preventDefault(); l.name = $('#eName').value.trim() || l.name; l.desc = $('#eDesc').value.trim(); save(); closeModal(); render(); };
    });
  }
  $('#newList').onclick = createList;

  // ---------------------------------------------------------------- import / export / files
  function download(name, data) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function exportAll() {
    download('amatu-playlist-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify({ app: 'amatu-playlist', v: 1, likes: S.likes, lists: S.lists, saved: S.saved, eq: S.eq, myPresets: S.myPresets }, null, 1));
    toast('Data diekspor');
  }
  $('#impIn').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== 'amatu-playlist') throw new Error('bukan file Amatu Playlist');
      let n = 0;
      for (const l of d.lists || []) { if (!S.lists.some((x) => x.id === l.id)) { S.lists.push(l); n++; } }
      const lk = new Set(S.likes.map(key));
      for (const t of d.likes || []) if (!lk.has(key(t))) S.likes.push(t);
      for (const s of d.saved || []) if (!isSaved(s.ref)) S.saved.push(s);
      Object.assign(S.myPresets, d.myPresets || {});
      save(); renderSideLists(); render();
      toast(`Impor selesai: ${n} playlist`);
    } catch (err) { toast('Gagal impor: ' + err.message, 'err'); }
  };
  const FILES = [];
  function addFiles(files) {
    const list = [...files].filter((f) => /^audio\/|^video\/mp4/.test(f.type) || /\.(mp3|m4a|flac|wav|ogg|opus|aac)$/i.test(f.name));
    if (!list.length) return toast('Tidak ada file audio', 'err');
    const tr = list.map((f) => {
      const base = f.name.replace(/\.[^.]+$/, '');
      const m = base.match(/^(.+?)\s+-\s+(.+)$/);
      const t = { src: 'file', id: uid(), title: m ? m[2] : base, artists: [{ name: m ? m[1] : 'File lokal' }], url: URL.createObjectURL(f), sec: 0, thumb: '' };
      const a = new Audio(); a.preload = 'metadata'; a.src = t.url; a.onloadedmetadata = () => { t.sec = Math.round(a.duration) || 0; };
      return t;
    });
    FILES.push(...tr);
    toast(`${tr.length} file ditambahkan`);
    if (route.name === 'files') render(); else go('#files');
    setQueue(FILES, FILES.length - tr.length, { name: 'File lokal', href: '#files' }, { shuffle: false });
  }
  $('#fileIn').onchange = (e) => { addFiles(e.target.files); e.target.value = ''; };
  window.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); document.body.classList.add('dragging'); } });
  window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
  window.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); document.body.classList.remove('dragging'); addFiles(e.dataTransfer.files); } });

  // ---------------------------------------------------------------- now playing (bar, full, panel)
  const ctlPlay = [$('#cPlay'), $('#fPlay')];
  function renderPlayState(p) {
    p = p == null ? Engine.playing() : p;
    for (const b of ctlPlay) $('use', b).setAttribute('href', p ? '#i-pause' : '#i-play');
    $$('.tl').forEach((t) => t.classList.toggle('paused', !p));
    $$('.card').forEach((c) => { const on = p && Q.ctx && c.dataset.ref === Q.ctx.ref; c.classList.toggle('playing', !!on); const u = $('.pb use', c); if (u && c.dataset.ref) u.setAttribute('href', on ? '#i-pause' : '#i-play'); });
    $$('[data-act="pcoll"]').forEach((b) => $('use', b).setAttribute('href', p && Q.ctx && Q.ctx.ref === b.dataset.ref ? '#i-pause' : '#i-play'));
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = p ? 'playing' : 'paused';
    renderPip();
  }
  function renderControls() {
    for (const id of ['#cShuf', '#fShuf']) $(id).classList.toggle('on', S.shuffle);
    for (const id of ['#cRep', '#fRep']) { $(id).classList.toggle('on', S.repeat > 0); $(id).classList.toggle('rep1', S.repeat === 2); }
    $('#speedB').textContent = S.rate !== 1 ? S.rate + '×' : '';
  }
  function renderLikeBtns() {
    const t = cur(), on = t && liked(t);
    for (const id of ['#bLike', '#fLike']) { const b = $(id); b.classList.toggle('on', !!on); $('use', b).setAttribute('href', on ? '#i-heartf' : '#i-heart'); b.style.visibility = t && t.src !== 'file' && t.src !== 'radio' ? '' : 'hidden'; }
  }
  function markCur() {
    const k = curKey();
    $$('.tr').forEach((r) => r.classList.toggle('cur', r.dataset.k === k));
  }
  let lastTintFor = '';
  function renderNow() {
    const t = cur();
    $('#bArt').style.backgroundImage = t && t.thumb ? `url("${t.thumb}")` : '';
    $('#bArt').innerHTML = t && !t.thumb ? icon(t.src === 'radio' ? 'radio' : 'music') : '';
    $('#bTitle').textContent = t ? t.title : 'Belum ada lagu';
    $('#bSub').innerHTML = t ? arts(t) : 'Pilih lagu untuk mulai';
    $('#fTitle').textContent = t ? t.title : '';
    $('#fSub').innerHTML = t ? arts(t) : '';
    $('#fArt').style.backgroundImage = t && t.thumb ? `url("${t.thumb}")` : '';
    $('#fArt').style.backgroundSize = $('#bArt').style.backgroundSize = t && t.src === 'radio' ? 'contain' : '';
    $('#fArt').style.backgroundRepeat = $('#bArt').style.backgroundRepeat = 'no-repeat';
    $('#fBg').style.backgroundImage = t && t.thumb ? `url("${t.thumb}")` : '';
    $('#fCtx').textContent = Q.ctx ? 'Diputar dari · ' + Q.ctx.name : 'Sedang diputar';
    document.title = t ? `${t.title} · ${artistsText(t)} — Amatu Playlist` : 'Amatu Playlist';
    const live = Engine.isLive() || (t && t.src === 'radio');
    $('#seek').classList.toggle('dis', !!live); $('#fSeek').classList.toggle('dis', !!live);
    renderLikeBtns(); renderControls(); renderPlayState(); markCur();
    const vid = isVideoMode();
    $('#fStage').classList.toggle('vid', vid);
    $('#fVid').classList.toggle('on', vid);
    $('#fVid').style.display = Engine.eng === 'yt' || (curSpec && curSpec.ar) ? '' : 'none';
    if (t && t.thumb !== lastTintFor) { lastTintFor = t.thumb; tintOf(t.thumb).then((c) => document.documentElement.style.setProperty('--tint', c)); }
    mediaMeta(t);
    renderPanel();
    renderFullRight();
    renderPip();
  }
  // music videos show the player; audio tracks (art tracks / Spotify matches) show artwork unless toggled
  let vidOverride = { k: '', v: null };
  const isVideoMode = () => {
    const t = cur();
    if (Engine.eng !== 'yt' || !t) return false;
    if (vidOverride.k === key(t) && vidOverride.v != null) return vidOverride.v;
    return S.set.video && t.kind === 'video' && !adFreeOn();   // ad-free: video only when asked for (YouTube player)
  };
  function toggleVideo() {
    const v = !isVideoMode();
    vidOverride = { k: curKey(), v }; dockHidden = false;
    // ad-free audio has no picture: the video needs the YouTube player (and back to ad-free when turned off)
    if (v && Engine.eng === 'au' && curSpec && curSpec.ar) { toast('Video memakai pemutar YouTube — bisa ada iklan. Matikan Video untuk kembali bebas iklan.'); curSpec = { eng: 'yt', id: curSpec.ar }; Engine.load(curSpec, { autoplay: Engine.playing(), start: Engine.time() }); }
    else if (!v && Engine.eng === 'yt' && adFreeOn() && curSpec && curSpec.id) {
      const id = curSpec.id, at = Engine.time(), was = Engine.playing(), tok = playTok;
      adFreeUrl(id).then((url) => { if (url && tok === playTok && !isVideoMode()) { curSpec = { eng: 'au', url, ar: id }; Engine.load(curSpec, { autoplay: was, start: at, startMs: startLimit() }); } });
    }
    renderNow();
  }

  // panel
  const pbody = $('#pbody');
  const activeTab = () => (document.body.classList.contains('nopanel') ? null : S.set.ptab);
  function setTab(tab, show) {
    S.set.ptab = tab; save();
    if (show) { document.body.classList.remove('nopanel'); S.set.panel = true; }
    $$('#ptabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    renderPanel();
  }
  function togglePanelTab(tab) {
    if (!document.body.classList.contains('nopanel') && S.set.ptab === tab) { document.body.classList.add('nopanel'); S.set.panel = false; save(); return; }
    setTab(tab, true);
  }
  $('#ptabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); };
  $('#panelBtn').onclick = () => { document.body.classList.toggle('nopanel'); S.set.panel = !document.body.classList.contains('nopanel'); save(); renderPanel(); };
  let eqUI = null;
  function renderPanel() {
    if (document.body.classList.contains('nopanel')) { pbody.innerHTML = ''; eqUI = null; return; }
    const tab = S.set.ptab;
    $$('#ptabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    if (tab === 'np') pbody.innerHTML = npHtml();
    else if (tab === 'queue') pbody.innerHTML = queueHtml();
    else if (tab === 'lyrics') { pbody.innerHTML = lyricsHtml(); lyLast = -2; }
    else if (tab === 'eq') { eqUI = eqRender(pbody); return; }
    eqUI = eqUI && eqUI.box !== pbody ? eqUI : null;
  }
  function npHtml() {
    const t = cur();
    if (!t) return empty('music', 'Belum ada yang diputar', 'Pilih lagu, album atau playlist.');
    const vid = isVideoMode();
    const nexts = Q.list.slice(Q.i + 1, Q.i + 4);
    return `<div class="np-card">
      <div class="np-stage${vid ? ' vid' : ''}"${vid ? '' : bg(t.thumb)}>${vid ? '<div class="vslot" id="pSlot"></div>' : '<canvas id="npViz" width="600" height="200"></canvas>'}</div>
      ${Engine.eng === 'sp' ? '<div class="spslot" id="pSpSlot" style="height:152px"></div>' : ''}
      <div class="np-row"><div style="min-width:0"><div class="np-t">${esc(t.title)}</div><div class="np-a">${arts(t)}</div></div>${t.src === 'file' || t.src === 'radio' ? '' : `<button class="ib like${liked(t) ? ' on' : ''}" data-act="np-like">${icon(liked(t) ? 'heartf' : 'heart')}</button>`}</div>
      <div class="chips" style="margin:0">${t.src !== 'file' && t.src !== 'radio' ? `<button class="chip" data-act="np-radio">${icon('radio')}Radio lagu</button>` : ''}${Engine.eng === 'yt' ? `<button class="chip${vid ? ' on' : ''}" data-act="np-video">${icon('video')}Video</button>` : ''}${t.src === 'yt' || t.src === 'sp' ? `<button class="chip" data-act="np-ext">${icon(t.src === 'yt' ? 'yt' : 'sp')}Buka</button><button class="chip" data-act="np-share">${icon('share')}Bagikan</button>` : ''}</div>
      ${t.album || t.sec ? `<div class="np-box"><h4>Info lagu</h4><div style="color:var(--mut);font-size:13px;display:grid;gap:4px">${t.album ? `<div>Album: ${t.album.id ? `<a href="#album/${esc(t.album.id)}" style="color:var(--tx)">${esc(t.album.name)}</a>` : esc(t.album.name)}</div>` : ''}${t.sec ? `<div>Durasi: ${fmt(t.sec)}</div>` : ''}</div></div>` : ''}
      ${nexts.length ? `<div class="np-box"><h4>Berikutnya di antrean <button data-tabgo="queue">Buka antrean</button></h4>${nexts.map((x, j) => miniRow(x, Q.i + 1 + j)).join('')}</div>` : ''}
      <div class="np-box"><h4>Equalizer <button data-tabgo="eq">Atur</button></h4><div style="color:var(--mut);font-size:13px">${esc(eqStatus().short)}</div></div>
    </div>`;
  }
  function miniRow(t, i, opt) {
    opt = opt || {};
    return `<div class="mini-tr${i === Q.i ? ' cur' : ''}" data-qi="${i}"${opt.drag ? ' draggable="true"' : ''}>${opt.drag ? `<span class="grip">${icon('grip')}</span>` : ''}<div class="th"${bg(t.thumb)}></div><div><div class="tt">${esc(t.title)}</div><div class="ar">${esc(artistsText(t))}</div></div>${opt.x ? `<button class="ib x" data-act="q-x" title="Hapus">${icon('x')}</button>` : ''}</div>`;
  }
  function queueHtml() {
    const t = cur();
    if (!t) return empty('queue', 'Antrean kosong');
    const rest = Q.list.slice(Q.i + 1);
    return `<div class="np-box" style="margin-bottom:12px"><h4>Sedang diputar</h4>${miniRow(t, Q.i)}</div>
      <div class="np-box"><h4>Berikutnya${Q.ctx ? ' dari ' + esc(Q.ctx.name) : ''} <span style="display:flex;gap:10px"><button data-act="q-save">Simpan</button><button data-act="q-clear">Bersihkan</button></span></h4>
      ${rest.length ? rest.map((x, j) => miniRow(x, Q.i + 1 + j, { drag: !touch, x: true })).join('') : `<div style="color:var(--mut);font-size:13px">Tidak ada lagi. ${S.set.autoRadio ? 'Autoplay akan memutar lagu serupa.' : ''}</div>`}</div>
      ${Q.i > 0 ? `<div class="np-box" style="margin-top:12px"><h4>Sudah diputar</h4>${Q.list.slice(Math.max(0, Q.i - 10), Q.i).map((x, j) => miniRow(x, Math.max(0, Q.i - 10) + j)).join('')}</div>` : ''}`;
  }
  pbody.addEventListener('click', (e) => {
    const g = e.target.closest('[data-tabgo]'); if (g) return setTab(g.dataset.tabgo);
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'np-like') { toggleLike(cur()); renderPanel(); }
    if (a.dataset.act === 'np-video') toggleVideo();
  });
  pbody.addEventListener('contextmenu', (e) => { const r = e.target.closest('[data-qi]'); if (!r) return; e.preventDefault(); const i = +r.dataset.qi; trackMenu(Q.list[i], { x: e.clientX, y: e.clientY }, { queue: i === Q.i ? null : i }); });

  // full screen
  const full = $('#full');
  let fTool = null;
  function openFull(tool) {
    full.hidden = false;
    if (tool) fTool = tool;
    else if (!fTool && !mobile()) fTool = 'lyrics';
    renderNow();
  }
  function closeFull() { full.hidden = true; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  $('#fClose').onclick = closeFull;
  // anywhere on the bar (not its buttons, links or sliders) opens the playing song's lyrics full screen
  $('#bar').addEventListener('click', (e) => { if (e.target.closest('button, a, .range, .vol')) return; openFull(cur() ? 'lyrics' : null); });
  $('#tFull').onclick = () => { openFull(); if (!mobile()) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); };
  $('#fMore').onclick = (e) => { const t = cur(); if (t) trackMenu(t, e.currentTarget); };
  $$('.f-tools .chip').forEach((b) => b.onclick = () => {
    const k = b.dataset.ft;
    if (k === 'video') { toggleVideo(); return; }
    fTool = fTool === k ? null : k;
    renderFullRight();
  });
  function renderFullRight() {
    if (full.hidden) return;
    $$('.f-tools .chip[data-ft]').forEach((b) => { if (b.dataset.ft !== 'video') b.classList.toggle('on', b.dataset.ft === fTool); });
    const box = $('#fRight');
    const close = `<button class="ib round close-r" data-fclose>${icon('x')}</button>`;
    if (!fTool) { box.innerHTML = ''; return; }
    if (fTool === 'lyrics') { box.innerHTML = close + lyricsHtml(); lyLast = -2; }
    else if (fTool === 'queue') box.innerHTML = close + queueHtml();
    else if (fTool === 'eq') { box.innerHTML = close + '<div id="fEq"></div>'; eqRender($('#fEq')); }
  }
  $('#fRight').addEventListener('click', (e) => { if (e.target.closest('[data-fclose]')) { fTool = null; renderFullRight(); } });
  $('#fRight').addEventListener('contextmenu', (e) => { const r = e.target.closest('[data-qi]'); if (!r) return; e.preventDefault(); const i = +r.dataset.qi; trackMenu(Q.list[i], { x: e.clientX, y: e.clientY }, { queue: i === Q.i ? null : i }); });
  // swipe down to close on phones
  (() => { let y0 = null; full.addEventListener('touchstart', (e) => { if (!e.target.closest('.f-right, .range')) y0 = e.touches[0].clientY; }, { passive: true }); full.addEventListener('touchend', (e) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 110) closeFull(); y0 = null; }); })();

  // bar buttons
  const bind = (ids, f) => ids.forEach((id) => { $(id).onclick = f; });
  bind(['#cPlay', '#fPlay'], togglePlay);
  bind(['#cNext', '#fNext'], () => next(false));
  bind(['#cPrev', '#fPrev'], prev);
  bind(['#cShuf', '#fShuf'], toggleShuffle);
  bind(['#cRep', '#fRep'], cycleRepeat);
  bind(['#bLike', '#fLike'], () => toggleLike(cur()));
  $('#tQueue').onclick = () => togglePanelTab('queue');
  $('#tLyr').onclick = () => togglePanelTab('lyrics');
  $('#tFly').onclick = () => { S.set.floatLy = !S.set.floatLy; save(); flyKey = ''; toast(S.set.floatLy ? 'Lirik mengambang aktif' : 'Lirik mengambang disembunyikan'); };
  $('#tEq').onclick = () => togglePanelTab('eq');
  $('#goBack').onclick = () => history.back();
  $('#goFwd').onclick = () => history.forward();
  $('#setBtn').onclick = openSettings;
  view.addEventListener('scroll', () => { $('#top').style.setProperty('--topA', Math.min(1, view.scrollTop / 120).toFixed(2)); }, { passive: true });

  // seek + volume
  const seekS = slider($('#seek'), { min: 0, max: 1, step: 0.0005, value: 0, tip: (v) => fmt(v * (Engine.duration() || (cur() || {}).sec || 0)), onInput: (v, fin) => { const d = Engine.duration(); $('#tCur').textContent = fmt(v * d); if (fin && d) { Engine.seek(v * d); fadingOut = false; Engine.fade(1, 0); } } });
  const fSeekS = slider($('#fSeek'), { min: 0, max: 1, step: 0.0005, value: 0, onInput: (v, fin) => { const d = Engine.duration(); $('#fCur').textContent = fmt(v * d); if (fin && d) { Engine.seek(v * d); fadingOut = false; Engine.fade(1, 0); } } });
  const volS = slider($('#vol'), { min: 0, max: 1, step: 0.01, value: S.vol, wheel: 0.05, onInput: (v, fin) => { S.vol = v; S.muted = v === 0 ? S.muted : false; Engine.setVol(v); Engine.setMuted(S.muted); renderVol(); if (fin) save(); } });
  function renderVol() { $('use', $('#tMute')).setAttribute('href', S.muted || S.vol === 0 ? '#i-mute' : '#i-vol'); volS.set(S.muted ? 0 : S.vol); }
  $('#tMute').onclick = () => { S.muted = !S.muted; Engine.setMuted(S.muted); renderVol(); save(); };

  // speed + sleep timer
  $('#tSpeed').onclick = (e) => openMenu([{ head: 'Kecepatan putar' }].concat([0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2].map((r) => ({ label: (r === 1 ? 'Normal' : r + '×'), check: S.rate === r, run: () => { S.rate = r; Engine.setRate(r); save(); renderControls(); } }))), e.currentTarget);
  const sleep = { at: 0, end: false };
  function renderSleep() { const b = $('#timerB'); b.textContent = sleep.end ? '♪' : sleep.at ? Math.max(1, Math.round((sleep.at - Date.now()) / 60000)) + 'm' : ''; $('#tTimer').classList.toggle('on', !!(sleep.at || sleep.end)); }
  $('#tTimer').onclick = (e) => openMenu([{ head: 'Timer tidur' }].concat([5, 15, 30, 45, 60, 90].map((m) => ({ label: m + ' menit', run: () => { sleep.at = Date.now() + m * 60000; sleep.end = false; renderSleep(); toast(`Musik berhenti dalam ${m} menit`); } })), [{ label: 'Akhir lagu ini', run: () => { sleep.end = true; sleep.at = 0; renderSleep(); toast('Berhenti setelah lagu ini'); } }, { label: 'Matikan timer', check: !sleep.at && !sleep.end, run: () => { sleep.at = 0; sleep.end = false; renderSleep(); } }]), e.currentTarget);

  // ---------------------------------------------------------------- lyrics
  // A timed lyric from a lyric site is only used when it was timed on this very recording (artist + length agree).
  // Otherwise the lines come from this song's own audio: first the ones already written (shared in the cloud), then the
  // cloud (edge fn amatu-lirik → Gemini). Lyrics of other recordings only help spelling. Lines not in Indonesian get an Indonesian translation underneath.
  const LY = { key: '', data: null, state: 'idle', tr: null };
  const LYC = new Map();   // track + upload → { data, tr } for this visit
  let lyOff = 0, lyLast = -2, lyUserScroll = 0, aiPause = 0;
  const ytIdOf = (t) => { const o = t.src === 'yt' ? t.id : t.src === 'sp' ? S.match[t.id] : null; return o ? ALT[o] || o : null; };
  const lyNorm = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const sleepMs = (ms) => new Promise((ok) => setTimeout(ok, ms));
  // long instrumental parts: the last sung line should not stay lit until the next verse
  function withGaps(L) {
    const gaps = L.slice(1).map((l, i) => l.t - L[i].t).filter((g) => g > 0).sort((a, b) => a - b);
    const m = gaps[gaps.length >> 1] || 6, out = [];
    L.forEach((l, i) => {
      out.push(l);
      const nx = L[i + 1];
      if (nx && l.x && nx.x && nx.t - l.t > Math.max(12, m * 2.5)) out.push({ t: Math.round((l.t + Math.max(m * 1.2, 5)) * 10) / 10, x: '' });
    });
    return out;
  }
  function lyFromLines(t, lines) {
    const q = API.lyricQuery(t);
    const L = (lines || []).filter((l) => lyNorm(l.x) !== lyNorm(`${q.title} ${q.artist}`));
    if (!L.length) return { instrumental: true, gen: true };
    return { synced: withGaps(L), plain: L.map((l) => l.x).join('\n'), source: 'otomatis dari audio (AI)', gen: true };
  }
  async function cloudLyrics(t, id) {
    if (!AMT) return null;
    const d = await AMT.rpc('amt_lyrics_get', { p_id: id }).catch(() => null);
    return d && d.lines ? lyFromLines(t, d.lines) : null;
  }
  async function aiLyrics(t, id, k, ref, sec) {
    if (!AMT || !rtoken() || (sec || t.sec) > 900 || Date.now() < aiPause) return null;
    const q = API.lyricQuery(t);
    for (let i = 0; i < 6 && LY.key === k; i++) {
      const r = await fetch(API.EDGE.replace('amatu-music', 'amatu-lirik') + '?' + new URLSearchParams({ id, t: q.title, ar: q.artist, d: sec || t.sec || 0 }), { method: 'POST', headers: { 'x-amatu': rtoken(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: (ref || '').slice(0, 5000) }), signal: AbortSignal.timeout(170e3) });
      const j = await r.json().catch(() => ({}));
      if (j.lines) return lyFromLines(t, j.lines);
      if (j.error === 'kuota' || j.error === 'limit') { aiPause = Date.now() + 1800e3; return null; }   // daily allowance gone: no point in asking every song
      if (!j.busy && !(/^gemini/.test(j.error || '') && i < 2)) return null;
      await sleepMs(j.busy ? 20e3 : 45e3);   // another device is writing it / Gemini is overloaded
    }
    return null;
  }
  // the length of the audio actually playing (a search result often has none, and another upload has its own)
  async function lyLength(t, k) {
    for (let i = 0; i < 32 && LY.key === k; i++) {
      if (key(cur()) === key(t) && Engine.eng && (Engine.eng !== 'yt' || Engine.playing())) {
        const d = Engine.duration();
        if (d > 20 && isFinite(d)) return Math.round(d);
      }
      await sleepMs(250);
    }
    return t.sec || 0;
  }
  const lyShow = (d, state) => { LY.data = d; LY.state = state; refreshLyrics(); };
  async function loadLyrics(t, again) {
    const k = key(t) + '|' + (ytIdOf(t) || '');
    if (LY.key === k && !again) return;
    LY.key = k; LY.data = null; LY.tr = null;
    if (t.src === 'radio') { LY.state = 'none'; refreshLyrics(); return; }
    const c = LYC.get(k);
    if (c) { LY.data = c.data; LY.tr = c.tr; LY.state = 'ok'; refreshLyrics(); return; }
    if (!again) { LY.state = 'loading'; LY.retry = 0; lyOff = 0; refreshLyrics(); }
    const id = t.src === 'sp' && !S.match[t.id] ? await API.match(t).then((m) => m && m.id).catch(() => null) : ytIdOf(t);
    if (LY.key !== k) return;
    const sec = await lyLength(t, k);
    if (LY.key !== k) return;
    const f = await API.lyrics(ALTBY[id] ? { ...t, artists: t.artists.concat(ALTBY[id]) } : t, id, sec).catch(() => ({ exact: null }));
    if (LY.key !== k) return;
    let d = f.exact, later = false;
    if (!d && id) {
      d = await cloudLyrics(t, id);
      if (LY.key !== k) return;
      // lrclib failing may hide a timed lyric: look again before spending the audio allowance
      if (!d && API.lyricsUnsure() && LY.retry < 2) later = true;
      else if (!d) {
        if (f.text) lyShow(f.text, 'ok'); else { LY.state = 'gen'; refreshLyrics(); }   // words first when the right ones are known
        d = await aiLyrics(t, id, k, f.ref, sec).catch(() => null);
        if (LY.key !== k) return;
      }
    }
    const final = d && (d.gen || f.exact);   // anything less is tried again next time the song plays
    d = d || f.loose || f.text || null;
    if (!d && API.lyricsUnsure() && LY.retry < 3) later = true;
    lyShow(d, d ? 'ok' : later ? 'loading' : 'none');
    if (later) { LY.retry++; setTimeout(() => { if (LY.key === k) loadLyrics(t, true); }, 45e3); }
    if (!d || d.instrumental) return;
    if (final) LYC.set(k, { data: d, tr: null });
    const lines = d.synced ? d.synced.map((l) => l.x) : d.plain.split('\n');
    API.translate(lines).then((r) => {
      const tr = r.lines.map((x, i) => (x && !/^(id|ms)$/.test(r.lang[i]) && lyNorm(x) !== lyNorm(lines[i]) ? x : ''));
      if (!tr.some(Boolean)) return;
      const e = LYC.get(k); if (e) e.tr = tr;
      if (LY.key === k) { LY.tr = tr; refreshLyrics(); }
    }).catch(() => { /* lyrics stay without translation */ });
  }
  function refreshLyrics() {
    if (activeTab() === 'lyrics') renderPanel();
    if (!full.hidden && fTool === 'lyrics') renderFullRight();
  }
  const lyTr = (i) => (LY.tr && LY.tr[i] ? `<span class="ly-tr">${esc(LY.tr[i])}</span>` : '');
  function lyricsHtml() {
    const t = cur();
    if (!t) return empty('mic', 'Belum ada lagu');
    if (LY.state === 'loading') return loading();
    if (LY.state === 'gen') return `<div class="load"><div class="spin"></div></div>` + empty('mic', 'Membuat lirik…', '');
    if (LY.state !== 'ok' || !LY.data) return empty('mic', t.src === 'radio' ? 'Lirik tidak tersedia untuk radio' : 'Lirik tidak ditemukan', t.src === 'radio' ? '' : '');
    if (LY.data.instrumental) return empty('music', 'Instrumental', 'Lagu ini tanpa vokal.');
    if (LY.data.synced) return `<div class="lyr-h"><span></span><span class="off">Sinkron <button data-act="ly-off" data-d="-0.5">−</button><b class="lyo">${lyOff > 0 ? '+' : ''}${lyOff}s</b><button data-act="ly-off" data-d="0.5">+</button></span></div><div class="lyr">${LY.data.synced.map((l, i) => `<p data-ly="${i}">${esc(l.x || '♪')}${lyTr(i)}</p>`).join('')}</div>`;
    return `<div class="lyr plain">${LY.data.plain.split('\n').map((l, i) => `<p>${esc(l) || '&nbsp;'}${lyTr(i)}</p>`).join('')}</div>`;
  }
  function renderLyricsHead() { $$('.lyo').forEach((b) => { b.textContent = (lyOff > 0 ? '+' : '') + lyOff + 's'; }); lyLast = -2; }
  document.addEventListener('click', (e) => {
    const p = e.target.closest('[data-ly]');
    if (!p || !LY.data || !LY.data.synced) return;
    Engine.seek(Math.max(0, LY.data.synced[+p.dataset.ly].t - lyOff));
    lyUserScroll = 0;
  });
  for (const el of [pbody, $('#fRight'), $('#flyB')]) el.addEventListener('wheel', () => { lyUserScroll = Date.now(); }, { passive: true });
  for (const el of [pbody, $('#fRight'), $('#flyB')]) el.addEventListener('touchmove', () => { lyUserScroll = Date.now(); }, { passive: true });
  function syncLyrics(time) {
    if (!LY.data || !LY.data.synced) return;
    const L = LY.data.synced, tt = time + lyOff + 0.15;
    let i = -1;
    for (let j = 0; j < L.length; j++) { if (L[j].t <= tt) i = j; else break; }
    if (i === lyLast) return;
    lyLast = i;
    for (const box of $$('.lyr')) {
      const ps = box.children;
      for (let j = 0; j < ps.length; j++) { ps[j].classList.toggle('now', j === i); ps[j].classList.toggle('past', j < i); }
      if (i >= 0 && Date.now() - lyUserScroll > 3500) {
        const sc = box.closest('#pbody, .f-right, .fly-b'), p = ps[i];
        if (sc && p) sc.scrollTo({ top: p.offsetTop - sc.clientHeight * 0.36, behavior: 'smooth' });
      }
    }
  }

  setInterval(() => { if (!document.hidden && Engine.eng && Engine.playing()) syncLyrics(Engine.time()); }, 100);   // the main tick is 250 ms

  // floating lyrics: left third of the screen while a song plays (checked every tick, so no init-order worries)
  const fly = $('#fly'), flyB = $('#flyB');
  let flyKey = '', flyOff = 0;
  function updateFly(tm, d) {
    const t = cur(), D = LY.data;
    const has = !!(t && LY.state === 'ok' && D && !D.instrumental);
    const want = S.set.floatLy && has && full.hidden && innerWidth > 700;
    $('#tFly').classList.toggle('on', !!S.set.floatLy);
    // short pauses (buffering, song change) keep it up; a real pause fades it out after 1.5 s
    if (Engine.playing()) flyOff = 0; else if (!flyOff) flyOff = Date.now();
    const show = want && (!flyOff || Date.now() - flyOff < 1500);
    fly.classList.toggle('on', show);
    if (!has) { flyKey = ''; return; }
    const k = LY.key + '|' + (LY.tr ? 1 : 0) + '|' + (D.synced ? 's' : 'p');
    if (k !== flyKey) {
      flyKey = k;
      $('#flyT').textContent = t.title;
      flyB.innerHTML = D.synced
        ? `<div class="lyr">${D.synced.map((l, i) => `<p data-ly="${i}">${esc(l.x || '♪')}${lyTr(i)}</p>`).join('')}</div>`
        : `<div class="lyr plain">${D.plain.split('\n').map((l, i) => `<p>${esc(l) || '&nbsp;'}${lyTr(i)}</p>`).join('')}</div>`;
      flyB.scrollTop = 0; lyLast = -2;
    }
    // unsynced lyrics follow the song's progress
    if (show && !D.synced && d && Date.now() - lyUserScroll > 3500) flyB.scrollTop = Math.max(0, (flyB.scrollHeight - flyB.clientHeight) * Math.min(1, tm / d) - flyB.clientHeight * 0.2);
  }
  $('#flyFull').onclick = () => openFull('lyrics');
  $('#flyX').onclick = () => { S.set.floatLy = false; save(); toast('Lirik mengambang disembunyikan — tampilkan lagi dengan tombol lirik di bar bawah'); };

  // ---------------------------------------------------------------- EQ
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('amatu-eq') : null;
  let live = false, liveWin = null;
  if (bc) {
    bc.onmessage = (e) => {
      if (e.data && 'live' in e.data && live !== e.data.live) {
        live = e.data.live;
        Engine.eq(S.eq, live);
        toast(live ? 'EQ Live aktif — semua suara diproses EQ' : 'EQ Live mati');
        if (activeTab() === 'eq' || activeTab() === 'np') renderPanel();
        if (fTool === 'eq') renderFullRight();
      }
    };
    bc.postMessage({ ping: 1 });
  }
  function openLive() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia || mobile()) return toast('EQ Live butuh Chrome/Edge di komputer', 'err');
    liveWin = open('eq.html', 'amatu-eq', 'width=440,height=600');
    if (!liveWin) toast('Izinkan pop-up untuk membuka EQ Live', 'err');
  }
  function stopLive() { if (bc) bc.postMessage({ stop: 1 }); }
  const pushEq = debounce(() => { if (bc) bc.postMessage({ eq: S.eq }); }, 30);
  function eqChanged(fin) {
    Engine.eq(S.eq, live);
    pushEq();
    if (fin) save();
    for (const u of eqUIs) u.sync();
  }
  function eqStatus() {
    const e = Engine.eng;
    if (!S.eq.on) return { cls: '', short: 'EQ nonaktif', html: 'EQ dimatikan.' };
    if (Engine.ios) return { cls: '', short: 'EQ tidak dipakai di iPhone/iPad', html: 'Di iPhone/iPad lagu diputar tanpa EQ supaya tetap berjalan saat layar terkunci.' };
    if (e === 'au' && Engine.noGraph()) return { cls: 'ok', short: 'Aktif · ' + S.eq.preset, html: '<b>EQ aktif.</b>' };
    if (live) return { cls: 'ok', short: 'EQ Live aktif · ' + S.eq.preset, html: `<b>EQ Live aktif.</b> Semua suara tab ini (YouTube, Spotify, radio) diproses EQ. <br><button class="btn sm" data-act="stopLive">Matikan EQ Live</button>` };
    if (Engine.hasFx()) return { cls: 'ok', short: 'Aktif · ' + S.eq.preset, html: '<b>EQ aktif.</b>' };
    if (e === 'au') return { cls: '', short: 'Stasiun ini mengunci audio — pakai EQ Live', html: `Stasiun ini tidak mengizinkan pemrosesan audio. <b>Aktifkan EQ Live</b> agar EQ tetap bekerja.<br><button class="btn sm pri" data-act="liveEq">${icon('eq')}Aktifkan EQ Live</button>` };
    return { cls: '', short: (e === 'sp' ? 'Spotify' : 'YouTube') + ': aktifkan EQ Live agar EQ terdengar', html: `Lagu ${e === 'sp' ? 'Spotify' : 'YouTube'} diputar di pemutar resmi yang dikunci browser. Aktifkan <b>EQ Live</b> (Chrome/Edge di komputer) supaya EQ ini juga mengolah lagunya.<br><button class="btn sm pri" data-act="liveEq">${icon('eq')}Aktifkan EQ Live</button><div style="margin-top:6px">EQ langsung aktif tanpa EQ Live untuk: Radio, File lokal, Preview Hi-Fi.</div>` };
  }
  const eqUIs = new Set();
  let eqDraw = null;
  function eqRender(box) {
    const e = S.eq;
    const fl = (f) => f >= 1000 ? f / 1000 + 'k' : f;
    const st = eqStatus();
    const presets = Object.keys(FX.PRESETS).concat(Object.keys(S.myPresets));
    box.innerHTML = `<div class="eq${e.on ? '' : ' off'}">
      <div class="eq-top"><div><b style="font-size:16px">Equalizer</b><div style="font-size:12px;color:var(--mut)">10 band · preset: <span class="eqp">${esc(e.preset)}</span></div></div><button class="sw${e.on ? ' on' : ''}" data-eq="on" title="EQ aktif"></button></div>
      <div class="note ${st.cls} eq-note">${st.html}</div>
      <div class="eq-graph"><canvas width="680" height="240"></canvas></div>
      <div class="eq-presets">${presets.map((p) => `<button class="chip${p === e.preset ? ' on' : ''}" data-preset="${esc(p)}">${esc(p)}${S.myPresets[p] ? ' ★' : ''}</button>`).join('')}</div>
      <div class="eq-bands">${FX.EQF.map((f, i) => `<div style="display:grid;gap:4px;justify-items:center"><div class="eq-val" data-bv="${i}"></div><div class="vs" data-band="${i}"><div class="vf"></div><div class="vk"></div></div><div class="eq-lbl">${fl(f)}</div></div>`).join('')}</div>
      <div class="eq-sec"><h5>Penguat</h5>
        <div class="knob-row"><span>Preamp</span><div class="range" data-k="pre"><div class="fill"></div><div class="knob"></div></div><span class="v" data-kv="pre"></span></div>
        <div class="knob-row"><span>Bass boost</span><div class="range" data-k="bass"><div class="fill"></div><div class="knob"></div></div><span class="v" data-kv="bass"></span></div>
        <div class="knob-row"><span>Kejernihan</span><div class="range" data-k="treble"><div class="fill"></div><div class="knob"></div></div><span class="v" data-kv="treble"></span></div>
      </div>
      <div class="eq-sec"><h5>Ruang & stereo</h5>
        <div class="knob-row"><span>Lebar stereo</span><div class="range" data-k="width"><div class="fill"></div><div class="knob"></div></div><span class="v" data-kv="width"></span></div>
        <div class="knob-row"><span>Balance</span><div class="range" data-k="bal"><div class="fill"></div><div class="knob"></div></div><span class="v" data-kv="bal"></span></div>
        <div class="knob-row"><span>Efek ruang</span><select data-room>${Object.keys(FX.ROOMS).map((r) => `<option value="${r}"${r === e.room ? ' selected' : ''}>${{ off: 'Mati', studio: 'Studio', kafe: 'Kafe', hall: 'Concert hall', stadion: 'Stadion' }[r]}</option>`).join('')}</select><span></span></div>
        <div class="knob-row"><span>Kadar ruang</span><div class="range" data-k="mix"><div class="fill"></div><div class="knob"></div></div><span class="v" data-kv="mix"></span></div>
      </div>
      <div class="eq-sec"><h5>Dinamika</h5>
        <div class="knob-row"><span>Normalisasi volume</span><span style="font-size:12px;color:var(--mut)">Suara pelan & keras jadi rata</span><button class="sw${e.comp ? ' on' : ''}" data-eq="comp"></button></div>
        <div class="knob-row"><span>Anti-clipping</span><span style="font-size:12px;color:var(--mut)">Cegah pecah saat band dinaikkan</span><button class="sw${e.guard ? ' on' : ''}" data-eq="guard"></button></div>
      </div>
      <div class="btns" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-eqa="savePreset">${icon('plus')}Simpan preset</button><button class="btn sm" data-eqa="reset">Reset</button>${S.myPresets[e.preset] ? `<button class="btn sm" data-eqa="delPreset">${icon('trash')}Hapus preset</button>` : ''}${!live && !mobile() ? `<button class="btn sm" data-act="liveEq">${icon('eq')}EQ Live</button>` : ''}</div>
    </div>`;
    const ui = { box, sliders: [], knobs: {} };
    $$('.vs', box).forEach((el) => {
      const i = +el.dataset.band;
      ui.sliders[i] = slider(el, { min: -12, max: 12, step: 0.5, value: e.bands[i], vertical: true, reset: 0, wheel: 0.5, onInput: (v, fin) => { S.eq.bands[i] = v; S.eq.preset = 'Kustom'; eqChanged(fin); } });
    });
    const K = { pre: [-12, 12, 0.5, 0, (v) => (v > 0 ? '+' : '') + v + ' dB'], bass: [0, 12, 0.5, 0, (v) => '+' + v + ' dB'], treble: [-6, 9, 0.5, 0, (v) => (v > 0 ? '+' : '') + v + ' dB'], width: [0, 200, 5, 100, (v) => v + '%'], bal: [-100, 100, 5, 0, (v) => v === 0 ? 'Tengah' : (v < 0 ? 'K ' : 'Ka ') + Math.abs(v)], mix: [0, 100, 5, 25, (v) => v + '%'] };
    for (const k in K) {
      const [mn, mx, stp, rs, f] = K[k];
      ui.knobs[k] = { s: slider($(`[data-k="${k}"]`, box), { min: mn, max: mx, step: stp, value: e[k], reset: rs, onInput: (v, fin) => { S.eq[k] = v; eqChanged(fin); } }), f };
    }
    ui.sync = () => {
      const q = S.eq;
      ui.sliders.forEach((s, i) => { s.set(q.bands[i]); const bv = $(`[data-bv="${i}"]`, box); if (bv) bv.textContent = (q.bands[i] > 0 ? '+' : '') + q.bands[i]; });
      for (const k in ui.knobs) { ui.knobs[k].s.set(q[k]); const v = $(`[data-kv="${k}"]`, box); if (v) v.textContent = ui.knobs[k].f(q[k]); }
      $('.eq', box).classList.toggle('off', !q.on);
      $$('[data-eq]', box).forEach((b) => b.classList.toggle('on', !!q[b.dataset.eq]));
      $$('[data-preset]', box).forEach((b) => b.classList.toggle('on', b.dataset.preset === q.preset));
      const p = $('.eqp', box); if (p) p.textContent = q.preset;
      drawCurve(ui);
    };
    box.onclick = (ev) => {
      const t = ev.target.closest('[data-eq],[data-preset],[data-eqa]');
      if (!t) return;
      if (t.dataset.eq) { S.eq[t.dataset.eq] = !S.eq[t.dataset.eq]; eqChanged(true); const n = $('.eq-note', box); if (n) { const s2 = eqStatus(); n.className = 'note eq-note ' + s2.cls; n.innerHTML = s2.html; } }
      if (t.dataset.preset) { const p = t.dataset.preset; S.eq.bands = (S.myPresets[p] || FX.PRESETS[p]).slice(); S.eq.preset = p; S.eq.on = true; eqChanged(true); }
      if (t.dataset.eqa === 'reset') { S.eq = JSON.parse(JSON.stringify(FX.DEF)); eqChanged(true); eqRender(box); }
      if (t.dataset.eqa === 'savePreset') ask('Simpan preset EQ', S.eq.preset === 'Kustom' ? 'Preset saya' : S.eq.preset + ' (saya)', 'Nama preset', (n) => { S.myPresets[n] = S.eq.bands.slice(); S.eq.preset = n; save(); eqRender(box); toast('Preset disimpan'); });
      if (t.dataset.eqa === 'delPreset') { delete S.myPresets[S.eq.preset]; S.eq.preset = 'Kustom'; save(); eqRender(box); }
    };
    $('[data-room]', box).onchange = (ev) => { S.eq.room = ev.target.value; if (S.eq.room !== 'off' && !S.eq.mix) S.eq.mix = 25; eqChanged(true); };
    ui.cv = $('canvas', box);
    for (const u of [...eqUIs]) if (!document.body.contains(u.box) || u.box === box) eqUIs.delete(u);
    eqUIs.add(ui);
    ui.sync();
    return ui;
  }
  // curve: computed on an offline context so it works before audio starts
  let curveFx = null;
  const FREQS = Array.from({ length: 160 }, (_, i) => 20 * Math.pow(1000, i / 159));
  function drawCurve(ui) {
    if (!curveFx) { try { curveFx = FX.make(new OfflineAudioContext(2, 128, 44100)); } catch (e) { return; } }
    curveFx.apply(Object.assign({}, S.eq, { room: 'off' }));
    ui.curve = curveFx.response(FREQS);
    ui.pre = S.eq.on ? S.eq.pre : 0;
  }
  function paintGraph(ui, spec) {
    const cv = ui.cv; if (!cv) return;
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    const yOf = (db) => H / 2 - (db / 15) * (H / 2 - 12);
    const xOf = (f) => (Math.log(f / 20) / Math.log(1000)) * W;
    g.strokeStyle = '#ffffff12'; g.lineWidth = 1;
    for (const d of [-12, -6, 0, 6, 12]) { g.beginPath(); g.moveTo(0, yOf(d)); g.lineTo(W, yOf(d)); g.stroke(); }
    for (const f of FX.EQF) { g.beginPath(); g.moveTo(xOf(f), 0); g.lineTo(xOf(f), H); g.stroke(); }
    if (spec) {
      const ny = 22050;
      g.fillStyle = 'rgba(' + getComputedStyle(document.documentElement).getPropertyValue('--tint') + ',.45)';
      g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 3) {
        const f = 20 * Math.pow(1000, x / W), k = Math.min(spec.length - 1, Math.round((f / ny) * spec.length));
        g.lineTo(x, H - (spec[k] / 255) * H * 0.9);
      }
      g.lineTo(W, H); g.fill();
    }
    if (ui.curve) {
      const c = ui.curve;
      const grad = g.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, '#1ed760'); grad.addColorStop(1, '#4cc9f0');
      g.strokeStyle = grad; g.lineWidth = 3; g.beginPath();
      FREQS.forEach((f, i) => { const y = yOf(c[i] + (ui.pre || 0)); i ? g.lineTo(xOf(f), y) : g.moveTo(xOf(f), y); });
      g.stroke();
      g.lineTo(W, yOf(0)); g.lineTo(0, yOf(0)); g.closePath(); g.fillStyle = '#1ed76014'; g.fill();
    }
    g.fillStyle = '#ffffff55'; g.font = '18px system-ui';
    g.fillText('+12', 6, yOf(12) + 6); g.fillText('0 dB', 6, yOf(0) - 4); g.fillText('−12', 6, yOf(-12) + 6);
  }
  function spectrumNow() {
    if (live && liveWin && !liveWin.closed && liveWin.EQLIVE) { try { return liveWin.EQLIVE.spectrum(); } catch (e) { return null; } }
    if (Engine.hasFx() && Engine.playing()) { const f = Engine.fx(); return f && f.spectrum(); }
    return null;
  }

  // ---------------------------------------------------------------- settings
  function openSettings() {
    const seg = (k, opts) => `<div class="seg" data-seg="${k}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(S.set[k]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const sw = (k) => `<button type="button" class="sw${S.set[k] ? ' on' : ''}" data-sw="${k}"></button>`;
    openModal(`<h3>Pengaturan <button class="ib" data-close>${icon('x')}</button></h3>
      <div class="set-row"><div class="l"><b>Bebas iklan</b><span>Lagu YouTube diputar sebagai audio Hi-Fi tanpa iklan (EQ aktif) lewat server cloud. <i id="afSt">Memeriksa server…</i></span></div>${sw('adFree')}</div>
      <div class="set-row"><div class="l"><b>Lagu dari Spotify diputar via</b><span>Lagu penuh lewat YouTube, Spotify embed (lagu penuh bila login Spotify di browser), atau preview 30 dtk Hi-Fi dengan EQ.</span></div>${seg('spMode', [['yt', 'YouTube'], ['embed', 'Spotify'], ['preview', 'Preview']])}</div>
      <div class="set-row"><div class="l"><b>Transisi halus</b><span>Fade-in/out antar lagu (detik)</span></div>${seg('fade', [[0, 'Mati'], [2, '2'], [4, '4'], [6, '6'], [10, '10']])}</div>
      <div class="set-row"><div class="l"><b>Putar otomatis saat dibuka</b><span>Saat situs dibuka, musik langsung berputar dari lagu terakhir di detik yang sama. Browser bisa meminta satu sentuhan dulu.</span></div>${sw('autoResume')}</div>
      <div class="set-row"><div class="l"><b>Autoplay lagu serupa</b><span>Saat antrean habis, lanjut dengan lagu mirip. Bila dimatikan, antrean diulang dari awal</span></div>${sw('autoRadio')}</div>
      <div class="set-row"><div class="l"><b>Tampilkan video musik</b><span>Video klip tampil otomatis; lagu audio menampilkan artwork (bisa diubah per lagu dengan tombol Video)</span></div>${sw('video')}</div>
      <div class="set-row"><div class="l"><b>Lirik mengambang</b><span>Lirik lagu yang diputar melayang di sepertiga kiri layar (layar lebar)</span></div>${sw('floatLy')}</div>
      <div class="set-row"><div class="l"><b>Pintasan keyboard</b><span>Spasi putar/jeda · ←/→ maju-mundur 5 dtk · Shift+←/→ lagu sebelumnya/berikutnya · ↑/↓ volume · M bisu · L suka · S acak · R ulangi · Q antrean · E EQ · F layar penuh · / cari</span></div></div>
      <div class="set-row"><div class="l"><b>Data</b><span>Playlist, lagu disukai & EQ tersinkron ke akun Portal AMATU.</span></div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="btn sm" id="sExp">Ekspor</button><button class="btn sm" id="sImp">Impor</button><button class="btn sm" id="sClr">Hapus riwayat</button></div></div>`, (c) => {
      c.onclick = (e) => {
        const sb = e.target.closest('[data-seg] [data-v]');
        if (sb) { const k = sb.parentNode.dataset.seg; const v = sb.dataset.v; S.set[k] = isNaN(+v) ? v : +v; $$('button', sb.parentNode).forEach((b) => b.classList.toggle('on', b === sb)); save(); if (k === 'spMode' && route.name === 'sp') render(); }
        const w = e.target.closest('[data-sw]');
        if (w) { const k = w.dataset.sw; S.set[k] = !S.set[k]; w.classList.toggle('on', S.set[k]); save(); if (k === 'video') renderNow(); if (k === 'adFree') { S.noAf = {}; afStatus(c); if (cur()) startCur({ start: Engine.time(), autoplay: Engine.playing() }); } }
      };
      afStatus(c);
      $('#sExp', c).onclick = exportAll;
      $('#sImp', c).onclick = () => $('#impIn').click();
      $('#sClr', c).onclick = () => { S.hist = []; S.plays = {}; S.listenSec = 0; S.recentCtx = []; save(); toast('Riwayat & statistik dihapus'); render(); };
    });
  }

  function afStatus(c) {
    const el = $('#afSt', c);
    if (!el) return;
    el.textContent = 'Memeriksa server…';
    cloudUrl('dQw4w9WgXcQ').then(() => true, () => false).then((ok) => {
      el.textContent = ok ? '✓ Server cloud aktif.' : '✕ Server cloud offline — lagu diputar lewat YouTube (bisa ada iklan).';
      el.style.color = ok ? 'var(--ac)' : '#e5484d';
    });
  }

  // ---------------------------------------------------------------- media session + PiP
  function mediaMeta(t) {
    if (!('mediaSession' in navigator)) return;
    if (!t) { navigator.mediaSession.metadata = null; return; }
    navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: artistsText(t), album: t.album ? t.album.name : (Q.ctx ? Q.ctx.name : 'Amatu Playlist'), artwork: t.thumb ? [{ src: t.thumb, sizes: '512x512' }] : [] });
  }
  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession, h = (a, f) => { try { ms.setActionHandler(a, f); } catch (e) { /* unsupported */ } };
    h('play', () => { if (!Engine.playing()) togglePlay(); });
    h('pause', () => Engine.pause());
    h('previoustrack', prev);
    h('nexttrack', () => next(false));
    h('seekto', (d) => Engine.seek(d.seekTime));
    // iOS shows ±10 s buttons instead of previous/next on the lock screen when these two exist
    if (!Engine.ios) {
      h('seekbackward', () => Engine.seek(Math.max(0, Engine.time() - 10)));
      h('seekforward', () => Engine.seek(Engine.time() + 10));
    }
  }
  let PIP = null;
  async function openPip() {
    if (!('documentPictureInPicture' in window)) return toast('Mini player butuh Chrome/Edge versi terbaru', 'err');
    if (PIP) { PIP.close(); return; }
    const w = await documentPictureInPicture.requestWindow({ width: 380, height: 132 });
    PIP = w;
    const css = [...document.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join('\n'); } catch (e) { return ''; } }).join('\n');
    w.document.head.innerHTML = `<style>${css}
      body{overflow:hidden;background:#101216;display:flex;align-items:center;gap:12px;padding:12px;height:100vh;margin:0}
      .pa{width:100px;height:100px;border-radius:8px;background:#222 center/cover;flex:none}
      .pm{min-width:0;flex:1;display:grid;gap:6px}.pt{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ps{font-size:12px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pc{display:flex;align-items:center;gap:6px}.pp{height:3px;background:#ffffff25;border-radius:3px;overflow:hidden}.pp i{display:block;height:100%;background:var(--ac);width:0}</style>`;
    w.document.body.innerHTML = $('svg').outerHTML + `<div class="pa"></div><div class="pm"><div class="pt"></div><div class="ps"></div><div class="pp"><i></i></div><div class="pc"><button class="ib" data-p="prev">${icon('prev')}</button><button class="playbtn" data-p="play">${icon('play')}</button><button class="ib" data-p="next">${icon('next')}</button><button class="ib like" data-p="like">${icon('heart')}</button></div></div>`;
    w.document.body.onclick = (e) => { const b = e.target.closest('[data-p]'); if (!b) return; ({ prev, next: () => next(false), play: togglePlay, like: () => toggleLike(cur()) })[b.dataset.p](); };
    w.addEventListener('pagehide', () => { PIP = null; });
    renderPip();
  }
  function renderPip() {
    if (!PIP) return;
    const d = PIP.document, t = cur();
    const q = (s) => d.querySelector(s);
    if (!q('.pa')) return;
    q('.pa').style.backgroundImage = t && t.thumb ? `url("${t.thumb}")` : '';
    q('.pt').textContent = t ? t.title : 'Amatu Playlist';
    q('.ps').textContent = t ? artistsText(t) : '';
    q('[data-p="play"] use').setAttribute('href', Engine.playing() ? '#i-pause' : '#i-play');
    const lk = t && liked(t);
    q('[data-p="like"]').classList.toggle('on', !!lk);
    q('[data-p="like"] use').setAttribute('href', lk ? '#i-heartf' : '#i-heart');
  }
  $('#tPip').onclick = openPip;

  // ---------------------------------------------------------------- video / Spotify dock
  const dock = $('#dock');
  let dockHidden = false, dockKey = '';
  $('#dockMin').onclick = () => { dockHidden = true; };
  $('#dockOpen').onclick = openFull;
  function visibleRect(el) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const sc = el.closest('#pbody, .f-right');
    const clip = sc ? sc.getBoundingClientRect() : { top: -1e5, bottom: 1e5, left: -1e5, right: 1e5 };
    return { r, clip };
  }
  function placeDock() {
    const eng = Engine.eng;
    let slot = null, floatMode = false;
    const vmode = isVideoMode();
    if (vmode) slot = !full.hidden ? $('#fSlot') : $('#pSlot');
    else if (eng === 'sp') slot = $('#pSpSlot');
    let vr = slot && slot.isConnected ? visibleRect(slot) : null;
    if (vr && !full.hidden && !full.contains(slot)) vr = null;
    if (!vr && !dockHidden && !mobile() && full.hidden && ((vmode && document.body.classList.contains('nopanel')) || eng === 'sp')) floatMode = true;
    let k;
    if (vr) {
      const { r, clip } = vr;
      const top = Math.max(0, clip.top - r.top), bot = Math.max(0, r.bottom - clip.bottom);
      k = `s${r.left}|${r.top}|${r.width}|${r.height}|${top}|${bot}|${eng}`;
      if (k !== dockKey) {
        dock.className = eng === 'sp' ? 'sp' : '';
        Object.assign(dock.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', clipPath: top || bot ? `inset(${top}px 0 ${bot}px 0)` : '', zIndex: full.hidden ? 31 : 45 });
      }
    } else if (floatMode) {
      const w = eng === 'sp' ? 360 : 336, h = eng === 'sp' ? 152 : 189;
      k = `f${innerWidth}|${innerHeight}|${eng}`;
      if (k !== dockKey) {
        dock.className = 'float' + (eng === 'sp' ? ' sp' : '');
        Object.assign(dock.style, { left: innerWidth - w - 16 + 'px', top: innerHeight - h - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--barH')) - 16 + 'px', width: w + 'px', height: h + 'px', clipPath: '', zIndex: 25 });
        $('#dockT').textContent = (cur() || {}).title || '';
      }
    } else {
      k = 'off';
      if (k !== dockKey) { dock.className = 'off' + (eng === 'sp' ? ' sp' : ''); dock.style.clipPath = ''; }
    }
    dockKey = k;
  }
  pbody.addEventListener('click', (e) => { if (e.target.closest('[data-act="np-video"]')) dockHidden = false; });

  // ---------------------------------------------------------------- animation + tick loops
  function drawViz(cv, spec, alpha) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    if (!spec) return;
    const N = 48, bw = W / N;
    g.fillStyle = `rgba(255,255,255,${alpha})`;
    for (let i = 0; i < N; i++) {
      const k = Math.floor(Math.pow(i / N, 1.8) * spec.length * 0.62) + 2;
      const v = spec[k] / 255, h = Math.max(2, v * v * H);
      g.fillRect(i * bw + 1.5, H - h, bw - 3, h);
    }
  }
  function frame() {
    requestAnimationFrame(frame);
    placeDock();
    const spec = (eqUIs.size || $('#npViz') || !full.hidden) ? spectrumNow() : null;
    for (const u of eqUIs) { if (!document.body.contains(u.box)) { eqUIs.delete(u); continue; } paintGraph(u, spec); }
    const nv = $('#npViz'); if (nv) drawViz(nv, spec, 0.55);
    if (!full.hidden) { const fv = $('#fViz'); if (fv.width !== innerWidth) { fv.width = innerWidth; fv.height = innerHeight * 0.4; } drawViz(fv, spec, 0.5); }
  }
  requestAnimationFrame(frame);

  let lastSave = 0, lastPos = 0;
  setInterval(() => {
    const t = cur();
    const now = performance.now(), dt = lastTick ? (now - lastTick) / 1000 : 0;
    lastTick = now;
    const d = Engine.eng ? Engine.duration() : (t ? t.sec : 0), tm = Engine.eng ? Engine.time() : Q.t || 0;
    const p = d ? Math.min(1, tm / d) : 0;
    if (!$('#seek').classList.contains('act')) { seekS.set(p); $('#tCur').textContent = t && t.src === 'radio' ? 'LIVE' : fmt(tm); }
    const isRadio = t && t.src === 'radio';
    if (!$('#fSeek').classList.contains('act')) { fSeekS.set(p); $('#fCur').textContent = isRadio ? 'LIVE' : fmt(tm); }
    $('#tDur').textContent = isRadio ? '' : fmt(d); $('#fDur').textContent = isRadio ? '' : fmt(d);
    $('#seek').style.setProperty('--b', Engine.buffered() * 100 + '%');
    $('#mProg').style.width = p * 100 + '%';
    updateFly(tm, d);
    if (PIP) { const i = PIP.document.querySelector('.pp i'); if (i) i.style.width = p * 100 + '%'; }
    if (!t || !Engine.eng) return;
    if (Engine.wanted() !== posOn) { posOn = Engine.wanted(); savePos(posOn); }   // paused or resumed: remember at once
    syncLyrics(tm);
    if (Engine.playing()) {
      listened += dt; S.listenSec = (S.listenSec || 0) + dt;
      if (!counted && (listened >= 30 || (d && listened >= d * 0.5))) { counted = true; countPlay(t); }
      // YouTube reports an ad's own length while one runs, so its fade-out would mute the song after the ad: no fade there
      if (S.set.fade && d > 20 && !Engine.isLive() && Engine.eng !== 'yt' && !fadingOut && d - tm < S.set.fade && d - tm > 0.3 && S.repeat !== 2) { fadingOut = true; Engine.fade(0, (d - tm) * 1000); }
      else if (fadingOut && d - tm > S.set.fade + 1) { fadingOut = false; Engine.fade(1, 200); }
      if (!$('#bar').classList.contains('loading')) Q.t = tm;
      if (d && d - tm < 30 && Engine.eng === 'au' && !Engine.isLive() && spareFor !== playTok) readySpare();
      if (now - lastSave > 5000) { lastSave = now; savePos(true); try { sessionStorage.setItem('amatu.playlist.t', String(Math.floor(tm))); } catch (e) { /* ignore */ } }
      if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && d && Math.abs(tm - lastPos) > 0.9) { lastPos = tm; try { navigator.mediaSession.setPositionState({ duration: d, position: Math.min(tm, d), playbackRate: S.rate }); } catch (e) { /* ignore */ } }
    }
    if (sleep.at) {
      renderSleep();
      if (Date.now() >= sleep.at) { sleep.at = 0; renderSleep(); Engine.fade(0, 6000).then(() => { Engine.pause(); Engine.fade(1, 0); toast('Timer tidur: musik dihentikan'); }); }
    }
  }, 250);

  // ---------------------------------------------------------------- keyboard
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.metaKey || e.ctrlKey) { if (e.key.toLowerCase() === 'k') { e.preventDefault(); qIn.focus(); } return; }
    const k = e.key;
    if (k === ' ') { e.preventDefault(); togglePlay(); }
    else if (k === 'ArrowRight') { e.preventDefault(); e.shiftKey ? next(false) : Engine.seek(Engine.time() + 5); }
    else if (k === 'ArrowLeft') { e.preventDefault(); e.shiftKey ? prev() : Engine.seek(Math.max(0, Engine.time() - 5)); }
    else if (k === 'ArrowUp') { e.preventDefault(); S.vol = Math.min(1, S.vol + 0.05); S.muted = false; Engine.setVol(S.vol); Engine.setMuted(false); renderVol(); save(); }
    else if (k === 'ArrowDown') { e.preventDefault(); S.vol = Math.max(0, S.vol - 0.05); Engine.setVol(S.vol); renderVol(); save(); }
    else if (k === 'm' || k === 'M') $('#tMute').click();
    else if (k === 'l' || k === 'L') toggleLike(cur());
    else if (k === 's' || k === 'S') toggleShuffle();
    else if (k === 'r' || k === 'R') cycleRepeat();
    else if (k === 'q' || k === 'Q') togglePanelTab('queue');
    else if (k === 'e' || k === 'E') togglePanelTab('eq');
    else if (k === 'f' || k === 'F') full.hidden ? openFull() : closeFull();
    else if (k === '/') { e.preventDefault(); qIn.focus(); }
    else if (k === 'Escape') { if (!modal.hidden) closeModal(); else if (!menu.hidden) closeMenu(); else if (!full.hidden) closeFull(); }
  });

  // ---------------------------------------------------------------- init
  Engine.setVol(S.vol); Engine.setMuted(S.muted); Engine.setRate(S.rate); Engine.eq(S.eq, false);
  if (!S.set.panel || innerWidth <= 1240) document.body.classList.add('nopanel');
  renderVol(); renderControls(); renderSideLists();
  const openedShared = location.hash.startsWith('#t=');
  if (openedShared) openShared(); else render();
  if (Q.list.length) { Q.i = Math.min(Q.i, Q.list.length - 1); renderNow(); }
  else renderPanel();
  // the first tap/click/key unlocks audio, so songs start by themselves even when their stream arrives later
  for (const ev of ['pointerdown', 'keydown', 'touchend', 'click']) document.addEventListener(ev, () => Engine.unlock(), { capture: true, passive: true });
  if (Q.list.length) prefetchNext(true);
  // lanjut otomatis: start by itself when the browser allows it, otherwise on the first touch anywhere
  (async function armResume() {
    const shared = openedShared;
    const r = readPos();
    if (cur() && !shared && r) Q.t = r.k === curKey() ? r.t : 0;
    if (Q.list.length) renderNow();
    if (!S.set.autoResume || shared || otherTabPlays(r)) return;
    if (!cur() && !(await firstQueue())) return;
    const hint = $('#rsm'), tok = playTok;
    const go = () => {
      if (!disarmResume) return;
      disarmResume();
      if (tok !== playTok || Engine.eng || !S.set.autoResume || otherTabPlays(readPos())) return;
      startCur({ start: cur().src === 'radio' ? 0 : Q.t || 0 });
    };
    const onClick = (e) => {
      if (e.target.closest && e.target.closest('.pb, .playbtn, [data-act="play"]')) { disarmResume(); return; }   // the user picked a song
      setTimeout(go, 0);   // after the page's own handlers, which may already have started something
    };
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (e.metaKey || e.ctrlKey || e.altKey || e.key === 'Tab' || e.key === 'Escape' || e.key === 'Shift' || tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      setTimeout(go, 0);
    };
    disarmResume = () => {
      disarmResume = null; hint.hidden = true;
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    $('#rsmX').onclick = (e) => { e.stopPropagation(); hint.hidden = true; if (disarmResume) disarmResume(); };
    Engine.canAutoplay().then((ok) => {
      if (!disarmResume) return;
      if (ok) return go();
      $('#rsmT').textContent = cur().title;
      hint.hidden = false;
    });
  })();
  // nothing queued on this device yet: what was heard last, else today's chart
  async function firstQueue() {
    const hist = (S.hist || []).slice(0, 40).map((h) => h.t).filter((t) => t && t.src !== 'file');
    let list = hist, ctx = null;
    if (!list.length) {
      for (const [ref, name, href] of LIVE) {
        const c = await collTracks(ref).catch(() => null);
        if (c && c.tracks.length) { list = c.tracks.slice(0, 50); ctx = { name: c.name || name, href: c.href || href, ref, thumb: c.thumb }; break; }
      }
    }
    if (!list.length || cur() || Engine.eng) return false;
    Q.list = list.map((t) => Object.assign({}, t)); Q.i = 0; Q.ctx = ctx; Q.t = 0;
    renderNow(); saveQ();
    return true;
  }
  // hovering (or pressing) a song warms its ad-free stream, so the click starts it sooner
  let hoverT = 0;
  const warm = (e) => {
    const el = e.target.closest && e.target.closest('.tr[data-i], [data-l][data-i]');
    if (!el || !adFreeOn() || cloudDown()) return;
    const L = LISTS.get((el.closest('[data-l]') || {}).dataset ? el.closest('[data-l]').dataset.l : '');
    const t = L && L.tracks[+el.dataset.i];
    const id = t && (t.src === 'yt' ? (ALT[t.id] || t.id) : t.src === 'sp' && S.set.spMode === 'yt' ? S.match[t.id] : null);
    if (id) adFreeUrl(id);
  };
  document.addEventListener('pointerover', (e) => { clearTimeout(hoverT); if (!touch && e.target.closest && e.target.closest('.pi, .pb')) hoverT = setTimeout(() => warm(e), 300); }, { passive: true });
  document.addEventListener('pointerdown', warm, { passive: true, capture: true });
  Engine.ytInit().catch(() => { /* loads again on first YouTube song */ });
  window.addEventListener('resize', debounce(() => { dockKey = ''; }, 100));
  window.addEventListener('pagehide', () => {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
    if (Engine.eng && cur()) savePos(false);   // left this tab: a reload may resume, it is not "another tab playing"
  });
  window.addEventListener('storage', (e) => {
    // amatu.js pulled newer data from another device
    if (e.key === KEY && e.newValue) { try { const n = JSON.parse(e.newValue); for (const k of ['likes', 'lists', 'saved', 'myPresets']) if (n[k]) S[k] = n[k]; renderSideLists(); } catch (err) { /* ignore */ } }
  });

  window.PLAYLIST = { S, Q, Engine, API, render, setQueue, startCur, next, prev, toggleLike, openFull, openLive };
})();
