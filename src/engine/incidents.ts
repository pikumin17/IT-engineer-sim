import { EC2_RPS, INSTANCE_TYPES, DB_SIZES, yen } from './catalog';
import { capacity, cloneArch, evaluate, hasRule, servesStaticFromS3, servingInstances, webInstances } from './evaluate';
import type { Customer } from './cases';
import { between, chance, mulberry32, pick, shuffle, type Rng } from './rng';
import type { Architecture, Requirements } from './types';

export type IncidentType = 'spike' | 'instance_failure' | 'az_outage' | 'db_overload' | 'disk_full' | 'ssh_attack' | 'data_delete' | 'cost_spike';

export interface Command {
  id: string;
  cmd: string;
  explain: string; // このコマンドは何をするか
  output: string;
  clue: boolean; // 原因の手がかりになるか
}

export interface Choice {
  id: string;
  text: string;
  good: boolean;
  explain: string;
}

export interface ActionChoice extends Choice {
  apply?: (a: Architecture, req: Requirements) => Architecture;
}

export interface Metric {
  key: string;
  label: string;
  unit: string;
  values: number[];
  threshold?: number;
}

export interface IncidentSpec {
  type: IncidentType;
  title: string;
  impacted: boolean;
  detectedBy: 'alarm' | 'customer';
  alertTitle: string;
  alertBody: string;
  start: string; // 発生時刻
  minutes: number; // 影響が続いた分数
  metrics: Metric[];
  commands: Command[];
  causes: Choice[];
  restores: ActionChoice[];
  prevents: ActionChoice[];
  impacts: Choice[];
  goodNews: string; // 影響がなかったときの知らせ
  lesson: string;
  terms: string[];
}

export interface IncidentSeed {
  type: IncidentType;
  seed: number;
  spikeRps?: number;
}

// ---------------- 構成を直す操作（対応の選択で使う） ----------------

const ruleSet = (a: Architecture, target: any, port: any, source: any) => {
  if (!a.rules.some((r) => r.target === target && r.port === port && r.source === source)) a.rules.push({ target, port, source });
};

export const fixes = {
  albAndAutoScaling(a0: Architecture, req: Requirements): Architecture {
    const a = cloneArch(a0);
    if (!a.web) return a;
    a.publicSubnets = ['a', 'c'];
    a.alb = true;
    if (a.web.subnet === 'private' && a.privateSubnets.length < 2) a.privateSubnets = ['a', 'c'];
    a.web.azs = ['a', 'c'];
    a.web.perAz = Math.max(1, a.web.perAz);
    a.web.autoScaling = true;
    const need = Math.max(req.peakRps, req.spikeRps) * 1.3 * (a.cloudfront ? 0.5 : 1);
    a.web.asgMax = Math.max(a.web.perAz * 2, Math.min(30, Math.ceil(need / EC2_RPS[a.web.type])));
    ruleSet(a, 'alb', 443, 'anywhere');
    ruleSet(a, 'alb', 80, 'anywhere');
    ruleSet(a, 'web', 80, 'alb');
    if (!a.alarms.includes('5xx')) a.alarms.push('5xx');
    return a;
  },
  scaleUpWeb(a0: Architecture): Architecture {
    const a = cloneArch(a0);
    if (!a.web) return a;
    const i = INSTANCE_TYPES.indexOf(a.web.type);
    a.web.type = INSTANCE_TYPES[Math.min(i + 1, INSTANCE_TYPES.length - 1)];
    return a;
  },
  scaleUpDb(a0: Architecture): Architecture {
    const a = cloneArch(a0);
    if (!a.db) return a;
    const i = DB_SIZES.indexOf(a.db.size);
    a.db.size = DB_SIZES[Math.min(i + 1, DB_SIZES.length - 1)];
    return a;
  },
  cloudfront(a0: Architecture): Architecture {
    const a = cloneArch(a0);
    a.cloudfront = true;
    return a;
  },
  twoServers(a0: Architecture, req: Requirements): Architecture {
    const a = fixes.albAndAutoScaling(a0, req);
    if (a.web) {
      a.web.autoScaling = req.spikeRps > 0;
      a.web.asgMax = Math.max(a.web.asgMax, 2);
    }
    return a;
  },
  multiAz(a0: Architecture, req: Requirements): Architecture {
    const a = fixes.twoServers(a0, req);
    if (a.db) {
      a.db.multiAz = true;
      a.privateSubnets = ['a', 'c'];
    }
    return a;
  },
  alarm(kind: Architecture['alarms'][number]) {
    return (a0: Architecture) => {
      const a = cloneArch(a0);
      if (!a.alarms.includes(kind)) a.alarms.push(kind);
      return a;
    };
  },
  logRotation(a0: Architecture): Architecture {
    const a = cloneArch(a0);
    a.logRotation = true;
    if (!a.alarms.includes('disk')) a.alarms.push('disk');
    return a;
  },
  restrictSsh(a0: Architecture): Architecture {
    const a = cloneArch(a0);
    a.rules = a.rules.map((r) => (r.port === 22 && r.source === 'anywhere' ? { ...r, source: 'office' } : r));
    return a;
  },
  backup(a0: Architecture): Architecture {
    const a = cloneArch(a0);
    if (a.db) a.db.backupDays = Math.max(7, a.db.backupDays);
    return a;
  },
  removeIdle(a0: Architecture): Architecture {
    const a = cloneArch(a0);
    a.idleYen = 0;
    if (!a.alarms.includes('billing')) a.alarms.push('billing');
    return a;
  },
};

// ---------------- 影響が出るか ----------------

export function isImpacted(type: IncidentType, a: Architecture, req: Requirements, spikeRps = 0): boolean {
  switch (type) {
    case 'spike':
      return capacity(a, req, true) < spikeRps;
    case 'instance_failure':
      if (req.kind === 'static' && servesStaticFromS3(a)) return false;
      return servingInstances(a) < 2 && !(a.alb && a.web?.autoScaling);
    case 'az_outage': {
      if (req.kind === 'static' && servesStaticFromS3(a)) return false;
      const webSplit = a.alb && !!a.web && a.web.azs.length >= 2;
      const dbOk = !a.db || a.db.multiAz;
      return !(webSplit && dbOk);
    }
    case 'disk_full':
      return !a.logRotation;
    default:
      return true;
  }
}

