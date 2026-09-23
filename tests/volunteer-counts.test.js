const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function dashboard(rows, error = null) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', classList: { toggle() {}, add() {} }, addEventListener() {}, replaceChildren() {} });
    return elements.get(id);
  };
  const geojson = { features: ['W01-P01', 'W01-P02'].map(area_code => ({ properties: { area_code } })) };
  const requests = [];
  const context = vm.createContext({
    document: { getElementById: element, querySelectorAll: () => [] },
    window: { matchMedia: () => ({ matches: false }) },
    Option: function () {}, console: { error() {} },
    fetch: async () => ({ ok: true, json: async () => geojson }),
    sb: { from: name => ({ select: async fields => { requests.push({ name, fields }); return { data: rows, error }; } }) }
  });
  const source = fs.readFileSync('Website/outreach.js', 'utf8').replace(/\}\)\(\);\s*$/, 'globalThis.testAPI = { load, updateMapSummary, precinctPopup, state }; })();');
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return { elements, requests, api: context.testAPI };
}

test('counts join precinct codes and render without individual records', async () => {
  const { elements, requests, api } = await dashboard([{ precinct_ward: '1-1', volunteer_count: 3 }, { precinct_ward: '1-2', volunteer_count: 0 }]);
  assert.deepEqual(requests, [{ name: 'precincts', fields: 'precinct_ward,volunteer_count' }]);
  assert.equal(elements.get('volunteer-count').textContent, '3');
  assert.equal(elements.get('summary-volunteers').textContent, '3');
  assert.match(elements.get('precinct-table').innerHTML, /<th>Volunteers<\/th>/);
  assert.match(api.precinctPopup(api.state.precincts[0]), /Volunteers<\/dt><dd>3/);
  api.updateMapSummary([api.state.precincts[1]]);
  assert.equal(elements.get('summary-volunteers').textContent, '0');
  api.updateMapSummary([]);
  assert.equal(elements.get('summary-volunteers').textContent, '0');
});

test('unknown and invalid quantities never appear as zero or partial totals', async () => {
  for (const value of [null, -1, 1.5, '7']) {
    const { elements } = await dashboard([{ precinct_ward: '1-1', volunteer_count: 3 }, { precinct_ward: '1-2', volunteer_count: value }]);
    assert.equal(elements.get('volunteer-count').textContent, '—');
    assert.equal(elements.get('summary-volunteers').textContent, '—');
  }
  const { elements } = await dashboard([]);
  assert.equal(elements.get('volunteer-count').textContent, '—');
});

test('count service failure preserves precinct data and reports unavailable counts', async () => {
  const { elements, api } = await dashboard(null, new Error('Unavailable'));
  assert.equal(api.state.precincts.length, 2);
  assert.equal(elements.get('volunteer-count').textContent, '—');
  assert.match(elements.get('message').textContent, /Volunteer counts could not be loaded/);
});

test('volunteer tab and personal-information placeholder are gone', () => {
  const html = fs.readFileSync('Website/index.html', 'utf8');
  assert.doesNotMatch(html, /data-panel="volunteers"|id="volunteers"|volunteer-table|Volunteer records/);
});
