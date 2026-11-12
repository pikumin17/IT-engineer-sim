import { useState } from 'react';
import * as G from '../engine/game';
import { LESSONS, SENPAI } from '../content/story';
import type { QuizQ } from '../content/quiz';
import { ActionBar, Msg, TermText, useGame } from './common';

export function LessonView({ task }: { task: G.LessonTask }) {
  const { s, set, go } = useGame();
  const lesson = LESSONS[task.lessonId];
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const slide = lesson.slides[i];
  const last = i === lesson.slides.length - 1;
  const answered = !slide.check || answers[i] !== undefined;
  const finish = () => {
    const res = lesson.slides
      .map((sl, k) => (sl.check ? { terms: sl.check.terms, correct: answers[k] === sl.check.answer } : null))
      .filter(Boolean) as { terms: string[]; correct: boolean }[];
    set(G.completeLesson(s, task.id, res));
    go({ tab: 'today' });
  };
  return (
    <>
      <div className="progress" aria-label={`${i + 1}/${lesson.slides.length}枚目`}>
        {lesson.slides.map((_, k) => (
          <i key={k} className={k <= i ? 'on' : ''} />
        ))}
      </div>
      <div className="slide-emoji" aria-hidden>
        {slide.emoji}
      </div>
      <h1 style={{ fontSize: 23 }}>{slide.title}</h1>
      <div className="chat" style={{ marginTop: 14 }}>
        <Msg face={SENPAI.avatar} who={SENPAI.name} tone="senpai">
          <TermText text={slide.body} />
        </Msg>
      </div>
      {slide.check && <Check q={slide.check} chosen={answers[i]} onChoose={(n) => setAnswers({ ...answers, [i]: n })} />}
      <ActionBar>
        <div className="row">
          <button className="btn ghost" disabled={i === 0} onClick={() => setI(i - 1)}>
            もどる
          </button>
          {last ? (
            <button className="btn" disabled={!answered || task.done} onClick={finish}>
              {task.done ? '受講済み' : '研修をおえる'}
            </button>
          ) : (
            <button className="btn" disabled={!answered} onClick={() => setI(i + 1)}>
              {answered ? 'つぎへ' : '確認問題に答えよう'}
            </button>
          )}
        </div>
      </ActionBar>
    </>
  );
}

export function Check({ q, chosen, onChoose }: { q: QuizQ; chosen?: number; onChoose: (n: number) => void }) {
  return (
    <div style={{ marginTop: 18 }}>
      <h3>確認：{q.q}</h3>
      <div className="choices">
        {q.choices.map((c, n) => (
          <button key={n} className={`choice ${chosen !== undefined ? (n === q.answer ? 'right' : n === chosen ? 'wrong' : '') : ''}`} disabled={chosen !== undefined} onClick={() => onChoose(n)}>
            {chosen !== undefined && n === q.answer ? '✓ ' : ''}
            {c}
          </button>
        ))}
      </div>
      {chosen !== undefined && (
        <p className="muted" style={{ marginTop: 8 }}>
          {chosen === q.answer ? '正解！ ' : '惜しい。 '}
          {q.explain}
        </p>
      )}
    </div>
  );
}
