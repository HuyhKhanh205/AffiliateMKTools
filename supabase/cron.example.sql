-- Daily price check. Run once in the Supabase SQL Editor AFTER deploying the
-- price-check function. Replace <PROJECT_REF> and <CRON_SECRET> (the same value
-- you set with `supabase secrets set CRON_SECRET=...`).
-- Not a migration on purpose: it contains your project URL and a secret.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('<CRON_SECRET>', 'price_check_cron_secret');

select cron.schedule(
  'daily-price-check',
  '0 1 * * *', -- 01:00 UTC = 08:00 Vietnam time
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/price-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'price_check_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- To stop it:  select cron.unschedule('daily-price-check');
