// api.js — catalogue (YouTube Music + Spotify via edge fn), lyrics (lrclib / YouTube Music) + translation, radio (radio-browser)
window.API = (function () {
  const EDGE = 'https://ieyqxmzztoxgpvwexbkj.supabase.co/functions/v1/amatu-music';
  const mem = new Map();

  function edge(params) {
    const q = new URLSearchParams(Object.assign({ v: '3' }, params)).toString();
    if (mem.has(q)) return mem.get(q);
    const p = fetch(EDGE + '/?' + q).then((r) => r.json()).then((d) => {
      if (d.error) throw new Error(d.error);
      return d;
    });
    mem.set(q, p);
    p.catch(() => mem.delete(q));
    return p;
  }

  // edge item → track / card
  function track(it) {
    if (!it) return null;
    if (it.type === 'spotify') return { src: 'sp', id: it.id, title: it.title, artists: it.artists || [], sec: it.sec || 0, thumb: it.thumb || '', preview: it.preview || '' };
    if (it.type === 'song' || it.type === 'video') return { src: 'yt', id: it.id, title: it.title, artists: it.artists || [], album: it.album || null, sec: it.sec || 0, thumb: it.thumb || `https://i.ytimg.com/vi/${it.id}/hqdefault.jpg`, kind: it.type };
    return null;
  }
  const tracksOf = (items) => (items || []).map(track).filter(Boolean);

  const search = (q, t) => edge({ a: 'search', q, t: t || 'all' });
  const browse = (id) => edge({ a: 'browse', id });
  const radio = (v) => edge({ a: 'radio', v }).then((d) => tracksOf(d.items));
  const suggest = (q) => edge({ a: 'suggest', q }).then((d) => d.items || []).catch(() => []);
  const spotify = (u) => edge({ a: 'spotify', u });

  // best YouTube match for a Spotify / external track
  async function match(t) {
    const q = `${t.title} ${(t.artists || []).map((a) => a.name).slice(0, 2).join(' ')}`;
    const d = await search(q, 'songs');
    const items = tracksOf(d.items);
    if (!items.length) return null;
    const norm = (s) => (s || '').toLowerCase().replace(/\(.*?\)|\[.*?\]|feat\..*$/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const nt = norm(t.title);
    let best = items[0], bs = -1;
    for (const c of items.slice(0, 6)) {
      let s = 0;
      const ct = norm(c.title);
      if (ct === nt) s += 5; else if (ct.includes(nt) || nt.includes(ct)) s += 3;
      if (t.sec && c.sec) s += Math.max(0, 3 - Math.abs(t.sec - c.sec) / 4);
      const an = norm((t.artists[0] || {}).name);
      if (an && c.artists.some((a) => norm(a.name).includes(an) || an.includes(norm(a.name)))) s += 3;
      if (s > bs) { bs = s; best = c; }
    }
    return { id: best.id, thumb: best.thumb };
  }

  // Lyrics, first source that has them: lrclib.net (often synced) → YouTube Music (Musixmatch / LyricFind) → NetEase.
  // Video titles like "Song - Artist | Lirik Lagu (Official Video)" are cleaned into title + artist first.
  const lnorm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)|\[.*?\]|feat\..*$|ft\..*$/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  function lyricQuery(t) {
    let title = t.title.split(/\s*[|｜•]+\s*|\s\/\/\s/)[0]
      .replace(/\s*[\(\[][^\)\]]*(feat|ft\.|with|official|lyric|lirik|video|audio|live|remaster|cover|version|mv|visuali[sz]er|karaoke)[^\)\]]*[\)\]]/gi, '')
      .replace(/\b(official (music )?video|music video|lirik( lagu)?|lyrics?|video lirik|video klip|mv)\b/gi, '').trim();
    let artist = ((t.artists[0] || {}).name || '').replace(/\s*-\s*topic$/i, '');
    let alt = null;
    const m = title.match(/^(.+?)\s[-–—]\s(.+)$/);
    if (m) {
      // "Artist - Song" or "Song - Artist": the side that matches the channel/artist name is the artist
      const a = lnorm(artist);
      if (a && (lnorm(m[1]).includes(a) || a.includes(lnorm(m[1])))) title = m[2];
      else if (a && (lnorm(m[2]).includes(a) || a.includes(lnorm(m[2])))) title = m[1];
      else if (t.kind === 'video') { title = m[1]; artist = m[2]; alt = { title: m[2], artist: m[1] }; }
    }
    const tidy = (x) => x.replace(/\s*[\(\[][^\)\]]*$/, '').replace(/[!?.]{2,}.*$/, '').replace(/\b(cover|karaoke|akustik|acoustic|kentrung|versi|version|remix|full)\b.*$/i, '').replace(/\s+/g, ' ').trim() || x.trim();
    const q = { title: tidy(title), artist: artist.trim() };
    q.alts = [q].concat(alt ? [{ title: tidy(alt.title), artist: alt.artist.trim() }] : []);
    return q;
  }
  // lrclib sometimes stops answering: every call has a timeout and a dead lrclib is skipped for a while
  let lrcDown = 0, lrcBad = 0;
  async function lrc(path) {
    if (Date.now() - lrcDown < 120e3) { lrcBad = Date.now(); return null; }
    try {
      const r = await fetch('https://lrclib.net/api/' + path, { signal: AbortSignal.timeout(7000) });
      if (!r.ok && r.status !== 404) lrcBad = Date.now();
      return r.ok ? await r.json() : null;
    } catch (e) { lrcBad = Date.now(); if (e.name === 'TimeoutError' || e.name === 'TypeError') lrcDown = Date.now(); return null; }
  }
  // a miss while lrclib is failing says nothing about the song: worth asking again
  const lyricsUnsure = () => Date.now() - lrcBad < 60e3;

  // A timed lyric only fits the recording it was timed on, and one song title often has a dozen recordings (covers,
  // remixes, other uploads). So timing is trusted only when the artist AND the length agree with the audio being played;
  // any other lyric of that title is at most text: a spelling reference for the lyrics written from the audio.
  const isArtist = (t, q, name) => {
    const n = lnorm(name);
    if (!n) return false;
    return [q.artist].concat((t.artists || []).map((a) => a.name)).some((a) => {
      const x = lnorm((a || '').replace(/\s*-\s*topic$/i, ''));
      return x && (x === n || (Math.min(x.length, n.length) >= 3 && (x.includes(n) || n.includes(x))));
    });
  };
  const sameLen = (d, sec) => !sec || (d && Math.abs(d - sec) <= 3);
  const fits = (L, sec) => !!(L && L.length) && (!sec || L[L.length - 1].t <= sec + 1);
  const textOf = (L) => L.map((l) => l.x).filter(Boolean).join('\n');
  async function lrclib(t, sec) {
    const f = { exact: null, seen: [] };
    for (const q of lyricQuery(t).alts) {
      await lrclibOne(t, q, sec, f);
      if (f.exact) return f;
    }
    return f;
  }
  async function lrclibOne(t, q, sec, f) {
    const take = (x) => {
      const mine = isArtist(t, q, x.artistName), L = parseLrc(x.syncedLyrics);
      if (mine && sameLen(x.duration, sec)) {
        if (x.instrumental) { f.exact = { instrumental: true, source: 'lrclib' }; return true; }
        if (fits(L, sec)) { f.exact = { synced: L, plain: x.plainLyrics || textOf(L), source: 'lrclib' }; return true; }
      }
      const plain = x.plainLyrics || (L ? textOf(L) : '');
      if (plain) f.seen.push({ plain, mine, by: lnorm(x.artistName) });
      return false;
    };
    if (q.artist && q.title) {
      const p = new URLSearchParams({ artist_name: q.artist, track_name: q.title });
      if (sec) p.set('duration', sec);
      const g = await lrc('get?' + p);
      if (g && take(g)) return;
    }
    const nt = lnorm(q.title);
    if (!nt) return;
    const short = q.title.split(' ').length > 3 ? q.title.split(' ').slice(0, 3).join(' ') : '';   // "Song Artist" glued titles
    for (const s of [`${q.title} ${q.artist}`.trim(), q.title, short].filter(Boolean)) {
      for (const x of (await lrc('search?' + new URLSearchParams({ q: s }))) || []) {
        const xt = lnorm(x.trackName);
        if (xt === nt || xt.includes(nt) || (nt.startsWith(xt) && xt.length >= Math.min(nt.length, 8))) { if (take(x)) return; }   // else a different song
      }
      if (f.seen.some((y) => y.mine)) return;
    }
  }
  async function ytLyrics(id) {
    const d = await edge({ a: 'lyrics', id });
    const l = d.lyrics;
    return l && (l.plain || '').trim() ? { synced: l.synced && l.synced.length ? l.synced : null, plain: l.plain, source: l.source || 'YouTube Music' } : null;
  }
  async function neLyrics(t, sec) {
    const q = lyricQuery(t);
    const d = await edge({ a: 'lrc', t: q.title, ar: q.artist, d: sec || 0 });
    const synced = parseLrc(d.lrc);
    return synced ? { synced, plain: textOf(synced), artist: !!d.artist, sec: d.sec || 0, source: 'NetEase' } : null;
  }
  // → { exact: lyric timed on this recording | null, text: right song, untimed | null, loose: right song, timing unproven | null, ref: spelling reference }
  async function lyrics(t, ytId, sec) {
    const f = await lrclib(t, sec).catch(() => ({ exact: null, seen: [] }));
    if (f.exact) return { exact: f.exact };
    // the song's own YouTube Music lyric is timed on that audio track; on a video or another upload it is only the right text
    const y = ytId ? await ytLyrics(ytId).catch(() => null) : null;
    if (y && y.synced && t.kind === 'song' && ytId === t.id && fits(y.synced, sec)) return { exact: y };
    const n = await neLyrics(t, sec).catch(() => null);
    if (n && n.artist && sameLen(n.sec, sec) && fits(n.synced, sec)) return { exact: n };
    const mine = f.seen.find((x) => x.mine);
    // reference: same artist first, else the artist with the most entries (usually the original, not a one-off cover)
    const by = {};
    for (const x of f.seen) by[x.by] = (by[x.by] || 0) + 1;
    const top = f.seen.slice().sort((a, b) => by[b.by] - by[a.by])[0];
    const textual = (mine && mine.plain) || (y && y.plain) || (n && n.artist && n.plain) || '';
    return {
      exact: null,
      text: textual ? { plain: textual, source: 'text' } : null,
      loose: y && y.synced && fits(y.synced, sec) ? y : null,
      ref: textual || (top && top.plain) || (n && n.plain) || '',
    };
  }

  // Indonesian translation per line (Google's Chrome translate endpoint — CORS-open, detects each line's language)
  async function translate(lines, tl) {
    tl = tl || 'id';
    const out = new Array(lines.length).fill(''), lang = new Array(lines.length).fill('');
    const idx = lines.map((l, i) => (l && l.trim() ? i : -1)).filter((i) => i >= 0);
    for (let k = 0; k < idx.length; k += 80) {
      const part = idx.slice(k, k + 80);
      const r = await fetch('https://translate-pa.googleapis.com/v1/translateHtml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json+protobuf', 'X-Goog-API-Key': 'AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520' },
        body: JSON.stringify([[part.map((i) => lines[i]), 'auto', tl], 'wt_lib']),
      });
      if (!r.ok) throw new Error('translate ' + r.status);
      const d = await r.json();
      part.forEach((i, j) => {
        out[i] = String((d[0] || [])[j] || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        lang[i] = (d[1] || [])[j] || '';
      });
    }
    return { lines: out, lang };
  }
  function parseLrc(s) {
    if (!s) return null;
    const out = [];
    for (const line of s.split('\n')) {
      const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
      if (m) out.push({ t: +m[1] * 60 + +m[2], x: m[3].trim() });
    }
    return out.length ? out : null;
  }

  // Internet radio
  const RB = ['de2', 'fi1', 'de1', 'nl1'];
  async function stations(params) {
    const p = new URLSearchParams(Object.assign({ hidebroken: 'true', order: 'clickcount', reverse: 'true', limit: '60' }, params));
    for (const h of RB) {
      try {
        const r = await fetch(`https://${h}.api.radio-browser.info/json/stations/search?` + p, { signal: AbortSignal.timeout(7000) });
        if (!r.ok) continue;
        const arr = await r.json();
        const seen = new Set();
        return arr.filter((s) => /^https:/.test(s.url_resolved) && !/\.m3u8|\.pls|\.m3u$/i.test(s.url_resolved) && !seen.has(s.name.trim().toLowerCase()) && seen.add(s.name.trim().toLowerCase()))
          .map((s) => ({ src: 'radio', id: s.stationuuid, title: s.name.trim(), artists: [{ name: [s.state || s.country, (s.tags || '').split(',').slice(0, 2).join(', ')].filter(Boolean).join(' · ') }], thumb: /^https:/.test(s.favicon) ? s.favicon : '', url: s.url_resolved, sec: 0, codec: s.codec, br: s.bitrate }));
      } catch (e) { /* next mirror */ }
    }
    return [];
  }

  return { EDGE, edge, track, tracksOf, search, browse, radio, suggest, spotify, match, lyrics, lyricsUnsure, lyricQuery, translate, stations };
})();
