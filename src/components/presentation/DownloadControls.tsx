// F1: .pptx ダウンロード（FULL_IMAGE / SLIDE_IMAGE）
// 全ページの画像生成が成功していない限りダウンロードは行わせない（部分書き出しによる
// 「一部だけ画像なしのPPTが出力される」混乱を避けるための仕様判断）。

import { Notice } from '../common/Notice';

interface DownloadControlsProps {
  allDone: boolean;
  busy: boolean;
  onDownloadFullImage: () => void;
  onDownloadTemplate: () => void;
}

export function DownloadControls({ allDone, busy, onDownloadFullImage, onDownloadTemplate }: DownloadControlsProps) {
  return (
    <section className="card">
      <h2>PPT ダウンロード</h2>

      {!allDone && (
        <Notice kind="info" message="未生成のページがあります。すべてのページの画像生成後にダウンロードできます。" />
      )}

      <div className="btn-row">
        <button type="button" onClick={onDownloadFullImage} disabled={!allDone || busy}>
          PPTダウンロード（画像フル画面）
        </button>
        <button type="button" onClick={onDownloadTemplate} disabled={!allDone || busy}>
          PPTダウンロード（テンプレート差し込み）
        </button>
      </div>
    </section>
  );
}
