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
    v: 1, likes: [], lists: [], saved: [], hist: [], plays: {}, recentCtx: [], recent: [], match: {}, alt: {}, noAf: {},
    eq: JSON.parse(JSON.stringify(FX.DEF)), myPresets: {},
    set: { spMode: 'yt', fade: 2, autoRadio: true, video: true, panel: true, ptab: 'np', adFree: true },
    vol: 0.8, muted: false, rate: 1, shuffle: false, repeat: 0, listenSec: 0,
  };
  function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  const S = Object.assign({}, DEF, load(KEY, {}));
  S.set = Object.assign({}, DEF.set, S.set);
  S.eq = Object.assign({}, FX.DEF, S.eq);
  const save = debounce(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Penyimpanan penuh', 'err'); } }, 400);
  let Q = Object.assign({ list: [], i: 0, ctx: null, orig: null, t: 0 }, load(QKEY, {}));
  // the queue syncs to the account (written on changes only); the play position stays in this tab
  const saveQ = debounce(() => { try { localStorage.setItem(QKEY, JSON.stringify({ list: Q.list.filter((t) => t.src !== 'file'), i: Q.i, ctx: Q.ctx, orig: null })); } catch (e) { /* ignore */ } }, 600);
  try { Q.t = +sessionStorage.getItem('amatu.playlist.t') || 0; } catch (e) { Q.t = 0; }

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
  let playTok = 0, fadeInMs = 0, curSpec = null, altTries = 0, listened = 0, counted = false, fadingOut = false, lastTick = 0;
  const tried = new Set();

  // ---------------------------------------------------------------- ad-free audio (MacBook relay)
  // The Downloader relay on the MacBook streams the song's audio straight from YouTube (yt-dlp) → no ads, and it
  // plays in the Hi-Fi engine so the EQ works too. Offline relay / failure → regular YouTube player.
  const AMT = window.AMATU;
  const R = { url: new URLSearchParams(location.search).get('relay') || null, ok: false, wait: null, at: 0 };
  const rtoken = () => (AMT && AMT.sess() && AMT.sess().t) || '';
  async function rHello(u) {
    const r = await fetch(u + '/api/hello', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    if (!r.ok || !j.audio) throw new Error('relay lama');
    return u;
  }
  function relay(force) {
    if (R.wait) return R.wait;
    if (!force && Date.now() - R.at < (R.ok ? 300e3 : 30e3)) return Promise.resolve(R.ok);
    R.wait = (async () => {
      const cands = [];
      if (R.url) cands.push(R.url);
      const c = AMT && AMT.jget('pt.dl.relay', null);
      if (c && c.url && !cands.includes(c.url)) cands.push(c.url);
      let u = null;
      for (const x of cands) { try { u = await rHello(x); break; } catch (e) { /* next */ } }
      if (!u && AMT && rtoken()) {
        const d = await AMT.rpc('amt_relay_get', { p_token: rtoken(), p_name: 'downloader' }).catch(() => null);
        if (d && d.url && !cands.includes(d.url)) { try { u = await rHello(d.url); AMT.jset('pt.dl.relay', { url: d.url, t: d.t }); } catch (e) { /* offline */ } }
      }
      R.ok = !!u; if (u) R.url = u; R.at = Date.now(); R.wait = null;
      return R.ok;
    })();
    return R.wait;
  }
  const AF = new Map();   // video id → promise of stream URL (also used to prefetch the next songs)
  function adFreeUrl(id) {
    const c = AF.get(id);
    if (c && Date.now() - c.t < 3 * 3600e3) return c.p;
    const p = (async () => {
      if (!(await relay())) return null;
      const r = await fetch(R.url + '/api/play?id=' + encodeURIComponent(id), { cache: 'no-store', headers: { 'X-Amatu': rtoken() }, signal: AbortSignal.timeout(25000) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.u) throw new Error(j.error || 'relay ' + r.status);
      return R.url + j.u;
    })().catch((e) => { AF.delete(id); if (!/relay \d|tidak|Audio/.test(e.message)) { R.ok = false; R.at = 0; } return null; });
    AF.set(id, { p, t: Date.now() });
    if (AF.size > 200) AF.delete(AF.keys().next().value);
    return p;
  }
  const afBlocked = (id) => Date.now() - (S.noAf[id] || 0) < 864e5;   // failed recently → YouTube player for a day
  const adFreeOn = () => S.set.adFree && (!!AMT || !!R.url);   // ?relay=… = local test relay
  const wantsVideo = (t) => vidOverride.k === key(t) && vidOverride.v === true;
  async function ytSpec(t, id) {
    if (adFreeOn() && !wantsVideo(t) && !afBlocked(id)) {
      const url = await adFreeUrl(id);
      if (url) return { eng: 'au', url, ar: id };
    }
    return { eng: 'yt', id };
  }
  // warm the relay for the next songs so they start instantly
  function prefetchNext(withCur) {
    if (!adFreeOn() || !R.ok) return;
    for (const t of Q.list.slice(Q.i + (withCur ? 0 : 1), Q.i + 3)) {
      const id = t.src === 'yt' ? (S.alt[t.id] || t.id) : t.src === 'sp' && S.set.spMode === 'yt' ? S.match[t.id] : null;
      if (id && !afBlocked(id)) adFreeUrl(id);
    }
  }

  const MTHUMB = {};
  async function specFor(t) {
    if (t.src === 'yt') return ytSpec(t, S.alt[t.id] || t.id);
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
      if (id) return ytSpec(t, S.alt[id] || id);
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
    listened = 0; counted = false; fadingOut = false; altTries = 0; tried.clear();
    renderNow(); saveQ();
    $('#bar').classList.add('loading');
    const spec = await specFor(t).catch(() => null);
    if (tok !== playTok) return;
    if (!spec) { toast('Lagu tidak tersedia', 'err'); return next(true); }
    curSpec = spec;
    if (spec.id) tried.add(spec.id);
    const fade = S.set.fade && opt.autoplay !== false && !spec.live;
    Engine.fade(fade ? 0 : 1, 0);
    try { await Engine.load(spec, { start: opt.start || 0, autoplay: opt.autoplay !== false }); }
    catch (e) { toast(e.message || 'Gagal memuat pemutar', 'err'); return; }
    if (tok !== playTok) return;
    $('#bar').classList.remove('loading');
    if (fade) { fadeInMs = Math.min(2500, S.set.fade * 700); setTimeout(() => { if (tok === playTok && fadeInMs) { Engine.fade(1, fadeInMs); fadeInMs = 0; } }, 4000); }
    if (opt.autoplay !== false) addHist(t);
    renderNow();
    loadLyrics(t);
    setTimeout(() => { if (tok === playTok) prefetchNext(); }, 2500);
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
      let extra = await similarTo(cur()).catch(() => []);
      if (!extra.length) extra = await similarTo(cur()).catch(() => []);   // first call can hit a cold server
      if (extra.length) {
        Q.list.push(...extra); Q.i++;
        toast('Autoplay: memutar lagu serupa');
        return startCur();
      }
      // no similar songs reachable: keep the music going from the top of the queue instead of stopping
      if (auto && Q.list.length > 1) { Q.i = 0; toast('Autoplay: mengulang antrean'); return startCur(); }
    }
    Engine.pause(); Engine.fade(1, 0);
    if (auto) Engine.seek(0);
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

  // errors from engines: unembeddable / removed video → try an alternative upload
  Engine.on('error', async (err) => {
    const t = cur();
    if (!t) return;
    const tok = playTok;
    if (err.eng === 'au' && curSpec && curSpec.ar) {
      const id = curSpec.ar, at = Engine.time();
      AF.delete(id); S.noAf[id] = Date.now(); const ks = Object.keys(S.noAf); if (ks.length > 300) delete S.noAf[ks[0]]; save();
      toast('Mode bebas iklan gagal untuk lagu ini — diputar lewat YouTube', 'err');
      curSpec = { eng: 'yt', id }; tried.add(id);
      Engine.load(curSpec, { autoplay: true, start: at > 2 ? at : 0 });
      return;
    }
    if (err.eng === 'yt' && altTries < 3) {
      altTries++;
      const q = `${t.title} ${artistsText(t)}`;
      const d = await API.search(q, altTries === 1 ? 'songs' : 'videos').catch(() => null);
      if (tok !== playTok) return;
      const alt = d && API.tracksOf(d.items).find((x) => !tried.has(x.id));
      if (alt) {
        tried.add(alt.id);
        const orig = t.src === 'yt' ? t.id : S.match[t.id];
        if (orig) { S.alt[orig] = alt.id; const ks = Object.keys(S.alt); if (ks.length > 400) delete S.alt[ks[0]]; save(); }
        curSpec = { eng: 'yt', id: alt.id };
        Engine.load(curSpec, { autoplay: true });
        return;
      }
    }
    toast('Tidak dapat memutar "' + t.title + '" — lanjut', 'err');
    setTimeout(() => { if (tok === playTok) next(true); }, 1200);
  });
  Engine.on('end', () => {
    if (S.repeat === 2) { Engine.seek(0); Engine.play(); return; }
    next(true);
  });
  Engine.on('state', (p) => {
    $('#bar').classList.remove('loading');
    if (p && fadeInMs) { Engine.fade(1, fadeInMs); fadeInMs = 0; }
    renderPlayState(p);
  });
  Engine.on('engine', () => { renderNow(); });
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
    ['Pop Indonesia', '#e13300'], ['Pop Jazz', '#1e3264'], ['Lagu Hits', '#8d67ab'], ['Indie Indonesia', '#27856a'], ['Galau', '#477d95'],
    ['Akustik', '#bc5900'], ['Dangdut', '#e8115b'], ['City Pop', '#dc148c'], ['Jazz', '#0d73ec'], ['R&B', '#ba5d07'], ['K-Pop', '#e91429'],
    ['Rock Indonesia', '#777777'], ['Lofi', '#503750'], ['90an', '#af2896'], ['2000an', '#148a08'], ['Religi', '#1e3264'], ['Koplo', '#e8115b'], ['Hip-Hop', '#bc5900'],
  ];

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
      for (const s of window.HOME || []) h += shelf(s.title, s.items.map((it) => card(cardFor(it))).join(''));
      h += `<section class="shelf"><div class="shelf-h"><h2>Jelajahi genre</h2></div><div class="genres">${GENRES.slice(0, 12).map(([g, c]) => `<div class="genre" style="background:${c}" data-genre="${esc(g)}">${esc(g)}</div>`).join('')}</div></section>`;
      return h;
    },

    async search(arg, tok) {
      const [q0, t0] = arg.split('/');
      const q = (q0 || '').trim(), t = t0 || 'all';
      if (!q) {
        let h = '<h1 class="v-title">Cari</h1>';
        if (S.recent.length) h += `<div class="shelf-h"><h2 style="font-size:18px">Pencarian terakhir</h2><button id="clrRecent">Hapus</button></div><div class="chips">${S.recent.map((r) => `<a class="chip" href="#search/${encodeURIComponent(r)}">${icon('clock')}${esc(r)}</a>`).join('')}</div>`;
        h += `<div class="shelf-h"><h2 style="font-size:18px">Jelajahi semua</h2></div><div class="genres">${GENRES.map(([g, c]) => `<div class="genre" style="background:${c}" data-genre="${esc(g)}">${esc(g)}</div>`).join('')}</div>`;
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
        const tr = API.tracksOf(s.items);
        const more = s.more && /^VL/.test(s.more) ? `<a href="#playlist/${esc(s.more)}">Lihat semua</a>` : '';
        if (tr.length && s.items[0].type === 'song') h += `<section class="shelf"><div class="shelf-h"><h2>${esc(tr(s.title))}</h2>${more}</div>${trackList(tr, { name: hd.title, href: '#artist/' + id, ref }, { head: false })}</section>`;
        else if (tr.length) h += shelf(s.title, songCards(tr, { name: hd.title, href: '#artist/' + id }), more);
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
      return h + `<div class="note" style="margin-bottom:16px">${icon('eq')} Radio diputar lewat mesin Hi-Fi: EQ bekerja langsung bila stasiun mengizinkan; jika tidak, aktifkan <b>EQ Live</b>.</div><div class="grid">${st.map((s, i) => `<div class="card" data-l="${lid}" data-i="${i}"><div class="cv" style="display:grid;place-items:center;background:#1c2029;color:var(--dim)">${icon('radio')}${s.thumb ? `<img src="${esc(s.thumb)}" alt="" loading="lazy" style="position:absolute;inset:19%;width:62%;height:62%;object-fit:contain" onerror="this.remove()">` : ''}<button class="pb" data-act="ps">${icon('play')}</button></div><div class="t">${esc(s.title)}</div><div class="s">${esc(s.artists[0].name)}${s.br ? ' · ' + s.br + ' kbps' : ''}</div></div>`).join('')}</div>`;
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
      ${kind === 'sp' ? `<span class="note" style="padding:6px 12px">${icon('sp')} Diputar via <b>${{ yt: 'YouTube (lagu penuh)', embed: 'Spotify embed', preview: 'Preview Hi-Fi 30 dtk' }[S.set.spMode]}</b> · <a href="#" data-act="settings" style="text-decoration:underline">ubah</a></span>` : ''}</div>`;
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
  function srcLabel() {
    const t = cur(), e = Engine.eng;
    if (!t) return ['', ''];
    if (t.src === 'radio') return ['hf', 'RADIO'];
    if (t.src === 'file') return ['hf', 'HI-FI'];
    if (e === 'au' && curSpec && curSpec.ar) return ['hf', 'BEBAS IKLAN · HI-FI'];
    if (e === 'au') return ['hf', 'HI-FI · PREVIEW'];
    if (e === 'sp') return ['sp', 'SPOTIFY'];
    if (t.src === 'sp') return ['yt', 'SPOTIFY → YT'];
    return ['yt', t.kind === 'video' ? 'YOUTUBE' : 'YT MUSIC'];
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
    const [cls, lbl] = srcLabel();
    const sb = $('#srcBadge'); sb.className = 'src-badge' + (lbl ? ' show ' + cls : ''); sb.textContent = lbl;
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
    return S.set.video && t.kind === 'video' && !(adFreeOn() && curSpec && curSpec.id && !afBlocked(curSpec.id) && R.ok);
  };
  function toggleVideo() {
    const v = !isVideoMode();
    vidOverride = { k: curKey(), v }; dockHidden = false;
    // ad-free audio has no picture: the video needs the YouTube player (and back to ad-free when turned off)
    if (v && Engine.eng === 'au' && curSpec && curSpec.ar) { curSpec = { eng: 'yt', id: curSpec.ar }; Engine.load(curSpec, { autoplay: Engine.playing(), start: Engine.time() }); }
    else if (!v && Engine.eng === 'yt' && adFreeOn() && curSpec && curSpec.id && !afBlocked(curSpec.id)) {
      const id = curSpec.id, at = Engine.time(), was = Engine.playing(), tok = playTok;
      adFreeUrl(id).then((url) => { if (url && tok === playTok && !isVideoMode()) { curSpec = { eng: 'au', url, ar: id }; Engine.load(curSpec, { autoplay: was, start: at }); } });
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
      ${t.album || t.sec ? `<div class="np-box"><h4>Info lagu</h4><div style="color:var(--mut);font-size:13px;display:grid;gap:4px">${t.album ? `<div>Album: ${t.album.id ? `<a href="#album/${esc(t.album.id)}" style="color:var(--tx)">${esc(t.album.name)}</a>` : esc(t.album.name)}</div>` : ''}${t.sec ? `<div>Durasi: ${fmt(t.sec)}</div>` : ''}<div>Sumber: ${srcLabel()[1]}</div></div></div>` : ''}
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
  function openFull() {
    full.hidden = false;
    if (!fTool && !mobile()) fTool = 'lyrics';
    renderNow();
  }
  function closeFull() { full.hidden = true; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  $('#fClose').onclick = closeFull;
  $('#bArt').onclick = $('.b-meta').onclick = (e) => { if (e.target.closest('a')) return; if (mobile() || !cur()) openFull(); else togglePanelTab('np'); };
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
  const LY = { key: '', data: null, state: 'idle' };
  let lyOff = 0, lyLast = -2, lyUserScroll = 0;
  async function loadLyrics(t) {
    const k = key(t);
    if (LY.key === k) return;
    LY.key = k; LY.data = null;
    if (t.src === 'radio') { LY.state = 'none'; refreshLyrics(); return; }
    LY.state = 'loading'; lyOff = 0; refreshLyrics();
    try {
      const d = await API.lyrics(t);
      if (LY.key !== k) return;
      LY.data = d; LY.state = d ? 'ok' : 'none';
    } catch (e) { if (LY.key === k) LY.state = 'none'; }
    refreshLyrics();
  }
  function refreshLyrics() {
    if (activeTab() === 'lyrics') renderPanel();
    if (!full.hidden && fTool === 'lyrics') renderFullRight();
  }
  function lyricsHtml() {
    const t = cur();
    if (!t) return empty('mic', 'Belum ada lagu');
    if (LY.state === 'loading') return loading();
    if (LY.state !== 'ok' || !LY.data) return empty('mic', t.src === 'radio' ? 'Lirik tidak tersedia untuk radio' : 'Lirik tidak ditemukan', t.src === 'radio' ? '' : 'Belum ada lirik untuk lagu ini di database lirik.');
    if (LY.data.instrumental) return empty('music', 'Instrumental', 'Lagu ini tanpa vokal.');
    if (LY.data.synced) return `<div class="lyr-h"><span>Lirik sinkron · lrclib</span><span class="off">Sinkron <button data-act="ly-off" data-d="-0.5">−</button><b class="lyo">${lyOff > 0 ? '+' : ''}${lyOff}s</b><button data-act="ly-off" data-d="0.5">+</button></span></div><div class="lyr">${LY.data.synced.map((l, i) => `<p data-ly="${i}">${esc(l.x || '♪')}</p>`).join('')}</div>`;
    return `<div class="lyr-h"><span>Lirik · lrclib</span></div><div class="lyr plain">${LY.data.plain.split('\n').map((l) => `<p>${esc(l) || '&nbsp;'}</p>`).join('')}</div>`;
  }
  function renderLyricsHead() { $$('.lyo').forEach((b) => { b.textContent = (lyOff > 0 ? '+' : '') + lyOff + 's'; }); lyLast = -2; }
  document.addEventListener('click', (e) => {
    const p = e.target.closest('[data-ly]');
    if (!p || !LY.data || !LY.data.synced) return;
    Engine.seek(Math.max(0, LY.data.synced[+p.dataset.ly].t - lyOff));
    lyUserScroll = 0;
  });
  for (const el of [pbody, $('#fRight')]) el.addEventListener('wheel', () => { lyUserScroll = Date.now(); }, { passive: true });
  for (const el of [pbody, $('#fRight')]) el.addEventListener('touchmove', () => { lyUserScroll = Date.now(); }, { passive: true });
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
        const sc = box.closest('#pbody, .f-right'), p = ps[i];
        if (sc && p) sc.scrollTo({ top: p.offsetTop - sc.clientHeight * 0.36, behavior: 'smooth' });
      }
    }
  }

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
    const e = Engine.eng, t = cur();
    if (!S.eq.on) return { cls: '', short: 'EQ nonaktif', html: 'EQ dimatikan.' };
    if (live) return { cls: 'ok', short: 'EQ Live aktif · ' + S.eq.preset, html: `<b>EQ Live aktif.</b> Semua suara tab ini (YouTube, Spotify, radio) diproses EQ. <br><button class="btn sm" data-act="stopLive">Matikan EQ Live</button>` };
    if (Engine.hasFx()) return { cls: 'ok', short: 'Aktif pada audio Hi-Fi · ' + S.eq.preset, html: `<b>EQ aktif</b> pada audio Hi-Fi ini${t && t.src === 'radio' ? ' (radio)' : ''}.` };
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
      <div class="set-row"><div class="l"><b>Bebas iklan</b><span>Lagu YouTube diputar sebagai audio Hi-Fi lewat server MacBook (tanpa iklan, EQ aktif). <i id="afSt">Memeriksa server…</i></span></div>${sw('adFree')}</div>
      <div class="set-row"><div class="l"><b>Lagu dari Spotify diputar via</b><span>Lagu penuh lewat YouTube, Spotify embed (lagu penuh bila login Spotify di browser), atau preview 30 dtk Hi-Fi dengan EQ.</span></div>${seg('spMode', [['yt', 'YouTube'], ['embed', 'Spotify'], ['preview', 'Preview']])}</div>
      <div class="set-row"><div class="l"><b>Transisi halus</b><span>Fade-in/out antar lagu (detik)</span></div>${seg('fade', [[0, 'Mati'], [2, '2'], [4, '4'], [6, '6'], [10, '10']])}</div>
      <div class="set-row"><div class="l"><b>Autoplay lagu serupa</b><span>Saat antrean habis, lanjut otomatis dengan lagu mirip</span></div>${sw('autoRadio')}</div>
      <div class="set-row"><div class="l"><b>Tampilkan video musik</b><span>Video klip tampil otomatis; lagu audio menampilkan artwork (bisa diubah per lagu dengan tombol Video)</span></div>${sw('video')}</div>
      <div class="set-row"><div class="l"><b>Pintasan keyboard</b><span>Spasi putar/jeda · ←/→ maju-mundur 5 dtk · Shift+←/→ lagu sebelumnya/berikutnya · ↑/↓ volume · M bisu · L suka · S acak · R ulangi · Q antrean · E EQ · F layar penuh · / cari</span></div></div>
      <div class="set-row"><div class="l"><b>Data</b><span>Playlist, lagu disukai & EQ tersinkron ke akun Portal AMATU.</span></div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="btn sm" id="sExp">Ekspor</button><button class="btn sm" id="sImp">Impor</button><button class="btn sm" id="sClr">Hapus riwayat</button></div></div>`, (c) => {
      c.onclick = (e) => {
        const sb = e.target.closest('[data-seg] [data-v]');
        if (sb) { const k = sb.parentNode.dataset.seg; const v = sb.dataset.v; S.set[k] = isNaN(+v) ? v : +v; $$('button', sb.parentNode).forEach((b) => b.classList.toggle('on', b === sb)); save(); if (k === 'spMode' && route.name === 'sp') render(); }
        const w = e.target.closest('[data-sw]');
        if (w) { const k = w.dataset.sw; S.set[k] = !S.set[k]; w.classList.toggle('on', S.set[k]); save(); if (k === 'video') renderNow(); if (k === 'adFree') { S.noAf = {}; afStatus(c); } }
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
    if (!AMT && !R.url) { el.textContent = 'Perlu masuk Portal AMATU.'; return; }
    el.textContent = 'Memeriksa server…';
    relay(true).then((ok) => { el.textContent = ok ? '✓ Server MacBook aktif.' : '✕ Server MacBook offline — sementara lewat YouTube (bisa ada iklan).'; el.style.color = ok ? 'var(--ac)' : '#e5484d'; });
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
    h('seekbackward', () => Engine.seek(Math.max(0, Engine.time() - 10)));
    h('seekforward', () => Engine.seek(Engine.time() + 10));
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
    if (PIP) { const i = PIP.document.querySelector('.pp i'); if (i) i.style.width = p * 100 + '%'; }
    if (!t || !Engine.eng) return;
    syncLyrics(tm);
    if (Engine.playing()) {
      listened += dt; S.listenSec = (S.listenSec || 0) + dt;
      if (!counted && (listened >= 30 || (d && listened >= d * 0.5))) { counted = true; countPlay(t); }
      if (S.set.fade && d > 20 && !Engine.isLive() && !fadingOut && d - tm < S.set.fade && d - tm > 0.3 && S.repeat !== 2) { fadingOut = true; Engine.fade(0, (d - tm) * 1000); }
      Q.t = tm;
      if (now - lastSave > 5000) { lastSave = now; try { sessionStorage.setItem('amatu.playlist.t', String(Math.floor(tm))); } catch (e) { /* ignore */ } }
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
  if (location.hash.startsWith('#t=')) openShared(); else render();
  if (Q.list.length) { Q.i = Math.min(Q.i, Q.list.length - 1); renderNow(); }
  else renderPanel();
  // the first tap/click/key unlocks audio, so songs start by themselves even when their stream arrives later
  for (const ev of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(ev, () => Engine.unlock(), { capture: true, passive: true });
  if (adFreeOn()) relay().then((ok) => { if (ok && Q.list.length) prefetchNext(true); });
  // hovering (or pressing) a song warms its ad-free stream, so the click starts it sooner
  let hoverT = 0;
  const warm = (e) => {
    const el = e.target.closest && e.target.closest('.tr[data-i], [data-l][data-i]');
    if (!el || !adFreeOn() || !R.ok) return;
    const L = LISTS.get((el.closest('[data-l]') || {}).dataset ? el.closest('[data-l]').dataset.l : '');
    const t = L && L.tracks[+el.dataset.i];
    const id = t && (t.src === 'yt' ? (S.alt[t.id] || t.id) : t.src === 'sp' && S.set.spMode === 'yt' ? S.match[t.id] : null);
    if (id && !afBlocked(id)) adFreeUrl(id);
  };
  document.addEventListener('pointerover', (e) => { clearTimeout(hoverT); if (!touch && e.target.closest && e.target.closest('.pi, .pb')) hoverT = setTimeout(() => warm(e), 300); }, { passive: true });
  document.addEventListener('pointerdown', warm, { passive: true, capture: true });
  Engine.ytInit().catch(() => { /* loads again on first YouTube song */ });
  setInterval(() => { if (adFreeOn() && !R.ok && document.visibilityState === 'visible') relay(); }, 60e3);
  window.addEventListener('resize', debounce(() => { dockKey = ''; }, 100));
  window.addEventListener('pagehide', () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } });
  window.addEventListener('storage', (e) => {
    // amatu.js pulled newer data from another device
    if (e.key === KEY && e.newValue) { try { const n = JSON.parse(e.newValue); for (const k of ['likes', 'lists', 'saved', 'myPresets']) if (n[k]) S[k] = n[k]; renderSideLists(); } catch (err) { /* ignore */ } }
  });

  window.PLAYLIST = { S, Q, Engine, API, render, setQueue, startCur, next, prev, toggleLike, openFull, openLive };
})();
