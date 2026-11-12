import { emptyArchitecture } from './evaluate';
import { budgetFor } from './reference';
import { between, chance, hashString, pick, type Rng } from './rng';
import type { Architecture, Availability, ReqKey, Requirements, ServiceId, SiteKind } from './types';

export interface Customer {
  id: string;
  name: string; // 会社・お店の名前
  industry: string;
  contact: string; // 担当者
  avatar: string;
  pitch: string; // 最初の依頼文（あいまい）
  req: Requirements;
  asked: string[]; // 聞いた質問ID
  arch: Architecture;
  satisfaction: number; // 0-100
  live: boolean;
  createdDay: number;
  tier: 1 | 2 | 3;
  history: { day: number; text: string }[];
  /** 研修用：使えるサービスを絞る */
  allowed?: ServiceId[];
  /** 研修用：最初から分かっている要件 */
  given?: ReqKey[];
}

export interface Question {
  id: string;
  text: string;
  reveals: ReqKey[];
  answer: (c: Customer) => string;
  /** 先輩の補足（数字の読みかえなど） */
  note?: (c: Customer) => string | null;
}

const visitors = (rps: number) => Math.round((rps * 150) / 100) * 100;

export const QUESTIONS: Question[] = [
  {
    id: 'traffic',
    text: 'ふだん、どれくらいの人が見に来ますか？',
    reveals: ['peakRps'],
    answer: (c) => `1日に${visitors(c.req.peakRps).toLocaleString()}人くらいですかね。${c.req.kind === 'static' ? 'お昼前によく見られてるみたいです。' : '夜の8時〜10時あたりが一番多いです。'}`,
    note: (c) => `1日${visitors(c.req.peakRps).toLocaleString()}人なら、一番混む時間で だいたい ${c.req.peakRps} リクエスト/秒 やね（画像1枚も1リクエストに数える）。`,
  },
  {
    id: 'event',
    text: 'アクセスが急に増える予定はありますか？',
    reveals: ['spikeRps'],
    answer: (c) =>
      c.req.spikeRps > 0
        ? [`実は来月、テレビで紹介されることになって…！`, `年に一度の大セールがあります。いつもの何倍も来ます。`, `インフルエンサーさんに紹介してもらう予定です！`][hashString(c.id) % 3]
        : 'うーん、特にないですね。毎日だいたい同じくらいです。',
    note: (c) => (c.req.spikeRps > 0 ? `そのときは ${c.req.spikeRps} リクエスト/秒 くらいまで増える想定にしとこう。ふだんの${Math.round(c.req.spikeRps / Math.max(1, c.req.peakRps))}倍や。` : null),
  },
  {
    id: 'downtime',
    text: 'サイトが止まったら、どれくらい困りますか？',
    reveals: ['availability'],
    answer: (c) =>
      ({
        low: '半日くらい見られなくても、正直そこまで困らないです。',
        mid: '営業時間中に止まると予約が取れなくなるので困ります。夜中なら少しは…',
        high: '24時間ずっと注文が入るので、止まるのは絶対ダメです！',
      })[c.req.availability],
    note: (c) =>
      ({
        low: '止まっても困らないなら、1台でも大丈夫。お金をかけすぎんようにね。',
        mid: '1台壊れても動き続けるように、2台以上かAuto Scalingにしたいね。DBのバックアップも。',
        high: '24時間止められんなら、2つのAZに分けるマルチAZ構成が必要やな。',
      })[c.req.availability],
  },
  {
    id: 'data',
    text: 'お客さんの名前や電話番号など、個人情報は扱いますか？',
    reveals: ['sensitive'],
    answer: (c) => (c.req.sensitive ? 'はい、名前・電話番号・メールアドレスを登録してもらいます。' : 'いえ、お店の紹介だけなので扱わないです。'),
    note: (c) => (c.req.sensitive ? '個人情報があるなら、HTTPS（443番）は必須。DBも外から触れん場所に置こう。' : null),
  },
  {
    id: 'budget',
    text: '毎月の予算はどれくらいですか？',
    reveals: ['budgetYen'],
    answer: (c) => `月に${c.req.budgetYen.toLocaleString()}円くらいまでなら出せます。`,
  },
  {
    id: 'backup',
    text: 'データが消えてしまったら困りますか？',
    reveals: ['needsBackup'],
    answer: (c) => (c.req.needsBackup ? '困ります！予約や注文のデータは消えたら商売になりません。' : 'お知らせが少し消えるくらいなら、また書けばいいので…'),
    note: (c) => (c.req.needsBackup ? 'それならバックアップは必ず取っとこう。' : null),
  },
  {
    id: 'admin',
    text: '管理画面には、誰がどこから入りますか？',
    reveals: ['officeOnlyAdmin'],
    answer: () => '店長と私だけです。お店（事務所）のパソコンから入ります。',
    note: () => '管理用の入口（SSHなど）は、事務所のIPだけに絞れるってことやね。',
  },
  { id: 'color', text: 'サイトのイメージカラーは何色ですか？', reveals: [], answer: () => 'オレンジです！元気な感じにしたくて。', note: () => '……それはデザイナーさんに聞こか（笑）。インフラの設計には関係ないね。' },
  { id: 'lang', text: 'どのプログラミング言語が好きですか？', reveals: [], answer: () => 'え、私ですか？ プログラミングはちょっと…', note: () => 'お客さんに聞いてもしゃあないで（笑）。使う言語は開発チームに確認しよう。' },
  { id: 'launch', text: 'いつまでに公開したいですか？', reveals: [], answer: () => '来月の頭には出したいです。', note: () => 'スケジュールは大事やけど、今回の構成には直接関係せえへんね。' },
];

