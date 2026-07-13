// SlideMaker Public: 設定画面 — 上下カットpx・デフォルトモデル・デフォルトアスペクト比
// docs/REQUIREMENTS.md §5「per-user 設定」

import { useEffect, useState } from 'react';
import { ASPECT_RATIO_OPTIONS, type AspectRatio, type ImageModel } from '../../types';
import { Notice } from '../common/Notice';
import type { UserSettings, UserSettingsPatch } from '../../hooks/useUserSettings';

interface DefaultsSectionProps {
  settings: UserSettings | null;
  onUpdate: (patch: UserSettingsPatch) => Promise<UserSettings>;
}

export function DefaultsSection({ settings, onUpdate }: DefaultsSectionProps) {
  const [cropTop, setCropTop] = useState(0);
  const [cropBottom, setCropBottom] = useState(0);
  const [model, setModel] = useState<ImageModel>('gpt-image-2');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setCropTop(settings.crop_top_px);
    setCropBottom(settings.crop_bottom_px);
    setModel(settings.default_model);
    setAspectRatio(settings.default_aspect_ratio);
  }, [settings]);

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await onUpdate({
        crop_top_px: cropTop,
        crop_bottom_px: cropBottom,
        default_model: model,
        default_aspect_ratio: aspectRatio,
      });
      setNotice('保存しました。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>生成のデフォルト設定</h2>

      {error && <Notice kind="error" message={error} />}
      {notice && <Notice kind="success" message={notice} />}

      <div className="field-row">
        <div className="field">
          <label htmlFor="default-model">デフォルトモデル</label>
          <select id="default-model" value={model} onChange={(e) => setModel(e.target.value as ImageModel)}>
            <option value="gpt-image-2">gpt-image-2（OpenAI）</option>
            <option value="nanobanana2">nanobanana2（Gemini）</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="default-aspect-ratio">デフォルトアスペクト比</label>
          <select
            id="default-aspect-ratio"
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
          >
            {ASPECT_RATIO_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}（{opt.description}）
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="crop-top">上カット（px）</label>
          <input
            type="number"
            id="crop-top"
            min={0}
            value={cropTop}
            onChange={(e) => setCropTop(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="crop-bottom">下カット（px）</label>
          <input
            type="number"
            id="crop-bottom"
            min={0}
            value={cropBottom}
            onChange={(e) => setCropBottom(Number(e.target.value))}
          />
        </div>
      </div>

      <button type="button" className="btn-primary" onClick={() => void handleSave()} disabled={busy || !settings}>
        保存
      </button>
    </section>
  );
}
