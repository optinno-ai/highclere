# highclere

買取店舗の買取商品・買取価格を取得し、そこから人気商品を特定して、仕入店舗での
仕入価格(販売価格・ポイント・クーポン)を調査するスクリプト群。

## ディレクトリ構成

- `scripts/kaitori/` — 買取店舗(消費者からカメラ関連商品を買取るお店)のスクレイピング
  スクリプト群。
- `scripts/shiire/` — 仕入店舗(買取店舗が欲しがる人気商品を、こちらが仕入れる先の
  販売店。Yahoo!ショッピング/楽天市場等)の価格調査スクリプト群。サインインが必要な
  ため、ログイン用スクリプト(`login.js`)も含む。
- `scripts/` 直下 — 複数店舗のデータを横断して扱うスクリプト(`scrape-all.js`、
  `find-popular-products.js`等)。
- 買取店舗と仕入店舗はスクリプトの目的(取得 vs サインイン付き検索)が異なるため、
  ディレクトリを分けている。
- `.auth/` — 仕入店舗のサインインセッション(Cookie)の保存先。`.gitignore`対象で、
  パスワードそのものは含まない。

## 買取店舗一斉実行スクリプト

`scripts/scrape-all.js`

`scripts/kaitori/` 配下の `scrape-*.js` を自動的に検出し、全買取店舗の取得スクリプト
を並列実行する。各店舗は互いに別ドメインへアクセスするため並列実行しても相互に悪影響
は無い(同一サイトへの過負荷回避は各スクリプト内のページ間ウェイトで個別に対応済み)。

新しい買取店舗のスクリプトを追加する場合は、`scripts/kaitori/scrape-〇〇.js` という
命名で配置するだけでよい。**このスクリプト自体の編集は不要**で、次回実行時から自動的
に対象に含まれる(`npm run scrape:xxx` の個別コマンドは`package.json`への追記が必要)。

### 実行方法

```bash
npm run scrape:all
```

または直接実行する場合:

```bash
node scripts/scrape-all.js
```

### 出力

各スクリプトがそれぞれの`output/*.json`に結果を保存する(このスクリプト自体は
出力ファイルを持たない)。実行完了後、コンソールに店舗ごとの成否と所要時間の
まとめを表示する。1つでも失敗したスクリプトがあれば、終了コードが非0になる。

### 補足

- 各店舗の標準出力/標準エラー出力は`[店舗名] `のプレフィックス付きでそのまま
  コンソールに流れる(並列実行のためログは入り混じる)。

## 人気商品ピックアップスクリプト(仕入れ候補の特定)

`scripts/find-popular-products.js`

人気商品ほど多くの買取店舗が買取対象にしたがり、かつ各店舗が利益の出るギリギリの
高額を提示するため、店舗間で買取価格が拮抗する傾向がある。この性質を利用し、
「全店舗のカタログに共通して存在するJANコードの商品」を仕入れ候補の人気商品として
抽出する。

`output/`配下の各店舗の取得結果(`*_camera.json`)を読み込み、全ファイルに共通する
JANコードの商品について、JANコード・商品名・各店舗の買取価格をJSONで出力する。
商品名はJANコードが同じでも店舗ごとに表記が微妙に異なることがあるため、最初に
読み込んだ店舗(ファイル名の昇順で先頭)の表記をそのまま採用している。

`output/`内の`*_camera.json`を自動的に全て読み込むため、新しい店舗の取得スクリプトを
追加してもこのスクリプトの編集は不要(店舗数が増えるほど「全店舗共通」の条件が厳しく
なり、抽出される商品も絞り込まれる)。

### 実行方法

事前に各店舗の取得スクリプト(`npm run scrape:all`等)を実行し、`output/`に
`*_camera.json`が揃っている状態で実行する。

```bash
npm run find:popular
```

または直接実行する場合:

```bash
node scripts/find-popular-products.js
```

### 出力

`output/popular-products.json`に実行時点の最新状態を上書き保存する(履歴は蓄積
しない)。

```json
{
  "generatedAt": "2026-07-14T12:34:56.789Z",
  "storeCount": 6,
  "stores": ["買取１丁目", "家電市場", "買取ルデヤ", "買取商店", "買取wiki", "トゥインクルモバイル"],
  "totalPopularProducts": 71,
  "products": [
    {
      "janCode": "...",
      "productName": "...",
      "prices": { "買取１丁目": 91000, "家電市場": 90120, "...": "..." }
    }
  ]
}
```

## 仕入店舗のサインイン

`scripts/shiire/login.js`

