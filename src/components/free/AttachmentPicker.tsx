// SlideMaker Public: F2 添付参考画像ピッカー（0〜10枚、ブラウザ内のみ保持）

import type { AttachmentItem } from './fileUtils';
import { Notice } from '../common/Notice';

interface AttachmentPickerProps {
  attachments: AttachmentItem[];
  onAddFiles: (files: FileList) => void;
  onRemove: (id: string) => void;
  error?: string | null;
}

export function AttachmentPicker({ attachments, onAddFiles, onRemove, error }: AttachmentPickerProps) {
  return (
    <div className="field">
      <label htmlFor="free-attachments">添付参考画像（最大10枚・ブラウザ内のみ保持）</label>
      <input
        id="free-attachments"
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onAddFiles(e.target.files);
          }
          e.target.value = '';
        }}
      />
      {error && <Notice kind="error" message={error} />}
      {attachments.length > 0 && (
        <div className="thumb-picker">
          {attachments.map((att) => (
            <div key={att.id}>
              <div className="thumb-picker__item">
                <img src={att.previewUrl} alt={att.name} />
              </div>
              <div className="thumb-picker__label">
                {att.name}
                <div>
                  <button type="button" className="btn-sm btn-danger" onClick={() => onRemove(att.id)}>
                    削除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
