export interface QuizQ {
  id: string;
  q: string;
  choices: string[];
  answer: number;
  explain: string;
  terms: string[];
}

export type CertId = 'basic' | 'architect';

export const CERTS: Record<CertId, { id: CertId; name: string; real: string; desc: string; pass: number; count: number }> = {
  basic: { id: 'basic', name: '社内資格：クラウド基礎', real: 'AWS認定 クラウドプラクティショナー（CLF）の範囲を参考にした問題', desc: 'クラウドの考え方・主なサービス・料金・セキュリティの基本。合格すると「若手」に昇格できる。', pass: 7, count: 10 },
  architect: { id: 'architect', name: '社内資格：クラウド設計', real: 'AWS認定 ソリューションアーキテクト–アソシエイト（SAA）の範囲を参考にした問題', desc: '止まらない・速い・安全・安い構成を選べるか。合格すると「中堅」に昇格できる。', pass: 7, count: 10 },
};

export const QUIZ: Record<CertId, QuizQ[]> = {
  basic: [
    { id: 'b1', q: 'クラウドの料金の基本的な考え方は？', choices: ['最初に5年分をまとめて払う', '使った分だけ払う', '何台使っても定額', 'データの量だけで決まる'], answer: 1, explain: 'クラウドは従量課金（使った分だけ払う）が基本です。', terms: ['pay-as-you-go'] },
    { id: 'b2', q: '「AZ（アベイラビリティゾーン）」の説明として正しいのは？', choices: ['世界中のAWSをまとめた呼び名', 'リージョンの中にある、独立したデータセンターのグループ', 'サーバー1台のこと', 'データベースの種類'], answer: 1, explain: 'リージョンの中に、電源やネットワークが独立したAZが複数あります。', terms: ['az', 'region'] },
    { id: 'b3', q: 'ファイルを保存しておくのに向いているサービスは？', choices: ['EC2', 'S3', 'RDS', 'ALB'], answer: 1, explain: 'S3はファイル（オブジェクト）を保存する倉庫です。', terms: ['s3'] },
    { id: 'b4', q: '「仮想サーバーを借りる」サービスは？', choices: ['EC2', 'S3', 'CloudFront', 'CloudWatch'], answer: 0, explain: 'EC2はクラウド上のサーバー（仮想マシン）です。', terms: ['ec2'] },
    { id: 'b5', q: 'AWSが用意・バックアップ・パッチ当てをしてくれるデータベースは？', choices: ['EC2にMySQLを入れたもの', 'RDS', 'S3', 'VPC'], answer: 1, explain: 'RDSはマネージド（お世話つき）のデータベースです。', terms: ['rds'] },
    { id: 'b6', q: '責任共有モデルで「使う側」が責任を持つものは？', choices: ['データセンターの建物の警備', '物理サーバーの故障の交換', 'セキュリティグループの設定', '仮想化ソフトの管理'], answer: 2, explain: 'クラウドの「中に置いたもの」の設定は使う側の責任です。', terms: ['shared-responsibility', 'security-group'] },
    { id: 'b7', q: 'サーバーのCPU使用率などを見張り、異常を知らせるサービスは？', choices: ['CloudWatch', 'CloudFront', 'S3', 'Route 53'], answer: 0, explain: 'CloudWatchはメトリクス・ログ・アラームのサービスです。', terms: ['cloudwatch'] },
    { id: 'b8', q: '世界中の拠点からコンテンツを速く届けるサービス（CDN）は？', choices: ['ALB', 'CloudFront', 'NATゲートウェイ', 'RDS'], answer: 1, explain: 'CloudFrontはAWSのCDNです。', terms: ['cloudfront', 'cdn'] },
    { id: 'b9', q: '請求額が予算を超えそうなときに気づくための仕組みは？', choices: ['請求アラーム', 'マルチAZ', 'Auto Scaling', 'スナップショット'], answer: 0, explain: '請求アラーム（AWS Budgets など）で知らせてもらえます。', terms: ['billing-alarm'] },
    { id: 'b10', q: '「最小権限の原則」に合うのは？', choices: ['全員に管理者権限を渡す', '必要な人に必要な分だけ許可する', '通信はとりあえず全部許可する', 'パスワードを共有する'], answer: 1, explain: '必要最小限の許可にするのがセキュリティの基本です。', terms: ['least-privilege'] },
    { id: 'b11', q: 'オンプレミスと比べたクラウドの良いところとして、もっとも当てはまるのは？', choices: ['電気代を自分で払える', '数分でサーバーを用意でき、いらなくなったら返せる', '必ず安くなる', '設定がいらない'], answer: 1, explain: 'すぐ用意でき、すぐやめられる「俊敏さ」が大きな利点。必ず安くなるとは限りません。', terms: ['cloud', 'on-premises'] },
    { id: 'b12', q: 'S3の中身がうっかり公開されないようにする設定は？', choices: ['バージョニング', 'パブリックアクセスブロック', 'ライフサイクル', 'マルチAZ'], answer: 1, explain: 'パブリックアクセスブロックをオンにしておくのが基本です。', terms: ['block-public-access'] },
    { id: 'b13', q: 'リソースに「持ち主」「用途」などの名札をつける機能は？', choices: ['タグ', 'リージョン', 'ポリシー', 'サブネット'], answer: 0, explain: 'タグを使うと、料金の集計や消し忘れ探しが楽になります。', terms: ['tag'] },
    { id: 'b14', q: 'Webページを暗号化して送るときに使うポート番号は？', choices: ['22', '80', '443', '3306'], answer: 2, explain: 'HTTPSは443番。80番は暗号化なしのHTTPです。', terms: ['https', 'port'] },
    { id: 'b15', q: '使っていない大きなサーバーを小さくして料金を下げることを何と言う？', choices: ['スケールアウト', 'ライトサイジング', 'フェイルオーバー', 'キャッシュ'], answer: 1, explain: 'ちょうどいい大きさに直すことをライトサイジングと言います。', terms: ['rightsizing'] },
  ],
  architect: [
    { id: 'a1', q: '24時間止められないWebアプリ。もっとも適切な構成は？', choices: ['大きいEC2を1台', 'ALB＋2つのAZにEC2＋RDSマルチAZ', 'EC2を1つのAZに3台（ALBなし）', 'S3だけ'], answer: 1, explain: 'AZごと止まっても動けるよう、WebもDBも2つのAZに分けます。', terms: ['multi-az', 'alb'] },
    { id: 'a2', q: 'お店の紹介ページ（HTMLと画像だけ）を、安く丈夫に公開したい。', choices: ['EC2を2台＋ALB', 'S3＋CloudFront', 'RDS', 'EC2＋NATゲートウェイ'], answer: 1, explain: '静的サイトはS3に置いてCloudFrontで配るのが安くて丈夫です。', terms: ['static-site', 's3', 'cloudfront'] },
    { id: 'a3', q: 'セールの時間だけアクセスが10倍になる。ふだんの料金は抑えたい。', choices: ['ふだんから10倍の台数を置く', 'ALB＋Auto Scaling', '一番大きいEC2を1台', 'RDSをマルチAZにする'], answer: 1, explain: '混んだときだけ自動で増やせばムダがありません。', terms: ['auto-scaling'] },
    { id: 'a4', q: 'DBをインターネットから直接触れないようにしたい。どこに置く？', choices: ['パブリックサブネット', 'プライベートサブネット', 'S3', 'CloudFront'], answer: 1, explain: 'DBはプライベートサブネットに置き、Webからだけ許可します。', terms: ['subnet'] },
    { id: 'a5', q: 'プライベートサブネットのEC2が、OSの更新をダウンロードするのに必要なのは？', choices: ['NATゲートウェイ', 'CloudFront', 'RDS', 'インスタンスを大きくする'], answer: 0, explain: 'NATゲートウェイは「外へ出るだけ」の出口です。', terms: ['nat-gateway'] },
    { id: 'a6', q: 'DBのセキュリティグループの3306番。許可する相手としてもっとも安全なのは？', choices: ['0.0.0.0/0', 'Webサーバーのセキュリティグループ', '会社のIP', 'ALBのセキュリティグループ'], answer: 1, explain: 'DBに話しかけるのはアプリ（Web）だけ。相手をWebのSGに限定します。', terms: ['security-group', 'least-privilege'] },
    { id: 'a7', q: '管理画面で誤ってデータを消した。5分前の状態に戻したい。', choices: ['ポイントインタイムリカバリ', 'スケールアップ', 'フェイルオーバー', 'CloudFrontのキャッシュ削除'], answer: 0, explain: 'RDSの自動バックアップから、好きな時刻に戻せます。', terms: ['pitr', 'backup'] },
    { id: 'a8', q: 'ALBを作るときの決まりとして正しいのは？', choices: ['1つのAZだけで作れる', '2つ以上のAZのサブネットを指定する', 'プライベートサブネットにしか置けない', 'EC2が1台以上必要'], answer: 1, explain: 'ALBは2つ以上のAZのサブネットを指定する必要があります。', terms: ['alb', 'az'] },
    { id: 'a9', q: 'WebのCPUは20%、DBのCPUが100%で遅い。まずやるべきことは？', choices: ['Webサーバーを増やす', 'DB側の重い処理を調べる', 'CloudFrontを入れる', 'ALBを2つにする'], answer: 1, explain: 'ボトルネックはDB。Webを増やすと悪化することもあります。', terms: ['bottleneck'] },
    { id: 'a10', q: 'SSHの攻撃を防ぐ、もっとも良い方法は？', choices: ['22番を0.0.0.0/0に開けてパスワードを長くする', '22番を閉じてSession Managerで入る', '攻撃元を1つずつブロック', 'ポートを2222に変えるだけ'], answer: 1, explain: '入口自体をなくすのが一番強い対策です。', terms: ['ssh'] },
    { id: 'a11', q: 'S3に置いた静的サイトをCloudFrontで配るとき、安全な設定は？', choices: ['バケットを公開する', 'パブリックアクセスブロックをオンにし、CloudFrontからだけ読めるようにする（OAC）', 'バケットを2つにする', 'EC2を前に置く'], answer: 1, explain: 'OACでCloudFrontだけに読ませ、バケット自体は非公開に。', terms: ['block-public-access', 'cloudfront'] },
    { id: 'a12', q: 'ふだんCPUが10%以下のt3.large。どうする？', choices: ['t3.xlargeにする', '1段小さくする（ライトサイジング）', '台数を増やす', 'マルチAZにする'], answer: 1, explain: '余りすぎている性能は、小さくして料金を下げます。', terms: ['rightsizing'] },
    { id: 'a13', q: 'サーバー1台が壊れてもサイトを止めないための考え方は？', choices: ['冗長化', 'キャッシュ', 'ログローテーション', 'タグ付け'], answer: 0, explain: '予備を用意して単一障害点をなくすのが冗長化です。', terms: ['redundancy', 'spof'] },
    { id: 'a14', q: 'ディスクがいっぱいでエラー。原因はアプリのログ。再発防止として最適なのは？', choices: ['毎週手で消す', 'ログローテーション＋ディスクの監視', 'サーバーを再起動', 'CPUの監視を追加'], answer: 1, explain: '自動で整理し、いっぱいになる前に気づけるようにします。', terms: ['log-rotation', 'disk'] },
  ],
};
