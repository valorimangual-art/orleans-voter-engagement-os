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

## Data and privacy

The public page reads a limited set of precinct statistics from the Supabase `precincts` table. It does not query the `volunteers` table or download volunteer names, contact details, addresses, locations, or notes.

The Supabase publishable key is allowed in browser code. Security must still be enforced in Supabase with Row Level Security (RLS). Anonymous users should have read-only access to approved public statistics and no row-level access to private volunteer records.

Population rates above 100% are treated as invalid and excluded from the public priority list until the geographic crosswalk is verified.

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
