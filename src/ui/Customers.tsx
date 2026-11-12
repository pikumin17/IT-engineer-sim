import { yen } from '../engine/catalog';
import { evaluate } from '../engine/evaluate';
import * as G from '../engine/game';
import { ArchEditor } from './ArchEditor';
import { FindingList, ScoreBars, useGame } from './common';

export function Customers() {
  const { s, go } = useGame();
  const live = s.customers.filter((c) => c.live);
  const building = s.customers.filter((c) => !c.live);
  return (
    <>
      <h1>担当のお客さん</h1>
      <p className="muted">公開したシステムは、ここでずっと動き続けます。弱点が多いほど、障害が起きやすくなります。</p>
      {live.length === 0 && <p>まだ公開したシステムはありません。</p>}
      {live.length > 0 && (
        <ul className="tickets">
          {live.map((c) => {
            const e = evaluate(c.arch, c.req);
            const crit = e.findings.filter((f) => f.severity === 'critical').length;
            return (
              <li key={c.id}>
                <button className="ticket" onClick={() => go({ customer: c.id })}>
                  <span className="ico">{c.avatar}</span>
                  <span className="t">
                    <b>{c.name}</b>
                    <small>
                      満足度 {c.satisfaction}｜月 {yen(e.monthlyYen)}
                    </small>
                  </span>
                  <span className={`pill ${crit ? 'bad' : 'ok'}`}>{crit ? `弱点${crit}` : '安定'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {building.length > 0 && (
        <>
          <h2>構築中</h2>
          <ul className="tickets">
            {building.map((c) => (
              <li key={c.id}>
                <div className="ticket" style={{ cursor: 'default' }}>
                  <span className="ico">{c.avatar}</span>
                  <span className="t">
                    <b>{c.name}</b>
                    <small>{c.industry}</small>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export function CustomerDetail({ id }: { id: string }) {
  const { s } = useGame();
  const c = G.getCustomer(s, id);
  if (!c) return <p>見つかりません。</p>;
  const e = evaluate(c.arch, c.req);
  return (
    <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 40 }}>{c.avatar}</span>
        <div>
          <h1 style={{ fontSize: 22 }}>{c.name}</h1>
          <div className="muted">
            満足度 {c.satisfaction}｜月 {yen(e.monthlyYen)}（予算 {yen(c.req.budgetYen)}）
          </div>
        </div>
      </div>
      <h2>いまの構成</h2>
      <ArchEditor arch={c.arch} readOnly />
      <h2>評価</h2>
      <ScoreBars scores={e.scores} />
      <h2>弱点</h2>
      <p className="muted">障害対応で「再発防止策」を選ぶと、ここが直っていきます。</p>
      <FindingList findings={e.findings} />
      <h2>これまで</h2>
      <ul className="muted" style={{ paddingLeft: 18 }}>
        {c.history.map((h, i) => (
          <li key={i}>
            {h.day}日目：{h.text}
          </li>
        ))}
      </ul>
    </>
  );
}
