# BackgroundManager 3.2.0 同步群組

## 使用方式

1. 停用原有插件，備份並以新版 `BackgroundManager.plugin.js` 覆蓋 BetterDiscord plugins 資料夾中的同名檔案；再啟用插件。
2. 開啟齒輪設定，展開需要同步的區域，將「背景模式」設為同一群組，例如「同步群組 A」。
3. 展開「同步群組設定（A～E）」中的群組 A，使用原生選取資料夾或套用路徑。可設定間隔、轉場、暗化、模糊、取景等。
4. 其他區域可選不同群組、獨立背景及輪播、全視窗共用背景或原生色。需要個別取景時，在區域勾選「獨立調整共用背景的外觀」。

例：頻道列表與成員列表設為 A，中央聊天區設為獨立，伺服器列表與底部使用者控制列設為 B。群組 A 的下一張只影響頻道和成員列表；B 與聊天區不受影響。

- 同群組顯示同一個圖片檔及同一輪播進度，各區依自身尺寸取景，不保證跨區無縫拼接。若需原有無縫全視窗圖片，選「全視窗共用背景」並關閉區域外觀覆寫。
- 群組至少需要一個區域加入才能選擇資料夾或開始輪播。最後一區退出會停止來源並清除當前圖片、計時器；群組設定仍保留。重新加入時若已開啟自動載入且有保存路徑，會重新載入，否則需手動套用或選取。
- 原生選取資料夾的檔案權限不跨重啟保存；需要自動啟動時請使用已驗證可用的路徑模式。
- 舊共用與獨立模式設定不會被移除。原生色仍是底色遮罩。

## 測試

在原專案根目錄覆蓋同名檔案、新增 `tests/groups.test.js` 與 `tests/browser_groups.py`，保留既有測試及其他未修改檔案。

```sh
npm test
python tests/browser_groups.py
```

瀏覽器測試須安裝 Python Playwright 與 Chromium，可使用 `CHROMIUM_PATH` 指定執行檔。Node.js 22 與模擬 Discord DOM 的 Chromium 測試已通過；仍需 Windows Discord + BetterDiscord 實機確認。

基於 GitHub `xyazqr/BackgroundManager` main 的 3.1.0 版本，插件原始 blob SHA：`2701bc1e7ad1f6e94c248f20dc2fd6e21e550e67`。
