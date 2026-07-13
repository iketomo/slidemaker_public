// SlideMaker Public: 設定画面 — 参考画像ライブラリ CRUD（docs/REQUIREMENTS.md §5）

import { useEffect, useState } from 'react';
import { useReferenceImages, getReferenceImageSignedUrl } from '../../hooks/useReferenceImages';
import { Notice } from '../common/Notice';

export function ReferenceImagesSection() {
  const { images, loading, error, upload, remove } = useReferenceImages();
  const [displayName, setDisplayName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      images.map(async (img) => [img.storage_path, await getReferenceImageSignedUrl(img.storage_path)] as const)
    ).then((entries) => {
      if (!cancelled) setThumbUrls(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [images]);

  const handleUpload = async () => {
    if (!file) return;
    setBusy(true);
    setActionError(null);
    try {
      await upload(file, displayName.trim() || file.name);
      setFile(null);
      setDisplayName('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'アップロードに失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id: string) => {
    const target = images.find((img) => img.id === id);
    if (!target) return;
    setActionError(null);
    try {
      await remove(target);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '削除に失敗しました');
    }
  };

  return (
    <section className="card">
      <h2>参考画像ライブラリ</h2>
      <p className="field-hint">プレゼン作成で画像生成時に参照させる画像を登録できます。</p>

      {error && <Notice kind="error" message={error} />}
      {actionError && <Notice kind="error" message={actionError} />}

      {loading ? (
        <div className="loading">読み込み中...</div>
      ) : images.length === 0 ? (
        <div className="empty-state">まだ参考画像がありません。</div>
      ) : (
        <div className="thumb-picker">
          {images.map((img) => (
            <div key={img.id}>
              <div className="thumb-picker__item">
                {thumbUrls[img.storage_path] && <img src={thumbUrls[img.storage_path]} alt={img.display_name} />}
              </div>
              <div className="thumb-picker__label">{img.display_name}</div>
              <button type="button" className="btn-sm btn-danger" onClick={() => void handleRemove(img.id)}>
                削除
              </button>
            </div>
          ))}
        </div>
      )}

      <fieldset>
        <legend>新規追加</legend>
        <div className="field">
          <label htmlFor="ref-file">画像ファイル</label>
          <input
            id="ref-file"
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="field">
          <label htmlFor="ref-name">表示名（任意）</label>
          <input
            id="ref-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <button type="button" onClick={() => void handleUpload()} disabled={busy || !file}>
          追加
        </button>
      </fieldset>
    </section>
  );
}
