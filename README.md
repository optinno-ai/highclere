# highclere

買取店舗の買取商品・買取価格を取得するスクリプト群。

## 買取商店 - カメラカテゴリ取得スクリプト

`scripts/scrape-kaitorishouten-camera.js`

買取商店(https://www.kaitorishouten-co.jp/)のカメラ・カメラ周辺機器カテゴリから、
商品名・JANコード・買取額を取得する。買取額が空欄(お問い合わせ扱い)の商品はスキップする。

### セットアップ

初回のみ、依存パッケージとPlaywright用のChromiumをインストールする。

```bash
npm install
npx playwright install chromium
```

### 実行方法

```bash
npm run scrape:kaitorishouten:camera
```

または直接実行する場合:

```bash
node scripts/scrape-kaitorishouten-camera.js
```

### 出力

`output/kaitorishouten_camera.json` に実行時点の最新状態を上書き保存する(履歴は蓄積しない)。

```json
{
  "store": "買取商店",
  "storeUrl": "https://www.kaitorishouten-co.jp/",
  "category": "カメラ・カメラ周辺機器",
  "scrapedAt": "2026-07-13T15:13:33.162Z",
  "totalProducts": 780,
  "products": [
    { "productName": "...", "janCode": "...", "priceYen": 63000 }
  ]
}
```

### 補足

- 全ページ(現状42ページ、約780商品)を巡回するため、実行完了まで数分かかる。
- サイトの直リンク防止(リファラー/セッションチェック)を回避するため、Playwrightでトップページ
  訪問後にナビゲーションをクリックして遷移する実装になっている。直接カテゴリURLへ`goto`すると
  404になるため注意。

## 買取wiki - 全カテゴリ取得スクリプト

`scripts/scrape-kaitoriwiki-camera.js`

買取wiki(https://camerakaitori.tokyo/)はサイト全体がカメラ関連商品(デジタル一眼カメラ、
ビデオカメラ、レンズ、ドローン、カメラアクセサリー等)の買取店舗のため、全カテゴリ横断の
「/category/」一覧から商品名・JANコード・買取額を取得する。買取額が空欄の商品はスキップする。

### 実行方法

```bash
npm run scrape:kaitoriwiki:camera
```

または直接実行する場合:

```bash
node scripts/scrape-kaitoriwiki-camera.js
```

### 出力

`output/kaitoriwiki_camera.json` に実行時点の最新状態を上書き保存する(履歴は蓄積しない)。
出力フォーマットは買取商店のスクリプトと同じ(`store`/`storeUrl`/`category`/`scrapedAt`/
`totalProducts`/`products`)。

### 補足

- 全22ページ、約690商品を巡回するため、実行完了まで数分かかる。
- 買取商店と異なりリファラー/セッションチェックが無く、`/category/`(1ページ目)と
  `/category/all/2`, `/category/all/3`... の単純なURLページネーションで直接アクセス可能。
