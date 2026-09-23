# Supabase public access

Last reviewed: 2026-09-23

## Intended access

The public website uses the Supabase publishable key. Anonymous visitors have read access to public precinct statistics and polling locations, and no insert, update, delete, or truncate privileges. Precinct Row Level Security allows public reads.

The website requests only `precinct_ward,volunteer_count` from `public.precincts`. Other map statistics are loaded from the local GeoJSON.

## Quantity-only volunteer tracking

The only volunteer field is `public.precincts.volunteer_count`: a nullable integer with a nonnegative check constraint. NULL means not entered; zero means none. Authorized database editors update this quantity in the Supabase Table Editor. Public visitors cannot edit it.

Migration `replace_volunteer_details_with_precinct_counts` was applied on 2026-09-23. The database had no volunteer-records table. The empty legacy columns `neighborhood.volunteers`, `outreach_events.volunteers_present`, and `field_reports.volunteer_id` were removed. No individual records were downloaded or copied.

## Verification

- All 349 precinct rows remain; counts are initially unknown.
- The only remaining public column with a volunteer-related name is `precincts.volunteer_count`.
- Anonymous visitors can select counts but cannot update them.
- Precinct Row Level Security remains enabled.
- The security advisor reports existing no-policy notices for unrelated restricted tables and disabled leaked-password protection. This public site does not use authentication.
