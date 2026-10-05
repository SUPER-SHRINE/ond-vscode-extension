# 変更履歴

この文書では、Ond VS Code Extensionの利用者向け変更を記録します。

## [未リリース]

今後のrelease plannerが生成する変更を記録します。

## [0.1.4] - リリース準備中

### 変更

- VSIXへ同梱するMicrosoft Language Client、ond-lspと各MIT/ISCライセンス・著作権表示を追加
- Ond 0.1.3 Release（commit `c14344722ea7ed09c9459a812f613e35fad7e37e`）を正式採用し、Windows/Linux archive、SHA-256 sidecar、manifest、binaryと公式noticeを検証
- color theme名を`Ond Dark Theme`へ変更
- 認証情報・秘密鍵類をGit管理対象外に追加
- npm auditの警告を解消

Ond 0.1.3のlock SHA-256は`72c56431ccfe5deb8c90774a23f5d1a134f4d21c23474c90d56977bc7af5e727`です。lockには新Ond repository ID `1404563628`、Release IDと各asset IDを固定しています。

## [0.1.3] - 2026-10-04

### 変更

- 同梱Ondを0.1.2へ更新（commit `2777310f98f5e7be7cc5e3e554d2b99bbd61dcb8`、lock SHA-256 `296e0c73a12a4b2cee2cd201caad8e9292963d769150ac05f785b3cd08d944c0`）。Ond 0.1.2は2026-10-04に公開済みのmanifest-v1 Releaseから採用。
- Ondの正式採用入力をrelease lockへ統一し、明示入力から同じ更新差分を生成するresolve・plan・applyを追加。
- 新しいtag workflowは対象OSごとに新しい候補のVSIXを生成し、その同じbytesを実hostで検証してMarketplaceとGitHub Releaseへ公開する。
- branch protectionとEnvironment承認はGitHubのnative設定に委ね、scriptのsettings監査と追加Administration read権限の要求を除去。レビュー・CI・配布物の証拠照合は維持。
- 拡張0.1.3を2026-10-04に旧履歴repositoryのGitHub Releaseへ公開（Linux/Windows向けVSIX、checksum、verified.jsonの計6 asset）。

## [0.1.2] - 2026-10-04

### 追加

- Linux x86_64（glibc）向けVSIXにOnd 0.1.1のLanguage Serverを同梱
- WindowsとLinuxそれぞれでbinary検証、LSP smoke test、対象別VSIX生成を実行
- developのGitHub Release自動公開を維持し、両対象のVSIXとSHA-256を添付


## [0.1.1] - 2026-10-04

### 変更

- Explorerとeditor tabで、小さい表示サイズに合わせてOndファイルアイコンの位置を調整
- 正式なVSIXではOndのGitHub Releaseから取得した検証済み`ond-lsp.exe`を同梱し、元assetの情報とSHA-256を記録

## [0.1.0] - 2026-10-03

### 追加

- Ondの構文highlighting、comment、bracket、auto closing、indentationを追加
- `ond-lsp`による診断、補完、hover、定義移動、参照検索、rename、semantic tokenを追加
- `ond.toml`、`ond.lock`、依存packageの変更に応じたproject再読込を追加
- Windows x64向けVSIXへLanguage Serverを同梱するpackage処理を追加
- 同梱Language Serverのversion、target、SHA-256を記録する検証処理を追加
- `Ond Dark Theme` color themeを追加

<!-- 旧tagは移行先へ複製せず、公開済み版の比較リンクはread-only history repoへ向ける。 -->
[未リリース]: https://github.com/SUPER-SHRINE/ond-vscode-extension/compare/main...develop
[0.1.3]: https://github.com/SUPER-SHRINE/ond-vscode-extension-private-history/compare/0.1.2...0.1.3
[0.1.2]: https://github.com/SUPER-SHRINE/ond-vscode-extension-private-history/compare/0.1.1...0.1.2
[0.1.1]: https://github.com/SUPER-SHRINE/ond-vscode-extension-private-history/compare/0.1.0...0.1.1
[0.1.0]: https://github.com/SUPER-SHRINE/ond-vscode-extension-private-history/releases/tag/0.1.0
