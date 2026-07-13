// SlideMaker Public: 履歴ページ（docs/DECISIONS.md Q1、docs/REQUIREMENTS.md §11）
// slidemakerpublic_generations を新しい順に一覧し、選択した生成の画像を署名付きURLで表示する。

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Notice } from '../components/common/Notice';
import { GenerationImageGrid } from '../components/history/GenerationImageGrid';
import type { GeneratedImageMeta } from '../lib/storage/generatedImages';

interface GenerationRow {
  id: string;
  feature: 'presentation' | 'free';
  input_text: string | null;
  images: GeneratedImageMeta[];
  created_at: string;
}

const FEATURE_LABEL: Record<GenerationRow['feature'], string> = {
  presentation: 'プレゼン資料',
  free: '自由生成',
};

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });

const truncate = (text: string | null, max = 40): string => {
  if (!text) return '（入力テキストなし）';
  return text.length > max ? `${text.slice(0, max)}...` : text;
};

function HistoryPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<GenerationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: selectError } = await supabase
        .from('slidemakerpublic_generations')
        .select('id, feature, input_text, images, created_at')
        .order('created_at', { ascending: false });
      if (selectError) throw selectError;
      setRows((data ?? []) as GenerationRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '履歴の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selectedRow = rows.find((row) => row.id === selectedId) ?? null;

  return (
    <main className="container-wide">
      <h1 className="section-title">履歴</h1>
      <p className="section-desc">これまでに生成した画像の一覧です。クリックすると詳細を表示します。</p>

      {error && <Notice kind="error" message={error} />}

      {loading ? (
        <div className="loading">読み込み中...</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">まだ生成履歴がありません。</div>
      ) : (
        <div className="history-list">
          {rows.map((row) => (
            <div
              key={row.id}
              className={`history-row${selectedId === row.id ? ' active' : ''}`}
              onClick={() => setSelectedId(selectedId === row.id ? null : row.id)}
            >
              <div>
                <strong>{FEATURE_LABEL[row.feature]}</strong> — {truncate(row.input_text)}
              </div>
              <div className="history-row__meta">
                {formatDateTime(row.created_at)} ・ {row.images.length}枚
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedRow && (
        <div className="card history-detail">
          <h2>
            {FEATURE_LABEL[selectedRow.feature]} — {formatDateTime(selectedRow.created_at)}
          </h2>
          <GenerationImageGrid generationId={selectedRow.id} images={selectedRow.images} />
        </div>
      )}
    </main>
  );
}

export default HistoryPage;
