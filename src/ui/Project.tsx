import { useMemo, useState } from 'react';
import { MAX_QUESTIONS, QUESTIONS, REQ_LABEL, knownKeys, knownRequirements, reqValueText, type Customer } from '../engine/cases';
import { yen } from '../engine/catalog';
import { evaluate } from '../engine/evaluate';
import * as G from '../engine/game';
import { procedureSteps, ROLLBACK_CHOICES, verifyCommands } from '../engine/procedure';
import { referenceArch } from '../engine/reference';
import { hashString, mulberry32, shuffle } from '../engine/rng';
import type { ReqKey } from '../engine/types';
import { SENPAI, TRAINING_CASES } from '../content/story';
import { ArchEditor } from './ArchEditor';
import { ActionBar, FindingList, Msg, ScoreBars, Sheet, Stars, TermButtons, useGame } from './common';
import { Terminal } from './Terminal';

const site = (c: Customer) => `www.${c.id.replace(/[^a-z0-9]/gi, '').toLowerCase()}.example.jp`;

export function ProjectView({ task }: { task: G.ProjectTask }) {
  const { s } = useGame();
  const c = G.getCustomer(s, task.customerId);
  const stageNames: Record<G.ProjectStage, string> = { hearing: 'ヒアリング', design: '設計・見積もり', procedure: '作業手順書', verify: '構築・動作確認', result: '結果' };
  const order: G.ProjectStage[] = ['hearing', 'design', 'procedure', 'verify', 'result'];
  return (
    <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 40 }}>{c.avatar}</span>
        <div>
          <h1 style={{ fontSize: 22 }}>{c.name}</h1>
          <div className="muted">
            {c.industry}｜担当：{c.contact}
          </div>
        </div>
      </div>
      <div className="progress" aria-label={`いまは${stageNames[task.stage]}`}>
        {order.map((o) => (
          <i key={o} className={order.indexOf(o) <= order.indexOf(task.stage) ? 'on' : ''} />
        ))}
      </div>
      <p className="tiny" style={{ marginTop: -8 }}>
        {order.map((o) => (o === task.stage ? `【${stageNames[o]}】` : stageNames[o])).join(' › ')}
      </p>
      {task.stage === 'hearing' && <Hearing task={task} c={c} />}
      {task.stage === 'design' && <Design task={task} c={c} />}
      {task.stage === 'procedure' && <Procedure task={task} c={c} />}
      {task.stage === 'verify' && <Verify task={task} c={c} />}
      {task.stage === 'result' && <Result task={task} c={c} />}
    </>
  );
}

function ReqPanel({ c, open = false }: { c: Customer; open?: boolean }) {
  const known = knownKeys(c);
  const keys: ReqKey[] = ['kind', 'peakRps', 'spikeRps', 'availability', 'sensitive', 'needsBackup', 'budgetYen'];
  const unknown = keys.filter((k) => !known.has(k)).length;
  return (
    <details className="fold" open={open}>
      <summary>
        わかっていること{unknown ? `（？が${unknown}つ）` : ''}
      </summary>
      <dl className="reqs" style={{ marginTop: 8 }}>
        {keys.map((k) => (
          <FragmentRow key={k} label={REQ_LABEL[k]} value={known.has(k) ? reqValueText(k, c.req) : '？ 聞いていない'} unknown={!known.has(k)} />
        ))}
      </dl>
      {unknown > 0 && <p className="tiny">聞いていない項目は「いちばん軽い条件」として考えます。本番では本当の条件で判定されます。</p>}
    </details>
  );
}
function FragmentRow({ label, value, unknown }: { label: string; value: string; unknown: boolean }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={unknown ? 'unknown' : ''}>{value}</dd>
    </>
  );
}

// ---------------- ヒアリング ----------------

