# Ond VS Code Extension

Ond向けのVisual Studio Code拡張です。拡張本体はLSP clientとeditor設定だけを所有し、
言語解析は別repositoryの`ond-lsp`を使用します。

## 現在の機能

- `.ond` language registration
- editor comment and bracket configuration
- TextMate-based syntax highlighting
- VSCode client wiring for `ond-lsp`
- `ond.toml`依存、`ond.lock`、依存パッケージを含むproject再読込
- parse diagnostics over LSP
- top-level document symbols over LSP
- hover, completion, and go-to-definition over LSP
- definition navigation across local scopes, package files, imports, types, and struct fields
- symbol references and rename over LSP (F2 / Shift+F12)
- semantic token
- generic型を含むmethod receiver、method call、名前付きinterfaceの補完・hover・定義移動・rename
- 引数・receiver・local変数の型hover（generic関数の戻り値から推論した型を含む）
- method receiverの専用highlightingと、receiver・演算子直後を含む編集中の補完
- 型・関数・generic method・operatorの型parameter構文と、`alloc[T]`、`sizeof`、`alignof`、`trap "reason"`を含む最新Ond構文のhighlighting・診断
- ユーザー提供のGoLand配色データを再編した`Ond Dark Theme` color theme

## 開発と配布package

Node.js 22、対象OSのWindows x64またはLinux x64（glibc）で実行します。
`config/ond-release.lock.json`が正式採用Ondの唯一の入力です。version、peeled commit、release ID、asset ID、
archiveとbinaryのSHA-256を固定し、未知field・差替え・version逆行は停止します。

```powershell
npm ci
npm run check
npm run package:release
```

private Ondの読取には短期tokenを`OND_RELEASE_TOKEN`、拡張repositoryの読取には`GITHUB_TOKEN`へ設定します。
既存Appの権限はOnd Contents readだけです。tokenはnpmによるpackage処理へ渡さず、生成物にも保存しません。
Ondがpublicの場合は読取tokenを省略でき、CIの`OND_RELEASE_PUBLIC`変数でApp発行stepを省略します。
private Ondからpublic拡張へbinaryを持込む経路は公開許可が未確認なので停止します。

`package:release`はlockの全archive・checksum・producer manifestを取得し、archive内のbinaryまで検証します。
`build:server`と`package:vsix`もlockを使用し、既に取得したbinaryを再検証します。
初回はlocked Releaseから取得します。`-Version`による互換呼出しはlockに一致するversionだけを受け付けます。
任意の`OND_LSP_PATH`や兄弟directoryのsourceを正式packageへ混入させません。

生成物は`ond-vscode-extension-<extension version>-windows-x86_64.vsix`または
`ond-vscode-extension-<extension version>-linux-x86_64.vsix`と各`.sha256`です。
VSIXにはbinaryと、lock digest・release/asset ID・commitを記録する`server/ond-lsp.json`を同梱します。
install後にRust、Cargo、Node.js、Ond repositoryは不要で、拡張起動時のdownloadも行いません。
ARM64、Alpine/musl、macOS、クロスパッケージは対象外です。

拡張0.1.3ではOnd 0.1.2 Release（commit `2777310f98f5e7be7cc5e3e554d2b99bbd61dcb8`、manifest-v1）を採用しました。拡張0.1.4ではOnd 0.1.3の公開成果物が確定した後に正式lockを更新します。
branch protectionとEnvironment承認はGitHubのnative設定に委ね、scriptは設定の監査・認定を行いません。settings APIの未設定・取得不能を自動失敗の条件にせず、実際のレビュー・CI・配布物の証拠を照合します。設定変更やAdministration readなどのApp権限追加は行っていません。

## 未公開Ondのsource検証

maintainerのprivate環境で、明示commit・versionだけを検証します。
HEADと明示SHAの一致を確認し、そのcommitのtree/blob objectsだけから新しいprivate snapshotを作ります。
worktree/indexの変更、ignored cache、`assume-unchanged`・`skip-worktree`・fsmonitorはbuild入力になりません。
Git replace objects・checkout filters・archive attributesを適用せず、snapshotのbytes/tree/modesとversionを検証します。
現在はportable ASCII pathのregular fileだけを扱い、symlink・submodule・committed Cargo configは拒否します。
snapshotのcwdでinstalled Rust1.91.1のCargo/Rustcを直接使い、native targetとlocked release buildを明示します。
Cargo/Rust環境overrideを除き、毎回private Cargo homeと専用outputを作るため、依存cacheは再利用せず必要な依存を取得します。
temp祖先のCargo configがある場合は停止します。build後はsnapshot/home/outputを削除し、今回生成したexecutableだけを使います。
installed toolchain・OS/native環境は信頼前提であり、完全なhermetic buildやbinary bytesの再現性は保証しません。metadataは`local-build`です。

