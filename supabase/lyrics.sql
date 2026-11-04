-- Lyrics written from a song's audio: shared by every device, so they stay available with the MacBook off.
-- First write wins; reading needs no session (the lines are not private), writing needs a portal session.
begin;
create table if not exists public.amt_lyrics (
  id text primary key,
  lang text,
  lines jsonb not null,
  by text,
  t timestamptz not null default now()
);
alter table public.amt_lyrics enable row level security;
revoke all on public.amt_lyrics from public, anon, authenticated;

create or replace function public.amt_lyrics_get(p_id text)
returns jsonb language sql security definer set search_path = public, extensions as $$
  select jsonb_build_object('lines', lines, 'lang', lang, 'by', by) from amt_lyrics where id = p_id
$$;

create or replace function public.amt_lyrics_set(p_token text, p_id text, p_lines jsonb, p_lang text, p_by text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform amt_sess(p_token, false);
  if p_id !~ '^[A-Za-z0-9_-]{11}$' or jsonb_typeof(p_lines) <> 'array' or pg_column_size(p_lines) > 65536 then
    return jsonb_build_object('error', 'data');
  end if;
  insert into amt_lyrics (id, lang, lines, by) values (p_id, left(p_lang, 8), p_lines, left(p_by, 16))
  on conflict (id) do nothing;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.amt_lyrics_get(text), public.amt_lyrics_set(text, text, jsonb, text, text) from public;
grant execute on function public.amt_lyrics_get(text), public.amt_lyrics_set(text, text, jsonb, text, text) to anon, authenticated;
commit;
