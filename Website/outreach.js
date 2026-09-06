(function () {
  'use strict';

  const state = { precincts: [], geojson: null, locations: [], map: null, layer: null, layers: {}, highlightedLayer: null, highlightedLocation: null, searchResults: [] };
  const mapFilterIds = ['neighborhood-filter', 'council-filter', 'planning-filter', 'congress-district-filter', 'congress-change-filter'];
  const $ = id => document.getElementById(id);
  const num = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);

  const code = item => item?.area_code || item?.precinct_ward || item?.code || item?.precinct || 'Unknown';
  const name = item => item?.area_name || code(item);
  const registered = item => num(item?.registered_voters ?? item?.registered ?? item?.total_registered);
  const population = item => num(item?.vap_current ?? item?.vap_projected_2026 ?? item?.vap ?? item?.voting_age_population ?? item?.adult_population);
  const gap = item => {
    const pop = population(item);
    const reg = registered(item);
    return pop != null && reg != null ? pop - reg : num(item?.registration_gap);
  };
  const CD1_2024 = new Set(`04/07 04/08 04/09 04/11 04/14 04/15 04/17 04/17A 04/18 04/20 04/21 04/22 04/23 05/12 05/13 05/15 05/16 05/17 05/18 06/09 07/41 07/42 09/45 09/45A 11/04 11/05 11/08 11/09 11/10 11/11 12/05 12/06 12/07 12/09 12/10 13/05 13/07 13/08 14/01 14/02 14/03 14/04 14/05 14/06 14/07 14/08 14/09 14/10 14/11 14/13A 14/14 14/15 14/16 14/17 14/18A 14/20 14/21 16/01 16/01A 17/01 17/17 17/18 17/18A 17/19 17/20`.split(' '));
  const CD1_TO_CD2 = new Set(`09/45 11/04 11/05 11/08 11/09 11/10 11/11 12/05 12/06 12/07 12/09 12/10 13/05 13/07 13/08 14/01 14/02 14/03 14/05 14/06 14/07 14/20`.split(' '));
  const CD2_TO_CD1 = new Set(`03/19 03/20 05/10 05/11 06/07 06/08 14/12 14/19 14/25 16/02 16/03 16/04 16/08 17/02`.split(' '));

  function canonicalPrecinct(value) {
    const match = String(value ?? '').trim().toUpperCase().match(/^(?:W(?:ARD)?\s*)?0*(\d+)\s*(?:[-/]\s*(?:P(?:RECINCT)?\s*)?|\s+P(?:RECINCT)?\s*)0*(\d+)([A-Z]?)$/);
    return match ? `${String(Number(match[1])).padStart(2, '0')}/${String(Number(match[2])).padStart(2, '0')}${match[3]}` : null;
  }

  function congressionalFields(item) {
    const precinct = canonicalPrecinct(code(item));
    const congress2024 = item?.congress_2024 || (precinct && CD1_2024.has(precinct) ? 'CD1' : 'CD2');
    const change = item?.congress_change || (precinct && CD1_TO_CD2.has(precinct) ? 'CD1 → CD2' : precinct && CD2_TO_CD1.has(precinct) ? 'CD2 → CD1' : 'No Change');
    return {
      congress2024,
      congress2026: item?.congress_2026 || (change === 'CD1 → CD2' ? 'CD2' : change === 'CD2 → CD1' ? 'CD1' : congress2024),
      change
    };
  }

  const detail = (item, ...fields) => fields.map(field => item?.[field]).find(value => value != null && value !== '') || 'Not available';

  function rate(item) {
    const pop = population(item);
    const reg = registered(item);
    return pop > 0 && reg != null && reg >= 0 ? reg / pop : null;
  }

  function rateClass(value) {
    return value == null ? 'no-data' : value > 1 ? 'review' : value < 0.6 ? 'low' : value < 0.85 ? 'medium' : 'high';
  }

  function fmt(value) {
    return value == null ? '—' : Number(value).toLocaleString();
  }

  function ratePill(item) {
    const value = rate(item);
    return `<span class="rate ${rateClass(value)}">${value == null ? 'No data' : `${(value * 100).toFixed(1)}%`}</span>${value > 1 ? '<small class="rate-status">Registered &gt; projected VAP</small>' : ''}`;
  }

  function popupMetric(label, value, className = '') {
    return `<div class="popup-metric ${className}"><dt>${esc(label)}</dt><dd>${value}</dd></div>`;
  }

  function precinctPopup(item) {
    const congress = congressionalFields(item);
    const registrationRate = rate(item);
    return `<div class="precinct-popup">
      <strong class="popup-title">Precinct ${esc(code(item))}</strong>
      <dl class="popup-primary">
        ${popupMetric('Registered voters', fmt(registered(item)))}
        ${popupMetric('Projected 2026 VAP', fmt(population(item)))}
        ${popupMetric('Registration rate', registrationRate == null ? 'No data' : `${(registrationRate * 100).toFixed(1)}%`, registrationRate > 1 ? 'review' : '')}
        ${registrationRate > 1 ? popupMetric('Status', 'Registered &gt; projected VAP', 'review') : ''}
        ${popupMetric('Registration gap', fmt(gap(item)))}
        ${popupMetric('Congressional district 2026', esc(congress.congress2026))}
        ${popupMetric('Congressional change', esc(congress.change))}
      </dl>
      <dl class="popup-secondary">
        ${popupMetric('Primary Neighborhood', esc(detail(item, 'primary_neighborhood')))}
        ${popupMetric('Council District', esc(detail(item, 'council_district', 'city_council_district')))}
        ${popupMetric('Primary Planning District', esc(detail(item, 'primary_planning_district')))}
        ${popupMetric('Congressional district 2024', esc(congress.congress2024))}
      </dl>
    </div>`;
  }

  function locationLabel(item) {
    return item?.formatted || [item?.housenumber, item?.street].filter(Boolean).join(' ') || item?.name || 'Location';
  }

  function locationSearchText(item) {
    return [item?.formatted, item?.housenumber, item?.street, item?.name, item?.district, item?.suburb]
      .filter(Boolean).join(' ').toLowerCase();
  }

  function table(rows) {
    if (!rows.length) return '<div class="empty-state"><p>No matching verified records are available.</p></div>';
    return `<table><thead><tr><th>Precinct</th><th>Registered</th><th>VAP</th><th>Gap</th><th>Reg. Rate</th></tr></thead><tbody>${rows.map(item => `
      <tr><td><strong>${esc(name(item))}</strong><br><small>${esc(code(item))}</small></td><td>${fmt(registered(item))}</td><td>${fmt(population(item))}</td><td>${fmt(gap(item))}</td><td>${ratePill(item)}</td></tr>`).join('')}</tbody></table>`;
  }

  function priority() {
    return state.precincts.filter(item => population(item) >= 200 && rate(item) != null && rate(item) <= 1).sort((a, b) => rate(a) - rate(b));
  }

  function populateFilter(id, values, allLabel) {
    const options = [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    $(id).replaceChildren(new Option(allLabel, 'all'), ...options.map(value => new Option(value, value)));
  }

  function populateMapFilters() {
    populateFilter('neighborhood-filter', state.precincts.flatMap(item => item.all_neighborhoods || [item.primary_neighborhood]).filter(Boolean), 'All neighborhoods');
    populateFilter('council-filter', state.precincts.map(item => item.council_district).filter(Boolean), 'All council districts');
    populateFilter('planning-filter', state.precincts.flatMap(item => item.all_planning_districts || [item.primary_planning_district]).filter(Boolean), 'All planning districts');
    populateFilter('congress-district-filter', state.precincts.map(item => congressionalFields(item).congress2026).filter(Boolean), 'All congressional districts');
  }

  function updateMapSummary(features) {
    const items = features.map(feature => feature.properties || feature);
    const registeredTotal = items.reduce((sum, item) => sum + (registered(item) || 0), 0);
    const vapTotal = items.reduce((sum, item) => sum + (population(item) || 0), 0);
    const aggregateRate = vapTotal > 0 ? registeredTotal / vapTotal : null;
    $('summary-precincts').textContent = items.length.toLocaleString();
    $('summary-registered').textContent = registeredTotal.toLocaleString();
    $('summary-vap').textContent = vapTotal.toLocaleString();
    $('summary-gap').textContent = (vapTotal - registeredTotal).toLocaleString();
    $('summary-rate').textContent = aggregateRate == null ? 'No data' : `${(aggregateRate * 100).toFixed(1)}%`;
    $('summary-rate').className = aggregateRate > 1 ? 'review' : '';
    $('summary-rate-status').textContent = aggregateRate > 1 ? 'Registered > projected VAP' : '';
    $('map-filter-status').classList.toggle('hidden', Boolean(items.length));
    $('map-filter-summary').classList.toggle('empty', !items.length);
  }

  function render() {
    const verified = state.precincts.filter(item => rate(item) != null);
    $('total-precincts').textContent = state.precincts.length || 349;
    $('total-registered').textContent = fmt(state.precincts.reduce((sum, item) => sum + (registered(item) || 0), 0) || null);
    $('verified-vap').textContent = fmt(verified.reduce((sum, item) => sum + (population(item) || 0), 0) || null);
    $('data-summary').textContent = `${state.precincts.length || 349} precincts · current registration and outreach data`;
    $('overview-priority').innerHTML = table(priority().slice(0, 10));
    $('priority-table').innerHTML = table(priority());
    populateMapFilters();
    updateMapSummary(state.precincts);
    renderPrecincts();
  }

  function hideMapSearchResults() {
    $('map-search-results').classList.add('hidden');
    $('precinct-map-search').setAttribute('aria-expanded', 'false');
  }

  function renderMapSearchResults() {
    const query = $('precinct-map-search').value.trim();
    const normalized = canonicalPrecinct(query);
    const textQuery = query.toLowerCase();
    const precinctResults = query ? state.precincts.filter(item =>
      canonicalPrecinct(code(item)) === normalized || `${code(item)} ${name(item)}`.toLowerCase().includes(textQuery)
    ).slice(0, 5).map(item => ({ type: 'precinct', item })) : [];
    const locationResults = query.length >= 2 ? state.locations.filter(feature =>
      locationSearchText(feature.properties || {}).includes(textQuery)
    ).slice(0, 8).map(feature => ({ type: 'location', item: feature })) : [];
    state.searchResults = [...precinctResults, ...locationResults].slice(0, 10);

    const results = $('map-search-results');
    results.replaceChildren(...state.searchResults.map((result, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.role = 'option';
      button.dataset.resultIndex = index;
      const type = document.createElement('strong');
      type.textContent = result.type === 'precinct' ? 'Precinct' : 'Address';
      const label = document.createElement('span');
      label.textContent = result.type === 'precinct' ? code(result.item) : locationLabel(result.item.properties || {});
      button.append(type, label);
      return button;
    }));
    results.classList.toggle('hidden', !state.searchResults.length);
    $('precinct-map-search').setAttribute('aria-expanded', String(Boolean(state.searchResults.length)));
  }

  function clearMapHighlights() {
    if (state.highlightedLayer) state.layer.resetStyle(state.highlightedLayer);
    if (state.highlightedLocation) {
      state.layers.locations.resetStyle(state.highlightedLocation);
      if (!state.map.hasLayer(state.layers.locations)) state.map.removeLayer(state.highlightedLocation);
    }
    state.highlightedLayer = null;
    state.highlightedLocation = null;
  }

  function showPrecinctLayer(targetLayer, searchedLocation = '', popupPoint = null) {
    clearMapHighlights();
    state.highlightedLayer = targetLayer;
    targetLayer.setStyle({ color: '#c9ff2f', weight: 4, fillOpacity: 0.75 });
    targetLayer.bringToFront();
    if (searchedLocation) {
      targetLayer.getPopup().setContent(`<div class="searched-location"><strong>Searched address</strong><span>${esc(searchedLocation)}</span></div>${precinctPopup(targetLayer.feature.properties || {})}`);
      targetLayer.once('popupclose', () => targetLayer.getPopup().setContent(precinctPopup(targetLayer.feature.properties || {})));
    } else {
      targetLayer.getPopup().setContent(precinctPopup(targetLayer.feature.properties || {}));
    }
    if (popupPoint) targetLayer.openPopup(L.latLng(popupPoint[1], popupPoint[0]));
    else targetLayer.openPopup();
  }

  function preparePrecinctSearch() {
    state.map.closePopup();
    clearMapHighlights();
    resetMapFilters(false);
    if (!state.map.hasLayer(state.layer)) state.layer.addTo(state.map);
  }

  function findPrecinctOnMap() {
    const input = $('precinct-map-search');
    const target = canonicalPrecinct(input.value);
    const item = state.precincts.find(precinct => canonicalPrecinct(code(precinct)) === target);
    if (!target || !item) {
      $('map-search-status').textContent = 'Precinct not found';
      return;
    }
    if (!state.layer) {
      $('map-search-status').textContent = 'Map is still loading';
      return;
    }

    preparePrecinctSearch();

    let targetLayer = null;
    state.layer.eachLayer(layer => {
      if (canonicalPrecinct(code(layer.feature?.properties)) === target) targetLayer = layer;
    });
    if (!targetLayer) {
      $('map-search-status').textContent = 'Precinct is not available on the map';
      return;
    }

    showPrecinctLayer(targetLayer);
    input.value = code(item);
    input.blur();
    hideMapSearchResults();
    $('map-search-status').textContent = `Showing ${code(item)}`;
    state.map.flyToBounds(targetLayer.getBounds(), { padding: [28, 28], maxZoom: 16, duration: 0.6 });
  }

  function pointRelationToFeature(point, feature) {
    const onSegment = (a, b) => {
      const cross = (point[1] - a[1]) * (b[0] - a[0]) - (point[0] - a[0]) * (b[1] - a[1]);
      if (Math.abs(cross) > 1e-10) return false;
      return point[0] >= Math.min(a[0], b[0]) - 1e-10 && point[0] <= Math.max(a[0], b[0]) + 1e-10 &&
        point[1] >= Math.min(a[1], b[1]) - 1e-10 && point[1] <= Math.max(a[1], b[1]) + 1e-10;
    };
    const inRing = ring => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        if (onSegment(ring[j], ring[i])) return 'boundary';
        if ((ring[i][1] > point[1]) !== (ring[j][1] > point[1]) &&
          point[0] < (ring[j][0] - ring[i][0]) * (point[1] - ring[i][1]) / (ring[j][1] - ring[i][1]) + ring[i][0]) inside = !inside;
      }
      return inside ? 'inside' : 'outside';
    };
    const polygons = feature.geometry?.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry?.coordinates || [];
    for (const polygon of polygons) {
      const outer = inRing(polygon[0]);
      if (outer === 'boundary') return 'boundary';
      if (outer !== 'inside') continue;
      let inHole = false;
      for (const hole of polygon.slice(1)) {
        const relation = inRing(hole);
        if (relation === 'boundary') return 'boundary';
        if (relation === 'inside') inHole = true;
      }
      if (!inHole) return 'inside';
    }
    return 'outside';
  }

  function findLocationOnMap(feature) {
    if (!state.layer || !state.layers.locations) {
      $('map-search-status').textContent = 'Map locations are still loading';
      return;
    }
    const point = feature.geometry.coordinates;
    const inside = state.geojson.features.filter(precinct => pointRelationToFeature(point, precinct) === 'inside');
    const boundaries = state.geojson.features.filter(precinct => pointRelationToFeature(point, precinct) === 'boundary');
    if (boundaries.length || inside.length !== 1) {
      $('map-search-status').textContent = boundaries.length ? 'Location lies on a precinct boundary' : inside.length ? 'Location matches multiple precincts' : 'Location is outside all precincts';
      hideMapSearchResults();
      return;
    }
    preparePrecinctSearch();
    const target = canonicalPrecinct(code(inside[0].properties));
    let precinctLayer = null;
    state.layer.eachLayer(layer => {
      if (canonicalPrecinct(code(layer.feature?.properties)) === target) precinctLayer = layer;
    });
    const locationLayer = state.layers.locations.getLayers().find(layer => layer.feature === feature);
    if (!precinctLayer || !locationLayer) {
      $('map-search-status').textContent = 'Location could not be displayed';
      return;
    }
    const label = locationLabel(feature.properties || {});
    showPrecinctLayer(precinctLayer, label, point);
    state.highlightedLocation = locationLayer;
    locationLayer.setStyle({ radius: 8, weight: 3, fillOpacity: 1 });
    if (!state.map.hasLayer(state.layers.locations)) locationLayer.addTo(state.map);
    $('precinct-map-search').value = label;
    $('precinct-map-search').blur();
    hideMapSearchResults();
    $('map-search-status').textContent = `Address is in ${code(inside[0].properties)}`;
    state.map.flyTo([point[1], point[0]], 16, { duration: 0.6 });
  }

  function selectMapSearchResult(index) {
    const result = state.searchResults[index];
    if (!result) return;
    if (result.type === 'precinct') {
      $('precinct-map-search').value = code(result.item);
      findPrecinctOnMap();
    } else {
      findLocationOnMap(result.item);
    }
  }

  function renderPrecincts() {
    const query = $('precinct-search').value.trim().toLowerCase();
    const rows = state.precincts.filter(item => [code(item), name(item), item.ward, item.council_district].join(' ').toLowerCase().includes(query));
    $('precinct-count').textContent = `${rows.length} records`;
    $('precinct-table').innerHTML = table(rows);
  }

  function message(text) {
    const box = $('message');
    box.textContent = text;
    box.classList.toggle('hidden', !text);
    box.classList.add('error');
  }

  async function fetchGeoJSON(filename) {
    const response = await fetch(filename);
    if (!response.ok) throw new Error(`${filename}: ${response.status}`);
    return response.json();
  }

  async function fetchOptionalGeoJSON(filename, label) {
    try {
      return await fetchGeoJSON(filename);
    } catch (error) {
      console.error(`[Map] Failed to load ${label} from ${filename}:`, error);
      return null;
    }
  }

  function createOptionalLayer(data, filename, label, factory) {
    if (!data) return null;
    try {
      return factory();
    } catch (error) {
      console.error(`[Map] Failed to initialize ${label} from ${filename}:`, error);
      return null;
    }
  }

  async function load() {
    try {
      state.geojson = await fetchGeoJSON('precinct_boundaries.geojson');
      state.precincts = state.geojson.features.map(feature => feature.properties || {});
      render();
    } catch (error) {
      console.error('[Map] Failed to load precincts from precinct_boundaries.geojson:', error);
      message('The precinct data could not be loaded.');
      render();
    }
  }

  async function initMap() {
    if (state.map) {
      setTimeout(() => state.map.invalidateSize(), 50);
      return;
    }
    state.map = L.map('precinct-map').setView([29.97, -90.07], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 18
    }).addTo(state.map);
    try {
      if (!state.geojson) await load();
      if (!state.geojson) throw new Error('precinct_boundaries.geojson is unavailable');

      state.map.createPane('precinctsPane').style.zIndex = 420;
      state.map.createPane('neighborhoodsPane').style.zIndex = 425;
      state.map.createPane('planningPane').style.zIndex = 430;
      state.map.createPane('councilPane').style.zIndex = 440;
      state.map.createPane('locationsPane').style.zIndex = 450;

      state.layer = L.geoJSON(null, {
        pane: 'precinctsPane',
        style: feature => {
          const value = rate(feature.properties);
          return {
            color: '#fff', weight: 1, fillOpacity: 0.55,
            fillColor: value == null ? '#9ca3af' : value > 1 ? '#7a3e9d' : value < 0.6 ? '#b23a2e' : value < 0.85 ? '#d68a2c' : '#3f7a5c'
          };
        },
        onEachFeature: (feature, layer) => {
          const item = feature.properties || {};
          layer.bindPopup(precinctPopup(item), {
            maxWidth: 340,
            maxHeight: 390,
            autoPanPaddingTopLeft: L.point(16, 70),
            autoPanPaddingBottomRight: L.point(16, 16)
          });
        }
      }).addTo(state.map);
      state.layers.precincts = state.layer;
      renderMapFilter();
      state.map.fitBounds(state.layer.getBounds());
    } catch (error) {
      console.error('[Map] Failed to initialize the precinct layer:', error);
      message('The precinct boundary map could not be loaded.');
      return;
    }

    const [neighborhoods, councilDistricts, planningDistricts, locations] = await Promise.all([
      fetchOptionalGeoJSON('neighborhood_boundaries.geojson', 'neighborhoods'),
      fetchOptionalGeoJSON('council_boundaries.geojson', 'council districts'),
      fetchOptionalGeoJSON('planning_districts.geojson', 'planning districts'),
      fetchOptionalGeoJSON('locations.geojson', 'locations')
    ]);
    const overlays = { Precincts: state.layers.precincts };
    state.locations = locations?.features || [];

    state.layers.neighborhoods = createOptionalLayer(neighborhoods, 'neighborhood_boundaries.geojson', 'neighborhoods', () =>
      L.geoJSON(neighborhoods, {
        pane: 'neighborhoodsPane',
        interactive: false,
        style: { color: '#755600', weight: 1.5, opacity: 0.9, fillColor: '#f0c94d', fillOpacity: 0.04 }
      }).addTo(state.map)
    );
    if (state.layers.neighborhoods) {
      overlays.Neighborhoods = state.layers.neighborhoods;
    }

    state.layers.council = createOptionalLayer(councilDistricts, 'council_boundaries.geojson', 'council districts', () =>
      L.geoJSON(councilDistricts, {
        pane: 'councilPane',
        style: { color: '#1646d8', weight: 2.5, opacity: 0.9, dashArray: '8 5', fillColor: '#1646d8', fillOpacity: 0.025 },
        onEachFeature: (feature, layer) => {
          const item = feature.properties || {};
          layer.bindPopup(`<div class="precinct-popup"><strong>${esc(detail(item, 'name'))}</strong><br>District: ${esc(detail(item, 'districtid'))}<br>Representative: ${esc(detail(item, 'repname'))}</div>`);
        }
      })
    );
    if (state.layers.council) {
      overlays['Council Districts'] = state.layers.council;
    }

    state.layers.planning = createOptionalLayer(planningDistricts, 'planning_districts.geojson', 'planning districts', () =>
      L.geoJSON(planningDistricts, {
        pane: 'planningPane',
        style: { color: '#7a3e9d', weight: 2, opacity: 0.9, dashArray: '4 5', fillColor: '#7a3e9d', fillOpacity: 0.025 },
        onEachFeature: (feature, layer) => {
          const item = feature.properties || {};
          layer.bindPopup(`<div class="precinct-popup"><strong>${esc(detail(item, 'district_n'))}</strong><br>Label: ${esc(detail(item, 'label'))}</div>`);
        }
      })
    );
    if (state.layers.planning) {
      overlays['Planning Districts'] = state.layers.planning;
    }

    state.layers.locations = createOptionalLayer(locations, 'locations.geojson', 'locations', () =>
      L.geoJSON(locations, {
        pane: 'locationsPane',
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
          pane: 'locationsPane', radius: 5, color: '#111', weight: 1, fillColor: '#c9ff2f', fillOpacity: 0.9
        }),
        onEachFeature: (feature, layer) => {
          const item = feature.properties || {};
          const optional = [
            item.name ? `<br>Name: ${esc(item.name)}` : '',
            item.district ? `<br>District: ${esc(item.district)}` : '',
            item.suburb ? `<br>Area: ${esc(item.suburb)}` : ''
          ].join('');
          layer.bindPopup(`<div class="precinct-popup"><strong>Location</strong><br>${esc(item.formatted || 'Not available')}${optional}</div>`);
        }
      })
    );
    if (state.layers.locations) {
      overlays.Locations = state.layers.locations;
    }

    L.control.layers(null, overlays, { collapsed: true, position: 'topright' }).addTo(state.map);
  }

  function renderMapFilter(fitBounds = false) {
    if (!state.layer || !state.geojson) return;
    const selected = Object.fromEntries(mapFilterIds.map(id => [id, $(id).value]));
    const features = state.geojson.features.filter(feature => {
      const item = feature.properties || {};
      const congress = congressionalFields(item);
      return (selected['neighborhood-filter'] === 'all' || (item.all_neighborhoods || []).includes(selected['neighborhood-filter'])) &&
        (selected['council-filter'] === 'all' || item.council_district === selected['council-filter']) &&
        (selected['planning-filter'] === 'all' || (item.all_planning_districts || []).includes(selected['planning-filter'])) &&
        (selected['congress-district-filter'] === 'all' || congress.congress2026 === selected['congress-district-filter']) &&
        (selected['congress-change-filter'] === 'all' || congress.change === selected['congress-change-filter']);
    });
    state.highlightedLayer = null;
    state.layer.clearLayers();
    state.layer.addData({ type: 'FeatureCollection', features });
    $('map-precinct-count').textContent = `${features.length} precinct${features.length === 1 ? '' : 's'}`;
    updateMapSummary(features);
    if (fitBounds && features.length) state.map.fitBounds(state.layer.getBounds(), { padding: [18, 18] });
  }

  function resetMapFilters(fitBounds = true) {
    mapFilterIds.forEach(id => { $(id).value = 'all'; });
    renderMapFilter(fitBounds);
  }

  document.querySelectorAll('[data-panel]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-panel]').forEach(item => item.classList.toggle('active', item === button));
    document.querySelectorAll('.panel').forEach(panel => panel.classList.toggle('active', panel.id === button.dataset.panel));
    if (button.dataset.panel === 'map') initMap();
  }));
  $('precinct-search').addEventListener('input', renderPrecincts);
  mapFilterIds.forEach(id => $(id).addEventListener('change', () => {
    state.map.closePopup();
    clearMapHighlights();
    renderMapFilter(true);
  }));
  $('clear-map-filters').addEventListener('click', () => {
    state.map.closePopup();
    clearMapHighlights();
    resetMapFilters(true);
  });
  $('precinct-map-search-button').addEventListener('click', () => {
    if (canonicalPrecinct($('precinct-map-search').value)) findPrecinctOnMap();
    else selectMapSearchResult(0);
  });
  $('precinct-map-search').addEventListener('input', renderMapSearchResults);
  $('precinct-map-search').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (canonicalPrecinct(event.currentTarget.value)) findPrecinctOnMap();
      else selectMapSearchResult(0);
    }
  });
  $('map-search-results').addEventListener('click', event => {
    const button = event.target.closest('[data-result-index]');
    if (button) selectMapSearchResult(Number(button.dataset.resultIndex));
  });

  if (window.matchMedia('(max-width: 768px)').matches) {
    const mapTab = document.querySelector('[data-panel="map"]');
    mapTab?.click();
  } else {
    load();
  }
})();
