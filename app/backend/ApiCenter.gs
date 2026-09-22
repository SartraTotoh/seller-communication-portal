/**
 * Seller Communication Portal - API Center v1
 * Server-side registry/queue layer. Outbound delivery is intentionally blocked
 * until each connection has a verified payload + authentication contract.
 */
const API_CENTER_DB_ID = '1eWFb1PGngH1dzT993G0yfvNG-BvNVJQ66NtjdzIMyAU';

function apiCenterData() {
  const ss = SpreadsheetApp.openById(API_CENTER_DB_ID);
  return {
    connections: readApiTable_(ss, 'API_Connections'),
    routes: readApiTable_(ss, 'API_Routes'),
    queue: readApiTable_(ss, 'API_Publication_Queue'),
    logs: readApiTable_(ss, 'API_Logs')
  };
}

function apiCenterQueuePublication(payload) {
  payload = payload || {};
  if (String(payload.sensitivity || '').toUpperCase() !== 'NON_SENSITIVE') {
    throw new Error('API Center policy blocks non-reviewed or restricted content from Internal PR.');
  }
  if (String(payload.sellerScope || '').toLowerCase().indexOf('specific seller') >= 0) {
    throw new Error('Specific Seller List is blocked from Internal PR routes.');
  }
  const ss = SpreadsheetApp.openById(API_CENTER_DB_ID);
  const sheet = ss.getSheetByName('API_Publication_Queue');
  if (!sheet) throw new Error('API_Publication_Queue is not configured.');
  const id = 'APIQ-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  const now = new Date();
  const row = {
    queue_id: id,
    request_id: payload.requestId || '',
    comms_item_id: payload.commsItemId || '',
    connection_id: payload.connectionId || 'CONN-CLASSROOM-PR',
    route_id: payload.routeId || 'ROUTE-CLASSROOM',
    title: payload.title || '',
    summary: payload.summary || '',
    destination_url: payload.destinationUrl || '',
    asset_url: payload.assetUrl || '',
    audience: payload.audience || 'Internal',
    sensitivity_class: 'NON_SENSITIVE',
    approval_status: 'PENDING_REVIEW',
    delivery_status: 'NOT_SENT',
    payload_snapshot_json: JSON.stringify(payload),
    created_at: now,
    created_by: payload.createdBy || Session.getActiveUser().getEmail(),
    approved_at: '',
    approved_by: '',
    delivered_at: '',
    response_reference: '',
    last_error: '',
    notes: 'Queued by API Center. Delivery blocked until connection contract is VERIFIED.'
  };
  appendApiObject_(sheet, row);
  appendApiLog_(ss, row.connection_id, row.route_id, id, 'QUEUE_PUBLICATION', 'QUEUED', '', '');
  return row;
}

function apiCenterConnectionStatus(connectionId) {
  const ss = SpreadsheetApp.openById(API_CENTER_DB_ID);
  const rows = readApiTable_(ss, 'API_Connections');
  const connection = rows.find(function(r){ return String(r.connection_id) === String(connectionId); });
  if (!connection) throw new Error('API connection not found.');
  const status = String(connection.contract_status || '').toUpperCase();
  return {
    connection_id: connection.connection_id,
    name: connection.connection_name,
    contract_status: status || 'CONTRACT_TEST_REQUIRED',
    can_send: status === 'VERIFIED' && String(connection.enabled).toUpperCase() === 'TRUE',
    note: status === 'VERIFIED' ? 'Connection contract verified.' : 'Endpoint is registered but payload/auth contract must be validated before delivery.'
  };
}

function apiCenterSendPublication(queueId) {
  // Deliberate hard stop: do not invent the Classroom endpoint contract.
  // Enable only after payload schema, auth mode, response schema and retry behavior are confirmed.
  throw new Error('API delivery is disabled until the target connection contract is VERIFIED.');
}

function readApiTable_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 1) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map(function(x){ return String(x); });
  return values.filter(function(row){ return row.some(function(v){ return v !== ''; }); }).map(function(row){
    const obj = {};
    headers.forEach(function(h, i){ obj[h] = row[i]; });
    return obj;
  });
}

function appendApiObject_(sheet, obj) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(x){ return String(x); });
  sheet.appendRow(headers.map(function(h){ return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : ''; }));
}

function appendApiLog_(ss, connectionId, routeId, queueId, action, outcome, reference, errorMessage) {
  const sheet = ss.getSheetByName('API_Logs');
  if (!sheet) return;
  appendApiObject_(sheet, {
    log_id: 'APILOG-' + Utilities.getUuid().slice(0, 8).toUpperCase(),
    connection_id: connectionId || '',
    route_id: routeId || '',
    queue_id: queueId || '',
    action: action || '',
    outcome: outcome || '',
    started_at: new Date(),
    finished_at: new Date(),
    latency_ms: '',
    response_reference: reference || '',
    error_message: errorMessage || '',
    actor: Session.getActiveUser().getEmail(),
    metadata_json: '{}'
  });
}
