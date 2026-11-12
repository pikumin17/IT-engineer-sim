import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { GameState } from '../engine/game';
import type { Finding } from '../engine/types';
import { TERM_BY_ID } from '../content/glossary';

export interface Ctx {
  s: GameState;
  set: (next: GameState) => void;
  openTerm: (id: string) => void;
  toast: (msg: string) => void;
  go: (v: View) => void;
}
export type View = { tab: 'today' | 'customers' | 'book' | 'me' } | { task: string } | { lesson: string } | { quiz: 'basic' | 'architect' | 'review' } | { customer: string };

export const GameCtx = createContext<Ctx>(null as any);
export const useGame = () => useContext(GameCtx);

/** [[id|表示]] をタップできる用語にする */
export function TermText({ text }: { text: string }) {
  const { openTerm } = useGame();
  const parts: ReactNode[] = [];
  const re = /\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const id = m[1];
    const label = m[2] ?? TERM_BY_ID[id]?.word ?? id;
    parts.push(
      <button key={k++} className="term" onClick={() => openTerm(id)}>
        {label}
      </button>,
    );
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export function TermButtons({ ids }: { ids: string[] }) {
  const { openTerm } = useGame();
  const uniq = [...new Set(ids)].filter((i) => TERM_BY_ID[i]);
  if (!uniq.length) return null;
  return (
    <div className="chips" style={{ marginTop: 6 }}>
      {uniq.map((id) => (
        <button key={id} className="chip" onClick={() => openTerm(id)}>
          📖 {TERM_BY_ID[id].word}
        </button>
      ))}
    </div>
  );
}

export function Msg({ face, who, children, side = 'left', tone }: { face: string; who?: string; children: ReactNode; side?: 'left' | 'right'; tone?: 'senpai' }) {
  return (
    <div className={`msg ${side === 'right' ? 'me' : ''} ${tone ?? ''}`}>
      <div className="face" aria-hidden>
        {face}
      </div>
      <div className="body">
        {who && <div className="who">{who}</div>}
        <div className="bubble">{children}</div>
      </div>
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="sheet-bg" onClick={onClose} role="presentation">
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h2>{title}</h2>
          <button className="btn ghost small" onClick={onClose}>
            閉じる
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stars({ n }: { n: number }) {
  return (
    <div className="stars" aria-label={`星${n}つ`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= n ? '' : 'off'}>
          ★
        </span>
      ))}
    </div>
  );
}

export function ScoreBars({ scores }: { scores: Record<string, number> }) {
  const label: Record<string, string> = { performance: '性能', availability: '止まらなさ', security: 'セキュリティ', cost: 'コスト', monitoring: '監視' };
  return (
    <div className="stack">
      {Object.entries(scores).map(([k, v]) => (
        <div className="scorebar" key={k}>
          <span>{label[k] ?? k}</span>
          <span className="bar">
            <i style={{ width: `${v}%`, background: v >= 80 ? 'var(--ok)' : v >= 50 ? 'var(--warn)' : 'var(--bad)' }} />
          </span>
          <span className="n">{v}</span>
        </div>
      ))}
    </div>
  );
}

export function FindingList({ findings, showFix = true }: { findings: Finding[]; showFix?: boolean }) {
  if (!findings.length) return <p className="muted">指摘はありません。</p>;
  const sev = { critical: '要対応', warning: '注意', info: 'ひとこと' } as const;
  const cls = { critical: 'bad', warning: 'warn', info: '' } as const;
  return (
    <div className="stack">
      {findings.map((f) => (
        <div key={f.id} className={`finding ${f.severity}`}>
          <span className={`pill ${cls[f.severity]}`}>{sev[f.severity]}</span>
          <b style={{ marginTop: 4 }}>{f.text}</b>
          <p className="muted" style={{ margin: '4px 0' }}>
            {f.why}
          </p>
          {showFix && <p style={{ fontSize: 14, margin: 0 }}>👉 {f.fix}</p>}
          <TermButtons ids={f.terms} />
        </div>
      ))}
    </div>
  );
}

export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="actionbar">
      <div className="inner">{children}</div>
    </div>
  );
}

export function Sparkline({ values, threshold }: { values: number[]; threshold?: number }) {
  const w = 300;
  const h = 70;
  const max = Math.max(1, threshold ?? 0, ...values) * 1.1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * (h - 6) - 3}`).join(' ');
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      {threshold !== undefined && <line x1="0" x2={w} y1={h - (threshold / max) * (h - 6) - 3} y2={h - (threshold / max) * (h - 6) - 3} stroke="var(--bad)" strokeDasharray="4 4" strokeWidth="1.5" />}
      <polyline points={pts} fill="none" stroke="var(--sky)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
