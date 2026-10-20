# 変更履歴

この文書では、Ond VS Code Extensionの利用者向け変更を記録します。

## 未リリース

### 変更

- `interface`と廃止済み`load32`／`store32`をkeyword・builtinとして色分けしないよう修正
- Ond developで必須になった`[project].name`とproject名を含むimport pathに対応
- 依存packageを`ond.toml`の`[dependencies]`に登録する方式へ移行
- library root packageをproject名でimportする構成をlocal source laneで確認

### 移行

- interface型を具体型や関数型へ移行し、同じ綴りを使う名前は通常のidentifierとして扱う
- `ond.toml`へ`[project].name`を追加し、importを`project名/相対directory`形式へ変更
- `OND_PATH`と`--library-dir`による依存指定を`[dependencies]`へ移行

## 0.2.0

### 変更

- operator宣言の構文highlightingをreceiver付き形式へ対応
- Ond 0.2.0 Release（commit `3a146c81956994f90b84ab0673ba95ca1d5dcfcb`）を正式採用し、Windows/Linux archive、SHA-256 sidecar、manifest、binaryと公式noticeを検証し、lock SHA-256は`63e46104910baf59fbc702040e89826ec5f9bff2f39f2ac7c2d5aa23a5590a5b`

### Ond 0.2.0への移行

- operator宣言は`operator[T] [](values: *Vec[T], index: u32)`から`operator (values: *Vec[T]) [](index: u32)`へ変更
- `load32`／`store32`の呼び出しから、型付きpointerのindex読み書きへ移行

## 0.1.4

### 変更

- VSIXへ同梱するMicrosoft Language Client、ond-lspと各MIT/ISCライセンス・著作権表示を追加
- Ond 0.1.3 Release（commit `c14344722ea7ed09c9459a812f613e35fad7e37e`）を正式採用し、Windows/Linux archive、SHA-256 sidecar、manifest、binaryと公式noticeを検証
- color theme名を`Ond Dark Theme`へ変更
- 認証情報・秘密鍵類をGit管理対象外に追加
- npm auditの警告を解消

Ond 0.1.3のlock SHA-256は`72c56431ccfe5deb8c90774a23f5d1a134f4d21c23474c90d56977bc7af5e727`です。lockには新Ond repository ID `1404563628`、Release IDと各asset IDを固定しています。

---
## リポジトリ移行前のバージョン履歴
以下はこのリポジトリにアップロードする以前の内容のため release, tag としては存在していない

## 0.1.3

### 変更

- 同梱Ondを0.1.2へ更新（commit `2777310f98f5e7be7cc5e3e554d2b99bbd61dcb8`、lock SHA-256 `296e0c73a12a4b2cee2cd201caad8e9292963d769150ac05f785b3cd08d944c0`）。Ond 0.1.2は2026-10-04に公開済みのmanifest-v1 Releaseから採用。
- Ondの正式採用入力をrelease lockへ統一し、明示入力から同じ更新差分を生成するresolve・plan・applyを追加。
- 新しいtag workflowは対象OSごとに新しい候補のVSIXを生成し、その同じbytesを実hostで検証してMarketplaceとGitHub Releaseへ公開する。
- branch protectionとEnvironment承認はGitHubのnative設定に委ね、scriptのsettings監査と追加Administration read権限の要求を除去。レビュー・CI・配布物の証拠照合は維持。
- 拡張0.1.3を2026-10-04に旧履歴repositoryのGitHub Releaseへ公開（Linux/Windows向けVSIX、checksum、verified.jsonの計6 asset）。

## 0.1.2

### 追加

- Linux x86_64（glibc）向けVSIXにOnd 0.1.1のLanguage Serverを同梱
- WindowsとLinuxそれぞれでbinary検証、LSP smoke test、対象別VSIX生成を実行
- developのGitHub Release自動公開を維持し、両対象のVSIXとSHA-256を添付


## 0.1.1

### 変更

- Explorerとeditor tabで、小さい表示サイズに合わせてOndファイルアイコンの位置を調整
- 正式なVSIXではOndのGitHub Releaseから取得した検証済み`ond-lsp.exe`を同梱し、元assetの情報とSHA-256を記録

## 0.1.0

### 追加

- Ondの構文highlighting、comment、bracket、auto closing、indentationを追加
- `ond-lsp`による診断、補完、hover、定義移動、参照検索、rename、semantic tokenを追加
- `ond.toml`、`ond.lock`、依存packageの変更に応じたproject再読込を追加
- Windows x64向けVSIXへLanguage Serverを同梱するpackage処理を追加
- 同梱Language Serverのversion、target、SHA-256を記録する検証処理を追加
- `Ond Dark Theme` color themeを追加
