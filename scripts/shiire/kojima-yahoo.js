// コジマYahoo!店 (https://store.shopping.yahoo.co.jp/y-kojima/) で、人気商品
// (output/popular-products.json)のJANコードを検索し、サインイン状態での販売価格・
// 獲得ポイント・クーポン情報を取得する。
//
// 事前準備: `node scripts/shiire/login.js yahoo` を実行し、Yahoo! JAPAN IDに手動で
// ログインしてセッションを `.auth/yahoo.json` に保存しておくこと(本スクリプトは
// そのセッションを読み込んで動く。無ければエラーで終了する)。
//
// 価格・ポイントは商品ページに埋め込まれているNext.jsのpageProps(__NEXT_DATA__)から
// 取得する。表示用HTMLのクラス名を直接パースするより安定しており、
// applicablePrice(現在のログイン状態で適用される価格)や、ログイン/プレミアム会員
// 限定のポイント上乗せキャンペーン一覧までそのまま構造化データで得られる。
// クーポンは同じページが裏で呼んでいる専用API(syene-bff)を直接叩いて取得する。
// クーポンは「獲得する」ボタンを自動クリックしない(表示されている条件・上限額の情報
// のみ取得する)。そのため未クレームのクーポンは discount 実額が0のまま返る場合がある。
//
// 検索はJANコードの文字列一致(全文検索)であり、必ずしも先頭の検索結果が完全一致とは
// 限らないため、取得した商品ページのJANコードと検索対象JANコードを突き合わせ、
// 一致しない場合は janMatch:false として結果に含める(誤って別商品の価格を人気商品の
// 価格と誤認しないように、利用側で判別できるようにするため)。

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SELLER_ID = 'y-kojima';
const STORE_URL = `https://store.shopping.yahoo.co.jp/${SELLER_ID}/`;
const SESSION_PATH = path.join(__dirname, '..', '..', '.auth', 'yahoo.json');
const POPULAR_PRODUCTS_PATH = path.join(__dirname, '..', '..', 'output', 'popular-products.json');
const OUTPUT_PATH = path.join(__dirname, '..', '..', 'output', 'shiire', 'kojima-yahoo.json');
const REQUEST_INTERVAL_MS = 1200; // 認証済みアカウントでの巡回のため、通常より間隔を空ける

function parseArgs() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  return { limit: limitArg ? Number(limitArg.split('=')[1]) : null };
}

function loadPopularProducts(limit) {
  if (!fs.existsSync(POPULAR_PRODUCTS_PATH)) {
    throw new Error(
      `${POPULAR_PRODUCTS_PATH} が見つかりません。先に find-popular-products.js を実行してください。`
    );
  }
  const data = JSON.parse(fs.readFileSync(POPULAR_PRODUCTS_PATH, 'utf-8'));
  return limit ? data.products.slice(0, limit) : data.products;
}

function ensureSession() {
  if (!fs.existsSync(SESSION_PATH)) {
    throw new Error(
      `${SESSION_PATH} が見つかりません。先に次のコマンドでログインしてください:\n` +
        `  node scripts/shiire/login.js yahoo`
    );
  }
}

