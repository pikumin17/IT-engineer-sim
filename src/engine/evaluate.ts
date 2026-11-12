import {
  ALARM_YEN,
  ALB_YEN,
  BACKUP_YEN_PER_DAY,
  CLOUDFRONT_YEN,
  DB_SIZES,
  INSTANCE_TYPES,
  EBS_YEN,
  EC2_RPS,
  EC2_YEN,
  NAT_YEN,
  RDS_RPS,
  RDS_STORAGE_YEN,
  RDS_YEN,
  S3_YEN,
  TRANSFER_YEN_PER_RPS,
} from './catalog';
import type { AlarmKind, Architecture, CostLine, Evaluation, Finding, Requirements } from './types';

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const BIG = 100000;

export function emptyArchitecture(): Architecture {
  return {
    publicSubnets: [],
    privateSubnets: [],
    natGateway: false,
    cloudfront: false,
    alb: false,
    web: null,
    db: null,
    s3: null,
    rules: [],
    alarms: [],
    logRotation: false,
    idleYen: 0,
  };
}

export function cloneArch(a: Architecture): Architecture {
  return JSON.parse(JSON.stringify(a));
}

export function hasRule(a: Architecture, target: string, port: number, sources: string[]) {
  return a.rules.some((r) => r.target === target && r.port === port && sources.includes(r.source));
}

/** Webサーバーの台数（通常時） */
export function webInstances(a: Architecture): number {
  if (!a.web) return 0;
  return a.web.perAz * a.web.azs.length;
}

/** 実際にお客さんの通信を受けられる台数 */
export function servingInstances(a: Architecture, spike = false): number {
  if (!a.web) return 0;
  const base = a.alb ? webInstances(a) : Math.min(1, webInstances(a));
  if (spike && a.alb && a.web.autoScaling) return Math.max(base, a.web.asgMax);
  return base;
}

export function servesStaticFromS3(a: Architecture) {
  return !!a.s3 && a.s3.website && (a.cloudfront || !a.s3.blockPublicAccess);
}

export interface Reachability {
  webOk: boolean;
  dbOk: boolean;
  reasons: Finding[];
}

function subnetsFor(a: Architecture, kind: 'public' | 'private') {
  return kind === 'public' ? a.publicSubnets : a.privateSubnets;
}

