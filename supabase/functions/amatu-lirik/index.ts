// amatu-lirik — writes a song's lyrics from its audio with Gemini, for songs no lyrics site knows (no MacBook needed).
// GET|POST ?id=<videoId>&t=<title>&ar=<artist>   header x-amatu: <portal session token>   POST body { ref: lyrics of another recording }
//   → { lines: [{t, x}], lang } | { busy: true } | { error }
// Every song is written once and shared through amt_lyrics; amt_lyrics_claim guards the session + daily allowance.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-amatu',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const SB = Deno.env.get('SUPABASE_URL')!, ANON = Deno.env.get('SUPABASE_ANON_KEY')!, KEY = Deno.env.get('GEMINI_API_KEY')!;
const INV = ['https://yt.chocolatemoo53.com'];
// The key is on the free tier: 20 requests a day per model, so a 429 moves on to the next model at once.
// Left out on purpose, a song is only written once: flash-lite breaks Javanese lyrics into syllables; 3-flash-preview
// invents evenly spaced times (p90 3 s off, 3.5-flash 1 s).
const MODELS = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash'];
const MAX_SEC = 900, MAX_BYTES = 18e6, BUDGET_MS = 135e3;

// deno-lint-ignore no-explicit-any
type J = any;
const out = (o: J, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function rpc(fn: string, args: J) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error((j && j.message) || 'rpc ' + r.status);
  return j;
}

async function audioOf(id: string, left: () => number) {
  for (const h of INV) {
    try {
      const r = await fetch(`${h}/api/v1/videos/${id}?local=true&fields=adaptiveFormats,lengthSeconds`, { signal: AbortSignal.timeout(15000) });
      const j = await r.json();
      if (+j.lengthSeconds > MAX_SEC) throw new Error('long');
      const f = (j.adaptiveFormats || []).find((x: J) => String(x.itag) === '140');
      if (!f) continue;
      const a = await fetch(new URL(f.url, h).href, { signal: AbortSignal.timeout(Math.min(70e3, left())) });
      if (!a.ok) continue;
      const b = new Uint8Array(await a.arrayBuffer());
      if (b.length > MAX_BYTES) throw new Error('long');
      return { b, sec: +j.lengthSeconds || 0 };
    } catch (e) { if ((e as Error).message === 'long') throw e; /* next instance */ }
  }
  throw new Error('audio');
}

function b64(b: Uint8Array) {
  let s = '';
  for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode(...b.subarray(i, i + 32768));
  return btoa(s);
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    lang: { type: 'STRING' },
    lines: { type: 'ARRAY', items: { type: 'OBJECT', properties: { t: { type: 'STRING' }, x: { type: 'STRING' } }, required: ['t', 'x'] } },
  },
  required: ['lines'],
};
const prompt = (title: string, artist: string, ref: string) => `Transcribe the sung lyrics of this song exactly as heard, in the original language (often Indonesian, Javanese or English). Do not translate, do not invent or complete lines from memory, and do not add section labels.
Song: "${title}" by ${artist}.
Return one entry per sung line. t = the timestamp in the audio where that line starts, formatted MM:SS (for example 01:35). Timestamps must follow the real audio timeline to the very end of the song. Repeat choruses each time they are sung, in order. lang = the ISO 639-1 code of the main language. If there is no singing return an empty list.${ref ? `

Reference lyrics of this song, possibly from ANOTHER recording, so their order and repeats may differ from this audio. Use them only to spell correctly the words you actually hear. Timing must come only from this audio. Never output a line that is not sung in this audio:
${ref}` : ''}`;

async function transcribe(b: Uint8Array, title: string, artist: string, ref: string, left: () => number) {
  const body = JSON.stringify({
    contents: [{ parts: [{ inline_data: { mime_type: 'audio/mp4', data: b64(b) } }, { text: prompt(title, artist, ref) }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
  });
  let last = 'gemini', tries = 0, full = 0;
  for (const m of MODELS.concat(MODELS.slice(0, 1))) {
    if (left() < 25e3) break;
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
        body,
        signal: AbortSignal.timeout(Math.min(80e3, left())),
      });
      if (!r.ok) {
        tries++; if (r.status === 429) full++;
        last = 'gemini ' + r.status;
        if (r.status !== 429) await new Promise((ok) => setTimeout(ok, 3000));
        continue;
      }
      const j = await r.json();
      const c = j.candidates?.[0];
      const txt = (c?.content?.parts || []).map((p: J) => p.text || '').join('');
      if (!txt) { last = 'gemini ' + (c?.finishReason || j.promptFeedback?.blockReason || 'kosong'); continue; }
      return JSON.parse(txt);
    } catch (e) { last = (e as Error).name === 'TimeoutError' ? 'gemini lambat' : 'gemini'; }
  }
  throw new Error(tries && full >= MODELS.length - 1 ? 'kuota' : last);   // every model out for today (the alias often answers 503 instead)
}

// MM:SS follows the song far better than plain seconds: measured on a song with known timing, seconds drifted up to
// 140 s by the end, MM:SS stayed within about 2 s
const secOf = (v: J) => String(v).split(':').reduce((a, b) => a * 60 + (+b || 0), 0);
// the same line many times in a row is a decoder loop, not a chorus; a time past the song's end is not a real time
const NOISE = /^[\s♪.\-–—…,!?*#]*$|^\[.*\]$|^\(.*\)$|^(intro|outro|reff?|chorus|interlude|instrumen\w*)\b[\s:.!]*$/i;
function clean(lines: J[], sec: number) {
  const L: { t: number; x: string }[] = [];
  for (const l of lines || []) {
    const x = String(l.x || '').replace(/\s+/g, ' ').trim(), t = Math.round(secOf(l.t) * 10) / 10;
    if (!x || NOISE.test(x) || (sec && t > sec + 2)) continue;
    if (L.length >= 3 && L.slice(-3).every((y) => y.x === x)) continue;
    L.push({ t, x });
  }
  return L.sort((a, b) => a.t - b.t);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const u = new URL(req.url), id = u.searchParams.get('id') || '', token = req.headers.get('x-amatu') || '';
  const title = (u.searchParams.get('t') || '').slice(0, 200), artist = (u.searchParams.get('ar') || '').slice(0, 200);
  const t0 = Date.now(), left = () => BUDGET_MS - (Date.now() - t0);
  const ref = req.method === 'POST' ? String((await req.json().catch(() => ({}))).ref || '').slice(0, 5000) : '';
  try {
    const c = await rpc('amt_lyrics_claim', { p_token: token, p_id: id });
    if (!c.ok) return out(c);
    const { b, sec } = await audioOf(id, left);
    const r = await transcribe(b, title, artist, ref, left);
    const lines = clean(r.lines, sec), lang = String(r.lang || '').slice(0, 8);
    await rpc('amt_lyrics_set', { p_token: token, p_id: id, p_lines: lines, p_lang: lang, p_by: 'gemini' });
    return out({ lines, lang, by: 'gemini' });
  } catch (e) {
    const m = (e as Error).message;
    if (m !== 'auth') await rpc('amt_lyrics_release', { p_token: token, p_id: id }).catch(() => {});
    return out({ error: m }, m === 'auth' ? 401 : 200);
  }
});
