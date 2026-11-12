import { useCallback, useEffect, useState } from 'react';
import * as G from './engine/game';
import { loadGame, saveGame, SAVE_KEY, importSave, type LoadResult } from './engine/save';
import { TERM_BY_ID } from './content/glossary';
import { COMPANY, RANKS, SENPAI } from './content/story';
import { GameCtx, Msg, Sheet, TermButtons, type View } from './ui/common';
import { Home, NewsView, ReviewView } from './ui/Home';
import { LessonView } from './ui/Lesson';
import { ProjectView } from './ui/Project';
import { IncidentView } from './ui/Incident';
import { Customers, CustomerDetail } from './ui/Customers';
import { Book, EXAM_LABEL } from './ui/Book';
import { Me } from './ui/Me';
import { QuizView } from './ui/Quiz';

const storage = (() => {
  try {
    const k = '__t';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  }
})();

export default function App() {
  const [boot] = useState<LoadResult>(() => loadGame(storage));
  const [s, setS] = useState<G.GameState | null>(boot.ok ? boot.state : null);
  const [view, setView] = useState<View>({ tab: 'today' });
  const [term, setTerm] = useState<string | null>(null);
  const [toastMsg, setToast] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  const set = useCallback((next: G.GameState) => {
    setS(next);
    setSaveFailed(!saveGame(storage, next));
  }, []);
  const toast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  }, []);
  const go = useCallback((v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
  }, []);
  const openTerm = useCallback((id: string) => setTerm(id), []);

  useEffect(() => {
    if (term && s && TERM_BY_ID[term]) set(G.seeTerm(s, term));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  if (!s) return <Title boot={boot} onStart={(name) => set(G.newGame(name))} onImport={(st) => set(st)} />;

  const ctx = { s, set, openTerm, toast, go };
  const isTab = 'tab' in view;
  const r = G.rank(s);
  const nr = G.nextRank(s);
  const xpPct = nr ? Math.min(100, ((s.xp - r.xp) / (nr.xp - r.xp)) * 100) : 100;
  const wd = ['月', '火', '水', '木', '金'][G.weekdayIndex(s.day)];

  let body: React.ReactNode = null;
  let hasAction = false;
  if ('tab' in view) {
    if (view.tab === 'today') (body = <Home />), (hasAction = true);
    if (view.tab === 'customers') body = <Customers />;
    if (view.tab === 'book') body = <Book />;
    if (view.tab === 'me')
      body = (
        <Me
          onReset={() => {
            storage.removeItem(SAVE_KEY);
            setS(null);
            setView({ tab: 'today' });
          }}
        />
      );
  } else if ('lesson' in view) {
    const t = s.tasks.find((x) => x.id === view.lesson) as G.LessonTask | undefined;
    body = t ? <LessonView task={t} /> : null;
    hasAction = true;
  } else if ('task' in view) {
    const t = s.tasks.find((x) => x.id === view.task);
    hasAction = true;
    if (t?.kind === 'project') body = <ProjectView task={t} />;
    else if (t?.kind === 'incident') body = <IncidentView task={t} />;
    else if (t?.kind === 'news') body = <NewsView task={t} />;
    else if (t?.kind === 'review') body = <ReviewView task={t} />;
    else if (t?.kind === 'lesson') body = <LessonView task={t} />;
  } else if ('quiz' in view) {
    body = <QuizView key={view.quiz} kind={view.quiz} />;
    hasAction = true;
  } else if ('customer' in view) body = <CustomerDetail id={view.customer} />;

  const t = term ? TERM_BY_ID[term] : null;
  const backTo: View = 'quiz' in view ? { tab: view.quiz === 'review' ? 'book' : 'me' } : 'customer' in view ? { tab: 'customers' } : { tab: 'today' };

  return (
    <GameCtx.Provider value={ctx}>
      <div className={`app ${isTab ? 'has-tabs' : ''}`}>
        <header className="topbar">
          {isTab ? (
            <div>
              <div className="day">
                {s.day}日目（{wd}）
              </div>
              <div className="sub">{G.isTraining(s) ? '研修中' : `第${G.weekOf(s.day)}週`}</div>
            </div>
          ) : (
            <button className="back" onClick={() => go(backTo)}>
              ‹ もどる
            </button>
          )}
          <span className="spacer" />
          <div className="rank">
            <b>{r.name}</b>
            {s.xp} XP
            <div className="xpbar" aria-hidden>
              <i style={{ width: `${xpPct}%` }} />
            </div>
          </div>
        </header>
        {saveFailed && <div style={{ background: 'var(--bad)', color: '#fff', padding: '6px 16px', fontSize: 13 }}>保存できませんでした。「自分」タブからセーブを書き出しておいてください。</div>}
        <main className={hasAction ? 'with-action' : ''}>{body}</main>
        {isTab && (
          <div className="tabbar">
            <nav>
              {(
                [
                  ['today', '🗂️', '今日'],
                  ['customers', '🏢', '担当'],
                  ['book', '📖', '図鑑'],
                  ['me', '🪪', '自分'],
                ] as const
              ).map(([id, ic, label]) => (
                <button key={id} aria-current={view.tab === id ? 'page' : undefined} onClick={() => go({ tab: id })}>
                  <span aria-hidden>{ic}</span>
                  {label}
                </button>
              ))}
            </nav>
          </div>
        )}
      </div>
      {t && (
        <Sheet title={t.word} onClose={() => setTerm(null)}>
          <p style={{ fontWeight: 700 }}>{t.short}</p>
          <p>{t.body}</p>
          {t.analogy && <p className="panel">💡 たとえると：{t.analogy}</p>}
          <p className="tiny" style={{ marginTop: 10 }}>
            出てくる試験：{t.exams.map((e) => EXAM_LABEL[e]).join('／')}
          </p>
          {t.related && (
            <>
              <h3>関係する言葉</h3>
              <TermButtons ids={t.related} />
            </>
          )}
        </Sheet>
      )}
      {s.pendingPromotion !== null && (
        <Sheet title="昇格！" onClose={() => set(G.clearPromotion(s))}>
          <div style={{ textAlign: 'center', fontSize: 56 }}>🎖️</div>
          <div className="chat">
            <Msg face="👔" who="大西部長">
              {s.playerName}さん、今日から「{RANKS[s.pendingPromotion].name}」や。{s.pendingPromotion >= 2 ? 'これからは、もっと大きなお客さんを任せるで。' : 'よう頑張ってるな。これからも頼むで。'}
            </Msg>
            <Msg face={SENPAI.avatar} who={SENPAI.name} tone="senpai">
              おめでとう！
            </Msg>
          </div>
          <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={() => set(G.clearPromotion(s))}>
            ありがとうございます
          </button>
        </Sheet>
      )}
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </GameCtx.Provider>
  );
}

function Title({ boot, onStart, onImport }: { boot: LoadResult; onStart: (name: string) => void; onImport: (s: G.GameState) => void }) {
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="app">
      <main style={{ paddingTop: 'calc(var(--safe-t) + 32px)' }}>
        <div className="idcard" style={{ marginBottom: 20 }}>
          <div className="co">{COMPANY}　インフラ部</div>
          <div className="nm">IT Engineer Sim</div>
          <div className="rk">クラウドエンジニアの1日を体験しながら、AWSを学ぶゲーム</div>
        </div>
        {!boot.ok && boot.reason === 'broken' && (
          <div className="panel" style={{ borderColor: 'var(--bad)', marginBottom: 16 }}>
            <b>前のセーブを読み込めませんでした</b>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              理由：{boot.message}。データは消さずに別の場所に残してあります。書き出したセーブファイルがあれば、下から読み込めます。
            </p>
          </div>
        )}
        <div className="chat">
          <Msg face={SENPAI.avatar} who={SENPAI.name} tone="senpai">
            はじめまして、三宅です。今日からきみの指導係や。AWSは触ったことない？ 大丈夫、1週間の研修で一から教えるから。{'\n\n'}まず、名前を教えてくれる？
          </Msg>
        </div>
        <div className="field">
          <label htmlFor="nm">名前（社員証にのります）</label>
          <input id="nm" type="text" value={name} maxLength={12} placeholder="ぴくみん" onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn" style={{ width: '100%' }} onClick={() => onStart(name.trim() || 'ぴくみん')}>
          入社する
        </button>
        <label className="btn ghost small" style={{ display: 'block', marginTop: 12, textAlign: 'center' }}>
          書き出したセーブを読み込む
          <input
            type="file"
            accept="application/json,.json"
            className="sr"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                onImport(importSave(await f.text()));
              } catch (x) {
                setErr((x as Error).message);
              }
            }}
          />
        </label>
        {err && <p style={{ color: 'var(--bad)' }}>{err}</p>}
        <p className="tiny" style={{ marginTop: 24 }}>
          学習用の非公式ゲームです。Amazon Web Services, Inc. とは関係ありません。料金は東京リージョンをもとにしたゲーム用の目安です。
        </p>
      </main>
    </div>
  );
}
