import { useState } from 'react';
import { ALARM_INFO, DB_SIZES, EC2_RPS, EC2_SPEC, INSTANCE_TYPES, RDS_RPS, SERVICES, yen, EC2_YEN, RDS_YEN } from '../engine/catalog';
import { cloneArch, wantedAlarms } from '../engine/evaluate';
import type { AlarmKind, Architecture, AZ, Port, RuleSource, RuleTarget, ServiceId } from '../engine/types';
import { Sheet, TermButtons } from './common';

type SheetId = null | 'add' | 'net' | 'web' | 'alb' | 'db' | 's3' | 'cf' | 'rules' | 'alarms';

const PORT_LABEL: Record<Port, string> = { 22: '22番（SSH・管理用）', 80: '80番（HTTP）', 443: '443番（HTTPS）', 3306: '3306番（MySQL・DB）' };
const SRC_LABEL: Record<RuleSource, string> = { anywhere: 'どこからでも（0.0.0.0/0）', office: '事務所のIPだけ', alb: 'ALBから', web: 'Webサーバーから' };
const TGT_LABEL: Record<RuleTarget, string> = { alb: 'ALB', web: 'Webサーバー', db: 'DB' };

export function ArchEditor({ arch, onChange, allowed, readOnly }: { arch: Architecture; onChange?: (a: Architecture) => void; allowed?: ServiceId[]; readOnly?: boolean }) {
  const [sheet, setSheet] = useState<SheetId>(null);
  const can = (id: ServiceId) => !allowed || allowed.includes(id);
  const edit = (f: (a: Architecture) => void) => {
    if (readOnly || !onChange) return;
    const a = cloneArch(arch);
    f(a);
    onChange(a);
  };
  const open = (id: SheetId) => !readOnly && setSheet(id);
  const hasVpc = arch.publicSubnets.length + arch.privateSubnets.length > 0 || !!arch.web || !!arch.db;

  const cell = (az: AZ, kind: 'public' | 'private') => {
    const on = (kind === 'public' ? arch.publicSubnets : arch.privateSubnets).includes(az);
    const webHere = arch.web && arch.web.subnet === kind && arch.web.azs.includes(az) && arch.web.perAz > 0;
    const dbHere = arch.db && arch.db.subnet === kind && (az === 'a' || arch.db.multiAz);
    const natHere = arch.natGateway && kind === 'public' && az === 'a';
    const missing = !on && (webHere || dbHere || natHere);
    return (
      <div className={`subnet ${on ? 'on' : ''} ${kind === 'public' ? 'pub' : 'pri'}`} style={missing ? { borderColor: 'var(--bad)' } : undefined}>
        {on ? (
          <span className="sl">{kind === 'public' ? 'パブリック' : 'プライベート'}</span>
        ) : (
          <button className="empty" onClick={() => open('net')} disabled={readOnly}>
            {missing ? '⚠ サブネットがありません' : `${kind === 'public' ? 'パブリック' : 'プライベート'}なし`}
          </button>
        )}
        {webHere && (
          <button className="node" onClick={() => open('web')}>
            <span className="ni">🖥️</span>
            <span>
              EC2 ×{arch.web!.perAz}
              <small>
                {arch.web!.type}
                {arch.web!.autoScaling ? '・自動で増減' : ''}
              </small>
            </span>
          </button>
        )}
        {natHere && (
          <button className="node" onClick={() => open('net')}>
            <span className="ni">🚪</span>
            <span>NAT</span>
          </button>
        )}
        {dbHere && (
          <button className="node" onClick={() => open('db')}>
            <span className="ni">🗄️</span>
            <span>
              RDS{az === 'c' ? '（予備）' : ''}
              <small>{arch.db!.size.replace('db.', '')}</small>
            </span>
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="diagram" aria-label="構成図">
        <div className="edge">
          <div className="node wide" style={{ cursor: 'default' }}>
            <span className="ni">🌍</span> インターネット（お客さん）
          </div>
          <span className="arrow">▼</span>
          {arch.cloudfront && (
            <>
              <button className="node wide" onClick={() => open('cf')}>
                <span className="ni">🌐</span> CloudFront<small>近くの拠点から配る</small>
              </button>
              <span className="arrow">▼</span>
            </>
          )}
        </div>
        {hasVpc ? (
          <div className="vpc">
            <span className="lbl">VPC（自分専用のネットワーク）</span>
            <div className="azgrid">
              <div className="azhead">AZ-a</div>
              <div className="azhead">AZ-c</div>
              {cell('a', 'public')}
              {cell('c', 'public')}
            </div>
            {arch.alb && (
              <div className="albrow">
                <button className="node wide" onClick={() => open('alb')}>
                  <span className="ni">🔀</span> ALB<small>2つのAZにまたがって振り分ける</small>
                </button>
              </div>
            )}
            <div className="azgrid" style={{ marginTop: arch.alb ? 0 : 6 }}>
              {cell('a', 'private')}
              {cell('c', 'private')}
            </div>
          </div>
        ) : (
          <p className="tiny" style={{ textAlign: 'center' }}>
            VPC（ネットワーク）はまだありません
          </p>
        )}
        <div className="side">
          {arch.s3 && (
            <button className="node" onClick={() => open('s3')}>
              <span className="ni">🪣</span>
              <span>
                S3<small>{arch.s3.blockPublicAccess ? '公開ブロック オン' : '⚠ 公開ブロック オフ'}</small>
              </span>
            </button>
          )}
          <button className="node" onClick={() => open('rules')}>
            <span className="ni">🛡️</span>
            <span>
              門番<small>許可 {arch.rules.length}件</small>
            </span>
          </button>
          <button className="node" onClick={() => open('alarms')}>
            <span className="ni">🔔</span>
            <span>
              アラーム<small>{arch.alarms.length}個</small>
            </span>
          </button>
        </div>
      </div>
      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn small" style={{ flex: 1 }} onClick={() => setSheet('add')}>
            ＋ 部品を追加
          </button>
          <button className="btn ghost small" style={{ flex: 1 }} onClick={() => setSheet('net')}>
            🏢 ネットワーク
          </button>
        </div>
      )}

      {sheet === 'add' && (
        <Sheet title="部品を追加" onClose={() => setSheet(null)}>
          <p className="muted">タップすると構成図に置かれます。置いたあとは、図の部品をタップして設定を変えられます。</p>
          <div className="stack">
            {(
              [
                ['vpc', 'ネットワーク（VPC・サブネット）を設定', false, () => setSheet('net')],
                ['ec2', arch.web ? '置き済み' : 'Webサーバーを1台置く', !!arch.web, () => (edit((a) => (a.web = { type: 't3.micro', azs: ['a'], perAz: 1, subnet: 'public', autoScaling: false, asgMax: 2 })), setSheet('web'))],
                ['s3', arch.s3 ? '置き済み' : 'S3バケットを置く', !!arch.s3, () => (edit((a) => (a.s3 = { website: true, blockPublicAccess: true, versioning: false })), setSheet('s3'))],
                ['cloudfront', arch.cloudfront ? '置き済み' : 'CloudFrontを前に置く', arch.cloudfront, () => (edit((a) => (a.cloudfront = true)), setSheet(null))],
                ['rds', arch.db ? '置き済み' : 'データベースを置く', !!arch.db, () => (edit((a) => (a.db = { size: 'db.t3.micro', multiAz: false, backupDays: 0, subnet: 'private' })), setSheet('db'))],
                ['alb', arch.alb ? '置き済み' : 'ALBを置く', arch.alb, () => (edit((a) => (a.alb = true)), setSheet('alb'))],
                ['asg', !arch.web || !arch.alb ? 'EC2とALBを先に置こう' : arch.web.autoScaling ? '設定済み' : '混んだら自動で増やす', !arch.web || !arch.alb || !!arch.web?.autoScaling, () => (edit((a) => a.web && ((a.web.autoScaling = true), (a.web.asgMax = Math.max(4, a.web.perAz * a.web.azs.length)))), setSheet('web'))],
                ['nat', arch.natGateway ? '置き済み' : 'NATゲートウェイを置く', arch.natGateway, () => (edit((a) => (a.natGateway = true)), setSheet('net'))],
                ['sg', 'セキュリティグループ（門番）を設定', false, () => setSheet('rules')],
                ['cloudwatch', 'CloudWatchアラームを設定', false, () => setSheet('alarms')],
              ] as [ServiceId, string, boolean, () => void][]
            ).map(([id, label, disabled, act]) => {
              const sv = SERVICES[id];
              const locked = !can(id);
              return (
                <button key={id} className="choice" disabled={locked || disabled} onClick={act} style={{ display: 'flex', gap: 12, alignItems: 'center', opacity: locked || disabled ? 0.5 : 1 }}>
                  <span style={{ fontSize: 26 }}>{locked ? '🔒' : sv.icon}</span>
                  <span>
                    <b>{sv.name}</b>
                    <br />
                    <small className="muted">{locked ? 'まだ研修で習っていません' : `${sv.short}｜${label}`}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </Sheet>
      )}

      {sheet === 'net' && (
        <Sheet title="ネットワーク（VPC）" onClose={() => setSheet(null)}>
          <p className="muted">サブネットは1つのAZの中に作ります。パブリックはインターネットから入れる場所、プライベートは外から直接入れない奥の部屋。</p>
          {(['public', 'private'] as const).map((k) =>
            (['a', 'c'] as AZ[]).map((z) => {
              const list = k === 'public' ? arch.publicSubnets : arch.privateSubnets;
              return (
                <label className="toggle" key={k + z}>
                  <span>
                    {k === 'public' ? 'パブリック' : 'プライベート'}サブネット（AZ-{z}）
                    <small>{k === 'public' ? 'ALB・外から見るWebサーバー・NATを置く' : 'DB・ALBの後ろのWebサーバーを置く'}</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={list.includes(z)}
                    onChange={(e) =>
                      edit((a) => {
                        const l = k === 'public' ? a.publicSubnets : a.privateSubnets;
                        const next = e.target.checked ? [...new Set([...l, z])].sort() : l.filter((x) => x !== z);
                        if (k === 'public') a.publicSubnets = next as AZ[];
                        else a.privateSubnets = next as AZ[];
                      })
                    }
                  />
                </label>
              );
            }),
          )}
          <label className="toggle" style={{ opacity: can('nat') ? 1 : 0.4 }}>
            <span>
              NATゲートウェイ {!can('nat') && '🔒'}
              <small>プライベートのサーバーが更新を取りに行く出口（月 {yen(7300)}）</small>
            </span>
            <input type="checkbox" disabled={!can('nat')} checked={arch.natGateway} onChange={(e) => edit((a) => (a.natGateway = e.target.checked))} />
          </label>
          <TermButtons ids={['vpc', 'subnet', 'az', 'nat-gateway']} />
        </Sheet>
      )}

      {sheet === 'web' && arch.web && (
        <Sheet title="Webサーバー（EC2）" onClose={() => setSheet(null)}>
          <div className="field">
            <span className="lb">大きさ（インスタンスタイプ）</span>
            <div className="seg">
              {INSTANCE_TYPES.map((t) => (
                <button key={t} aria-pressed={arch.web!.type === t} onClick={() => edit((a) => (a.web!.type = t))}>
                  {t}
                  <br />
                  <small>
                    {EC2_SPEC[t]}・約{EC2_RPS[t]}件/秒・{yen(EC2_YEN[t])}/月
                  </small>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="lb">置くAZ</span>
            <div className="seg">
              {(['a', 'c'] as AZ[]).map((z) => (
                <button
                  key={z}
                  aria-pressed={arch.web!.azs.includes(z)}
                  onClick={() =>
                    edit((a) => {
                      const has = a.web!.azs.includes(z);
                      const next = has ? a.web!.azs.filter((x) => x !== z) : [...a.web!.azs, z].sort();
                      a.web!.azs = (next.length ? next : [z]) as AZ[];
                    })
                  }
                >
                  AZ-{z}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="lb">AZごとの台数{arch.web.autoScaling ? '（ふだんの最小台数）' : ''}</span>
            <div className="stepper">
              <button aria-label="減らす" onClick={() => edit((a) => (a.web!.perAz = Math.max(1, a.web!.perAz - 1)))}>
                −
              </button>
              <b>{arch.web.perAz}</b>
              <button aria-label="増やす" onClick={() => edit((a) => (a.web!.perAz = Math.min(6, a.web!.perAz + 1)))}>
                ＋
              </button>
              <span className="muted">合計 {arch.web.perAz * arch.web.azs.length} 台</span>
            </div>
          </div>
          <div className="field">
            <span className="lb">置くサブネット</span>
            <div className="seg">
              <button aria-pressed={arch.web.subnet === 'public'} onClick={() => edit((a) => (a.web!.subnet = 'public'))}>
                パブリック
              </button>
              <button aria-pressed={arch.web.subnet === 'private'} onClick={() => edit((a) => (a.web!.subnet = 'private'))}>
                プライベート
              </button>
            </div>
          </div>
          <label className="toggle" style={{ opacity: can('asg') && arch.alb ? 1 : 0.4 }}>
            <span>
              Auto Scaling（混んだら自動で増やす）{!can('asg') && ' 🔒'}
              <small>{arch.alb ? 'CPUが高くなったら台数を増やし、空いたら減らす' : 'ALBがないと使えません'}</small>
            </span>
            <input type="checkbox" disabled={!can('asg') || !arch.alb} checked={arch.web.autoScaling} onChange={(e) => edit((a) => ((a.web!.autoScaling = e.target.checked), (a.web!.asgMax = Math.max(a.web!.asgMax, a.web!.perAz * a.web!.azs.length * 2))))} />
          </label>
          {arch.web.autoScaling && (
            <div className="field">
              <span className="lb">混んだときの最大台数（全体）</span>
              <div className="stepper">
                <button aria-label="減らす" onClick={() => edit((a) => (a.web!.asgMax = Math.max(a.web!.perAz * a.web!.azs.length, a.web!.asgMax - 1)))}>
                  −
                </button>
                <b>{arch.web.asgMax}</b>
                <button aria-label="増やす" onClick={() => edit((a) => (a.web!.asgMax = Math.min(30, a.web!.asgMax + 1)))}>
                  ＋
                </button>
                <span className="muted">最大 約{arch.web.asgMax * EC2_RPS[arch.web.type]}件/秒</span>
              </div>
            </div>
          )}
          <TermButtons ids={['ec2', 'instance-type', 'scale-up', 'scale-out', 'auto-scaling']} />
          <hr className="sep" />
          <button className="btn danger small" onClick={() => (edit((a) => (a.web = null)), setSheet(null))}>
            Webサーバーを外す
          </button>
        </Sheet>
      )}

      {sheet === 'alb' && (
        <Sheet title="ALB（ロードバランサー）" onClose={() => setSheet(null)}>
          <p>お客さんの通信を、後ろのWebサーバーに振り分けます。壊れたサーバーには送らないので、1台止まってもサイトは続きます。</p>
          <ul className="muted">
            <li>2つのAZのパブリックサブネットが必要</li>
            <li>門番で「ALBに80/443番をどこからでも」と「Webに80番をALBから」を許可</li>
            <li>月 {yen(3500)} くらい</li>
          </ul>
          <TermButtons ids={['alb', 'redundancy']} />
          <hr className="sep" />
          <button className="btn danger small" onClick={() => (edit((a) => ((a.alb = false), a.web && (a.web.autoScaling = false))), setSheet(null))}>
            ALBを外す
          </button>
        </Sheet>
      )}

      {sheet === 'db' && arch.db && (
        <Sheet title="データベース（RDS）" onClose={() => setSheet(null)}>
          <div className="field">
            <span className="lb">大きさ</span>
            <div className="seg">
              {DB_SIZES.map((t) => (
                <button key={t} aria-pressed={arch.db!.size === t} onClick={() => edit((a) => (a.db!.size = t))}>
                  {t.replace('db.', '')}
                  <br />
                  <small>
                    約{RDS_RPS[t]}件/秒・{yen(RDS_YEN[t])}/月
                  </small>
                </button>
              ))}
            </div>
          </div>
          <label className="toggle" style={{ opacity: can('multiaz') ? 1 : 0.4 }}>
            <span>
              マルチAZ{!can('multiaz') && ' 🔒'}
              <small>別のAZに予備を置き、止まったら自動で切り替え（料金ほぼ2倍）</small>
            </span>
            <input type="checkbox" disabled={!can('multiaz')} checked={arch.db.multiAz} onChange={(e) => edit((a) => (a.db!.multiAz = e.target.checked))} />
          </label>
          <div className="field">
            <span className="lb">自動バックアップ</span>
            <div className="seg">
              {[0, 1, 7, 14].map((d) => (
                <button key={d} aria-pressed={arch.db!.backupDays === d} onClick={() => edit((a) => (a.db!.backupDays = d))}>
                  {d === 0 ? 'なし' : `${d}日分`}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="lb">置くサブネット（2つのAZに必要）</span>
            <div className="seg">
              <button aria-pressed={arch.db.subnet === 'private'} onClick={() => edit((a) => (a.db!.subnet = 'private'))}>
                プライベート
              </button>
              <button aria-pressed={arch.db.subnet === 'public'} onClick={() => edit((a) => (a.db!.subnet = 'public'))}>
                パブリック
              </button>
            </div>
          </div>
          <TermButtons ids={['rds', 'multi-az', 'backup', 'subnet']} />
          <hr className="sep" />
          <button className="btn danger small" onClick={() => (edit((a) => (a.db = null)), setSheet(null))}>
            データベースを外す
          </button>
        </Sheet>
      )}

      {sheet === 's3' && arch.s3 && (
        <Sheet title="S3バケット" onClose={() => setSheet(null)}>
          <label className="toggle">
            <span>
              サイトのファイルを置く
              <small>HTML・画像をここから配る（静的サイト）</small>
            </span>
            <input type="checkbox" checked={arch.s3.website} onChange={(e) => edit((a) => (a.s3!.website = e.target.checked))} />
          </label>
          <label className="toggle">
            <span>
              パブリックアクセスブロック
              <small>うっかり世界中に公開されないようにする安全装置</small>
            </span>
            <input type="checkbox" checked={arch.s3.blockPublicAccess} onChange={(e) => edit((a) => (a.s3!.blockPublicAccess = e.target.checked))} />
          </label>
          <label className="toggle">
            <span>
              バージョニング
              <small>上書き・削除しても前の版を残しておく</small>
            </span>
            <input type="checkbox" checked={arch.s3.versioning} onChange={(e) => edit((a) => (a.s3!.versioning = e.target.checked))} />
          </label>
          <TermButtons ids={['s3', 'block-public-access', 'static-site']} />
          <hr className="sep" />
          <button className="btn danger small" onClick={() => (edit((a) => (a.s3 = null)), setSheet(null))}>
            S3を外す
          </button>
        </Sheet>
      )}

      {sheet === 'cf' && (
        <Sheet title="CloudFront" onClose={() => setSheet(null)}>
          <p>お客さんに近い拠点から返すので速く、元のサーバーへの負担も減ります（画像などは半分くらいCloudFrontが返す想定）。HTTPSにも対応できます。</p>
          <TermButtons ids={['cloudfront', 'cdn', 'cache']} />
          <hr className="sep" />
          <button className="btn danger small" onClick={() => (edit((a) => (a.cloudfront = false)), setSheet(null))}>
            CloudFrontを外す
          </button>
        </Sheet>
      )}

      {sheet === 'rules' && <RulesSheet arch={arch} edit={edit} onClose={() => setSheet(null)} readOnly={readOnly} />}

      {sheet === 'alarms' && (
        <Sheet title="CloudWatchアラーム" onClose={() => setSheet(null)}>
          <p className="muted">見張る数字を選びます（1つ月15円くらい）。構成にあるものだけ意味があります。</p>
          {(Object.keys(ALARM_INFO) as AlarmKind[]).map((k) => {
            const useful = wantedAlarms(arch).includes(k);
            return (
              <label className="toggle" key={k} style={{ opacity: useful ? 1 : 0.5 }}>
                <span>
                  {ALARM_INFO[k].name}
                  <small>
                    {ALARM_INFO[k].desc}
                    {!useful && '（いまの構成では見張る相手がいません）'}
                  </small>
                </span>
                <input type="checkbox" disabled={readOnly || !can('cloudwatch')} checked={arch.alarms.includes(k)} onChange={(e) => edit((a) => (a.alarms = e.target.checked ? [...a.alarms, k] : a.alarms.filter((x) => x !== k)))} />
              </label>
            );
          })}
          <TermButtons ids={['cloudwatch', 'monitoring', 'billing-alarm']} />
        </Sheet>
      )}
    </>
  );
}

function RulesSheet({ arch, edit, onClose, readOnly }: { arch: Architecture; edit: (f: (a: Architecture) => void) => void; onClose: () => void; readOnly?: boolean }) {
  const targets: RuleTarget[] = [...(arch.alb ? (['alb'] as const) : []), ...(arch.web ? (['web'] as const) : []), ...(arch.db ? (['db'] as const) : [])];
  const [target, setTarget] = useState<RuleTarget>(targets[0] ?? 'web');
  const [port, setPort] = useState<Port>(80);
  const [source, setSource] = useState<RuleSource>('anywhere');
  return (
    <Sheet title="門番（セキュリティグループ）" onClose={onClose}>
      <p className="muted">書いた通信だけが通れます。書いていない通信は全部止まります。</p>
      {arch.rules.length === 0 && <p>まだ何も許可していません（＝何も通れない状態）。</p>}
      <div className="stack">
        {arch.rules.map((r, i) => (
          <div key={i} className="panel" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10 }}>
            <span style={{ flex: 1, fontSize: 14 }}>
              <b>{TGT_LABEL[r.target]}</b> の {PORT_LABEL[r.port]} に<br />
              {r.source === 'anywhere' && r.port !== 80 && r.port !== 443 ? '⚠ ' : ''}
              {SRC_LABEL[r.source]}
            </span>
            {!readOnly && (
              <button className="btn ghost small" onClick={() => edit((a) => a.rules.splice(i, 1))}>
                消す
              </button>
            )}
          </div>
        ))}
      </div>
      {!readOnly && (
        <>
          <h3>許可を追加</h3>
          {targets.length === 0 ? (
            <p className="muted">先にWebサーバー・ALB・DBのどれかを置きましょう。</p>
          ) : (
            <>
              <div className="field">
                <span className="lb">どこの門番？</span>
                <div className="seg">
                  {targets.map((t) => (
                    <button key={t} aria-pressed={target === t} onClick={() => setTarget(t)}>
                      {TGT_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="lb">何番の窓口？</span>
                <div className="seg">
                  {([80, 443, 22, 3306] as Port[]).map((p) => (
                    <button key={p} aria-pressed={port === p} onClick={() => setPort(p)}>
                      {PORT_LABEL[p]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="lb">どこから？</span>
                <div className="seg">
                  {(['anywhere', 'office', 'alb', 'web'] as RuleSource[]).map((s) => (
                    <button key={s} aria-pressed={source === s} onClick={() => setSource(s)}>
                      {SRC_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
              <button className="btn" style={{ width: '100%' }} onClick={() => edit((a) => !a.rules.some((r) => r.target === target && r.port === port && r.source === source) && a.rules.push({ target: targets.includes(target) ? target : targets[0], port, source }))}>
                この許可を追加
              </button>
            </>
          )}
        </>
      )}
      <TermButtons ids={['security-group', 'port', 'least-privilege', 'ssh', 'https']} />
    </Sheet>
  );
}
