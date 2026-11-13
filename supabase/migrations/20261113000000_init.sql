-- Affiliate Hub: initial schema.
-- Every table has row level security: a signed-in user only sees their own rows.
-- The public bio page reads data through the get_bio() function only.

create extension if not exists pgcrypto;

create type public.platform as enum ('shopee', 'lazada', 'tiki', 'tiktok');
create type public.channel as enum ('tiktok', 'facebook', 'instagram', 'zalo', 'youtube', 'bio', 'other');
create type public.conversion_status as enum ('pending', 'approved', 'rejected');

-- Random slug from an alphabet without look-alike characters (same as src/lib/links.ts).
create or replace function public.random_slug(len int default 7)
returns text language sql volatile as $$
  select string_agg(substr('abcdefghijkmnpqrstuvwxyz23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, len);
$$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text unique check (handle ~ '^[a-z0-9_.-]{3,30}$'),
  display_name text,
  bio text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name) values (new.id, split_part(new.email, '@', 1));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform public.platform not null,
  title text not null check (length(title) between 1 and 300),
  image_url text,
  original_url text not null,
  affiliate_url text not null check (affiliate_url ~* '^https?://'),
  current_price numeric(14, 2),
  target_price numeric(14, 2),
  commission_rate numeric(5, 2), -- percent
  is_public boolean not null default true,
  is_deal boolean not null default false,
  price_updated_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index products_user_idx on public.products (user_id, sort_order, created_at desc);

-- ---------------------------------------------------------------- links
create table public.links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  slug text not null unique default public.random_slug(),
  channel public.channel not null default 'other',
  created_at timestamptz not null default now(),
  unique (product_id, channel)
);

-- Every product gets a 'bio' link automatically (used by the public bio page).
create or replace function public.create_bio_link()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.links (user_id, product_id, channel) values (new.user_id, new.id, 'bio');
  return new;
end $$;

create trigger on_product_created after insert on public.products
  for each row execute function public.create_bio_link();

-- ---------------------------------------------------------------- clicks
-- Written only by the `go` Edge Function (service role). user_id is copied
-- from the link so RLS stays a simple equality check.
create table public.clicks (
  id bigint generated always as identity primary key,
  link_id uuid not null references public.links (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  channel public.channel not null,
  referrer text,
  user_agent text,
  clicked_at timestamptz not null default now()
);
create index clicks_user_time_idx on public.clicks (user_id, clicked_at desc);

-- ---------------------------------------------------------------- price history
create table public.price_history (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  price numeric(14, 2) not null check (price >= 0),
  source text not null default 'manual', -- manual | shopee_api | accesstrade
  checked_at timestamptz not null default now()
);
create index price_history_product_idx on public.price_history (product_id, checked_at desc);

-- A new price updates the product and flags a deal when the price reaches the
-- target or drops >= 15% below the 30-day average. Single source of truth for
-- both manual updates (app) and automatic ones (price-check function).
create or replace function public.apply_price()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  avg30 numeric;
begin
  select avg(price) into avg30
  from public.price_history
  where product_id = new.product_id
    and id <> new.id
    and checked_at > new.checked_at - interval '30 days';

  update public.products p
  set current_price = new.price,
      price_updated_at = new.checked_at,
      is_deal = (p.target_price is not null and new.price <= p.target_price)
             or (avg30 is not null and new.price <= avg30 * 0.85)
  where p.id = new.product_id;
  return new;
end $$;

create trigger on_price_inserted after insert on public.price_history
  for each row execute function public.apply_price();

-- ---------------------------------------------------------------- conversions
create table public.conversions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform public.platform not null,
  product_id uuid references public.products (id) on delete set null,
  external_order_id text,
  order_date date not null,
  order_amount numeric(14, 2) not null default 0,
  commission numeric(14, 2) not null default 0,
  status public.conversion_status not null default 'pending',
  source text not null default 'manual' check (source in ('manual', 'csv')),
  created_at timestamptz not null default now()
);
-- Re-importing the same report updates rows instead of duplicating them.
create unique index conversions_dedupe_idx
  on public.conversions (user_id, platform, external_order_id);
create index conversions_user_date_idx on public.conversions (user_id, order_date desc);

-- ---------------------------------------------------------------- AI usage
create table public.ai_generations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  channel public.channel not null,
  output jsonb not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now()
);
create index ai_generations_user_time_idx on public.ai_generations (user_id, created_at desc);

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.links enable row level security;
alter table public.clicks enable row level security;
alter table public.price_history enable row level security;
alter table public.conversions enable row level security;
alter table public.ai_generations enable row level security;

create policy "own profile" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "own products" on public.products for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own links" on public.links for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.products p where p.id = product_id and p.user_id = (select auth.uid())));
create policy "read own clicks" on public.clicks for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own price history" on public.price_history for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.products p where p.id = product_id and p.user_id = (select auth.uid())));
create policy "own conversions" on public.conversions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "read own ai generations" on public.ai_generations for select to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.profiles, public.products, public.links,
  public.price_history, public.conversions to authenticated;
grant select on public.clicks, public.ai_generations to authenticated;

-- ---------------------------------------------------------------- views
-- Clicks per Vietnam calendar day; security_invoker keeps the callers' RLS.
create view public.daily_clicks with (security_invoker = true) as
select
  (c.clicked_at at time zone 'Asia/Ho_Chi_Minh')::date::text as day,
  l.product_id,
  p.platform,
  c.channel,
  count(*)::int as clicks
from public.clicks c
join public.links l on l.id = c.link_id
join public.products p on p.id = l.product_id
group by 1, 2, 3, 4;

grant select on public.daily_clicks to authenticated;

-- ---------------------------------------------------------------- public bio page
create or replace function public.get_bio(p_handle text)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'handle', pr.handle,
    'display_name', pr.display_name,
    'bio', pr.bio,
    'avatar_url', pr.avatar_url,
    'products', coalesce((
      select json_agg(json_build_object(
        'id', p.id,
        'title', p.title,
        'platform', p.platform,
        'image_url', p.image_url,
        'current_price', p.current_price,
        'is_deal', p.is_deal,
        'slug', l.slug
      ) order by p.is_deal desc, p.sort_order, p.created_at desc)
      from public.products p
      join public.links l on l.product_id = p.id and l.channel = 'bio'
      where p.user_id = pr.id and p.is_public
    ), '[]'::json)
  )
  from public.profiles pr
  where pr.handle = lower(p_handle);
$$;

grant execute on function public.get_bio(text) to anon, authenticated;
