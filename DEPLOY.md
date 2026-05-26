# 📱 スマホだけでRender.comにデプロイする手順

PC不要！スマホのブラウザだけで世界中の人と遊べるWebサイトを公開できます。
所要時間：**約15分**（GitHubとRenderの初回登録込み）

---

## 全体の流れ

1. **GitHubに無料アカウントを作る**（5分）
2. **このZIPの中身をGitHubにアップロード**（5分）
3. **RenderでGitHubと連携してデプロイ**（3分）
4. **発行されたURLを友達と共有！**

---

## STEP 1：GitHubアカウントを作る

1. スマホブラウザで [github.com](https://github.com/signup) を開く
2. メールアドレス・パスワード・ユーザー名を入力
3. 確認メールが届くのでクリック → 完了

---

## STEP 2：リポジトリを作って中身をアップロード

### 2-1. 新規リポジトリ作成

1. GitHubにログインしたら、画面右上の **「＋」** → **「New repository」**
2. リポジトリ名：`hiragajan`（何でもOK）
3. **「Public」を選択**（重要！Render無料プランで必要）
4. **「Create repository」** ボタンをタップ

### 2-2. ZIPを解凍

スマホで `hiragajan-v2.zip` を解凍します。
- **iPhone**：標準の「ファイル」アプリでZIPをタップすれば自動展開
- **Android**：「Files by Google」や「RAR」アプリで展開

### 2-3. ファイルをアップロード

1. 作成したリポジトリ画面で **「uploading an existing file」** リンクをタップ
   （または `Add file` → `Upload files`）
2. **「choose your files」** をタップ
3. 解凍した `hiragajan` フォルダ内の **すべてのファイルとフォルダを選択**：
   - `server.js`
   - `tiles.js`
   - `scoring.js`
   - `dictionary.js`
   - `package.json`
   - `render.yaml`
   - `README.md`
   - `.gitignore`
   - `public/` フォルダ（中の3ファイルごと）
4. アップロード完了を待つ
5. 画面下の **「Commit changes」** ボタンをタップ

💡 **ヒント**：フォルダごとアップロードできない場合は、`public` フォルダの中身は後で別途追加してください。
- 一度コミット → `Add file` → `Create new file` → ファイル名に `public/index.html` と打つと自動でフォルダができる
- もしくは GitHubアプリ（iOS/Android）を使うと楽

---

## STEP 3：Render.comにデプロイ

### 3-1. Renderにサインアップ

1. スマホブラウザで [render.com](https://render.com/) を開く
2. 右上 **「Get Started」** → **「GitHub」** で連携サインアップ
3. GitHubの認証画面で **「Authorize Render」**

### 3-2. Web Service作成

1. Renderダッシュボードで **「Add new」** → **「Web Service」**
2. **「Build and deploy from a Git repository」** を選択 → Next
3. リポジトリ一覧から **`hiragajan`** を選択 → **「Connect」**
4. 設定画面が出る：
   - **Name**：`hiragajan`（任意）
   - **Region**：`Singapore`（日本から近くて速い）
   - **Branch**：`main`
   - **Runtime**：`Node`（自動検出）
   - **Build Command**：`npm install`（自動入力）
   - **Start Command**：`npm start`（自動入力）
   - **Instance Type**：**「Free」** を選択 ⭐重要⭐
5. 一番下の **「Deploy Web Service」** ボタンをタップ

### 3-3. デプロイ完了を待つ

- ログ画面が表示され、3〜5分でデプロイ完了
- 完了すると画面上部に **`https://hiragajan-xxxx.onrender.com`** のようなURLが表示！
- そのURLをタップ → ひらがじゃんのトップ画面が開けば成功 🎉

---

## STEP 4：友達と遊ぶ！

1. 開いたページで **「新しい部屋を作る」**
2. ロビー画面に **QRコード** が出るので、友達にスキャンしてもらう
3. または部屋コード（5文字）をLINE等で共有
4. 2人以上揃ったら **「ゲーム開始」** をタップ！

---

## ⚠️ Render無料プランの注意点

- **15分間アクセスがないとサーバーがスリープします**
- スリープ後の最初のアクセスは **30秒〜1分** で復帰します
- 復帰中は画面上部に「⚡ サーバー起動中…」と表示されます
- 一度起動すれば全員サクサク遊べます

---

## 🚀 さらに快適にするには（任意）

### 常時起動させたい
- Renderの「Starter」プラン（月7ドル）にすればスリープなし
- または [UptimeRobot](https://uptimerobot.com/)（無料）で5分おきにアクセスして起こす

### 自分のドメインを使いたい
- Render の Settings → Custom Domain で独自ドメイン設定可能

---

## ❓ うまくいかない時

| トラブル | 解決法 |
|---|---|
| GitHubでフォルダごとアップできない | GitHub Mobileアプリを使うか、`public/index.html` のように名前にスラッシュを入れてファイル作成 |
| Renderでビルド失敗 | `package.json` がリポジトリのルートにあるか確認 |
| 「Application failed to respond」 | サーバー起動中。30秒待ってリロード |
| 友達が部屋に入れない | URLが `https://` で始まっているか、部屋コードを正しく入力したか確認 |

困ったときは聞いてくださいね！🀄