/** つながるかどうか（動く・動かない）を確かめる */
export function reachability(a: Architecture, req: Pick<Requirements, 'kind'>): Reachability {
  const reasons: Finding[] = [];
  let webOk = false;
  if (a.web) {
    const subs = subnetsFor(a, a.web.subnet);
    const missing = a.web.azs.filter((z) => !subs.includes(z));
    if (a.web.azs.length === 0 || a.web.perAz === 0) {
      reasons.push(f('no-web-instance', 'critical', 'works', 'Webサーバーが0台です', 'サーバーがないとサイトを表示できません。', 'Webサーバーを1台以上置きましょう。', ['ec2']));
    } else if (missing.length > 0) {
      reasons.push(f('web-no-subnet', 'critical', 'works', `AZ-${missing.join(',')} に${a.web.subnet === 'public' ? 'パブリック' : 'プライベート'}サブネットがありません`, 'EC2は必ずどれかのサブネットの中に置きます。置き場所がないと起動できません。', 'ネットワークでサブネットを作りましょう。', ['subnet']));
    } else if (a.alb) {
      const albSubnetsOk = a.publicSubnets.length >= 2;
      const albIn = hasRule(a, 'alb', 80, ['anywhere']) || hasRule(a, 'alb', 443, ['anywhere']);
      const toWeb = hasRule(a, 'web', 80, ['alb', 'anywhere']);
      if (!albSubnetsOk)
        reasons.push(f('alb-subnets', 'critical', 'works', 'ALBを置くパブリックサブネットが2つのAZにありません', 'ALBは、2つ以上のAZのサブネットを指定しないと作れない決まりです（片方が止まっても動けるように）。', 'パブリックサブネットをAZ-aとAZ-cの両方に作りましょう。', ['alb', 'az']));
      if (!albIn)
        reasons.push(f('alb-closed', 'critical', 'works', 'ALBに外からの通信（80/443番）を許可していません', 'セキュリティグループで許可していない通信は、すべて止められます。', 'ALBのセキュリティグループで、80番か443番を「どこからでも」許可しましょう。', ['security-group', 'port']));
      if (!toWeb)
        reasons.push(f('alb-to-web', 'critical', 'works', 'ALBからWebサーバーへの通信（80番）を許可していません', 'ALBはお客さんの代わりにWebサーバーへ通信します。Web側でALBからの通信を許可しないと届きません。', 'Webのセキュリティグループで、80番を「ALBから」許可しましょう。', ['security-group', 'alb']));
      webOk = albSubnetsOk && albIn && toWeb;
    } else {
      const open = hasRule(a, 'web', 80, ['anywhere']) || hasRule(a, 'web', 443, ['anywhere']);
      if (a.web.subnet !== 'public')
        reasons.push(f('web-private-no-alb', 'critical', 'works', 'Webサーバーがプライベートサブネットにあるのに、ALBがありません', 'プライベートサブネットはインターネットから直接入れない場所です。外から入るにはALBなどの入口が必要です。', 'ALBを置くか、Webサーバーをパブリックサブネットに置きましょう。', ['subnet', 'alb']));
      if (!open)
        reasons.push(f('web-closed', 'critical', 'works', 'Webサーバーに外からの通信（80/443番）を許可していません', 'セキュリティグループで許可していない通信は、すべて止められます。', 'Webのセキュリティグループで、80番か443番を「どこからでも」許可しましょう。', ['security-group', 'port']));
      webOk = a.web.subnet === 'public' && open;
    }
  }
  let dbOk = false;
  if (a.db) {
    const subs = subnetsFor(a, a.db.subnet);
    const groupOk = subs.length >= 2;
    const allowed = hasRule(a, 'db', 3306, ['web', 'anywhere']);
    if (!groupOk)
      reasons.push(f('db-subnet-group', 'critical', 'works', `RDSを置く${a.db.subnet === 'private' ? 'プライベート' : 'パブリック'}サブネットが2つのAZにありません`, 'RDSは「DBサブネットグループ」として2つ以上のAZのサブネットを指定する決まりです。', `${a.db.subnet === 'private' ? 'プライベート' : 'パブリック'}サブネットをAZ-aとAZ-cに作りましょう。`, ['rds', 'subnet']));
    if (!allowed)
      reasons.push(f('db-closed', 'critical', 'works', 'WebサーバーからDB（3306番）への通信を許可していません', 'アプリはDBにデータを読み書きしに行きます。DB側で許可しないと「DBにつながりません」エラーになります。', 'DBのセキュリティグループで、3306番を「Webから」許可しましょう。', ['security-group', 'rds']));
    dbOk = groupOk && allowed;
  }
  if (req.kind === 'webapp-db' && !a.db)
    reasons.push(f('no-db', 'critical', 'works', 'データベースがありません', '予約や会員のデータを保存する場所がないと、アプリが動きません。', 'RDSを追加しましょう。', ['rds']));
  return { webOk, dbOk, reasons };
}

function f(
  id: string,
  severity: Finding['severity'],
  category: Finding['category'],
  text: string,
  why: string,
  fix: string,
  terms: string[],
): Finding {
  return { id, severity, category, text, why, fix, terms };
}

