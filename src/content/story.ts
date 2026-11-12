import type { QuizQ } from './quiz';
import type { ReqKey, Requirements, ServiceId } from '../engine/types';

export const COMPANY = '株式会社ソラリンク';
export const SENPAI = { name: '三宅さん', avatar: '🧑‍💻', role: '先輩（入社6年目のクラウドエンジニア）' };
export const BUCHO = { name: '大西部長', avatar: '👔', role: 'インフラ部 部長' };

export interface Slide {
  emoji: string;
  title: string;
  body: string; // [[用語ID|表示]] でタップできる用語になる
  check?: QuizQ;
}

export interface Lesson {
  id: string;
  title: string;
  slides: Slide[];
}

export const LESSONS: Record<string, Lesson> = {
  welcome: {
    id: 'welcome',
    title: '入社おめでとう！クラウドってなに？',
    slides: [
      { emoji: '🏢', title: `${COMPANY}へようこそ`, body: `うちは、いろんな会社のシステムをAWSの上に作って、動かし続ける（運用する）会社。今日から1週間は研修で、俺（三宅）が横について教えるから安心して。\n\nわからん言葉は、下線のついた言葉をタップしたら説明が出るで。例えば[[cloud|クラウド]]。` },
      { emoji: '☁️', title: 'クラウドってなに？', body: '昔は会社が自分でサーバー（コンピューター）を買って、部屋に置いてた。これが[[on-premises|オンプレミス]]。\n\nクラウドは、AWSみたいな会社が持ってる大量のコンピューターを、必要な分だけ借りる形。数分で用意できて、いらんくなったら返せる。料金は[[pay-as-you-go|使った分だけ]]。' },
      { emoji: '🗾', title: 'リージョンとAZ', body: 'AWSのデータセンターは世界中にあって、地域ごとに[[region|リージョン]]と呼ぶ。日本のお客さんなら東京リージョンを使うことが多い。\n\n1つのリージョンの中に、電源やネットワークが別々の[[az|AZ（アベイラビリティゾーン）]]がいくつかある。片方が止まっても、もう片方は動く。これが後で効いてくるから覚えといて。', check: { id: 'l-az', q: '東京リージョンのAZ-aが停電した。AZ-cはどうなる？', choices: ['一緒に止まる', '別々に作られているので動き続ける', '東京リージョン全体が止まる'], answer: 1, explain: 'AZは電源やネットワークが独立しているので、1つが止まってもほかは動きます。', terms: ['az'] } },
      { emoji: '🧑‍💻', title: 'クラウドエンジニアの仕事', body: '1. お客さんに話を聞く（ヒアリング）\n2. 構成を考えて、料金を見積もる\n3. 作業手順書を書いて、先輩にレビューしてもらう\n4. 作って、ちゃんと動くか確かめる\n5. 公開したあとも見張って（監視）、何かあったら直す（障害対応）\n\n作って終わりちゃうのがポイント。作ったシステムとは、ずっと付き合っていくことになる。' },
    ],
  },
  'ec2-sg': {
    id: 'ec2-sg',
    title: 'サーバーと門番',
    slides: [
      { emoji: '🖥️', title: 'EC2 = クラウドのパソコン', body: '[[ec2|EC2]]は、クラウド上に借りるサーバー。大きさは[[instance-type|インスタンスタイプ]]で選ぶ。t3.micro が一番小さくて安い。大きいほど速いけど高い。' },
      { emoji: '🏢', title: 'VPCとサブネット', body: 'サーバーを置く前に、自分専用のネットワーク[[vpc|VPC]]を作って、その中を[[subnet|サブネット]]に区切る。\n\n・パブリックサブネット：インターネットから入れる場所\n・プライベートサブネット：外から直接は入れない奥の部屋\n\nサブネットは1つのAZの中に作る。' },
      { emoji: '🛡️', title: 'セキュリティグループ = 門番', body: 'サーバーには[[security-group|セキュリティグループ]]という門番をつける。「何番の窓口（[[port|ポート]]）に、どこからの通信を通すか」を書く。書いてない通信は全部止められる。\n\n・80番 = Webページ（HTTP）\n・443番 = 暗号化したWebページ（HTTPS）\n・22番 = サーバー管理用（SSH）\n・3306番 = データベース（MySQL）', check: { id: 'l-sg', q: 'Webページを見てもらうために開ける必要があるのは？', choices: ['22番を世界中に', '80番（か443番）を世界中に', '3306番を世界中に'], answer: 1, explain: 'Webページは80番（HTTP）か443番（HTTPS）。22番や3306番を世界中に開けるのは危険です。', terms: ['port', 'security-group'] } },
      { emoji: '🔑', title: '管理用の入口は絞る', body: '[[ssh|SSH（22番）]]は、俺らエンジニアがサーバーに入るための入口。これを「どこからでも」にすると、世界中から毎日パスワード当てゲームをされる。\n\n管理用の入口は「事務所から」だけ。これを[[least-privilege|最小権限の原則]]って言う。' },
    ],
  },
  's3-cf': {
    id: 's3-cf',
    title: '静的サイトはS3とCloudFrontで',
    slides: [
      { emoji: '📄', title: '静的サイトってなに？', body: 'お店の紹介ページみたいに、HTMLと画像だけで、誰が見ても同じ内容のサイトを[[static-site|静的サイト]]って言う。プログラムを動かすサーバーはいらん。' },
      { emoji: '🪣', title: 'S3に置く', body: '[[s3|S3]]はファイルの倉庫。HTMLや画像をここに置ける。データは自動で複数のAZにコピーされるから、めっちゃ丈夫。サーバーの面倒も見なくていい。' },
      { emoji: '🌐', title: 'CloudFrontで配る', body: '[[cloudfront|CloudFront]]は、世界中の拠点にコピーを置いて、お客さんの近くから返す仕組み。速いし、アクセスが急に増えても強い。\n\nS3の[[block-public-access|パブリックアクセスブロック]]はオンのままにして、「CloudFrontからだけ読める」ようにするのが安全なやり方。', check: { id: 'l-s3', q: 'S3のサイトを安全に公開するやり方は？', choices: ['パブリックアクセスブロックをオフにして直接公開', 'ブロックはオンのまま、CloudFrontからだけ読めるようにする', 'EC2にコピーして公開'], answer: 1, explain: 'S3の情報流出事故の多くは公開設定のミス。ブロックはオンのまま、CloudFront経由で配ります。', terms: ['block-public-access', 'cloudfront'] } },
      { emoji: '💴', title: '見積もりも仕事のうち', body: '構成を組んだら、毎月いくらかかるか見積もってお客さんに出す。予算を超えたら採用されへん。でも安ければいいわけでもない。お客さんが「何に困るか」を聞いてから決めるのが大事。\n\n今日からお客さんとの[[cloud|ヒアリング]]も始まるで。質問は4つまで。何を聞くかが腕の見せどころ。' },
    ],
  },
  'rds-net': {
    id: 'rds-net',
    title: 'データベースと、守りの構成',
    slides: [
      { emoji: '🗄️', title: 'RDS = おまかせデータベース', body: '予約や会員のデータは[[database|データベース]]に入れる。[[rds|RDS]]なら、バックアップやパッチ当てをAWSがやってくれる。\n\nRDSは「DBサブネットグループ」として、2つのAZにサブネットを用意する決まりがある。' },
      { emoji: '🔒', title: 'DBは奥の部屋に', body: 'DBは大事なデータの金庫。インターネットから入れない[[subnet|プライベートサブネット]]に置く。\n\nセキュリティグループでは、3306番を「Webから」だけ許可。世界中に開けるのは絶対ダメ。', check: { id: 'l-db', q: 'DBのセキュリティグループで3306番を許可する相手は？', choices: ['どこからでも', 'Webサーバーから', '事務所から'], answer: 1, explain: 'DBに話しかけるのはアプリ（Webサーバー）だけ。必要な相手だけに絞ります。', terms: ['security-group', 'least-privilege'] } },
      { emoji: '🔐', title: '個人情報ならHTTPS', body: '名前や電話番号を扱うなら、通信は[[https|HTTPS（443番）]]で暗号化する。証明書はAWSのACMで無料で作れる（ALBやCloudFrontに設定）。' },
      { emoji: '💾', title: 'バックアップ', body: 'データは「消える前提」で考える。RDSの[[backup|自動バックアップ]]をオンにしておけば、間違って消しても、5分前くらいの状態に戻せる（[[pitr|ポイントインタイムリカバリ]]）。' },
      { emoji: '🔀', title: '1台壊れても止まらない', body: 'サーバーが1台だけやと、そいつが壊れたら終わり。これを[[spof|単一障害点]]って言う。\n\n[[alb|ALB（ロードバランサー）]]の後ろに2台置けば、1台壊れてももう1台で動き続けられる（[[redundancy|冗長化]]）。ALBは2つのAZのサブネットが必要。\n\nWebをプライベートに置くなら、更新を取りに行く出口の[[nat-gateway|NATゲートウェイ]]もいる（ちょっと高い）。' },
    ],
  },
  scale: {
    id: 'scale',
    title: '混んでも落ちない構成',
    slides: [
      { emoji: '📈', title: '性能の上げ方は2つ', body: '・[[scale-up|スケールアップ]]：サーバーを大きくする（縦に伸ばす）。簡単やけど上限がある。\n・[[scale-out|スケールアウト]]：台数を増やす（横に広げる）。ALBで振り分ける。上限がなくて、壊れにも強い。' },
      { emoji: '🤖', title: 'Auto Scaling', body: 'セールの時だけ10倍来る、みたいな時に、ふだんから10倍の台数を置いたらお金のムダ。\n\n[[auto-scaling|Auto Scaling]]なら、混んだら自動で増やして、空いたら減らす。ALBとセットで使う。', check: { id: 'l-asg', q: 'セールの時間だけアクセスが10倍。ふだんの料金は抑えたい。', choices: ['ふだんから10倍の台数を置く', 'ALBとAuto Scalingで、混んだら増やす', '一番大きいサーバー1台にする'], answer: 1, explain: '必要な時だけ増やすのがクラウドらしいやり方です。', terms: ['auto-scaling'] } },
      { emoji: '🏙️', title: 'マルチAZ', body: '24時間止められないシステムは、AZごと止まっても動けるように、WebもDBも2つのAZに分ける（[[multi-az|マルチAZ]]）。RDSのマルチAZは、予備のDBに自動で切り替わる（[[failover|フェイルオーバー]]）。料金はほぼ倍。' },
      { emoji: '🔔', title: '監視は先に仕込む', body: '障害は、お客さんから電話で知るより、自分たちで先に気づきたい。[[cloudwatch|CloudWatch]]のアラームで、CPU・エラー数・ディスク・請求額なんかを見張っておく。\n\nアラームがあると、障害対応のときに「アラームで検知」になって評価も上がるで。' },
    ],
  },
  incident: {
    id: 'incident',
    title: '障害対応の進め方',
    slides: [
      { emoji: '🚨', title: 'あわてない', body: '障害が起きたら、まず落ち着く。順番はいつもこう。\n\n1. 状況を確認する（何が・いつから・どれくらい）\n2. 原因を探す（数字・ログ・コマンド）\n3. まず止血（サービスを戻す）\n4. 再発防止を考える\n5. [[incident-report|障害報告書]]を書く' },
      { emoji: '🔍', title: '切り分け', body: '「どこが悪いのか」を順番に確かめていく。サイトは見られる？ Webは忙しい？ DBは？ ディスクは？\n\n全体の速さを決めてる一番遅いところを[[bottleneck|ボトルネック]]って言う。思い込みで決めず、数字で確かめるのが大事。' },
      { emoji: '📝', title: '報告書は事実で', body: '報告書には、時刻・影響範囲・原因・対応・再発防止を書く。大げさにも、小さくも書かない。\n\nそれと、報告書は犯人探しのためのもんちゃう。「仕組みでどう防ぐか」を考えるためのもの。' },
    ],
  },
};

