// SlideMaker Public: F2 自由生成の直近履歴パネル（localStorage、docs/REQUIREMENTS.md §6）

import type { FreeGenHistoryEntry } from './historyStorage';

interface HistoryPanelProps {
  entries: FreeGenHistoryEntry[];
  onSelect: (entry: FreeGenHistoryEntry) => void;
}

const formatDateTime = (ts: number): string =>
  new Date(ts).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });

const truncate = (text: string, max = 30): string => (text.length > max ? `${text.slice(0, max)}...` : text);

export function HistoryPanel({ entries, onSelect }: HistoryPanelProps) {
  if (entries.length === 0) {
    return (
      <section className="card">
        <h2>直近の履歴</h2>
        <div className="empty-state">まだ履歴がありません。</div>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>直近の履歴（最大20件）</h2>
      <p className="field-hint">クリックすると入力内容を復元します（このブラウザ内にのみ保存されています）。</p>
      <div className="history-list">
        {entries.map((entry) => (
          <div key={entry.id} className="history-row" onClick={() => onSelect(entry)}>
            <div>{truncate(entry.content || entry.prompt)}</div>
            <div className="history-row__meta">
              {formatDateTime(entry.timestamp)} ・ {entry.imageCount}枚 ・ {entry.model}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