/** 月額の料金（目安） */
export function costLines(a: Architecture, req: Pick<Requirements, 'peakRps' | 'spikeRps'>): CostLine[] {
  const lines: CostLine[] = [];
  if (a.web) {
    const n = webInstances(a);
    if (n > 0) lines.push({ label: `EC2 ${a.web.type} ×${n}台`, yen: (EC2_YEN[a.web.type] + EBS_YEN) * n });
    if (a.web.autoScaling && a.alb && req.spikeRps > 0) {
      const extra = Math.max(0, a.web.asgMax - n);
      if (extra > 0) lines.push({ label: `Auto Scaling で増えた分（混む時間だけ）`, yen: Math.round(EC2_YEN[a.web.type] * extra * 0.08) });
    }
  }
  if (a.alb) lines.push({ label: 'ALB', yen: ALB_YEN });
  if (a.db) {
    const m = a.db.multiAz ? 2 : 1;
    lines.push({ label: `RDS ${a.db.size}${a.db.multiAz ? '（マルチAZ）' : ''}`, yen: RDS_YEN[a.db.size] * m });
    lines.push({ label: 'RDSのディスク 20GB', yen: RDS_STORAGE_YEN * m });
    if (a.db.backupDays > 0) lines.push({ label: `自動バックアップ ${a.db.backupDays}日分`, yen: BACKUP_YEN_PER_DAY * a.db.backupDays });
  }
  if (a.natGateway) lines.push({ label: 'NATゲートウェイ', yen: NAT_YEN });
  if (a.s3) lines.push({ label: 'S3', yen: S3_YEN });
  if (a.cloudfront) lines.push({ label: 'CloudFront', yen: CLOUDFRONT_YEN });
  if (a.alarms.length) lines.push({ label: `CloudWatch アラーム ×${a.alarms.length}`, yen: ALARM_YEN * a.alarms.length });
  const transfer = req.peakRps * TRANSFER_YEN_PER_RPS * (a.cloudfront ? 0.5 : 1);
  if (a.web || a.s3) lines.push({ label: `データ転送${a.cloudfront ? '（CloudFrontの無料枠で半分）' : ''}`, yen: Math.round(transfer) });
  if (a.idleYen > 0) lines.push({ label: '⚠ 使っていないリソース', yen: a.idleYen });
  return lines;
}

/** さばけるリクエスト/秒 */
export function capacity(a: Architecture, req: Pick<Requirements, 'kind'>, spike = false): number {
  if (req.kind === 'static' && servesStaticFromS3(a)) return BIG;
  if (!a.web) return 0;
  const inst = servingInstances(a, spike);
  const webLoadPerReq = a.cloudfront ? 0.5 : 1;
  const webCap = (inst * EC2_RPS[a.web.type]) / webLoadPerReq;
  if (req.kind === 'webapp-db') {
    if (!a.db) return 0;
    const dbCap = RDS_RPS[a.db.size] / 0.6;
    return Math.min(webCap, dbCap);
  }
  return webCap;
}

export function wantedAlarms(a: Architecture): AlarmKind[] {
  const w: AlarmKind[] = [];
  if (a.web && webInstances(a) > 0) w.push('cpu', 'status', 'disk');
  if (a.alb) w.push('5xx');
  if (a.db) w.push('dbcpu');
  w.push('billing');
  return w;
}

/** ふだんのピークとアクセス集中の両方を、2割の余裕をもってさばけるか */
export function meetsLoad(a: Architecture, req: Requirements, margin = 1.2): boolean {
  if (capacity(a, req) < req.peakRps * margin) return false;
  if (req.spikeRps > 0 && capacity(a, req, true) < req.spikeRps * margin) return false;
  return true;
}

/** 1段小さくしても足りるか */
export function isOversized(a: Architecture, req: Requirements): boolean {
  if (a.web) {
    const i = INSTANCE_TYPES.indexOf(a.web.type);
    if (i > 0) {
      const smaller = cloneArch(a);
      smaller.web!.type = INSTANCE_TYPES[i - 1];
      if (meetsLoad(smaller, req, 1.5)) return true;
    }
  }
  if (a.db) {
    const i = DB_SIZES.indexOf(a.db.size);
    if (i > 0) {
      const smaller = cloneArch(a);
      smaller.db!.size = DB_SIZES[i - 1];
      if (meetsLoad(smaller, req, 1.5)) return true;
    }
  }
  return false;
}

