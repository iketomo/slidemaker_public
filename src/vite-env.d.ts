/// <reference types="vite/client" />

// Vite の `?raw` クエリインポート（src/prompts/*.md?raw）用の型宣言。
// vite/client には汎用の `*?raw` 宣言が無いため、拡張子ごとに明示する。
declare module '*.md?raw' {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
