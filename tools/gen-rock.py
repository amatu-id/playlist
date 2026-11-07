#!/usr/bin/env python3
# Writes js/rock.js: curated rock songs + albums resolved to YouTube Music ids through the edge fn.
# Run again to refresh ids/thumbs; whatever fails the title+artist check is reported, not written.
import json, os, re, sys, time, unicodedata, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

E = 'https://ieyqxmzztoxgpvwexbkj.supabase.co/functions/v1/amatu-music/?'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'js', 'rock.js')

LEGEND_SONGS = """Queen|Don't Stop Me Now
Led Zeppelin|Kashmir
AC/DC|Thunderstruck
The Rolling Stones|Paint It, Black
Guns N' Roses|November Rain
Aerosmith|Dream On
Deep Purple|Smoke on the Water
Black Sabbath|Paranoid
Metallica|Enter Sandman
Pink Floyd|Wish You Were Here
Nirvana|Come As You Are
Bon Jovi|Livin' on a Prayer
Eagles|Take It Easy
The Who|Baba O'Riley
Jimi Hendrix|All Along the Watchtower
Van Halen|Jump
Scorpions|Still Loving You
Iron Maiden|The Trooper
Lynyrd Skynyrd|Sweet Home Alabama
Creedence Clearwater Revival|Fortunate Son
The Doors|Light My Fire
Kiss|Rock and Roll All Nite
Journey|Don't Stop Believin'
Santana|Black Magic Woman
Dire Straits|Sultans of Swing
Rush|Tom Sawyer
Boston|More Than a Feeling
Def Leppard|Pour Some Sugar on Me
Europe|The Final Countdown
Ozzy Osbourne|Crazy Train
Judas Priest|Breaking the Law
Motorhead|Ace of Spades
Red Hot Chili Peppers|Under the Bridge
Pearl Jam|Alive
Soundgarden|Black Hole Sun
U2|With or Without You
Foreigner|I Want to Know What Love Is
Mr. Big|To Be with You
Extreme|More Than Words
Skid Row|I Remember You
Whitesnake|Here I Go Again
Bryan Adams|Summer of '69
Toto|Africa
Survivor|Eye of the Tiger
Steppenwolf|Born to Be Wild
ZZ Top|La Grange
Alice Cooper|Poison
Heart|Barracuda
Joan Jett & the Blackhearts|I Love Rock 'n' Roll
David Bowie|Heroes
God Bless|Rumah Kita
Slank|Kamu Harus Pulang
Dewa 19|Kangen
Gigi|Nakal
Jamrud|Pelangi di Matamu
Padi|Begitu Indah""".splitlines()

VIRAL_SONGS = """The Killers|Mr. Brightside
Arctic Monkeys|I Wanna Be Yours
Arctic Monkeys|Do I Wanna Know?
Paramore|Misery Business
Paramore|Still into You
Coldplay|Yellow
Coldplay|Viva La Vida
Imagine Dragons|Believer
Imagine Dragons|Demons
The Neighbourhood|Sweater Weather
Maneskin|Beggin'
Maneskin|I Wanna Be Your Slave
Olivia Rodrigo|good 4 u
Olivia Rodrigo|vampire
GAYLE|abcdefu
Fleetwood Mac|Dreams
Kate Bush|Running Up That Hill (A Deal with God)
Linkin Park|In the End
Linkin Park|The Emptiness Machine
Green Day|Boulevard of Broken Dreams
Fall Out Boy|Sugar, We're Goin Down
My Chemical Romance|Welcome to the Black Parade
Avril Lavigne|Complicated
Avril Lavigne|Sk8er Boi
Evanescence|Bring Me to Life
Goo Goo Dolls|Iris
Train|Drops of Jupiter
Plain White T's|Hey There Delilah
Neon Trees|Everybody Talks
Walk the Moon|Shut Up and Dance
OneRepublic|Counting Stars
OneRepublic|Apologize
The Script|Hall of Fame
Maroon 5|She Will Be Loved
Tame Impala|The Less I Know the Better
Glass Animals|Heat Waves
Foster the People|Pumped Up Kicks
Kings of Leon|Sex on Fire
The White Stripes|Seven Nation Army
Blink-182|All the Small Things
Bastille|Pompeii
Of Monsters and Men|Little Talks
Hozier|Take Me to Church
Hozier|Too Sweet
Alex Warren|Ordinary
Noah Kahan|Stick Season
Sombr|back to friends
The Cranberries|Zombie
Oasis|Wonderwall
Radiohead|Creep
Sheila on 7|Dan...
Sheila on 7|Sephia
NOAH|Separuh Aku
Peterpan|Mungkin Nanti
Armada|Awas Jatuh Cinta
D'Masiv|Cinta Ini Membunuhku""".splitlines()

