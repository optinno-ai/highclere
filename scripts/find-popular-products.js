// 全店舗の買取データを突き合わせ、「すべての店舗が買取対象にしている商品」を抽出する。
//
// 人気商品ほど多くの買取店舗が買取対象にしたがり、かつ利益が出るギリギリの高額を
// 提示するため店舗間で買取価格が拮抗する傾向がある。逆に言えば、全店舗のカタログに
// 共通して存在するJANコードの商品は「仕入れ候補として狙い目の人気商品」の目印になる。
//
// output/ 配下の *_camera.json (各店舗のスクレイピング結果、store/products{janCode,
// productName,priceYen}を持つもの)を自動的に読み込むため、新しい店舗の出力ファイルが
// 増えてもこのスクリプトの編集は不要(全店舗共通のJANコードだけが対象になるため、
// 店舗数が増えるほど抽出される商品は絞り込まれる)。
//
// 商品名はJANコードが同じでも店舗ごとに表記が微妙に異なることがあるため、
// 最初に読み込んだ店舗(ファイル名の昇順で先頭)の表記をそのまま採用する。

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const RESULT_PATH = path.join(OUTPUT_DIR, 'popular-products.json');

function loadStoreFiles() {
  return fs
    .readdirSync(OUTPUT_DIR)
    .filter((f) => f.endsWith('_camera.json'))
    .sort()
    .map((f) => {
      const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, f), 'utf-8'));
      const byJan = new Map();
      for (const p of data.products) {
        if (!p.janCode) continue; // JAN不明の商品は突き合わせ不能なため対象外
        byJan.set(p.janCode, p);
      }
      return { file: f, store: data.store, byJan };
    });
}

function findCommonProducts(stores) {
  if (stores.length === 0) return [];

  let commonJanCodes = new Set(stores[0].byJan.keys());
  for (const store of stores.slice(1)) {
    commonJanCodes = new Set([...commonJanCodes].filter((jan) => store.byJan.has(jan)));
  }

  return [...commonJanCodes]
    .sort()
    .map((janCode) => {
      const productName = stores.find((s) => s.byJan.has(janCode)).byJan.get(janCode).productName;
      const prices = {};
      for (const store of stores) {
        prices[store.store] = store.byJan.get(janCode).priceYen;
      }
      return { janCode, productName, prices };
    });
}

function main() {
  const stores = loadStoreFiles();
  if (stores.length === 0) {
    console.log(`${OUTPUT_DIR} に *_camera.json が見つかりませんでした。先に各店舗の取得スクリプトを実行してください。`);
    return;
  }

  console.log(`対象店舗: ${stores.map((s) => `${s.store}(${s.byJan.size}件)`).join(', ')}`);

  const products = findCommonProducts(stores);

  const output = {
    generatedAt: new Date().toISOString(),
    storeCount: stores.length,
    stores: stores.map((s) => s.store),
    totalPopularProducts: products.length,
    products,
  };

  fs.writeFileSync(RESULT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`完了: 全${stores.length}店舗に共通する${products.length}件を ${RESULT_PATH} に保存しました`);
}

main();
