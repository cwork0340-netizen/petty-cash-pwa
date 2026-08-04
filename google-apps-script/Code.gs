const SPREADSHEET_ID = '1WjDwixtAbU7rywz-E83z3Bhflkhz4Iswvlek_NvSTI4';

const SHEETS = {
  transactions: '交易紀錄',
  inventory: '每日盤點',
  settings: '設定'
};

const TX_HEADERS = [
  'recordId',
  'date',
  'type',
  'amount',
  'note',
  'handler',
  'relatedId',
  'actualExpense',
  'returnedAmount',
  'receiptStatus',
  'receiptUrl',
  'status',
  'diffAmount',
  'diffNote',
  'createdAt',
  'updatedAt',
  'closedAt',
  'voidedAt',
  'voidReason'
];

const INVENTORY_HEADERS = [
  'recordId',
  'date',
  'coin1',
  'coin5',
  'coin10',
  'coin50',
  'bill100',
  'bill200',
  'bill500',
  'bill1000',
  'ledgerBalance',
  'actualTotal',
  'diffAmount',
  'diffNote',
  'status',
  'handler',
  'candidateReasons',
  'resolution',
  'resolvedBy',
  'resolvedAt',
  'createdAt'
];

const SETTINGS_HEADERS = ['key', 'value', 'updatedAt'];

function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = params.action || '';

  try {
    setupSheet();

    const routes = {
      getHomeData,
      getBalance,
      getSettings,
      saveSettings: () => saveSettings(params),
      savePeopleSettings: () => savePeopleSettings(params),
      addTransaction: () => addTransaction(params),
      voidTransaction: () => voidTransaction(params),
      getPendingWithdrawals,
      closeWithdrawal: () => closeWithdrawal(params),
      getAllTransactions,
      getRecentTransactions,
      getExpenseList,
      getTodayInventoryStatus,
      addInventory: () => addInventory(params),
      getAllInventory,
      getReconciliationData,
      resolveInventoryDifference: () => resolveInventoryDifference(params),
      getAlerts,
      getMonthCloseStatus
    };

    if (!routes[action]) throw new Error('Unknown action: ' + action);
    return json({ success: true, data: routes[action]() });
  } catch (err) {
    return json({ success: false, error: err.message });
  }
}

function doPost(e) {
  return doGet(e);
}

function json(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getOrCreateSheet(name, headers) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  ensureHeaders(sheet, headers);
  return sheet;
}

function ensureHeaders(sheet, headers) {
  const width = Math.max(sheet.getLastColumn(), headers.length, 1);
  const current = sheet.getRange(1, 1, 1, width).getValues()[0].map(String);
  const hasAnyHeader = current.some(v => v.trim());

  if (!hasAnyHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }

  const existing = current.map(v => v.trim()).filter(Boolean);
  const missing = headers.filter(h => existing.indexOf(h) === -1);
  if (!missing.length) return;

  const startCol = sheet.getLastColumn() + 1;
  sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
  sheet.setFrozenRows(1);
}

function setupSheet() {
  getOrCreateSheet(SHEETS.transactions, TX_HEADERS);
  getOrCreateSheet(SHEETS.inventory, INVENTORY_HEADERS);
  getOrCreateSheet(SHEETS.settings, SETTINGS_HEADERS);
}

function getHeaderMap(sheet) {
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  const map = {};
  headers.forEach((header, index) => {
    if (header) map[String(header).trim()] = index;
  });
  return map;
}

function rowsAsObjects(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  return values.map((row, index) => {
    const obj = { row: index + 2 };
    headers.forEach((header, col) => {
      if (header) obj[header] = row[col];
    });
    return obj;
  });
}

function appendObject(sheet, headers, obj) {
  ensureHeaders(sheet, headers);
  const map = getHeaderMap(sheet);
  const row = new Array(sheet.getLastColumn()).fill('');
  Object.keys(obj).forEach(key => {
    if (map[key] !== undefined) row[map[key]] = obj[key];
  });
  sheet.appendRow(row);
  return obj;
}