BEST_SONGS = """Queen|Bohemian Rhapsody
Led Zeppelin|Stairway to Heaven
Nirvana|Smells Like Teen Spirit
Guns N' Roses|Sweet Child O' Mine
Eagles|Hotel California
Deep Purple|Child in Time
The Rolling Stones|(I Can't Get No) Satisfaction
AC/DC|Back in Black
Pink Floyd|Comfortably Numb
Metallica|Nothing Else Matters
The Beatles|Hey Jude
Lynyrd Skynyrd|Free Bird
Jimi Hendrix|Purple Haze
The Who|Won't Get Fooled Again
Black Sabbath|Iron Man
Bruce Springsteen|Born to Run
Bob Dylan|Like a Rolling Stone
Led Zeppelin|Whole Lotta Love
Queen|We Will Rock You
Pink Floyd|Another Brick in the Wall, Pt. 2
The Clash|London Calling
Dire Straits|Money for Nothing
Fleetwood Mac|The Chain
Aerosmith|Walk This Way
Guns N' Roses|Welcome to the Jungle
AC/DC|Highway to Hell
The Police|Every Breath You Take
U2|One
R.E.M.|Losing My Religion
Metallica|Master of Puppets
The Kinks|You Really Got Me
Cream|Sunshine of Your Love
Derek & The Dominos|Layla
The Doors|Riders on the Storm
Creedence Clearwater Revival|Have You Ever Seen the Rain
Blue Oyster Cult|(Don't Fear) The Reaper
Bon Jovi|It's My Life
Scorpions|Wind of Change
Kansas|Carry on Wayward Son
Foo Fighters|Everlong
Pearl Jam|Black
Red Hot Chili Peppers|Californication
Rage Against the Machine|Killing in the Name
Radiohead|Paranoid Android
Oasis|Don't Look Back in Anger
Green Day|American Idiot
System of a Down|Chop Suey!
Linkin Park|Numb
Audioslave|Like a Stone
The Beatles|Come Together""".splitlines()

LEGEND_ALBUMS = """Led Zeppelin|Led Zeppelin IV
Queen|News of the World
AC/DC|Highway to Hell
The Rolling Stones|Sticky Fingers
Deep Purple|Machine Head
Black Sabbath|Paranoid
Aerosmith|Toys in the Attic
Van Halen|1984
The Who|Who's Next
Jimi Hendrix|Are You Experienced
Scorpions|Love at First Sting
Bon Jovi|Slippery When Wet
Iron Maiden|The Number of the Beast
Rush|Moving Pictures
Dire Straits|Brothers in Arms
Def Leppard|Hysteria
Kiss|Destroyer
Journey|Escape
Santana|Abraxas
Lynyrd Skynyrd|(Pronounced 'Leh-'Nerd 'Skin-'Nerd)
Creedence Clearwater Revival|Cosmo's Factory
The Doors|The Doors
Boston|Boston
Europe|The Final Countdown
Slank|Generasi Biru
Dewa 19|Bintang Lima""".splitlines()

