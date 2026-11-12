import { describe, expect, it } from 'vitest';
import * as G from '../src/engine/game';
import { QUESTIONS } from '../src/engine/cases';
import { referenceArch } from '../src/engine/reference';
import { procedureSteps, ROLLBACK_CHOICES, verifyCommands } from '../src/engine/procedure';
import { buildIncident, type IncidentType } from '../src/engine/incidents';
import { exportSave, importSave, loadGame, saveGame, SAVE_KEY } from '../src/engine/save';
import { emptyArchitecture, evaluate } from '../src/engine/evaluate';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

/** 依存の順に並べる（手順書を正しく出すため） */
function topo(steps: ReturnType<typeof procedureSteps>) {
  const out: string[] = [];
  const left = [...steps];
  while (left.length) {
    const i = left.findIndex((s) => s.deps.every((d) => out.includes(d) || !steps.some((x) => x.id === d)));
    out.push(left[i].id);
    left.splice(i, 1);
  }
  return out;
}

/** 模範解答で1日分を全部こなす */
function playDay(s: G.GameState, good = true): G.GameState {
  for (const t of G.todaysTasks(s)) {
    if (t.done) continue;
    if (t.kind === 'lesson') s = G.completeLesson(s, t.id, [{ terms: ['az'], correct: true }]);
    else if (t.kind === 'project') {
      const c = G.getCustomer(s, t.customerId);
      if (t.stage === 'hearing') {
        for (const q of ['traffic', 'event', 'downtime', 'data']) s = G.askQuestion(s, t.id, q);
        s = G.finishHearing(s, t.id);
      }
      s = G.setArch(s, c.id, good ? referenceArch(c.req) : emptyArchitecture());
      const est = G.submitEstimate(s, t.id);
      s = est.state;
      if (!est.ok) throw new Error('budget ' + est.monthly + ' > ' + est.budget);
      const c2 = G.getCustomer(s, t.customerId);
      const order = topo(procedureSteps(c2.arch, c2.req));
      const pr = G.submitProcedure(s, t.id, order, 'dns');
      expect(pr.ok).toBe(true);
      s = pr.state;
      for (const cmd of verifyCommands(c2.arch, c2.req, 'x')) s = G.runVerify(s, t.id, cmd.id);
      s = G.launch(s, t.id);
      s = G.closeTask(s, t.id);
    } else if (t.kind === 'incident') {
      const spec = G.incidentSpec(s, t);
      for (const cmd of spec.commands) s = G.runIncidentCommand(s, t.id, cmd.id);
      s = G.chooseIncident(s, t.id, 'cause', spec.causes.find((x) => x.good)!.id);
      s = G.chooseIncident(s, t.id, 'restore', spec.restores.find((x) => x.good)!.id);
      s = G.chooseIncident(s, t.id, 'prevent', spec.prevents.find((x) => x.good)!.id);
      s = G.chooseIncident(s, t.id, 'impact', spec.impacts.find((x) => x.good)!.id);
      s = G.finishIncident(s, t.id);
      s = G.closeTask(s, t.id);
    } else s = G.closeTask(s, t.id);
  }
  expect(G.canEndDay(s)).toBe(true);
  return G.endDay(s);
}

describe('ゲームの流れ', () => {
  it('研修の5日間を模範解答で通すと、全案件★3で研修修了', () => {
    let s = G.newGame('テスト', 1);
    for (let d = 0; d < 5; d++) s = playDay(s);
    expect(s.day).toBe(6);
    expect(s.achievements).toContain('training_done');
    const projects = s.tasks.filter((t) => t.kind === 'project' && t.day <= 5) as G.ProjectTask[];
    expect(projects.length).toBe(4);
    expect(projects.every((p) => p.result?.stars === 3)).toBe(true);
    // 金曜：整体院のデータ削除はバックアップがあるので復元できる、ラーメン屋のアクセス集中はS3なので無事
    const fri = s.tasks.filter((t) => t.day === 5);
    expect(fri.some((t) => t.kind === 'news')).toBe(true);
  });

  it('研修のあと60日遊んでも壊れず、案件と障害が来続ける', () => {
    let s = G.newGame('テスト', 7);
    for (let d = 0; d < 65; d++) s = playDay(s);
    expect(s.day).toBe(66);
    expect(s.customers.filter((c) => c.live).length).toBeGreaterThan(10);
    expect(s.stats.incidents + s.stats.savedByDesign).toBeGreaterThan(5);
    expect(JSON.stringify(s).length).toBeLessThan(400_000); // セーブが重くなりすぎない
  });

  it('関係ない質問は数えられ、必要な質問を聞かないと見落としになる', () => {
    let s = G.newGame('テスト', 2);
    s = playDay(s);
    const t = G.todaysTasks(s).find((x) => x.kind === 'project')!;
    s = G.askQuestion(s, t.id, 'color');
    s = G.askQuestion(s, t.id, 'lang');
    const hq = G.hearingQuality(G.getCustomer(s, 'ramen'));
    expect(hq.wasted).toBe(2);
    expect(hq.missed).toContain('spikeRps');
  });

  it('質問は4つまで', () => {
    let s = G.newGame('テスト', 3);
    s = playDay(s);
    const t = G.todaysTasks(s).find((x) => x.kind === 'project')!;
    for (const q of QUESTIONS) s = G.askQuestion(s, t.id, q.id);
    expect(G.getCustomer(s, 'ramen').asked.length).toBe(4);
  });

  it('今日の障害は日付で決まり、連続日数が数えられる', () => {
    let s = G.newGame('テスト', 4);
    for (const date of ['2026-11-13', '2026-11-14', '2026-11-15']) {
      s = G.startDaily(s, date);
      const t = s.tasks.find((x) => x.kind === 'incident' && x.daily === date) as G.IncidentTask;
      const spec = G.incidentSpec(s, t);
      expect(spec.impacted).toBe(true);
      s = G.chooseIncident(s, t.id, 'cause', spec.causes.find((x) => x.good)!.id);
      s = G.finishIncident(s, t.id);
    }
    expect(s.daily.streak).toBe(3);
    expect(s.achievements).toContain('streak3');
    // 同じ日付なら同じ問題
    const a = G.startDaily(G.newGame('a', 1), '2026-12-01');
    const b = G.startDaily(G.newGame('b', 2), '2026-12-01');
    expect(a.dailyCustomer!.name).toBe(b.dailyCustomer!.name);
  });

  it('資格に合格すると、XPがあれば昇格する', () => {
    let s = G.newGame('テスト', 5);
    s = { ...s, xp: 700 };
    const res = G.takeCert(s, 'basic', Array.from({ length: 10 }, () => ({ terms: ['cloud'], correct: true })));
    expect(res.passed).toBe(true);
    expect(res.state.rankId).toBe(1);
  });
});

