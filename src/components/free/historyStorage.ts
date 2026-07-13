// SlideMaker Public: F2 自由生成の localStorage 履歴（docs/REQUIREMENTS.md §6「履歴」）
// FreeGenerationHistoryItem（src/types.ts）を満たすフィールドに加え、フォーム復元に必要な
// content/style を保持するリッチな形（superset）で保存する。src/types.ts は他ワークストリーム
// の所有物のため変更していない — 本来は FreeGenerationHistoryItem に content/style を
// 追加するのが自然という提案のみ、最終報告に記載する。

import type { AspectRatio, ImageModel } from '../../types';

const STORAGE_KEY = 'slidemakerpublic.freegen.history';
const MAX_ENTRIES = 20;

export interface FreeGenHistoryEntry {
  id: string;
  timestamp: number;
  content: string;
  style: string;
  prompt: string; // buildFreeMergedPrompt() 適用後のプロンプト（FreeGenerationHistoryItem.prompt 相当）
  url?: string;
  imageCount: number;
  aspectRatio: AspectRatio;
  model: ImageModel;
  attachedImages: string[]; // base64（data: プレフィックス無し）
}

export const loadFreeGenHistory = (): FreeGenHistoryEntry[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FreeGenHistoryEntry[]) : [];
  } catch {
    return [];
  }
};

const writeHistory = (items: FreeGenHistoryEntry[]): boolean => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
};

/**
 * 新しい履歴エントリを先頭に追加し、直近20件までに切り詰めて保存する。
 * 容量超過（QuotaExceededError等）の場合は attachedImages を全エントリから落として再試行する。
 * それでも失敗する場合は保存を諦め、直前のメモリ上の一覧を返す（UIをブロックしない）。
 */
export const saveFreeGenHistoryEntry = (entry: FreeGenHistoryEntry): FreeGenHistoryEntry[] => {
  const existing = loadFreeGenHistory();
  const next = [entry, ...existing].slice(0, MAX_ENTRIES);

  if (writeHistory(next)) {
    return next;
  }

  const stripped = next.map((item) => ({ ...item, attachedImages: [] }));
  if (writeHistory(stripped)) {
    return stripped;
  }

  return existing;
};
