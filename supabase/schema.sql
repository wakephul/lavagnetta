-- lavagnetta: schema del database (Supabase / PostgreSQL).
-- Nessuna tabella è leggibile direttamente dal sito: tutto passa da funzioni
-- che controllano la sessione. Si può rieseguire senza perdere dati.

create extension if not exists pgcrypto with schema extensions;

create table if not exists team (
  id int primary key default 1 check (id = 1),
  name text not null default 'La mia squadra' check (char_length(name) between 1 and 60),
  color text not null default '#1d5fbf' check (color ~ '^#[0-9a-fA-F]{6}$'),
  view_hash text,
  edit_hash text
);
insert into team (id) values (1) on conflict do nothing;
-- Secondo colore della squadra: area dipinta e chi sei.
alter table team add column if not exists color2 text not null default '#e8601c' check (color2 ~ '^#[0-9a-fA-F]{6}$');

create table if not exists sessions (
  token uuid primary key default gen_random_uuid(),
  role text not null check (role in ('view', 'edit')),
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists login_failures (
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists login_failures_ip_at on login_failures (ip, at);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  number smallint check (number between 0 and 99),
  role smallint check (role between 1 and 5),
  height smallint check (height between 100 and 230),
  created_at timestamptz not null default now()
);

create table if not exists plays (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  data jsonb not null check (pg_column_size(data) < 300000),
  share_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table team enable row level security;
alter table sessions enable row level security;
alter table login_failures enable row level security;
alter table players enable row level security;
alter table plays enable row level security;
revoke all on team, sessions, login_failures, players, plays from anon, authenticated;

-- Ruolo della sessione, oppure errore.
create or replace function session_role(p_token uuid) returns text
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  -- Prima il controllo, poi l'aggiornamento: una sessione scaduta non deve tornare valida.
  select role into r from sessions where token = p_token and last_seen > now() - interval '180 days';
  if r is null then
    raise exception 'Sessione scaduta, rientra con la password' using errcode = 'P0001', hint = 'session';
  end if;
  update sessions set last_seen = now()
   where token = p_token and last_seen < now() - interval '1 hour';
  return r;
end $$;

create or replace function require_edit(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if session_role(p_token) <> 'edit' then
    raise exception 'Serve la password dell''allenatore' using errcode = 'P0001';
  end if;
end $$;

revoke execute on function session_role(uuid) from public, anon, authenticated;
revoke execute on function require_edit(uuid) from public, anon, authenticated;

create or replace function login(p_password text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  t team;
  h json := current_setting('request.headers', true)::json;
  -- cf-connecting-ip lo scrive Cloudflare e il client non può falsificarlo;
  -- di x-forwarded-for vale solo l'ultimo indirizzo, aggiunto dal proxy.
  v_ip text := coalesce(h ->> 'cf-connecting-ip', trim(reverse(split_part(reverse(h ->> 'x-forwarded-for'), ',', 1))), 'sconosciuto');
  r text;
  tok uuid;
begin
  delete from login_failures where at < now() - interval '1 day';
  delete from sessions where last_seen < now() - interval '180 days';
  -- Le richieste dallo stesso indirizzo passano una alla volta, così una raffica non supera il limite.
  perform pg_advisory_xact_lock(hashtext(v_ip));
  -- Limite per indirizzo. Niente tetto globale: basterebbe sbagliare apposta per chiudere fuori tutta la squadra.
  if (select count(*) from login_failures f where f.ip = v_ip and f.at > now() - interval '15 minutes') >= 10 then
    raise exception 'Troppi tentativi. Riprova tra qualche minuto.' using errcode = 'P0001';
  end if;
  select * into t from team where id = 1;
  if t.edit_hash is not null and crypt(p_password, t.edit_hash) = t.edit_hash then r := 'edit';
  elsif t.view_hash is not null and crypt(p_password, t.view_hash) = t.view_hash then r := 'view';
  end if;
  if r is null then
    -- Niente eccezione qui: annullerebbe anche la riga del tentativo fallito.
    insert into login_failures (ip) values (v_ip);
    return json_build_object('error', 'Password sbagliata');
  end if;
  insert into sessions (role) values (r) returning token into tok;
  return json_build_object('token', tok, 'role', r);
end $$;

create or replace function logout(p_token uuid) returns void
language sql security definer set search_path = public as $$
  delete from sessions where token = p_token;
$$;

-- Tutto quello che serve all'app in una chiamata: squadra, giocatori, schemi.
create or replace function team_data(p_token uuid) returns json
language plpgsql security definer set search_path = public as $$
declare r text := session_role(p_token);
begin
  return json_build_object(
    'role', r,
    'team', (select json_build_object('name', name, 'color', color, 'color2', color2) from team where id = 1),
    'players', coalesce((select json_agg(json_build_object('id', id, 'name', name, 'number', number, 'role', role, 'height', height)
                           order by number nulls last, name) from players), '[]'::json),
    'plays', coalesce((select json_agg(json_build_object('id', id, 'name', name, 'updated_at', updated_at, 'data', data,
                           'share_token', share_token) order by name) from plays), '[]'::json)
  );
end $$;

-- Salva uno schema. Se un altro dispositivo l'ha cambiato nel frattempo, si ferma.
create or replace function save_play(p_token uuid, p_id uuid, p_name text, p_data jsonb, p_expected timestamptz)
returns json language plpgsql security definer set search_path = public as $$
declare row plays;
begin
  perform require_edit(p_token);
  if p_id is null then
    insert into plays (name, data) values (p_name, p_data) returning * into row;
  else
    update plays set name = p_name, data = p_data, updated_at = now()
     where id = p_id and (p_expected is null or updated_at = p_expected)
    returning * into row;
    if row.id is null then
      if exists (select 1 from plays where id = p_id) then
        raise exception 'Lo schema è stato modificato da un altro dispositivo' using errcode = 'P0001', hint = 'conflict';
      end if;
      raise exception 'Lo schema non esiste più' using errcode = 'P0001';
    end if;
  end if;
  return json_build_object('id', row.id, 'updated_at', row.updated_at, 'share_token', row.share_token);
end $$;

create or replace function delete_play(p_token uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_edit(p_token);
  delete from plays where id = p_id;
end $$;

-- Nuovo link di condivisione: quello vecchio smette di funzionare.
create or replace function new_share_link(p_token uuid, p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare s uuid;
begin
  perform require_edit(p_token);
  update plays set share_token = gen_random_uuid() where id = p_id returning share_token into s;
  return s;
end $$;

-- Lettura pubblica di un singolo schema tramite link.
create or replace function shared_play(p_share uuid) returns json
language sql security definer set search_path = public as $$
  select json_build_object('name', p.name, 'data', p.data, 'updated_at', p.updated_at,
                           'team', json_build_object('name', t.name, 'color', t.color, 'color2', t.color2))
    from plays p, team t where p.share_token = p_share and t.id = 1;
$$;

create or replace function save_player(p_token uuid, p_id uuid, p_name text, p_number int, p_role int, p_height int)
returns json language plpgsql security definer set search_path = public as $$
declare row players;
begin
  perform require_edit(p_token);
  if p_id is null then
    insert into players (name, number, role, height) values (trim(p_name), p_number, p_role, p_height) returning * into row;
  else
    update players set name = trim(p_name), number = p_number, role = p_role, height = p_height where id = p_id returning * into row;
  end if;
  return json_build_object('id', row.id, 'name', row.name, 'number', row.number, 'role', row.role, 'height', row.height);
end $$;

create or replace function delete_player(p_token uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_edit(p_token);
  delete from players where id = p_id;
end $$;

drop function if exists set_team(uuid, text, text);
create or replace function set_team(p_token uuid, p_name text, p_color text, p_color2 text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_edit(p_token);
  update team set name = trim(p_name), color = p_color, color2 = p_color2 where id = 1;
end $$;

-- Cambia una delle due password e chiude le sessioni aperte con quella vecchia.
create or replace function set_password(p_token uuid, p_kind text, p_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform require_edit(p_token);
  if char_length(p_password) < 8 then
    raise exception 'La password deve avere almeno 8 caratteri' using errcode = 'P0001';
  end if;
  -- Se fossero uguali, chi entra con la password della squadra entrerebbe come allenatore.
  if exists (select 1 from team where id = 1 and crypt(p_password, case p_kind when 'view' then edit_hash else view_hash end)
             = case p_kind when 'view' then edit_hash else view_hash end) then
    raise exception 'Deve essere diversa dall''altra password' using errcode = 'P0001';
  end if;
  if p_kind = 'view' then
    update team set view_hash = crypt(p_password, gen_salt('bf')) where id = 1;
    delete from sessions where role = 'view';
  elsif p_kind = 'edit' then
    update team set edit_hash = crypt(p_password, gen_salt('bf')) where id = 1;
    delete from sessions where role = 'edit' and token <> p_token;
  else
    raise exception 'Tipo di password sconosciuto' using errcode = 'P0001';
  end if;
end $$;

-- Usata dal controllo periodico che tiene sveglio il progetto gratuito.
create or replace function ping() returns int language sql as $$ select 1 $$;

grant execute on function login(text), logout(uuid), team_data(uuid), save_play(uuid, uuid, text, jsonb, timestamptz),
  delete_play(uuid, uuid), new_share_link(uuid, uuid), shared_play(uuid),
  save_player(uuid, uuid, text, int, int, int), delete_player(uuid, uuid), set_team(uuid, text, text, text),
  set_password(uuid, text, text), ping() to anon;