async function findFirstItemCode(page, janCode) {
  await page.goto(`${STORE_URL}search.html?p=${janCode}`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  // Next.jsのハイドレーションがnetworkidle後に完了するため、検索結果DOMの反映を少し待つ
  // (待たないと検索結果へのリンクが一部/全く取得できないことがある)
  await page.waitForTimeout(1000);

  const zeroMatch = await page
    .getByText('検索条件に一致する商品が見つかりませんでした')
    .first()
    .isVisible()
    .catch(() => false);
  if (zeroMatch) return null;

  const hrefs = await page.$$eval(`a[href*="/${SELLER_ID}/"]`, (as) =>
    as.map((a) => a.getAttribute('href') || '')
  );
  // 商品コードは常に数字のみ(検索結果ページ自身のURL(search.html等)を誤って
  // 商品コードとして拾わないよう、英字を含むパスは除外する)
  const pattern = new RegExp(`/${SELLER_ID}/(\\d+)\\.html`);
  for (const href of hrefs) {
    const m = href.match(pattern);
    if (m) return m[1];
  }
  return null;
}

async function fetchProductData(page, itemCode) {
  const productUrl = `${STORE_URL}${itemCode}.html`;
  await page.goto(productUrl, { waitUntil: 'networkidle', timeout: 60000 });

  const nextData = await page.evaluate(() => {
    const el = document.getElementById('__NEXT_DATA__');
    return el ? JSON.parse(el.textContent) : null;
  });
  const pageProps = nextData?.props?.pageProps;
  if (!pageProps?.item) return null;

  const { item, point } = pageProps;

  const couponRes = await page.request
    .get(`https://store.shopping.yahoo.co.jp/syene-bff/v1/pc/coupon/v3/${SELLER_ID}/${itemCode}`)
    .catch(() => null);
  const couponData = couponRes && couponRes.ok() ? await couponRes.json().catch(() => null) : null;
  const firstViewCoupon = couponData?.normal?.firstViewCoupon || null;

  return {
    productUrl,
    productName: item.name,
    janCode: item.janCode || null,
    priceYen: item.applicablePrice,
    regularPriceYen: item.regularPrice,
    bargainPriceYen: item.bargainPrice,
    premiumPriceYen: item.premiumPrice,
    points: {
      ratioPercent: point?.totalPointRatio ?? null,
      pointsYen: point?.totalPoint ?? null,
      priorityPayMethodText: point?.priorityPayMethodText ?? null,
    },
    coupon: firstViewCoupon
      ? {
          name: firstViewCoupon.content,
          discountLimitText: firstViewCoupon.discountPriceLimitText,
          condition: firstViewCoupon.prefix,
          isOwned: firstViewCoupon.isOwned,
          // 未クレームの場合は0のまま返ることがある(本スクリプトではクーポンを自動取得しない)
          confirmedDiscountYen: firstViewCoupon.itemDiscountPrice,
        }
      : null,
  };
}

async function main() {
  const { limit } = parseArgs();
  ensureSession();
  const popularProducts = loadPopularProducts(limit);

  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: SESSION_PATH });
  const page = await context.newPage();

  const results = [];
  for (const [i, product] of popularProducts.entries()) {
    console.log(`[${i + 1}/${popularProducts.length}] ${product.janCode} ${product.productName}`);

    const itemCode = await findFirstItemCode(page, product.janCode);
    if (!itemCode) {
      console.log('  -> 該当商品なし');
      results.push({ janCode: product.janCode, productName: product.productName, found: false });
      await page.waitForTimeout(REQUEST_INTERVAL_MS);
      continue;
    }

    const data = await fetchProductData(page, itemCode);
    if (!data) {
      console.log('  -> 商品ページの解析に失敗');
      results.push({ janCode: product.janCode, productName: product.productName, found: false });
      await page.waitForTimeout(REQUEST_INTERVAL_MS);
      continue;
    }

    const janMatch = data.janCode === product.janCode;
    console.log(`  -> ${data.priceYen}円 (${data.points.ratioPercent}% / ${data.points.pointsYen}pt)${janMatch ? '' : ' [JAN不一致の可能性あり]'}`);
    results.push({
      janCode: product.janCode,
      productName: product.productName,
      found: true,
      janMatch,
      ...data,
    });

    await page.waitForTimeout(REQUEST_INTERVAL_MS);
  }

  await browser.close();

  const output = {
    store: 'コジマYahoo!店',
    storeUrl: STORE_URL,
    scrapedAt: new Date().toISOString(),
    searchedCount: results.length,
    foundCount: results.filter((r) => r.found).length,
    products: results,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`完了: ${output.foundCount}/${output.searchedCount}件が見つかりました。${OUTPUT_PATH} に保存しました`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