/** この環境で起きやすいできごとを重みつきで選ぶ */
export function rollIncidentType(r: Rng, c: Customer): IncidentType | null {
  const a = c.arch;
  const req = c.req;
  const s3 = req.kind === 'static' && servesStaticFromS3(a);
  const w: [IncidentType, number][] = [];
  w.push(['spike', req.spikeRps > 0 ? 3 : 1]);
  if (!s3 && a.web) {
    w.push(['instance_failure', isImpacted('instance_failure', a, req) ? 2.5 : 0.8]);
    w.push(['az_outage', isImpacted('az_outage', a, req) ? 1.2 : 0.4]);
    w.push(['disk_full', a.logRotation ? 0 : 2]);
    w.push(['ssh_attack', hasRule(a, 'web', 22, ['anywhere']) ? 4 : 0]);
  }
  if (a.db) {
    w.push(['db_overload', 0.8]);
    w.push(['data_delete', a.db.backupDays === 0 ? 1.5 : 0.6]);
  }
  w.push(['cost_spike', 0.6]);
  const total = w.reduce((s, [, x]) => s + x, 0);
  if (total <= 0) return null;
  let x = r() * total;
  for (const [t, wt] of w) {
    if ((x -= wt) <= 0) return t;
  }
  return w[w.length - 1][0];
}

// ---------------- 障害の中身を作る ----------------

const pad = (n: number) => String(n).padStart(2, '0');
const time = (startMin: number, plus: number) => {
  const m = startMin + plus;
  return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
};
const domain = (c: Customer) => `www.${c.id.replace(/[^a-z0-9]/gi, '').toLowerCase()}.example.jp`;

function series(r: Rng, n: number, f: (i: number) => number) {
  return Array.from({ length: n }, (_, i) => Math.max(0, Math.round(f(i) * (0.92 + r() * 0.16))));
}