export const MAX_QUESTIONS = 4;

/** 聞いていない要件は、仮の値で考える（設計画面ではこちらで判定する） */
export function knownRequirements(c: Customer): Requirements {
  const known = new Set<ReqKey>(['kind', ...(c.given ?? [])]);
  for (const q of QUESTIONS) if (c.asked.includes(q.id)) q.reveals.forEach((k) => known.add(k));
  const fallback: Requirements = { kind: c.req.kind, peakRps: 10, spikeRps: 0, availability: 'low', sensitive: false, budgetYen: 1e9, needsBackup: false, officeOnlyAdmin: false };
  const out = { ...fallback };
  (Object.keys(c.req) as ReqKey[]).forEach((k) => {
    if (known.has(k)) (out as any)[k] = c.req[k];
  });
  return out;
}

export function knownKeys(c: Customer): Set<ReqKey> {
  const known = new Set<ReqKey>(['kind', ...(c.given ?? [])]);
  for (const q of QUESTIONS) if (c.asked.includes(q.id)) q.reveals.forEach((k) => known.add(k));
  return known;
}

export const REQ_LABEL: Record<ReqKey, string> = {
  kind: 'サイトの種類',
  peakRps: 'ふだんのピーク',
  spikeRps: 'アクセス集中',
  availability: '止まったときの困り度',
  sensitive: '個人情報',
  budgetYen: '月の予算',
  needsBackup: 'バックアップ',
  officeOnlyAdmin: '管理者の場所',
};

export function reqValueText(k: ReqKey, r: Requirements): string {
  switch (k) {
    case 'kind':
      return { static: '静的なサイト（HTML・画像だけ）', webapp: 'Webアプリ（DBなし）', 'webapp-db': 'Webアプリ＋データベース' }[r.kind];
    case 'peakRps':
      return `${r.peakRps} リクエスト/秒`;
    case 'spikeRps':
      return r.spikeRps > 0 ? `${r.spikeRps} リクエスト/秒まで増える` : '予定なし';
    case 'availability':
      return { low: '低（止まってもすぐは困らない）', mid: '中（営業時間は止めたくない）', high: '高（24時間止められない）' }[r.availability];
    case 'sensitive':
      return r.sensitive ? 'あり' : 'なし';
    case 'budgetYen':
      return r.budgetYen >= 1e9 ? '？' : `¥${r.budgetYen.toLocaleString()}/月`;
    case 'needsBackup':
      return r.needsBackup ? '必要' : 'なくてもよい';
    case 'officeOnlyAdmin':
      return r.officeOnlyAdmin ? '事務所からだけ' : '指定なし';
  }
}

// ---------------- ランダム案件 ----------------

interface Template {
  kind: SiteKind;
  industries: { industry: string; names: string[]; pitch: string; avatar: string }[];
}

