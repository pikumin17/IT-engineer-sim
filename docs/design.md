# IT-engineer-sim 設計書

> 最初の職種：クラウドエンジニア（AWSの構築・運用）。
> 今後、SE・SESなどの職種を「職種パック」として追加できる作りにしています。

## 1. ねらい

| ねらい | どう実現するか |
|---|---|
| 現場のエンジニアの仕事をそのまま体験する | 朝会 → チケット → ヒアリング → 設計・見積もり → 作業手順書とレビュー → 構築と動作確認 → 本番 → 監視・障害対応 → 障害報告書、という実際の流れで進む |
| 知識ゼロから遊べて、遊ぶと知識がつく | 1週目は研修。用語はタップで解説、ヒントは3段階、失敗すると先輩が理由を説明する |
| 飽きずに続けられる | 作った環境があとで返ってくる（アクセス集中・障害・コスト相談）。案件は毎回ランダム。出世と資格、日替わりの障害対応、図鑑と称号、苦手の復習 |
| スマホ（iPhone）で遊ぶ | 縦画面・片手操作、タップだけで構成を組む、コマンドは候補をタップして組み立てる。ホーム画面に追加して使う（PWA） |

## 2. ユースケース図

```mermaid
flowchart LR
  P((プレイヤー<br>新人エンジニア))
  subgraph ゲーム
    U1[研修を受ける]
    U2[お客さんにヒアリングする]
    U3[構成を設計して見積もる]
    U4[作業手順書を書いてレビューを受ける]
    U5[構築してコマンドで動作確認する]
    U6[アラートを調査して障害対応する]
    U7[障害報告書を書く]
    U8[資格試験を受ける]
    U9[今日の障害対応を解く]
    U10[用語図鑑で調べる]
    U11[セーブを書き出す・読み込む]
  end
  P --- U1 & U2 & U3 & U4 & U5 & U6 & U7 & U8 & U9 & U10 & U11
  U6 -. include .-> U7
  U2 -. 先に .-> U3
```

## 3. 1日の流れ（フローチャート）

```mermaid
flowchart TD
  A[出社・朝会<br>今日のチケットを受け取る] --> B{チケットの種類}
  B -->|研修| L[レッスンを読む→確認クイズ] --> R
  B -->|新規案件| H[ヒアリング<br>質問は4つまで] --> D[構成を組む<br>料金をその場で確認] --> E{見積もりは予算内?}
  E -->|超えた| D
  E -->|OK| PR[作業手順書<br>順番を並べる] --> RV{先輩のレビュー}
  RV -->|差し戻し| PR
  RV -->|OK| V[ターミナルで動作確認] --> LA[本番公開<br>当日のアクセスで判定] --> R
  B -->|障害| AL[アラート/電話] --> IN[グラフ・ログ・コマンドで調査] --> C[原因を選ぶ] --> AC[対応を選ぶ<br>環境に反映] --> RP[障害報告書] --> R
  R[先輩の振り返り・XP] --> N{残りのチケット}
  N -->|ある| B
  N -->|ない| Z[退勤<br>翌日のできごとを抽選]
```

## 4. クラス図（ゲームの中身）

```mermaid
classDiagram
  class GameState {
    version
    player: Player
    day: number
    customers: Customer[]
    tasks: Task[]
    mastery: Map~termId, Mastery~
    log: LogEntry[]
  }
  class Player {
    name
    rank: 新人|若手|中堅|リーダー
    xp
    certs: CertId[]
    streak
    achievements[]
  }
  class Customer {
    id
    name
    industry
    requirements: Requirements
    known: 聞き出した要件
    arch: Architecture
    satisfaction
    live: boolean
  }
  class Requirements {
    kind: static|webapp|webapp-db
    peakRps
    spikeRps
    availability: low|mid|high
    sensitive
    budgetYen
    needsBackup
  }
  class Architecture {
    publicSubnets / privateSubnets
    natGateway
    cloudfront
    alb
    web: WebTier
    db: DbTier
    s3: Bucket
    rules: SgRule[]
    alarms: AlarmKind[]
  }
  class Task {
    id
    kind: lesson|project|incident|quiz
    customerId
    stage
  }
  class Incident {
    type: spike|instance_failure|az_outage|db_overload|disk_full|ssh_attack|data_delete|cost_spike
    impacted: boolean
    clues
    causeOptions
    actionOptions
  }
  class Evaluation {
    works
    scores: 性能/可用性/セキュリティ/コスト/監視
    findings[]
    monthlyYen
  }
  GameState "1" o-- "1" Player
  GameState "1" o-- "*" Customer
  GameState "1" o-- "*" Task
  Customer "1" *-- "1" Requirements
  Customer "1" *-- "1" Architecture
  Task ..> Incident : 障害のとき
  Architecture ..> Evaluation : evaluate(arch, req)
```

計算部分（`src/engine`）は画面（`src/ui`）から切り離してあり、テスト（Vitest）で中身だけを確かめられます。

## 5. シーケンス図：障害対応

