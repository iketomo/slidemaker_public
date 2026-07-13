// SlideMaker Public: 画面内通知（エラー・情報・成功）
// docs/REQUIREMENTS.md のエラー表示要件（画面内通知、日本語）に対応する共通コンポーネント。

export type NoticeKind = 'error' | 'info' | 'success';

interface NoticeProps {
  kind: NoticeKind;
  message: string;
}

export function Notice({ kind, message }: NoticeProps) {
  return <div className={`notice notice-${kind}`}>{message}</div>;
}
