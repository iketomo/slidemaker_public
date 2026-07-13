# SlideMaker Public

テキストからプレゼン資料や画像を生成するツールです。AI プロバイダーの API キーは各自が用意する BYOK（Bring Your Own Key）方式で、オープンソース・セルフホスト可能です。

[English README](./README.md)

## できること

ブラウザだけで完結する2つの機能を提供します。

- **F1: プレゼン資料を作る** — テキストを貼り付けると AI がスライド構成を提案し、それを編集した上でスライドごとに画像を生成、最後に `.pptx` としてダウンロードできます。
- **F2: 自由に生成** — 作りたい画像の内容を指定して（参考画像の添付も可）生成し、PNG または単スライドの `.pptx` としてダウンロードできます。

サーバー側の課金プランや席数課金は存在せず、AI 利用料をこちらが肩代わりすることもありません。Gemini・OpenAI のいずれか（または両方）の API キーをご自身で用意していただき、アプリはそのキーを使って各プロバイダーに直接（または後述の薄いプロキシ経由で）アクセスします。デプロイした運営者側がキーを見たり保存したりすることはありません。

## 現在の状況

Supabase のスキーマ・Row Level Security・認証、OpenAI 中継用の Edge Function、BYOK キーストアといった基盤部分は実装済みで、`docs/` に記載のセットアップ手順・セキュリティ検証にも対応しています。一方で UI はまだ最小限の仮実装の段階で、正式なデザインは別途構築中です。そのため clone してビルド・デプロイ自体は動きますが、見た目はまだ完成していません。進捗はリポジトリの issue やコミット履歴でご確認ください。

## BYOK — API キーの扱い方

- Gemini・OpenAI の API キーはブラウザ上で入力し、既定では `localStorage` に、「タブを閉じたら消す」を選んだ場合は `sessionStorage` に保存されます。データベースやサーバー側のログには一切書き込まれません。
- Gemini の呼び出しはブラウザから `generativelanguage.googleapis.com` へ直接行われます。キーがブラウザの外に出るのは Google 宛の通信のみです。
- OpenAI の画像 API はブラウザからの CORS 呼び出しに対応していないため、Supabase の Edge Function を経由します。キーはリクエストのたびに一度だけ送られ、OpenAI 呼び出しに使われた後は破棄され、ログにも残さない設計です（詳細は `docs/ARCHITECTURE.md` を参照してください）。
- API キーの取得先: [Google AI Studio](https://aistudio.google.com/apikey)（Gemini）／ [OpenAI API keys](https://platform.openai.com/api-keys)（OpenAI）

利用料は各自の Google / OpenAI アカウントに直接請求されます。アプリ自体の利用は無料ですが、Supabase や Vercel のホスティング費用はセルフホストする方の負担になります。

## アーキテクチャ概要

```
                 ┌─────────────────────────┐
                 │      ブラウザ（SPA）       │
                 │  BYOK キーは local/session storage に保存
                 └───────────┬─────────────┘
                              │
         ┌────────────────────┼───────────────────────┐
         │                    │                        │
         ▼                    ▼                        ▼
   Gemini API（直接）   Supabase Auth / Postgres   Supabase Edge Function
 generativelanguage.       + Storage               gpt-image-proxy
 googleapis.com        （RLS・ユーザー単位データ）    （JWT 必須）
                                                           │
                                                           ▼
                                                    OpenAI Images API
```

- **認証**: Supabase Auth、Google OAuth のみ。全画面がログイン必須です。
- **データ**: Supabase Postgres。全テーブルに `auth.uid()` ベースの Row Level Security を設定しており、他人の行を読めるポリシーは存在しません。
- **ストレージ**: Supabase Storage。プライベートバケットで、ユーザーごとにフォルダ（`{userId}/...`）が分かれ、Storage の RLS で保護されています。
- **OpenAI 中継**: `gpt-image-proxy` という単一の Deno Edge Function が、有効な Supabase JWT と呼び出し元の OpenAI キーを必須としてリクエストを転送し、失敗時はアップストリームの応答本文を返さず固定メッセージのみ返します。

設計の詳細は [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) をご覧ください。

## セルフホスト

自分の Supabase プロジェクトと自分の Vercel デプロイで動かす形になり、他のデプロイとインフラを共有することはありません。

概要（詳しい手順は [docs/SETUP.md](./docs/SETUP.md) を参照）:

1. Supabase プロジェクトを作成し、`supabase link` と `supabase db push` で `supabase/migrations/` を適用する
2. Supabase Auth で Google OAuth を有効化する
3. Edge Function をデプロイする: `supabase functions deploy gpt-image-proxy`
4. Vercel の環境変数に `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を設定してデプロイする
5. CSP の `connect-src` を自分の Supabase プロジェクトに固定する（`docs/SETUP.md` の「Security hardening」を参照）

## 技術スタック

- フロントエンド: Vite、React、TypeScript（strict モード）
- 認証・DB・ストレージ・Edge Functions: Supabase
- AI: Gemini（`@google/genai`、ブラウザから直接呼び出し）、OpenAI `gpt-image-2`（Edge Function 経由で呼び出し）
- PPTX 生成: `pptxgenjs`
- ホスティング: Vercel（静的 SPA）

正確な依存バージョンは `package.json` を参照してください。

## ドキュメント

- [docs/SETUP.md](./docs/SETUP.md) — セルフホストの詳細手順
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — システム設計、BYOK の設計判断、RLS 方針、Edge Function のセキュリティ設計
- [CONTRIBUTING.md](./CONTRIBUTING.md) — 開発環境のセットアップと PR の出し方
- [SECURITY.md](./SECURITY.md) — 脆弱性報告先

## ライセンス

MIT — [LICENSE](./LICENSE) を参照してください。
