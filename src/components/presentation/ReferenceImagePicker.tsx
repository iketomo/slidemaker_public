// F1: 参考画像ライブラリからの複数選択ピッカー

import { useEffect, useState } from 'react';
import { getReferenceImageSignedUrl, type ReferenceImageRecord } from '../../hooks/useReferenceImages';

interface ReferenceImagePickerProps {
  images: ReferenceImageRecord[];
  loading: boolean;
  selectedIds: string[];
  onToggle: (id: string) => void;
}

export function ReferenceImagePicker({ images, loading, selectedIds, onToggle }: ReferenceImagePickerProps) {
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

  if (loading) return <p className="field-hint">参考画像を読み込み中...</p>;
  if (images.length === 0) {
    return <p className="field-hint">参考画像ライブラリは空です（設定画面で追加できます）。</p>;
  }

  return (
    <div className="thumb-picker">
      {images.map((img) => {
        const selected = selectedIds.includes(img.id);
        return (
          <div key={img.id}>
            <div
              className={`thumb-picker__item${selected ? ' selected' : ''}`}
              onClick={() => onToggle(img.id)}
              role="button"
              tabIndex={0}
            >
              {thumbUrls[img.storage_path] && <img src={thumbUrls[img.storage_path]} alt={img.display_name} />}
            </div>
            <div className="thumb-picker__label">{img.display_name}</div>
          </div>
        );
      })}
    </div>
  );
}