```powershell
npm run test:ond-source -- C:\path\to\ond <40桁commit SHA> <Ond version>
```

このlaneはrelease lockを更新せず、正式公開証拠も作りません。
private source・Cargo cache・logをpublic拡張のCIへ保存しません。
public拡張側では未公開sourceのCIを実行せず、private Ond側で検証します。

## 検査と同期

`npm run check`はTypeScript、manifest、release lock、deterministic planner、異常系fixtureを検査します。
`npm run package:vsix`はproduction build、lockに固定したbinary、LSP initialize.version、VSIX checksumを検査します。
固定入力からの生成・apply・公開の詳細は[固定Ond同期](docs/deterministic-ond-sync.md)、
公開gateと部分公開の再開は[Marketplace公開](docs/marketplace-publishing.md)を参照してください。

## 補足

- `.ond` documentを開くか、workspaceに`.ond` fileがあると拡張が起動します。
- 配色は`Preferences: Color Theme`から`Ond Dark Theme`を選択できます。Ondのsemantic tokenとTextMate scopeを同じpaletteで揃えています。名前変更は元データの利用条件を確認したことを意味しません。
- definition移動はF12、Ctrl/Cmd+click、Peek Definitionから利用できます。
- 変数、定数、関数、method、method receiver、型、構造体fieldなどの名前変更はF2、参照一覧はShift+F12から利用できます。
- package名、import alias、組み込みsymbol、外部依存内の宣言は名前変更の対象外です。
- 開いている`.ond` bufferはproject overlayとして扱われ、未保存の内容も言語機能へ反映されます。
- `ond.toml`の依存先は、その依存先自身の`[project].name`を名前空間としてimport候補へ表示されます。
  利用側`[dependencies]`の登録名は候補名に影響しません。
- `OND_PATH`に現在のproject root自身が含まれる場合は重複library指定として無視します。
  manifestや依存の読込に失敗した場合も、型診断を黙って停止せずeditor上へ原因を表示します。

## 実VS Codeの統合テスト

`npm run package:vsix`の後、`npm run test:integration`で隔離した設定・拡張directoryに
生成VSIXをinstallし、実extension hostで診断、修正後の診断消去、補完、hoverを検証します。
同じprofileでエディターを2回起動し、再起動後も同じ検査を行います。
Linuxでは標準Electron sandboxが利用可能な環境とX displayが必要です。
CIはUbuntu 22.04の`xvfb-run`とWindows runnerを使用し、sandboxを無効化しません。

正式binaryはrelease lock、実VS Codeは`config/ond-test-policy.json`の1.108.0と2回起動policyで固定します。
cacheを使わず公式archiveを取得し、公式redirectのSHA-256を照合します。取得失敗は不合格です。
テスト対象拡張はinstall済みVSIXで、development extensionは検査用driverだけです。
2回の全suite成功後にだけ`.vsix.verified.json`を作り、同じVSIXのdigest、head/base commit、lock、policyを結びます。

CIの秘密download jobは事前レビューしたimmutable tool commitのscriptだけを実行し、PRのnpm/scriptへtokenを渡しません。
quality acquireのcheckout SHA変更もレビュー対象です。syncのdispatchは正式main配置後に利用します。
private Ondを使うfork PRは通常checkを行い、実host検証は証拠不足としてBLOCKEDです。
private source・Rust cache・VS Code cacheを保存せず、公開済みbinaryの検証候補・結果JSON・logだけを保存します。
取消は読み取りCIに限定し、mutating applyはcancelしません。結果artifactは7日で失効します。

統合テストは生成fixtureだけを通常起動の信頼確認ダイアログで信頼してから実行します。UI操作用debuggerはloopback上の一時portを使い、準備終了時に終了します。workspace信頼機能もsandboxも無効化しません。
