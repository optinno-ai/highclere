// 仕入店舗(Yahoo!ショッピング/楽天市場等)へのサインインを行い、セッション(Cookie)を
// ローカルに保存する。
//
// Yahoo!・楽天とも自動ログイン(ID/パスワードをフォームに自動入力)はCAPTCHAやSMS認証で
// ブロックされやすいため、実ブラウザ(画面あり)を開いてユーザー本人が手動でログインする
// 方式を採る。パスワードそのものは一切保存せず、ログイン後のセッションCookieのみを
// `.auth/{platform}.json` に保存する(このディレクトリは.gitignore対象)。
// 保存したセッションは各仕入店舗の価格取得スクリプトから再利用され、期限切れ
// (再度ログインが必要な状態)になったら本スクリプトを再実行する。
//
// 使い方: node scripts/shiire/login.js yahoo
//        node scripts/shiire/login.js rakuten

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const AUTH_DIR = path.join(__dirname, '..', '..', '.auth');

// プラットフォームごとのログイン設定。楽天等を追加する場合はここにエントリを足す。
const PLATFORMS = {
  yahoo: {
    label: 'Yahoo!ショッピング (Yahoo! JAPAN ID)',
    loginUrl:
      'https://login.yahoo.co.jp/config/login?.src=shp&.intl=jp&.done=https%3A%2F%2Fstore.shopping.yahoo.co.jp%2Fy-kojima%2F',
    sessionFile: path.join(AUTH_DIR, 'yahoo.json'),
    // ログイン完了後のチェック対象ページと、ログイン中は消えるはずのリンク(簡易確認用)
    checkUrl: 'https://store.shopping.yahoo.co.jp/y-kojima/',
    loggedOutHrefContains: 'login.yahoo.co.jp',
  },
  rakuten: {
    label: '楽天市場 (楽天会員ID)',
    loginUrl:
      'https://login.account.rakuten.com/sso/authorize?client_id=rakuten_ichiba_top_web&service_id=s245&response_type=code&scope=openid&redirect_uri=https%3A%2F%2Fwww.rakuten.co.jp%2F',
    sessionFile: path.join(AUTH_DIR, 'rakuten.json'),
    checkUrl: 'https://www.rakuten.co.jp/',
    loggedOutHrefContains: 'login.account.rakuten.com',
  },
};

function waitForEnter(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(message, () => {
    rl.close();
    resolve();
  }));
}

async function main() {
  const platformKey = process.argv[2];
  const platform = PLATFORMS[platformKey];
  if (!platform) {
    console.error(
      `プラットフォームを指定してください。対応: ${Object.keys(PLATFORMS).join(', ')}\n` +
        `例: node scripts/shiire/login.js yahoo`
    );
    process.exit(1);
  }

  console.log(`${platform.label} のログイン画面をブラウザで開きます...`);
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(platform.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  await waitForEnter(
    '\n開いたブラウザでログイン(2段階認証等を含む)を完了してください。\n' +
      '完了したら、このターミナルでEnterキーを押してください... '
  );

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await context.storageState({ path: platform.sessionFile });
  console.log(`セッションを保存しました: ${platform.sessionFile}`);

  // 簡易確認(あくまで目安。判定に失敗してもセッションは保存済みなので実害は無い)
  try {
    await page.goto(platform.checkUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500); // 描画待ち(重いトップページ向け)
    const stillHasLoginLink = await page
      .locator(`a[href*="${platform.loggedOutHrefContains}"]`)
      .first()
      .isVisible()
      .catch(() => false);
    if (stillHasLoginLink) {
      console.log(
        '注意: ログイン前のリンクがまだ見つかりました。ログインが完了していない可能性があります。' +
          '必要であれば再度このスクリプトを実行してください。'
      );
    } else {
      console.log('ログイン状態を確認できました。');
    }
  } catch (err) {
    console.log('ログイン状態の簡易確認に失敗しましたが、セッションの保存は完了しています。');
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
