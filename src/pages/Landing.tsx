// SlideMaker Public: ランディングページ（未ログイン時に見える唯一の画面）
// docs/REQUIREMENTS.md §8: Google OAuth ログインボタンのみを提供する。

import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Notice } from '../components/common/Notice';

function Landing() {
  const { session, loading, signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  if (!loading && session) {
    return <Navigate to="/app/presentation" replace />;
  }

  const handleSignIn = async () => {
    setError(null);
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました');
      setSigningIn(false);
    }
  };

  return (
    <main className="container landing-hero">
      <h1>SlideMaker Public</h1>
      <p>
        自分の Gemini / OpenAI API キー（BYOK）でスライド資料を作成したり、自由に画像を生成できるツールです。
        API キーはこのブラウザにのみ保存され、サーバーには保存されません。
      </p>

      {error && <Notice kind="error" message={error} />}

      <button type="button" className="btn-primary" onClick={() => void handleSignIn()} disabled={signingIn}>
        {signingIn ? 'ログイン中...' : 'Google でログイン'}
      </button>
    </main>
  );
}

export default Landing;
