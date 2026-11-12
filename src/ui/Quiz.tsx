import { useMemo, useState } from 'react';
import * as G from '../engine/game';
import { CERTS, QUIZ, type QuizQ } from '../content/quiz';
import { LESSONS, RANKS } from '../content/story';
import { mulberry32, shuffle } from '../engine/rng';
import { Check } from './Lesson';
import { ActionBar, TermButtons, useGame } from './common';

function reviewPool(s: G.GameState): QuizQ[] {
  const all: QuizQ[] = [...QUIZ.basic, ...QUIZ.architect, ...Object.values(LESSONS).flatMap((l) => l.slides.map((x) => x.check).filter(Boolean) as QuizQ[])];
  const weak = new Set(G.weakTerms(s));
  const hit = all.filter((q) => q.terms.some((t) => weak.has(t)));
  const r = mulberry32(Date.now() % 1e9);
  const rest = shuffle(r, all.filter((q) => !hit.includes(q)));
  return [...shuffle(r, hit), ...rest].slice(0, 5);
}

export function QuizView({ kind }: { kind: 'basic' | 'architect' | 'review' }) {
  const { s, set, go } = useGame();
  const qs = useMemo(() => (kind === 'review' ? reviewPool(s) : shuffle(mulberry32(Date.now() % 1e9), QUIZ[kind]).slice(0, CERTS[kind].count)), [kind]);
  const [i, setI] = useState(0);
  const [ans, setAns] = useState<number[]>([]);
  const [done, setDone] = useState<null | { passed?: boolean; score: number }>(null);
  const q = qs[i];
  const results = qs.map((x, k) => ({ terms: x.terms, correct: ans[k] === x.answer }));
  const finish = () => {
    if (kind === 'review') {
      set(G.reviewQuiz(s, results));
      setDone({ score: results.filter((r) => r.correct).length });
    } else {
      const r = G.takeCert(s, kind, results);
      set(r.state);
      setDone({ passed: r.passed, score: r.score });
    }
  };
  if (done) {
    const nr = RANKS[s.rankId + 1];
    return (
      <>
        <div className="panel" style={{ textAlign: 'center' }}>
          <div className="bignum">
            {done.score}
            <span style={{ fontSize: 18 }}> / {qs.length}</span>
          </div>
          {kind !== 'review' && <h1 style={{ marginTop: 8 }}>{done.passed ? '合格！' : '不合格…'}</h1>}
          <p className="muted">
            {kind === 'review' ? '苦手な言葉の記録を更新しました。' : done.passed ? `${CERTS[kind].name}に合格しました。` : `合格は${CERTS[kind].pass}問以上。間違えた言葉を図鑑で見なおして、また挑戦しよう。`}
            {kind !== 'review' && done.passed && nr && s.xp < nr.xp ? ` 昇格まであと ${nr.xp - s.xp} XP。` : ''}
          </p>
        </div>
        <h2>出てきた言葉</h2>
        <TermButtons ids={qs.flatMap((x) => x.terms)} />
        <ActionBar>
          <button className="btn" onClick={() => go({ tab: kind === 'review' ? 'book' : 'me' })}>
            もどる
          </button>
        </ActionBar>
      </>
    );
  }
  return (
    <>
      <p className="tiny">{kind === 'review' ? '苦手の復習' : `${CERTS[kind].name}（${CERTS[kind].real}）`}</p>
      <div className="progress">
        {qs.map((_, k) => (
          <i key={k} className={k <= i ? 'on' : ''} />
        ))}
      </div>
      <h1 style={{ fontSize: 20 }}>
        第{i + 1}問 / {qs.length}
      </h1>
      <Check key={q.id + i} q={q} chosen={ans[i]} onChoose={(n) => setAns(Object.assign([...ans], { [i]: n }))} />
      <ActionBar>
        {i < qs.length - 1 ? (
          <button className="btn" disabled={ans[i] === undefined} onClick={() => setI(i + 1)}>
            つぎの問題
          </button>
        ) : (
          <button className="btn" disabled={ans[i] === undefined} onClick={finish}>
            結果を見る
          </button>
        )}
      </ActionBar>
    </>
  );
}
