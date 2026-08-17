# Preparing precinct population data

This guide prepares the population data. It does **not** import anything into Supabase.

## The working file

Use `data/templates/precinct_population_workbook.csv`. It contains all 349 precinct codes and the registered-voter totals already in Supabase.

Make a copy before editing. Keep the original template unchanged.

The columns are:

1. `precinct_ward` — the matching code already used by Supabase, such as `1-1` or `4-17A`.
2. `registered_voters` — a reference value already in Supabase. Do not change it while adding population data.
3. `adult_population` — the verified Census voting-age population to add.

Do not upload this workbook directly into the live `precincts` table. It should be validated and imported through a temporary staging table so a mistake cannot overwrite the live registration data.

## How to fill it in

1. Open a copy in Excel, Numbers, Google Sheets, or LibreOffice.
2. Leave the first row and first two columns unchanged.
3. Match each Census result to `precinct_ward`.
4. Enter the verified voting-age population in `adult_population`.
5. Use whole numbers without commas—for example, use `1250`, not `1,250`.
6. Do not leave blanks, type words, or paste formulas into the final file.
7. Export the completed sheet as CSV.

## Source information to save separately

Write down:

- The official name of the Census file
- Its year
- The download address
- The day you downloaded it
- Whether it measures voting-age population (18+) or total population
- The boundary or equivalency-file version used to assign blocks to precincts
- Any precincts that required manual correction

Never substitute total population for voting-age population.

## Validate before importing

Put the completed CSV in the workspace, then run:

```bash
node tools/validate-population-workbook.js path/to/your-completed-file.csv
```

The checker requires:

- Exactly 349 precincts
- Exactly one row per precinct
- Valid precinct codes
- Positive whole-number population values
- No registration rate above 100%

`ERROR` means the file is incomplete or malformed. `REVIEW` means the numbers create an implausible rate and must be investigated. Do not import until the final line says `Ready for staged import`.

## What happens after validation

1. Back up the live `precincts` table.
2. Import the CSV into a temporary staging table—not the live table.
3. Compare staging codes against all 349 live codes.
4. Confirm the parish population total against the official source.
5. Update only `adult_population` by matching `precinct_ward`.
6. Calculate `registration_rate = registered_voters / adult_population`.
7. Run database checks for missing, duplicate, negative, and above-100% values.
8. Review the public dashboard before publishing the data as verified.

Ask for help with the staged import after the completed CSV passes validation.