```mermaid
sequenceDiagram
  actor P as プレイヤー
  participant UI as 画面
  participant G as game.ts
  participant I as incidents.ts
  participant E as evaluate.ts
  G->>I: 退勤時に翌日のできごとを抽選（環境の弱点ほど起きやすい）
  I->>E: その構成で影響が出るか判定
  E-->>I: 影響あり/なし
  I-->>G: 障害チケット（影響なしなら「構成のおかげで無事」の知らせ）
  P->>UI: アラートを開く
  UI->>I: コマンド・グラフの結果を取得
  I-->>UI: 手がかり（ログ・数値）
  P->>UI: 原因と対応を選ぶ
  UI->>G: resolveIncident(選択)
  G->>E: 対応後の構成で再判定
  G-->>UI: 満足度・XP・先輩のコメント
  P->>UI: 障害報告書（再発防止策）を提出
```

## 6. 状態遷移図：案件チケット

```mermaid
stateDiagram-v2
  [*] --> ヒアリング
  ヒアリング --> 設計
  設計 --> 見積もり提出
  見積もり提出 --> 設計 : 予算オーバーで差し戻し
  見積もり提出 --> 手順書
  手順書 --> 手順書 : レビューで差し戻し
  手順書 --> 動作確認
  動作確認 --> 本番公開
  本番公開 --> 振り返り
  振り返り --> 運用中
  運用中 --> 障害対応 : 障害の抽選
  障害対応 --> 運用中
```

## 7. データの流れ（DFD）

```mermaid
flowchart LR
  P([プレイヤー]) -- 操作 --> UI[画面]
  UI -- アクション --> G((game.ts<br>状態を更新))
  G -- 構成と要件 --> EV((evaluate.ts<br>判定))
  EV -- 点数・指摘・料金 --> G
  G -- 状態 --> UI
  G -- 保存 --> LS[(ブラウザ保存<br>localStorage)]
  LS -- 読み込み --> G
  UI -- 書き出し --> F[(セーブファイル<br>.json)]
  F -- 読み込み --> G
  C[(content/<br>用語・レッスン・クイズ・ストーリー)] --> G
```

## 8. 判定のルール（ゲーム用の簡略化）

### 8.1 処理能力
- EC2 1台がさばけるリクエスト/秒：t3.micro 40、t3.small 80、t3.medium 160、t3.large 320
- ロードバランサー（ALB）がないと、トラフィックを受けるのは1台だけ
- Auto Scaling（ALBが必要）は、アクセス集中のとき最大台数まで増える
- CloudFront を前に置くと、Webサーバーへのリクエストが減る（動的サイトで−50%）
- RDS の処理能力：db.t3.micro 100、small 200、medium 400、large 800

### 8.2 可用性
- `high`（24時間止められない）：Webが2つのAZに2台以上＋ALB、DBはMulti-AZ
- `mid`（営業時間は止めたくない）：1台が壊れても復旧できる（2台以上またはAuto Scaling）、DBのバックアップあり
- `low`：止まってもすぐ困らない

### 8.3 セキュリティの指摘
- SSH（22番）が全世界に開いている
- DB（3306番）が全世界に開いている・DBがパブリックサブネットにある
- 個人情報を扱うのにHTTPS（443番）を使っていない
- S3のパブリックアクセスブロックがオフ
- 請求アラームがない（軽い指摘）

### 8.4 料金
東京リージョンのおおよその価格（1ドル150円、1か月730時間）をもとにしたゲーム用の目安です。実際の料金は AWS の料金ページで確認してください。

## 9. 飽きない仕組み

1. **環境が返ってくる**：作った環境はお客さんごとに残る。退勤時の抽選で、弱点のある環境ほど障害が起きやすい。強い構成なら「構成のおかげで無事」と知らせが来る
2. **ランダム案件**：業種・規模・予算・要件の組み合わせで毎回ちがう
3. **出世と資格**：新人→若手→中堅→リーダー。ゲーム内資格（AWS認定の範囲に合わせたクイズ）で昇格条件を満たす。ランクが上がると大きい案件が来る
4. **今日の障害対応**：日付で決まる短い問題を1日1問、連続日数を記録
5. **図鑑と称号**
6. **苦手の復習**：間違えた用語は数日後の確認クイズにもう一度出る

## 10. 職種を増やすときの拡張点

- `src/content/jobs/` に職種ごとのストーリー・レッスン・案件の型を置く
- 判定（`evaluate`）は職種ごとに差し替える（SE：要件定義書・テスト仕様、SES：常駐先の案件と単価…）
- 共通部分：1日の流れ、チケット、先輩の振り返り、XPと出世、用語図鑑、セーブ

## 11. セーブ

- ブラウザの localStorage に自動保存。セーブには `version` を入れ、読み込みで古い形を新しい形に変換する
- 読めないセーブは消さずに別の場所へ退避する（以前、別のゲームで読み込み失敗時に上書きしてセーブを失ったため）
- 「書き出す」でJSONファイルを保存、「読み込む」で戻す。iPhoneは「ファイル」アプリやOneDriveに保存できる
- iPhoneのSafariは、しばらく開かないサイトの保存データを消すことがあるので、ホーム画面に追加して使うのがおすすめ
