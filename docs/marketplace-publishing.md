# Visual Studio MarketplaceとGitHub Releaseへの公開

正式版は、`main`に含まれるcommitへ拡張と同じ厳密なSemVer tagを付けてpushすると、GitHub ActionsからVisual Studio MarketplaceとGitHub Releaseへ自動公開する。Marketplace認証にはMicrosoft Entra IDとGitHub Actions OIDCを使用し、長期PATは保存しない。

## 初期設定

### GitHub Environment

repositoryの`Settings`、`Environments`で`visual-studio-marketplace`を作成する。公開jobと初期設定jobはこのEnvironmentを使用する。

Environmentの`Deployment branches and tags`は`Selected branches and tags`に設定し、`main`とリリースtagだけを許可する。リリースtagは厳密なSemVer形式で運用する。GitHub OIDCのEnvironment subjectにはrefが含まれないため、Environmentの許可refを制限しないと、任意branchからの`workflow_dispatch`でも同じidentityへ到達できる。`Required reviewers`を設定する。承認とref制限はGitHubのnative設定が適用し、publish scriptは設定を監査・認定しない。settings APIの未設定・取得不能はscriptの自動失敗条件にしない。repositoryのbranch/tag rulesetでも、`main`への変更とrelease tagの作成を信頼済みmaintainerに限定する。

### Microsoft Entra ID

会社環境と分離されたテナントに、公開専用のApp registrationを作成する。Client secretは作成しない。

Federated credentialには次を設定する。

- Organization: `SUPER-SHRINE`
- Repository: `ond-vscode-extension`
- Entity type: `Environment`
- Environment: `visual-studio-marketplace`
- Audience: `api://AzureADTokenExchange`

Environment secretsには次を登録する。

- `AZURE_CLIENT_ID`: Application (client) ID
- `AZURE_TENANT_ID`: Directory (tenant) ID

Azure subscriptionは使用しない。

### Ond Releaseの取得

workflowは、GitHub App `SUPER SHRINE WORKER`（App ID: `5174333`）の短期tokenを発行し、private repositoryである`SUPER-SHRINE/ond`からLanguage ServerのRelease assetを取得する。発行するtokenは`ond`の`Contents: Read-only`へ制限する。

`SUPER-SHRINE/ond-vscode-extension`のActions secretに、GitHub Appの秘密鍵を`SUPER_SHRINE_WORKER_PRIVATE_KEY`という名前で登録する。秘密鍵はrepositoryへcommitしない。

### Marketplace Publisherへの追加

workflowがdefault branchへ入った後、「拡張を公開」を`show-identity`で手動実行する。logの`Marketplace identity ID`を、Visual Studio Marketplaceのpublisher `super-shrine`のmemberとして追加し、`Contributor` roleを割り当てる。

ここで使用するIDは、GitHub Actionsが公開用Entraアプリとしてloginした状態でAzure DevOps Profile APIから取得した値である。Application (client) ID、Entra Object ID、Tenant ID、または人間のlogin状態で取得したProfile IDを使用しない。

追加後、「拡張を公開」を`verify-access`で手動実行し、実際のpackageを公開せずにPublisherへの所属を確認する。この確認は`Contributor` roleを保証しないため、Contributor権限はMarketplaceの設定画面で確認する。初回publish時にも最終確認される。

## Release手順

1. 人がrelease versionを明示し、release branchで`package.json`と`package-lock.json`を同じ厳密なSemVerへ更新する。
2. `config/ond-release.lock.json`の正式release/tag/commit/全assetが公開済みであることを照合する。
   extension0.1.3はOnd0.1.2採用が必須で、初期0.1.1 bootstrapのままでは公開しない。
3. lockを用いた両OSのpackageと実VS Code全suiteを各2回検証し、develop/mainの履歴を既存release手順に沿って整合する。
4. 人がGitHubのnative設定でlatest-baseの必須Windows/Linux実host checks、stale approval失効、Environmentのrequired reviewersを管理する。
   scriptは設定監査のための追加AppやAdministration read権限を要求せず、実際の証拠の取得不能・不一致では停止する。
5. レビューしたrelease branchをmainへmergeし、必要に応じて`verify-access`を実行する。
6. 明示承認したmainのrelease commitへ同versionのtagを付ける。workflowはtag peel、GITHUB_SHA、main包含を再照合する。
7. tag workflowのbuild jobがlockからbinaryを取得して新しい候補の最終VSIXを生成し、その同じVSIXを実hostで2回検証する。PR artifactの昇格は行わない。
   成功時だけ`.vsix.verified.json`へVSIX/binary/lock/policyのdigestとcommit、host結果を記録する。
8. environment承認後、publish jobは独立にOnd全assetを再取得・照合し、VSIX内のbinary/metadata/lockと検証証拠を照合する。
   検証済みartifactのbytesを`vsce publish --packagePath`で送り、再buildしない。
9. 両Marketplace target成功後、GitHub Releaseへ同じVSIX・checksum・検証証拠を添付する。

長期PATは使用せず、Marketplaceは既存OIDC、Ond読取は既存AppのContents readです。
Windows/Linuxごとに公開状態とdigestを記録します。既存assetのbytesが同じdigestならskip、異なれば停止します。
GitHubのclobberは使用しません。Marketplace既存版もtarget別VSIXを取得して同一性を確認し、
取得不能・不一致は人の判断が必要なBLOCKEDです。同名versionを自動上書きしません。

片方だけ成功した状態はPARTIALLY_PUBLISHEDです。同じworkflow artifactで再開し、成功済みtargetを照合して未成功だけ送ります。
artifact失効時は再buildを別候補として両host検証・承認からやり直します。
ライブ外部結果や再生成VSIXのbit一致は保証しないため、別候補で既存公開bytesと異なれば停止します。
private source/Cargo cacheは拡張CIへ保存しません。fork PRへsecretやprivatebinaryを渡しません。
初回trusted-main配置、Ond0.1.2公開と最終lock更新、実host検査、native保護設定の管理は
[固定Ond同期の残作業](deterministic-ond-sync.md#残作業と現在の検証範囲)を参照してください。
