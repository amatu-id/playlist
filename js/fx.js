// fx.js — Web Audio effect chain (10-band EQ, bass, clarity, stereo width, balance,
// loudness compressor, room reverb, analyser). Shared by the app and eq.html (EQ Live).
(function () {
  const EQF = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const PRESETS = {
    'Datar': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    'Pop': [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2],
    'Pop Jazz': [2, 2, 1, 2, -1, -1, 0, 1, 2, 3],
    'Jazz': [3, 2, 1, 2, -2, -2, 0, 1, 2, 3],
    'Akustik': [3, 2, 1, 1, 2, 2, 2, 3, 2, 1],
    'Vokal': [-2, -2, -1, 1, 3, 4, 4, 3, 1, 0],
    'Rock': [4, 3, 2, 0, -1, -1, 1, 2, 3, 4],
    'Dangdut': [4, 4, 2, 0, -1, 1, 2, 3, 2, 1],
    'R&B': [3, 6, 4, 1, -2, -1, 2, 3, 3, 4],
    'Hip-Hop': [5, 4, 1, 3, -1, -1, 1, -1, 2, 3],
    'Elektronik': [5, 4, 1, 0, -2, 2, 1, 1, 4, 5],
    'Klasik': [4, 3, 2, 1, -1, -1, 0, 2, 3, 4],
    'Bass Boost': [7, 6, 4, 2, 0, 0, 0, 0, 0, 0],
    'Treble Boost': [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
    'Loudness': [6, 4, 0, 0, -2, 0, -1, -3, 5, 1],
    'Headphone': [3, 2, 0, -1, -1, 0, 1, 2, 3, 3],
    'Speaker Laptop': [-6, -4, -1, 2, 3, 3, 2, 2, 1, 0],
    'Malam': [-1, -1, 0, 1, 1, 1, 0, -2, -3, -4],
  };
  const ROOMS = { off: 0, studio: 0.5, kafe: 1.1, hall: 2.4, stadion: 4.2 };
  const DEF = { on: true, preset: 'Datar', bands: PRESETS['Datar'].slice(), pre: 0, guard: true, bass: 0, treble: 0, width: 100, bal: 0, comp: false, room: 'off', mix: 25 };

  const db = (v) => Math.pow(10, v / 20);

  function impulse(C, sec) {
    const len = Math.max(1, Math.floor(C.sampleRate * sec)), b = C.createBuffer(2, len, C.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return b;
  }

  function make(C, dest) {
    const n = {};
    n.in = C.createGain();
    n.pre = C.createGain();
    n.b = EQF.map((f, i) => {
      const b = C.createBiquadFilter();
      b.type = i === 0 ? 'lowshelf' : i === 9 ? 'highshelf' : 'peaking';
      b.frequency.value = f; b.Q.value = 1.05; b.gain.value = 0;
      return b;
    });
    n.bass = C.createBiquadFilter(); n.bass.type = 'lowshelf'; n.bass.frequency.value = 95;
    n.tre = C.createBiquadFilter(); n.tre.type = 'highshelf'; n.tre.frequency.value = 6500;
    n.st = C.createGain(); n.st.channelCount = 2; n.st.channelCountMode = 'explicit'; n.st.channelInterpretation = 'speakers';
    n.sp = C.createChannelSplitter(2); n.mg = C.createChannelMerger(2);
    n.ll = C.createGain(); n.lr = C.createGain(); n.rl = C.createGain(); n.rr = C.createGain();
    n.pan = C.createStereoPanner();
    n.comp = C.createDynamicsCompressor();
    n.dry = C.createGain(); n.wet = C.createGain(); n.conv = C.createConvolver();
    n.out = C.createGain();
    n.an = C.createAnalyser(); n.an.fftSize = 4096; n.an.smoothingTimeConstant = 0.78;

    let x = n.in; x.connect(n.pre); x = n.pre;
    for (const b of n.b) { x.connect(b); x = b; }
    x.connect(n.bass); n.bass.connect(n.tre); n.tre.connect(n.st); n.st.connect(n.sp);
    n.sp.connect(n.ll, 0); n.ll.connect(n.mg, 0, 0);
    n.sp.connect(n.lr, 0); n.lr.connect(n.mg, 0, 1);
    n.sp.connect(n.rl, 1); n.rl.connect(n.mg, 0, 0);
    n.sp.connect(n.rr, 1); n.rr.connect(n.mg, 0, 1);
    n.mg.connect(n.pan); n.pan.connect(n.comp);
    n.comp.connect(n.dry); n.dry.connect(n.out);
    n.comp.connect(n.conv); n.conv.connect(n.wet); n.wet.connect(n.out);
    n.out.connect(n.an); n.an.connect(dest || C.destination);

    let room = '';
    // smooth ramps while audio runs; direct values otherwise (offline/suspended → curve stays exact)
    const set = (p, v) => {
      if (C.state === 'running') p.setTargetAtTime(v, C.currentTime, 0.03);
      else { p.cancelScheduledValues(0); p.value = v; }
    };

    function apply(e) {
      e = Object.assign({}, DEF, e || {});
      const on = e.on;
      const bands = on ? e.bands : PRESETS['Datar'];
      const peak = Math.max(0, ...bands, on ? e.bass : 0);
      const pre = on ? e.pre - (e.guard ? peak * 0.6 : 0) : 0;
      set(n.pre.gain, db(pre));
      n.b.forEach((b, i) => set(b.gain, bands[i] || 0));
      set(n.bass.gain, on ? e.bass : 0);
      set(n.tre.gain, on ? e.treble : 0);
      const w = on ? e.width / 100 : 1;
      set(n.ll.gain, (1 + w) / 2); set(n.rr.gain, (1 + w) / 2);
      set(n.lr.gain, (1 - w) / 2); set(n.rl.gain, (1 - w) / 2);
      set(n.pan.pan, on ? e.bal / 100 : 0);
      const c = on && e.comp;
      n.comp.threshold.value = c ? -26 : 0; n.comp.ratio.value = c ? 4 : 1;
      n.comp.knee.value = c ? 24 : 0; n.comp.attack.value = 0.004; n.comp.release.value = 0.25;
      const r = on ? e.room : 'off';
      if (r !== 'off' && r !== room) { n.conv.buffer = impulse(C, ROOMS[r] || 1); }
      room = r;
      const mix = r === 'off' ? 0 : e.mix / 100;
      set(n.wet.gain, mix * 0.9); set(n.dry.gain, 1 - mix * 0.45);
      set(n.out.gain, c ? db(5) : 1);
    }

    // combined magnitude response in dB at given frequencies (for the curve)
    function response(freqs) {
      const f = new Float32Array(freqs), mag = new Float32Array(freqs.length), ph = new Float32Array(freqs.length);
      const tot = new Float32Array(freqs.length);
      for (const b of [...n.b, n.bass, n.tre]) {
        b.getFrequencyResponse(f, mag, ph);
        for (let i = 0; i < tot.length; i++) tot[i] += 20 * Math.log10(mag[i] || 1e-6);
      }
      return tot;
    }
    const buf = new Uint8Array(n.an.frequencyBinCount);
    function spectrum() { n.an.getByteFrequencyData(buf); return buf; }
    return { n, apply, response, spectrum, input: n.in, ctx: C };
  }

  window.FX = { EQF, PRESETS, ROOMS, DEF, make };
})();