function setObjectValues(sheet, rowNumber, updates) {
  const map = getHeaderMap(sheet);
  Object.keys(updates).forEach(key => {
    if (map[key] !== undefined) {
      sheet.getRange(rowNumber, map[key] + 1).setValue(updates[key]);
    }
  });
}

function nowText() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss');
}

function todayText() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd');
}

function newId(prefix) {
  return prefix + '-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 1000);
}

function toNumber(value) {
  const n = Number(value || 0);
  return isNaN(n) ? 0 : n;
}

function normalizeDate(value) {
  if (!value) return todayText();
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy/MM/dd');
  }
  return String(value).replace(/-/g, '/');
}

function isIncreaseType(type) {
  return type === '收入' || type === '找零歸還' || type === '補入零用金';
}

function isDecreaseType(type) {
  return type === '取款' || type === '拿零用金' || type === '實際支出' || type === '直接付款';
}

function getSettings() {
  const sheet = getOrCreateSheet(SHEETS.settings, SETTINGS_HEADERS);
  const rows = rowsAsObjects(sheet);
  const settings = {};
  rows.forEach(row => {
    if (row.key) settings[row.key] = row.value;
  });
  return settings;
}

function saveSettings(params) {
  const sheet = getOrCreateSheet(SHEETS.settings, SETTINGS_HEADERS);
  const map = getHeaderMap(sheet);
  const rows = rowsAsObjects(sheet);
  const now = nowText();
  const keys = ['initialAmount', 'coin1', 'coin5', 'coin10', 'coin50', 'bill100', 'bill200', 'bill500', 'bill1000'];

  keys.forEach(key => {
    const existing = rows.find(row => row.key === key);
    if (existing) {
      sheet.getRange(existing.row, map.value + 1).setValue(toNumber(params[key]));
      sheet.getRange(existing.row, map.updatedAt + 1).setValue(now);
    } else {
      appendObject(sheet, SETTINGS_HEADERS, { key, value: toNumber(params[key]), updatedAt: now });
    }
  });

  return { balance: getBalance(), newBalance: getBalance() };
}

function savePeopleSettings(params) {
  const sheet = getOrCreateSheet(SHEETS.settings, SETTINGS_HEADERS);
  const map = getHeaderMap(sheet);
  const rows = rowsAsObjects(sheet);
  const now = nowText();
  const value = params.people || '[]';

  const existing = rows.find(row => row.key === 'people');
  if (existing) {
    sheet.getRange(existing.row, map.value + 1).setValue(value);
    sheet.getRange(existing.row, map.updatedAt + 1).setValue(now);
  } else {
    appendObject(sheet, SETTINGS_HEADERS, { key: 'people', value, updatedAt: now });
  }

  return { people: JSON.parse(value) };
}

function getInitialAmount() {
  const settings = getSettings();
  return toNumber(settings.initialAmount || settings.originalAmount);
}

function getAllTransactions() {
  const sheet = getOrCreateSheet(SHEETS.transactions, TX_HEADERS);
  return rowsAsObjects(sheet)
    .map(normalizeTransaction)
    .filter(row => String(row.status || '').trim() !== '已作廢');
}

function normalizeTransaction(row) {
  const type = String(row.type || '').trim();
  const note = String(row.note || '').trim();
  let status = String(row.status || '').trim();

  if (!status && (type === '取款' || type === '拿零用金')) {
    status = note.indexOf('已結清') >= 0 ? '已結清' : '未結清';
  }

  return Object.assign({}, row, {
    date: normalizeDate(row.date),
    type,
    amount: toNumber(row.amount),
    note,
    handler: row.handler || '未填經手人',
    status
  });
}

function getBalance() {
  const rows = getAllTransactions();
  let balance = getInitialAmount();

  rows.forEach(row => {
    if (isIncreaseType(row.type)) balance += toNumber(row.amount);
    if (isDecreaseType(row.type)) balance -= toNumber(row.amount);
  });

  return balance;
}

