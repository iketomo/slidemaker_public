// SlideMaker Public: F2 入力フォーム（docs/REQUIREMENTS.md §6）

import { ASPECT_RATIO_OPTIONS, type AspectRatio, type ImageModel } from '../../types';
import { AttachmentPicker } from './AttachmentPicker';
import type { AttachmentItem } from './fileUtils';

interface InputFormProps {
  content: string;
  onContentChange: (value: string) => void;
  style: string;
  onStyleChange: (value: string) => void;
  url: string;
  onUrlChange: (value: string) => void;
  model: ImageModel;
  onModelChange: (value: ImageModel) => void;
  aspectRatio: AspectRatio;
  onAspectRatioChange: (value: AspectRatio) => void;
  count: number;
  onCountChange: (value: number) => void;
  maxCount: number;
  attachments: AttachmentItem[];
  onAddFiles: (files: FileList) => void;
  onRemoveAttachment: (id: string) => void;
  attachmentError?: string | null;
  onSubmit: () => void;
  generating: boolean;
  progressLabel?: string | null;
}

export function InputForm({
  content,
  onContentChange,
  style,
  onStyleChange,
  url,
  onUrlChange,
  model,
  onModelChange,
  aspectRatio,
  onAspectRatioChange,
  count,
  onCountChange,
  maxCount,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  attachmentError,
  onSubmit,
  generating,
  progressLabel,
}: InputFormProps) {
  return (
    <section className="card">
      <h2>入力</h2>

      <div className="field">
        <label htmlFor="free-content">画像の内容（必須）</label>
        <textarea
          id="free-content"
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder="生成したい画像の内容を入力してください"
        />
      </div>

      <div className="field">
        <label htmlFor="free-style">画像スタイル（任意）</label>
        <textarea
          id="free-style"
          value={style}
          onChange={(e) => onStyleChange(e.target.value)}
          placeholder="例: フラットイラスト、写実的、水彩画風 など"
        />
      </div>

      <div className="field">
        <label htmlFor="free-url">左下URL（任意）</label>
        <input
          type="url"
          id="free-url"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://example.com"
        />
      </div>

      <AttachmentPicker
        attachments={attachments}
        onAddFiles={onAddFiles}
        onRemove={onRemoveAttachment}
        error={attachmentError}
      />

      <div className="field-row">
        <div className="field">
          <label htmlFor="free-model">モデル</label>
          <select id="free-model" value={model} onChange={(e) => onModelChange(e.target.value as ImageModel)}>
            <option value="gpt-image-2">gpt-image-2（OpenAI）</option>
            <option value="nanobanana2">nanobanana2（Gemini）</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="free-aspect-ratio">アスペクト比</label>
          <select
            id="free-aspect-ratio"
            value={aspectRatio}
            onChange={(e) => onAspectRatioChange(e.target.value as AspectRatio)}
          >
            {ASPECT_RATIO_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}（{opt.description}）
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="free-count">枚数（最大{maxCount}枚）</label>
          <input
            type="number"
            id="free-count"
            min={1}
            max={maxCount}
            value={count}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isNaN(next)) return;
              onCountChange(Math.min(maxCount, Math.max(1, next)));
            }}
          />
        </div>
      </div>

      <div className="btn-row">
        <button type="button" className="btn-primary" onClick={onSubmit} disabled={generating || !content.trim()}>
          {generating ? '生成中...' : '生成する'}
        </button>
        {progressLabel && <span className="field-hint">{progressLabel}</span>}
      </div>
    </section>
  );
}
