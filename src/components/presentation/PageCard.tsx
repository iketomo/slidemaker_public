// F1: ページ編集カード（タイトル・本文・視覚化・強調・トーン + 画像プレビュー + 個別再生成）

import { Notice } from '../common/Notice';
import type { PageImageState, SlidePageData } from './types';

interface PageCardProps {
  page: SlidePageData;
  index: number;
  total: number;
  imageState: PageImageState;
  onChange: (patch: Partial<SlidePageData>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRegenerate: () => void;
  regenerating: boolean;
}

export function PageCard({
  page,
  index,
  total,
  imageState,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  onRegenerate,
  regenerating,
}: PageCardProps) {
  return (
    <li className="page-card">
      <div className="page-card__head">
        <span className="page-card__number">ページ {page.pageNumber}</span>
        <div className="btn-row">
          <button type="button" className="btn-sm" onClick={onMoveUp} disabled={index === 0}>
            ↑
          </button>
          <button type="button" className="btn-sm" onClick={onMoveDown} disabled={index === total - 1}>
            ↓
          </button>
          <button type="button" className="btn-sm btn-danger" onClick={onDelete}>
            削除
          </button>
        </div>
      </div>

      <div className="field">
        <label>タイトル</label>
        <input type="text" value={page.title} onChange={(e) => onChange({ title: e.target.value })} />
      </div>

      <div className="field">
        <label>本文</label>
        <textarea value={page.content} onChange={(e) => onChange({ content: e.target.value })} rows={3} />
      </div>

      <div className="field-row">
        <div className="field">
          <label>視覚化の方向性</label>
          <input
            type="text"
            value={page.visualSuggestion}
            onChange={(e) => onChange({ visualSuggestion: e.target.value })}
          />
        </div>
        <div className="field">
          <label>強調ポイント</label>
          <input type="text" value={page.emphasis} onChange={(e) => onChange({ emphasis: e.target.value })} />
        </div>
        <div className="field">
          <label>トーン</label>
          <input type="text" value={page.tone} onChange={(e) => onChange({ tone: e.target.value })} />
        </div>
      </div>

      {imageState.status === 'done' && imageState.base64Image && (
        <img
          className="page-image-preview"
          src={`data:image/png;base64,${imageState.base64Image}`}
          alt={`${page.title} の生成画像`}
        />
      )}
      {imageState.status === 'error' && <Notice kind="error" message={imageState.error ?? '画像生成に失敗しました'} />}
      {imageState.status === 'generating' && <p className="field-hint">画像を生成中...</p>}

      <div className="btn-row">
        <button type="button" className="btn-sm" onClick={onRegenerate} disabled={regenerating}>
          {regenerating ? '再生成中...' : 'このページだけ再生成'}
        </button>
      </div>
    </li>
  );
}