function getLastUpdated() {
  const rows = getAllTransactions();
  if (!rows.length) return '';
  const last = rows[rows.length - 1];
  return last.updatedAt || last.createdAt || '';
}

function getRecentTransactions() {
  return getAllTransactions()
    .slice(-5)
    .reverse();
}

function getHomeData() {
  return {
    balance: getBalance(),
    lastUpdated: getLastUpdated(),
    recent: getRecentTransactions(),
    todayDone: getTodayInventoryStatus().todayDone,
    reconciliation: getReconciliationData(),
    alerts: getAlerts()
  };
}

function addTransaction(params) {
  const sheet = getOrCreateSheet(SHEETS.transactions, TX_HEADERS);
  const type = params.type || '取款';
  const amount = toNumber(params.amount);
  const handler = String(params.handler || '').trim();
  const note = String(params.note || '').trim();
  if (['取款', '實際支出', '收入', '補入零用金', '找零歸還'].indexOf(type) === -1) {
    throw new Error('不支援的現金動作');
  }
  if (amount <= 0) throw new Error('金額必須大於 0');
  if (!handler) throw new Error('每筆現金紀錄都必須指定經手人');
  if (!note) throw new Error('請填寫用途，才能在盤點時追查原因');
  const now = nowText();
  const record = {
    recordId: params.recordId || newId('TX'),
    date: normalizeDate(params.date),
    type,
    amount,
    note,
    handler,
    relatedId: params.relatedId || '',
    actualExpense: params.actualExpense || '',
    returnedAmount: params.returnedAmount || '',
    receiptStatus: params.receiptStatus || '',
    receiptUrl: params.receiptUrl || '',
    status: params.status || (type === '取款' ? '未結清' : '已入帳'),
    diffAmount: params.diffAmount || '',
    diffNote: params.diffNote || '',
    createdAt: now,
    updatedAt: now,
    closedAt: '',
    voidedAt: '',
    voidReason: ''
  };

  appendObject(sheet, TX_HEADERS, record);
  return { recordId: record.recordId, newBalance: getBalance() };
}

function getPendingWithdrawals() {
  return getAllTransactions().filter(row => {
    const type = row.type;
    const status = String(row.status || '').trim();
    const isWithdrawal = type === '取款' || type === '拿零用金';
    return isWithdrawal && status !== '已結清' && status !== '已核銷';
  });
}

function findTransactionRow(idOrRow) {
  const sheet = getOrCreateSheet(SHEETS.transactions, TX_HEADERS);
  const rows = rowsAsObjects(sheet);
  const id = String(idOrRow || '').trim();
  if (!id) return null;

  const byId = rows.find(row => String(row.recordId || '') === id);
  if (byId) return byId;

  const rowNumber = Number(id);
  if (rowNumber >= 2 && rowNumber <= sheet.getLastRow()) {
    return rows.find(row => row.row === rowNumber) || null;
  }

  return null;
}

function closeWithdrawal(params) {
  const sheet = getOrCreateSheet(SHEETS.transactions, TX_HEADERS);
  const target = findTransactionRow(params.recordId || params.id || params.row);
  if (!target) throw new Error('找不到要結清的取款');

  const borrowed = toNumber(target.amount);
  const actualExpense = toNumber(params.actualExpense);
  const returnedAmount = toNumber(params.returnedAmount);
  const diffAmount = params.diffAmount !== undefined && params.diffAmount !== ''
    ? toNumber(params.diffAmount)
    : borrowed - actualExpense - returnedAmount;
  const receiptStatus = params.receiptStatus || '已收到';
  if (diffAmount !== 0) {
    throw new Error('結清必須符合「原拿款 = 實際支出 + 找零」。短溢請改由盤點差異單處理。');
  }
  const status = receiptStatus === '待補' ? '待補收據' : '已結清';
  const now = nowText();

  setObjectValues(sheet, target.row, {
    actualExpense,
    returnedAmount,
    receiptStatus,
    receiptUrl: params.receiptUrl || '',
    status,
    diffAmount,
    diffNote: params.diffNote || '',
    updatedAt: now,
    closedAt: now
  });

  if (returnedAmount > 0) {
    const existingReturn = getAllTransactions().some(row => {
      return row.relatedId === target.recordId && row.type === '找零歸還';
    });

    if (!existingReturn) {
      addTransaction({
        date: params.date || todayText(),
        type: '找零歸還',
        amount: returnedAmount,
        note: params.note || ('結清找零：' + (target.note || target.recordId)),
        handler: params.handler || target.handler || '未填經手人',
        relatedId: target.recordId,
        receiptStatus,
        status: '已入帳'
      });
    }
  }

  return {
    recordId: target.recordId,
    status,
    newBalance: getBalance()
  };
}

