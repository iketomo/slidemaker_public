// SlideMaker Public: 履歴詳細 — 選択した生成の画像を署名付きURLで表示・ダウンロード
// docs/REQUIREMENTS.md §11「選択で getSignedUrlForGeneratedImage による画像表示・ダウンロード」

import { useEffect, useState } from 'react';
import { getSignedUrlForGeneratedImage } from '../../lib/storage/generatedImages';
import type { GeneratedImageMeta } from '../../lib/storage/generatedImages';
import { Notice } from '../common/Notice';

interface GenerationImageGridProps {
  generationId: string;
  images: GeneratedImageMeta[];
}

interface ResolvedImage {
  meta: GeneratedImageMeta;
  url: string;
}

export function GenerationImageGrid({ generationId, images }: GenerationImageGridProps) {
  const [resolved, setResolved] = useState<ResolvedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all(
      images.map(async (meta) => ({ meta, url: await getSignedUrlForGeneratedImage(meta.storage_path) }))
    )
      .then((results) => {
        if (!cancelled) setResolved(results);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '画像の取得に失敗しました');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [generationId, images]);

  if (loading) return <div className="loading">画像を読み込み中...</div>;
  if (error) return <Notice kind="error" message={error} />;

  return (
    <div className="image-grid">
      {resolved.map(({ meta, url }, index) => (
        <div className="image-card" key={meta.storage_path}>
          <img src={url} alt={`生成画像 ${index + 1}`} />
          <div className="btn-row">
            <a className="btn btn-sm" href={url} download={`${generationId}_${index + 1}.png`}>
              ダウンロード
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
