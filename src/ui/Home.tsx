import * as G from '../engine/game';
import { evaluate } from '../engine/evaluate';
import { yen } from '../engine/catalog';
import { TERM_BY_ID } from '../content/glossary';
import { SENPAI, TRAINING_DAYS } from '../content/story';
import { ActionBar, Msg, TermButtons, useGame } from './common';

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const MORNINGS = [
  'おはよう。今日もよろしく。チケットを上から片付けていこか。',
  'おはよう！ 昨日の夜は静かやったな。…と思ったら何か来てるかも。チケット見てみて。',
  'おはよう。運用は「何も起きない日」を作る仕事や。今日もいこか。',
  'おはよう。困ったらいつでも聞いてな。',
];

function ticketMeta(s: G.GameState, t: G.Task): { icon: string; sub: string; cls?: string } {
  switch (t.kind) {
    case 'lesson':
      return { icon: '📘', sub: t.done ? '受講済み' : '研修・5分くらい' };
    case 'project': {
      const st: Record<G.ProjectStage, string> = { hearing: 'ヒアリング待ち', design: '設計中', procedure: '手順書の作成中', verify: '動作確認中', result: '結果を確認' };
      return { icon: '🛠️', sub: t.done ? `公開済み・★${t.result?.stars ?? '-'}` : st[t.stage] };
    }
    case 'incident':
      return { icon: '🚨', sub: t.done ? `対応済み・${t.result?.correct ?? 0}/4` : t.stage === 'alert' ? '未対応！' : '対応中', cls: t.done ? '' : 'incident' };
    case 'news':
      return { icon: t.good ? '🛡️' : '📨', sub: t.done ? '確認済み' : 'お知らせ' };
    case 'review':
      return { icon: '📝', sub: t.done ? '確認済み' : '今週のまとめ' };
  }
  void s;
}

