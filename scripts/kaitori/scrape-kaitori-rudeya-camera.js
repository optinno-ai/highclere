// 買取ルデヤ (https://kaitori-rudeya.com/) のカメラ関連カテゴリから
// 商品名・JANコード・買取額を取得する。
//
// このサイトはカテゴリごとに全商品が1ページに出力される(ページネーションが存在しない、
// 無限スクロールでもない静的なサーバーレンダリングHTML)ため、カテゴリURLへアクセスして
// 商品カードを1回抽出するだけで良い。
// トップページのナビゲーションから洗い出したカメラ関連の10カテゴリを順に巡回する。
//
// 「買取強化中！商品」欄と通常の商品一覧欄の両方に同一商品が重複掲載されることがある
// ため、商品詳細URL(/product/item/{id})のIDで重複排除する。

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const STORE_URL = 'https://kaitori-rudeya.com/';
const OUTPUT_PATH = path.join(__dirname, '..', '..', 'output', 'kaitori-rudeya_camera.json');
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// カメラ関連カテゴリ(トップページのナビゲーションから洗い出したもの)
const CATEGORIES = [
  { id: 10, label: 'デジタル一眼カメラ' },
  { id: 11, label: 'デジタルカメラ' },
  { id: 12, label: 'ビデオカメラ' },
  { id: 13, label: 'レンズ' },
  { id: 65, label: 'フラッシュ・ストロボ' },
  { id: 131, label: 'チェキ・インスタントカメラ' },
  { id: 171, label: 'フィルムカメラ' },
  { id: 191, label: 'ネットワークカメラ・防犯カメラ' },
  { id: 195, label: 'カメラバッテリー' },
  { id: 210, label: 'カメラケース' },
];

function categoryUrl(category) {
  return `${STORE_URL}category/detail/${category.id}`;
}

async function extractRows(page) {
  return page.$$eval('article.pgrid-card', (cards) =>
    cards.map((card) => {
      const nameEl = card.querySelector('.product-card-name-link');
      const janEl = card.querySelector('.product-card-jan-text');
      const priceEl = card.querySelector('.product-card-price-value');
      const href = nameEl ? nameEl.getAttribute('href') : '';
      const idMatch = href ? href.match(/\/product\/item\/(\d+)/) : null;

      return {
        id: idMatch ? idMatch[1] : href,
        name: nameEl ? nameEl.textContent.trim() : '',
        jan: janEl ? janEl.textContent.replace(/^JAN:\s*/, '').trim() : null,
        price: priceEl ? priceEl.textContent.trim() : '',
      };
    })
  );
}

function parseProductRows(rows) {
  return rows
    .map((row) => {
      const priceText = (row.price || '').replace(/[^0-9]/g, '');
      if (!priceText) return null; // 買取額が空欄(未定/発売前等)の商品はスキップ
      return {
        productName: row.name,
        janCode: row.jan || null,
        priceYen: Number(priceText),
      };
    })
    .filter(Boolean);
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ userAgent: USER_AGENT });
  const page = await context.newPage();

  const allRows = [];
  for (const category of CATEGORIES) {
    await page.goto(categoryUrl(category), { waitUntil: 'networkidle', timeout: 60000 });
    const rows = await extractRows(page);
    allRows.push(...rows);
    console.log(`カテゴリ: ${category.label} (${category.id}): ${rows.length}件`);
    await page.waitForTimeout(300); // 過負荷回避
  }

  await browser.close();

  // 商品ID(詳細URLの/product/item/{id})で重複排除
  const uniqueRows = Array.from(new Map(allRows.map((r) => [r.id, r])).values());
  const products = parseProductRows(uniqueRows);

  const output = {
    store: '買取ルデヤ',
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
