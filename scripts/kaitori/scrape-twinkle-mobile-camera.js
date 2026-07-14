// トゥインクルモバイル (https://twinkle-mobile.com/) のカメラ関連カテゴリから
// 商品名・JANコード・買取額を取得する。
//
// このサイトはNext.js製で、カテゴリ一覧ページは通常のHTTP GETでは商品テーブルが
// 空(サーバーからのプレースホルダーHTML)で返り、クライアント側のハイドレーション後に
// 商品データが描画される。そのためPlaywrightで実際にページを開き、テーブル行が描画
// されるのを待ってから抽出する。このサイトは`waitUntil: 'networkidle'`だと裏で動く
// 常時接続(トラッキング等)のせいでタイムアウトすることがあるため、
// `domcontentloaded` + テーブル出現待ち + 短い固定待機で代用している。
//
// カテゴリ一覧(/api/bizCategory/tree)を確認したところ、カメラ関連は以下の4系統。
// 「カメラ」「カメラレンズ」「ビデオカメラ」は親カテゴリのIDをURLに指定するだけで
// 配下の全ブランド(子カテゴリ)の商品を横断的に取得できる。「ネットワークカメラ・
// 防犯カメラ」だけは「その他(276)」配下の孫カテゴリのため、URLに親子両方のIDを含む
// フルパスを指定する必要がある(末尾IDだけ指定すると0件になる)。
//
// URL形式: /shop/products/category/{フルカテゴリパス}?page={n}&pageSize=24

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const STORE_URL = 'https://twinkle-mobile.com/';
const OUTPUT_PATH = path.join(__dirname, '..', '..', 'output', 'twinkle-mobile_camera.json');
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PAGE_SIZE = 24;

// カメラ関連カテゴリ(categoryPathをそのままURLパスに使う)
const CATEGORIES = [
  { categoryPath: '0/111', label: 'カメラ' },
  { categoryPath: '0/120', label: 'カメラレンズ' },
  { categoryPath: '0/127', label: 'ビデオカメラ' },
  { categoryPath: '0/276/278', label: 'ネットワークカメラ・防犯カメラ' },
];

function categoryUrl(category, pageNo) {
  return `${STORE_URL}shop/products/category/${category.categoryPath}?page=${pageNo}&pageSize=${PAGE_SIZE}`;
}

async function gotoWithRetry(page, url, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      return;
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`  再試行 (${attempt}/${retries - 1}): ${url}`);
    }
  }
}

async function extractRows(page) {
  await page.waitForSelector('table tbody', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800); // ハイドレーション待ち
  return page.$$eval('table tbody tr', (trs) =>
    trs.map((tr) => {
      const nameEl = tr.querySelector('td:nth-child(2) .font-bold');
      const janEl = tr.querySelector('td:nth-child(2) .block');
      const priceEl = tr.querySelector('td:nth-child(3) .font-bold');

      return {
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
      if (!priceText) return null; // 買取額が空欄の商品はスキップ
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
    await gotoWithRetry(page, categoryUrl(category, pageNo));
    const pageRows = await extractRows(page);
    if (pageRows.length === 0) break;

    rows.push(...pageRows);
    console.log(`  ページ ${pageNo}: ${pageRows.length}件`);
    pageNo++;
    await page.waitForTimeout(400); // 過負荷回避
  }
  return rows;
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ userAgent: USER_AGENT });
  const page = await context.newPage();

  const allRows = [];
  for (const category of CATEGORIES) {
    console.log(`カテゴリ: ${category.label} (${category.categoryPath})`);
    const rows = await scrapeCategory(page, category);
    allRows.push(...rows);
  }

  await browser.close();

  // JANコードで重複排除
  const uniqueRows = Array.from(new Map(allRows.map((r) => [r.jan || r.name, r])).values());
  const products = parseProductRows(uniqueRows);

  const output = {
    store: 'トゥインクルモバイル',
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