function Hearing({ task, c }: { task: G.ProjectTask; c: Customer }) {
  const { s, set } = useGame();
  const qs = useMemo(() => shuffle(mulberry32(hashString(c.id)), QUESTIONS), [c.id]);
  const left = MAX_QUESTIONS - c.asked.length;
  const intro = TRAINING_CASES[c.id]?.intro ?? (G.isTraining(s) ? '' : `新しい案件や。${c.industry}の${c.name}さん。まずは話を聞いてみよう。質問は4つまでな。`);
  return (
    <>
      <div className="chat">
        {intro && (
          <Msg face={SENPAI.avatar} who={SENPAI.name} tone="senpai">
            {intro}
          </Msg>
        )}
        <Msg face={c.avatar} who={c.contact}>
          {c.pitch}
        </Msg>
        {c.asked.map((qid) => {
          const q = QUESTIONS.find((x) => x.id === qid)!;
          const note = q.note?.(c);
          return (
            <div key={qid} className="chat">
              <Msg face="🙂" who="あなた" side="right">
                {q.text}
              </Msg>
              <Msg face={c.avatar} who={c.contact}>
                {q.answer(c)}
              </Msg>
              {note && (
                <Msg face={SENPAI.avatar} who={`${SENPAI.name}（小声で）`} tone="senpai">
                  {note}
                </Msg>
              )}
            </div>
          );
        })}
      </div>
      <h2>何を聞く？（あと{left}つ）</h2>
      <div className="chips">
        {qs
          .filter((q) => !c.asked.includes(q.id))
          .map((q) => (
            <button key={q.id} className="chip" disabled={left <= 0} onClick={() => set(G.askQuestion(s, task.id, q.id))}>
              {q.text}
            </button>
          ))}
      </div>
      <div style={{ marginTop: 16 }}>
        <ReqPanel c={c} open />
      </div>
      <ActionBar>
        <button className="btn" onClick={() => set(G.finishHearing(s, task.id))}>
          {left > 0 ? `これで設計にすすむ（質問はあと${left}つ残せる）` : '設計にすすむ'}
        </button>
      </ActionBar>
    </>
  );
}

// ---------------- 設計 ----------------

