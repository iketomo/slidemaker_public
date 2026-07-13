// F1: ページ一覧編集（追加・削除・並べ替え + 各ページの編集委譲）

import { PageCard } from './PageCard';
import type { PageImageState, SlidePageData } from './types';

interface PageEditorProps {
  pages: SlidePageData[];
  imageStates: PageImageState[];
  onEditPage: (index: number, patch: Partial<SlidePageData>) => void;
  onDeletePage: (index: number) => void;
  onMovePage: (index: number, direction: 'up' | 'down') => void;
  onAddPage: () => void;
  onRegeneratePage: (index: number) => void;
  regeneratingIndex: number | null;
}

export function PageEditor({
  pages,
  imageStates,
  onEditPage,
  onDeletePage,
  onMovePage,
  onAddPage,
  onRegeneratePage,
  regeneratingIndex,
}: PageEditorProps) {
  return (
    <section className="card">
      <h2>ページ編集（{pages.length}ページ）</h2>

      <ul className="page-list">
        {pages.map((page, index) => (
          <PageCard
            key={index}
            page={page}
            index={index}
            total={pages.length}
            imageState={imageStates[index] ?? { status: 'idle' }}
            onChange={(patch) => onEditPage(index, patch)}
            onDelete={() => onDeletePage(index)}
            onMoveUp={() => onMovePage(index, 'up')}
            onMoveDown={() => onMovePage(index, 'down')}
            onRegenerate={() => onRegeneratePage(index)}
            regenerating={regeneratingIndex === index}
          />
        ))}
      </ul>

      <div className="btn-row">
        <button type="button" onClick={onAddPage}>
          + ページを追加
        </button>
      </div>
    </section>
  );
}
