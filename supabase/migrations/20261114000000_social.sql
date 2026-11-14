-- Affiliate Hub: auto-posting to social networks (Threads, Instagram; TikTok later).

alter type public.channel add value if not exists 'threads';

create type public.social_provider as enum ('threads', 'instagram', 'tiktok');
create type public.post_status as enum ('publishing', 'published', 'failed');

-- Connected accounts: what the app may show (no secrets here).
create table public.social_accounts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider public.social_provider not null,
  account_id text not null,
  username text,
  expires_at timestamptz,
  connected_at timestamptz not null default now(),
  primary key (user_id, provider)
);

-- Access tokens: RLS on and NO policies, so only the service role (Edge Functions) can read them.
create table public.social_tokens (
  user_id uuid not null,
  provider public.social_provider not null,
  access_token text not null,
  expires_at timestamptz,
  refreshed_at timestamptz not null default now(),
  primary key (user_id, provider),
  foreign key (user_id, provider) references public.social_accounts (user_id, provider) on delete cascade
);

-- Publishing history, written by the `publish` function.
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  provider public.social_provider not null,
  text text not null,
  image_url text,
  status public.post_status not null default 'publishing',
  external_id text,
  permalink text,
  error text,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create index posts_user_time_idx on public.posts (user_id, created_at desc);

alter table public.social_accounts enable row level security;
alter table public.social_tokens enable row level security;
alter table public.posts enable row level security;

create policy "read own social accounts" on public.social_accounts for select to authenticated
  using (user_id = (select auth.uid()));
create policy "disconnect own social accounts" on public.social_accounts for delete to authenticated
  using (user_id = (select auth.uid()));
create policy "read own posts" on public.posts for select to authenticated
  using (user_id = (select auth.uid()));

grant select, delete on public.social_accounts to authenticated;
grant select on public.posts to authenticated;
revoke all on public.social_tokens from anon, authenticated;

-- Product photos: public read (Threads/Instagram fetch them by URL);
-- a user may only write inside their own folder "<user_id>/...".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "upload own product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "update own product images" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own product images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
