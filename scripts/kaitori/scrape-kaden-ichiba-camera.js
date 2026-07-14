// 家電市場 (https://www.kaden-ichiba.com/) のカメラ関連カテゴリから
// 商品名・JANコード・買取額(プライム価格)を取得する。
//
// このサイトは他店舗と異なりトップページ経由の遷移やリファラーチェックが不要で、
// カテゴリURL(/item/node/{カテゴリID}/{カテゴリ名})へ直接アクセスできる。
// サイト全体がジャンル横断の総合家電買取店のため、カメラを横断的に一括取得できる
// カテゴリは存在せず、ナビゲーションからカメラ関連の個別カテゴリを手動で洗い出して
// 順に巡回する。
//
// 1ページ目: /item/node/{id}/{name}
// 2ページ目以降: /item/node/{id}/{name}?node={id}&page={n}
// ページ番号が存在しない場合は商品0件で返るため、0件になった時点で次のカテゴリへ進む。

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const STORE_URL = 'https://www.kaden-ichiba.com/';
const OUTPUT_PATH = path.join(__dirname, '..', '..', 'output', 'kaden-ichiba_camera.json');
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// カメラ関連カテゴリ(ナビゲーションから洗い出した、カメラ本体・レンズ・関連アクセサリー)
const CATEGORIES = [
  { id: '0049', name: 'デジタル一眼カメラ' },
  { id: '0050', name: 'デジタルカメラ' },
  { id: '2020', name: 'ビデオカメラ' },
  { id: '7033', name: '車載カメラ' },
  { id: '1008', name: 'ネットワークカメラ・防犯カメラ' },
  { id: '1007', name: 'WEBカメラ' },
  { id: '1040', name: 'インスタントカメラ' },
  { id: '1098', name: 'その他カメラ関連製品' },
  { id: '1080', name: 'カメラ バッテリー' },
  { id: '1050', name: 'レンズ' },
  { id: '1052', name: 'コンバージョンレンズ・アダプタ' },
  { id: '1060', name: 'フラッシュ・ストロボ' },
  { id: '7758', name: 'ドローン・マルチコプター' },
];

function categoryUrl(category, pageNo) {
  const base = `${STORE_URL}item/node/${category.id}/${encodeURIComponent(category.name)}`;
  return pageNo === 1 ? base : `${base}?node=${category.id}&page=${pageNo}`;
}

async function extractRows(page) {
  return page.$$eval('tr[id^="row-data-"]', (trs) =>
    trs.map((tr) => {
      const nameTd = tr.querySelector('td[style*="min-width"]');
      const nameEl = nameTd ? nameTd.querySelector('strong') : null;
      const janEl = tr.querySelector('span[id^="ean-area-"] small');
      // 価格列は3つ(プライム価格/新品価格/中古価格)+カート追加ボタンの計4つ。
      // 最初の1つ(プライム価格。買取店が提示する買取額)のみを使用する。
      const priceTd = tr.querySelectorAll('td.project-title')[0];
      const priceEl = priceTd ? priceTd.querySelector('strong') : null;

      return {
        id: tr.id,
        name: nameEl ? nameEl.textContent.trim() : '',
        jan: janEl ? janEl.textContent.trim() : null,
        price: priceEl ? priceEl.textContent.trim() : '',
      };
    })
  );
}

function parseProductRows(rows) {
  return rows
    .map((row) => {
      const priceText = (row.price || '').replace(/[^0-9]/g, '');
      if (!priceText) return null; // 買取額が空欄(お問い合わせ扱い)の商品はスキップ
      return {
        productName: row.name,
        janCode: row.jan || null,
        priceYen: Number(priceText),
      };
    })
    .filter(Boolean);
}

async function scrapeCategory(page, category) {
  const rows = [];
  let pageNo = 1;
  while (true) {
    await page.goto(categoryUrl(category, pageNo), { waitUntil: 'networkidle', timeout: 60000 });
    const pageRows = await extractRows(page);
    if (pageRows.length === 0) break;

    rows.push(...pageRows);
    console.log(`  ページ ${pageNo}: ${pageRows.length}件`);
    pageNo++;
    await page.waitForTimeout(300); // 過負荷回避
  }
  return rows;
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ userAgent: USER_AGENT });
  const page = await context.newPage();

  const allRows = [];
  for (const category of CATEGORIES) {
    console.log(`カテゴリ: ${category.name} (${category.id})`);
    const rows = await scrapeCategory(page, category);
    allRows.push(...rows);
  }

  await browser.close();

  // id(商品ID)で重複排除
  const uniqueRows = Array.from(new Map(allRows.map((r) => [r.id, r])).values());
  const products = parseProductRows(uniqueRows);

  const output = {
    store: '家電市場',
    storeUrl: STORE_URL,
    category: 'カメラ関連',
    scrapedAt: new Date().toISOString(),
    totalProducts: products.length,
    products,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`完了: ${products.length}件を ${OUTPUT_PATH} に保存しました`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
