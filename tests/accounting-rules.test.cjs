const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function loadRules() {
  const code = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const context = {
    JSON,
    Math,
    Date,
    String,
    Number,
    Object,
    Array,
    isNaN,
    Utilities: { formatDate: () => '2026/08/03' },
    Session: { getScriptTimeZone: () => 'Asia/Taipei' },
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

test('帳面現金只由現金流水計算，盤點不會自行改帳', () => {
  const rules = loadRules();
  rules.getInitialAmount = () => 5000;
  rules.getAllTransactions = () => [
    { type: '取款', amount: 3000 },
    { type: '找零歸還', amount: 650 },
    { type: '實際支出', amount: 500 },
  ];
  assert.equal(rules.getBalance(), 2150);
});

test('未平衡的預支結清會被拒絕', () => {
  const rules = loadRules();
  rules.getOrCreateSheet = () => ({});
  rules.findTransactionRow = () => ({ recordId: 'TX-1', row: 2, amount: 3000, handler: '王小姐' });
  assert.throws(
    () => rules.closeWithdrawal({ recordId: 'TX-1', actualExpense: 2350, returnedAmount: 0 }),
    /原拿款 = 實際支出 \+ 找零/
  );
});

test('現金紀錄缺少用途或經手人會被拒絕', () => {
  const rules = loadRules();
  rules.getOrCreateSheet = () => ({});
  assert.throws(() => rules.addTransaction({ type: '取款', amount: 100, note: '郵局' }), /經手人/);
  assert.throws(() => rules.addTransaction({ type: '取款', amount: 100, handler: '王小姐' }), /用途/);
});

test('差異追查清單會包含未結清、待補收據與舊差異', () => {
  const rules = loadRules();
  rules.getAllTransactions = () => [{ recordId: 'TX-2', receiptStatus: '待補', actualExpense: 250, amount: 300, handler: '王小姐', date: '2026/08/01', note: '車資' }];
  rules.getPendingWithdrawals = () => [{ recordId: 'TX-1', amount: 3000, handler: '王小姐', date: '2026/08/01', note: '公出' }];
  rules.getOpenInventoryDifferences = () => [{ recordId: 'INV-1', diffAmount: -50, handler: '芯誼', date: '2026/08/02', diffNote: '待查' }];
  rules.getBalance = () => 1650;
  const data = rules.getReconciliationData();
  assert.equal(data.candidates.length, 3);
  assert.equal(data.pendingAmount, 3000);
  assert.equal(data.openDifferenceCount, 1);
});

test('月結會被未結清、待補收據與未解差異阻擋', () => {
  const rules = loadRules();
  rules.getReconciliationData = () => ({ pendingCount: 1, receiptPendingCount: 2, openDifferenceCount: 3 });
  const status = rules.getMonthCloseStatus();
  assert.equal(status.canClose, false);
  assert.equal(status.blockers.length, 3);
});

test('作廢保留原因與操作人，且不直接刪除資料', () => {
  const rules = loadRules();
  const updates = {};
  rules.getOrCreateSheet = () => ({});
  rules.findTransactionRow = () => ({ recordId: 'TX-9', row: 9, status: '未結清', diffNote: '' });
  rules.setObjectValues = (_sheet, _row, values) => Object.assign(updates, values);
  rules.getBalance = () => 4900;
  const result = rules.voidTransaction({ recordId: 'TX-9', reason: '重複輸入', operator: '主管' });
  assert.equal(result.status, '已作廢');
  assert.equal(updates.status, '已作廢');
  assert.match(updates.voidReason, /重複輸入/);
});

test('結清可保留收據連結，讓待補憑證能回查', () => {
  const rules = loadRules();
  const updates = {};
  rules.getOrCreateSheet = () => ({});
  rules.findTransactionRow = () => ({ recordId: 'TX-3', row: 3, amount: 1000, handler: '王小姐', note: '公出' });
  rules.setObjectValues = (_sheet, _row, values) => Object.assign(updates, values);
  rules.getBalance = () => 4000;
  rules.closeWithdrawal({ recordId: 'TX-3', actualExpense: 1000, returnedAmount: 0, receiptStatus: '待補', receiptUrl: 'https://drive.example/receipt' });
  assert.equal(updates.status, '待補收據');
  assert.equal(updates.receiptUrl, 'https://drive.example/receipt');
});

test('盤點報表資料保留原始帳面、實點與差異數字', () => {
  const rules = loadRules();
  rules.getOrCreateSheet = () => ({});
  rules.rowsAsObjects = () => [{ recordId: 'INV-3', date: '2026-08-03', ledgerBalance: '2500', actualTotal: '2450', diffAmount: '-50' }];
  const result = rules.getAllInventory();
  assert.deepEqual(JSON.parse(JSON.stringify(result)), [{ recordId: 'INV-3', date: '2026/08/03', ledgerBalance: 2500, actualTotal: 2450, diffAmount: -50 }]);
});

test('首頁摘要把實支、補入、找零與未結清預支分開顯示', () => {
  const frontend = fs.readFileSync('index.html', 'utf8');
  assert.match(frontend, /近期實際支出/);
  assert.match(frontend, /補入零用金/);
  assert.match(frontend, /找零歸還/);
  assert.match(frontend, /未結清預支/);
  assert.doesNotMatch(frontend, /最近收入/);
});
