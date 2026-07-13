// F1: 入力フォーム（元テキスト・ページ数・デザイン要望・参考画像・アスペクト比・モデル）

import { ASPECT_RATIO_OPTIONS, type AspectRatio, type ImageModel } from '../../types';
import type { ReferenceImageRecord } from '../../hooks/useReferenceImages';
import { DesignTemplatePicker } from './DesignTemplatePicker';
import { ReferenceImagePicker } from './ReferenceImagePicker';

interface InputFormProps {
  sourceText: string;
  onSourceTextChange: (value: string) => void;
  pageCountHint: string;
  onPageCountHintChange: (value: string) => void;
  designRequests: string;
  onDesignRequestsChange: (value: string) => void;
  aspectRatio: AspectRatio;
  onAspectRatioChange: (value: AspectRatio) => void;
  model: ImageModel;
  onModelChange: (value: ImageModel) => void;
  referenceImages: ReferenceImageRecord[];
  referenceImagesLoading: boolean;
  selectedReferenceImageIds: string[];
  onToggleReferenceImage: (id: string) => void;
  isSpreadsheet: boolean;
  spreadsheetPageCount: number;
  onParseTsv: () => void;
  onSuggestStructure: () => void;
  structureLoading: boolean;
}

export function InputForm({
  sourceText,
  onSourceTextChange,
  pageCountHint,
  onPageCountHintChange,
  designRequests,
  onDesignRequestsChange,
  aspectRatio,
  onAspectRatioChange,
  model,
  onModelChange,
  referenceImages,
  referenceImagesLoading,
  selectedReferenceImageIds,
  onToggleReferenceImage,
  isSpreadsheet,
  spreadsheetPageCount,
  onParseTsv,
  onSuggestStructure,
  structureLoading,
}: InputFormProps) {
  return (
    <section className="card">
      <h2>入力</h2>

      <div className="field">
        <label htmlFor="source-text">元テキスト（必須）</label>
        <textarea
          id="source-text"
          value={sourceText}
          onChange={(e) => onSourceTextChange(e.target.value)}
          placeholder="スライドにしたい内容を入力するか、スプレッドシートからタブ区切りで貼り付けてください"
          rows={8}
        />
        {isSpreadsheet && (
          <p className="field-hint">
            スプレッドシート形式のデータを検出しました（{spreadsheetPageCount}ページ相当）。
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="page-count">ページ数の希望（任意）</label>
        <input
          id="page-count"
          type="number"
          min={1}
          value={pageCountHint}
          onChange={(e) => onPageCountHintChange(e.target.value)}
          placeholder="未指定の場合は8ページ目安でAIが提案します"
        />
      </div>

      <div className="btn-row">
        {isSpreadsheet && (
          <button type="button" onClick={onParseTsv}>
            スプレッドシート貼り付けとして直接ページ化する
          </button>
        )}
        <button
          type="button"
          className="btn-primary"
          onClick={onSuggestStructure}
          disabled={structureLoading || !sourceText.trim()}
        >
          {structureLoading ? '構成を提案中...' : '構成を提案してもらう'}
        </button>
      </div>
      <p className="field-hint">構成提案には Gemini API キーが必要です（画像生成のモデル選択とは独立です）。</p>

      <div className="field">
        <label htmlFor="design-requests">デザイン要望（任意）</label>
        <textarea
          id="design-requests"
          value={designRequests}
          onChange={(e) => onDesignRequestsChange(e.target.value)}
          placeholder="例: 白背景で落ち着いたトーン、フラットデザイン、企業ロゴは使わない など"
          rows={3}
        />
        <DesignTemplatePicker onSelect={onDesignRequestsChange} />
      </div>

      <div className="field">
        <label>参考画像（任意・複数選択可）</label>
        <ReferenceImagePicker
          images={referenceImages}
          loading={referenceImagesLoading}
          selectedIds={selectedReferenceImageIds}
          onToggle={onToggleReferenceImage}
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="aspect-ratio">アスペクト比</label>
          <select
            id="aspect-ratio"
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
          <label htmlFor="model">画像生成モデル</label>
          <select id="model" value={model} onChange={(e) => onModelChange(e.target.value as ImageModel)}>
            <option value="gpt-image-2">gpt-image-2（OpenAI）</option>
            <option value="nanobanana2">nanobanana2（Gemini）</option>
          </select>
        </div>
      </div>
    </section>
  );
}