仕入店舗(Yahoo!ショッピング/楽天市場等)の一部の情報(会員限定ポイント上乗せ、
会員価格、クーポンの適用可否など)はサインインしていないと正しく取得できない。
Yahoo!・楽天ともID/パスワードを自動入力する方式はCAPTCHAやSMS認証でブロックされ
やすいため、実ブラウザ(画面あり)を一度だけ起動し、**ユーザー本人が手動でログイン**
する方式を採用している。ログイン完了後のセッション(Cookie)を`.auth/{platform}.json`
に保存し、以降の仕入店舗スクリプトはそのセッションを読み込んで動く。**パスワード自体は
一切保存しない。**

対応プラットフォームは`scripts/shiire/login.js`内の`PLATFORMS`に定義する。現時点では
`yahoo`・`rakuten`に対応。新しいプラットフォームを追加する場合は、`PLATFORMS`に
ログインURL・セッション保存先・ログイン確認用ページ等のエントリを1つ追加すればよい。

### 実行方法

```bash
npm run auth:yahoo
npm run auth:rakuten
```

または直接実行する場合:

```bash
node scripts/shiire/login.js yahoo
node scripts/shiire/login.js rakuten
```

ブラウザが開くので、その画面上でログイン(2段階認証等を含む)を完了し、ターミナルに
戻って Enter キーを押すとセッションが保存される。

### 出力

`.auth/yahoo.json` / `.auth/rakuten.json`(Playwrightの`storageState`形式。Cookie等を
含むため`.gitignore`対象。パスワードは含まない)。

### 補足

- セッションには有効期限があるため、仕入店舗スクリプトが正しい価格を取得できなくなって
  きたら再度このスクリプトを実行してセッションを更新する。
- ここで保存したセッションは日常利用しているYahoo!/楽天アカウントに紐づく。仕入店舗
  スクリプト側では、アカウントが不審な自動操作としてフラグされるリスクを避けるため、
  リクエスト間隔を意図的に長め(1.2秒)に取っている。

## コジマYahoo!店 - 仕入価格取得スクリプト

`scripts/shiire/kojima-yahoo.js`

