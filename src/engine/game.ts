import { generateCustomer, QUESTIONS, knownKeys, type Customer } from './cases';
import { cloneArch, emptyArchitecture, evaluate } from './evaluate';
import { buildIncident, rollDayEvents, scoreIncident, type IncidentSeed } from './incidents';
import { checkOrder, procedureSteps, ROLLBACK_CHOICES } from './procedure';
import { referenceArch } from './reference';
import { hashString, mulberry32, pick } from './rng';
import type { Architecture, ReqKey } from './types';
import { RANKS, TRAINING_CASES, TRAINING_DAYS, LESSONS } from '../content/story';
import { CERTS, type CertId } from '../content/quiz';

export const SAVE_VERSION = 1;

export interface Mastery {
  right: number;
  wrong: number;
  lastDay: number;
}

interface TaskBase {
  id: string;
  day: number;
  title: string;
  done: boolean;
}

export interface LessonTask extends TaskBase {
  kind: 'lesson';
  lessonId: string;
}

export type ProjectStage = 'hearing' | 'design' | 'procedure' | 'verify' | 'result';

export interface ProjectResult {
  total: number;
  stars: 1 | 2 | 3;
  xp: number;
  satisfaction: number;
  findingIds: string[];
  unknownKeys: ReqKey[];
  monthlyYen: number;
  works: boolean;
}

export interface ProjectTask extends TaskBase {
  kind: 'project';
  customerId: string;
  stage: ProjectStage;
  hints: number;
  estimateTries: number;
  procedureTries: number;
  order: string[];
  rollback: string | null;
  verified: string[];
  result?: ProjectResult;
  training?: boolean;
}

export type IncidentStage = 'alert' | 'investigate' | 'cause' | 'restore' | 'prevent' | 'report' | 'result';

export interface IncidentTask extends TaskBase {
  kind: 'incident';
  customerId: string;
  seed: IncidentSeed;
  impacted: boolean;
  stage: IncidentStage;
  ran: string[];
  choice: { cause: string; restore: string; prevent: string; impact: string };
  result?: { correct: number; xp: number; satDelta: number };
  daily?: string; // 今日の障害の日付
  arch: Architecture; // 起きたときの構成（あとで構成が変わっても、障害の中身は変えない）
}

export interface NewsTask extends TaskBase {
  kind: 'news';
  customerId: string;
  text: string;
  xp: number;
  good: boolean;
}

export interface ReviewTask extends TaskBase {
  kind: 'review';
  week: number;
}

export type Task = LessonTask | ProjectTask | IncidentTask | NewsTask | ReviewTask;

export interface GameState {
  version: number;
  playerName: string;
  createdAt: string;
  day: number;
  xp: number;
  rankId: number;
  certs: CertId[];
  customers: Customer[];
  dailyCustomer: Customer | null;
  tasks: Task[];
  mastery: Record<string, Mastery>;
  seenTerms: string[];
  achievements: string[];
  daily: { lastDate: string | null; streak: number; best: number };
  stats: { projects: number; stars3: number; incidents: number; savedByDesign: number; alarmDetected: number; certsPassed: number; hints: number };
  log: { day: number; text: string }[];
  pendingPromotion: number | null;
  seed: number;
  startedDay: number; // 仕事を用意し終えた日
}

