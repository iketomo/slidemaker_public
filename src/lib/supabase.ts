// SlideMaker Public: Supabase クライアント
// docs/REQUIREMENTS.md §1 / §9.1 準拠。
// URL / anon key はビルド時環境変数（Vercel の env）から注入し、リポジトリには含めない
// （.env.example にプレースホルダのみ）。

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が設定されていません。.env.example を参考に .env を作成してください。'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