describe('障害', () => {
  const types: IncidentType[] = ['spike', 'instance_failure', 'az_outage', 'db_overload', 'disk_full', 'ssh_attack', 'data_delete', 'cost_spike'];
  it('全種類について、正解の選択肢がそれぞれ1つ以上ある', () => {
    let s = G.newGame('t', 9);
    for (let d = 0; d < 4; d++) s = playDay(s);
    const c = G.getCustomer(s, 'hakoniwa');
    for (const type of types) {
      const spec = buildIncident({ type, seed: 123, spikeRps: 2000 }, c);
      expect(spec.causes.filter((x) => x.good).length).toBe(1);
      expect(spec.restores.some((x) => x.good)).toBe(true);
      expect(spec.prevents.some((x) => x.good)).toBe(true);
      expect(spec.impacts.filter((x) => x.good).length).toBe(1);
      expect(spec.commands.length).toBeGreaterThan(0);
    }
  });

  it('再発防止を選ぶと構成が直り、同じ弱点の指摘が消える', () => {
    let s = G.newGame('t', 10);
    for (let d = 0; d < 3; d++) s = playDay(s);
    // 整体院のSSHを全開放にしてから攻撃を受けさせる
    const c = G.getCustomer(s, 'sakura');
    const weak = { ...c.arch, rules: c.arch.rules.map((r) => (r.port === 22 ? { ...r, source: 'anywhere' as const } : r)) };
    s = G.setArch(s, 'sakura', weak);
    const t = G.incidentTask(s.day, G.getCustomer(s, 'sakura'), { type: 'ssh_attack', seed: 1 });
    s = { ...s, tasks: [...s.tasks, t] };
    const spec = G.incidentSpec(s, t);
    s = G.chooseIncident(s, t.id, 'restore', 'restrict');
    s = G.chooseIncident(s, t.id, 'prevent', 'ssm');
    s = G.finishIncident(s, t.id);
    const after = evaluate(G.getCustomer(s, 'sakura').arch, G.getCustomer(s, 'sakura').req);
    expect(after.findings.some((f) => f.id === 'ssh-open')).toBe(false);
    expect(spec.type).toBe('ssh_attack');
  });
});

describe('セーブ', () => {
  it('保存→読み込みで同じ状態に戻る（開き直しても続きから）', () => {
    const st = new MemStorage();
    let s = G.newGame('テスト', 11);
    s = playDay(s);
    s = playDay(s);
    expect(saveGame(st, s)).toBe(true);
    const r = loadGame(st);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state).toEqual(s);
  });

  it('こわれたセーブは消さずに退避し、元のキーも残す', () => {
    const st = new MemStorage();
    st.setItem(SAVE_KEY, '{こわれた');
    const r = loadGame(st);
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === 'broken') {
      expect(st.getItem(r.backupKey)).toBe('{こわれた');
      expect(st.getItem(SAVE_KEY)).toBe('{こわれた');
    }
  });

  it('書き出したファイルを読み込める', () => {
    const s = playDay(G.newGame('テスト', 12));
    expect(importSave(exportSave(s))).toEqual(s);
    expect(() => importSave('{"app":"other"}')).toThrow();
  });
});

it('研修の案件は予算内で模範解答が作れる', () => {
  // story の予算設定が厳しすぎないか
  let s = G.newGame('t', 13);
  for (let d = 0; d < 4; d++) s = playDay(s);
  for (const id of ['testpage', 'ramen', 'sakura', 'hakoniwa']) {
    const c = G.getCustomer(s, id);
    const e = evaluate(referenceArch(c.req), c.req);
    expect(e.monthlyYen).toBeLessThanOrEqual(c.req.budgetYen);
  }
  expect(ROLLBACK_CHOICES.filter((x) => x.good).length).toBe(1);
});
