import { useState } from 'react';
import * as G from '../engine/game';
import { GLOSSARY, TERM_BY_ID, type Exam } from '../content/glossary';
import { useGame } from './common';

const EXAM_LABEL: Record<Exam, string> = { CLF: 'AWS クラウドプラクティショナー', SAA: 'AWS ソリューションアーキテクト', FE: '基本情報技術者' };

export function Book() {
  const { s, openTerm, go } = useGame();
  const [q, setQ] = useState('');
  const [exam, setExam] = useState<Exam | 'all'>('all');
  const weak = G.weakTerms(s).filter((t) => TERM_BY_ID[t]);
  const list = GLOSSARY.filter((t) => (exam === 'all' || t.exams.includes(exam)) && (!q || t.word.toLowerCase().includes(q.toLowerCase()) || t.short.includes(q)));
  return (
    <>
      <h1>用語図鑑</h1>
      <p className="muted">
        調べた言葉 {s.seenTerms.length} / {GLOSSARY.length}
      </p>
      {weak.length > 0 && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <b>苦手な言葉 {weak.length}個</b>
          <p className="muted" style={{ margin: '4px 0 8px' }}>
            {weak
              .slice(0, 5)
              .map((w) => TERM_BY_ID[w].word)
              .join('、')}
            {weak.length > 5 ? ' など' : ''}
          </p>
          <button className="btn small" onClick={() => go({ quiz: 'review' })}>
            苦手を5問で復習する
          </button>
        </div>
      )}
      {weak.length === 0 && (
        <button className="btn ghost small" style={{ marginBottom: 14 }} onClick={() => go({ quiz: 'review' })}>
          5問だけ復習する
        </button>
      )}
      <input type="search" placeholder="言葉をさがす（例：サブネット）" value={q} onChange={(e) => setQ(e.target.value)} aria-label="言葉をさがす" />
      <div className="seg" style={{ marginTop: 10 }}>
        {(['all', 'CLF', 'SAA', 'FE'] as const).map((x) => (
          <button key={x} aria-pressed={exam === x} onClick={() => setExam(x)}>
            {x === 'all' ? 'すべて' : EXAM_LABEL[x]}
          </button>
        ))}
      </div>
      <ul className="tickets" style={{ marginTop: 12 }}>
        {list.map((t) => (
          <li key={t.id}>
            <button className="ticket" onClick={() => openTerm(t.id)}>
              <span className="ico" aria-hidden>
                {s.seenTerms.includes(t.id) ? '📗' : '📕'}
              </span>
              <span className="t">
                <b>{t.word}</b>
                <small>{t.short}</small>
              </span>
              {weak.includes(t.id) && <span className="pill bad">苦手</span>}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export { EXAM_LABEL };
