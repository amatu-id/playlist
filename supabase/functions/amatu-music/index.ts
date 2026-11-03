// amatu-music — YouTube Music catalogue proxy for amatu-id.github.io/playlist
// GET ?a=search&q=..&t=songs|videos|albums|artists|playlists|all
//     ?a=browse&id=MPREb_..|VL..|UC..|FEmusic_home
//     ?a=radio&v=<videoId>      ?a=suggest&q=..
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const FILTER: Record<string, string> = {
  songs: 'EgWKAQIIAWoKEAkQBRAKEAMQBA==',
  videos: 'EgWKAQIQAWoKEAkQChAFEAMQBA==',
  albums: 'EgWKAQIYAWoKEAkQChAFEAMQBA==',
  artists: 'EgWKAQIgAWoKEAkQChAFEAMQBA==',
  playlists: 'EgeKAQQoADgBagoQCRAKEAUQAxAE',
  community: 'EgeKAQQoAEABagoQCRAKEAUQAxAE',
};

// deno-lint-ignore no-explicit-any
type J = any;

async function yt(ep: string, body: J): Promise<J> {
  const b = { context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20241023.01.00', hl: 'en', gl: 'ID' } }, ...body };
  const r = await fetch(`https://music.youtube.com/youtubei/v1/${ep}?prettyPrint=false`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      Origin: 'https://music.youtube.com',
      Referer: 'https://music.youtube.com/',
    },
    body: JSON.stringify(b),
  });
  if (!r.ok) throw new Error('yt ' + r.status);
  return await r.json();
}

const runsOf = (t: J) => (t && t.runs) || [];
const txt = (t: J) => t ? (t.simpleText ?? runsOf(t).map((r: J) => r.text).join('')) : '';
const pageType = (e: J) => e?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType || '';

function thumb(o: J): string {
  let best = '', bw = 0;
  const walk = (x: J, d: number) => {
    if (!x || typeof x !== 'object' || d > 8) return;
    if (Array.isArray(x.thumbnails)) {
      for (const t of x.thumbnails) if ((t.width || 0) >= bw && t.url) { bw = t.width || 0; best = t.url; }
      return;
    }
    for (const k in x) walk(x[k], d + 1);
  };
  walk(o, 0);
  if (best.startsWith('//')) best = 'https:' + best;
  return best.replace(/=w\d+-h\d+[^&]*$/, '=w544-h544-l90-rj').replace(/\/(hq|mq|sd)default\.jpg.*$/, '/hqdefault.jpg');
}

const LABEL = /^(song|video|lagu|single|album|ep|playlist|artist|episode)$/i;
const STAT = /(plays|views|audience|pemutaran|ditonton|\d{4}$)/i;
const DUR = /^\d{1,2}(:\d{2}){1,2}$/;
function secs(s: string) { return s ? s.split(':').reduce((a, b) => a * 60 + +b, 0) : 0; }

// split subtitle runs into artists / album / duration / extra
function meta(runs: J[]) {
  const artists: J[] = [], extra: string[] = [];
  let album: J = null, dur = '';
  for (const r of runs) {
    const t = (r.text || '').trim();
    if (!t || t === '•' || t === '&' || t === ',') continue;
    const pt = pageType(r.navigationEndpoint);
    if (pt === 'MUSIC_PAGE_TYPE_ARTIST' || pt === 'MUSIC_PAGE_TYPE_USER_CHANNEL') artists.push({ name: t, id: r.navigationEndpoint.browseEndpoint.browseId });
    else if (pt === 'MUSIC_PAGE_TYPE_ALBUM') album = { name: t, id: r.navigationEndpoint.browseEndpoint.browseId };
    else if (DUR.test(t)) dur = t;
    else extra.push(t);
  }
  return { artists, album, dur, extra };
}

const KIND: Record<string, string> = {
  MUSIC_PAGE_TYPE_ALBUM: 'album', MUSIC_PAGE_TYPE_ARTIST: 'artist', MUSIC_PAGE_TYPE_PLAYLIST: 'playlist',
  MUSIC_PAGE_TYPE_USER_CHANNEL: 'artist', MUSIC_PAGE_TYPE_AUDIOBOOK: 'album',
};

