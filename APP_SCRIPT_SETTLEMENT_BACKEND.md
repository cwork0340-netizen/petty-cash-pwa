# 零用金結清與月結後端契約

這份文件定義 Google Apps Script 需要支援的 action。原則是只追加欄位與紀錄，不刪除舊資料，不改變既有 `addTransaction`、`getHomeData`、`getBalance`、`addInventory`、`getSettings`、`saveSettings` 行為。

## 資料相容原則

- 舊交易紀錄必須保留。
- 舊的 `取款` 類型視為未結清暫借款，除非已有狀態為 `已結清`、`已核銷`。
- 新欄位沒有值時，前端會用 `未填用途`、`未填經手人` 顯示，不阻擋使用。
- 結清不可再次扣除實際支出，因為原本 `取款` 已經讓帳面現金減少。
- 找零歸還才會增加帳面餘額。

## 建議欄位

交易表保留原欄位，追加以下欄位：

| 欄位 | 說明 |
| --- | --- |
| recordId | 每筆唯一 ID |
| relatedId | 對應原始取款 recordId |
| purpose | 用途，可沿用 note |
| actualExpense | 結清時的實際支出 |
| returnedAmount | 結清時的找零歸還 |
| receiptStatus | `已收到`、`待補`、`無需收據` |
| status | `未結清`、`已結清`、`待補收據`、`待查差異` |
| diffAmount | 原拿款 - 實際支出 - 找零 |
| diffNote | 差異原因 |
| closedAt | 結清時間 |
| updatedAt | 最後更新時間 |

## `getPendingWithdrawals`

回傳所有未結清取款。

```json
{
  "success": true,
  "data": [
    {
      "recordId": "TX-20260728-001",
      "row": 12,
      "date": "2026/07/28",
      "type": "取款",
      "amount": 500,
      "note": "買清潔用品",
      "handler": "王小明",
      "status": "未結清"
    }
  ]
}
```

## `closeWithdrawal`

結清一筆未結清取款。此 action 必須原子化處理：更新原取款狀態，必要時追加找零歸還紀錄。

輸入參數：

| 參數 | 說明 |
| --- | --- |
| recordId / id / row | 要結清的取款 |
| date | 結清日期 |
| actualExpense | 實際支出 |
| returnedAmount | 找零歸還 |
| receiptStatus | 收據狀態 |
| diffAmount | 差異金額 |
| diffNote | 差異原因 |
| handler | 經手人 |
| note | 結清備註 |
| status | 前端建議狀態 |

處理規則：

- 找到原始取款後更新狀態。
- `diffAmount === 0 && receiptStatus !== "待補"`：狀態為 `已結清`。
- `diffAmount === 0 && receiptStatus === "待補"`：狀態為 `待補收據`。
- `diffAmount !== 0`：狀態為 `待查差異`。
- `returnedAmount > 0` 時追加一筆 `找零歸還`，讓帳面餘額增加。
- 不再追加 `實際支出` 扣款，避免重複扣帳。

回傳：

```json
{
  "success": true,
  "data": {
    "recordId": "TX-20260728-001",
    "status": "已結清",
    "newBalance": 4200
  }
}
```

## `getAllTransactions`

回傳所有交易與盤點相關狀態，供月底清算使用。前端會用它抓：

- 待補收據：`receiptStatus` 或 `note` 含 `待補`
- 待查差異：`status`、`diffNote`、`diffAmount`

## 月底清算判斷

月底頁面清算前要看三張清單：

- 未結清款項
- 待補收據
- 待查差異

三張清單為空，才代表月底不會找不到款項。