function getExpenseList() {
  return getAllTransactions().filter(row => row.type === '實際支出' || row.type === '直接付款');
}

function getTodayInventoryStatus() {
  const sheet = getOrCreateSheet(SHEETS.inventory, INVENTORY_HEADERS);
  const rows = rowsAsObjects(sheet);
  const today = todayText();
  const todayRows = rows.filter(row => normalizeDate(row.date) === today);
  return { todayDone: todayRows.length > 0, latest: todayRows[todayRows.length - 1] || null };
}

function addInventory(params) {
  const sheet = getOrCreateSheet(SHEETS.inventory, INVENTORY_HEADERS);
  const ledgerBalance = getBalance();
  const actualTotal = params.actualTotal !== undefined && params.actualTotal !== ''
    ? toNumber(params.actualTotal)
    : calculateCashTotal(params);
  const diffAmount = actualTotal - ledgerBalance;
  const handler = String(params.handler || '').trim();
  if (!handler) throw new Error('盤點必須指定盤點人');
  if (diffAmount !== 0 && !String(params.diffNote || '').trim()) {
    throw new Error('短溢必須建立待查原因，不能直接調整帳面');
  }
  const reconciliation = getReconciliationData();
  const record = {
    recordId: params.recordId || newId('INV'),
    date: normalizeDate(params.date),
    coin1: toNumber(params.coin1),
    coin5: toNumber(params.coin5),
    coin10: toNumber(params.coin10),
    coin50: toNumber(params.coin50),
    bill100: toNumber(params.bill100),
    bill200: toNumber(params.bill200),
    bill500: toNumber(params.bill500),
    bill1000: toNumber(params.bill1000),
    ledgerBalance,
    actualTotal,
    diffAmount,
    diffNote: params.diffNote || '',
    status: diffAmount === 0 ? '相符' : '待查差異',
    handler,
    candidateReasons: JSON.stringify(reconciliation.candidates),
    resolution: '',
    resolvedBy: '',
    resolvedAt: '',
    createdAt: nowText()
  };

  appendObject(sheet, INVENTORY_HEADERS, record);
  return { recordId: record.recordId, newBalance: ledgerBalance, diffAmount };
}

function getAllInventory() {
  const sheet = getOrCreateSheet(SHEETS.inventory, INVENTORY_HEADERS);
  return rowsAsObjects(sheet).map(row => Object.assign({}, row, {
    date: normalizeDate(row.date),
    ledgerBalance: toNumber(row.ledgerBalance),
    actualTotal: toNumber(row.actualTotal),
    diffAmount: toNumber(row.diffAmount)
  }));
}

function voidTransaction(params) {
  const sheet = getOrCreateSheet(SHEETS.transactions, TX_HEADERS);
  const target = findTransactionRow(params.recordId || params.id || params.row);
  const reason = String(params.reason || '').trim();
  const operator = String(params.operator || '').trim();
  if (!target) throw new Error('找不到要作廢的紀錄');
  if (!reason || !operator) throw new Error('作廢必須留下原因與操作人');
  if (String(target.status || '').trim() === '已結清') {
    throw new Error('已結清預支不可直接作廢，請以沖回紀錄處理');
  }
  setObjectValues(sheet, target.row, {
    status: '已作廢', voidedAt: nowText(), voidReason: reason,
    updatedAt: nowText(), diffNote: (target.diffNote ? target.diffNote + '｜' : '') + '作廢：' + reason + '（' + operator + '）'
  });
  return { recordId: target.recordId, status: '已作廢', newBalance: getBalance() };
}

