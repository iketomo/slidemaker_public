// SlideMaker Public: ログイン後の共通レイアウト（ヘッダー + 各ページ）

import { Outlet } from 'react-router-dom';
import { Header } from './Header';

export function AppLayout() {
  return (
    <div>
      <Header />
      <Outlet />
    </div>
  );
}
