import { reachability, servesStaticFromS3, webInstances } from './evaluate';
import type { Command } from './incidents';
import type { Architecture, Requirements } from './types';

export interface Step {
  id: string;
  text: string;
  why: string;
  deps: string[];
}

/** 構成から、作業手順書の項目を作る */
export function procedureSteps(a: Architecture, req: Requirements): Step[] {
  const s: Step[] = [];
  const staticS3 = req.kind === 'static' && servesStaticFromS3(a);
  const hasNet = !!a.web || !!a.db;
  if (hasNet) s.push({ id: 'net', text: 'VPCとサブネットを作る', why: 'サーバーやDBを置く「土地」を先に用意します。', deps: [] });
  if (hasNet) s.push({ id: 'sg', text: 'セキュリティグループ（通していい通信）を作る', why: 'サーバーを作るときに、どの門番をつけるか指定するので先に作ります。', deps: ['net'] });
  if (a.s3) s.push({ id: 's3', text: 'S3バケットを作り、サイトのファイルを置く', why: '中身を置いてから、配る仕組み（CloudFront）をつなぎます。', deps: [] });
  if (a.db) s.push({ id: 'rds', text: 'RDS（データベース）を作る', why: 'アプリはDBにつながる前提で動くので、DBを先に用意します。', deps: ['sg'] });
  if (a.web && webInstances(a) > 0) s.push({ id: 'ec2', text: 'EC2を起動して、アプリを入れる', why: a.db ? 'DBの接続先を設定してからアプリを動かします。' : '中身（アプリ）を用意します。', deps: a.db ? ['sg', 'rds'] : ['sg'] });
  if (a.alb) s.push({ id: 'alb', text: 'ALBを作って、EC2を振り分け先に登録する', why: '振り分け先のサーバーができてから登録します。', deps: ['ec2'] });
  if (a.web?.autoScaling && a.alb) s.push({ id: 'asg', text: 'Auto Scaling（増やす・減らすルール）を設定する', why: 'ALBに登録する仕組みなので、ALBのあとです。', deps: ['alb'] });
  if (a.cloudfront) s.push({ id: 'cf', text: 'CloudFrontを作り、配信元につなぐ', why: '配信元（S3やALB）ができてからつなぎます。', deps: [a.s3 && staticS3 ? 's3' : a.alb ? 'alb' : a.web ? 'ec2' : 's3'].filter(Boolean) as string[] });
  if (a.alarms.length) s.push({ id: 'alarm', text: 'CloudWatchアラームを設定する', why: '見張る相手ができてから設定します。', deps: s.filter((x) => ['ec2', 'rds', 'alb', 'cf', 's3'].includes(x.id)).map((x) => x.id) });
  const allBefore = s.map((x) => x.id);
  s.push({ id: 'check', text: '動作確認（ページが見られるか、DBにつながるか）', why: 'お客さんに見せる前に、自分たちで確かめます。', deps: allBefore });
  s.push({ id: 'dns', text: 'ドメインの向き先を新しい環境に切り替える（公開）', why: '確認が終わってから、最後に切り替えます。問題があれば元に戻せるように。', deps: ['check'] });
  return s;
}

/** 並べた順番が正しいか確かめる。まちがっている手順のIDを返す */
export function checkOrder(steps: Step[], order: string[]): { ok: boolean; wrong: { id: string; missingBefore: string[] }[] } {
  const pos = new Map(order.map((id, i) => [id, i] as const));
  const wrong: { id: string; missingBefore: string[] }[] = [];
  for (const st of steps) {
    const p = pos.get(st.id);
    if (p === undefined) continue;
    const missing = st.deps.filter((d) => pos.has(d) && (pos.get(d) as number) > p);
    if (missing.length) wrong.push({ id: st.id, missingBefore: missing });
  }
  return { ok: wrong.length === 0 && order.length === steps.length, wrong };
}

export const ROLLBACK_CHOICES = [
  { id: 'dns', text: 'うまくいかなければ、ドメインの向き先を元の環境に戻す', good: true, explain: '新しい環境は残したまま、向き先だけ戻せばすぐ元通りになります。これが切り戻し手順です。' },
  { id: 'none', text: '失敗しないように気をつけるので、戻し方は書かない', good: false, explain: '本番作業は「失敗したらどう戻すか」を必ず先に決めます。レビューで一番見られるところです。' },
  { id: 'delete', text: 'うまくいかなければ、全部消して最初から作り直す', good: false, explain: '作り直している間、サイトが止まったままになってしまいます。' },
];

