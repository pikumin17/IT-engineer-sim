import { useRef, useState } from 'react';
import * as G from '../engine/game';
import { exportSave, importSave } from '../engine/save';
import { CERTS } from '../content/quiz';
import { COMPANY, RANKS } from '../content/story';
import { Sheet, useGame } from './common';

export function Me({ onReset }: { onReset: () => void }) {
  const { s, set, go, toast } = useGame();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [howto, setHowto] = useState(false);
  const r = G.rank(s);
  const nr = G.nextRank(s);
  const progress = nr ? Math.min(100, ((s.xp - r.xp) / (nr.xp - r.xp)) * 100) : 100;

  const doExport = async () => {
    const text = exportSave(s);
    const name = `it-engineer-sim-save-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([text], name, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'セーブデータ' });
        toast('セーブを書き出しました');
        return;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('セーブを書き出しました');
  };

  const doImport = async (f: File) => {
    try {
      const st = importSave(await f.text());
      set(st);
      toast(`読み込みました（${st.day}日目）`);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <>
      <div className="idcard">
        <div className="co">{COMPANY}　インフラ部</div>
        <div className="nm">{s.playerName}</div>
        <div className="rk">
          {r.name}クラウドエンジニア｜{s.day}日目
        </div>
        <div className="xp">
          {nr ? `次の「${nr.name}」まで ${Math.max(0, nr.xp - s.xp)} XP${nr.cert && !s.certs.includes(nr.cert) ? `＋${CERTS[nr.cert].name}` : ''}` : '最高ランク'}
          <div className="xpbar">
            <i style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <h2>社内資格</h2>
      <div className="stack">
        {Object.values(CERTS).map((c) => (
          <div className="panel" key={c.id}>
            <b>
              {s.certs.includes(c.id) ? '✅ ' : ''}
              {c.name}
            </b>
            <p className="muted" style={{ margin: '4px 0' }}>
              {c.desc}
            </p>
            <p className="tiny">
              {c.real}。{c.count}問中{c.pass}問以上で合格。
            </p>
            <button className="btn small" onClick={() => go({ quiz: c.id })}>
              {s.certs.includes(c.id) ? 'もう一度解く' : '受験する'}
            </button>
          </div>
        ))}
      </div>

      <h2>ランク</h2>
      <ul className="tickets">
        {RANKS.map((x) => (
          <li key={x.id}>
            <div className="ticket" style={{ cursor: 'default', opacity: x.id <= s.rankId ? 1 : 0.55 }}>
              <span className="ico">{x.id <= s.rankId ? '🎖️' : '⬜'}</span>
              <span className="t">
                <b>{x.name}</b>
                <small>
                  {x.xp} XP{x.cert ? `＋${CERTS[x.cert].name}` : ''}｜{['小さなお店の案件', '小さなお店の案件', '中くらいの会社の案件', '大きな会社の案件'][x.id]}
                </small>
              </span>
            </div>
          </li>
        ))}
      </ul>

      <h2>実績</h2>
      <div>
        {Object.entries(G.ACHIEVEMENTS).map(([id, a]) => (
          <div key={id} className={`ach ${s.achievements.includes(id) ? '' : 'locked'}`}>
            <span className="i">{a.icon}</span>
            <span>
              <b>{a.name}</b>
              <br />
              <small className="muted">{a.desc}</small>
            </span>
          </div>
        ))}
      </div>

      <h2>記録</h2>
      <div className="grid2">
        <div className="stat">
          <b>{s.stats.projects}</b>
          <span>公開した案件</span>
        </div>
        <div className="stat">
          <b>{s.stats.stars3}</b>
          <span>★3</span>
        </div>
        <div className="stat">
          <b>{s.stats.incidents}</b>
          <span>障害対応</span>
        </div>
        <div className="stat">
          <b>{s.stats.savedByDesign}</b>
          <span>構成で防いだ障害</span>
        </div>
      </div>

      <h2>セーブ</h2>
      <div className="panel stack">
        <p className="muted" style={{ margin: 0 }}>
          進み具合はこの端末のブラウザに自動で保存されます。消えたときや別の端末で続けたいときのために、ときどき書き出しておくと安心です。
        </p>
        <button className="btn small" onClick={doExport}>
          セーブを書き出す
        </button>
        <button className="btn ghost small" onClick={() => fileRef.current?.click()}>
          セーブを読み込む
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="sr" onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
        <button className="linkbtn" onClick={() => setHowto(true)}>
          iPhoneのホーム画面に追加するには
        </button>
      </div>
      <hr className="sep" />
      <button className="btn danger small" onClick={() => setConfirmReset(true)}>
        最初からやり直す
      </button>

      {confirmReset && (
        <Sheet title="最初からやり直す？" onClose={() => setConfirmReset(false)}>
          <p>いまのセーブは消えます。残しておきたいときは、先に「セーブを書き出す」をしてください。</p>
          <div className="stack">
            <button className="btn ghost" onClick={doExport}>
              先に書き出す
            </button>
            <button className="btn danger" onClick={onReset}>
              消して最初から
            </button>
          </div>
        </Sheet>
      )}
      {howto && (
        <Sheet title="ホーム画面に追加する" onClose={() => setHowto(false)}>
          <ol style={{ paddingLeft: 20 }}>
            <li>Safariでこのページを開く</li>
            <li>画面下の共有ボタン（四角から上向きの矢印）をタップ</li>
            <li>「ホーム画面に追加」をタップ</li>
            <li>右上の「追加」をタップ</li>
          </ol>
          <p className="muted">ホーム画面のアイコンから開くと、全画面のアプリのように遊べます。iPhoneのSafariは、しばらく開かないサイトの保存データを消すことがありますが、ホーム画面から使うとその心配が減ります。</p>
        </Sheet>
      )}
    </>
  );
}
