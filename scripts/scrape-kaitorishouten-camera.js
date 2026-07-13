// 買取商店 (https://www.kaitorishouten-co.jp/) のカメラ・カメラ周辺機器カテゴリから
// 商品名・JANコード・買取額を取得する。
//
// このサイトは直接のURLアクセス(referer/セッション無し)を403/404で弾くため、
// 必ずトップページ→ナビゲーションクリックの順でPlaywrightの実ブラウザ操作を経由する。
// カメラカテゴリはページ内タブ切り替え/ページネーションがjQuery Ajaxで実装されているため、
// ページ内のgoto_page()をそのまま呼び出して#search-contentの更新を待つ。

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TOP_URL = 'https://www.kaitorishouten-co.jp/';
const OUTPUT_PATH = path.join(__dirname, '..', 'output', 'kaitorishouten_camera.json');
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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

async function extractRows(page) {
  return page.$$eval('#search-content tr.price_list_item', (trs) =>
    trs.map((tr) => {
      const nameCell = tr.querySelector('td:nth-child(2)');
      const priceEl = tr.querySelector('.item-price');
      const janEl = nameCell
        ? nameCell.querySelectorAll('.product-code-default')[1]
        : null;

      // 商品名は名前セルの直接のテキストノードのみ（JAN等の子要素を除く）
      let name = '';
      if (nameCell) {
        for (const node of nameCell.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            name += node.textContent;
          }
        }
      }

      return {
        id: tr.id,
        name: name.trim(),
        jan: janEl ? janEl.textContent.trim() : null,
        price: priceEl ? priceEl.textContent.trim() : '',
      };
    })
  );
}

async function getMaxPage(page) {
  const lastPageHref = await page
    .$eval('.ec-pager a:has-text("最後へ")', (a) => a.getAttribute('href'))
    .catch(() => null);
  if (lastPageHref) {
    const m = lastPageHref.match(/goto_page\('(\d+)'\)/);
    if (m) return Number(m[1]);
  }
  // 「最後へ」が無い(ページ数が少ない)場合は番号付きページの最大値を見る
  const nums = await page.$$eval('.ec-pager a', (as) =>
    as
      .map((a) => {
        const m = (a.getAttribute('href') || '').match(/goto_page\('(\d+)'\)/);
        return m ? Number(m[1]) : null;
      })
      .filter((n) => n !== null)
  );
  return nums.length ? Math.max(...nums) : 1;
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ userAgent: USER_AGENT });
  const page = await context.newPage();

  console.log('トップページへアクセス...');
  await page.goto(TOP_URL, { waitUntil: 'networkidle', timeout: 60000 });

  console.log('カメラカテゴリへ遷移...');
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.click('a:has-text("カメラ")'),
  ]);
  await page.waitForTimeout(1000); // ページ内インラインスクリプト(goto_page定義)の実行待ち

  const maxPage = await getMaxPage(page);
  console.log(`総ページ数: ${maxPage}`);

  const allRows = [];
  for (let pageNo = 1; pageNo <= maxPage; pageNo++) {
    if (pageNo > 1) {
      await page.evaluate((n) => goto_page(String(n)), pageNo);
      await page.waitForFunction(
        (n) => document.querySelector('#current_page')?.value === String(n),
        pageNo,
        { timeout: 30000 }
      );
      await page.waitForTimeout(300); // 描画待ち + 過負荷回避
    }

    const rows = await extractRows(page);
    allRows.push(...rows);
    console.log(`ページ ${pageNo}/${maxPage}: ${rows.length}件`);
  }

  await browser.close();

  // id重複排除
  const uniqueRows = Array.from(new Map(allRows.map((r) => [r.id, r])).values());
  const products = parseProductRows(uniqueRows);

  const output = {
    store: '買取商店',
    storeUrl: TOP_URL,
    category: 'カメラ・カメラ周辺機器',
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
