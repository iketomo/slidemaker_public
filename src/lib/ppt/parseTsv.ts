// SlideMaker Public: TSV/CSV パーサー & スプレッドシート → ページ変換
// 移植元プロジェクトの App.tsx:
//   - parseTsvRecords (line 129-190)
//   - detectSpreadsheetPageCount (line 194-212)
//   - parseSpreadsheetToPages (line 218-247)
// F1 でスプレッドシートからのタブ区切り貼り付けを検知した場合、
// AI を呼ばずにクライアント側だけでページ構成に変換するために使う
// （docs/DECISIONS.md「追加決定: 分割モードは廃止」後もこの入力経路は維持）。

import type { PresentationPage } from '../../types';

/**
 * TSV/CSVパーサー: ダブルクォート内の改行を正しく処理する。
 */
export const parseTsvRecords = (input: string): string[][] => {
  const records: string[][] = [];
  let currentRecord: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const char = input[i];
    const nextChar = input[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i += 2;
      } else if (char === '"') {
        inQuotes = false;
        i++;
      } else {
        currentField += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === '\t') {
        currentRecord.push(currentField);
        currentField = '';
        i++;
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRecord.push(currentField);
        if (currentRecord.some((f) => f.trim())) {
          records.push(currentRecord);
        }
        currentRecord = [];
        currentField = '';
        i += char === '\r' && nextChar === '\n' ? 2 : 1;
      } else if (char === '\r') {
        currentRecord.push(currentField);
        if (currentRecord.some((f) => f.trim())) {
          records.push(currentRecord);
        }
        currentRecord = [];
        currentField = '';
        i++;
      } else {
        currentField += char;
        i++;
      }
    }
  }

  if (currentField || currentRecord.length > 0) {
    currentRecord.push(currentField);
    if (currentRecord.some((f) => f.trim())) {
      records.push(currentRecord);
    }
  }

  return records;
};

/**
 * スプレッドシートからコピペした内容を検出し、ページ数を自動カウントする。
 * 形式: タブ区切り、1行目がヘッダー、2行目以降がスライドデータ。
 */
export const detectSpreadsheetPageCount = (
  text: string
): { isSpreadsheet: boolean; pageCount: number } => {
  if (!text.trim()) {
    return { isSpreadsheet: false, pageCount: 0 };
  }

  // タブが含まれていなければスプレッドシートではない
  if (!text.includes('\t')) {
    return { isSpreadsheet: false, pageCount: 0 };
  }

  const records = parseTsvRecords(text);

  // 2行以上あればスプレッドシート形式と判定（1行目がヘッダー、2行目以降がデータ）
  if (records.length >= 2) {
    return { isSpreadsheet: true, pageCount: records.length - 1 };
  }

  return { isSpreadsheet: false, pageCount: 0 };
};

/**
 * スプレッドシート形式のテキストをPresentationPage[]に直接変換する（ルールベース、AIなし）。
 * 形式: タブ区切り、1行目がヘッダー（スキップ）、2行目以降が「タイトル\tコンテンツ」。
 * セル内に改行がある場合はダブルクォートで囲まれる。
 * 分割のみモードでは visualSuggestion/emphasis/tone は空（プロンプトに含めない）。
 */
export const parseSpreadsheetToPages = (text: string): PresentationPage[] => {
  if (!text.trim()) {
    return [];
  }

  const records = parseTsvRecords(text);

  // 最低2行（ヘッダー + 1データ行）必要
  if (records.length < 2) {
    return [];
  }

  // 1行目はヘッダーなのでスキップ、2行目以降をパース
  const dataRecords = records.slice(1);

  return dataRecords.map((record, index) => {
    const title = record[0]?.trim() || `ページ ${index + 1}`;
    const content = record.slice(1).join('\n').trim() || '';

    return {
      pageNumber: index + 1,
      title: title.substring(0, 50), // タイトルは50文字以内
      content,
      visualSuggestion: '',
      emphasis: '',
      tone: '',
    };
  });
};