export function buildIncident(seed: IncidentSeed, c: Customer): IncidentSpec {
  const r = mulberry32(seed.seed);
  const a = c.arch;
  const req = c.req;
  const startMin = between(r, 9 * 60, 21 * 60);
  const N = 24; // 5分ごと、2時間
  const at = 10; // 何番目の点から始まるか
  const minutes = between(r, 15, 45);
  const endIdx = Math.min(N - 1, at + Math.ceil(minutes / 5));
  const t0 = time(startMin, 0);
  const site = domain(c);
  const cap = Math.max(1, capacity(a, req));
  const normal = req.peakRps * 0.7;
  const hasAlarm = (k: Architecture['alarms'][number]) => a.alarms.includes(k);
  const impactedCalc = isImpacted(seed.type, a, req, seed.spikeRps ?? 0);

  const common = {
    curlOk: { id: 'curl', cmd: `curl -I https://${site}`, explain: 'サイトに実際にアクセスして、返ってきた状態コード（200なら正常）を見る。障害対応では最初にやることが多い。', output: `HTTP/2 200\ncontent-type: text/html\nx-cache: Miss from cloudfront`, clue: false } as Command,
  };
  const statusLine = (code: number) => `HTTP/2 ${code}${code === 503 ? '\ncontent-type: text/html\n\n<h1>503 Service Unavailable</h1>' : code === 502 ? '\n\n<h1>502 Bad Gateway</h1>' : code === 500 ? '\n\n<h1>500 Internal Server Error</h1>' : ''}`;

  const base: Omit<IncidentSpec, 'type' | 'title' | 'impacted' | 'detectedBy' | 'alertTitle' | 'alertBody' | 'metrics' | 'commands' | 'causes' | 'restores' | 'prevents' | 'impacts' | 'goodNews' | 'lesson' | 'terms'> = {
    start: t0,
    minutes,
  };

  const impactChoices = (correct: string, wrong: string[]): Choice[] =>
    shuffle(r, [
      { id: 'ok', text: correct, good: true, explain: 'グラフとログから読み取れる、正しい影響範囲です。' },
      ...wrong.map((w, i) => ({ id: 'ng' + i, text: w, good: false, explain: '報告書の影響範囲は、事実（時刻・何が・どれくらい）だけを正確に書きます。大きくも小さくも書かないこと。' })),
    ]);

  const endT = time(startMin, minutes);
  const impactText = `${t0}〜${endT}の約${minutes}分間、サイトの一部または全部が表示できなかった`;

  switch (seed.type) {
    case 'spike': {
      const sp = seed.spikeRps ?? Math.max(req.spikeRps, req.peakRps * 6);
      const spikeCap = capacity(a, req, true);
      const impacted = spikeCap < sp;
      const reqs = series(r, N, (i) => (i >= at && i <= endIdx + 2 ? sp : normal));
      const cpu = series(r, N, (i) => Math.min(100, ((i >= at && i <= endIdx + 2 ? sp : normal) / Math.max(1, i >= at ? spikeCap : cap)) * 70));
      const err = series(r, N, (i) => (impacted && i >= at && i <= endIdx ? (sp - spikeCap) * 3 : 0));
      const detected: 'alarm' | 'customer' = (hasAlarm('cpu') || hasAlarm('5xx') ? 'alarm' : 'customer');
      return {
        ...base,
        type: 'spike',
        title: 'アクセス集中',
        impacted,
        detectedBy: detected,
        alertTitle: detected === 'alarm' ? `🔔 CloudWatchアラーム：${hasAlarm('5xx') ? 'ALBの5xxエラーが急増' : 'EC2のCPU使用率 > 80%'}` : `📞 ${c.contact}から電話`,
        alertBody: detected === 'alarm' ? `${t0} ごろから、${c.name} の数字が急に上がっています。` : `「サイトがめちゃくちゃ重いんです！さっきテレビで紹介されたみたいで…」`,
        metrics: [
          { key: 'req', label: 'リクエスト数', unit: '/秒', values: reqs },
          { key: 'cpu', label: 'WebのCPU使用率', unit: '%', values: cpu, threshold: 80 },
          { key: 'err', label: '5xxエラー', unit: '件/5分', values: err },
        ],
        commands: [
          { ...common.curlOk, output: impacted ? statusLine(503) : common.curlOk.output, clue: impacted },
          { id: 'cw', cmd: 'aws cloudwatch get-metric-statistics --metric-name RequestCount', explain: 'CloudWatchから、ALB（またはサーバー）が受けたリクエスト数を取り出す。', output: `時刻   リクエスト/秒\n${time(startMin, -10)}  ${Math.round(normal)}\n${time(startMin, 0)}  ${sp}\n${time(startMin, 5)}  ${Math.round(sp * 1.05)}`, clue: true },
          { id: 'top', cmd: 'ssh web-1 "top -bn1 | head -5"', explain: 'サーバーに入って、CPUやメモリをどれくらい使っているか見る。', output: `%Cpu(s): ${impacted ? '99.2' : '62.0'} us\nMiB Mem: 980 total, ${impacted ? '20' : '410'} free\n  PID USER  %CPU COMMAND\n 1234 nginx ${impacted ? '96.1' : '58.3'} nginx: worker`, clue: true },
          { id: 'df', cmd: 'ssh web-1 "df -h /"', explain: 'ディスクの空き容量を見る。', output: 'Filesystem  Size  Used Avail Use%\n/dev/nvme0n1p1  8.0G  3.1G  4.9G  39% /', clue: false },
        ],
        causes: shuffle(r, [
          { id: 'load', text: 'アクセスが急に増えて、サーバーの処理能力を超えた', good: true, explain: 'リクエスト数がいつもの何倍にもなり、CPUが100%近くに張りついています。' },
          { id: 'disk', text: 'ディスクがいっぱいになった', good: false, explain: 'df の結果を見ると、ディスクにはまだ余裕があります。' },
          { id: 'attack', text: 'サーバーが乗っ取られた', good: false, explain: '証拠もなく決めつけるのはNG。数字を見ると、ふつうのアクセスが増えただけです。' },
          { id: 'aws', text: 'AWSの障害', good: false, explain: '同じ時刻にリクエスト数が急増しています。まずは自分たちの数字から疑います。' },
        ]),
        restores: shuffle(r, [
          { id: 'scaleup', text: 'サーバーを1段大きくする（スケールアップ）', good: true, explain: 'いったん止めて大きいサイズに変えるので、数分止まりますが、すぐ効きます。', apply: (x) => fixes.scaleUpWeb(x) },
          { id: 'reboot', text: 'サーバーを再起動する', good: false, explain: '再起動しても、アクセスが多いままならすぐまた重くなります。' },
          { id: 'wait', text: 'アクセスが落ち着くまで待つ', good: false, explain: 'その間ずっとお客さんが買い物できません。いちばん売れる時間を逃してしまいます。' },
        ]),
        prevents: shuffle(r, [
          { id: 'asg', text: 'ALBとAuto Scalingで、混んだら自動で増える構成にする', good: true, explain: '混んだときだけ台数を増やし、空いたら減らすので、料金もむだになりにくいです。', apply: (x, q) => fixes.albAndAutoScaling(x, { ...q, spikeRps: Math.max(q.spikeRps, sp) }) },
          { id: 'cf', text: 'CloudFrontを前に置いて、画像などをキャッシュする', good: true, explain: '画像やCSSをCloudFrontが代わりに返すので、サーバーへのリクエストが減ります。', apply: (x) => fixes.cloudfront(x) },
          { id: 'huge', text: 'いちばん大きいサーバーに変えて、ずっとそのままにする', good: false, explain: 'ふだんは使わない性能に毎月お金を払い続けることになります。' },
        ]),
        impacts: impactChoices(impactText, [`${t0}から丸1日、すべてのお客さんがサイトを見られなかった`, '影響はなかった']),
        goodNews: `${t0}ごろ、${c.name}にふだんの${Math.round(sp / Math.max(1, req.peakRps))}倍のアクセスが来ました。${a.web?.autoScaling ? 'Auto Scalingがサーバーを自動で増やして' : a.cloudfront || servesStaticFromS3(a) ? 'CloudFront・S3が受け止めて' : '余裕のある構成のおかげで'}、サイトは落ちませんでした！`,
        lesson: 'アクセスの増え方に合わせて「増やせる」構成（スケールアウト）にしておくと、急な集中にも耐えられます。',
        terms: ['scale-out', 'auto-scaling', 'cloudfront'],
      };
    }
    case 'instance_failure': {
      const impacted = impactedCalc;
      const detected: 'alarm' | 'customer' = (hasAlarm('status') || hasAlarm('5xx') ? 'alarm' : 'customer');
      const n = webInstances(a);
      return {
        ...base,
        type: 'instance_failure',
        title: 'サーバーの故障',
        impacted,
        detectedBy: detected,
        alertTitle: detected === 'alarm' ? '🔔 CloudWatchアラーム：EC2のステータスチェック失敗' : `📞 ${c.contact}から電話`,
        alertBody: detected === 'alarm' ? `${t0} に web-1 のステータスチェックが失敗しました。` : '「サイトが真っ白で何も出ないんですけど…！」',
        metrics: [
          { key: 'req', label: 'リクエスト数', unit: '/秒', values: series(r, N, () => normal) },
          { key: 'status', label: 'ステータスチェック失敗', unit: '', values: series(r, N, (i) => (i >= at && i <= endIdx ? 1 : 0)), threshold: 1 },
          { key: 'err', label: '5xxエラー', unit: '件/5分', values: series(r, N, (i) => (impacted && i >= at && i <= endIdx ? normal * 60 : 0)) },
        ],
        commands: [
          { ...common.curlOk, output: impacted ? (a.alb ? statusLine(502) : 'curl: (28) Connection timed out after 10001 milliseconds') : common.curlOk.output, clue: impacted },
          { id: 'status', cmd: 'aws ec2 describe-instance-status', explain: 'EC2が正常に動いているか、AWS側のチェック結果を見る。', output: `InstanceId   SystemStatus   InstanceStatus\ni-0a1b web-1  impaired       impaired${n > 1 ? '\ni-0c2d web-2  ok             ok' : ''}`, clue: true },
          { id: 'ssh', cmd: 'ssh web-1', explain: 'サーバーに直接ログインしてみる。', output: 'ssh: connect to host web-1 port 22: Connection timed out', clue: true },
          { id: 'df', cmd: 'aws cloudwatch get-metric-statistics --metric-name CPUUtilization', explain: 'CPU使用率を見る。', output: `時刻   CPU%\n${time(startMin, -10)}  21\n${time(startMin, -5)}  23\n${time(startMin, 0)}  （データなし）`, clue: true },
        ],
        causes: shuffle(r, [
          { id: 'hw', text: 'サーバーが動いている物理マシン（ハードウェア）が故障した', good: true, explain: 'ステータスチェックが impaired（異常）で、ログインもできません。AWSでも物理マシンは壊れることがあります。' },
          { id: 'load', text: 'アクセスが多すぎる', good: false, explain: 'リクエスト数はいつもと同じです。' },
          { id: 'code', text: 'アプリのプログラムのバグ', good: false, explain: 'バグならサーバーにはログインできるはずです。' },
        ]),
        restores: shuffle(r, [
          { id: 'recover', text: 'インスタンスを停止→起動して、別の物理マシンに移す', good: true, explain: 'EC2は停止→起動すると別の物理マシンで動きます。まずはこれで復旧させます。' },
          { id: 'ticket', text: 'AWSに問い合わせて、返事を待つ', good: false, explain: '問い合わせも大事ですが、自分たちで復旧できる方法を先にやります。' },
          { id: 'reinstall', text: 'OSを入れ直す', good: false, explain: '時間がかかりすぎます。物理マシンの故障なので、OSは悪くありません。' },
        ]),
        prevents: shuffle(r, [
          { id: 'two', text: '2台にしてALBで振り分ける（冗長化）', good: true, explain: '1台が壊れても、もう1台でサイトを出し続けられます。', apply: (x, q) => fixes.twoServers(x, q) },
          { id: 'auto', text: 'ステータスチェックのアラームで、自動復旧を設定する', good: true, explain: '壊れたら自動で別のマシンに移るので、夜中でも早く戻ります（ただし数分は止まります）。', apply: fixes.alarm('status') },
          { id: 'pray', text: '壊れないように、いちばん高いサーバーにする', good: false, explain: '高いサーバーでも物理マシンは壊れます。「壊れる前提」で作るのがクラウドの考え方です。' },
        ]),
        impacts: impactChoices(impactText, ['データがすべて消えた', '影響はなかった']),
        goodNews: `${t0}、${c.name}のWebサーバー1台が故障しました。${n >= 2 ? 'もう1台が動き続けたので' : 'Auto Scalingが新しいサーバーを立てたので'}、お客さんには影響ありませんでした。`,
        lesson: 'クラウドでも機械は壊れます。「1台壊れても止まらない」ように、2台以上にしておくのが基本（冗長化）。',
        terms: ['redundancy', 'spof', 'status-check'],
      };
    }
    case 'az_outage': {
      const impacted = impactedCalc;
      const detected: 'alarm' | 'customer' = (a.alarms.length >= 2 ? 'alarm' : 'customer');
      return {
        ...base,
        type: 'az_outage',
        title: 'データセンター（AZ）の障害',
        impacted,
        detectedBy: detected,
        alertTitle: detected === 'alarm' ? '🔔 複数のアラームが同時に鳴っています' : `📞 ${c.contact}から電話`,
        alertBody: detected === 'alarm' ? `${t0}、AZ-a のサーバーとDBのアラームが一斉に鳴りました。` : '「サイトにつながりません！何が起きてるんですか？」',
        metrics: [
          { key: 'err', label: '5xxエラー', unit: '件/5分', values: series(r, N, (i) => (impacted && i >= at && i <= endIdx ? normal * 50 : 0)) },
          { key: 'health', label: 'AZ-aの正常なサーバー', unit: '台', values: series(r, N, (i) => (i >= at && i <= endIdx ? 0 : 1)) },
        ],
        commands: [
          { ...common.curlOk, output: impacted ? statusLine(503) : common.curlOk.output, clue: impacted },
          { id: 'health', cmd: 'aws health describe-events --region ap-northeast-1', explain: 'AWS側で障害が起きていないか（AWS Health）を見る。', output: `service: EC2\nregion: ap-northeast-1\navailabilityZone: ap-northeast-1a\nstatusCode: open\neventTypeCode: AWS_EC2_OPERATIONAL_ISSUE\nstartTime: ${t0}`, clue: true },
          { id: 'rds', cmd: 'aws rds describe-db-instances', explain: 'DBの状態とマルチAZかどうかを見る。', output: a.db ? `DBInstanceStatus: ${a.db.multiAz ? 'available（AZ-cへ自動で切り替え済み）' : 'unavailable'}\nMultiAZ: ${a.db.multiAz}\nAvailabilityZone: ap-northeast-1a` : 'DBはありません', clue: !!a.db },
          { id: 'status', cmd: 'aws ec2 describe-instance-status', explain: 'EC2の状態を見る。', output: `web-1 (ap-northeast-1a)  impaired${a.web && a.web.azs.includes('c') && a.alb ? '\nweb-2 (ap-northeast-1c)  ok' : ''}`, clue: true },
        ],
        causes: shuffle(r, [
          { id: 'az', text: '東京リージョンのAZ-a（データセンター）で障害が起きた', good: true, explain: 'AWS Healthに AZ-a の障害が出ていて、AZ-a のものだけが止まっています。' },
          { id: 'sg', text: 'セキュリティグループの設定ミス', good: false, explain: '設定は変えていません。同じ時刻に AZ-a のもの全部が止まっています。' },
          { id: 'load', text: 'アクセス集中', good: false, explain: 'リクエスト数は増えていません。' },
        ]),
        restores: shuffle(r, [
          { id: 'otheraz', text: '動いているAZ-cに、サーバーを立ち上げ直す', good: true, explain: '壊れていないAZで動かせば復旧できます（AMIやバックアップがあれば早い）。' },
          { id: 'wait', text: 'AWSが直すまで待つ', good: false, explain: '何時間かかるかわかりません。自分たちでできることを先にやります。' },
          { id: 'region', text: '大阪リージョンに全部作り直す', good: false, explain: 'AZ-cは動いています。まずは同じリージョンの別のAZで十分です。' },
        ]),
        prevents: shuffle(r, [
          { id: 'maz', text: 'WebもDBも2つのAZに分ける（マルチAZ構成）', good: true, explain: '1つのAZが止まっても、もう片方で動き続けます。', apply: (x, q) => fixes.multiAz(x, q) },
          { id: 'backup', text: 'バックアップを毎日とる', good: false, explain: 'バックアップも大事ですが、戻すまでの間はサイトが止まります。止めないための対策ではありません。' },
        ]),
        impacts: impactChoices(impactText, ['一部の画像が少し遅かっただけ', '全国のAWSが止まった']),
        goodNews: `${t0}、東京のAZ-aで障害が起きました。${c.name}はマルチAZ構成だったので、AZ-cで動き続けました！ 隣の会社は大変だったみたいです…`,
        lesson: 'AZ（データセンター）ごと止まることもあります。止められないシステムは、2つ以上のAZに分けて置きます。',
        terms: ['az', 'multi-az', 'failover'],
      };
    }
    case 'db_overload': {
      const detected: 'alarm' | 'customer' = (hasAlarm('dbcpu') ? 'alarm' : 'customer');
      return {
        ...base,
        type: 'db_overload',
        title: 'データベースが重い',
        impacted: true,
        detectedBy: detected,
        alertTitle: detected === 'alarm' ? '🔔 CloudWatchアラーム：RDSのCPU使用率 > 90%' : `📞 ${c.contact}から電話`,
        alertBody: detected === 'alarm' ? `${t0} から DB のCPUが張りついています。` : '「ページを開くのに30秒くらいかかるんです…」',
        metrics: [
          { key: 'req', label: 'リクエスト数', unit: '/秒', values: series(r, N, () => normal) },
          { key: 'dbcpu', label: 'RDSのCPU使用率', unit: '%', values: series(r, N, (i) => (i >= at && i <= endIdx ? 98 : 30)), threshold: 90 },
          { key: 'cpu', label: 'WebのCPU使用率', unit: '%', values: series(r, N, () => 25) },
        ],
        commands: [
          { ...common.curlOk, output: 'HTTP/2 200\n（応答まで 28.4 秒）', clue: true },
          { id: 'top', cmd: 'ssh web-1 "top -bn1 | head -5"', explain: 'Webサーバーが忙しいか見る。', output: '%Cpu(s): 18.0 us\n  PID USER %CPU COMMAND\n 1234 app  12.1 node server.js', clue: true },
          { id: 'proc', cmd: 'mysql -e "SHOW FULL PROCESSLIST"', explain: 'DBでいま実行中の処理（SQL）を一覧で見る。', output: `Id  Time  State         Info\n812  1630  Sending data  SELECT * FROM orders o JOIN items i ... (月次集計)\n815  27    Waiting for lock  SELECT * FROM reservations ...\n816  25    Waiting for lock  SELECT * FROM reservations ...`, clue: true },
        ],
        causes: shuffle(r, [
          { id: 'batch', text: '昼間に重い集計処理が動いて、DBが詰まった', good: true, explain: 'Webは暇（CPU18%）で、DBで27分以上動いている集計SQLがあり、ほかの処理が待たされています。' },
          { id: 'web', text: 'Webサーバーの性能不足', good: false, explain: 'WebのCPUは18%で余裕があります。遅いのはDBの方です。' },
          { id: 'network', text: 'ネットワークの故障', good: false, explain: '時間はかかっても応答は返ってきています（200）。' },
        ]),
        restores: shuffle(r, [
          { id: 'kill', text: '開発チームと相談して、重い集計処理を止める', good: true, explain: '原因の処理を止めれば、待たされていた処理が流れ始めます。勝手に止めず、持ち主に確認するのが大事。' },
          { id: 'reboot', text: 'Webサーバーを再起動する', good: false, explain: 'Webは悪くありません。DBは詰まったままです。' },
          { id: 'restore', text: 'バックアップから戻す', good: false, explain: 'データは壊れていません。戻すと最近のデータが消えてしまいます。' },
        ]),
        prevents: shuffle(r, [
          { id: 'night', text: '集計は夜中に動かしてもらい、DBのCPUアラームも設定する', good: true, explain: '重い処理はお客さんが少ない時間に。アラームがあれば次は早く気づけます。', apply: fixes.alarm('dbcpu') },
          { id: 'dbup', text: 'DBを1段大きくする', good: true, explain: 'お金はかかりますが、余裕ができます。', apply: (x) => fixes.alarm('dbcpu')(fixes.scaleUpDb(x)) },
          { id: 'webup', text: 'Webサーバーを増やす', good: false, explain: 'Webを増やすとDBへのアクセスがさらに増えて、悪化することもあります。' },
        ]),
        impacts: impactChoices(`${t0}〜${endT}の約${minutes}分間、ページの表示がとても遅くなった（30秒ほど）`, ['サイトのデータが一部消えた', '影響はなかった']),
        goodNews: '',
        lesson: '「どこが遅いのか」を、Web・DB・ネットワークと順番に数字で切り分けるのが調査の基本です。',
        terms: ['rds', 'bottleneck', 'sql'],
      };
    }
    case 'disk_full': {
      const detected: 'alarm' | 'customer' = (hasAlarm('disk') ? 'alarm' : hasAlarm('5xx') ? 'alarm' : 'customer');
      return {
        ...base,
        type: 'disk_full',
        title: 'ディスクがいっぱい',
        impacted: true,
        detectedBy: detected,
        alertTitle: detected === 'alarm' ? `🔔 CloudWatchアラーム：${hasAlarm('disk') ? 'ディスク使用率 > 90%' : 'ALBの5xxエラー'}` : `📞 ${c.contact}から電話`,
        alertBody: detected === 'alarm' ? `${t0} からエラーが出ています。` : '「予約しようとすると『エラーが発生しました』って出るって、お客さんに言われて…」',
        metrics: [
          { key: 'disk', label: 'ディスク使用率', unit: '%', values: series(r, N, (i) => Math.min(100, 85 + i * 0.7)), threshold: 90 },
          { key: 'err', label: '5xxエラー', unit: '件/5分', values: series(r, N, (i) => (i >= at && i <= endIdx ? normal * 20 : 0)) },
          { key: 'cpu', label: 'CPU使用率', unit: '%', values: series(r, N, () => 20) },
        ],
        commands: [
          { ...common.curlOk, output: statusLine(500), clue: true },
          { id: 'df', cmd: 'ssh web-1 "df -h /"', explain: 'ディスクの空き容量を見る。Use% が100%だと、ファイルが書けなくなる。', output: 'Filesystem      Size  Used Avail Use%\n/dev/nvme0n1p1  8.0G  8.0G     0 100% /', clue: true },
          { id: 'du', cmd: 'ssh web-1 "sudo du -sh /var/log/*"', explain: 'どのフォルダがディスクを使っているか見る。', output: '5.9G  /var/log/app\n120M  /var/log/nginx\n 30M  /var/log/messages', clue: true },
          { id: 'err', cmd: 'ssh web-1 "tail -n 3 /var/log/nginx/error.log"', explain: 'Webサーバーのエラーログの最後の3行を見る。', output: '[crit] open() "/var/lib/nginx/tmp/..." failed (28: No space left on device)', clue: true },
        ],
        causes: shuffle(r, [
          { id: 'log', text: 'アプリのログがたまり続けて、ディスクが100%になった', good: true, explain: '/var/log/app が5.9GBもあり、「No space left on device（空きがない）」エラーが出ています。' },
          { id: 'load', text: 'アクセスが多すぎる', good: false, explain: 'CPUは20%で暇です。' },
          { id: 'db', text: 'データベースの故障', good: false, explain: 'エラーログには、ディスクの空きがないと書かれています。' },
        ]),
        restores: shuffle(r, [
          { id: 'clean', text: '古いログを圧縮・削除して、空きを作る', good: true, explain: '空きができれば、すぐにエラーは止まります。消す前に必要なログか確認を。' },
          { id: 'reboot', text: 'サーバーを再起動する', good: false, explain: 'ディスクは空きません。再起動しても同じエラーが出ます。' },
          { id: 'bigger', text: 'サーバーを大きいサイズに変える', good: false, explain: 'サイズを変えてもディスクの中身は同じです。' },
        ]),
        prevents: shuffle(r, [
          { id: 'rotate', text: 'ログローテーション（古いログを自動で消す）を設定し、ディスクのアラームもつける', good: true, explain: 'ログは放っておくと増え続けます。自動で整理する仕組みが必要です。', apply: (x) => fixes.logRotation(x) },
          { id: 'manual', text: '毎週、手作業でログを消す', good: false, explain: '人は忘れます。自動化できることは自動化します。' },
        ]),
        impacts: impactChoices(`${t0}〜${endT}の約${minutes}分間、予約などの書き込みでエラーが出た`, ['すべてのデータが消えた', '影響はなかった']),
        goodNews: '',
        lesson: 'ディスクは静かにいっぱいになります。ログローテーションと、ディスクの監視はセットで。',
        terms: ['disk', 'log-rotation', 'monitoring'],
      };
    }
    case 'ssh_attack': {
      return {
        ...base,
        type: 'ssh_attack',
        title: '不正ログインの試み',
        impacted: true,
        detectedBy: 'alarm',
        alertTitle: '🛡️ セキュリティ担当から連絡',
        alertBody: `「${c.name}のサーバーに、海外からログインしようとする通信が大量に来てるよ。確認して！」`,
        metrics: [{ key: 'fail', label: 'ログイン失敗', unit: '回/5分', values: series(r, N, (i) => (i >= at ? 400 : 120)) }],
        commands: [
          { id: 'secure', cmd: 'ssh web-1 "sudo tail -n 4 /var/log/secure"', explain: 'ログインの記録（成功・失敗）を見る。', output: `Failed password for root from 185.x.x.21 port 51122\nFailed password for admin from 45.x.x.9 port 40310\nFailed password for invalid user test from 103.x.x.77\nFailed password for root from 185.x.x.21 port 51130`, clue: true },
          { id: 'sg', cmd: 'aws ec2 describe-security-groups --group-names web-sg', explain: 'Webサーバーのセキュリティグループ（許可している通信）を見る。', output: `IpPermissions:\n  - FromPort: 22  ToPort: 22  CidrIp: 0.0.0.0/0   ← 世界中から\n  - FromPort: 80  ToPort: 80  ...`, clue: true },
          { id: 'last', cmd: 'ssh web-1 "last -n 3"', explain: '実際にログインに成功した人の記録を見る（乗っ取られていないか）。', output: 'ec2-user  pts/0  203.0.113.10（事務所） 10:02 - 10:15\nec2-user  pts/0  203.0.113.10（事務所） 昨日\n（不審なログインはありません）', clue: true },
        ],
        causes: shuffle(r, [
          { id: 'open22', text: 'SSH（22番）が世界中に開いていて、パスワード総当たり攻撃を受けている', good: true, explain: 'セキュリティグループで 0.0.0.0/0（どこからでも）に22番が開いています。' },
          { id: 'hacked', text: 'すでに乗っ取られている', good: false, explain: 'last を見ると、成功したログインは事務所からだけ。いまのところ侵入はされていません。' },
          { id: 'ddos', text: 'Webサイトへの大量アクセス攻撃（DDoS）', good: false, explain: '狙われているのはWebではなく、SSHのログインです。' },
        ]),
        restores: shuffle(r, [
          { id: 'restrict', text: 'セキュリティグループで、SSHを事務所のIPだけに絞る', good: true, explain: '門番の設定を変えるだけで、攻撃の通信はすべて届かなくなります。', apply: (x) => fixes.restrictSsh(x) },
          { id: 'block', text: '攻撃してきたIPを1つずつブロックする', good: false, explain: '攻撃元はどんどん変わります。いたちごっこになります。' },
          { id: 'pw', text: 'パスワードを長くする（だけ）', good: false, explain: '大事ですが、入口を開けたままでは根本的な対策になりません。' },
        ]),
        prevents: shuffle(r, [
          { id: 'ssm', text: 'SSHはふだん閉じておき、Session Managerで入るようにする', good: true, explain: '22番を開けずにサーバーに入れる仕組みです。入口がなければ攻撃もできません。', apply: (x) => fixes.restrictSsh(x) },
          { id: 'nothing', text: '乗っ取られていないので、このままでよい', good: false, explain: '今日は大丈夫でも、明日はわかりません。' },
        ]),
        impacts: impactChoices('不正ログインの試みはあったが、侵入はされていない（お客さんへの影響なし）', ['個人情報が流出した', 'サイトが止まった']),
        goodNews: '',
        lesson: '管理用の入口（SSH）は、必要な人・場所だけに絞るのが鉄則です。',
        terms: ['ssh', 'security-group', 'least-privilege'],
      };
    }
    case 'data_delete': {
      const hasBackup = !!a.db && a.db.backupDays > 0;
      return {
        ...base,
        type: 'data_delete',
        title: 'データの誤削除',
        impacted: true,
        detectedBy: 'customer',
        alertTitle: `📞 ${c.contact}から電話`,
        alertBody: `「すみません…！ 管理画面で間違えて、${c.industry === 'ネットショップ' ? '今日の注文データ' : '今週の予約データ'}を全部消しちゃいました…戻せますか？」`,
        metrics: [{ key: 'rows', label: 'データの件数', unit: '件', values: series(r, N, (i) => (i >= at ? 0 : 1200 + i * 3)) }],
        commands: [
          { id: 'rds', cmd: 'aws rds describe-db-instances', explain: 'DBの設定（バックアップを何日分とっているか）を見る。', output: `DBInstanceStatus: available\nBackupRetentionPeriod: ${a.db?.backupDays ?? 0}\nLatestRestorableTime: ${hasBackup ? time(startMin, -5) : '（なし）'}`, clue: true },
          { id: 'count', cmd: 'mysql -e "SELECT COUNT(*) FROM reservations"', explain: 'テーブルにデータが何件あるか数える。', output: 'COUNT(*)\n0', clue: true },
          { id: 'audit', cmd: 'mysql -e "SELECT * FROM admin_log ORDER BY id DESC LIMIT 2"', explain: '管理画面の操作記録を見る。', output: `${t0}  user=tencho  action=DELETE ALL  table=reservations\n${time(startMin, -3)}  user=tencho  action=search`, clue: true },
        ],
        causes: shuffle(r, [
          { id: 'human', text: '管理画面の操作ミスで、データがまとめて削除された', good: true, explain: '操作記録に、その時刻の DELETE ALL が残っています。' },
          { id: 'hack', text: '外部からの攻撃', good: false, explain: '操作したのは店長のアカウントで、本人も覚えています。' },
          { id: 'aws', text: 'AWSの障害でデータが消えた', good: false, explain: 'DBは正常に動いています。' },
        ]),
        restores: hasBackup
          ? shuffle(r, [
              { id: 'pitr', text: '自動バックアップから、削除する直前の時刻に戻す（ポイントインタイムリカバリ）', good: true, explain: 'RDSの自動バックアップがあれば、5分前くらいまでの好きな時刻に戻せます。' },
              { id: 'giveup', text: '戻せないと伝えて、お客さんに入力し直してもらう', good: false, explain: 'バックアップがあるのに使わないのはもったいない！' },
            ])
          : shuffle(r, [
              { id: 'honest', text: '戻せないことを正直に伝え、紙の控えなどから入力し直す手伝いをする', good: true, explain: 'バックアップがない以上、戻す方法はありません。ごまかさず、すぐに正直に伝えるのが大事です。' },
              { id: 'hide', text: '「調査中です」と言って時間をかせぐ', good: false, explain: '戻せないとわかっているのに引き延ばすと、信頼を大きく失います。' },
            ]),
        prevents: shuffle(r, [
          { id: 'backup', text: '自動バックアップを7日分とるようにし、削除には確認画面を出すよう開発チームに頼む', good: true, explain: '「戻せる仕組み」と「間違えにくい画面」の両方で防ぎます。', apply: (x) => fixes.backup(x) },
          { id: 'ban', text: 'お客さんに管理画面を使わないように言う', good: false, explain: 'お客さんの仕事ができなくなってしまいます。' },
        ]),
        impacts: impactChoices(hasBackup ? `${t0}に予約データが削除され、約${minutes}分後に削除前の状態へ復元した` : `${t0}に予約データが削除され、復元できなかった`, ['影響はなかった', 'お客さんの個人情報が外部に流出した']),
        goodNews: '',
        lesson: hasBackup ? 'バックアップは「戻せること」が価値です。たまに戻す練習もしておくと安心。' : 'バックアップがないと、消えたデータは二度と戻りません。データがあるならバックアップは必須。',
        terms: ['backup', 'pitr', 'rds'],
      };
    }
    case 'cost_spike': {
      const idle = pick(r, [11910, 5960, 7300]);
      const what = idle === 7300 ? 'テストで作ったNATゲートウェイ' : idle === 11910 ? 'テストで作った t3.large のサーバー' : 'テストで作った t3.medium のサーバー';
      const monthly = evaluate(a, req).monthlyYen;
      return {
        ...base,
        type: 'cost_spike',
        title: '月の料金が予算オーバー',
        impacted: true,
        detectedBy: hasAlarm('billing') ? 'alarm' : 'customer',
        alertTitle: hasAlarm('billing') ? '🔔 請求アラーム：予算の80%を超えました' : `📞 ${c.contact}から電話`,
        alertBody: hasAlarm('billing') ? `${c.name} の今月の料金が、予算を超えそうです。` : `「今月のAWSの請求、いつもより${yen(idle)}も高いんですけど…？」`,
        metrics: [{ key: 'cost', label: '1日あたりの料金', unit: '円', values: series(r, N, (i) => (monthly + (i >= at ? idle : 0)) / 30) }],
        commands: [
          { id: 'ce', cmd: 'aws ce get-cost-and-usage --group-by SERVICE', explain: 'Cost Explorer で、どのサービスにいくらかかっているか見る。', output: `EC2-Instances   ${yen(idle + (a.web ? 3000 : 0))}\nRDS             ${yen(a.db ? 3500 : 0)}\nその他           ${yen(800)}`, clue: true },
          { id: 'list', cmd: 'aws ec2 describe-instances --query "Reservations[].Instances[].[Tags,State,LaunchTime]"', explain: '動いているサーバーの一覧を見る（名前・状態・作った日）。', output: `web-1        running  （本番）\ntest-kensho  running  3週間前に作成  ← CPU使用率 0%`, clue: true },
          { id: 'cpu', cmd: 'aws cloudwatch get-metric-statistics --metric-name CPUUtilization (test-kensho)', explain: 'そのサーバーが使われているかCPUで確かめる。', output: '平均CPU使用率（7日間）: 0.1%', clue: true },
        ],
        causes: shuffle(r, [
          { id: 'idle', text: `${what}が、消し忘れたまま動き続けている`, good: true, explain: 'CPUがほぼ0%で、3週間前に作られたテスト用のものです。' },
          { id: 'traffic', text: 'アクセスが増えたから', good: false, explain: '本番のサーバーの料金はいつもと同じです。' },
          { id: 'price', text: 'AWSが値上げしたから', good: false, explain: '値上げではなく、使っているものが増えています。' },
        ]),
        restores: shuffle(r, [
          { id: 'delete', text: '持ち主に確認してから、使っていないリソースを削除する', good: true, explain: '確認なしに消すのは危険。確認がとれたら消して、むだな料金を止めます。', apply: (x) => fixes.removeIdle(x) },
          { id: 'downsize', text: '本番のサーバーを小さくする', good: false, explain: '本番は悪くありません。性能が足りなくなるおそれがあります。' },
        ]),
        prevents: shuffle(r, [
          { id: 'tags', text: '作ったものに「持ち主・用途・消す日」のタグをつけ、請求アラームを設定する', good: true, explain: 'タグがあれば誰の何かがすぐわかり、アラームで早く気づけます。', apply: (x) => fixes.removeIdle(x) },
          { id: 'never', text: 'テスト環境は作らない', good: false, explain: 'テストは大事。作ったら片付けるルールにします。' },
        ]),
        impacts: impactChoices(`今月の料金が、使っていないリソースのため約${yen(idle)}多くかかった（サイトへの影響はなし）`, ['サイトが止まった', 'お客さんのデータが消えた']),
        goodNews: '',
        lesson: 'クラウドは使った分だけ払う仕組み。作ったら片付ける、を習慣に。タグと請求アラームが助けになります。',
        terms: ['cost-optimization', 'tag', 'billing-alarm'],
      };
    }
  }
}

