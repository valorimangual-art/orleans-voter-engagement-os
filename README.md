# Orleans Parish Voter Outreach

A public dashboard for viewing Orleans Parish precinct boundaries and selected voter-outreach statistics.

## Live site

https://valorimangual-art.github.io/orleans-voter-engagement-os/

## Project layout

- `index.html` redirects the GitHub Pages root to the website.
- `Website/index.html` contains the page structure.
- `Website/outreach.css` contains the visual design.
- `Website/outreach.js` loads, validates, and displays public data.
- `Website/precinct_boundaries.geojson` contains 349 precinct map shapes.
- `Website/supabase-config.js` creates the public Supabase client.
- `docs/supabase-security.md` records the intended public database access.
- `docs/population-import-guide.md` explains how to prepare and validate Census population data.
- `data/templates/precinct_population_workbook.csv` is the 349-row population worksheet.
- `tools/validate-population-workbook.js` checks the worksheet before import.

## Data and privacy

The public page loads precinct statistics and boundaries from `Website/precinct_boundaries.geojson`. It reads only `precinct_ward` and `volunteer_count` from Supabase. Volunteer tracking consists of a single quantity per precinct, displayed in the precinct tables, map popups, overview total, and filtered map summary. There is no volunteer tab or individual volunteer information.

The Supabase publishable key is allowed in browser code. Security must still be enforced in Supabase with Row Level Security (RLS). Anonymous users should have read-only access to approved public statistics and no permission to change counts from the public website.

Population rates above 100% are treated as invalid and excluded from the public priority list until the geographic crosswalk is verified.

## Updating volunteer counts

In the Supabase Table Editor, open `precincts`, find the `precinct_ward`, and edit only `volunteer_count`. Enter a nonnegative whole number; use `0` for no volunteers or leave it blank if the quantity is unknown. Refresh the website to see updates. Count each volunteer in one precinct to avoid double counting.

Totals show `—` when any included precinct has an unknown count. Map filters total the matching precincts, including whole precincts that intersect a selected neighborhood. No names, contact information, assignments to individuals, or notes are needed.

## Preview locally

From the repository root, run:

```bash
python3 -m http.server 8000 --directory Website
```

Then open `http://localhost:8000`.

## Publishing updates

GitHub Pages publishes the `main` branch. After reviewing a change:

```bash
git add Website index.html README.md .gitignore
git commit -m "Describe the change"
git push origin main
```

Never commit passwords, database secret keys, private volunteer exports, or raw voter files containing personal information.