VIRAL_ALBUMS = """Arctic Monkeys|AM
The Killers|Hot Fuss
Paramore|Riot!
Coldplay|Parachutes
Coldplay|Viva La Vida or Death and All His Friends
Imagine Dragons|Night Visions
Imagine Dragons|Evolve
Linkin Park|Hybrid Theory
Linkin Park|Meteora
Linkin Park|From Zero
Green Day|American Idiot
Fall Out Boy|From Under the Cork Tree
My Chemical Romance|The Black Parade
Avril Lavigne|Let Go
Evanescence|Fallen
Blink-182|Enema of the State
Olivia Rodrigo|SOUR
Olivia Rodrigo|GUTS
Maneskin|Teatro d'ira - Vol. I
Tame Impala|Currents
The Neighbourhood|I Love You.
Kings of Leon|Only by the Night
OneRepublic|Dreaming Out Loud
Sheila on 7|Kisah Klasik Untuk Masa Depan
Peterpan|Bintang di Surga""".splitlines()

BEST_ALBUMS = """Pink Floyd|The Dark Side of the Moon
Nirvana|Nevermind
AC/DC|Back in Black
Guns N' Roses|Appetite for Destruction
Queen|A Night at the Opera
The Beatles|Abbey Road
Pink Floyd|The Wall
Fleetwood Mac|Rumours
Metallica|Metallica
Eagles|Hotel California
Led Zeppelin|Physical Graffiti
The Beatles|Sgt. Pepper's Lonely Hearts Club Band
The Rolling Stones|Let It Bleed
Bruce Springsteen|Born to Run
The Clash|London Calling
U2|The Joshua Tree
Radiohead|OK Computer
Pearl Jam|Ten
Metallica|Master of Puppets
Red Hot Chili Peppers|Blood Sugar Sex Magik
Oasis|(What's the Story) Morning Glory?
The Doors|L.A. Woman
David Bowie|The Rise and Fall of Ziggy Stardust and the Spiders from Mars
Rage Against the Machine|Rage Against the Machine
Foo Fighters|The Colour and the Shape""".splitlines()

CATS = [
    ('legend', 'Rock Legend', 'Lagu dan album band rock yang melegenda, dari Queen sampai God Bless', LEGEND_SONGS, LEGEND_ALBUMS),
    ('viral', 'Pop Rock Viral', 'Pop rock yang ramai diputar dan viral di media sosial', VIRAL_SONGS, VIRAL_ALBUMS),
    ('terbaik', 'Rock Terbaik Sepanjang Masa', 'Lagu dan album rock terbaik dari semua era', BEST_SONGS, BEST_ALBUMS),
]

# search picks a re-recording, a reissue with bonus discs or a compilation for these: use this exact release
PIN_SONG = {
    'Scorpions|Still Loving You': ('Scorpions Still Loving You Love at First Sting', 'vJrYN-_BXws'),
    'Dewa 19|Kangen': ('Dewa 19 Kangen', 'utgn0LCDirk'),
    "The Rolling Stones|(I Can't Get No) Satisfaction": ('Rolling Stones Satisfaction Out of Our Heads', 'eUpb-ALfUzc'),
}
PIN_ALBUM = {
    'The Beatles|Abbey Road': ('The Beatles Abbey Road', 'MPREb_LQwx7Jq6u9H'),
    "Oasis|(What's the Story) Morning Glory?": ('Oasis Morning Glory', 'MPREb_a4ykLfcnJZV'),
}

BAD = re.compile(r'\b(karaoke|cover|tribute|instrumental|acoustic|live|remix|re-?recorded|sped up|slowed|piano|8-bit|lullaby|demo|mix)\b', re.I)

def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    s = s.replace('&', ' and ').replace("'", '').replace('’', '')
    s = re.sub(r'\(.*?\)|\[.*?\]', ' ', s) if re.sub(r'\(.*?\)|\[.*?\]', ' ', s).strip() else s
    s = re.sub(r'\s[-–]\s.*(remaster|version|edition|mix|deluxe|anniversary).*$', '', s)
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