/** 研修中の案件（決まった中身） */
export interface ScriptedCase {
  id: string;
  name: string;
  industry: string;
  contact: string;
  avatar: string;
  pitch: string;
  req: Requirements;
  allowed: ServiceId[];
  given?: ReqKey[];
  intro: string; // 先輩からの前ふり
}

export const TRAINING_CASES: Record<string, ScriptedCase> = {
  testpage: {
    id: 'testpage',
    name: 'ソラリンク社内テストページ',
    industry: '社内',
    contact: '三宅さん',
    avatar: '🧪',
    pitch: '研修用に、社内向けのテストページを動かすサーバーを1台作ってみよう。',
    req: { kind: 'webapp', peakRps: 10, spikeRps: 0, availability: 'low', sensitive: false, budgetYen: 3000, needsBackup: false, officeOnlyAdmin: true },
    allowed: ['vpc', 'sg', 'ec2', 'cloudwatch'],
    given: ['peakRps', 'spikeRps', 'availability', 'sensitive', 'budgetYen', 'needsBackup', 'officeOnlyAdmin'],
    intro: '最初は練習。条件は全部わかってるから、ヒアリングはなし。\n\nパブリックサブネットにEC2を1台置いて、80番を世界中に、SSH（22番）は事務所だけに開けよう。',
  },
  ramen: {
    id: 'ramen',
    name: '麺屋つばさ',
    industry: '飲食店',
    contact: '店長の翼さん',
    avatar: '🍜',
    pitch: 'うちのラーメン屋のホームページを作りたいんです！ メニューと地図と、営業時間が載ってればいいかな。',
    req: { kind: 'static', peakRps: 20, spikeRps: 400, availability: 'low', sensitive: false, budgetYen: 3000, needsBackup: false, officeOnlyAdmin: true },
    allowed: ['vpc', 'sg', 'ec2', 's3', 'cloudfront', 'cloudwatch'],
    intro: '今日から本物のお客さんや。ラーメン屋さんのホームページ。\n\nまずは話を聞こう。質問は4つまで。何を聞いたら構成が決まるか考えてな。',
  },
  sakura: {
    id: 'sakura',
    name: 'さくら整体院',
    industry: '整体院',
    contact: '院長の桜井さん',
    avatar: '💆',
    pitch: 'ネットで予約を受けられるようにしたいんです。今は電話だけで、施術中に出られなくて…',
    req: { kind: 'webapp-db', peakRps: 30, spikeRps: 0, availability: 'mid', sensitive: true, budgetYen: 25000, needsBackup: true, officeOnlyAdmin: true },
    allowed: ['vpc', 'sg', 'ec2', 's3', 'cloudfront', 'rds', 'alb', 'nat', 'cloudwatch'],
    intro: '今日は予約システム。データベースが出てくるで。\n\n予約には名前と電話番号が入るはず…やけど、ちゃんとヒアリングで確かめてな。',
  },
  hakoniwa: {
    id: 'hakoniwa',
    name: 'ハコニワ雑貨',
    industry: 'ネットショップ',
    contact: '店長の箱崎さん',
    avatar: '🛒',
    pitch: '自分たちのネットショップを持ちたいんです！ 今はモールに出してるんですけど、手数料が高くて…',
    req: { kind: 'webapp-db', peakRps: 60, spikeRps: 600, availability: 'high', sensitive: true, budgetYen: 80000, needsBackup: true, officeOnlyAdmin: true },
    allowed: ['vpc', 'sg', 'ec2', 's3', 'cloudfront', 'rds', 'alb', 'asg', 'nat', 'cloudwatch', 'multiaz'],
    intro: '研修の山場や。ネットショップは「止まる＝売上ゼロ」。それに、セールで一気に人が来ることもある。\n\nヒアリングで、どこまで聞き出せるかやな。',
  },
};

