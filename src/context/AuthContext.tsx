// SlideMaker Public: 認証コンテキスト
// docs/REQUIREMENTS.md §8 準拠。
// - Google OAuth のみ（docs/DECISIONS.md Q2）
// - セッション状態は supabase.auth.onAuthStateChange で追跡する
// - 初回ログイン時に slidemakerpublic_user_settings を default 値で upsert する
//   （on conflict do nothing 相当。ignoreDuplicates: true）

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ensureUserSettingsRow = async (userId: string): Promise<void> => {
  // 失敗してもログイン自体はブロックしない（設定画面・各機能側で改めて取得を試みる）。
  await supabase
    .from('slidemakerpublic_user_settings')
    .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const ensuredUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      setLoading(false);
      if (data.session?.user) {
        ensuredUserIdRef.current = data.session.user.id;
        void ensureUserSettingsRow(data.session.user.id);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);
      setLoading(false);

      const userId = nextSession?.user?.id ?? null;
      if (userId && ensuredUserIdRef.current !== userId) {
        ensuredUserIdRef.current = userId;
        void ensureUserSettingsRow(userId);
      }
      if (!userId) {
        ensuredUserIdRef.current = null;
      }
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async (): Promise<void> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  };

  const signOut = async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    signInWithGoogle,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth は AuthProvider の内側で使用してください');
  }
  return ctx;
}