/** 動作確認のコマンド */
export function verifyCommands(a: Architecture, req: Requirements, site: string): Command[] {
  const cmds: Command[] = [];
  const reach = reachability(a, req);
  const staticS3 = req.kind === 'static' && servesStaticFromS3(a);
  const webOk = staticS3 || reach.webOk;
  const dbOk = !a.db || reach.dbOk;
  const allOk = webOk && (req.kind !== 'webapp-db' || dbOk);
  let curlOut: string;
  if (allOk) curlOut = `HTTP/2 200\ncontent-type: text/html${a.cloudfront ? '\nx-cache: Miss from cloudfront' : ''}`;
  else if (!webOk) curlOut = 'curl: (28) Connection timed out after 10001 milliseconds\n→ 応答がない。入口のセキュリティグループやサブネットを疑おう';
  else curlOut = 'HTTP/2 500\n\n<h1>Internal Server Error</h1>\n→ ページは届くが、アプリがエラー。DBにつながっているか確かめよう';
  cmds.push({ id: 'curl', cmd: `curl -I https://${site}`, explain: '実際にサイトにアクセスして、状態コードを見る。200なら成功。', output: curlOut, clue: !allOk });
  if (a.web && webInstances(a) > 0)
    cmds.push({
      id: 'ec2',
      cmd: 'aws ec2 describe-instances --query "...[InstanceId,State.Name,Placement.AvailabilityZone]"',
      explain: '作ったEC2の一覧と状態（running なら起動中）を見る。',
      output: Array.from({ length: webInstances(a) }, (_, i) => `i-0${(i + 10).toString(16)}a${i}  running  ap-northeast-1${a.web!.azs[i % a.web!.azs.length]}`).join('\n'),
      clue: false,
    });
  if (a.alb)
    cmds.push({
      id: 'tg',
      cmd: 'aws elbv2 describe-target-health --target-group-arn web-tg',
      explain: 'ALBから見て、振り分け先のサーバーが元気か（healthy）を見る。',
      output: reach.webOk ? 'web-1  healthy\nweb-2  healthy'.split('\n').slice(0, Math.max(1, webInstances(a))).join('\n') : 'web-1  unhealthy  (Target.Timeout)\n→ ALBからWebに届いていない。Web側のセキュリティグループを確認',
      clue: !reach.webOk,
    });
  if (a.db)
    cmds.push({
      id: 'nc',
      cmd: 'ssh web-1 "nc -zv mydb.xxxx.rds.amazonaws.com 3306"',
      explain: 'WebサーバーからDBの3306番につながるか試す。',
      output: reach.dbOk ? 'Connection to mydb...rds.amazonaws.com 3306 port [tcp/mysql] succeeded!' : 'nc: connect to mydb... port 3306 (tcp) timed out\n→ DBのセキュリティグループかサブネットを確認',
      clue: !reach.dbOk,
    });
  if (a.s3)
    cmds.push({
      id: 's3',
      cmd: 'aws s3api get-public-access-block --bucket site-bucket',
      explain: 'S3のパブリックアクセスブロック（外から勝手に見られない設定）を確かめる。',
      output: `BlockPublicAcls: ${a.s3.blockPublicAccess}\nBlockPublicPolicy: ${a.s3.blockPublicAccess}\nIgnorePublicAcls: ${a.s3.blockPublicAccess}\nRestrictPublicBuckets: ${a.s3.blockPublicAccess}`,
      clue: !a.s3.blockPublicAccess,
    });
  if (a.rules.length)
    cmds.push({
      id: 'sg',
      cmd: 'aws ec2 describe-security-groups --query "...IpPermissions"',
      explain: 'セキュリティグループで許可している通信を一覧で見る。',
      output: a.rules.map((r) => `${r.target}-sg  ${r.port}番  ← ${{ anywhere: '0.0.0.0/0（どこからでも）', office: '203.0.113.10/32（事務所）', alb: 'alb-sg（ALBから）', web: 'web-sg（Webから）' }[r.source]}`).join('\n'),
      clue: a.rules.some((r) => r.port === 22 && r.source === 'anywhere'),
    });
  return cmds;
}
