// SlideMaker Public: ログインガード（docs/REQUIREMENTS.md §8）
// セッション無しなら "/" へリダイレクトする。

import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export function RequireAuth() {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="loading">読み込み中...</div>;
  }

  if (!session) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
