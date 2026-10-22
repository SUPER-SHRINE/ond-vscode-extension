# Ond for Visual Studio Code

Ond言語の編集を支援するVisual Studio Code拡張です。\
構文の色分けと、同梱のOnd Language Serverによる診断やコード補完を利用できます。

## インストール

Visual Studio Code 1.96以降が必要です。\
対応環境はWindows x64とglibcを使うLinux x64です。\
macOS、ARM64、Alpine Linuxなどmusl環境には対応していません。

1. [GitHub Releases](https://github.com/SUPER-SHRINE/ond-vscode-extension/releases)から利用するOS用の`.vsix`ファイルをダウンロードする
2. Visual Studio Codeの拡張機能ビューで「…」メニューから「VSIXからインストール」を選び、ダウンロードしたファイルを指定する
3. `.ond`ファイルを開くと拡張が有効になる

Language Serverは拡張に同梱されているため、利用者がRustやNode.jsを別途インストールする必要はありません。\
拡張の起動時に実行ファイルをダウンロードすることもありません。

## 主な機能

- Ondファイルの構文色分け、コメント、括弧の入力支援
- Language Serverによる診断、補完、型情報の表示
- 定義への移動（F12）と参照の検索（Shift+F12）
- 変数や関数などの名前変更（F2）とsemantic highlighting
- 「Ond Dark Theme」配色

名前変更はpackage名、import alias、組み込みsymbol、外部依存内の宣言には対応していません。\
Ond 0.2.0のoperator宣言形式と型付きpointerのindex読み書きを含む言語機能に対応しています。\
旧`load32`／`store32`呼び出しは、型付きpointerのindex読み書きへ移行してください。

## 開発

開発にはNode.js 22が必要です。

```sh
npm ci
npm run check
```

正式な配布物は、ロックされたOnd ReleaseからWindows x64またはLinux x64向けに作成します。\
`npm run package:release`と`npm run package:vsix`は正式配布用の処理です。\
実際のVisual Studio Code上で統合確認する場合は`npm run test:integration`を使用します。

未公開Ond sourceの確認では`npm run test:ond-source -- <Ond checkout> <commit SHA> <version>`を使用できます。\
Ond developの言語変更を確認するときは、対象commitのSHAとbuild versionを指定してください。\
この確認では`interface`識別子、`[project].name`、project名を含むimport path、およびlibrary root importを検査します。\
依存packageは`ond.toml`の`[dependencies]`へ登録し、importには依存先のproject名を使います。\
Ond developでは`OND_PATH`環境変数と`--library-dir` optionによる依存指定を使いません。\
正式配布用lockはOnd 0.3.0を固定しており、project名を含むimport path、`[dependencies]`による依存指定、interface型から具体型またはfunction pointerへの移行を含みます。\
インストール済みVisual Studio Codeを使う場合は、実行前に`OND_LOCAL_VSCODE_EXECUTABLE`へ`Code.exe`の絶対パス、`OND_LOCAL_VSCODE_CLI`へ同じインストール内の`resources/app/out/cli.js`の絶対パスを設定します。\
この指定は非公開source laneだけで有効です。統合確認は一時的なuser-dataと拡張機能profileを使い、通常の利用者profileには触れません。

配布と同期の詳細は[固定Ond同期](docs/deterministic-ond-sync.md)、公開手順は[Marketplace公開](docs/marketplace-publishing.md)、構成は[設計](docs/architecture.md)を参照してください。

## ライセンス

この拡張のライセンスは[LICENSE.md](LICENSE.md)を、同梱依存物のライセンスと著作権表示は[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)を参照してください。
