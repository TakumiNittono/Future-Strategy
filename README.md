# Dify Chat Application

Dify APIを利用したChatGPT風のチャットボットUIアプリケーションです。

## 技術スタック

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: lucide-react
- **HTTP Client**: axios / fetch
- **Markdown Rendering**: react-markdown

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.local.example` を `.env.local` にコピーし、Dify API Keyを設定してください：

```bash
cp .env.local.example .env.local
```

`.env.local` ファイルを編集：

```env
DIFY_API_KEY=your_actual_dify_api_key_here
```

Dify API Keyは、[Difyダッシュボード](https://dify.ai)から取得できます。

### 3. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開いてアプリケーションを確認できます。

## 機能

- ✅ ChatGPT風のダークモードUI
- ✅ ヘッダーに社内ロゴ表示
- ✅ リアルタイムストリーミング表示
- ✅ Markdownレンダリング対応
- ✅ Enterキーで改行、Ctrl/Cmd+Enterで送信
- ✅ 自動スクロール
- ✅ エラーハンドリング

## プロジェクト構造

```
my-dify-chat/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts          # Dify APIプロキシ（BFFパターン）
│   ├── page.tsx                   # メインページ
│   └── layout.tsx                 # ルートレイアウト
├── components/
│   └── ChatInterface.tsx          # チャットUIコンポーネント
├── public/
│   └── logo.png                   # 社内ロゴ
└── .env.local                     # 環境変数（要作成）
```

## 使用方法

1. メッセージを入力エリアに入力
2. **Enterキー**: 改行
3. **Ctrl+Enter (Mac: Cmd+Enter)**: メッセージを送信
4. AIの回答がストリーミング形式で表示されます

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
