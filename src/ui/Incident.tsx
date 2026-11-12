import * as G from '../engine/game';
import type { Choice } from '../engine/incidents';
import { SENPAI } from '../content/story';
import { ActionBar, Msg, Sparkline, TermButtons, useGame } from './common';
import { Terminal } from './Terminal';

const STAGES: G.IncidentStage[] = ['alert', 'investigate', 'cause', 'restore', 'prevent', 'report', 'result'];

export function IncidentView({ task }: { task: G.IncidentTask }) {
  const { s, set, go } = useGame();
  const c = G.getCustomer(s, task.customerId);
  const spec = G.incidentSpec(s, task);
  const stage = task.stage;
  const next = (st: G.IncidentStage) => set(G.setIncidentStage(s, task.id, st));
  const pick = (field: 'cause' | 'restore' | 'prevent' | 'impact', id: string) => !task.choice[field] && set(G.chooseIncident(s, task.id, field, id));
  const label = (list: Choice[], id: string) => list.find((x) => x.id === id)?.text ?? '';

  const choiceBlock = (field: 'cause' | 'restore' | 'prevent' | 'impact', list: Choice[]) => {
    const chosen = task.choice[field];
    const ch = list.find((x) => x.id === chosen);
    return (
      <>
        <div className="choices">
          {list.map((o) => (
            <button key={o.id} className={`choice ${chosen ? (o.good ? 'right' : o.id === chosen ? 'wrong' : '') : ''}`} disabled={!!chosen} aria-pressed={o.id === chosen} onClick={() => pick(field, o.id)}>
              {chosen && o.good ? '✓ ' : ''}
              {o.text}
            </button>
          ))}
        </div>
        {ch && (
          <div className="chat" style={{ marginTop: 12 }}>
            <Msg face={SENPAI.avatar} who={SENPAI.name} tone="senpai">
              {ch.good ? `そう！ ${ch.explain}` : `うーん、${ch.explain}\n正解は「${list.find((x) => x.good)!.text}」やな。`}
            </Msg>
          </div>
        )}
      </>
    );
  };

  return (
    <>
      <div className="hazard-head">
        <div className="when">
          {spec.start} 発生｜{c.name}
          {task.daily ? '（今日の障害・練習）' : ''}
        </div>
        <h1>{spec.title}</h1>
        <div className="stepdots" aria-hidden>
          {STAGES.map((x) => (
            <i key={x} className={STAGES.indexOf(x) <= STAGES.indexOf(stage) ? 'on' : ''} />
          ))}
        </div>
      </div>

      {stage === 'alert' && (
        <>
          <div className="panel">
            <b>{spec.alertTitle}</b>
            <p style={{ margin: '6px 0 0' }}>{spec.alertBody}</p>
          </div>
          <div className="chat" style={{ marginTop: 14 }}>
            <Msg face={SENPAI.avatar} who={SENPAI.name} tone="senpai">
              {spec.detectedBy === 'customer'
                ? 'お客さんから先に連絡が来てしもたな…。アラームを仕込んでたら、こっちが先に気づけたかもしれん。\nとにかく落ち着いて、まずは状況確認や。'
                : 'アラームが鳴った！ お客さんより先に気づけたのは大きいで。落ち着いて、まず状況確認や。'}
            </Msg>
          </div>
          <ActionBar>
            <button className="btn hazard" onClick={() => next('investigate')}>
              調査を始める
            </button>
          </ActionBar>
        </>
      )}

      {stage === 'investigate' && (
        <>
          <h2 style={{ marginTop: 0 }}>グラフ（CloudWatch・2時間分）</h2>
          <div className="panel">
            {spec.metrics.map((m) => (
              <div className="metric" key={m.key}>
                <div className="mh">
                  <span>{m.label}</span>
                  <span className="muted">
                    いま {m.values[m.values.length - 1]}
                    {m.unit}
                    {m.threshold !== undefined ? `（赤線：しきい値 ${m.threshold}）` : ''}
                  </span>
                </div>
                <Sparkline values={m.values} threshold={m.threshold} />
              </div>
            ))}
            <p className="tiny" style={{ margin: 0 }}>
              右に行くほど新しい。途中で形が変わったところが、障害の始まりです。
            </p>
          </div>
          <h2>コマンドで調べる</h2>
          <Terminal commands={spec.commands} ran={task.ran} onRun={(id) => set(G.runIncidentCommand(s, task.id, id))} />
          <ActionBar>
            <button className="btn" disabled={task.ran.length === 0} onClick={() => next('cause')}>
              {task.ran.length === 0 ? 'コマンドを1つ以上実行しよう' : '原因を判断する'}
            </button>
          </ActionBar>
        </>
      )}

      {stage === 'cause' && (
        <>
          <h2 style={{ marginTop: 0 }}>原因はどれ？</h2>
          <details className="fold" style={{ marginBottom: 12 }}>
            <summary>調べた結果を見なおす</summary>
            <Terminal commands={spec.commands.filter((x) => task.ran.includes(x.id))} ran={task.ran} onRun={() => {}} />
          </details>
          {choiceBlock('cause', spec.causes)}
          <ActionBar>
            <button className="btn" disabled={!task.choice.cause} onClick={() => next('restore')}>
              まず止血（サービスを戻す）
            </button>
          </ActionBar>
        </>
      )}

      {stage === 'restore' && (
        <>
          <h2 style={{ marginTop: 0 }}>まず、どうやって戻す？</h2>
          <p className="muted">お客さんが困っている時間を、少しでも短くするための対応です。</p>
          {choiceBlock('restore', spec.restores)}
          <ActionBar>
            <button className="btn" disabled={!task.choice.restore} onClick={() => next('prevent')}>
              再発防止を考える
            </button>
          </ActionBar>
        </>
      )}

      {stage === 'prevent' && (
        <>
          <h2 style={{ marginTop: 0 }}>二度と起こさないためには？</h2>
          <p className="muted">正しい再発防止策は、{task.daily ? '' : 'このお客さんの'}構成にそのまま反映されます。</p>
          {choiceBlock('prevent', spec.prevents)}
          <ActionBar>
            <button className="btn" disabled={!task.choice.prevent} onClick={() => next('report')}>
              障害報告書を書く
            </button>
          </ActionBar>
        </>
      )}

      {stage === 'report' && (
        <>
          <h2 style={{ marginTop: 0 }}>障害報告書</h2>
          <dl className="report">
            <dt>件名</dt>
            <dd>
              {c.name} {spec.title}について
            </dd>
            <dt>発生時刻</dt>
            <dd>{spec.start}</dd>
            <dt>検知</dt>
            <dd>{spec.detectedBy === 'alarm' ? 'CloudWatchアラーム／社内からの連絡' : 'お客さまからのお電話'}</dd>
            <dt>影響範囲</dt>
            <dd>{task.choice.impact ? label(spec.impacts, task.choice.impact) : '（下から選んでください）'}</dd>
            <dt>原因</dt>
            <dd>{label(spec.causes, task.choice.cause)}</dd>
            <dt>暫定対応</dt>
            <dd>{label(spec.restores, task.choice.restore)}</dd>
            <dt>再発防止策</dt>
            <dd>{label(spec.prevents, task.choice.prevent)}</dd>
          </dl>
          <h2>影響範囲として正しいのは？</h2>
          <p className="muted">グラフやログからわかる事実だけを書きます。</p>
          {choiceBlock('impact', spec.impacts)}
          <ActionBar>
            <button className="btn" disabled={!task.choice.impact} onClick={() => set(G.finishIncident(s, task.id))}>
              報告書を提出する
            </button>
          </ActionBar>
        </>
      )}

      {stage === 'result' && task.result && (
        <>
          <div className="panel" style={{ textAlign: 'center' }}>
            <div className="bignum">
              {task.result.correct}
              <span style={{ fontSize: 18 }}> / 4 正解</span>
            </div>
            <p className="muted" style={{ margin: '6px 0 0' }}>
              +{task.result.xp} XP｜お客さんの満足度 {task.result.satDelta >= 0 ? '+' : ''}
              {task.result.satDelta}
              {task.daily ? `｜連続 ${s.daily.streak}日` : ''}
            </p>
          </div>
          <div className="chat" style={{ marginTop: 14 }}>
            <Msg face={SENPAI.avatar} who={SENPAI.name} tone="senpai">
              {task.result.correct === 4 ? 'おつかれさん、完璧な対応やった！\n\n' : task.result.correct >= 2 ? 'おつかれさん。対応できてたで。\n\n' : 'おつかれさん。障害対応は場数や。次はいける。\n\n'}
              {spec.lesson}
            </Msg>
          </div>
          <h2>この障害で出てきた言葉</h2>
          <TermButtons ids={spec.terms} />
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
      )}
    </>
  );
}
