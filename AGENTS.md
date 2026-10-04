# Ond VS Code Extensionリポジトリの作業指針

## 検証

- 通常の変更では、対象を絞った検査の後に`npm run check`を実行する。
- release packageに関わる変更では、`npm run package:vsix`まで実行してVSIXとSHA-256を確認する。
- 正式な配布物は`npm run package:release`で作成し、`config/ond-release.lock.json`だけを正式採用入力としてOndのGitHub Release由来のbinaryを使用する。互換の`-Version`はlockと完全一致するときだけ受理する。
- dependencyの追加・更新は、ユーザーの明示的な承認なしに行わない。

## 変更の境界

- Ond言語仕様と`ond-lsp`本体はこのrepositoryで変更しない。必要な変更はOnd repository側の課題として扱う。
- 未公開Ond sourceの検証は`npm run test:ond-source -- <private Ond checkout> <exact SHA> <version>`へ分離し、正式lock・公開・共有source cacheへ接続しない。
- 拡張起動後にLanguage Serverをdownloadしない。配布するVSIXへ検証済みbinaryを同梱する。
- ユーザーによる無関係な変更を保持し、破壊的なGit操作を行わない。

## Git運用

- `main`はrelease済みの内容を保持し、releaseごとに厳密なSemVer形式のtagを付ける。
- 通常の開発は`develop`へ集約する。
- 機能追加と修正は`develop`から`feature/<name>`を作り、1件ごとに`develop`向けPRを作る。
- release準備は`develop`から`release/<version>`を作り、確認後に`main`へmergeする。
- squash mergeとrebase mergeは原則使用せず、意味のある単位に整理したcommitをmerge commitで統合する。
- agentは自動でmergeやpushを行わない。

## 言語

- repository内の説明文書、課題、判断履歴、release記録、commit messageは日本語を基本とする。
- command、識別子、file path、外部toolの原文error、機械処理用のkeyは英語のままでよい。
