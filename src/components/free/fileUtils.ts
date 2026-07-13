// SlideMaker Public: F2 添付参考画像（ブラウザ内のみ保持）の File → base64 変換ユーティリティ

export interface AttachmentItem {
  id: string;
  name: string;
  base64: string; // data: プレフィックス無し
  previewUrl: string; // <img> 表示用の data URL
}

export const fileToAttachment = (file: File): Promise<AttachmentItem> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('画像の読み込みに失敗しました'));
        return;
      }
      const base64 = result.split(',')[1] ?? '';
      resolve({ id: crypto.randomUUID(), name: file.name, base64, previewUrl: result });
    };
    reader.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    reader.readAsDataURL(file);
  });
};
