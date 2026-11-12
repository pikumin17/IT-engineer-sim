export type Exam = 'CLF' | 'SAA' | 'FE';

export interface Term {
  id: string;
  word: string;
  short: string; // ひとことで
  body: string; // くわしく
  analogy?: string; // たとえ
  exams: Exam[]; // 関係する試験（CLF=AWS認定クラウドプラクティショナー、SAA=ソリューションアーキテクト–アソシエイト、FE=基本情報技術者）
  related?: string[];
}

export const GLOSSARY: Term[] = [
  { id: 'cloud', word: 'クラウド', short: 'インターネットの向こうにあるコンピューターを、必要な分だけ借りて使うこと', body: '自分でサーバーを買って置く（オンプレミス）代わりに、AWSなどの会社が持っている大量のコンピューターを、使った分だけお金を払って借ります。数分で用意でき、いらなくなったらすぐ返せます。', analogy: '家を買う（オンプレ）か、ホテルに泊まる（クラウド）か。ホテルなら泊まった日数分だけ払えばいい。', exams: ['CLF', 'FE'], related: ['on-premises', 'pay-as-you-go'] },
  { id: 'on-premises', word: 'オンプレミス', short: '自社でサーバーを買って、自社の建物などに置いて使うこと', body: '機械を買うお金・置く場所・電気代・壊れたときの交換などを、全部自分たちで用意します。クラウドと比べて自由度は高いですが、準備に時間がかかります。', exams: ['CLF', 'FE'], related: ['cloud'] },
  { id: 'pay-as-you-go', word: '従量課金', short: '使った分だけ払う料金のしくみ', body: 'クラウドの基本の料金体系。サーバーを1時間動かしたら1時間分。止めれば（多くの場合）お金はかかりません。だからこそ「消し忘れ」に注意。', exams: ['CLF'], related: ['cost-optimization'] },
  { id: 'region', word: 'リージョン', short: 'AWSのデータセンターが集まっている地域（東京・大阪など）', body: '世界中に30以上あります。東京リージョンは ap-northeast-1、大阪は ap-northeast-3。お客さんに近いリージョンを選ぶと速く、法律でデータを国内に置く必要があるときも国内のリージョンを選びます。', analogy: '「東京店」「大阪店」のような支店。', exams: ['CLF', 'SAA'], related: ['az'] },
  { id: 'az', word: 'アベイラビリティゾーン（AZ）', short: 'リージョンの中にある、独立したデータセンターのグループ', body: '1つのリージョンに3つ前後のAZがあり、電源やネットワークが別々になっています。1つのAZが止まっても、ほかのAZは動き続けるように作られています。ゲームでは AZ-a と AZ-c を使います。', analogy: '東京店の中の「1号館」「2号館」。片方が停電しても、もう片方は営業できる。', exams: ['CLF', 'SAA'], related: ['region', 'multi-az'] },
  { id: 'vpc', word: 'VPC', short: 'AWSの中に作る、自分専用のネットワーク', body: 'Virtual Private Cloud の略。ほかの会社のネットワークとは分けられた、自分たちだけの区画です。この中にサブネットを作り、サーバーやDBを置きます。', analogy: '大きなビルの中の、自分の会社専用のフロア。', exams: ['CLF', 'SAA'], related: ['subnet'] },
  { id: 'subnet', word: 'サブネット', short: 'VPCをさらに小さく区切った区画。パブリックとプライベートがある', body: 'パブリックサブネットはインターネットとつながる区画（入口に近い場所）、プライベートサブネットはインターネットから直接は入れない区画（奥の部屋）。DBなど大事なものはプライベートに置きます。サブネットは1つのAZの中に作ります。', analogy: 'フロアの中の「受付（パブリック）」と「金庫室（プライベート）」。', exams: ['SAA', 'FE'], related: ['vpc', 'nat-gateway'] },
  { id: 'ip-address', word: 'IPアドレス', short: 'ネットワーク上の住所', body: 'コンピューター同士が通信するときの宛先の番号。例：203.0.113.10。0.0.0.0/0 は「すべてのIPアドレス＝世界中どこからでも」という意味です。', exams: ['FE', 'SAA'], related: ['port'] },
  { id: 'port', word: 'ポート番号', short: '同じコンピューターの中の「どの窓口か」を表す番号', body: 'IPアドレスが建物の住所なら、ポートは部屋番号。よく使う番号：22＝SSH（サーバーの管理）、80＝HTTP（Webページ）、443＝HTTPS（暗号化したWebページ）、3306＝MySQL（データベース）。', exams: ['FE', 'SAA'], related: ['security-group', 'https', 'ssh'] },
  { id: 'security-group', word: 'セキュリティグループ', short: '通していい通信だけを決める、サーバーの門番', body: '「どのポートに」「どこから」の通信を許可するかを書きます。書いていない通信は全部止められます。相手を「ALBのセキュリティグループから」のように指定できるので、Web→DBのような順番のつながりを作れます。', analogy: 'マンションのオートロック。登録した人だけ入れる。', exams: ['CLF', 'SAA'], related: ['port', 'least-privilege'] },
  { id: 'ec2', word: 'EC2', short: 'クラウド上に借りるパソコン（仮想サーバー）', body: 'CPUやメモリの大きさ（インスタンスタイプ）を選んで、数分で起動できます。t3.micro のように「種類.大きさ」で表します。止めればお金はかかりません（ディスク代は少しかかる）。', analogy: 'レンタルのパソコン。性能の良いものほど1時間あたりが高い。', exams: ['CLF', 'SAA'], related: ['instance-type', 'scale-up'] },
  { id: 'instance-type', word: 'インスタンスタイプ', short: 'EC2の大きさ・種類', body: 't3.micro、t3.small、t3.medium、t3.large…と大きくなるほど、メモリが増えて料金も上がります。t系はふだん軽い処理向けの汎用タイプです。', exams: ['CLF', 'SAA'], related: ['ec2', 'rightsizing'] },
  { id: 's3', word: 'S3', short: 'ファイルを入れておく、ほぼ無限に入る倉庫', body: '画像・動画・バックアップ・HTMLなど、どんなファイルでも置けます。データは自動で複数のAZにコピーされるので、とても丈夫（耐久性 99.999999999%）。入れ物のことを「バケット」と呼びます。', analogy: '大きさ無制限のトランクルーム。', exams: ['CLF', 'SAA'], related: ['block-public-access', 'static-site'] },
  { id: 'block-public-access', word: 'パブリックアクセスブロック', short: 'S3の中身が、うっかり世界中に公開されないようにする安全装置', body: 'オンにしておくと、設定ミスがあってもバケットが公開されません。Webサイトとして見せたいときも、オンのままCloudFront経由（OAC）で配るのが安全なやり方です。', exams: ['SAA'], related: ['s3', 'cloudfront'] },
  { id: 'static-site', word: '静的サイト', short: 'HTML・画像・CSSだけでできた、誰が見ても同じ内容のサイト', body: 'お店の紹介ページのように、サーバーでプログラムを動かす必要がないサイト。S3に置いてCloudFrontで配れば、サーバーの管理がいらず、安くてアクセス集中にも強いです。', exams: ['SAA'], related: ['s3', 'cloudfront'] },
  { id: 'cloudfront', word: 'CloudFront', short: '世界中の拠点にコピー（キャッシュ）を置いて、速く届ける仕組み（CDN）', body: 'お客さんに近い拠点からファイルを返すので速く、元のサーバー（オリジン）への負担も減ります。HTTPSにも対応できます。', analogy: '人気の本を、本店だけでなく各駅の本屋にも置いておく。', exams: ['CLF', 'SAA'], related: ['cdn', 'cache'] },
  { id: 'cdn', word: 'CDN', short: 'コンテンツを近くから配る仕組み', body: 'Content Delivery Network の略。AWSでは CloudFront が CDN です。', exams: ['CLF', 'FE'], related: ['cloudfront'] },
  { id: 'cache', word: 'キャッシュ', short: '一度使ったデータを近くに取っておき、次から速く返すこと', body: '毎回元の場所まで取りに行かなくてよいので、速くなり、元の負担も減ります。古いデータが返ってしまうことがあるので、どれくらいの時間取っておくかを決めます。', exams: ['FE', 'SAA'], related: ['cloudfront'] },
  { id: 'rds', word: 'RDS', short: 'AWSがお世話してくれるデータベース', body: 'MySQLなどのデータベースを、AWSが用意・バックアップ・パッチ当てなどを代わりにやってくれます。自分でEC2にDBを入れるより、運用がずっと楽です。', exams: ['CLF', 'SAA'], related: ['database', 'multi-az', 'backup'] },
  { id: 'database', word: 'データベース（DB）', short: 'データを整理してしまっておき、すばやく取り出せるようにする仕組み', body: '予約・会員・注文などのデータを表（テーブル）にして保存します。SQLという言葉で読み書きします。', exams: ['FE', 'CLF'], related: ['rds', 'sql'] },
  { id: 'sql', word: 'SQL', short: 'データベースに命令するための言葉', body: 'SELECT（取り出す）、INSERT（入れる）、UPDATE（変える）、DELETE（消す）など。重いSQLが1本あるだけで、DB全体が遅くなることもあります。', exams: ['FE'], related: ['database'] },
  { id: 'alb', word: 'ALB（ロードバランサー）', short: 'お客さんを複数のサーバーに振り分ける係', body: 'Application Load Balancer。届いた通信を、後ろにいる元気なサーバーに順番に渡します。壊れたサーバーには渡さないので、1台が止まってもサイトは続きます。作るときは2つ以上のAZを指定する決まりです。', analogy: 'ラーメン屋の「こちらの席へどうぞ」と案内する係。', exams: ['CLF', 'SAA'], related: ['scale-out', 'redundancy'] },
  { id: 'auto-scaling', word: 'Auto Scaling', short: '混んだら自動でサーバーを増やし、空いたら減らす仕組み', body: 'CPU使用率などを見て、決めたルールで台数を増減させます。壊れたサーバーを自動で入れ替える役目もあります。ALBと組み合わせて使います。', analogy: 'お昼のピークだけバイトを増やすシフト。', exams: ['CLF', 'SAA'], related: ['scale-out', 'alb'] },
  { id: 'scale-up', word: 'スケールアップ', short: 'サーバーを大きいものに替えて性能を上げること', body: '手軽ですが、替えるときに一度止まることが多く、大きさにも上限があります。「縦に伸ばす」とも言います。', exams: ['SAA', 'FE'], related: ['scale-out'] },
  { id: 'scale-out', word: 'スケールアウト', short: 'サーバーの台数を増やして性能を上げること', body: '台数で増やすので上限がなく、1台壊れても残りで動けます。ALBで振り分けるのが前提です。「横に広げる」とも言います。', exams: ['SAA', 'FE'], related: ['scale-up', 'auto-scaling'] },
  { id: 'nat-gateway', word: 'NATゲートウェイ', short: 'プライベートサブネットのサーバーが、外へ取りに行くための出口', body: 'プライベートのサーバーがOSの更新などをダウンロードするときに使います。外からは入れない「出口専用」です。便利ですが、1つあたり月に数千円かかります。', exams: ['SAA'], related: ['subnet'] },
  { id: 'cloudwatch', word: 'CloudWatch', short: 'AWSの数字やログを集めて見張るサービス', body: 'CPU使用率・エラー数などの数字（メトリクス）をグラフにし、決めた値を超えたらアラームで知らせます。ログも集められます。', exams: ['CLF', 'SAA'], related: ['monitoring'] },
  { id: 'monitoring', word: '監視', short: 'システムが正常か、数字やログで見張り続けること', body: '障害に「お客さんより先に」気づくためのもの。何を・どの値で・誰に知らせるかを決めておきます。', exams: ['FE', 'SAA'], related: ['cloudwatch'] },
  { id: 'cpu', word: 'CPU使用率', short: 'サーバーの頭脳がどれくらい忙しいか（%）', body: '100%に張りつくと処理が追いつかず、遅くなったりエラーになったりします。ふだんから80%を超えるなら増強を考えます。', exams: ['FE'], related: ['monitoring'] },
  { id: 'status-check', word: 'ステータスチェック', short: 'AWSが自動でやっている、EC2の健康診断', body: 'サーバー自体や、その下の物理マシンに異常がないか確かめます。失敗したらアラームで自動復旧（別の物理マシンに移す）できます。', exams: ['SAA'], related: ['ec2'] },
  { id: 'http-status', word: 'HTTPステータスコード', short: 'Webサーバーが返す「結果の番号」', body: '200＝成功、404＝ページがない、500＝サーバー内部のエラー、502＝裏のサーバーから変な返事、503＝混んでいて受けられない。5xx（500番台）はサーバー側の問題です。', exams: ['FE'], related: ['monitoring'] },
  { id: 'https', word: 'HTTPS', short: '暗号化したWeb通信（443番）', body: '途中で盗み見られたり書き換えられたりしないよう、通信を暗号化します。証明書が必要で、AWSでは ACM で無料で発行できます（ALBやCloudFrontで使う）。個人情報を扱うなら必須です。', exams: ['FE', 'SAA'], related: ['port'] },
  { id: 'ssh', word: 'SSH', short: 'サーバーに遠くからログインして操作するための仕組み（22番）', body: 'エンジニアがサーバーを管理するときに使います。世界中に開けておくと、パスワードを当てようとする攻撃が毎日来ます。自分たちのIPだけに絞るか、Session Managerを使って閉じておきます。', exams: ['FE', 'SAA'], related: ['security-group', 'port'] },
  { id: 'least-privilege', word: '最小権限の原則', short: '必要な人に、必要な分だけ許可する考え方', body: '「とりあえず全部許可」は事故のもと。通信もアカウントの権限も、必要最小限にします。セキュリティの一番の基本です。', exams: ['CLF', 'SAA', 'FE'], related: ['security-group'] },
  { id: 'multi-az', word: 'マルチAZ', short: '2つ以上のAZに分けて置き、片方が止まっても動けるようにすること', body: 'RDSのマルチAZは、別のAZに予備のDBを用意しておき、本番が止まると自動で切り替えます（フェイルオーバー）。料金はほぼ2倍。', exams: ['CLF', 'SAA'], related: ['az', 'failover'] },
  { id: 'failover', word: 'フェイルオーバー', short: '本番が止まったとき、予備に自動で切り替えること', body: '切り替わる間（数十秒〜数分）は止まることがあります。', exams: ['SAA', 'FE'], related: ['multi-az'] },
  { id: 'redundancy', word: '冗長化', short: '予備を用意して、1つ壊れても止まらないようにすること', body: 'サーバーを2台にする、AZを2つに分ける、など。お金はかかりますが、止められないシステムでは必須です。', exams: ['FE', 'SAA'], related: ['spof'] },
  { id: 'spof', word: '単一障害点（SPOF）', short: 'そこが壊れると全体が止まってしまう場所', body: 'Single Point Of Failure。1台しかないサーバー、1つしかないAZなど。設計では SPOF を探してつぶしていきます。', exams: ['FE', 'SAA'], related: ['redundancy'] },
  { id: 'backup', word: 'バックアップ', short: 'データの控えをとっておくこと', body: 'RDSの自動バックアップは、決めた日数分のデータを毎日保存し、その間の好きな時刻に戻せます。「戻せるか」を試しておくのも大事。', exams: ['FE', 'CLF', 'SAA'], related: ['pitr'] },
  { id: 'pitr', word: 'ポイントインタイムリカバリ', short: '「何時何分の状態」を指定してDBを戻すこと', body: 'RDSの自動バックアップがオンなら、保存期間の中の好きな時刻（5分前くらいまで）に戻せます。誤ってデータを消したときに使います。', exams: ['SAA'], related: ['backup'] },
  { id: 'disk', word: 'ディスク（EBS）', short: 'サーバーのデータを保存する場所', body: 'EC2のディスクはEBSというサービスです。いっぱいになるとファイルが書けず、アプリがエラーになります。', exams: ['SAA'], related: ['log-rotation'] },
  { id: 'log-rotation', word: 'ログローテーション', short: '古いログを自動で整理（圧縮・削除）する仕組み', body: 'ログは放っておくと増え続け、ディスクをいっぱいにします。日ごとに分けて、古いものは消すか、CloudWatch Logs や S3 に移します。', exams: ['FE'], related: ['disk'] },
  { id: 'billing-alarm', word: '請求アラーム', short: '料金が決めた額を超えそうになったら知らせる仕組み', body: 'CloudWatchやAWS Budgetsで設定します。消し忘れや想定外のアクセスに早く気づけます。最初に設定しておきたいものの1つ。', exams: ['CLF'], related: ['cost-optimization'] },
  { id: 'cost-optimization', word: 'コスト最適化', short: '性能を落とさずに、むだな料金を減らすこと', body: '使っていないものを消す、大きすぎるものを小さくする（ライトサイジング）、長く使うものは割引プランにする、など。', exams: ['CLF', 'SAA'], related: ['rightsizing', 'pay-as-you-go'] },
  { id: 'rightsizing', word: 'ライトサイジング', short: '使い方に合ったちょうどいい大きさに直すこと', body: 'CPUが毎日10%しか使われていないなら、1段小さくしても大丈夫かもしれません。', exams: ['CLF', 'SAA'], related: ['cost-optimization'] },
  { id: 'tag', word: 'タグ', short: 'AWSのリソースにつける名札', body: '「持ち主=三宅」「用途=テスト」「消す日=3/31」のようにつけておくと、誰の何かが一目でわかり、料金の集計にも使えます。', exams: ['CLF'], related: ['cost-optimization'] },
  { id: 'patch', word: 'パッチ（セキュリティ更新）', short: 'ソフトの弱点（脆弱性）を直す更新', body: '古いままだと、知られた弱点を突かれます。定期的に当てるのがインフラエンジニアの大事な仕事の1つ。', exams: ['FE'], related: ['nat-gateway'] },
  { id: 'bottleneck', word: 'ボトルネック', short: '全体の速さを決めてしまっている、一番遅いところ', body: 'Webをいくら増やしても、DBが遅ければ全体は速くなりません。どこがボトルネックかを数字で見つけるのが調査の基本です。', exams: ['FE'], related: ['monitoring'] },
  { id: 'shared-responsibility', word: '責任共有モデル', short: 'AWSと使う側で、守る範囲を分ける考え方', body: 'AWSは建物・機械・仮想化の仕組みなど「クラウドそのもの」を守り、使う側はOSの更新・セキュリティグループ・データの管理など「クラウドの中に置いたもの」を守ります。', exams: ['CLF', 'SAA'], related: ['least-privilege'] },
  { id: 'incident-report', word: '障害報告書', short: '障害のあとに、何が起きてどう直し、どう防ぐかをまとめた文書', body: 'いつ・何が・どれくらい（影響範囲）・原因・やった対応・再発防止策を、事実にもとづいて書きます。犯人探しではなく、同じことを起こさないためのもの。', exams: ['FE'], related: ['monitoring'] },
];

export const TERM_BY_ID: Record<string, Term> = Object.fromEntries(GLOSSARY.map((t) => [t.id, t]));
