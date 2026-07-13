// F1: 画像一括生成の実行ボタン + 進捗表示

interface GenerationControlsProps {
  onGenerate: () => void;
  generating: boolean;
  completedCount: number;
  pageCount: number;
}

export function GenerationControls({ onGenerate, generating, completedCount, pageCount }: GenerationControlsProps) {
  return (
    <section className="card">
      <h2>画像生成</h2>
      <div className="btn-row">
        <button type="button" className="btn-primary" onClick={onGenerate} disabled={generating || pageCount === 0}>
          {generating ? '生成中...' : '画像を生成'}
        </button>
        {generating && (
          <span className="field-hint">
            {completedCount}/{pageCount} 完了
          </span>
        )}
      </div>
    </section>
  );
}
