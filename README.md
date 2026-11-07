# Amatu Playlist

Pemutar musik web di **https://amatu-id.github.io/playlist/** (bagian dari Portal AMATU).

- **Bebas iklan**: lagu YouTube diputar sebagai audio Hi-Fi langsung dari web lewat server Invidious publik (CORS + Range, bisa seek, EQ langsung aktif); lagu berikutnya disiapkan lebih awal. Server tidak tersedia → upload lain, lalu pemutar YouTube (bisa ada iklan). Tidak memakai MacBook sama sekali.
- Lagu penuh dari YouTube / YouTube Music, playlist & tangga lagu Spotify (dicocokkan otomatis ke lagu penuh, atau diputar lewat Spotify embed / preview Hi-Fi).
- Beranda kurasi: rak lagu chart live (Top 50 Indonesia harian, trending YouTube Indonesia, Top 100 Songs Global, Today's Top Hits), Tangga Lagu Indonesia, Terpopuler Minggu Ini, Baru & Lagi Naik, Viral & Joget, K-Pop/J-Pop, Genre Dunia, Religi, Pop Indonesia, Pop Jazz & City Pop, lagu hits lainnya, hits dunia.
- Koleksi rock (`#rock/legend`, `#rock/viral`, `#rock/terbaik`): lagu dan album Rock Legend, Pop Rock Viral, Rock Terbaik Sepanjang Masa, di rak Beranda dan kotak genre. Daftar kurasi ada di `tools/gen-rock.py`, hasilnya `js/rock.js` (jalankan ulang setelah mengubah daftar, naikkan `?v`).
- Cari lagu, video, album, artis, playlist; tempel link YouTube/Spotify.
- Antrean (putar berikutnya, drag urutkan), acak, ulangi, autoplay lagu serupa, radio dari lagu, transisi fade.
- Musik tidak berhenti sendiri: langsung berputar saat situs dibuka (browser bisa meminta satu sentuhan), lagu berikutnya disiapkan 30 detik sebelum lagu berakhir, antrean habis → lagu serupa atau antrean diulang.
- Mulai cepat: stream yang tidak memberi data dalam 6 detik atau tidak bisa dijangkau browser (mis. Chrome `ERR_ECH_FALLBACK_CERTIFICATE_INVALID` pada host `yt-comp*`) tidak ditunggu; satu link baru bila masih masuk akal, lalu pemutar YouTube. Lagu berikutnya mencoba jalur bebas iklan lagi.
- Tanpa diam: `js/gap.js` mengambil contoh potongan audio lalu mendekodenya; lagu berakhir di tempat suaranya habis, bagian senyap di tengah dilompati, dan volume yang tersangkut atau jalur audio yang mati dipulihkan otomatis.
- Lirik sinkron: dipakai hanya bila penyanyi + durasi cocok dengan audio yang diputar; selain itu baris & waktu ditulis dari audio lagu itu sendiri (Gemini, lirik versi lain hanya acuan ejaan), mini player (Picture-in-Picture), timer tidur, kecepatan putar, kontrol media/keyboard.
- Equalizer 10 band + preset, bass boost, kejernihan, lebar stereo, balance, efek ruang, normalisasi volume, anti-clipping.
  EQ langsung bekerja untuk radio, file lokal & preview Hi-Fi; **EQ Live** (`eq.html`, Chrome/Edge desktop) memproses suara tab termasuk YouTube & Spotify.
- Radio internet Indonesia & dunia (radio-browser.info), file audio lokal.
- Pustaka: Lagu yang Disukai, playlist sendiri, koleksi tersimpan, riwayat, statistik, impor/ekspor JSON.

Struktur: `index.html`, `css/app.css`, `js/{data,fx,api,gap,engine,app}.js`, `eq.html`.
Katalog lewat Supabase Edge Function `amatu-music` (`supabase/functions/amatu-music`), deploy:
`supabase functions deploy amatu-music --project-ref ieyqxmzztoxgpvwexbkj --no-verify-jwt --use-api`.
