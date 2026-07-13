// SlideMaker Public: ヘッダー（ユーザー表示 + ログアウト + ナビ）
// docs/REQUIREMENTS.md §8「ヘッダにユーザー表示 + ログアウトボタン」に対応。

import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export function Header() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : undefined);

  return (
    <header className="app-header">
      <NavLink to="/app/presentation" className="app-header__brand">
        SlideMaker Public
      </NavLink>

      <nav className="app-nav">
        <NavLink to="/app/presentation" className={navClass}>
          プレゼン作成
        </NavLink>
        <NavLink to="/app/free" className={navClass}>
          自由に生成
        </NavLink>
        <NavLink to="/app/history" className={navClass}>
          履歴
        </NavLink>
        <NavLink to="/app/settings" className={navClass}>
          設定
        </NavLink>
      </nav>

      <div className="app-header__user">
        {user?.email && <span>{user.email}</span>}
        <button type="button" className="btn-sm" onClick={() => void handleSignOut()}>
          ログアウト
        </button>
      </div>
    </header>
  );
}