/** 退勤時に、運用中のお客さんのできごとを抽選する */
export function rollDayEvents(r: Rng, customers: Customer[], max = 2): { customerId: string; seed: IncidentSeed }[] {
  const live = customers.filter((c) => c.live);
  const out: { customerId: string; seed: IncidentSeed }[] = [];
  for (const c of shuffle(r, live)) {
    if (out.length >= max) break;
    const weak = evaluate(c.arch, c.req).findings.filter((x) => x.severity === 'critical').length;
    if (!chance(r, 0.3 + Math.min(0.4, weak * 0.15))) continue;
    const type = rollIncidentType(r, c);
    if (!type) continue;
    const seed: IncidentSeed = { type, seed: Math.floor(r() * 1e9) };
    if (type === 'spike') seed.spikeRps = c.req.spikeRps > 0 ? c.req.spikeRps : Math.round(c.req.peakRps * between(r, 4, 8));
    out.push({ customerId: c.id, seed });
  }
  return out;
}

/** 対応の結果から点数と満足度の変化を出す */
export function scoreIncident(spec: IncidentSpec, choice: { cause: string; restore: string; prevent: string; impact: string }) {
  const cause = spec.causes.find((x) => x.id === choice.cause)?.good ?? false;
  const restore = spec.restores.find((x) => x.id === choice.restore)?.good ?? false;
  const prevent = spec.prevents.find((x) => x.id === choice.prevent)?.good ?? false;
  const impact = spec.impacts.find((x) => x.id === choice.impact)?.good ?? false;
  const correct = [cause, restore, prevent, impact].filter(Boolean).length;
  let sat = spec.impacted ? -12 : 0;
  if (spec.detectedBy === 'customer' && spec.impacted) sat -= 8;
  if (spec.type === 'data_delete' && !spec.restores.some((x) => x.id === 'pitr')) sat -= 20;
  sat += correct * 4;
  const xp = 20 + correct * 20 + (spec.detectedBy === 'alarm' ? 10 : 0);
  return { cause, restore, prevent, impact, correct, satDelta: sat, xp };
}