function listItem(r: J) {
  const cols = (r.flexColumns || []).map((c: J) => c.musicResponsiveListItemFlexColumnRenderer?.text);
  const fixed = (r.fixedColumns || []).map((c: J) => txt(c.musicResponsiveListItemFixedColumnRenderer?.text));
  const title = txt(cols[0]);
  const sub = cols.slice(1).flatMap((c: J) => [...runsOf(c), { text: '•' }]);
  const m = meta(sub);
  const vid = r.playlistItemData?.videoId || runsOf(cols[0])[0]?.navigationEndpoint?.watchEndpoint?.videoId
    || r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
  const nav = r.navigationEndpoint;
  const dur = m.dur || fixed.find((f: string) => DUR.test(f)) || '';
  if (vid) {
    const isVideo = /^video$/i.test(m.extra[0] || '');
    const names = m.extra.filter((x) => !LABEL.test(x) && !STAT.test(x));
    return { type: isVideo ? 'video' : 'song', id: vid, title, artists: m.artists.length ? m.artists : names.slice(0, 1).map((n) => ({ name: n })), album: m.album, dur, sec: secs(dur), thumb: thumb(r.thumbnail), info: m.extra.filter((x) => !LABEL.test(x)).join(' • ') };
  }
  const kind = KIND[pageType(nav)];
  if (!kind) return null;
  return { type: kind, id: nav.browseEndpoint.browseId, title, artists: m.artists, thumb: thumb(r.thumbnail), info: m.extra.join(' • ') };
}

function twoRow(r: J) {
  const title = txt(r.title);
  const m = meta(runsOf(r.subtitle));
  const nav = r.navigationEndpoint;
  const w = nav?.watchEndpoint;
  if (w?.videoId) return { type: 'video', id: w.videoId, title, artists: m.artists, thumb: thumb(r.thumbnailRenderer), info: m.extra.join(' • ') };
  const kind = KIND[pageType(nav)];
  if (!kind) {
    const pl = nav?.watchPlaylistEndpoint?.playlistId;
    return pl ? { type: 'playlist', id: 'VL' + pl, title, artists: m.artists, thumb: thumb(r.thumbnailRenderer), info: m.extra.join(' • ') } : null;
  }
  return { type: kind, id: nav.browseEndpoint.browseId, title, artists: m.artists, thumb: thumb(r.thumbnailRenderer), info: m.extra.join(' • ') };
}

function panelItem(r: J) {
  const m = meta(runsOf(r.longBylineText));
  const dur = txt(r.lengthText);
  return { type: 'song', id: r.videoId, title: txt(r.title), artists: m.artists.length ? m.artists : m.extra.slice(0, 1).map((n) => ({ name: n })), album: m.album, dur, sec: secs(dur), thumb: thumb(r.thumbnail) };
}

// walk sections (shelves/carousels) → [{title, items}]
function sections(root: J) {
  const out: J[] = [];
  const seen = new Set();
  const walk = (x: J, d: number) => {
    if (!x || typeof x !== 'object' || d > 30) return;
    if (Array.isArray(x)) { for (const v of x) walk(v, d + 1); return; }
    const shelf = x.musicShelfRenderer || x.musicCarouselShelfRenderer || x.musicCardShelfRenderer || x.musicPlaylistShelfRenderer || x.gridRenderer
      || (x.itemSectionRenderer?.contents?.some((c: J) => c.musicResponsiveListItemRenderer || c.musicTwoRowItemRenderer) ? x.itemSectionRenderer : null);
    if (shelf && !seen.has(shelf)) {
      seen.add(shelf);
      const hdr = shelf.header?.musicCarouselShelfBasicHeaderRenderer || shelf.header?.musicCardShelfHeaderBasicRenderer || shelf.header?.gridHeaderRenderer || shelf;
      const items: J[] = [];
      if (x.musicCardShelfRenderer) {
        const c = x.musicCardShelfRenderer;
        const top = twoRow({ title: c.title, subtitle: c.subtitle, navigationEndpoint: c.title?.runs?.[0]?.navigationEndpoint, thumbnailRenderer: c.thumbnail });
        if (top) items.push(top);
      }
      for (const c of shelf.contents || shelf.items || []) {
        const it = c.musicResponsiveListItemRenderer ? listItem(c.musicResponsiveListItemRenderer)
          : c.musicTwoRowItemRenderer ? twoRow(c.musicTwoRowItemRenderer) : null;
        if (it && it.id) items.push(it);
      }
      const more = shelf.bottomEndpoint?.browseEndpoint?.browseId || hdr?.moreContentButton?.buttonRenderer?.navigationEndpoint?.browseEndpoint?.browseId || '';
      if (items.length) out.push({ title: txt(hdr?.title) || '', items, more });
      if (x.musicCardShelfRenderer) for (const c of x.musicCardShelfRenderer.contents || []) walk(c, d + 1);
      return;
    }
    for (const k in x) walk(x[k], d + 1);
  };
  walk(root, 0);
  return out;
}

