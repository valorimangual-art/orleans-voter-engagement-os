#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join('data', 'templates', 'precinct_population_workbook.csv');
const text = fs.readFileSync(file, 'utf8').trim();
const lines = text.split(/\r?\n/);
const expectedHeader = 'precinct_ward,registered_voters,adult_population';
const errors = [];
const warnings = [];
const seen = new Set();

if (lines[0] !== expectedHeader) errors.push(`The first row must be exactly: ${expectedHeader}`);

const rows = lines.slice(1);
if (rows.length !== 349) errors.push(`Expected 349 precinct rows but found ${rows.length}.`);

rows.forEach((line, index) => {
  const rowNumber = index + 2;
  const cells = line.split(',');
  if (cells.length !== 3) {
    errors.push(`Row ${rowNumber} must have exactly three columns.`);
    return;
  }

  const [precinctCode, registeredText, populationText] = cells.map(value => value.trim());
  if (!/^(?:[1-9]|1\d)-\d+[A-Z]?$/.test(precinctCode)) errors.push(`Row ${rowNumber} has an invalid precinct code: ${precinctCode || '(blank)'}.`);
  if (seen.has(precinctCode)) errors.push(`Row ${rowNumber} duplicates precinct ${precinctCode}.`);
  seen.add(precinctCode);

  const registered = Number(registeredText);
  const population = Number(populationText);
  if (!Number.isInteger(registered) || registered < 0) errors.push(`Row ${rowNumber} has an invalid registered-voter count.`);
  if (!Number.isInteger(population) || population <= 0) errors.push(`Row ${rowNumber} needs a positive whole-number adult population.`);
  if (Number.isInteger(registered) && Number.isInteger(population) && population > 0 && registered > population) {
    warnings.push(`Row ${rowNumber} (${precinctCode}) would have a registration rate above 100%.`);
  }
});

console.log(`Checked ${rows.length} precinct rows in ${file}.`);
errors.forEach(message => console.error(`ERROR: ${message}`));
warnings.forEach(message => console.warn(`REVIEW: ${message}`));

if (errors.length || warnings.length) {
  console.error(`Not ready to import: ${errors.length} error(s), ${warnings.length} item(s) needing review.`);
  process.exitCode = 1;
} else {
  console.log('Ready for staged import: every required check passed.');
}