function Design({ task, c }: { task: G.ProjectTask; c: Customer }) {
  const { s, set } = useGame();
  const [hint, setHint] = useState<{ key: string; level: number } | null>(null);
  const [reply, setReply] = useState<null | { ok: boolean; monthly: number; budget: number; next: G.GameState }>(null);
  const closeReply = () => {
    if (reply?.ok) set(reply.next);
    setReply(null);
  };
  const known = knownRequirements(c);
  const kk = knownKeys(c);
  const e = evaluate(c.arch, known);
  const top = e.findings.find((f) => f.severity === 'critical') ?? e.findings.find((f) => f.severity === 'warning');
  const catMsg: Record<string, string> = { works: 'まず「ちゃんと動くか（つながるか）」が気になるな。', performance: '性能（さばける量）が足りるか見直してみて。', availability: '壊れたとき・止まったときのことを考えてみて。', security: 'セキュリティで気になるところがあるで。', cost: 'お金のところ、もう一回見てみ。', monitoring: '監視（アラーム）も忘れんとってな。' };
  const hintKey = top?.id ?? 'none';
  const level = hint && hint.key === hintKey ? hint.level : 0;
  const askHint = () => {
    const nl = Math.min(3, level + 1);
    setHint({ key: hintKey, level: nl });
    if (top && nl > level) set(G.useHint(s, task.id));
  };
  let hintText = '';
  if (level > 0) {
    if (!top) hintText = kk.size < 6 ? 'いまわかってる条件では、ええ感じやと思う。聞いてない条件があるのだけ気になるけど…見積もりを出してみよか。' : 'ええ感じやと思う！見積もりを出してみよか。';
    else if (level === 1) hintText = catMsg[top.category] ?? '';
    else if (level === 2) hintText = `${catMsg[top.category]}\n具体的には「${top.text}」。`;
    else hintText = `「${top.text}」\n${top.why}\n→ ${top.fix}`;
  }
  const budgetKnown = kk.has('budgetYen');
  const over = budgetKnown && e.monthlyYen > c.req.budgetYen;
  return (
    <>
      <ReqPanel c={c} />
      <h2>構成図</h2>
      <p className="muted" style={{ marginTop: -4 }}>
        部品をタップすると設定を変えられます。
      </p>
      <ArchEditor arch={c.arch} allowed={c.allowed} onChange={(a) => set(G.setArch(s, c.id, a))} />
      {level > 0 && (
        <div className="chat" style={{ marginTop: 14 }}>
          <Msg face={SENPAI.avatar} who={`${SENPAI.name}のヒント（${level}/3）`} tone="senpai">
            {hintText}
          </Msg>
          {top && level === 3 && <TermButtons ids={top.terms} />}
        </div>
      )}
      <details className="fold" style={{ marginTop: 14 }}>
        <summary>月額の内訳（目安）</summary>
        <dl className="reqs" style={{ marginTop: 8 }}>
          {e.costLines.map((l) => (
            <FragmentRow key={l.label} label={l.label} value={yen(l.yen)} unknown={false} />
          ))}
        </dl>
        <p className="tiny">東京リージョン・1ドル150円で計算したゲーム用の目安です。</p>
      </details>
      <ActionBar>
        <div className="costline">
          <span>月額の目安</span>
          <span>
            <b className={over ? 'over' : ''}>{yen(e.monthlyYen)}</b> {budgetKnown ? `／ 予算 ${yen(c.req.budgetYen)}` : '／ 予算 ？'}
          </span>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={askHint}>
            {SENPAI.avatar} 先輩に聞く
          </button>
          <button
            className="btn"
            disabled={!c.arch.web && !c.arch.s3}
            onClick={() => {
              const r = G.submitEstimate(s, task.id);
              setReply({ ok: r.ok, monthly: r.monthly, budget: r.budget, next: r.state });
              if (!r.ok) set(r.state);
            }}
          >
            見積もりを出す
          </button>
        </div>
      </ActionBar>
      {reply && (
        <Sheet title="お客さんの返事" onClose={closeReply}>
          <div className="chat">
            <Msg face="🙂" who="あなた" side="right">
              月額はだいたい {yen(reply.monthly)} になります。
            </Msg>
            {reply.ok ? (
              <Msg face={c.avatar} who={c.contact}>
                {reply.monthly <= reply.budget * 0.6 ? 'え、そんなに安くできるんですか！ぜひお願いします！' : 'わかりました、それでお願いします！'}
              </Msg>
            ) : (
              <>
                <Msg face={c.avatar} who={c.contact}>
                  うーん、ちょっと高いですね…。月 {yen(reply.budget)} くらいまでに収めてもらえませんか？
                </Msg>
                <Msg face={SENPAI.avatar} who={SENPAI.name} tone="senpai">
                  予算は最初に聞いとくと、こういう手戻りがなくなるで。いらんものがないか、大きすぎるものがないか見直そう。
                </Msg>
              </>
            )}
          </div>
          <button
            className="btn"
            style={{ width: '100%', marginTop: 14 }}
            onClick={closeReply}
          >
            {reply.ok ? '作業手順書を書く' : '構成を見直す'}
          </button>
        </Sheet>
      )}
    </>
  );
}

// ---------------- 手順書 ----------------

