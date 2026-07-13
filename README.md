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
