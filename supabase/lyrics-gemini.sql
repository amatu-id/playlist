-- Lyrics written from audio in the cloud (edge fn amatu-lirik → Gemini). A song is only ever written once; the key is
-- shared with other apps, so a claim also takes a per-user and an overall daily allowance.
begin;
create table if not exists public.amt_lyrics_job (id text primary key, at timestamptz not null default now());
create table if not exists public.amt_lyrics_use (day date not null, username text not null, n int not null default 0, primary key (day, username));
alter table public.amt_lyrics_job enable row level security;
alter table public.amt_lyrics_use enable row level security;
revoke all on public.amt_lyrics_job, public.amt_lyrics_use from public, anon, authenticated;

create or replace function public.amt_lyrics_claim(p_token text, p_id text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u text; c jsonb; d date := (now() at time zone 'Asia/Jakarta')::date;
begin
  u := amt_sess(p_token, false);
  if p_id !~ '^[A-Za-z0-9_-]{11}$' then return jsonb_build_object('error', 'data'); end if;
  c := amt_lyrics_get(p_id);
  if c is not null then return c; end if;
  perform pg_advisory_xact_lock(hashtext('amt_lyrics_claim'));
  if exists (select 1 from amt_lyrics_job where id = p_id and at > now() - interval '3 minutes') then
    return jsonb_build_object('busy', true);
  end if;
  if coalesce((select sum(n) from amt_lyrics_use where day = d), 0) >= 200
     or coalesce((select n from amt_lyrics_use where day = d and username = u), 0) >= 60 then
    return jsonb_build_object('error', 'limit');
  end if;
  insert into amt_lyrics_use (day, username, n) values (d, u, 1)
  on conflict (day, username) do update set n = amt_lyrics_use.n + 1;
  insert into amt_lyrics_job (id) values (p_id) on conflict (id) do update set at = now();
  delete from amt_lyrics_job where at < now() - interval '1 day';
  return jsonb_build_object('ok', true);
end $$;

-- a failed attempt gives the song and the allowance back
create or replace function public.amt_lyrics_release(p_token text, p_id text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u text;
begin
  u := amt_sess(p_token, false);
  delete from amt_lyrics_job where id = p_id;
  if found then
    update amt_lyrics_use set n = greatest(n - 1, 0) where day = (now() at time zone 'Asia/Jakarta')::date and username = u;
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.amt_lyrics_claim(text, text), public.amt_lyrics_release(text, text) from public;
grant execute on function public.amt_lyrics_claim(text, text), public.amt_lyrics_release(text, text) to anon, authenticated;
commit;