function Procedure({ task, c }: { task: G.ProjectTask; c: Customer }) {
  const { s, set } = useGame();
  const steps = useMemo(() => procedureSteps(c.arch, c.req), [c.arch, c.req]);
  const shuffled = useMemo(() => shuffle(mulberry32(hashString(task.id + steps.length)), steps), [task.id, steps]);
  const [order, setOrder] = useState<string[]>([]);
  const [rollback, setRollback] = useState<string>('');
  const [review, setReview] = useState<null | { ok: boolean; wrong: { id: string; missingBefore: string[] }[]; rollbackOk: boolean }>(null);
  const byId = Object.fromEntries(steps.map((x) => [x.id, x]));
  const wrongIds = new Set(review?.wrong.map((w) => w.id) ?? []);
  const rbChoices = useMemo(() => shuffle(mulberry32(hashString(task.id)), ROLLBACK_CHOICES), [task.id]);
  return (
    <>
      <div className="chat">
        <Msg face={SENPAI.avatar} who={SENPAI.name} tone="senpai">
          {task.training && task.procedureTries === 0
            ? '本番で作業する前に、手順書を書いてレビューに出すのがうちのルール。作る順番には理由があるで。「それがないと次が作れない」順に並べてみて。\n\nあと、失敗したときの戻し方（切り戻し）も必ず書くこと。'
            : '手順書、見せてもらおか。'}
        </Msg>
      </div>
      <h2>作業の順番</h2>
      {order.length > 0 ? (
        <ol className="order-list">
          {order.map((id) => (
            <li key={id} className={wrongIds.has(id) ? 'bad' : ''}>
              <span style={{ flex: 1 }}>{byId[id]?.text}</span>
              <button className="linkbtn" onClick={() => (setOrder(order.filter((x) => x !== id)), setReview(null))}>
                外す
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">下から、最初にやる作業をタップしてください。</p>
      )}
      <div className="chips" style={{ marginTop: 10 }}>
        {shuffled
          .filter((x) => !order.includes(x.id))
          .map((x) => (
            <button key={x.id} className="chip" onClick={() => (setOrder([...order, x.id]), setReview(null))}>
              ＋ {x.text}
            </button>
          ))}
      </div>
      <h2>うまくいかなかったときは？（切り戻し）</h2>
      <div className="choices">
        {rbChoices.map((r) => (
          <button key={r.id} className={`choice ${review && rollback === r.id ? (r.good ? 'right' : 'wrong') : ''}`} aria-pressed={rollback === r.id} onClick={() => (setRollback(r.id), setReview(null))}>
            {r.text}
          </button>
        ))}
      </div>
      {review && (
        <div className="chat" style={{ marginTop: 16 }}>
          <Msg face={SENPAI.avatar} who={`${SENPAI.name}のレビュー`} tone="senpai">
            {review.ok
              ? 'OK、承認！ この順番なら作れるし、戻し方もばっちりや。構築して動作確認しよう。'
              : [
                  ...review.wrong.map((w) => `・「${byId[w.id].text}」の前に「${w.missingBefore.map((m) => byId[m].text).join('」「')}」が必要やで。${byId[w.id].why}`),
                  ...(!review.rollbackOk ? [`・切り戻し：${ROLLBACK_CHOICES.find((x) => x.id === rollback)?.explain ?? '戻し方を選んでな。'}`] : []),
                  '直してもう一回出してみて。',
                ].join('\n')}
          </Msg>
        </div>
      )}
      <ActionBar>
        <div className="row">
          <button className="btn ghost" onClick={() => set(G.backToDesign(s, task.id))}>
            設計にもどる
          </button>
          <button
            className="btn"
            disabled={order.length !== steps.length || !rollback}
            onClick={() => {
              const r = G.submitProcedure(s, task.id, order, rollback);
              if (r.ok) set(r.state);
              else {
                set({ ...s, tasks: r.state.tasks });
                setReview({ ok: false, wrong: r.wrong, rollbackOk: r.rollbackOk });
              }
            }}
          >
            レビューに出す
          </button>
        </div>
      </ActionBar>
    </>
  );
}

// ---------------- 構築・動作確認 ----------------

function Verify({ task, c }: { task: G.ProjectTask; c: Customer }) {
  const { s, set } = useGame();
  const cmds = verifyCommands(c.arch, c.req, site(c));
  const ranProblem = task.verified.some((id) => cmds.find((x) => x.id === id)?.clue);
  const curlRan = task.verified.includes('curl');
  return (
    <>
      <div className="chat">
        <Msg face={SENPAI.avatar} who={SENPAI.name} tone="senpai">
          {task.training
            ? 'レビューOKやったから、手順書どおりに作っといたで（実際の現場でも、手順書があるとこうやって作業を分担できる）。\n\nじゃあ、ちゃんと動くか確かめよう。まずは curl でサイトにアクセスしてみて。'
            : '構築は終わった。動作確認しよう。'}
        </Msg>
      </div>
      <h2>CloudShell（ターミナル）</h2>
      <Terminal commands={cmds} ran={task.verified} onRun={(id) => set(G.runVerify(s, task.id, id))} />
      {curlRan && (
        <div className="chat" style={{ marginTop: 14 }}>
          <Msg face={SENPAI.avatar} who={SENPAI.name} tone="senpai">
            {ranProblem
              ? 'ん、気になる結果が出てるな…。このまま公開すると、お客さんに迷惑がかかるかも。設計にもどって直すのもアリやで（直したら、手順書はもう一回な）。'
              : 'よし、つながってるな。問題なければ、ドメインを切り替えて本番公開や！'}
          </Msg>
        </div>
      )}
      <ActionBar>
        <div className="row">
          <button className="btn ghost" onClick={() => set(G.backToDesign(s, task.id))}>
            設計にもどる
          </button>
          <button className="btn" disabled={!curlRan} onClick={() => set(G.launch(s, task.id))}>
            {curlRan ? '本番公開する' : 'まず curl で確認'}
          </button>
        </div>
      </ActionBar>
    </>
  );
}

// ---------------- 結果 ----------------

function Result({ task, c }: { task: G.ProjectTask; c: Customer }) {
  const { s, set, go } = useGame();
  const e = evaluate(c.arch, c.req);
  const r = task.result!;
  const ref = referenceArch(c.req);
  const refE = evaluate(ref, c.req);
  const comment = !r.works
    ? 'うーん、公開したけどサイトが動いてへん…。お客さんから電話が鳴りそうや。下の指摘を読んで、次に活かそう。'
    : r.stars === 3
      ? 'ばっちりや！ お客さんも喜んでる。'
      : r.stars === 2
        ? '動いてはいる。でも、気になるところがいくつかあるな。運用していくうちに、ここが障害になるかもしれん。'
        : '動いてはいるけど、弱点が多いな。いつか障害として返ってくるで…。';
  return (
    <>
      <div className="panel" style={{ textAlign: 'center' }}>
        <Stars n={r.stars} />
        <div className="bignum" style={{ marginTop: 6 }}>
          {r.total}
          <span style={{ fontSize: 18 }}>点</span>
        </div>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          +{r.xp} XP｜お客さんの満足度 {r.satisfaction}｜月額 {yen(r.monthlyYen)}（予算 {yen(c.req.budgetYen)}）
        </p>
      </div>
      <div className="chat" style={{ marginTop: 14 }}>
        <Msg face={SENPAI.avatar} who={SENPAI.name} tone="senpai">
          {comment}
        </Msg>
      </div>
      <h2>評価</h2>
      <ScoreBars scores={e.scores} />
      {r.unknownKeys.length > 0 && (
        <>
          <h2>聞いていなかった要件</h2>
          <p className="muted">ヒアリングで聞いていれば、設計に反映できたことです。</p>
          <dl className="reqs">
            {r.unknownKeys.map((k) => (
              <FragmentRow key={k} label={REQ_LABEL[k]} value={reqValueText(k, c.req)} unknown={false} />
            ))}
          </dl>
        </>
      )}
      <h2>指摘と学び</h2>
      <FindingList findings={e.findings} />
      <h2>先輩ならこう組む</h2>
      <p className="muted">
        月額 {yen(refE.monthlyYen)}・{refE.total}点。正解は1つではないので、参考に。
      </p>
      <ArchEditor arch={ref} readOnly />
      <ActionBar>
        <button
          className="btn"
          onClick={() => {
            set(G.closeTask(s, task.id));
            go({ tab: 'today' });
          }}
        >
          チケットを閉じる
        </button>
      </ActionBar>
    </>
  );
}
