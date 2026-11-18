// pre.js — whole songs held in memory (a song is about 3–8 MB). The next song of the queue is fetched completely while
// the current one plays, so it starts the moment it is called — also on a locked phone or in a background tab, where a
// new connection at that moment may take many seconds — and a connection that breaks later costs nothing.
// One song at a time, paused while a song is starting (that one gets the whole connection). A download that breaks
// off carries on from the byte where it stopped, from the audio server's node itself (no redirect).
window.Pre = (function () {
  const KEEP = 4;          // songs kept in memory
  const MAX = 22e6;        // longer uploads (hour-long mixes) keep streaming as before
  const IDLE = 10e3;       // no byte for this long: ask again from where it stopped (another node)
  const M = new Map();     // video id → entry
  const pinned = new Set();
  let active = null, held = false, reroute = null;

  const sizeOf = (u) => { try { return +new URL(u).searchParams.get('clen') || 0; } catch (e) { return 0; } };
  const settle = (e, v) => { for (const f of e.ready.splice(0)) f(v); };
  const holds = (e) => e.state === 'done' || e.state === 'load' || (e.state === 'wait' && e.got > 0);

  function drop(id) {
    const e = M.get(id);
    if (!e) return;
    if (e.ac) try { e.ac.abort(); } catch (x) { /* ignore */ }
    if (e.obj) URL.revokeObjectURL(e.obj);
    e.state = 'gone'; e.parts = null; e.blob = null; e.obj = '';
    settle(e, '');
    M.delete(id);
    if (active === e) active = null;
  }
  // memory: at most KEEP songs with data (never the ones pinned); failed ones are remembered a while, without data
  function evict() {
    const now = Date.now();
    for (const e of [...M.values()]) if (e.state === 'fail' && now - e.at > 600e3) M.delete(e.id);
    const data = [...M.values()].filter((e) => holds(e) && e !== active && !pinned.has(e.id)).sort((a, b) => a.at - b.at);
    let n = [...M.values()].filter(holds).length;
    while (n > KEEP && data.length) { drop(data.shift().id); n--; }
  }

  // next download: highest priority first, then the oldest wish
  function pump() {
    if (active || held) return;
    const next = [...M.values()].filter((e) => e.state === 'wait').sort((a, b) => b.prio - a.prio || a.at - b.at)[0];
    if (!next) return;
    active = next;
    next.state = 'load';
    grab(next).then(() => {
      if (active === next) active = null;
      if (next.state === 'load') {
        if (next.complete && (!next.size || next.got === next.size)) next.state = 'done';
        else if (next.paused) next.state = 'wait';            // paused for a starting song: not a failure
        else next.state = ++next.tries < 4 ? 'wait' : 'fail';
        next.paused = false;
      }
      if (next.state === 'done') {
        next.size = next.got;
        next.blob = new Blob(next.parts, { type: 'audio/mp4' });
        next.parts = null;
        next.obj = URL.createObjectURL(next.blob);
        next.at = Date.now();
        settle(next, next.obj);
      } else if (next.state === 'fail') {
        next.parts = null; next.at = Date.now();
        settle(next, '');
      }
      evict();
      setTimeout(pump, next.state === 'wait' && !next.got ? 3000 : 0);
    });
  }

  async function grab(e) {
    const ac = new AbortController();
    e.ac = ac; e.complete = false;
    let idle = 0;
    const kick = () => { clearTimeout(idle); idle = setTimeout(() => ac.abort(), IDLE); };
    try {
      kick();
      const from = e.got;
      const r = await fetch(e.node || e.url, { headers: from ? { Range: `bytes=${from}-` } : {}, signal: ac.signal, cache: 'no-store' });
      if (r.status !== 200 && r.status !== 206) { e.node = ''; throw new Error('http ' + r.status); }
      // the node the server sent us to: later pieces go there directly
      if (r.url && r.url !== e.url && !e.node) e.node = r.url;
      // a server that ignores the range sends the whole file again
      if (r.status === 200 && from) { e.parts = []; e.got = 0; }
      const len = +r.headers.get('content-length') || 0;
      if (!e.size && len && r.status === 200) e.size = len;
      if (e.size > MAX) { e.state = 'fail'; ac.abort(); return; }
      const rd = r.body.getReader();
      for (;;) {
        const { done, value } = await rd.read();
        if (done) { e.complete = true; break; }
        kick();
        e.parts.push(value);
        e.got += value.byteLength;
        if (e.size && e.got >= e.size) { e.complete = true; break; }
        if (held && e.prio < 3) { e.paused = true; ac.abort(); break; }
      }
    } catch (x) {
      if (held && e.prio < 3) e.paused = true;
      // broke off or got nothing: the next try asks another node for the same link (the app knows them); else the
      // server's own address again
      else e.node = (reroute && reroute(e.node || e.url)) || '';
    } finally {
      clearTimeout(idle);
      e.ac = null;
    }
  }

  return {
    // fetch this song into memory (prio: 1 = may be wanted, 2 = next in the queue, 3 = playing now).
    // Resolves with a blob: address once the whole song is here, '' when it can't be had.
    want(id, url, prio) {
      if (!id || !url || /^(blob|data):/.test(url)) return Promise.resolve('');
      let e = M.get(id);
      if (e && e.state === 'done') { e.at = Date.now(); return Promise.resolve(e.obj); }
      if (e && e.state === 'fail' && Date.now() - e.at < 600e3) return Promise.resolve('');
      if (!e || e.state === 'fail') {
        const size = sizeOf(url);
        if (size > MAX) return Promise.resolve('');
        e = { id, url, node: '', size, got: 0, parts: [], blob: null, obj: '', state: 'wait', tries: 0, at: Date.now(), prio: prio || 1, ready: [], ac: null, complete: false, paused: false };
        M.set(id, e);
      } else {
        e.prio = Math.max(e.prio, prio || 1);
        if (e.state === 'wait' && !e.got) e.url = url;   // a newer link for a download that has not begun
      }
      const p = new Promise((res) => e.ready.push(res));
      evict();
      pump();
      return p;
    },
    url(id) { const e = M.get(id); return e && e.state === 'done' ? e.obj : ''; },
    part(id) { const e = M.get(id); return e && e.size ? Math.min(1, e.got / e.size) : 0; },
    has(id) { const e = M.get(id); return !!e && e.state !== 'fail'; },
    // songs that must stay (the one playing, the next one)
    pin(ids) { pinned.clear(); for (const i of ids) if (i) pinned.add(i); },
    // while a song starts, downloads pause (they carry on from the same byte afterwards)
    hold(on) {
      held = !!on;
      if (held && active && active.prio < 3 && active.ac) { active.paused = true; try { active.ac.abort(); } catch (x) { /* ignore */ } }
      if (!held) setTimeout(pump, 0);
    },
    drop,
    setReroute(f) { reroute = f; },
    // a copy that failed to play is not used again for a while
    bad(id) { const e = M.get(id); if (!e) return; drop(id); M.set(id, Object.assign(e, { state: 'fail', at: Date.now(), ready: [], parts: null })); },
    debug: () => [...M.values()].map((e) => ({ id: e.id, st: e.state, p: e.size ? +(e.got / e.size).toFixed(2) : 0, prio: e.prio, mb: +(e.got / 1e6).toFixed(1) })),
  };
})();
