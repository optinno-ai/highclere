// 買取店舗(仕入元の人気商品を特定するための、消費者から買取るお店)の買取価格取得
// スクリプトを一斉に実行する。
//
// scripts/kaitori/ 配下の scrape-*.js を自動的に検出して並列起動するため、新しい
// 買取店舗のスクリプトを scripts/kaitori/scrape-xxx.js として追加すれば、このファイル
// を編集しなくても次回実行時から自動的に対象に含まれる。
// 各店舗は互いに別ドメインへアクセスするため並列実行しても相互に悪影響は無い
// (同一サイトへの過負荷回避は各スクリプト内のページ間ウェイトで individually 対応済み)。
//
// なお仕入店舗(買取店舗が買取った人気商品を、こちらが仕入れる先の販売店)のスクリプト
// は目的も入力(人気商品のJANコード)も異なるため、別ディレクトリ・別の一斉実行スクリプト
// として管理する。

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PROJECT_ROOT = path.join(__dirname, '..');
const TARGET_DIR = path.join(__dirname, 'kaitori');

function findScrapeScripts() {
  return fs
    .readdirSync(TARGET_DIR)
    .filter((f) => f.startsWith('scrape-') && f.endsWith('.js'))
    .sort();
}

function runScript(file) {
  const label = file.replace(/^scrape-/, '').replace(/\.js$/, '');
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(TARGET_DIR, file)], {
      cwd: PROJECT_ROOT,
    });

    const pipe = (stream, prefixWriter) => {
      readline.createInterface({ input: stream }).on('line', (line) => {
        prefixWriter(`[${label}] ${line}`);
      });
    };
    pipe(child.stdout, (line) => console.log(line));
    pipe(child.stderr, (line) => console.error(line));

    child.on('close', (code) => {
      resolve({
        file,
        label,
        code,
        durationSec: Math.round((Date.now() - startedAt) / 1000),
      });
    });
  });
}

async function main() {
  const files = findScrapeScripts();
  if (files.length === 0) {
    console.log(`${TARGET_DIR} に scrape-*.js が見つかりませんでした。`);
    return;
  }

  console.log(`${files.length}件のスクリプトを並列実行します: ${files.join(', ')}`);
  const results = await Promise.all(files.map(runScript));

  console.log('\n=== 実行結果まとめ ===');
  let hasFailure = false;
  for (const r of results) {
    const status = r.code === 0 ? 'OK' : `失敗(code=${r.code})`;
    if (r.code !== 0) hasFailure = true;
    console.log(`  ${r.label}: ${status} (${r.durationSec}秒)`);
  }

  if (hasFailure) {
    console.error('\n一部のスクリプトが失敗しました。');
    process.exit(1);
  }
  console.log('\n全スクリプトが正常に完了しました。');
}

main();
