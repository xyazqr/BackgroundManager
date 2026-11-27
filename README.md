<p align="center"><img src="assets/icon.png" width="120" alt="BackgroundManager icon"></p>

<h1 align="center">BackgroundManager</h1>
<p align="center">BetterDiscord 本機資料夾背景輪播插件 · Local-folder wallpaper slideshow</p>

## 功能

- **3.1.0 分區背景**：伺服器列表、左側頻道／私訊列表、中央聊天區、右側成員列表與底部使用者控制列，可各自選擇共用背景、原生色或獨立資料夾。
- 每個獨立區域可設定輪播、轉場、暗化、模糊、縮放及水平／垂直位置；共用模式預設維持全視窗連續背景，勾選獨立外觀後依區域重新取景。

- 從本機資料夾選擇圖片，不使用 IndexedDB 儲存圖片。
- 依序或隨機輪播，可調整間隔、淡入淡出、暗化、模糊。
- 路徑模式支援每 60 秒重新掃描及選擇性自動啟動。
- 使用獨立 CSS 背景層，不修改 Discord 核心檔案，也不依賴 Discord 內部 React 模組。
- 圖片載入失敗會停止自動輪播，設定中顯示錯誤；可手動切換下一張。

## 安裝

1. 安裝 [BetterDiscord](https://betterdiscord.app/) 並啟動 Discord。
2. 下載本專案根目錄的 `BackgroundManager.plugin.js`（在 GitHub 點選 Raw 或 Download raw file），或從 Release 取得該檔案。
3. 在 Discord 使用者設定 → BetterDiscord → Plugins → Open Plugins Folder 開啟插件資料夾。Windows 預設為 `%appdata%\BetterDiscord\plugins`。
4. 將 `BackgroundManager.plugin.js` 放入資料夾，啟用插件並開啟齒輪設定。
5. 建議先點「原生選取資料夾（建議）」並選擇圖片資料夾。確認背景可正常顯示後，再使用路徑模式與自動啟動。

不必安裝舊版插件、額外主題或預先建立 config；BetterDiscord 會在設定變更後儲存設定。請勿同時安裝另一個同名 BackgroundManager 插件。

## 分區背景使用方式

1. 在「全視窗共用背景」選取原本的背景資料夾。更新會保留 3.0.0 儲存的路徑與外觀設定；使用原生選取模式時仍須重新選取。
2. 展開左側頻道／私訊列表、右側成員列表或其他區域的設定。
3. 選擇「共用背景」、「原生色（無圖片）」或「獨立背景及輪播」。共用模式可另外勾選「獨立調整共用背景的外觀」，設定暗化、模糊、縮放與位置；勾選後該區域重新取景，不再保證與全視窗圖片無縫對齊。
4. 獨立模式下選擇該區域自己的資料夾，設定輪播與轉場等參數。原生選取資料夾不儲存檔案授權，重新啟動後須再選取。

原生色模式使用啟用背景時取得的區域底色建立遮罩，並不是完整還原 Discord 原生主題。區域位置以可見 DOM 元素為準，每 500 ms 更新；Discord 更新 class 名稱、切換主題、特殊頁面或其他主題可能影響區域辨識。找不到區域時會隱藏其圖層。獨立來源按序解碼，但各區仍會保留當前圖片及轉場中的圖片，記憶體需求高於共用模式。設定檔無須手動修改。

## 兩種圖片來源模式

| 功能 | 原生選取資料夾 | 路徑模式 |
| --- | --- | --- |
| 讀取 | Chromium File API | BetterDiscord fs 相容層 |
| 重新啟動後 | 需重新選取 | 可儲存路徑並自動啟動 |
| 自動更新檔案清單 | 需重新選取 | 每 60 秒掃描（正常輪播期間） |
| 建議用途 | 初次測試、相容性較佳的備用方案 | 已確認路徑讀取正常後使用 |

## 設定

| 項目 | 初始值 |
| --- | --- |
| 資料夾路徑 | 空白 |
| 包含子資料夾 | 關閉 |
| 隨機輪播 | 開啟 |
| 自動啟動 | 關閉 |
| 輪播間隔 | 10 分鐘 |
| 轉場時間 | 1000 ms |
| 暗化 | 50% |
| 模糊 | 0 px |

支援 PNG、JPG/JPEG、WEBP、GIF、BMP、AVIF、JFIF（實際解碼能力取決於 Discord 的 Chromium）。單張上限為 12 MiB，解碼後檢查 2400 萬像素。路徑掃描最多 3000 個項目、100 個資料夾、8 層深度。這些限制不是絕對的記憶體安全保證；GIF 解碼仍可能有額外負擔。路徑模式使用同步 fs API，大型資料夾可能短暫阻塞介面。

## 排除問題

- **無背景：** 先用原生模式選取小型 PNG/JPG；查看設定最下方的狀態訊息。若圖片已載入但不可見，可能是 Discord CSS 更新或其他 Theme 造成遮蔽。
- **路徑模式讀取失敗：** 使用原生模式；BetterDiscord 的 fs 相容層可能與 Node.js 不同。
- **Discord 崩潰：** 在崩潰提示選 Open Plugins Folder，將此 JS 移出，重新啟動 Discord。不要反覆啟用有問題的版本。

## 開發與測試

需要 Node.js 22（測試環境）。無 npm 依賴：

```sh
npm test
```

測試涵蓋語法、無設定檔啟動、路徑掃描、基本讀取、原生 File 清單及清理。GitHub Actions 在 push / pull request 時執行相同測試。Node 測試使用模擬 BetterDiscord API，不能取代 Windows Discord + BetterDiscord 的實機相容性驗證。3.1.0 已在 Chromium 的模擬 Discord 欄位測試背景解碼、共用／獨立／原生色切換、區域尺寸、隱藏成員欄與停止清理；仍未在 Windows Discord + BetterDiscord 實機測試。另提供可選的 `python tests/browser_smoke.py`（需安裝 Python Playwright 與 Chromium；可用 `CHROMIUM_PATH` 指定執行檔）。

## English summary

A standalone BetterDiscord wallpaper slideshow plugin with local folder selection, sequential/random rotation, fades, brightness and blur. Install only `BackgroundManager.plugin.js` into the BetterDiscord plugins folder. No existing config is required. Start with the native folder picker; saved path mode depends on BetterDiscord's filesystem compatibility layer. Version 3.1 adds per-region shared/native-color/independent backgrounds and settings. Synthetic Chromium integration was tested; actual Discord client compatibility for this update has not yet been verified.

## 專案來源與授權

本專案是獨立重寫的版本，並非 [Narukami 的 BackgroundManager](https://github.com/Naru-kami/BackgroundManager-plugin) 官方版本，也沒有與 Discord 或 BetterDiscord 官方合作。名稱沿用以便替換舊插件。圖示為本專案自製的 SVG，不使用 Discord 官方標誌。

授權尚未由維護者選定；公開發布前請確認有權公開所有檔案並選擇適當的授權。沒有 LICENSE 不代表已授權他人任意重製或散布。

- [BetterDiscord 開發文件](https://docs.betterdiscord.app/)
- [CHANGELOG](CHANGELOG.md)
