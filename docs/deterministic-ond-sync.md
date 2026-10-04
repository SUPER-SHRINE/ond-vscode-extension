# 固定入力によるOnd同期

正式採用入力は`config/ond-release.lock.json`だけです。schemaは`config/ond-release.schema.json`、実行時validatorは
`contract.mjs`です。UTF-8・LF・sorted key・canonical JSONを要求し、duplicate/unknown key、欠損、範囲外整数、
未知target、version逆行、同versionのdigest変更を拒否します。初期0.1.1は検証済み公開archiveから作った
`legacy-v1` bootstrapのみです。新0.1.2以降はproducer `manifest-v1`が必須で、fallbackしません。

## resolve → plan → apply

`ond-sync.yml`はdefault mainへ配置後、maintainerが明示tagとdevelop SHAで`resolve`します。
CLIを使用する場合も同じ境界です。

```bash
node scripts/ond-sync/cli.mjs resolve --tag 0.1.2 --base-sha <develop SHA> --out snapshot.json
node scripts/ond-sync/cli.mjs plan --input snapshot.json --out plan.json
```

resolverはrepository ID、stable published release、tagのpeeled commit、main包含、全asset ID/size/digest、
checksum、archive内のbinary、producer manifestを照合します。latestや現在時刻から版を選びません。
snapshotは読込むbase fileの全bytes/mode、Git tree全entry、candidate証拠assetの全bytes、
固定planner配布物・schema・policyの全bytes、Node22 executable/version/digestを含みます。token/API全文は含みません。

planner本体はnetwork・時計・乱数・environment・filesystemを読まず、全入力を検証して生成filebytes/mode/treeを返します。
入力のobject順・tree/module/evidence順は正規化し、plan IDは正規化済み入力のSHA-256です。
通常の変更許可pathはlockと定型CHANGELOGだけで、extension versionは変更しません。
独立2processでplan bytesを比較し、固定goldenがfilebytes/mode/treeの仕様変化を検出します。
これは形式証明ではなく、同じ入力からの同じ生成結果を検査する保証です。

maintainerがsnapshot file SHA-256とplan IDを確認してから`apply`を明示実行します。
workflowはmainの成功resolve runを照合し、artifactをrunner.temp専用directoryへ取得します。
artifactでtrusted checkoutを上書きせず、snapshot/planだけを読みます。

```bash
node scripts/ond-sync/cli.mjs apply --input snapshot.json --plan plan.json --input-sha <承認したfile digest> --plan-id <承認したplan ID>
```

applyは配布物/実Node digest、repository ID、同じbase SHA/tree、release/tag/assetsを再照合し、draft PRをdevelopへ作成します。
write権限はこのjobのGITHUB_TOKEN Contents/PRだけで、既存Ond Appはread-onlyのままです。
branchは`feature/ond-update-<version>-<plan ID先頭16桁>`です。既存branchはbase parent・生成tree・marker message、
既存PRは全baseからheadを検索し、期待するdevelop・head SHA・head/base repository・markerを照合して再利用します。
手動retargetで別baseへ移動したPRは新規作成で置換せず停止します。422/409の競合は再読取りします。
異なる未完更新PR、手修正、base移動、asset差替え、閉じたPRは上書き・reopenしません。
同じ採用lockはNOOPです。途中停止後はremote branch/PRから再照合し、local成功flagを使いません。最終release再検証後とPR作成後にもbase・branch・PR・競合を再読取りし、
変更を検出した場合はPR_OPENを返しません。複数resourceへの他者操作を原子的に止める保証はありません。

## mergeと公開の境界

`node scripts/ond-sync/merge-gate.mjs <PR番号> <quality run ID>`はread-onlyでlatest base/head、mergeability、
exact-head承認、両OSの実host検証済みVSIX artifact、lock/policy digestを結びます。
branch protectionとEnvironment承認はGitHubのnative設定に委ね、scriptは設定を監査・認定しません。
settings APIの未設定・取得不能は自動失敗の条件にせず、実際のレビュー・CI・artifactの取得不能、不一致、失効はBLOCKEDで、mergeしません。
GitHub複数refの原子操作はないため、実merge直前に人がhead/baseを確認します。
commit SHA/時刻・PR番号・ライブCI結果・VSIX再生成のbit一致は生成保証外です。
外部障害は合格扱いせず、同じsnapshotの再試行か新入力の明示再承認が必要です。

正式公開は[Marketplace公開手順](marketplace-publishing.md)に従い、最終VSIXを一度生成して
その同じbytesを2回の実host検証・公開へ引継ぎます。tag workflowは新しい候補をbuild・検証・公開し、PR artifactの昇格は行いません。source.kindだけの自己申告では認定しません。
同期はmerge/tag/Marketplace公開を自動承認しません。GITHUB_TOKENで作ったPRのCIにはGitHub側の実行承認が
必要になる場合があります。App拡権、自動通知、PAT、repository設定変更はこの実装に含みません。
concurrencyは完全なqueueを保証しないので、未処理eventは明示run/inputによる手動recoveryを使います。

## 残作業と現在の検証範囲

- extension0.1.3用の正式lockは、2026-10-04に公開されたOnd0.1.2 Release（commit `2777310f98f5e7be7cc5e3e554d2b99bbd61dcb8`）のmanifest-v1と全archive/checksumを検証して更新済みです。初期0.1.1 bootstrapの採用待ちは完了しています。
- extension0.1.3はrelease準備中です。main向けPR/CIのexact-headでWindows/Linux両方の実VS Code全suiteを各2回通し、人が公開gateを判断する作業が残っています。現時点で公開準備完了とは扱いません。
- 初回quality導入はレビューしたtooling全体を第1commitへ固定し、第2commitでacquireのcheckoutをそのimmutable SHAへpinします。
  同じfeature PR内で最終全差分レビューを行い、mainを直接変更しません。pin変更には依存module/schema/policy全体の再レビューが必要です。
  未対応schemaはfailclosedとし、レビュー済みtool commitとpin更新で移行します。secretを任意のPR scriptへ渡すfallbackは行いません。
  sync dispatchは正式main配置とdevelopへのbootstrap lock取込み後に利用します。
- repository settingsとEnvironmentの実状態はscriptの認定範囲外です。設定監査のための追加AppやAdministration read権限は不要です。
  GitHubのnative保護設定・承認は人が管理し、この変更では設定やworkflowのEnvironment指定、権限を変更していません。
- cloudのlocalhostでは公式VS Code download到達性やSUID sandbox helperの制約で、正常sandbox起動ができない場合があります。
  sandbox/trust bypassは使わず、正常sandboxのWindows/Linux CIで同一VSIXを各2回検証した証拠を合格条件にします。実行結果はPR/CIの証跡で確認します。
- private Ond / public拡張はbinary公開許可が別途必要なので停止します。private source laneはprivate Ond側に残します。明示commitのGit objectsから検証済みprivate snapshotを作り、worktree/indexの変更やcacheをbuild入力にしません。
  source laneはfresh Cargo home/outputを使い、外部Cargo configとCargo/Rust環境overrideを除きます。installed toolchain・OS/native環境は信頼前提です。
  public移行時は実行停止、既存cache/artifact/log/VSIX露出点検・清掃、公開範囲の明示承認を別作業で行います。
