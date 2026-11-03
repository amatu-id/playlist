# Amatu Playlist

Pemutar musik web di **https://amatu-id.github.io/playlist/** (bagian dari Portal AMATU).

- Lagu penuh dari YouTube / YouTube Music, playlist & tangga lagu Spotify (dicocokkan otomatis ke lagu penuh, atau diputar lewat Spotify embed / preview Hi-Fi).
- Beranda kurasi: Tangga Lagu Indonesia, Pop Indonesia, Pop Jazz & City Pop, lagu hits lainnya, hits dunia.
- Cari lagu, video, album, artis, playlist; tempel link YouTube/Spotify.
- Antrean (putar berikutnya, drag urutkan), acak, ulangi, autoplay lagu serupa, radio dari lagu, transisi fade.
- Lirik sinkron (lrclib), mini player (Picture-in-Picture), timer tidur, kecepatan putar, kontrol media/keyboard.
- Equalizer 10 band + preset, bass boost, kejernihan, lebar stereo, balance, efek ruang, normalisasi volume, anti-clipping.
  EQ langsung bekerja untuk radio, file lokal & preview Hi-Fi; **EQ Live** (`eq.html`, Chrome/Edge desktop) memproses suara tab termasuk YouTube & Spotify.
- Radio internet Indonesia & dunia (radio-browser.info), file audio lokal.
- Pustaka: Lagu yang Disukai, playlist sendiri, koleksi tersimpan, riwayat, statistik, impor/ekspor JSON.

Struktur: `index.html`, `css/app.css`, `js/{data,fx,api,engine,app}.js`, `eq.html`.
Katalog lewat Supabase Edge Function `amatu-music` (`supabase/functions/amatu-music`), deploy:
`supabase functions deploy amatu-music --project-ref ieyqxmzztoxgpvwexbkj --no-verify-jwt --use-api`.
