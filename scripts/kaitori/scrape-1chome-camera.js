// 買取１丁目 (https://www.1-chome.com/) のカメラ関連カテゴリから
// 商品名・JANコード・買取額を取得する。
//
// このサイトはVue製のSPAだが、商品一覧はJSON API(/api/goods/listPage)を直接HTTPで
// 叩けば取得できるため、Playwright(実ブラウザ)は不要。
// カテゴリツリー(/api/keitai/getAllCateTreeList)を確認したところ、「家電」ルート配下に
// 「【カメラ・本体・周辺機器】」という中間カテゴリ(cateCode=10000001)があり、配下の
// デジタル一眼カメラ・一体型デジタルカメラ・交換レンズ・アクションカメラ・ビデオカメラ・
// カメラ周辺機器・インスタントカメラ・チェキフイルム・SDカード・バッテリーを横断的に
// 一括取得できる(親カテゴリのcateCodeを渡すと配下の孫カテゴリまで含めて返る)。
// これとは別に、WEBカメラ(PCパーツ・周辺機器配下)とネットワークカメラ・防犯カメラ
// (住宅設備配下)がカメラ関連ながら別系統の親を持つため、個別に追加している。
//
// 1商品(goodsId)は状態(kbName。このカテゴリでは実質「新品」のみ)ごとに1レコードとして
// 並び、その中でも「印(購入店シール)なし/あり」等の細かい条件別価格が goodsKbDetails に
// 複数入っている。サイト上はこれらがラジオボタンで選択式に表示され、価格は条件により
// 異なるため、最も高い価格(最良条件)を買取額として採用する。

const fs = require('fs');
const path = require('path');

const STORE_URL = 'https://www.1-chome.com/';
const API_URL = 'https://www.1-chome.com/api/goods/listPage';
const OUTPUT_PATH = path.join(__dirname, '..', '..', 'output', '1-chome_camera.json');
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PAGE_SIZE = 100;

// カメラ関連カテゴリ(親カテゴリを渡すと配下カテゴリの商品も含めて返る)
const CATEGORIES = [
  { cateCode: '10000001', label: 'カメラ・本体・周辺機器' },
  { cateCode: '20779584', label: 'WEBカメラ' },
  { cateCode: '20162506', label: 'ネットワークカメラ・防犯カメラ' },
];

async function fetchPage(cateCode, pageNo) {
  const url = new URL(API_URL);
  url.search = new URLSearchParams({
    accCode: '',
    page: String(pageNo),
    size: String(PAGE_SIZE),
    keyword: '',
    isImpo: 'true',
    isCampaign: 'false',
    cateCode,
    kbNames: '',
    cateName: '',
  }).toString();

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const json = await res.json();
  if (json.code !== 200) throw new Error(`API error: ${json.msg}`);
  return json.data;
}

function parseProduct(raw) {
  const prices = (raw.goodsKbDetails || [])
    .map((d) => d.kbDetailPrice)
    .filter((p) => typeof p === 'number' && p > 0);
  if (prices.length === 0) return null; // 買取価格が無い商品はスキップ

  let name = raw.title || '';
  if (raw.jan && name.endsWith(raw.jan)) {
    name = name.slice(0, name.length - raw.jan.length).trim();
  }

  return {
    productName: name,
    janCode: raw.jan || null,
    priceYen: Math.max(...prices),
  };
}

async function scrapeCategory(category) {
  const rows = [];
  let pageNo = 1;
  while (true) {
    const data = await fetchPage(category.cateCode, pageNo);
    if (!data.content || data.content.length === 0) break;

    rows.push(...data.content);
    console.log(`  ページ ${pageNo}: ${data.content.length}件`);
    if (pageNo >= data.totalPages) break;
    pageNo++;
    await new Promise((r) => setTimeout(r, 300)); // 過負荷回避
  }
  return rows;
}

async function main() {
  const allRows = [];
  for (const category of CATEGORIES) {
    console.log(`カテゴリ: ${category.label} (${category.cateCode})`);
    const rows = await scrapeCategory(category);
    allRows.push(...rows);
  }

  // goodsId(商品ID)で重複排除
  const uniqueRows = Array.from(new Map(allRows.map((r) => [r.goodsId, r])).values());
  const products = uniqueRows.map(parseProduct).filter(Boolean);

  const output = {
    store: '買取１丁目',
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