export function evaluate(a: Architecture, req: Requirements): Evaluation {
  const findings: Finding[] = [];
  const reach = reachability(a, req);
  const staticS3 = req.kind === 'static' && servesStaticFromS3(a);

  // ---- 動くか ----
  let works: boolean;
  if (req.kind === 'static') works = staticS3 || reach.webOk;
  else if (req.kind === 'webapp') works = reach.webOk;
  else works = reach.webOk && reach.dbOk;
  if (!works) {
    if (req.kind === 'static' && a.s3 && a.s3.website && !staticS3 && !reach.webOk)
      findings.push(f('s3-not-public', 'critical', 'works', 'S3のサイトを外から見る方法がありません', 'パブリックアクセスブロックがオンのS3は、そのままでは外から見えません。', 'CloudFrontを前に置いて、CloudFrontからだけ読めるようにしましょう（これが安全なやり方）。', ['s3', 'cloudfront']));
    if (req.kind === 'static' && !a.s3 && !a.web)
      findings.push(f('nothing', 'critical', 'works', 'サイトを置く場所がありません', 'ホームページのファイルをどこかに置かないと表示できません。', '静的なサイトならS3に置くのが安くて丈夫です。', ['s3', 'static-site']));
    if (req.kind !== 'static' && !a.web)
      findings.push(f('no-web', 'critical', 'works', 'Webサーバーがありません', 'アプリ（プログラム）を動かすサーバーが必要です。', 'EC2を追加しましょう。', ['ec2']));
    if (!(req.kind === 'static' && staticS3)) findings.push(...reach.reasons);
  } else if (!staticS3) {
    findings.push(...reach.reasons.filter((r) => r.severity !== 'critical'));
  }
  if (req.kind === 'static' && a.web && staticS3)
    findings.push(f('static-ec2-unneeded', 'info', 'cost', 'S3でサイトを出しているので、EC2はいりません', '静的なサイト（HTMLと画像だけ）はS3とCloudFrontで出せます。サーバーの管理もいりません。', 'EC2を消すと安くなります。', ['static-site']));

  // ---- 性能 ----
  const cap = capacity(a, req);
  const spikeCap = capacity(a, req, true);
  let perf = 100;
  if (works) {
    if (cap < req.peakRps) {
      perf = clamp((cap / req.peakRps) * 60);
      findings.push(f('under-capacity', 'critical', 'performance', `ふだんのピーク（${req.peakRps}リクエスト/秒）をさばけません（いまの構成は約${Math.round(cap)}）`, 'さばける量を超えると、ページが遅くなったりエラーになったりします。', 'サーバーを大きくする（スケールアップ）か、台数を増やしてALBで振り分けましょう（スケールアウト）。', ['scale-up', 'scale-out']));
    }
    if (req.spikeRps > 0 && spikeCap < req.spikeRps) {
      perf = Math.min(perf, clamp(40 + (spikeCap / req.spikeRps) * 40));
      findings.push(f('spike', 'critical', 'performance', `アクセス集中（${req.spikeRps}リクエスト/秒）に耐えられません（集中時は約${Math.round(spikeCap)}）`, '一時的にアクセスが増えるときに落ちると、いちばん売れる時間にお店が閉まってしまいます。', 'ALBとAuto Scalingで「混んだら増やす」設定にするか、CloudFrontで負荷を減らしましょう。', ['auto-scaling', 'cloudfront']));
    }
    if (a.web && !a.alb && webInstances(a) > 1)
      findings.push(f('no-alb-multi', 'warning', 'performance', 'ALBがないので、2台目以降のサーバーにはお客さんが来ません', 'お客さんを複数のサーバーに振り分ける係がいないと、1台にしか通信が届きません。', 'ALBを追加するか、台数を1台にしましょう。', ['alb']));
  } else perf = 0;

  // ---- 可用性 ----
  let avail = 100;
  const need = req.availability;
  if (!staticS3 && a.web) {
    const n = servingInstances(a);
    const single = n < 2 && !(a.alb && a.web.autoScaling);
    const singleAz = !a.alb || a.web.azs.length < 2;
    if (single) {
      const sev = need === 'low' ? 'info' : 'critical';
      avail -= need === 'low' ? 5 : 40;
      findings.push(f('spof-web', sev, 'availability', 'Webサーバーが1台だけです（単一障害点）', '1台が壊れたらサイト全体が止まります。こういう場所を「単一障害点」と言います。', 'ALBの後ろに2台以上置くか、Auto Scalingで台数を保つようにしましょう。', ['spof', 'redundancy']));
    }
    if (singleAz && need === 'high') {
      avail -= 30;
      findings.push(f('single-az-web', 'critical', 'availability', 'Webサーバーが1つのAZにしかありません', 'データセンター（AZ）ごと止まる障害もあります。24時間止められないなら、2つのAZに分けます。', 'AZ-aとAZ-cの両方にサーバーを置き、ALBで振り分けましょう。', ['az', 'multi-az']));
    }
  }
  if (a.db) {
    if (!a.db.multiAz && need === 'high') {
      avail -= 30;
      findings.push(f('single-az-db', 'critical', 'availability', 'DBがマルチAZになっていません', 'DBが止まるとアプリ全体が止まります。マルチAZなら、予備のDBに自動で切り替わります。', 'RDSのマルチAZをオンにしましょう。', ['multi-az', 'failover']));
    }
    if (a.db.backupDays === 0) {
      const important = req.needsBackup || need !== 'low';
      avail -= important ? 35 : 10;
      findings.push(f('no-backup', important ? 'critical' : 'warning', 'availability', 'DBのバックアップがありません', '間違えて消した・壊れたときに、元に戻す方法がなくなります。', 'RDSの自動バックアップを7日分くらいオンにしましょう。', ['backup']));
    }
  }
  if (!works) avail = Math.min(avail, 20);
  avail = clamp(avail);

  // ---- セキュリティ ----
  let sec = 100;
  if (hasRule(a, 'web', 22, ['anywhere'])) {
    sec -= 35;
    findings.push(f('ssh-open', 'critical', 'security', 'SSH（22番）が世界中に開いています', '世界中から、パスワードを当てようとする攻撃が毎日来ます。管理用の入口は自分たちだけに絞ります。', 'SSHは「会社のIPから」だけ許可しましょう（さらに良いのはSession Managerを使ってSSHを閉じること）。', ['ssh', 'security-group']));
  }
  if (hasRule(a, 'db', 3306, ['anywhere'])) {
    sec -= 40;
    findings.push(f('db-open', 'critical', 'security', 'DB（3306番）が世界中に開いています', 'DBは大事なデータの金庫です。アプリ以外から触れる必要はありません。', 'DBは「Webから」だけ許可しましょう。', ['security-group', 'rds']));
  }
  if (a.db && a.db.subnet === 'public') {
    sec -= 15;
    findings.push(f('db-public-subnet', 'warning', 'security', 'DBがパブリックサブネットにあります', 'インターネットに近い場所にDBを置くと、設定ミスひとつで外から見えてしまいます。', 'DBはプライベートサブネットに置きましょう。', ['subnet', 'rds']));
  }
  const https = a.cloudfront || hasRule(a, 'alb', 443, ['anywhere']) || hasRule(a, 'web', 443, ['anywhere']);
  if (req.sensitive && !https && (a.web || a.s3)) {
    sec -= 35;
    findings.push(f('no-https', 'critical', 'security', '個人情報を扱うのにHTTPS（443番）を使っていません', 'HTTPのままだと、通信の途中で中身を盗み見られるおそれがあります。', 'ALBかWebで443番を開け、証明書（ACM）を設定しましょう。', ['https', 'port']));
  }
  if (a.s3 && !a.s3.blockPublicAccess) {
    sec -= req.sensitive ? 35 : 10;
    findings.push(f('s3-public', req.sensitive ? 'critical' : 'warning', 'security', 'S3のパブリックアクセスブロックがオフです', 'S3の情報流出事故の多くは、この設定ミスから起きています。', a.cloudfront ? 'CloudFrontからだけ読めるようにして（OAC）、ブロックはオンにしましょう。' : 'CloudFrontを前に置いて、ブロックはオンにしましょう。', ['s3', 'block-public-access']));
  }
  if (a.web && a.web.subnet === 'private' && !a.natGateway) {
    sec -= 10;
    findings.push(f('no-nat', 'warning', 'security', 'プライベートのWebサーバーがアップデートを取りに行けません', 'プライベートサブネットからインターネットに出る出口（NAT）がないと、セキュリティ更新が入りません。', 'NATゲートウェイを追加しましょう（料金は高めなので、予算と相談）。', ['nat-gateway', 'patch']));
  }
  if (a.web && a.alb && a.web.subnet === 'public' && req.sensitive)
    findings.push(f('web-public-with-alb', 'info', 'security', 'ALBがあるなら、Webサーバーはプライベートサブネットに置けます', '入口をALBだけにすると、サーバーが直接ねらわれにくくなります。', 'Webサーバーをプライベートサブネットに移しましょう。', ['subnet']));
  sec = clamp(sec);

  // ---- 監視 ----
  let mon = 100;
  if (!staticS3) {
    const want = wantedAlarms(a);
    const have = want.filter((w) => a.alarms.includes(w));
    mon = want.length ? Math.round((have.length / want.length) * 100) : 100;
    const missing = want.filter((w) => !a.alarms.includes(w));
    if (missing.length)
      findings.push(f('alarms', missing.length >= 3 ? 'warning' : 'info', 'monitoring', `見張っていない数字があります（${missing.length}個）`, '監視がないと、お客さんから電話が来て初めて障害に気づくことになります。', 'CloudWatchアラームを設定しましょう。', ['cloudwatch', 'monitoring']));
  } else if (!a.alarms.includes('billing')) {
    mon = 80;
    findings.push(f('alarms-billing', 'info', 'monitoring', '請求アラームがありません', '想定外のアクセスで料金が増えたときに気づけません。', '請求アラームを設定しましょう。', ['billing-alarm']));
  }

  // ---- 料金 ----
  const lines = costLines(a, req);
  const monthlyYen = lines.reduce((s, l) => s + l.yen, 0);
  const r = monthlyYen / Math.max(1, req.budgetYen);
  let cost = r <= 0.8 ? 100 : r <= 1 ? 90 : clamp(100 - (r - 1) * 200);
  if (r > 1)
    findings.push(f('over-budget', 'critical', 'cost', `予算オーバーです（${Math.round(r * 100)}%）`, 'どんなに良い構成でも、お客さんが払えなければ採用されません。', '大きすぎるサーバーを小さくする、いらないものを消す、などで調整しましょう。', ['cost-optimization']));
  if (works && !staticS3 && isOversized(a, req)) {
    cost = Math.min(cost, 70);
    findings.push(f('oversized', 'warning', 'cost', 'サーバーかDBが大きすぎます', '1段小さくしても足りるのに、大きいサイズを使っています。使わない性能にもお金がかかります。', 'インスタンスを1段小さくしましょう（ライトサイジング）。', ['rightsizing']));
  }
  if (a.idleYen > 0) {
    cost = Math.min(cost, 50);
    findings.push(f('idle', 'warning', 'cost', '使っていないリソースが残っています', 'テストで作って消し忘れたサーバーにも、毎月お金がかかります。', '使っていないものは止めるか消しましょう。', ['cost-optimization']));
  }

  const scores = { performance: Math.round(perf), availability: Math.round(avail), security: Math.round(sec), cost: Math.round(cost), monitoring: Math.round(mon) };
  let total = Math.round(scores.performance * 0.25 + scores.availability * 0.2 + scores.security * 0.25 + scores.cost * 0.2 + scores.monitoring * 0.1);
  if (!works) total = Math.min(total, 20);
  const stars: 1 | 2 | 3 = total >= 85 ? 3 : total >= 60 ? 2 : 1;

  const order = { critical: 0, warning: 1, info: 2 } as const;
  findings.sort((x, y) => order[x.severity] - order[y.severity]);
  // 同じIDの重複を除く
  const seen = new Set<string>();
  const uniq = findings.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));

  return { works, capacityRps: cap, spikeCapacityRps: spikeCap, scores, total, stars, findings: uniq, costLines: lines, monthlyYen };
}