function header(d: J) {
  const find = (x: J, dep: number): J => {
    if (!x || typeof x !== 'object' || dep > 14) return null;
    for (const k of ['musicResponsiveHeaderRenderer', 'musicImmersiveHeaderRenderer', 'musicVisualHeaderRenderer', 'musicDetailHeaderRenderer', 'musicEditablePlaylistDetailHeaderRenderer']) {
      if (x[k]) return x[k].header?.musicResponsiveHeaderRenderer || x[k];
    }
    for (const k in x) { const r = find(x[k], dep + 1); if (r) return r; }
    return null;
  };
  const h = find(d, 0);
  if (!h) return {};
  const m = meta([...runsOf(h.straplineTextOne), { text: '•' }, ...runsOf(h.subtitle)]);
  return {
    title: txt(h.title), artists: m.artists, info: m.extra.join(' • '),
    second: txt(h.secondSubtitle), desc: txt(h.description?.musicDescriptionShelfRenderer?.description || h.description).slice(0, 600),
    thumb: thumb(h.thumbnail || h.foregroundThumbnail),
  };
}

async function handle(u: URL) {
  const a = u.searchParams.get('a') || 'search';
  if (a === 'search') {
    const q = (u.searchParams.get('q') || '').slice(0, 200);
    const t = u.searchParams.get('t') || 'all';
    const d = await yt('search', { query: q, ...(FILTER[t] ? { params: FILTER[t] } : {}) });
    const s = sections(d);
    if (t === 'all') {
      // new layout: one itemSectionRenderer per result → regroup by type
      const top = s[0] && s[0].title ? [s[0]] : [];
      const rest = s.slice(top.length).flatMap((x: J) => x.items);
      const NAMES: Record<string, string> = { song: 'Songs', video: 'Videos', album: 'Albums', artist: 'Artists', playlist: 'Playlists' };
      const groups: J[] = [];
      for (const ty of ['song', 'video', 'album', 'artist', 'playlist']) {
        const items = rest.filter((i: J) => i.type === ty);
        if (items.length) groups.push({ title: NAMES[ty], items, more: '' });
      }
      const named = s.slice(top.length).filter((x: J) => x.title);
      return { sections: top.concat(named.length ? named : groups) };
    }
    const items = s.flatMap((x: J) => x.items);
    if (t === 'videos') for (const i of items) if (i.type === 'song') i.type = 'video';
    return { items };
  }
  if (a === 'browse') {
    const id = u.searchParams.get('id') || 'FEmusic_home';
    const d = await yt('browse', { browseId: id, ...(u.searchParams.get('p') ? { params: u.searchParams.get('p') } : {}) });
    const h = header(d);
    let s = sections(d);
    // album/playlist tracks: fill missing artist/thumb/album from header
    if (/^(MPREb|VL|OLAK)/.test(id) && s[0]) {
      for (const it of s[0].items) {
        if (it.type !== 'song' && it.type !== 'video') continue;
        if (!it.artists?.length && h.artists) it.artists = h.artists;
        if (!it.thumb) it.thumb = h.thumb;
        if (!it.album && id.startsWith('MPREb')) it.album = { name: h.title, id };
      }
    }
    if (id.startsWith('MPREb')) s = s.slice(0, 1).concat(s.slice(1).map((x: J) => ({ ...x, items: x.items.filter((i: J) => i.type !== 'song') })));
    return { header: h, sections: s };
  }
  if (a === 'radio') {
    const v = u.searchParams.get('v') || '';
    const d = await yt('next', { videoId: v, playlistId: u.searchParams.get('list') || 'RDAMVM' + v, isAudioOnly: true });
    const items: J[] = [];
    const walk = (x: J, dep: number) => {
      if (!x || typeof x !== 'object' || dep > 30) return;
      if (x.playlistPanelVideoRenderer) { items.push(panelItem(x.playlistPanelVideoRenderer)); return; }
      if (x.playlistPanelVideoWrapperRenderer) { walk(x.playlistPanelVideoWrapperRenderer.primaryRenderer, dep + 1); return; }
      for (const k in x) walk(x[k], dep + 1);
    };
    walk(d, 0);
    return { items: items.filter((i) => i.id) };
  }
  if (a === 'suggest') {
    const d = await yt('music/get_search_suggestions', { input: (u.searchParams.get('q') || '').slice(0, 100) });
    const out: string[] = [];
    const walk = (x: J, dep: number) => {
      if (!x || typeof x !== 'object' || dep > 20) return;
      if (x.searchSuggestionRenderer) { out.push(txt(x.searchSuggestionRenderer.suggestion)); return; }
      for (const k in x) walk(x[k], dep + 1);
    };
    walk(d, 0);
    return { items: out.slice(0, 8) };
  }
  if (a === 'spotify') {
    // public embed page carries name, cover, track list and 30 s previews
    const m = (u.searchParams.get('u') || '').match(/(playlist|album|track|artist)[/:]([A-Za-z0-9]{22})/);
    if (!m) throw new Error('bad spotify link');
    const r = await fetch(`https://open.spotify.com/embed/${m[1]}/${m[2]}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130.0 Safari/537.36', 'Accept-Language': 'id,en' } });
    const h = await r.text();
    const nd = h.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s);
    if (!nd) throw new Error('spotify ' + r.status);
    const e = JSON.parse(nd[1])?.props?.pageProps?.state?.data?.entity;
    if (!e) throw new Error('spotify not found');
    const cover = (e.coverArt?.sources || e.visualIdentity?.image || []).reduce((b: J, s: J) => (!b || (s.width || 0) > (b.width || 0) ? s : b), null)?.url || '';
    const list = e.trackList || (e.type === 'track' ? [{ uri: e.uri, title: e.name || e.title, subtitle: (e.artists || []).map((x: J) => x.name).join(', '), duration: e.duration, audioPreview: e.audioPreview }] : []);
    const items = list.map((t: J) => ({
      type: 'spotify', id: (t.uri || '').split(':').pop(), title: t.title || t.name,
      artists: String(t.subtitle || '').split(/,\s*/).filter(Boolean).map((n: string) => ({ name: n.replace(/ /g, ' ').trim() })),
      sec: Math.round((t.duration || 0) / 1000), dur: '', thumb: t.image?.[0]?.url || cover, preview: t.audioPreview?.url || '',
    })).filter((t: J) => t.id);
    for (const t of items) t.dur = t.sec ? `${Math.floor(t.sec / 60)}:${String(t.sec % 60).padStart(2, '0')}` : '';
    return { header: { title: e.name || e.title, info: 'Spotify • ' + m[1], second: e.subtitle || (e.authors || []).map((x: J) => x.name).join(', '), thumb: cover, uri: `spotify:${m[1]}:${m[2]}` }, sections: [{ title: '', items }] };
  }
  throw new Error('bad action');
}

const cache = new Map<string, { t: number; v: string }>();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const u = new URL(req.url);
  const key = u.search;
  const hit = cache.get(key);
  const ttl = u.searchParams.get('a') === 'suggest' ? 3600e3 : 600e3;
  if (hit && Date.now() - hit.t < ttl) return new Response(hit.v, { headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' } });
  try {
    const v = JSON.stringify(await handle(u));
    if (cache.size > 300) cache.clear();
    cache.set(key, { t: Date.now(), v });
    return new Response(v, { headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