def get(params):
    q = urllib.parse.urlencode(dict(v='3', **params))
    for attempt in range(4):
        try:
            d = json.load(urllib.request.urlopen(E + q, timeout=40))
            if not d.get('error'):
                return d
        except Exception:
            pass
        time.sleep(1 + attempt * 2)
    return None

def artist_ok(want, got):
    w = norm(want)
    return any(norm(a.get('name')) == w or w in norm(a.get('name')) or norm(a.get('name')) in w for a in got if a.get('name'))

def song(line):
    artist, title = line.split('|', 1)
    pin = PIN_SONG.get(line)
    d = get({'a': 'search', 't': 'songs', 'q': pin[0] if pin else f'{artist} {title}'})
    if not d:
        return line, None
    if pin:
        it = next((i for i in d.get('items', []) if i.get('id') == pin[1]), None)
        return line, it and {k: it[k] for k in ('type', 'id', 'title', 'artists', 'album', 'sec', 'thumb') if it.get(k)}
    want = norm(title)
    cands = []
    for it in d.get('items', []):
        if it.get('type') != 'song' or not artist_ok(artist, it.get('artists') or []):
            continue
        if norm(it.get('title')) != want:
            continue
        raw = it.get('title', '')
        penal = 1 if BAD.search(raw) else 0
        alb = (it.get('album') or {}).get('name', '')
        penal += 1 if BAD.search(alb) else 0
        cands.append((penal, it))
    if not cands:
        return line, None
    cands.sort(key=lambda x: x[0])
    it = cands[0][1]
    return line, {k: it[k] for k in ('type', 'id', 'title', 'artists', 'album', 'sec', 'thumb') if it.get(k)}

def album(line):
    artist, title = line.split('|', 1)
    pin = PIN_ALBUM.get(line)
    d = get({'a': 'search', 't': 'albums', 'q': pin[0] if pin else f'{artist} {title}'})
    if not d:
        return line, None
    want = norm(title)
    cands = []
    for it in d.get('items', []):
        if it.get('type') != 'album' or not artist_ok(artist, it.get('artists') or []):
            continue
        if norm(it.get('title')) != want and want not in norm(it.get('title')):
            continue
        raw = it.get('title', '')
        info = it.get('info', '')
        m = re.search(r'(19|20)\d\d', info)
        cands.append((norm(raw) != want, 1 if BAD.search(raw) else 0, 0 if info.startswith('Album') else 1, int(m.group()) if m else 9999, it))
    if not cands:
        return line, None
    cands.sort(key=lambda x: x[:4])
    it = next((c[-1] for c in cands if pin and c[-1]['id'] == pin[1]), cands[0][-1])
    b = get({'a': 'browse', 'id': it['id']})
    n = len((b.get('sections') or [{}])[0].get('items') or []) if b else 0
    if not n:
        return line, None
    m = re.search(r'(19|20)\d\d', it.get('info', ''))
    return line, {'type': 'album', 'id': it['id'], 'title': it['title'], 'artists': it.get('artists') or [], 'thumb': it.get('thumb', ''), 'info': 'Album' + (' • ' + m.group() if m else ''), 'n': n}

out, missing = [], []
with ThreadPoolExecutor(4) as ex:
    for key, title, sub, songs, albums in CATS:
        ss, aa = [], []
        for line, it in ex.map(song, songs):
            if it: ss.append(it)
            else: missing.append(f'{key} song {line}')
        for line, it in ex.map(album, albums):
            if it: aa.append(it)
            else: missing.append(f'{key} album {line}')
        out.append({'key': key, 'title': title, 'sub': sub, 'songs': ss, 'albums': aa})
        print(key, len(ss), '/', len(songs), 'songs', len(aa), '/', len(albums), 'albums', file=sys.stderr)

with open(OUT, 'w') as f:
    f.write('// generated by tools/gen-rock.py — curated rock songs + albums\nwindow.ROCK = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('\n'.join(missing) or 'all resolved', file=sys.stderr)
