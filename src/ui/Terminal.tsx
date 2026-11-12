import { useEffect, useRef } from 'react';
import type { Command } from '../engine/incidents';

export function Terminal({ commands, ran, onRun, host = 'cloudshell' }: { commands: Command[]; ran: string[]; onRun: (id: string) => void; host?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [ran.length]);
  const done = ran.map((id) => commands.find((c) => c.id === id)).filter(Boolean) as Command[];
  return (
    <div>
      <div className="terminal" ref={box} aria-live="polite">
        <div className="out" style={{ color: '#8a97bd' }}>
          {`[${host}]$ # 下のコマンドをタップすると実行されます`}
        </div>
        {done.map((c) => (
          <div key={c.id}>
            <div>
              <span className="prompt">[{host}]$</span> {c.cmd}
            </div>
            <div className="out">{c.output}</div>
          </div>
        ))}
      </div>
      <div className="cmdchips">
        {commands.map((c) => (
          <button key={c.id} className={`cmdchip ${ran.includes(c.id) ? 'ran' : ''}`} onClick={() => onRun(c.id)}>
            $ {c.cmd}
            <small>
              {ran.includes(c.id) ? '✓ 実行済み｜' : ''}
              {c.explain}
            </small>
          </button>
        ))}
      </div>
    </div>
  );
}
