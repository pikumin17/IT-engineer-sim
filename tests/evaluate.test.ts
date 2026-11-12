import { describe, expect, it } from 'vitest';
import { evaluate, emptyArchitecture } from '../src/engine/evaluate';
import { referenceArch } from '../src/engine/reference';
import { generateCustomer } from '../src/engine/cases';
import { mulberry32 } from '../src/engine/rng';
import type { Requirements } from '../src/engine/types';

const base: Requirements = { kind: 'webapp-db', peakRps: 30, spikeRps: 0, availability: 'mid', sensitive: true, budgetYen: 40000, needsBackup: true, officeOnlyAdmin: true };

describe('evaluate', () => {
  it('何もない構成は動かない', () => {
    const e = evaluate(emptyArchitecture(), base);
    expect(e.works).toBe(false);
    expect(e.total).toBeLessThanOrEqual(20);
  });

  it('模範解答はランダム案件200件すべてで動いて★3', () => {
    const r = mulberry32(42);
    const bad: string[] = [];
    for (let i = 0; i < 200; i++) {
      const tier = ((i % 3) + 1) as 1 | 2 | 3;
      const c = generateCustomer(r, 6, tier, 'c' + i);
      const e = evaluate(referenceArch(c.req), c.req);
      if (!e.works || e.stars !== 3) bad.push(`${JSON.stringify(c.req)} => ${e.total} ${e.findings.map((x) => x.id).join(',')}`);
    }
    expect(bad).toEqual([]);
  });

  it('SSHを全開放するとセキュリティの指摘が出る', () => {
    const a = referenceArch(base);
    a.rules = a.rules.map((x) => (x.port === 22 ? { ...x, source: 'anywhere' } : x));
    const e = evaluate(a, base);
    expect(e.findings.some((x) => x.id === 'ssh-open')).toBe(true);
    expect(e.scores.security).toBeLessThan(70);
  });

  it('ALBがあってもWeb側でALBからの通信を許可しないと動かない', () => {
    const a = referenceArch(base);
    a.rules = a.rules.filter((x) => !(x.target === 'web' && x.port === 80));
    const e = evaluate(a, base);
    expect(e.works).toBe(false);
    expect(e.findings.some((x) => x.id === 'alb-to-web')).toBe(true);
  });

  it('静的サイトはS3＋CloudFrontが安くて★3、ブロックがオンでCloudFrontなしだと見えない', () => {
    const req: Requirements = { kind: 'static', peakRps: 20, spikeRps: 400, availability: 'low', sensitive: false, budgetYen: 3000, needsBackup: false, officeOnlyAdmin: true };
    const good = evaluate(referenceArch(req), req);
    expect(good.stars).toBe(3);
    expect(good.monthlyYen).toBeLessThan(1500);
    const a = referenceArch(req);
    a.cloudfront = false;
    expect(evaluate(a, req).works).toBe(false);
  });

  it('アクセス集中に耐えられないと性能の指摘', () => {
    const req = { ...base, spikeRps: 500 };
    const a = referenceArch({ ...base });
    const e = evaluate(a, req);
    expect(e.findings.some((x) => x.id === 'spike')).toBe(true);
  });
});