export interface DayPlan {
  day: number;
  title: string;
  morning: string; // 朝会のひとこと
  tasks: ({ kind: 'lesson'; lessonId: string } | { kind: 'project'; caseId: string } | { kind: 'incident'; caseId: string; type: 'data_delete' | 'spike'; spikeRps?: number } | { kind: 'review' })[];
}

export const TRAINING_DAYS: DayPlan[] = [
  { day: 1, title: '月曜日：入社と研修', morning: 'おはよう！今日から1週間、研修やで。まずはクラウドの基本から。午後はサーバーを1台作ってみよう。', tasks: [{ kind: 'lesson', lessonId: 'welcome' }, { kind: 'lesson', lessonId: 'ec2-sg' }, { kind: 'project', caseId: 'testpage' }] },
  { day: 2, title: '火曜日：はじめてのお客さん', morning: '今日は初めてのお客さんや。ラーメン屋さんのホームページ。俺も横で見とくから。', tasks: [{ kind: 'lesson', lessonId: 's3-cf' }, { kind: 'project', caseId: 'ramen' }] },
  { day: 3, title: '水曜日：データベースのある案件', morning: '今日は整体院の予約システム。データベースとネットワークの守り方を覚えよう。', tasks: [{ kind: 'lesson', lessonId: 'rds-net' }, { kind: 'project', caseId: 'sakura' }] },
  { day: 4, title: '木曜日：止められないネットショップ', morning: '今日はネットショップ。混んでも落ちない、止まらない構成に挑戦や。', tasks: [{ kind: 'lesson', lessonId: 'scale' }, { kind: 'project', caseId: 'hakoniwa' }] },
  { day: 5, title: '金曜日：はじめての障害対応', morning: '研修最終日。…と思ったら、朝から電話が鳴ってるで。今週作ったシステムで何か起きたみたいや。', tasks: [{ kind: 'lesson', lessonId: 'incident' }, { kind: 'incident', caseId: 'sakura', type: 'data_delete' }, { kind: 'incident', caseId: 'ramen', type: 'spike', spikeRps: 400 }, { kind: 'review' }] },
];

export const RANKS = [
  { id: 0, name: '新人', xp: 0, cert: null as null | 'basic' | 'architect', tier: 1 as const },
  { id: 1, name: '若手', xp: 600, cert: 'basic' as const, tier: 1 as const },
  { id: 2, name: '中堅', xp: 1800, cert: 'architect' as const, tier: 2 as const },
  { id: 3, name: 'リーダー', xp: 4000, cert: 'architect' as const, tier: 3 as const },
];

export const WEEKDAYS = ['月', '火', '水', '木', '金'];
