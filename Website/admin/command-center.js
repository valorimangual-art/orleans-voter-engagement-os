(function () {
  'use strict';

  const state = {
    precincts: [],
    volunteers: [],
    events: [],
    partners: [],
    currentTab: 'dashboard',
    map: null,
    mapLayer: null,
    pendingDelete: null
  };

  const TABLES = {
    volunteer: {
      table: 'volunteers',
      collection: 'volunteers',
      key: 'id',
      title: 'Volunteer',
      fields: [
        field('name', 'Full Name', 'text', { required: true }),
        field('phone', 'Phone', 'tel'),
        field('email', 'Email', 'email'),
        field('home_precinct', 'Home Precinct', 'text', { placeholder: 'e.g. W08-P12' }),
        field('neighborhood', 'Neighborhood'),
        field('skills', 'Skills', 'text', { placeholder: 'Canvassing, translation, driving…' }),
        field('languages', 'Languages'),
        field('transportation', 'Transportation', 'select', { options: ['', 'Own Vehicle', 'Public Transit', 'Carpool', 'Needs Ride'] }),
        field('availability', 'Availability'),
        field('status', 'Status', 'select', { options: ['New', 'Contacted', 'Active', 'Inactive'], defaultValue: 'New' }),
        field('admin_notes', 'Admin Notes', 'textarea')
      ]
    },
    event: {
      table: 'outreach_events',
      collection: 'events',
      key: 'id',
      title: 'Outreach Event',
      fields: [
        field('event_name', 'Event Name', 'text', { required: true }),
        field('event_date', 'Date', 'date'),
        field('location', 'Location / Address'),
        field('precinct_ward', 'Precinct / Ward', 'text', { placeholder: 'e.g. W08-P12' }),
        field('event_type', 'Type', 'select', { options: ['', 'Tabling', 'Canvassing', 'Voter Registration Drive', 'Community Event'] }),
        field('volunteers_present', 'Volunteers Present'),
        field('new_registrations', 'New Registrations', 'number'),
        field('unsure_registration_status', 'Unsure Registration Status', 'number'),
        field('voters_found_inactive', 'Voters Found Inactive', 'number'),
        field('notes', 'Notes', 'textarea')
      ]
    },
    partner: {
      table: 'community_partners',
      collection: 'partners',
      key: 'id',
      title: 'Community Partner',
      fields: [
        field('org_name', 'Organization Name', 'text', { required: true }),
        field('contact_name', 'Contact Name'),
        field('contact_info', 'Contact Email / Phone'),
        field('org_type', 'Type', 'select', { options: ['', 'Nonprofit', 'Church/Faith Org', 'School', 'Business', 'Neighborhood Association', 'Other'] }),
        field('area_served', 'Neighborhood / Area Served'),
        field('status', 'Relationship Status', 'select', { options: ['Not Contacted', 'Contacted', 'Meeting Scheduled', 'Active Partner'], defaultValue: 'Not Contacted' }),
        field('notes', 'Notes', 'textarea')
      ]
    }
  };

  function field(id, label, type, options) {
    return { id, label, type: type || 'text', ...(options || {}) };
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function populationValue(record) {
    if (!record) return 0;
    const candidates = [record.neighborhood_population, record.population, record.adult_population];
    for (const candidate of candidates) {
      if (candidate != null && !Number.isNaN(Number(candidate))) return Number(candidate);
    }
    return 0;
  }

  function populationLabel(record) {
    if (record && (record.neighborhood_population != null || record.population != null)) return 'Neighborhood population';
    return 'Population';
  }

  function dateValue(value) {
    return value ? String(value).slice(0, 10) : '';
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function showPageError(message) {
    const box = document.getElementById('page-error');
    if (!message) {
      box.classList.add('hidden');
      box.textContent = '';
      return;
    }
    box.textContent = message;
    box.classList.remove('hidden');
  }

  function setSyncStatus(message, failed) {
    const element = document.getElementById('sync-status');
    element.textContent = message;
    element.classList.toggle('text-red-600', Boolean(failed));
    element.classList.toggle('text-gray-400', !failed);
  }

  async function loadData() {
    setSyncStatus('Loading current data…');
    showPageError('');

    const queries = await Promise.all([
      sb.from('precincts').select('*'),
      sb.from('volunteers').select('id,name,phone,email,home_precinct,neighborhood,skills,languages,transportation,availability,status,admin_notes,created_at').order('created_at', { ascending: false }),
      sb.from('outreach_events').select('id,event_name,event_date,location,precinct_ward,event_type,volunteers_present,new_registrations,voters_found_inactive,unsure_registration_status,notes').order('event_date', { ascending: false }),
      sb.from('community_partners').select('id,org_name,contact_name,contact_info,org_type,area_served,status,notes,created_at').order('created_at', { ascending: false })
    ]);

    const names = ['precincts', 'volunteers', 'outreach events', 'community partners'];
    const failures = queries.map((result, index) => result.error ? `${names[index]}: ${result.error.message}` : null).filter(Boolean);

    state.precincts = queries[0].data || [];
    state.volunteers = queries[1].data || [];
    state.events = queries[2].data || [];
    state.partners = queries[3].data || [];

    renderAll();
    if (state.mapLayer) renderMapData();

    if (failures.length) {
      setSyncStatus('Some data could not be loaded', true);
      showPageError(`Some sections are unavailable. ${failures.join(' | ')}`);
    } else {
      setSyncStatus(`Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
    }
  }

  function renderAll() {
    renderDashboard();
    renderVolunteers();
    renderEvents();
    renderContacts();
    renderPartners();
  }

  function renderDashboard() {
    const activeVolunteers = state.volunteers.filter(item => item.status === 'Active').length;
    const upcomingEvents = state.events.filter(item => dateValue(item.event_date) >= today()).length;
    const registrations = state.events.reduce((sum, item) => sum + number(item.new_registrations), 0);
    const inactive = state.events.reduce((sum, item) => sum + number(item.voters_found_inactive), 0);
    const outcomes = state.events.reduce((sum, item) => sum + number(item.new_registrations) + number(item.voters_found_inactive) + number(item.unsure_registration_status), 0);
    const priority = priorityPrecincts();

    setText('kpi-vol', activeVolunteers);
    setText('kpi-evt', upcomingEvents);
    setText('kpi-reg', registrations.toLocaleString());
    setText('kpi-inact', inactive.toLocaleString());
    setText('kpi-contacts', outcomes.toLocaleString());
    setText('kpi-priority', priority.length.toLocaleString());
    setText('hdr-vol', `${state.volunteers.length} volunteers`);
    setText('hdr-events', `${state.events.length} events`);
    setText('hdr-helped', `${outcomes} outcomes`);

    const recent = state.events.filter(hasOutcomes).slice().sort((a, b) => dateValue(b.event_date).localeCompare(dateValue(a.event_date))).slice(0, 6);
    document.getElementById('recent-activity').innerHTML = recent.length ? recent.map(item => `
      <div class="flex justify-between gap-4 items-center py-2 border-b border-gray-100">
        <div class="min-w-0"><p class="font-medium truncate">${escapeHtml(item.event_name || 'Unnamed event')}</p><p class="text-xs text-gray-500 truncate">${eventOutcomeCount(item)} outcomes · ${escapeHtml(item.precinct_ward || 'No precinct')}</p></div>
        <time class="text-xs text-gray-400 shrink-0">${escapeHtml(dateValue(item.event_date))}</time>
      </div>`).join('') : '<p class="empty-inline">No recent activity</p>';

    document.getElementById('priority-precincts').innerHTML = priority.length ? priority.slice(0, 8).map(item => `
      <button type="button" class="w-full flex justify-between items-center py-2 border-b border-gray-100 text-left hover:text-emerald-700" data-open-precinct="${escapeHtml(item.precinct_ward)}">
        <span class="font-medium">${escapeHtml(item.precinct_ward || 'Unknown')}</span>
        <span class="text-xs px-2 py-1 rounded bg-red-50 text-red-600">${formatRate(item.registration_rate)}</span>
      </button>`).join('') : '<p class="empty-inline">No priority precincts found</p>';

    document.querySelectorAll('[data-open-precinct]').forEach(button => button.addEventListener('click', () => {
      switchTab('map');
      openPrecinct(button.dataset.openPrecinct);
    }));
  }

  function priorityPrecincts() {
    return state.precincts.filter(item => populationValue(item) >= 200 && item.registration_rate != null && number(item.registration_rate) < 0.6)
      .sort((a, b) => number(a.registration_rate) - number(b.registration_rate));
  }

  function renderVolunteers() {
    const query = document.getElementById('vol-search').value.trim().toLowerCase();
    const status = document.getElementById('vol-filter-status').value;
    const records = state.volunteers.filter(item => {
      const haystack = [item.name, item.email, item.phone, item.home_precinct, item.neighborhood, item.skills].join(' ').toLowerCase();
      return (!query || haystack.includes(query)) && (!status || item.status === status);
    });
    setText('vol-count', `${records.length} ${records.length === 1 ? 'record' : 'records'}`);
    renderRecordList('vol-list', records, item => `
      <div class="flex justify-between gap-3 items-start"><div class="min-w-0"><p class="font-semibold text-sm text-gray-900 truncate">${escapeHtml(item.name || 'Unnamed volunteer')}</p><p class="text-xs text-gray-500 mt-1 truncate">${escapeHtml(item.home_precinct || item.neighborhood || 'No geography')} ${item.skills ? `· ${escapeHtml(item.skills)}` : ''}</p></div><span class="status-chip ${statusClass(item.status)}">${escapeHtml(item.status || 'New')}</span></div>`, 'volunteer');
  }

  function renderEvents() {
    const query = document.getElementById('evt-search').value.trim().toLowerCase();
    const records = state.events.filter(item => [item.event_name, item.location, item.precinct_ward, item.event_type].join(' ').toLowerCase().includes(query));
    setText('evt-count', `${records.length} ${records.length === 1 ? 'record' : 'records'}`);
    renderRecordList('evt-list', records, item => `
      <div class="flex justify-between gap-3"><div class="min-w-0"><p class="font-semibold text-sm text-gray-900 truncate">${escapeHtml(item.event_name || 'Unnamed event')}</p><p class="text-xs text-gray-500 mt-1 truncate">${escapeHtml(item.location || item.precinct_ward || 'No location')} ${item.event_type ? `· ${escapeHtml(item.event_type)}` : ''}</p><p class="flex flex-wrap gap-3 text-xs mt-2"><span class="text-emerald-600">${number(item.new_registrations)} registrations</span><span class="text-amber-600">${number(item.voters_found_inactive)} inactive</span></p></div><time class="text-xs text-gray-400 shrink-0">${escapeHtml(dateValue(item.event_date))}</time></div>`, 'event');
  }

  function renderContacts() {
    const query = document.getElementById('assist-search').value.trim().toLowerCase();
    const records = state.events.filter(hasOutcomes).filter(item => [item.event_name, item.precinct_ward, item.location].join(' ').toLowerCase().includes(query));
    setText('assist-count', `${records.length} ${records.length === 1 ? 'event' : 'events'} with outcomes`);
    renderRecordList('assist-list', records, item => `
      <div class="flex justify-between gap-3"><div class="min-w-0"><p class="font-semibold text-sm text-gray-900 truncate">${escapeHtml(item.event_name || 'Unnamed event')}</p><p class="text-xs text-gray-500 mt-1">${number(item.new_registrations)} registrations · ${number(item.unsure_registration_status)} unsure · ${number(item.voters_found_inactive)} inactive</p><p class="text-xs text-gray-400 mt-1 truncate">${escapeHtml(item.precinct_ward || item.location || 'No location')}</p></div><time class="text-xs text-gray-400 shrink-0">${escapeHtml(dateValue(item.event_date))}</time></div>`, 'event');
  }

  function hasOutcomes(item) {
    return eventOutcomeCount(item) > 0;
  }

  function eventOutcomeCount(item) {
    return number(item.new_registrations) + number(item.unsure_registration_status) + number(item.voters_found_inactive);
  }

  function renderPartners() {
    const query = document.getElementById('partner-search').value.trim().toLowerCase();
    const records = state.partners.filter(item => [item.org_name, item.contact_name, item.org_type, item.area_served, item.status].join(' ').toLowerCase().includes(query));
    setText('partner-count', `${records.length} ${records.length === 1 ? 'record' : 'records'}`);
    renderRecordList('partner-list', records, item => `
      <div class="flex justify-between gap-3"><div class="min-w-0"><p class="font-semibold text-sm text-gray-900 truncate">${escapeHtml(item.org_name || 'Unnamed partner')}</p><p class="text-xs text-gray-500 mt-1 truncate">${escapeHtml(item.contact_name || item.org_type || 'No contact')} ${item.area_served ? `· ${escapeHtml(item.area_served)}` : ''}</p></div><span class="status-chip ${partnerStatusClass(item.status)}">${escapeHtml(item.status || 'Not Contacted')}</span></div>`, 'partner');
  }

  function renderRecordList(containerId, records, template, type) {
    const container = document.getElementById(containerId);
    if (!records.length) {
      container.innerHTML = '<p class="empty-state">No matching records found.</p>';
      return;
    }
    const keyName = TABLES[type].key;
    container.innerHTML = records.map(item => `<article class="record-row" tabindex="0" role="button" data-record-type="${type}" data-record-key="${escapeHtml(item[keyName])}">${template(item)}</article>`).join('');
    container.querySelectorAll('[data-record-type]').forEach(row => {
      const open = () => openForm(row.dataset.recordType, row.dataset.recordKey);
      row.addEventListener('click', open);
      row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
    });
  }

  function statusClass(status) {
    return ({ Active: 'status-active', Inactive: 'status-inactive', Contacted: 'status-contacted', New: 'status-new' })[status] || 'status-new';
  }

  function partnerStatusClass(status) {
    return status === 'Active Partner' ? 'status-active' : status === 'Not Contacted' ? 'status-inactive' : 'status-contacted';
  }

  function switchTab(tab) {
    state.currentTab = tab;
    document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
    document.getElementById(`view-${tab}`).classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(button => button.classList.toggle('tab-active', button.dataset.tab === tab));
    if (tab === 'map') {
      if (!state.map) void initMap();
      window.setTimeout(() => state.map?.invalidateSize(), 100);
    }
  }

  async function initMap() {
    if (state.map) return;
    state.map = L.map('map').setView([29.97, -90.07], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 18 }).addTo(state.map);
    // load the default geo layer (precinct) from a GeoJSON file in the site
    try {
      const selector = document.getElementById('geo-type-select');
      if (selector) {
        selector.addEventListener('change', () => loadBoundaryGeoJSON(selector.value));
        // set initial selection if state has one
        state.currentGeoType = selector.value || 'precinct';
      } else {
        state.currentGeoType = 'precinct';
      }
      await loadBoundaryGeoJSON(state.currentGeoType);
    } catch (error) {
      showPageError(`The map layer could not be loaded: ${error.message}`);
    }
  }

  async function loadBoundaryGeoJSON(geoType) {
    if (!geoType) geoType = 'precinct';
    state.currentGeoType = geoType;
    const path = `../${geoType}_boundaries.geojson`;
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Boundary request returned ${response.status}`);
      const geojson = await response.json();
      if (state.mapLayer) {
        state.map.removeLayer(state.mapLayer);
        state.mapLayer = null;
      }
      state.mapLayer = L.geoJSON(geojson, {
        style: feature => mapStyle(getFeatureCode(feature)),
        onEachFeature: (feature, layer) => {
          const code = getFeatureCode(feature);
          const label = feature.properties?.name || code || 'Unknown area';
          layer.bindTooltip(label, { sticky: true });
          layer.on('click', () => showPrecinct(code));
        }
      }).addTo(state.map);
      if (state.mapLayer.getBounds().isValid()) state.map.fitBounds(state.mapLayer.getBounds());
    } catch (error) {
      showPageError(`Could not load ${geoType} boundaries: ${error.message}`);
    }
  }

  function getFeatureCode(feature) {
    if (!feature || !feature.properties) return null;
    const p = feature.properties;
    return p.code || p.precinct_ward || p.precinct || p.ward || p.WARD || p.GEOID || null;
  }

  function renderMapData() {
    if (!state.mapLayer) return;
    state.mapLayer.eachLayer(layer => {
      const code = getFeatureCode(layer.feature);
      layer.setStyle(mapStyle(code));
    });
  }

  function mapStyle(code) {
    const record = precinctByCode(code);
    return { color: '#0b1f3a', weight: 1, fillColor: rateColor(record?.registration_rate), fillOpacity: 0.68 };
  }

  function rateColor(rate) {
    if (rate == null || Number.isNaN(Number(rate))) return '#9ca3af';
    if (Number(rate) < 0.6) return '#ef4444';
    if (Number(rate) < 0.85) return '#f59e0b';
    return '#10b981';
  }

  function formatRate(rate) {
    return rate == null || Number.isNaN(Number(rate)) ? 'No rate' : `${(Number(rate) * 100).toFixed(1)}%`;
  }

  function precinctByCode(code) {
    return state.precincts.find(item => item.precinct_ward === code);
  }

  function openPrecinct(code) {
    if (!state.map) {
      window.setTimeout(() => openPrecinct(code), 300);
      return;
    }
    const layer = Array.from(Object.values(state.mapLayer?._layers || {})).find(item => getFeatureCode(item.feature) === code || item.feature?.properties?.precinct_ward === code);
    if (layer) {
      state.map.fitBounds(layer.getBounds(), { maxZoom: 15 });
      layer.openTooltip();
    }
    showPrecinct(code);
  }

  function showPrecinct(code) {
    const precinct = precinctByCode(code);
    const volunteers = state.volunteers.filter(item => item.home_precinct === code);
    const events = state.events.filter(item => item.precinct_ward === code);
    const outcomes = state.events.filter(item => item.precinct_ward === code).reduce((sum, item) => sum + eventOutcomeCount(item), 0);
    const panel = document.getElementById('geo-panel');
    const content = document.getElementById('geo-content');

    content.innerHTML = `<h2 class="font-bold text-lg text-gray-900 mb-3 pr-7">${escapeHtml(code || 'Unknown precinct')}</h2>
      ${precinct ? `<div class="grid grid-cols-2 gap-2 text-sm mb-4">
        ${statCard(populationLabel(precinct), number(populationValue(precinct)).toLocaleString())}
        ${statCard('Registered', number(precinct.registered_voters).toLocaleString())}
        ${statCard('Registration rate', formatRate(precinct.registration_rate))}
        ${statCard('Estimated unregistered', Math.max(populationValue(precinct) - number(precinct.registered_voters), 0).toLocaleString())}
      </div>
      <div class="text-xs text-gray-500 space-y-1 mb-4"><p>Neighborhood: ${escapeHtml(precinct.neighborhood || '—')}</p><p>Council district: ${escapeHtml(precinct.council_district || '—')}</p><p>Polling location: ${escapeHtml(precinct.polling_location || '—')}</p></div>` : '<p class="text-sm text-gray-500 mb-4">No matching precinct metric record was returned by Supabase.</p>'}
      <div class="border-t pt-3 space-y-2 text-sm"><p><strong>${volunteers.length}</strong> assigned volunteers</p><p><strong>${events.length}</strong> logged events</p><p><strong>${outcomes}</strong> assistance outcomes</p></div>`;
    panel.classList.remove('hidden');
  }

  function statCard(label, value) {
    return `<div class="bg-gray-50 rounded p-2"><span class="text-gray-500 text-xs block">${label}</span><span class="font-semibold">${value}</span></div>`;
  }

  function openForm(type, key) {
    const config = TABLES[type];
    if (!config) return;
    const record = key == null ? null : state[config.collection].find(item => String(item[config.key]) === String(key));
    setText('form-record-type', type);
    setText('form-record-key', record ? String(record[config.key]) : '');
    setText('form-title', `${record ? 'Edit' : 'Add'} ${config.title}`);
    document.getElementById('form-error').classList.add('hidden');
    document.getElementById('delete-record').classList.toggle('hidden', !record);

    const container = document.getElementById('form-fields');
    container.innerHTML = config.fields.map(definition => formField(definition, record?.[definition.id])).join('');
    showModal('form-modal');
    container.querySelector('input,select,textarea')?.focus();
  }

  function formField(definition, value) {
    const id = `field-${definition.id}`;
    const current = definition.type === 'date' ? dateValue(value) : value ?? definition.defaultValue ?? '';
    const required = definition.required ? 'required' : '';
    let control;
    if (definition.type === 'select') {
      control = `<select id="${id}" class="form-input" ${required}>${definition.options.map(option => `<option value="${escapeHtml(option)}" ${String(current) === String(option) ? 'selected' : ''}>${escapeHtml(option || 'Select one')}</option>`).join('')}</select>`;
    } else if (definition.type === 'textarea') {
      control = `<textarea id="${id}" class="form-input" rows="3" ${required}>${escapeHtml(current)}</textarea>`;
    } else {
      const min = definition.type === 'number' ? 'min="0" step="1"' : '';
      control = `<input id="${id}" class="form-input" type="${definition.type}" value="${escapeHtml(current)}" placeholder="${escapeHtml(definition.placeholder || '')}" ${min} ${required}>`;
    }
    return `<div class="mb-3"><label class="form-label" for="${id}">${escapeHtml(definition.label)}${definition.required ? ' *' : ''}</label>${control}</div>`;
  }

  async function saveForm(event) {
    event.preventDefault();
    const type = document.getElementById('form-record-type').value;
    const key = document.getElementById('form-record-key').value;
    const config = TABLES[type];
    const payload = {};
    config.fields.forEach(definition => {
      const value = document.getElementById(`field-${definition.id}`).value;
      payload[definition.id] = definition.type === 'number' ? (value === '' ? null : Number(value)) : (value === '' ? null : value);
    });

    const button = document.getElementById('form-submit');
    const errorBox = document.getElementById('form-error');
    button.disabled = true;
    button.textContent = 'Saving…';
    errorBox.classList.add('hidden');

    let result;
    if (key) result = await sb.from(config.table).update(payload).eq(config.key, key).select(config.key);
    else result = await sb.from(config.table).insert([payload]).select(config.key);

    button.disabled = false;
    button.textContent = 'Save';
    if (result.error) {
      errorBox.textContent = `Could not save: ${result.error.message}`;
      errorBox.classList.remove('hidden');
      return;
    }
    if (key && (!result.data || result.data.length === 0)) {
      errorBox.textContent = 'No row was updated. Your account may not have an applicable SELECT/UPDATE policy for this record.';
      errorBox.classList.remove('hidden');
      return;
    }
    hideModal('form-modal');
    await loadData();
  }

  function requestDelete() {
    const type = document.getElementById('form-record-type').value;
    const key = document.getElementById('form-record-key').value;
    if (!type || !key) return;
    state.pendingDelete = { type, key };
    showModal('delete-confirm');
  }

  async function confirmDelete() {
    if (!state.pendingDelete) return;
    const { type, key } = state.pendingDelete;
    const config = TABLES[type];
    const button = document.getElementById('confirm-delete');
    button.disabled = true;
    button.textContent = 'Deleting…';
    const result = await sb.from(config.table).delete().eq(config.key, key).select(config.key);
    button.disabled = false;
    button.textContent = 'Delete';

    if (result.error || !result.data?.length) {
      hideModal('delete-confirm');
      const errorBox = document.getElementById('form-error');
      errorBox.textContent = result.error ? `Could not delete: ${result.error.message}` : 'No row was deleted. Your account may not have an applicable DELETE policy.';
      errorBox.classList.remove('hidden');
      state.pendingDelete = null;
      return;
    }
    state.pendingDelete = null;
    hideModal('delete-confirm');
    hideModal('form-modal');
    await loadData();
  }

  function showModal(id) {
    const modal = document.getElementById(id);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function hideModal(id) {
    const modal = document.getElementById(id);
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value == null ? '' : String(value);
  }

  function wireEvents() {
    document.querySelectorAll('.tab-btn').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
    document.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => openForm(button.dataset.add)));
    document.getElementById('vol-search').addEventListener('input', renderVolunteers);
    document.getElementById('vol-filter-status').addEventListener('change', renderVolunteers);
    document.getElementById('evt-search').addEventListener('input', renderEvents);
    document.getElementById('assist-search').addEventListener('input', renderContacts);
    document.getElementById('partner-search').addEventListener('input', renderPartners);
    document.getElementById('record-form').addEventListener('submit', saveForm);
    document.getElementById('close-form').addEventListener('click', () => hideModal('form-modal'));
    document.getElementById('cancel-form').addEventListener('click', () => hideModal('form-modal'));
    document.getElementById('delete-record').addEventListener('click', requestDelete);
    document.getElementById('confirm-delete').addEventListener('click', confirmDelete);
    document.getElementById('cancel-delete').addEventListener('click', () => { state.pendingDelete = null; hideModal('delete-confirm'); });
    document.getElementById('close-geo').addEventListener('click', () => document.getElementById('geo-panel').classList.add('hidden'));
    document.getElementById('sign-out').addEventListener('click', async () => { await OrleansAuth.signOut(); window.location.assign('../login.html'); });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      hideModal('delete-confirm');
      hideModal('form-modal');
      document.getElementById('geo-panel').classList.add('hidden');
    });
  }

  async function initialize() {
    const access = await OrleansAuth.requireAdmin({ loginUrl: '../login.html' });
    if (!access.authorized) return;
    document.body.style.visibility = 'visible';
    wireEvents();
    lucide.createIcons();
    await loadData();
  }

  void initialize();
})();
