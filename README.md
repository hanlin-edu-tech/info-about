![production CD](https://github.com/hanlin-edu-tech/info-about/workflows/production%20CD/badge.svg)
![test CD](https://github.com/hanlin-edu-tech/info-about/workflows/test%20CD/badge.svg)

# info-about

翰林雲端學院的靜態介紹頁。

| 頁面 | 原始檔 | 網址 |
| --- | --- | --- |
| 學院介紹 | `src/pug/index.pug` | `https://www.ehanlin.com.tw/infos/about/` |
| 師長推薦 | `src/pug/recommend.pug` | `https://www.ehanlin.com.tw/infos/about/recommend.html` |
| 404 | `src/pug/404.pug` | `https://www.ehanlin.com.tw/infos/about/404.html` |

⚠️ repo 名稱叫 `info-about`，但舊版 README 的標題寫「隱私保護政策 及 使用條款」——
那是很久以前的內容，**現在這個 repo 沒有隱私政策頁**，不要照著找。

---

#### 專案初始化

```bash
git clone --recurse-submodules git@github.com:hanlin-edu-tech/info-about.git
cd info-about
npm install
npm run build
```

需要 **Node 20**（`.nvmrc` 已指定 `v20.8.1`）。用 nvm 的話先 `nvm use`。
`.npmrc` 開了 `engine-strict=true`，Node 版本不對會直接擋下 `npm install`，
不會讓你裝到一半才發現。

⚠️ `platform-wc` 是 git submodule（頁尾與導覽列元件）。
沒有 `--recurse-submodules` 的話那個資料夾會是空的，頁面開起來沒有導覽列。
已經 clone 過的補跑 `git submodule update --init --recursive`。

---

#### 目錄結構

```
src/
├─ pug/
│  ├─ index.pug          學院介紹
│  ├─ recommend.pug      師長推薦
│  ├─ 404.pug            找不到頁面
│  ├─ head.pug           ← partial：favicon、GTM、Google Ads 追蹤碼
│  ├─ html-head.pug      ← partial：主站的共用 CSS
│  └─ html-footer.pug    ← partial：LINE 浮動鈕、back-to-top
├─ less/                 index / recommend / util
└─ img/                  照片與 favicon

platform-wc/             git submodule，導覽列與頁尾元件
dist/                    ← 建置產物，已 gitignore
```

**檔名開頭是 `head` / `html-` 的三支是 partial，不會單獨產出 HTML。**
判斷邏輯寫在 `gulpfile.js` 的 `PARTIALS`，新增 partial 記得加進去，
否則會多產出一個沒有 `<html>` 的破碎頁面。

##### 產出結構

```
dist/infos/about/index.html
dist/infos/about/recommend.html
dist/infos/about/404.html
dist/infos/about/2.0.0/css/     ← 2.0.0 來自 package.json 的 version
dist/infos/about/2.0.0/img/
dist/infos/about/2.0.0/lib/     ← dependencies 整包複製進來
```

⚠️ **改 `package.json` 的 `version` 會改變靜態資源的網址**（`./2.0.0/css/index.css`）。
pug 與 less 都用 `${version}` 組路徑，改版號等於整批資源換位置，
舊路徑的檔案不會自動刪除。沒有特別理由不要動。

---

#### gulp task

| 指令 | 說明 |
| --- | --- |
| `npm run build` | 清空 `dist/` 後重新建置（pug → html、less → css、複製 img 與 lib）|
| `npm run dev` | 建置一次後監看 `src/` 變動自動重建 |
| `npm run uploadGcsTest` | 建置後上傳**測試機**，自動帶 `--noindex` |
| `npm run uploadGcsProd` | 建置後上傳**正式機** |

---

#### 部署

##### 部署目的地

| 環境 | 網址 | bucket | GCP 專案 | 憑證 |
| --- | --- | --- | --- | --- |
| 測試機 | `https://www.tbbt.com.tw/infos/about/` | `tutor-test-info` | `tutor-test-238709` | `tutor-test.json` |
| 正式機 | `https://www.ehanlin.com.tw/infos/about/` | `tutor-infos` | `tutor-204108` | `tutor.json` |

上傳帶 `public: true` 與 `Cache-Control: no-store, no-transform`，
**推上去就是最新的，不需要清 CDN 快取。**

⚠️ `tutor-infos` 是**共用 bucket**，`/infos/` 底下還有其他專案（sitemap 等）。
上傳只覆寫 `dist/` 裡有的檔案，不會刪除 bucket 上的其他物件——但也因此
**這裡沒有「清空後重新部署」這種操作**，砍錯會砍到別人的頁面。

##### 路線一：本機手動部署

把服務帳號 JSON 放到專案根目錄（`tutor-test.json` / `tutor.json`，
兩支都已列入 `.gitignore`，不會被 commit），然後：

```bash
npm run uploadGcsTest    # 測試機，需要 tutor-test.json
npm run uploadGcsProd    # 正式機，需要 tutor.json
```

憑證用的是 keyFilename，**不需要 `gcloud auth login`**。
終端機會逐檔印出上傳的物件路徑。

##### 路線二：打 tag（CI 自動部署）

| 動作 | tag 格式 | 範例 |
| --- | --- | --- |
| 部署測試機 | `v*-SNAPSHOT` | `v1.0.0-SNAPSHOT` |
| 部署正式機 | `v` + 版號，不帶後綴 | `v1.0.0` |

```bash
git tag v1.0.0-SNAPSHOT && git push origin v1.0.0-SNAPSHOT   # 測試機
git tag v1.0.0          && git push origin v1.0.0            # 正式機
```

⚠️ **這兩個 workflow 需要先設好 Repository secrets 才會動**，
在 Settings → Secrets and variables → Actions：

| Secret | 內容 |
| --- | --- |
| `GCS_TUTOR_TEST` | 測試機 GCS 服務帳號 JSON（workflow 會寫成 `tutor-test.json`）|
| `GCS_TUTOR` | 正式機 GCS 服務帳號 JSON（workflow 會寫成 `tutor.json`）|

**沒設之前請走路線一。** 內容與 `event-course-introduction`、`tutor-sitemap`
等專案是同一組服務帳號，可以沿用。

**回滾**：GCS 沒有版本控制，上傳就是覆蓋，沒有「上一版」可以還原。
要退回請 checkout 舊 commit 重新建置上傳，或在舊 commit 上打新版號。

##### `--noindex`

`npm run uploadGcsTest` 已經內建這個旗標，正常情況不用自己加。

它會把 `dist/` 裡每支 HTML 的 `robots` 改成 `noindex,nofollow`。
測試網址 `www.tbbt.com.tw` 是公開的，這幾頁又帶 `title` 與 `Description`，
不擋會被搜尋引擎收錄成正式頁的重複內容。

⚠️ **只改 `dist/`，原始碼一個字不動；正式機絕對不要加**——
`noindex` 會讓整頁從搜尋結果消失。

---

#### ⚠️ 已知問題：test 與 master 的建置產物完全一樣

`package.json` 的 `branch.test.platformUrl` 被設成 **正式站** `https://www.ehanlin.com.tw`
（不是測試站），`s3Path` 兩邊也相同，`webcomponentVersion` 則沒有任何樣板在用。

實測結果：**test 與 master 兩種建置產出的三支 HTML 位元組完全相同。**

所以測試機與正式機的上傳指令，差別只在三件事：

1. 上傳到哪個 bucket
2. 用哪支憑證
3. 測試機多一道 `--noindex`

**頁面內容本身沒有差別。** 造成的實際影響是：測試站上那幾頁載入的
`platform-icon.css`、`back-to-top.js`、LINE 客服連結**都指向正式站**。

這是這個 repo 原本就有的設定，**沒有在 2026-09 的重寫裡一併修改**，
因為那會改變測試機的行為。要修的話改 `package.json` 的
`branch.test.platformUrl` 為 `https://www.tbbt.com.tw` 即可。

---

#### 2026-09 的重寫：原本壞在哪

這份建置與部署設定在 2026-09 整個重寫過，因為舊的已經完全不能用：

| 原本 | 問題 |
| --- | --- |
| gulp 3.9.1 | Node 12 以上就會拋 `primordials is not defined`，跑不起來 |
| Travis CI（`.travis.yml`）| 服務已停用，GitHub 上只剩 Dependabot，沒有任何部署 workflow |
| `gcs.json.enc` | Travis 加密的憑證，本機解不開 |

**結果是這個 repo 合併之後沒有任何機制能把改動送上線。**

現在改成與其他專案一致：gulp 5 + `@google-cloud/storage`，
憑證直接用 repo 內的 `tutor-test.json` / `tutor.json`。舊版可用 git 歷史查閱。

`.travis.yml` 與 `gcs.json.enc` 已在同一次重寫中刪除——兩支都已完全失效，
留著只會讓人以為部署還有第三條路。需要查閱請看 git 歷史。

---

#### 部署前檢查

```bash
npm run build            # 本機能建置成功
npx gulp dev             # 監看模式，直接開 dist/infos/about/index.html 目視確認
```

建置產物與線上版本的比對（重寫時用過，改動後值得再跑一次）：

```bash
curl -s https://www.ehanlin.com.tw/infos/about/2.0.0/css/index.css > /tmp/live.css
diff /tmp/live.css dist/infos/about/2.0.0/css/index.css   # 應該沒有差異
```