コジマYahoo!店(https://store.shopping.yahoo.co.jp/y-kojima/)で、人気商品
(`output/popular-products.json`)のJANコードを1件ずつ検索し、サインイン状態での
販売価格・獲得ポイント・クーポン情報を取得する。事前に`npm run auth:yahoo`で
ログインしておく必要がある(セッションが無い場合はエラーで終了する)。

価格・ポイントは商品ページに埋め込まれているNext.jsのページデータ(`__NEXT_DATA__`)
から取得する。表示用HTMLのクラス名を直接パースするより安定しており、現在のログイン
状態で適用される価格(`applicablePrice`)や、ログイン/プレミアム会員限定のポイント
上乗せキャンペーンまで構造化データとしてそのまま得られる。クーポンは同じページが
裏で呼んでいる専用API(`syene-bff`)を直接叩いて取得する。

クーポンは「獲得する」ボタンを自動クリックしない(表示されている条件・上限額の情報
のみ取得する)。そのため、獲得操作が必要なクーポンは割引確定額が0のまま返る。

検索はJANコードの文字列一致(全文検索)であり、必ずしも最初の検索結果が完全一致とは
限らないため、取得した商品ページ側のJANコードと検索対象JANコードを突き合わせ、
不一致の場合は`janMatch: false`として結果に含める。

### 実行方法

サインイン(`npm run auth:yahoo`)から通しで実行できるシェルスクリプトを用意している。

```bash
./scripts/shiire/run-kojima-yahoo.sh
```

動作確認等で件数を絞りたい場合:

```bash
./scripts/shiire/run-kojima-yahoo.sh --limit=5
```

個別に実行する場合は次の2つを順に叩けばよい。

```bash
npm run auth:yahoo
npm run shiire:kojima-yahoo -- --limit=5
```

### 出力

`output/shiire/kojima-yahoo.json`に実行時点の最新状態を上書き保存する(履歴は蓄積
しない)。

```json
{
  "store": "コジマYahoo!店",
  "storeUrl": "https://store.shopping.yahoo.co.jp/y-kojima/",
  "scrapedAt": "2026-07-14T12:34:56.789Z",
  "searchedCount": 71,
  "foundCount": 24,
  "products": [
    {
      "janCode": "4545350055974",
      "productName": "OM SYSTEM Tough TG-7 [ブラック]",
      "found": true,
      "janMatch": true,
      "productUrl": "https://store.shopping.yahoo.co.jp/y-kojima/4545350055974.html",
      "priceYen": 67050,
      "regularPriceYen": 67050,
      "points": { "ratioPercent": 5, "pointsYen": 3077, "priorityPayMethodText": "..." },
      "coupon": null
    }
  ]
}
```

### 補足

- 検索でヒットしなかった商品(コジマYahoo!店で取り扱いが無い等)は`found: false`のみ
  で記録される。
- 認証済みアカウントでの巡回のため、通常の買取店舗スクリプトよりリクエスト間隔を長め
  (1.2秒)に設定している。

## 買取商店 - カメラカテゴリ取得スクリプト

`scripts/kaitori/scrape-kaitorishouten-camera.js`

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
node scripts/kaitori/scrape-kaitorishouten-camera.js
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

`scripts/kaitori/scrape-kaitoriwiki-camera.js`

買取wiki(https://camerakaitori.tokyo/)はサイト全体がカメラ関連商品(デジタル一眼カメラ、
ビデオカメラ、レンズ、ドローン、カメラアクセサリー等)の買取店舗のため、全カテゴリ横断の
「/category/」一覧から商品名・JANコード・買取額を取得する。買取額が空欄の商品はスキップする。

### 実行方法

```bash
npm run scrape:kaitoriwiki:camera
```

または直接実行する場合:

```bash
node scripts/kaitori/scrape-kaitoriwiki-camera.js
```

### 出力

`output/kaitoriwiki_camera.json` に実行時点の最新状態を上書き保存する(履歴は蓄積しない)。
出力フォーマットは買取商店のスクリプトと同じ(`store`/`storeUrl`/`category`/`scrapedAt`/
`totalProducts`/`products`)。

### 補足

- 全22ページ、約690商品を巡回するため、実行完了まで数分かかる。
- 買取商店と異なりリファラー/セッションチェックが無く、`/category/`(1ページ目)と
  `/category/all/2`, `/category/all/3`... の単純なURLページネーションで直接アクセス可能。

## 家電市場 - カメラ関連カテゴリ取得スクリプト

`scripts/kaitori/scrape-kaden-ichiba-camera.js`

家電市場(https://www.kaden-ichiba.com/)はカメラ以外にパソコン・スマホ・家電なども扱う
総合買取店のため、サイト全体を横断的に取得できるカメラカテゴリは存在しない。ナビゲー
ションから洗い出したカメラ本体・レンズ・関連アクセサリーの13カテゴリ(デジタル一眼
カメラ、デジタルカメラ、ビデオカメラ、車載カメラ、ネットワークカメラ・防犯カメラ、
WEBカメラ、インスタントカメラ、その他カメラ関連製品、カメラ バッテリー、レンズ、
コンバージョンレンズ・アダプタ、フラッシュ・ストロボ、ドローン・マルチコプター)を
順に巡回し、商品名・JANコード・買取額(プライム価格)を取得する。買取額が空欄(お問い
合わせ扱い)の商品はスキップする。

### 実行方法

```bash
npm run scrape:kaden-ichiba:camera
```

または直接実行する場合:

```bash
node scripts/kaitori/scrape-kaden-ichiba-camera.js
```

### 出力

`output/kaden-ichiba_camera.json` に実行時点の最新状態を上書き保存する(履歴は蓄積しない)。
出力フォーマットは他店舗のスクリプトと同じ(`store`/`storeUrl`/`category`/`scrapedAt`/
`totalProducts`/`products`)。

### 補足

- 13カテゴリ×各数ページを巡回するため、実行完了まで数分かかる。
- 他店舗と異なりリファラー/セッションチェックが無く、カテゴリURL
  (`/item/node/{カテゴリID}/{カテゴリ名}`)へ直接アクセス可能。2ページ目以降は
  `?node={カテゴリID}&page={ページ番号}` を付与する。存在しないページ番号は商品0件で
  返るため、0件になった時点でそのカテゴリの巡回を終了する。
- 買取額は「プライム価格」列(強化買取等の割増施策込みで表示される、買取店が提示する
  最終的な買取額)を採用している。「新品価格」「中古価格」列は参考価格のため取得しない。

## 買取１丁目 - カメラ関連カテゴリ取得スクリプト

`scripts/kaitori/scrape-1chome-camera.js`

買取１丁目(https://www.1-chome.com/)はVue製のSPAだが、商品一覧はJSON API
(`/api/goods/listPage`)を直接HTTPで叩けば取得できるため、他店舗と異なりPlaywright
(実ブラウザ)を使用しない。カテゴリツリー(`/api/keitai/getAllCateTreeList`)を確認した
ところ、「家電」ルート配下に「【カメラ・本体・周辺機器】」という中間カテゴリ
(`cateCode=10000001`)があり、親カテゴリのcateCodeを渡すと配下のデジタル一眼カメラ・
一体型デジタルカメラ・交換レンズ・アクションカメラ・ビデオカメラ・カメラ周辺機器・
インスタントカメラ・チェキフイルム・SDカード・バッテリーを横断的に一括取得できる。
これとは別系統の親を持つWEBカメラ・ネットワークカメラ防犯カメラも個別に追加している。

### 実行方法

```bash
npm run scrape:1chome:camera
```

または直接実行する場合:

```bash
node scripts/kaitori/scrape-1chome-camera.js
```

### 出力

`output/1-chome_camera.json` に実行時点の最新状態を上書き保存する(履歴は蓄積しない)。
出力フォーマットは他店舗のスクリプトと同じ(`store`/`storeUrl`/`category`/`scrapedAt`/
`totalProducts`/`products`)。

### 補足

- 1商品(goodsId)は状態(kbName。カメラカテゴリでは実質「新品」のみ)ごとに1レコードで
  並び、その中でも「印(購入店シール)なし/あり」等の条件別に価格(`goodsKbDetails`)が
  複数入っている。サイト上はラジオボタンの選択式で表示されるため、最も高い価格(最良
  条件)を買取額として採用している。
- 買取価格が設定されていない(`goodsKbDetails`が空、または価格が0以下)商品はスキップ
  する。
- WEBカメラ・ネットワークカメラ防犯カメラは記事執筆時点で在庫0件だったが、将来的に
  商品が追加された場合に備えてカテゴリ自体は残している。

## 買取ルデヤ - カメラ関連カテゴリ取得スクリプト

`scripts/kaitori/scrape-kaitori-rudeya-camera.js`

買取ルデヤ(https://kaitori-rudeya.com/)はカテゴリごとに全商品がページネーション無しの
1ページに出力される(静的なサーバーレンダリングHTML)ため、カテゴリURL
(`/category/detail/{カテゴリID}`)へアクセスして商品カードを1回抽出するだけで良い。
トップページのナビゲーションから洗い出したカメラ関連の10カテゴリ(デジタル一眼カメラ、
デジタルカメラ、ビデオカメラ、レンズ、フラッシュ・ストロボ、チェキ・インスタント
カメラ、フィルムカメラ、ネットワークカメラ・防犯カメラ、カメラバッテリー、カメラ
ケース)を順に巡回し、商品名・JANコード・買取額を取得する。買取額が空欄(発売前・未定
扱い)の商品はスキップする。

### 実行方法

```bash
npm run scrape:kaitori-rudeya:camera
```

または直接実行する場合:

```bash
node scripts/kaitori/scrape-kaitori-rudeya-camera.js
```

### 出力

`output/kaitori-rudeya_camera.json` に実行時点の最新状態を上書き保存する(履歴は蓄積
しない)。出力フォーマットは他店舗のスクリプトと同じ(`store`/`storeUrl`/`category`/
`scrapedAt`/`totalProducts`/`products`)。

### 補足

- カテゴリページ上部の「買取強化中！商品」欄と、下部の通常の商品一覧欄の両方に同一
  商品が重複掲載されることがあるため、商品詳細URL(`/product/item/{id}`)のIDで重複
  排除している。

## トゥインクルモバイル - カメラ関連カテゴリ取得スクリプト

`scripts/kaitori/scrape-twinkle-mobile-camera.js`

トゥインクルモバイル(https://twinkle-mobile.com/)はNext.js製で、カテゴリ一覧ページは
通常のHTTP GETでは商品テーブルが空のプレースホルダーHTMLで返り、クライアント側の
ハイドレーション後に商品データが描画されるため、Playwrightで実ページを開いて抽出する
必要がある。カテゴリツリー(`/api/bizCategory/tree`)を確認したところ、カメラ関連は
「カメラ」(`0/111`)「カメラレンズ」(`0/120`)「ビデオカメラ」(`0/127`)「ネットワーク
カメラ・防犯カメラ」(`0/276/278`)の4系統。前者3つは親カテゴリのIDをURLに指定するだけ
で配下の全ブランド(子カテゴリ)の商品を横断的に取得できる。商品名・JANコード・買取額
を取得し、買取額が空欄の商品はスキップする。

### 実行方法

```bash
npm run scrape:twinkle-mobile:camera
```

または直接実行する場合:

```bash
node scripts/kaitori/scrape-twinkle-mobile-camera.js
```

### 出力

`output/twinkle-mobile_camera.json` に実行時点の最新状態を上書き保存する(履歴は蓄積
しない)。出力フォーマットは他店舗のスクリプトと同じ(`store`/`storeUrl`/`category`/
`scrapedAt`/`totalProducts`/`products`)。

### 補足

- このサイトは`waitUntil: 'networkidle'`だと裏で動く常時接続(トラッキング等)のせいで
  タイムアウトすることがあるため、`domcontentloaded` + テーブル出現待ち + 短い固定
  待機で代用している。それでも稀に失敗する場合に備え、ページ取得を1回リトライする
  仕組みを入れている。
- 「ネットワークカメラ・防犯カメラ」は「その他」カテゴリ配下の孫カテゴリのため、
  URLに末尾のカテゴリIDだけを指定すると0件になる。親子両方のIDを含むフルパス
  (`/shop/products/category/0/276/278`)を指定する必要がある点に注意。
