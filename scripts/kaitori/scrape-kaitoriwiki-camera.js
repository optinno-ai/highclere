// 買取wiki (https://camerakaitori.tokyo/) の全カテゴリ(カメラ本体・レンズ・ビデオカメラ・
// ドローン・カメラアクセサリー等、サイト全体がカメラ関連)から商品名・JANコード・買取額を取得する。
//
// このサイトは買取商店と異なりリファラー/セッションチェックが無く、カテゴリ一覧ページへの
// 直接アクセスが可能。「/category/」の「すべて」タブが全カテゴリ横断の一覧になっており、
// 「/category/」がページ1、以降「/category/all/2」「/category/all/3」...と単純なURL
// ページネーションになっている。

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FIRST_PAGE_URL = 'https://camerakaitori.tokyo/category/';
const PAGE_URL = (n) => `https://camerakaitori.tokyo/category/all/${n}`;
const OUTPUT_PATH = path.join(__dirname, '..', '..', 'output', 'kaitoriwiki_camera.json');
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function extractRows(page) {
  return page.$$eval('.pro_list', (cards) =>
    cards.map((card) => {
      const nameEl = card.querySelector('.sub-pro-name a');
      const janLi = Array.from(card.querySelectorAll('.sub-pro-name')).find(
        (li) => !li.querySelector('a')
      );
      const priceEl = card.querySelector('.sub-pro-jia span');
      const link = nameEl ? nameEl.getAttribute('href') : null;

      return {
        id: link,
        name: nameEl ? nameEl.textContent.trim() : '',
        jan: janLi ? janLi.textContent.replace(/JAN[:：]\s*/, '').trim() : null,
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

      // 商品名の末尾にJANコードが重複表記されている場合は取り除く
      let name = row.name;
      if (row.jan && name.endsWith(row.jan)) {
        name = name.slice(0, name.length - row.jan.length).trim();
      }

      return {
        productName: name,
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
  let pageNo = 1;
  while (true) {
    const url = pageNo === 1 ? FIRST_PAGE_URL : PAGE_URL(pageNo);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

    const rows = await extractRows(page);
    if (rows.length === 0) {
      console.log(`ページ ${pageNo}: 商品なし。終了します。`);
      break;
    }

    allRows.push(...rows);
    console.log(`ページ ${pageNo}: ${rows.length}件`);
    pageNo++;
    await page.waitForTimeout(300); // 過負荷回避
  }

  await browser.close();

  // id(商品詳細URL)で重複排除
  const uniqueRows = Array.from(new Map(allRows.map((r) => [r.id, r])).values());
  const products = parseProductRows(uniqueRows);

  const output = {
    store: '買取wiki',
    storeUrl: 'https://camerakaitori.tokyo/',
    category: '全カテゴリ',
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