function getOpenInventoryDifferences() {
  const sheet = getOrCreateSheet(SHEETS.inventory, INVENTORY_HEADERS);
  return rowsAsObjects(sheet)
    .map(row => Object.assign({}, row, {
      diffAmount: toNumber(row.diffAmount),
      status: String(row.status || '').trim()
    }))
    .filter(row => row.diffAmount !== 0 && row.status !== '已解決');
}

function getReconciliationData() {
  const transactions = getAllTransactions();
  const pending = getPendingWithdrawals();
  const receiptPending = transactions.filter(row => String(row.receiptStatus || '').trim() === '待補');
  const openDifferences = getOpenInventoryDifferences();
  const candidates = [];

  pending.forEach(row => candidates.push({
    type: '未結清預支', recordId: row.recordId, handler: row.handler,
    amount: toNumber(row.amount), date: row.date, note: row.note
  }));
  receiptPending.forEach(row => candidates.push({
    type: '待補收據', recordId: row.recordId, handler: row.handler,
    amount: toNumber(row.actualExpense || row.amount), date: row.date, note: row.note
  }));
  openDifferences.forEach(row => candidates.push({
    type: '前次未解盤點差異', recordId: row.recordId, handler: row.handler,
    amount: row.diffAmount, date: normalizeDate(row.date), note: row.diffNote
  }));

  return {
    ledgerBalance: getBalance(),
    pendingAmount: pending.reduce((sum, row) => sum + toNumber(row.amount), 0),
    pendingCount: pending.length,
    receiptPendingCount: receiptPending.length,
    openDifferenceCount: openDifferences.length,
    candidates
  };
}

function getAlerts() {
  const today = new Date();
  return getReconciliationData().candidates.map(item => {
    const date = new Date(String(item.date || '').replace(/\//g, '-'));
    const ageDays = isNaN(date.getTime()) ? 0 : Math.floor((today - date) / 86400000);
    return Object.assign({}, item, { ageDays, overdue: ageDays >= 7 });
  }).filter(item => item.overdue || item.type === '前次未解盤點差異');
}

function resolveInventoryDifference(params) {
  const sheet = getOrCreateSheet(SHEETS.inventory, INVENTORY_HEADERS);
  const rows = rowsAsObjects(sheet);
  const target = rows.find(row => String(row.recordId || '') === String(params.recordId || ''));
  const resolution = String(params.resolution || '').trim();
  const resolvedBy = String(params.resolvedBy || '').trim();
  if (!target) throw new Error('找不到要處理的差異單');
  if (!resolution || !resolvedBy) throw new Error('請填寫差異處理方式與確認人');
  setObjectValues(sheet, target.row, {
    status: '已解決', resolution, resolvedBy, resolvedAt: nowText()
  });
  return { recordId: target.recordId, status: '已解決' };
}

function getMonthCloseStatus() {
  const reconciliation = getReconciliationData();
  const blockers = [];
  if (reconciliation.pendingCount) blockers.push('尚有 ' + reconciliation.pendingCount + ' 筆未結清預支');
  if (reconciliation.receiptPendingCount) blockers.push('尚有 ' + reconciliation.receiptPendingCount + ' 筆待補收據');
  if (reconciliation.openDifferenceCount) blockers.push('尚有 ' + reconciliation.openDifferenceCount + ' 筆未解盤點差異');
  return { canClose: blockers.length === 0, blockers, reconciliation };
}

function calculateCashTotal(params) {
  return toNumber(params.coin1) * 1 +
    toNumber(params.coin5) * 5 +
    toNumber(params.coin10) * 10 +
    toNumber(params.coin50) * 50 +
    toNumber(params.bill100) * 100 +
    toNumber(params.bill200) * 200 +
    toNumber(params.bill500) * 500 +
    toNumber(params.bill1000) * 1000;
}
