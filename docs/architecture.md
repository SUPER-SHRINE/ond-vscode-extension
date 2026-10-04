# Ond VS Code Extensionの設計

## 責務

このリポジトリは、Ond向けVisual Studio Code拡張を管理する。

- `.ond`ファイルの言語登録と基本的な編集設定
- TextMate grammarとsemantic tokenのVS Code側設定
- Ond Language Serverの起動とLSP client設定
- VSIXの作成と、同梱物の検証
- Marketplaceで使用する表示情報と画像

Ondの言語仕様、parser、型検査、診断、補完などの実装は
[Ondリポジトリ](https://github.com/SUPER-SHRINE/ond)で管理する。このリポジトリでは
`ond-lsp`本体を変更しない。

## 構成

```text
ond-vscode-extension/
  docs/
    architecture.md
  icons/
  scripts/
  src/
    client.ts
    extension.ts
  syntaxes/
  themes/
  language-configuration.json
  package.json
```

- `src/extension.ts`は拡張の有効化と終了処理を担当する。
- `src/client.ts`は同梱した`ond-lsp`の起動とLSP client設定を担当する。
- `language-configuration.json`はcomment、bracket、auto closingなどを定義する。
- `syntaxes/ond.tmLanguage.json`は構文highlightingを定義する。
- `themes/`はOnd向けcolor themeを保持する。
- `scripts/`はmanifest検査、Language Serverの同梱、VSIX作成を担当する。

## Language Serverとの境界

拡張は`ond-lsp`を標準入出力で起動し、言語機能をLSP経由で提供する。

- 拡張はVS Code固有の設定、process起動、file監視、表示を担当する。
- Language Serverはsource解析、project読込、診断、補完、navigationを担当する。
- 拡張起動後にLanguage Serverをdownloadしない。
- 配布するVSIXには、対象platform向けの検証済みbinaryを同梱する。
- 同梱binaryのversion、target、SHA-256を`server/ond-lsp.json`へ記録する。
- 正式なrelease packageには、OndのGitHub Releaseで配布されたbinaryを使用する。
- 元Releaseのrepository、tag、asset、archiveのSHA-256をmetadataへ記録する。

Language Serverの機能やprotocol対応状況は、Ondリポジトリの実装とテストを正とする。

## アイコン

Marketplaceの拡張アイコンには`icons/ond_logo.png`を使用する。

`.ond`ファイルには、小サイズ表示向けに余白と位置を調整した
`icons/ond_file_icon.png`を使用する。独自のfile icon themeは、利用者が選択しているtheme全体を
置き換えてしまうため提供しない。

## 検証

通常の変更では`npm run check`を実行する。VSIXの内容やLanguage Serverの同梱に関わる変更では、
加えて`npm run package:vsix`を実行する。正式な配布物は`npm run package:release`で作成する。

VSIX作成時には次を確認する。

- TypeScriptとextension manifestが妥当であること
- 必要な画像、grammar、themeが存在すること
- 同梱した`ond-lsp`のSHA-256がmetadataと一致すること
- `ond-lsp`がLSPのinitializeとshutdownに応答すること
- 対象platform用のVSIXとchecksumを生成できること

## 対象外

- Ond言語仕様とcompilerの設計
- `ond-lsp`内部のdocument modelやsymbol解決方式
- VS Code以外のeditor integration
- debug adapter
- formatter

これらが必要になった場合は、担当リポジトリまたは独立した機能変更として扱う。
