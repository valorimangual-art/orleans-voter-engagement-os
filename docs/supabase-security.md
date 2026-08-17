# Supabase public access

Last reviewed: 2026-08-17

## Intended access

The public website uses the Supabase publishable key. Anonymous visitors have:

- `SELECT` access to `public.precincts`
- `SELECT` access to `public.polling_locations`
- No table privileges on `public.volunteers`
- No insert, update, delete, or truncate privileges on public tables

Both public tables have Row Level Security enabled and explicit read policies for the `anon` and `authenticated` roles. The authenticated role is included so an old browser session does not prevent the otherwise-public dashboard from loading.

## Sensitive data

The `public.volunteers` table contains names, email addresses, phone numbers, street addresses, geographic assignments, and administrative notes. The public website must never query this table directly.

## Verified behavior

On 2026-08-17:

- An anonymous precinct request returned HTTP 200.
- An anonymous polling-location request returned HTTP 200.
- An anonymous volunteer request returned HTTP 401.
- The public `is_admin()` security-definer function was not executable by anonymous or authenticated users.

## Remaining database work

- All 349 precinct rows have a registered-voter count.
- All 349 precinct rows currently lack `adult_population`.
- Registration rates therefore cannot be calculated or published yet.
- Leaked-password protection remains disabled in Supabase Auth. Auth is not used by the current public site, but it should be enabled before authentication is used again.
