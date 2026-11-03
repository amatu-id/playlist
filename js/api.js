// api.js — catalogue (YouTube Music + Spotify via edge fn), lyrics (lrclib), radio (radio-browser)
window.API = (function () {
  const EDGE = 'https://ieyqxmzztoxgpvwexbkj.supabase.co/functions/v1/amatu-music';
  const mem = new Map();

  function edge(params) {
    const q = new URLSearchParams(Object.assign({ v: '2' }, params)).toString();
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

  // lyrics from lrclib.net (synced when available)
  async function lyrics(t) {
    const artist = (t.artists[0] || {}).name || '';
    const title = t.title.replace(/\s*[\(\[](feat|ft|with|official|lyric|video|audio|live|remaster)[^\)\]]*[\)\]]/gi, '').trim();
    const pick = (x) => x && (x.syncedLyrics || x.plainLyrics) ? { synced: parseLrc(x.syncedLyrics), plain: x.plainLyrics || '', instrumental: x.instrumental } : null;
    try {
      const p = new URLSearchParams({ artist_name: artist, track_name: title });
      if (t.sec) p.set('duration', t.sec);
      const r = await fetch('https://lrclib.net/api/get?' + p);
      if (r.ok) { const x = pick(await r.json()); if (x) return x; }
    } catch (e) { /* fall through to search */ }
    const r = await fetch('https://lrclib.net/api/search?' + new URLSearchParams({ q: `${title} ${artist}`.trim() }));
    const arr = r.ok ? await r.json() : [];
    let best = null;
    for (const x of arr) {
      if (!x.syncedLyrics && !x.plainLyrics) continue;
      if (!best) best = x;
      if (x.syncedLyrics && t.sec && Math.abs(x.duration - t.sec) < 4) { best = x; break; }
    }
    return pick(best);
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

  return { EDGE, edge, track, tracksOf, search, browse, radio, suggest, spotify, match, lyrics, stations };
})();
