import { SAVE_VERSION, type GameState } from './game';

export const SAVE_KEY = 'it-engineer-sim:save';
const BACKUP_PREFIX = 'it-engineer-sim:broken:';

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/** 古い形のセーブを新しい形に直す。版を上げるたびにここへ足す */
export function migrate(raw: any): GameState {
  if (!raw || typeof raw !== 'object') throw new Error('セーブの中身がありません');
  if (typeof raw.version !== 'number') throw new Error('セーブの版がわかりません');
  if (raw.version > SAVE_VERSION) throw new Error('新しい版のゲームで作られたセーブです。ページを更新してください');
  const s = raw as GameState;
  // version 1 が最初の形
  if (!Array.isArray(s.tasks) || !Array.isArray(s.customers) || typeof s.day !== 'number') throw new Error('セーブの形がこわれています');
  s.daily ??= { lastDate: null, streak: 0, best: 0 };
  s.seenTerms ??= [];
  s.dailyCustomer ??= null;
  s.startedDay ??= s.day;
  return s;
}

export type LoadResult = { ok: true; state: GameState } | { ok: false; reason: 'empty' } | { ok: false; reason: 'broken'; message: string; backupKey: string };

/** 読めないセーブは消さずに別の場所へ退避する */
export function loadGame(storage: StorageLike): LoadResult {
  let text: string | null = null;
  try {
    text = storage.getItem(SAVE_KEY);
  } catch {
    return { ok: false, reason: 'empty' };
  }
  if (!text) return { ok: false, reason: 'empty' };
  try {
    return { ok: true, state: migrate(JSON.parse(text)) };
  } catch (e) {
    const backupKey = BACKUP_PREFIX + Date.now();
    try {
      storage.setItem(backupKey, text);
    } catch {
      /* 退避できなくても、元のセーブは消さない */
    }
    return { ok: false, reason: 'broken', message: (e as Error).message, backupKey };
  }
}

export function saveGame(storage: StorageLike, s: GameState): boolean {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function exportSave(s: GameState): string {
  return JSON.stringify({ app: 'it-engineer-sim', exportedAt: new Date().toISOString(), save: s }, null, 0);
}

export function importSave(text: string): GameState {
  let obj: any;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('ファイルを読めませんでした（JSONではありません）');
  }
  if (obj?.app !== 'it-engineer-sim' || !obj.save) throw new Error('このゲームのセーブファイルではありません');
  return migrate(obj.save);
}
