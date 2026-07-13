// SlideMaker Public: BYOK API キーストア
// docs/REQUIREMENTS.md §3.1/§3.2 準拠。
//
// - Gemini / OpenAI の API キーはこのブラウザにのみ保存し、サーバーには一切送らない
//   （OpenAI キーのみ、画像生成の中継時に Edge Function へ一時的に経由する。§4.2 参照）
// - 他のファイルからは localStorage / sessionStorage を直接触らず、必ずこのモジュール経由でアクセスする
// - キーの値を console.log しない

export type PersistMode = 'local' | 'session';

const GEMINI_KEY_STORAGE_KEY = 'slidemakerpublic.byok.gemini';
const OPENAI_KEY_STORAGE_KEY = 'slidemakerpublic.byok.openai';
const PERSIST_MODE_STORAGE_KEY = 'slidemakerpublic.byok.persist';

const isPersistMode = (value: string | null): value is PersistMode =>
  value === 'local' || value === 'session';

// persist モード自体は常に localStorage に置く（ブラウザを閉じても選択を覚えておくため）。
export const getPersistMode = (): PersistMode => {
  const stored = localStorage.getItem(PERSIST_MODE_STORAGE_KEY);
  return isPersistMode(stored) ? stored : 'local';
};

const getActiveStorage = (): Storage =>
  getPersistMode() === 'session' ? sessionStorage : localStorage;

const getKey = (storageKey: string): string | null => {
  const value = getActiveStorage().getItem(storageKey);
  return value && value.length > 0 ? value : null;
};

const setKey = (storageKey: string, key: string): void => {
  getActiveStorage().setItem(storageKey, key);
};

const clearKey = (storageKey: string): void => {
  // 保存モード切替の過渡期に片方のストレージへ残る可能性があるため、両方から消す。
  localStorage.removeItem(storageKey);
  sessionStorage.removeItem(storageKey);
};

export const getGeminiKey = (): string | null => getKey(GEMINI_KEY_STORAGE_KEY);
export const setGeminiKey = (key: string): void => setKey(GEMINI_KEY_STORAGE_KEY, key);
export const clearGeminiKey = (): void => clearKey(GEMINI_KEY_STORAGE_KEY);

export const getOpenAIKey = (): string | null => getKey(OPENAI_KEY_STORAGE_KEY);
export const setOpenAIKey = (key: string): void => setKey(OPENAI_KEY_STORAGE_KEY, key);
export const clearOpenAIKey = (): void => clearKey(OPENAI_KEY_STORAGE_KEY);

// 保存モードを切り替える。既存キーが古いストレージに取り残されて
// 「削除したはずのキーが別モードから読めてしまう」事態を防ぐため、
// 新モードのストレージへ値を引き継いでから旧モードのストレージを消す。
export const setPersistMode = (mode: PersistMode): void => {
  const currentGemini = getGeminiKey();
  const currentOpenAI = getOpenAIKey();

  localStorage.setItem(PERSIST_MODE_STORAGE_KEY, mode);

  const nextStorage = mode === 'session' ? sessionStorage : localStorage;
  if (currentGemini) nextStorage.setItem(GEMINI_KEY_STORAGE_KEY, currentGemini);
  if (currentOpenAI) nextStorage.setItem(OPENAI_KEY_STORAGE_KEY, currentOpenAI);

  const otherStorage = mode === 'session' ? localStorage : sessionStorage;
  otherStorage.removeItem(GEMINI_KEY_STORAGE_KEY);
  otherStorage.removeItem(OPENAI_KEY_STORAGE_KEY);
};