export function newGame(playerName: string, seed = Date.now() % 1e9): GameState {
  const s: GameState = {
    version: SAVE_VERSION,
    playerName: playerName || 'あなた',
    createdAt: new Date().toISOString(),
    day: 1,
    xp: 0,
    rankId: 0,
    certs: [],
    customers: [],
    dailyCustomer: null,
    tasks: [],
    mastery: {},
    seenTerms: [],
    achievements: [],
    daily: { lastDate: null, streak: 0, best: 0 },
    stats: { projects: 0, stars3: 0, incidents: 0, savedByDesign: 0, alarmDetected: 0, certsPassed: 0, hints: 0 },
    log: [],
    pendingPromotion: null,
    seed,
    startedDay: 0,
  };
  return startDay(s);
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
export const isTraining = (s: GameState) => s.day <= TRAINING_DAYS.length;
export const weekdayIndex = (day: number) => (day - 1) % 5;
export const weekOf = (day: number) => Math.ceil(day / 5);

export function rank(s: GameState) {
  return RANKS[s.rankId];
}

function customerFromCase(caseId: string, day: number): Customer {
  const c = TRAINING_CASES[caseId];
  return {
    id: c.id,
    name: c.name,
    industry: c.industry,
    contact: c.contact,
    avatar: c.avatar,
    pitch: c.pitch,
    req: c.req,
    asked: [],
    arch: emptyArchitecture(),
    satisfaction: 60,
    live: false,
    createdDay: day,
    tier: 1,
    history: [],
    allowed: c.allowed,
    given: c.given,
  };
}

function projectTask(day: number, c: Customer, training: boolean): ProjectTask {
  return {
    id: `p-${c.id}-${day}`,
    kind: 'project',
    day,
    title: `${c.name}：${c.req.kind === 'static' ? 'ホームページ' : c.req.kind === 'webapp' ? 'Webサイト' : 'システム'}の構築`,
    done: false,
    customerId: c.id,
    stage: c.given && c.given.length >= 6 ? 'design' : 'hearing',
    hints: 0,
    estimateTries: 0,
    procedureTries: 0,
    order: [],
    rollback: null,
    verified: [],
    training,
  };
}

export function incidentTask(day: number, c: Customer, seed: IncidentSeed, daily?: string): IncidentTask {
  const spec = buildIncident(seed, c);
  return {
    id: `i-${c.id}-${day}-${seed.seed % 10000}`,
    kind: 'incident',
    day,
    title: `${c.name}：${spec.title}`,
    done: false,
    customerId: c.id,
    seed,
    impacted: spec.impacted,
    stage: 'alert',
    ran: [],
    choice: { cause: '', restore: '', prevent: '', impact: '' },
    daily,
    arch: cloneArch(c.arch),
  };
}

/** その日のチケットを用意する */
export function startDay(s0: GameState): GameState {
  const s = clone(s0);
  if (s.startedDay >= s.day) return s;
  s.startedDay = s.day;
  const plan = TRAINING_DAYS.find((d) => d.day === s.day);
  if (plan) {
    for (const t of plan.tasks) {
      if (t.kind === 'lesson') s.tasks.push({ id: `l-${t.lessonId}`, kind: 'lesson', day: s.day, title: `研修：${LESSONS[t.lessonId].title}`, done: false, lessonId: t.lessonId });
      if (t.kind === 'project') {
        let c = s.customers.find((x) => x.id === t.caseId);
        if (!c) {
          c = customerFromCase(t.caseId, s.day);
          s.customers.push(c);
        }
        s.tasks.push(projectTask(s.day, c, true));
      }
      if (t.kind === 'incident') {
        const c = s.customers.find((x) => x.id === t.caseId);
        if (!c || !c.live) continue;
        const seed: IncidentSeed = { type: t.type, seed: hashString(t.caseId + s.day), spikeRps: t.spikeRps };
        const spec = buildIncident(seed, c);
        if (!spec.impacted && spec.goodNews) s.tasks.push(newsTask(s.day, c, spec.goodNews, true));
        else s.tasks.push(incidentTask(s.day, c, seed));
      }
      if (t.kind === 'review') s.tasks.push({ id: `r-${weekOf(s.day)}`, kind: 'review', day: s.day, title: '今週のふりかえり', done: false, week: weekOf(s.day) });
    }
    return s;
  }
  // 研修のあと：ランダムに仕事が来る
  const r = mulberry32(s.seed + s.day * 7919);
  const openProjects = s.tasks.filter((t) => t.kind === 'project' && !t.done).length;
  const live = s.customers.filter((c) => c.live).length;
  if (openProjects === 0 && (s.day % 2 === 0 || live < 4)) {
    const tier = rank(s).tier;
    const c = generateCustomer(r, s.day, tier, `c${s.day}${Math.floor(r() * 1000)}`);
    s.customers.push(c);
    s.tasks.push(projectTask(s.day, c, false));
  }
  if (weekdayIndex(s.day) === 4) s.tasks.push({ id: `r-${weekOf(s.day)}`, kind: 'review', day: s.day, title: '今週のふりかえり', done: false, week: weekOf(s.day) });
  return s;
}

function newsTask(day: number, c: Customer, text: string, good: boolean): NewsTask {
  return { id: `n-${c.id}-${day}-${text.length}`, kind: 'news', day, title: `${c.name}：${good ? '構成のおかげで無事！' : 'お知らせ'}`, done: false, customerId: c.id, text, xp: good ? 40 : 10, good };
}

export const todaysTasks = (s: GameState) => s.tasks.filter((t) => t.day === s.day);
export const canEndDay = (s: GameState) => todaysTasks(s).every((t) => t.done);

/** 退勤：翌日へ。運用中のお客さんにできごとを抽選する */
export function endDay(s0: GameState): GameState {
  let s = clone(s0);
  if (!canEndDay(s)) return s;
  const wasTraining = isTraining(s);
  s.day += 1;
  if (wasTraining && !isTraining(s)) {
    s.log.push({ day: s.day, text: '研修修了！正式にインフラ部に配属された。' });
    s = unlock(s, 'training_done');
  }
  if (!isTraining(s)) {
    const r = mulberry32(s.seed + s.day * 104729);
    const events = rollDayEvents(r, s.customers, rank(s).id >= 2 ? 3 : 2);
    for (const e of events) {
      const c = s.customers.find((x) => x.id === e.customerId)!;
      const spec = buildIncident(e.seed, c);
      if (!spec.impacted && spec.goodNews) {
        s.tasks.push(newsTask(s.day, c, spec.goodNews, true));
      } else {
        s.tasks.push(incidentTask(s.day, c, e.seed));
      }
    }
  }
  // 古い完了済みのチケットは整理（セーブを軽く保つ）
  s.tasks = s.tasks.filter((t) => !t.done || t.day >= s.day - 10);
  return startDay(s);
}

// ---------------- 用語の習熟 ----------------

export function recordTerms(s: GameState, terms: string[], correct: boolean) {
  for (const t of terms) {
    const m = s.mastery[t] ?? { right: 0, wrong: 0, lastDay: s.day };
    if (correct) m.right += 1;
    else m.wrong += 1;
    m.lastDay = s.day;
    s.mastery[t] = m;
  }
}

export function weakTerms(s: GameState): string[] {
  return Object.entries(s.mastery)
    .filter(([, m]) => m.wrong > m.right)
    .sort((a, b) => b[1].wrong - b[1].right - (a[1].wrong - a[1].right))
    .map(([k]) => k);
}

export function seeTerm(s0: GameState, id: string): GameState {
  if (s0.seenTerms.includes(id)) return s0;
  let s = clone(s0);
  s.seenTerms.push(id);
  if (s.seenTerms.length >= 20) s = unlock(s, 'glossary20');
  return s;
}

// ---------------- 実績 ----------------

export const ACHIEVEMENTS: Record<string, { name: string; desc: string; icon: string }> = {
  first_build: { name: 'はじめての構築', desc: '初めてシステムを公開した', icon: '🚀' },
  three_stars: { name: '★3エンジニア', desc: '構築で★3をとった', icon: '⭐' },
  perfect_hearing: { name: '聞き上手', desc: '関係ない質問をせずに、必要な要件を全部聞き出した', icon: '👂' },
  saved_by_design: { name: '備えあれば', desc: '構成のおかげで障害の影響がなかった', icon: '🛡️' },
  alarm_first: { name: '先に気づく', desc: 'お客さんより先にアラームで障害に気づいた', icon: '🔔' },
  cost_saver: { name: '節約上手', desc: '予算の半分以下で★3', icon: '💴' },
  training_done: { name: '研修修了', desc: '1週間の研修を終えた', icon: '🎓' },
  cert_basic: { name: 'クラウド基礎 合格', desc: '社内資格に合格した', icon: '📜' },
  cert_architect: { name: 'クラウド設計 合格', desc: '社内資格に合格した', icon: '🏅' },
  streak3: { name: '3日連続', desc: '今日の障害対応を3日続けた', icon: '🔥' },
  streak7: { name: '1週間連続', desc: '今日の障害対応を7日続けた', icon: '🌋' },
  perfect_incident: { name: '完璧な障害対応', desc: '原因・止血・再発防止・報告書をすべて正解', icon: '🧯' },
  ten_customers: { name: '担当10社', desc: '10社のシステムを運用している', icon: '🏢' },
  glossary20: { name: '物知り', desc: '用語を20個調べた', icon: '📖' },
  leader: { name: 'リーダー', desc: 'リーダーに昇格した', icon: '👑' },
};

function unlock(s: GameState, id: string): GameState {
  if (s.achievements.includes(id)) return s;
  s.achievements.push(id);
  s.log.push({ day: s.day, text: `実績「${ACHIEVEMENTS[id]?.name ?? id}」を獲得` });
  return s;
}

function addXp(s: GameState, xp: number): GameState {
  s.xp += Math.max(0, Math.round(xp));
  return checkPromotion(s);
}

export function nextRank(s: GameState) {
  return RANKS[s.rankId + 1] ?? null;
}

function checkPromotion(s: GameState): GameState {
  const nr = nextRank(s);
  if (!nr) return s;
  if (s.xp >= nr.xp && (!nr.cert || s.certs.includes(nr.cert))) {
    s.rankId = nr.id;
    s.pendingPromotion = nr.id;
    s.log.push({ day: s.day, text: `${nr.name}に昇格！` });
    if (nr.id === 3) unlock(s, 'leader');
  }
  return s;
}

export function clearPromotion(s0: GameState): GameState {
  return { ...s0, pendingPromotion: null };
}

// ---------------- チケット操作 ----------------

function findTask<T extends Task['kind']>(s: GameState, id: string, kind: T) {
  const t = s.tasks.find((x) => x.id === id);
  if (!t || t.kind !== kind) throw new Error('task not found: ' + id);
  return t as Extract<Task, { kind: T }>;
}
export const getCustomer = (s: GameState, id: string) => (s.dailyCustomer && s.dailyCustomer.id === id ? s.dailyCustomer : s.customers.find((c) => c.id === id)!);

export function completeLesson(s0: GameState, taskId: string, answers: { terms: string[]; correct: boolean }[]): GameState {
  let s = clone(s0);
  const t = findTask(s, taskId, 'lesson');
  if (t.done) return s;
  t.done = true;
  answers.forEach((a) => recordTerms(s, a.terms, a.correct));
  s = addXp(s, 20 + answers.filter((a) => a.correct).length * 10);
  return s;
}

export function askQuestion(s0: GameState, taskId: string, qid: string): GameState {
  const s = clone(s0);
  const t = findTask(s, taskId, 'project');
  const c = getCustomer(s, t.customerId);
  if (c.asked.includes(qid) || c.asked.length >= 4) return s;
  c.asked.push(qid);
  return s;
}

export function finishHearing(s0: GameState, taskId: string): GameState {
  const s = clone(s0);
  const t = findTask(s, taskId, 'project');
  t.stage = 'design';
  return s;
}

export function setArch(s0: GameState, customerId: string, arch: Architecture): GameState {
  const s = clone(s0);
  const c = getCustomer(s, customerId);
  c.arch = cloneArch(arch);
  return s;
}

export function useHint(s0: GameState, taskId: string): GameState {
  const s = clone(s0);
  const t = findTask(s, taskId, 'project');
  t.hints += 1;
  s.stats.hints += 1;
  return s;
}

/** 見積もりをお客さんに出す。予算オーバーなら差し戻し */
export function submitEstimate(s0: GameState, taskId: string): { state: GameState; ok: boolean; monthly: number; budget: number } {
  const s = clone(s0);
  const t = findTask(s, taskId, 'project');
  const c = getCustomer(s, t.customerId);
  const e = evaluate(c.arch, c.req);
  t.estimateTries += 1;
  const ok = e.monthlyYen <= c.req.budgetYen;
  if (ok) t.stage = 'procedure';
  // 予算オーバーなら、お客さんが予算を教えてくれる
  else c.given = [...new Set([...(c.given ?? []), 'budgetYen' as ReqKey])];
  return { state: s, ok, monthly: e.monthlyYen, budget: c.req.budgetYen };
}

export function backToDesign(s0: GameState, taskId: string): GameState {
  const s = clone(s0);
  const t = findTask(s, taskId, 'project');
  t.stage = 'design';
  t.order = [];
  t.rollback = null;
  t.verified = [];
  return s;
}

export function submitProcedure(s0: GameState, taskId: string, order: string[], rollback: string) {
  const s = clone(s0);
  const t = findTask(s, taskId, 'project');
  const c = getCustomer(s, t.customerId);
  const steps = procedureSteps(c.arch, c.req);
  const res = checkOrder(steps, order);
  const rb = ROLLBACK_CHOICES.find((x) => x.id === rollback);
  t.procedureTries += 1;
  t.order = order;
  t.rollback = rollback;
  const ok = res.ok && !!rb?.good;
  if (ok) t.stage = 'verify';
  return { state: s, ok, wrong: res.wrong, rollbackOk: !!rb?.good };
}

export function runVerify(s0: GameState, taskId: string, cmdId: string): GameState {
  const s = clone(s0);
  const t = findTask(s, taskId, 'project');
  if (!t.verified.includes(cmdId)) t.verified.push(cmdId);
  return s;
}

export function hearingQuality(c: Customer) {
  const relevant = new Set<ReqKey>();
  // この案件で「聞く価値があった」要件
  relevant.add('peakRps');
  relevant.add('budgetYen');
  if (c.req.spikeRps > 0) relevant.add('spikeRps');
  if (c.req.kind !== 'static') {
    relevant.add('availability');
    relevant.add('sensitive');
  }
  if (c.req.kind === 'webapp-db') relevant.add('needsBackup');
  (c.given ?? []).forEach((k) => relevant.delete(k));
  const known = knownKeys(c);
  const missed = [...relevant].filter((k) => !known.has(k));
  const wasted = c.asked.filter((q) => (QUESTIONS.find((x) => x.id === q)?.reveals.length ?? 0) === 0).length;
  return { relevant: [...relevant], missed, wasted };
}

/** 本番公開。本当の要件で判定する */
export function launch(s0: GameState, taskId: string): GameState {
  let s = clone(s0);
  const t = findTask(s, taskId, 'project');
  const c = getCustomer(s, t.customerId);
  const e = evaluate(c.arch, c.req);
  const hq = hearingQuality(c);
  let xp = 40 + e.stars * 50 + (e.works ? 20 : 0);
  xp -= t.hints * 10;
  xp -= Math.max(0, t.procedureTries - 1) * 5;
  xp -= Math.max(0, t.estimateTries - 1) * 10;
  if (hq.missed.length === 0 && hq.wasted === 0 && !c.given) xp += 30;
  const satisfaction = Math.max(5, Math.min(100, Math.round(e.works ? 30 + e.total * 0.7 - hq.missed.length * 3 : 15)));
  c.satisfaction = satisfaction;
  c.live = true;
  c.history.push({ day: s.day, text: `公開（★${e.stars}・${e.total}点）` });
  t.result = { total: e.total, stars: e.stars, xp: Math.max(10, xp), satisfaction, findingIds: e.findings.map((f) => f.id), unknownKeys: hq.missed, monthlyYen: e.monthlyYen, works: e.works };
  t.stage = 'result';
  s.stats.projects += 1;
  if (e.stars === 3) s.stats.stars3 += 1;
  for (const f of e.findings) if (f.severity !== 'info') recordTerms(s, f.terms, false);
  if (e.stars === 3) recordTerms(s, ['security-group', 'subnet'], true);
  s = addXp(s, t.result.xp);
  s = unlock(s, 'first_build');
  if (e.stars === 3) s = unlock(s, 'three_stars');
  if (e.stars === 3 && e.monthlyYen <= c.req.budgetYen / 2) s = unlock(s, 'cost_saver');
  if (hq.missed.length === 0 && hq.wasted === 0 && !c.given) s = unlock(s, 'perfect_hearing');
  if (s.customers.filter((x) => x.live).length >= 10) s = unlock(s, 'ten_customers');
  return s;
}

export function closeTask(s0: GameState, taskId: string): GameState {
  let s = clone(s0);
  const t = s.tasks.find((x) => x.id === taskId);
  if (!t || t.done) return s;
  t.done = true;
  if (t.kind === 'news') {
    s = addXp(s, t.xp);
    if (t.good) {
      s.stats.savedByDesign += 1;
      s = unlock(s, 'saved_by_design');
      const c = getCustomer(s, t.customerId);
      if (c) c.satisfaction = Math.min(100, c.satisfaction + 5);
    }
  }
  if (t.kind === 'review') s = addXp(s, 30);
  return s;
}

// ---------------- 障害対応 ----------------

export function incidentSpec(s: GameState, t: IncidentTask) {
  const c = getCustomer(s, t.customerId);
  return buildIncident(t.seed, { ...c, arch: t.arch });
}

export function runIncidentCommand(s0: GameState, taskId: string, cmdId: string): GameState {
  const s = clone(s0);
  const t = findTask(s, taskId, 'incident');
  if (!t.ran.includes(cmdId)) t.ran.push(cmdId);
  if (t.stage === 'alert') t.stage = 'investigate';
  return s;
}

export function setIncidentStage(s0: GameState, taskId: string, stage: IncidentStage): GameState {
  const s = clone(s0);
  findTask(s, taskId, 'incident').stage = stage;
  return s;
}

export function chooseIncident(s0: GameState, taskId: string, field: 'cause' | 'restore' | 'prevent' | 'impact', id: string): GameState {
  const s = clone(s0);
  const t = findTask(s, taskId, 'incident');
  t.choice[field] = id;
  return s;
}

/** 報告書を出して完了。選んだ対応を環境に反映する */
export function finishIncident(s0: GameState, taskId: string): GameState {
  let s = clone(s0);
  const t = findTask(s, taskId, 'incident');
  const c = getCustomer(s, t.customerId);
  const spec = buildIncident(t.seed, { ...c, arch: t.arch });
  const sc = scoreIncident(spec, t.choice);
  let arch = c.arch;
  const restore = spec.restores.find((x) => x.id === t.choice.restore);
  const prevent = spec.prevents.find((x) => x.id === t.choice.prevent);
  if (restore?.apply) arch = restore.apply(arch, c.req);
  if (prevent?.apply && prevent.good) arch = prevent.apply(arch, c.req);
  c.arch = arch;
  c.satisfaction = Math.max(0, Math.min(100, c.satisfaction + sc.satDelta));
  c.history.push({ day: s.day, text: `${spec.title}に対応（${sc.correct}/4）` });
  t.result = { correct: sc.correct, xp: sc.xp, satDelta: sc.satDelta };
  t.stage = 'result';
  recordTerms(s, spec.terms, sc.correct >= 3);
  s.stats.incidents += 1;
  if (spec.detectedBy === 'alarm' && spec.impacted) {
    s.stats.alarmDetected += 1;
    s = unlock(s, 'alarm_first');
  }
  if (sc.correct === 4) s = unlock(s, 'perfect_incident');
  s = addXp(s, sc.xp);
  if (t.daily) {
    const d = s.daily;
    const yesterday = new Date(Date.parse(t.daily + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
    d.streak = d.lastDate === yesterday ? d.streak + 1 : d.lastDate === t.daily ? d.streak : 1;
    d.lastDate = t.daily;
    d.best = Math.max(d.best, d.streak);
    if (d.streak >= 3) s = unlock(s, 'streak3');
    if (d.streak >= 7) s = unlock(s, 'streak7');
  }
  return s;
}

// ---------------- 今日の障害（日替わり） ----------------

const DAILY_TYPES = ['spike', 'instance_failure', 'az_outage', 'db_overload', 'disk_full', 'ssh_attack', 'data_delete', 'cost_spike'] as const;

export function startDaily(s0: GameState, date: string): GameState {
  const s = clone(s0);
  const existing = s.tasks.find((t) => t.kind === 'incident' && t.daily === date);
  if (existing) return s;
  const r = mulberry32(hashString('daily' + date));
  const c = generateCustomer(r, s.day, pick(r, [1, 2] as const), 'daily' + date.replace(/-/g, ''));
  c.name = `（練習）${c.name}`;
  // 弱点のある構成にしておく
  const a = referenceArch(c.req);
  const type = pick(r, DAILY_TYPES.filter((x) => (x === 'data_delete' || x === 'db_overload' ? !!a.db : true)));
  if (type === 'instance_failure' || type === 'spike') {
    if (a.web) {
      a.web.autoScaling = false;
      a.web.perAz = 1;
      a.web.azs = ['a'];
    }
    a.alb = false;
    if (a.web) a.web.subnet = 'public';
    a.rules = a.rules.filter((x) => x.target !== 'alb').map((x) => (x.target === 'web' && x.port === 80 ? { ...x, source: 'anywhere' as const } : x));
    a.cloudfront = false;
    if (c.req.kind === 'static') {
      a.s3 = null;
      a.publicSubnets = ['a'];
      a.web = { type: 't3.micro', azs: ['a'], perAz: 1, subnet: 'public', autoScaling: false, asgMax: 1 };
      a.rules = [{ target: 'web', port: 80, source: 'anywhere' }];
    }
  }
  if (type === 'az_outage' && a.db) a.db.multiAz = false;
  if (type === 'disk_full') a.logRotation = false;
  if (type === 'ssh_attack') a.rules = a.rules.map((x) => (x.port === 22 ? { ...x, source: 'anywhere' as const } : x));
  if (type === 'disk_full' || type === 'ssh_attack' || type === 'az_outage') {
    if (!a.web) {
      a.publicSubnets = ['a'];
      a.web = { type: 't3.micro', azs: ['a'], perAz: 1, subnet: 'public', autoScaling: false, asgMax: 1 };
      a.rules.push({ target: 'web', port: 80, source: 'anywhere' }, { target: 'web', port: 22, source: type === 'ssh_attack' ? 'anywhere' : 'office' });
      a.s3 = null;
      a.cloudfront = false;
    }
  }
  c.arch = a;
  c.live = true;
  c.satisfaction = 60;
  s.dailyCustomer = c;
  const seed: IncidentSeed = { type, seed: Math.floor(r() * 1e9) };
  if (type === 'spike') seed.spikeRps = Math.max(c.req.peakRps * 8, 200);
  const t = incidentTask(s.day, c, seed, date);
  t.impacted = true;
  t.day = -1; // 仕事の日とは別
  s.tasks = s.tasks.filter((x) => !(x.kind === 'incident' && x.daily && x.daily !== date));
  s.tasks.push(t);
  return s;
}

// ---------------- 資格 ----------------

export function takeCert(s0: GameState, cert: CertId, results: { terms: string[]; correct: boolean }[]): { state: GameState; passed: boolean; score: number } {
  let s = clone(s0);
  const score = results.filter((r) => r.correct).length;
  results.forEach((r) => recordTerms(s, r.terms, r.correct));
  const passed = score >= CERTS[cert].pass;
  if (passed && !s.certs.includes(cert)) {
    s.certs.push(cert);
    s.stats.certsPassed += 1;
    s = unlock(s, cert === 'basic' ? 'cert_basic' : 'cert_architect');
    s = addXp(s, 150);
  } else {
    s = addXp(s, score * 5);
  }
  s = checkPromotion(s);
  return { state: s, passed, score };
}

export function reviewQuiz(s0: GameState, results: { terms: string[]; correct: boolean }[]): GameState {
  let s = clone(s0);
  results.forEach((r) => recordTerms(s, r.terms, r.correct));
  s = addXp(s, results.filter((r) => r.correct).length * 5);
  return s;
}