export function Home() {
  const { s, set, go } = useGame();
  const tasks = G.todaysTasks(s);
  const plan = TRAINING_DAYS.find((d) => d.day === s.day);
  const left = tasks.filter((t) => !t.done).length;
  const date = todayStr();
  const daily = s.tasks.find((t) => t.kind === 'incident' && t.daily === date) as G.IncidentTask | undefined;
  const dailyDone = daily?.done || (daily && daily.stage === 'result');
  return (
    <>
      {plan && <h1 style={{ marginBottom: 10 }}>{plan.title}</h1>}
      <div className="chat">
        <Msg face={SENPAI.avatar} who={SENPAI.name} tone="senpai">
          {plan ? plan.morning : MORNINGS[s.day % MORNINGS.length]}
        </Msg>
      </div>
      <h2>今日のチケット</h2>
      {tasks.length === 0 ? (
        <p className="muted">今日はチケットがありません。退勤してOK。</p>
      ) : (
        <ul className="tickets">
          {tasks.map((t) => {
            const m = ticketMeta(s, t);
            return (
              <li key={t.id}>
                <button className={`ticket ${t.done ? 'done' : ''} ${m.cls ?? ''}`} onClick={() => go(t.kind === 'lesson' ? { lesson: t.id } : { task: t.id })}>
                  <span className="ico" aria-hidden>
                    {m.icon}
                  </span>
                  <span className="t">
                    <b>{t.title}</b>
                    <small>{m.sub}</small>
                  </span>
                  <span aria-hidden>{t.done ? '✓' : '›'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <h2>今日の障害対応（5分）</h2>
      <button
        className="daily"
        onClick={() => {
          let ns = s;
          if (!daily) {
            ns = G.startDaily(s, date);
            set(ns);
          }
          const t = ns.tasks.find((x) => x.kind === 'incident' && x.daily === date)!;
          go({ task: t.id });
        }}
      >
        <span className="ico">🧯</span>
        <span className="t">
          <b>{dailyDone ? '今日はクリア済み' : '日替わりの障害を1つ解く'}</b>
          <br />
          <small className="muted">
            連続 {s.daily.streak}日（最高 {s.daily.best}日）{dailyDone ? '｜また明日' : ''}
          </small>
        </span>
        <span aria-hidden>›</span>
      </button>
      {s.log.length > 0 && (
        <>
          <h2>さいきんのできごと</h2>
          <ul className="muted" style={{ paddingLeft: 18, margin: 0 }}>
            {s.log
              .slice(-4)
              .reverse()
              .map((l, i) => (
                <li key={i}>
                  {l.day}日目：{l.text}
                </li>
              ))}
          </ul>
        </>
      )}
      <ActionBar>
        <button className="btn" disabled={left > 0} onClick={() => set(G.endDay(s))}>
          {left > 0 ? `残りのチケット ${left}件` : '退勤する（次の日へ）'}
        </button>
      </ActionBar>
    </>
  );
}

export function NewsView({ task }: { task: G.NewsTask }) {
  const { s, set, go } = useGame();
  const c = G.getCustomer(s, task.customerId);
  return (
    <>
      <div style={{ fontSize: 48 }}>{task.good ? '🛡️' : '📨'}</div>
      <h1 style={{ fontSize: 22 }}>{task.title}</h1>
      <div className="chat" style={{ marginTop: 14 }}>
        <Msg face={SENPAI.avatar} who={SENPAI.name} tone="senpai">
          {task.text}
          {task.good ? '\n\n作ったときの設計が、ちゃんと効いたな。こういう日が一番うれしいねん。' : ''}
        </Msg>
        {task.good && (
          <Msg face={c.avatar} who={c.contact}>
            ニュースで障害って聞いて心配したんですけど、うちは大丈夫でした！ ありがとうございます。
          </Msg>
        )}
      </div>
      <ActionBar>
        <button
          className="btn"
          onClick={() => {
            set(G.closeTask(s, task.id));
            go({ tab: 'today' });
          }}
        >
          {task.done ? 'もどる' : `確認した（+${task.xp} XP）`}
        </button>
      </ActionBar>
    </>
  );
}

export function ReviewView({ task }: { task: G.ReviewTask }) {
  const { s, set, go } = useGame();
  const weekStart = (task.week - 1) * 5 + 1;
  const weekTasks = s.tasks.filter((t) => t.day >= weekStart && t.day <= task.week * 5);
  const projects = weekTasks.filter((t) => t.kind === 'project' && t.result) as G.ProjectTask[];
  const incidents = weekTasks.filter((t) => t.kind === 'incident' && t.result) as G.IncidentTask[];
  const weak = G.weakTerms(s).slice(0, 6);
  const training = task.week === 1;
  return (
    <>
      <h1>第{task.week}週のふりかえり</h1>
      <div className="grid2" style={{ marginTop: 12 }}>
        <div className="stat">
          <b>{projects.length}</b>
          <span>公開した案件</span>
        </div>
        <div className="stat">
          <b>{projects.filter((p) => p.result!.stars === 3).length}</b>
          <span>★3の案件</span>
        </div>
        <div className="stat">
          <b>{incidents.length}</b>
          <span>対応した障害</span>
        </div>
        <div className="stat">
          <b>{s.xp}</b>
          <span>累計XP</span>
        </div>
      </div>
      <h2>担当しているお客さん</h2>
      <ul className="tickets">
        {s.customers
          .filter((c) => c.live)
          .map((c) => {
            const e = evaluate(c.arch, c.req);
            return (
              <li key={c.id}>
                <div className="ticket" style={{ cursor: 'default' }}>
                  <span className="ico">{c.avatar}</span>
                  <span className="t">
                    <b>{c.name}</b>
                    <small>
                      満足度 {c.satisfaction}｜月 {yen(e.monthlyYen)}｜弱点 {e.findings.filter((f) => f.severity === 'critical').length}件
                    </small>
                  </span>
                </div>
              </li>
            );
          })}
      </ul>
      <div className="chat" style={{ marginTop: 16 }}>
        <Msg face={SENPAI.avatar} who={SENPAI.name} tone="senpai">
          {training
            ? `1週間おつかれさん！ 研修はこれで終わり。来週からは正式に配属で、新しいお客さんや障害がどんどん来るで。\n\n作ったシステムの弱点は、そのうち障害になって返ってくる。逆に、ちゃんと作っとけば守ってくれる。それがこの仕事のおもしろいとこや。\n\n社内資格「クラウド基礎」に受かったら若手に上がれるから、「自分」タブから挑戦してみて。`
            : `今週もおつかれさん。${weak.length ? '下の言葉がまだ苦手みたいやから、図鑑で復習しとこか。' : '苦手な言葉もなさそうやな。この調子で。'}`}
        </Msg>
      </div>
      {weak.length > 0 && (
        <>
          <h2>苦手な言葉</h2>
          <TermButtons ids={weak.filter((w) => TERM_BY_ID[w])} />
        </>
      )}
      <ActionBar>
        <button
          className="btn"
          onClick={() => {
            set(G.closeTask(s, task.id));
            go({ tab: 'today' });
          }}
        >
          {task.done ? 'もどる' : 'ふりかえりをおえる（+30 XP）'}
        </button>
      </ActionBar>
    </>
  );
}