const TEMPLATES: Template[] = [
  {
    kind: 'static',
    industries: [
      { industry: '飲食店', names: ['麺処 しおかぜ', 'カフェ こもれび', '定食屋 ひだまり', '焼鳥 とりまる'], pitch: 'お店のホームページを作りたいんです。メニューと地図が載ってればいいかな。', avatar: '🍜' },
      { industry: '美容室', names: ['Hair Salon Lumo', '美容室 そよ風'], pitch: 'お店の紹介ページがほしいです。写真をたくさん載せたいです。', avatar: '💇' },
      { industry: '町工場', names: ['北川精工', 'みなと製作所'], pitch: '会社のホームページを新しくしたいです。今のはもう10年前ので…', avatar: '🏭' },
      { industry: 'スポーツクラブ', names: ['FCあおぞらジュニア', '寝屋川ユナイテッドU-12'], pitch: 'チームのホームページを作りたいです。試合の結果とか載せたくて。', avatar: '⚽' },
    ],
  },
  {
    kind: 'webapp-db',
    industries: [
      { industry: '整体院', names: ['ほぐし堂', 'からだ整骨院'], pitch: 'ネットで予約を受けられるようにしたいんです。今は電話だけで…', avatar: '💆' },
      { industry: 'ネットショップ', names: ['ハコニワ雑貨', 'まるまるコーヒー豆店', 'よつば手ぬぐい'], pitch: 'ネットショップを自分たちで持ちたいです。会員登録もできるように。', avatar: '🛒' },
      { industry: '学習塾', names: ['ひらめき個別塾', 'スタディ寺子屋'], pitch: '生徒が宿題を出したり、成績を見られたりするサイトを作りたいです。', avatar: '📚' },
      { industry: 'イベント会社', names: ['ナニワ音楽フェス実行委員会', 'まちなかマルシェ'], pitch: 'チケットの申し込みをネットで受けたいです。', avatar: '🎫' },
      { industry: '病院', names: ['さくらクリニック', 'みどり歯科'], pitch: '診察の予約と問診票をネットでできるようにしたいです。', avatar: '🏥' },
    ],
  },
  {
    kind: 'webapp',
    industries: [
      { industry: '観光協会', names: ['寝屋川観光協会', 'みなと町観光ナビ'], pitch: 'イベント情報がその場で更新される観光案内サイトを作りたいです。', avatar: '🗺️' },
      { industry: 'ゲーム会社', names: ['ピコピコスタジオ'], pitch: '新作ゲームのキャンペーンサイトを出したいです。ランキングは別のサービスで出します。', avatar: '🎮' },
    ],
  },
];

const CONTACTS = ['山田さん', '佐藤さん', '中村さん', '田中さん', '松本さん', '井上さん', '木村さん', '林さん', '清水さん', '森さん'];

export function generateCustomer(r: Rng, day: number, tier: 1 | 2 | 3, id: string): Customer {
  const kindRoll = r();
  const t = kindRoll < 0.25 ? TEMPLATES[0] : kindRoll < 0.85 ? TEMPLATES[1] : TEMPLATES[2];
  const ind = pick(r, t.industries);
  const name = pick(r, ind.names);
  const scale = tier === 1 ? [10, 40] : tier === 2 ? [40, 160] : [150, 600];
  const peakRps = between(r, scale[0], scale[1]);
  const spike = chance(r, t.kind === 'static' ? 0.4 : tier === 1 ? 0.25 : 0.45) ? Math.round(peakRps * between(r, 4, 10)) : 0;
  const availability: Availability =
    t.kind === 'static' ? (chance(r, 0.8) ? 'low' : 'mid') : tier === 1 ? pick(r, ['low', 'mid', 'mid'] as const) : tier === 2 ? pick(r, ['mid', 'mid', 'high'] as const) : pick(r, ['mid', 'high', 'high'] as const);
  const sensitive = t.kind === 'webapp-db' ? chance(r, 0.85) : false;
  const needsBackup = t.kind === 'webapp-db' ? chance(r, 0.9) : false;
  const base = { kind: t.kind, peakRps, spikeRps: spike, availability, sensitive, needsBackup, officeOnlyAdmin: true };
  const budgetYen = budgetFor(base, 1.15 + r() * 0.5);
  return {
    id,
    name,
    industry: ind.industry,
    contact: pick(r, CONTACTS),
    avatar: ind.avatar,
    pitch: ind.pitch,
    req: { ...base, budgetYen },
    asked: [],
    arch: emptyArchitecture(),
    satisfaction: 60,
    live: false,
    createdDay: day,
    tier,
    history: [],
  };
}
