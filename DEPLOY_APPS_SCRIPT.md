# Apps Script 部署步驟

目前 GitHub 已有完整前端與後端程式，但線上的 Google Apps Script 仍需要登入 `cwork0340` 後手動部署。這份步驟不會刪除舊帳務資料。

## 部署前

- 確認明天仍可使用的正式入口沒有問題。
- 打開目前零用金 Google Sheet。
- 進入 `擴充功能 > Apps Script`。
- 先複製目前 Apps Script 程式到備份檔，或在 Apps Script 編輯器建立一個備份檔案。

## 更新程式

1. 打開 GitHub 檔案：
   `google-apps-script/Code.gs`
2. 複製全部內容。
3. 貼到 Apps Script 的 `Code.gs`。
4. 若 Apps Script 有 `appsscript.json`，確認設定與 `google-apps-script/appsscript.json` 相容。

## 儲存與測試

1. 儲存 Apps Script。
2. 執行 `setupSheet` 一次。
3. 回到 Google Sheet，確認只新增缺少欄位或必要分頁，舊列沒有被刪除。
4. 在 Apps Script 執行下列函式做基本檢查：
   - `getBalance`
   - `getPendingWithdrawals`
   - `getHomeData`

## 部署

1. 點 `部署 > 管理部署作業`。
2. 編輯目前 Web app deployment。
3. 版本選 `新增版本`。
4. 存取權維持目前設定，通常是 `任何人`。
5. 部署後確認 Web app URL 沒有改變。
6. 若 URL 改變，更新 GitHub 的 `netlify/functions/api.js` 裡的 `GAS_URL`。

## 上線後驗證

在前端測：

- 首頁可以讀取帳面餘額。
- 新增一筆小額 `拿零用金`。
- 首頁或月結頁看得到未結清款項。
- 報帳結清時輸入實際支出與找零。
- 月結頁未結清、待補收據、待查差異能正常顯示。

## 回復方式

如果部署後異常：

1. 回 Apps Script `部署 > 管理部署作業`。
2. 把 Web app 切回上一個版本。
3. 前端會回到原本後端行為。

這就是為什麼這次只補欄位、不搬移舊資料、不刪除既有列。
