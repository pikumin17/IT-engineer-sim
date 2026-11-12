import { DB_SIZES, EC2_RPS, INSTANCE_TYPES, RDS_RPS } from './catalog';
import { emptyArchitecture, evaluate, wantedAlarms } from './evaluate';
import type { Architecture, Requirements, SgRule } from './types';

/** 先輩の模範解答。要件を満たす、なるべく安い構成を作る。 */
export function referenceArch(req: Requirements): Architecture {
  const a = emptyArchitecture();
  if (req.kind === 'static') {
    a.s3 = { website: true, blockPublicAccess: true, versioning: true };
    a.cloudfront = true;
    a.alarms = ['billing'];
    return a;
  }
  const cf = req.spikeRps > 0;
  const loadFactor = cf ? 0.5 : 1;
  const peakNeed = req.peakRps * 1.2 * loadFactor;
  const spikeNeed = req.spikeRps * 1.2 * loadFactor;
  const simple = req.availability === 'low' && req.spikeRps === 0 && peakNeed <= EC2_RPS['t3.large'] && !req.sensitive;

  a.cloudfront = cf;
  if (simple) {
    a.publicSubnets = ['a'];
    const type = INSTANCE_TYPES.find((t) => EC2_RPS[t] >= peakNeed) ?? 't3.large';
    a.web = { type, azs: ['a'], perAz: 1, subnet: 'public', autoScaling: false, asgMax: 1 };
  } else {
    a.publicSubnets = ['a', 'c'];
    a.privateSubnets = ['a', 'c'];
    a.alb = true;
    a.natGateway = true;
    let type = INSTANCE_TYPES.find((t) => EC2_RPS[t] * 2 >= peakNeed);
    let perAz = 1;
    if (!type) {
      type = 't3.large';
      perAz = Math.ceil(peakNeed / (EC2_RPS[type] * 2));
    }
    const autoScaling = spikeNeed > EC2_RPS[type] * perAz * 2;
    const asgMax = autoScaling ? Math.min(30, Math.ceil(spikeNeed / EC2_RPS[type])) : perAz * 2;
    a.web = { type, azs: ['a', 'c'], perAz, subnet: 'private', autoScaling, asgMax };
  }
  if (req.kind === 'webapp-db') {
    if (a.privateSubnets.length < 2) a.privateSubnets = ['a', 'c'];
    const dbNeed = Math.max(req.peakRps, req.spikeRps) * 1.2 * 0.6;
    const size = DB_SIZES.find((s) => RDS_RPS[s] >= dbNeed) ?? 'db.t3.large';
    // Webがパブリックのときも、DBはプライベートに置く（NATはいらない）
    a.db = { size, multiAz: req.availability === 'high', backupDays: 7, subnet: 'private' };
  }
  const rules: SgRule[] = [];
  if (a.alb) {
    rules.push({ target: 'alb', port: 443, source: 'anywhere' }, { target: 'alb', port: 80, source: 'anywhere' }, { target: 'web', port: 80, source: 'alb' });
  } else {
    rules.push({ target: 'web', port: 80, source: 'anywhere' });
    if (req.sensitive) rules.push({ target: 'web', port: 443, source: 'anywhere' });
  }
  rules.push({ target: 'web', port: 22, source: 'office' });
  if (a.db) rules.push({ target: 'db', port: 3306, source: 'web' });
  a.rules = rules;
  a.alarms = wantedAlarms(a);
  a.logRotation = true;
  return a;
}

/** 模範解答の月額をもとに、余裕のある予算を決める */
export function budgetFor(req: Omit<Requirements, 'budgetYen'>, factor: number): number {
  const tmp: Requirements = { ...req, budgetYen: 1e9 };
  const cost = evaluate(referenceArch(tmp), tmp).monthlyYen;
  return Math.ceil((cost * factor) / 500) * 500;
}
