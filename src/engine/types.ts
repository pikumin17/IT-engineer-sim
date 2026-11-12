// ゲーム全体で使う型。画面には依存しない。

export type AZ = 'a' | 'c';
export type InstanceType = 't3.micro' | 't3.small' | 't3.medium' | 't3.large';
export type DbSize = 'db.t3.micro' | 'db.t3.small' | 'db.t3.medium' | 'db.t3.large';
export type SubnetKind = 'public' | 'private';
export type Port = 22 | 80 | 443 | 3306;
export type RuleTarget = 'alb' | 'web' | 'db';
export type RuleSource = 'anywhere' | 'office' | 'alb' | 'web';
export type AlarmKind = 'cpu' | 'status' | '5xx' | 'dbcpu' | 'disk' | 'billing';

export interface SgRule {
  target: RuleTarget;
  port: Port;
  source: RuleSource;
}

export interface WebTier {
  type: InstanceType;
  azs: AZ[];
  perAz: number; // AZごとの台数（Auto Scaling では最小台数）
  subnet: SubnetKind;
  autoScaling: boolean;
  asgMax: number; // Auto Scaling の最大台数（全体）
}

export interface DbTier {
  size: DbSize;
  multiAz: boolean;
  backupDays: number; // 0 = バックアップなし
  subnet: SubnetKind;
}

export interface Bucket {
  website: boolean; // 静的サイトの置き場として使う
  blockPublicAccess: boolean;
  versioning: boolean;
}

export interface Architecture {
  publicSubnets: AZ[];
  privateSubnets: AZ[];
  natGateway: boolean;
  cloudfront: boolean;
  alb: boolean;
  web: WebTier | null;
  db: DbTier | null;
  s3: Bucket | null;
  rules: SgRule[];
  alarms: AlarmKind[];
  logRotation: boolean; // ログの整理（ローテーション）を設定済み
  idleYen: number; // 消し忘れたリソースの月額（コスト相談で発生）
}

export type SiteKind = 'static' | 'webapp' | 'webapp-db';
export type Availability = 'low' | 'mid' | 'high';

export interface Requirements {
  kind: SiteKind;
  peakRps: number;
  spikeRps: number; // 0 = 予定なし
  availability: Availability;
  sensitive: boolean;
  budgetYen: number;
  needsBackup: boolean;
  officeOnlyAdmin: boolean;
}

export type ReqKey = keyof Requirements;

export type ServiceId =
  | 'vpc'
  | 'ec2'
  | 'sg'
  | 's3'
  | 'cloudfront'
  | 'rds'
  | 'alb'
  | 'asg'
  | 'nat'
  | 'cloudwatch'
  | 'multiaz';

export type Severity = 'critical' | 'warning' | 'info';

export interface Finding {
  id: string;
  severity: Severity;
  category: 'works' | 'performance' | 'availability' | 'security' | 'cost' | 'monitoring';
  text: string; // 何が問題か
  why: string; // なぜ問題か（学び）
  fix: string; // どう直すか
  terms: string[]; // 関連する用語ID
}

export interface CostLine {
  label: string;
  yen: number;
}

export interface Evaluation {
  works: boolean;
  capacityRps: number; // 通常時にさばける量
  spikeCapacityRps: number; // アクセス集中時にさばける量
  scores: {
    performance: number;
    availability: number;
    security: number;
    cost: number;
    monitoring: number;
  };
  total: number; // 0-100
  stars: 1 | 2 | 3;
  findings: Finding[];
  costLines: CostLine[];
  monthlyYen: number;
}
