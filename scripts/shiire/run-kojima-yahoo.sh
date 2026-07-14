#!/bin/bash
# コジマYahoo!店の仕入価格取得を、サインインから通しで実行する。
#
# 使い方:
#   ./scripts/shiire/run-kojima-yahoo.sh          # 全件取得
#   ./scripts/shiire/run-kojima-yahoo.sh --limit=5 # 件数を絞ってテスト実行
#
# 1. Yahoo! JAPAN IDへのサインイン(ブラウザが開くので手動でログインしてください)
# 2. 人気商品(output/popular-products.json)のJANコードでコジマYahoo!店を検索し、
#    価格・ポイント・クーポン情報を取得

set -e

cd "$(dirname "$0")/../.."

echo "== 1. Yahoo! JAPAN IDへサインイン =="
npm run auth:yahoo

echo "== 2. コジマYahoo!店の仕入価格を取得 =="
npm run shiire:kojima-yahoo -- "$@"
