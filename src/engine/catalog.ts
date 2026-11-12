import type { AlarmKind, DbSize, InstanceType, ServiceId } from './types';

// 料金はゲーム用の目安（東京リージョン、1ドル150円、1か月730時間）。
// 実際の料金は AWS の料金ページで確認すること。
export const EC2_YEN: Record<InstanceType, number> = {
  't3.micro': 1490,
  't3.small': 2980,
  't3.medium': 5960,
  't3.large': 11910,
};
export const EBS_YEN = 150; // 8GB のディスク1台分
export const EC2_RPS: Record<InstanceType, number> = {
  't3.micro': 40,
  't3.small': 80,
  't3.medium': 160,
  't3.large': 320,
};
export const EC2_SPEC: Record<InstanceType, string> = {
  't3.micro': '2 vCPU・メモリ1GB',
  't3.small': '2 vCPU・メモリ2GB',
  't3.medium': '2 vCPU・メモリ4GB',
  't3.large': '2 vCPU・メモリ8GB',
};

export const RDS_YEN: Record<DbSize, number> = {
  'db.t3.micro': 3070,
  'db.t3.small': 6130,
  'db.t3.medium': 12260,
  'db.t3.large': 24530,
};
export const RDS_RPS: Record<DbSize, number> = {
  'db.t3.micro': 100,
  'db.t3.small': 200,
  'db.t3.medium': 400,
  'db.t3.large': 800,
};
export const RDS_STORAGE_YEN = 420; // 20GB
export const BACKUP_YEN_PER_DAY = 40;

export const ALB_YEN = 3500;
export const NAT_YEN = 7300;
export const CLOUDFRONT_YEN = 300;
export const S3_YEN = 100;
export const ALARM_YEN = 15;
export const TRANSFER_YEN_PER_RPS = 30; // ピーク1リクエスト/秒あたりの月のデータ転送料の目安

export const INSTANCE_TYPES: InstanceType[] = ['t3.micro', 't3.small', 't3.medium', 't3.large'];
export const DB_SIZES: DbSize[] = ['db.t3.micro', 'db.t3.small', 'db.t3.medium', 'db.t3.large'];

export interface ServiceInfo {
  id: ServiceId;
  name: string; // AWSでの名前
  short: string; // ひとことで
  icon: string;
  term: string; // 用語ID
}

export const SERVICES: Record<ServiceId, ServiceInfo> = {
  vpc: { id: 'vpc', name: 'VPC・サブネット', short: '自分専用のネットワーク', icon: '🏢', term: 'vpc' },
  sg: { id: 'sg', name: 'セキュリティグループ', short: '通していい通信を決める門番', icon: '🛡️', term: 'security-group' },
  ec2: { id: 'ec2', name: 'EC2', short: 'クラウド上に借りるパソコン（サーバー）', icon: '🖥️', term: 'ec2' },
  s3: { id: 's3', name: 'S3', short: 'ファイルを置いておく倉庫', icon: '🪣', term: 's3' },
  cloudfront: { id: 'cloudfront', name: 'CloudFront', short: '世界中に置いたコピーから速く届ける', icon: '🌐', term: 'cloudfront' },
  rds: { id: 'rds', name: 'RDS', short: 'おまかせで動くデータベース', icon: '🗄️', term: 'rds' },
  alb: { id: 'alb', name: 'ALB（ロードバランサー）', short: 'お客さんを複数のサーバーに振り分ける', icon: '🔀', term: 'alb' },
  asg: { id: 'asg', name: 'Auto Scaling', short: '混んだら自動でサーバーを増やす', icon: '📈', term: 'auto-scaling' },
  nat: { id: 'nat', name: 'NATゲートウェイ', short: '内側のサーバーが外へ取りに行く出口', icon: '🚪', term: 'nat-gateway' },
  cloudwatch: { id: 'cloudwatch', name: 'CloudWatch アラーム', short: '数字を見張って異常を知らせる', icon: '🔔', term: 'cloudwatch' },
  multiaz: { id: 'multiaz', name: 'マルチAZ', short: '2か所のデータセンターに分けて置く', icon: '🏙️', term: 'multi-az' },
};

export const ALARM_INFO: Record<AlarmKind, { name: string; desc: string; term: string }> = {
  cpu: { name: 'EC2のCPU使用率', desc: 'サーバーが忙しすぎないか（80%を超えたら通知）', term: 'cpu' },
  status: { name: 'EC2のステータスチェック', desc: 'サーバーが壊れていないか（壊れたら自動で復旧）', term: 'status-check' },
  '5xx': { name: 'ALBの5xxエラー数', desc: 'お客さんにエラー画面が出ていないか', term: 'http-status' },
  dbcpu: { name: 'RDSのCPU使用率', desc: 'データベースが忙しすぎないか', term: 'rds' },
  disk: { name: 'ディスクの空き容量', desc: 'ディスクがいっぱいになっていないか', term: 'disk' },
  billing: { name: '請求額', desc: '月の料金が予算を超えそうになったら通知', term: 'billing-alarm' },
};

export const yen = (n: number) => `¥${Math.round(n).toLocaleString('ja-JP')}`;
