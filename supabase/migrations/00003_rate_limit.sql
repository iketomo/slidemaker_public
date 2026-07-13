-- SlideMaker Public: per-user レート制限の共有ストア
--
-- 背景: Edge Function の in-memory レート制限は実行インスタンス単位でしか効かず、
-- 実環境（インスタンスがリクエストごとに分散）では機能しないことが実射で確認された。
-- Postgres を共有ストアとして、security definer 関数で判定・記録する方式に変更する。
--
-- セキュリティ設計:
-- - イベントテーブルは RLS 有効・ポリシーなし（クライアントから直接は読み書き不可）
-- - 判定関数は security definer（テーブル所有者権限で RLS を経由せずアクセス）
-- - user_id は引数で受け取らず関数内で auth.uid() から取得（偽装不可）
-- - authenticated ロールにのみ execute を付与

create table slidemakerpublic_rate_limit_events (
  user_id uuid not null,
  operation text not null,
  created_at timestamptz not null default now()
);
create index on slidemakerpublic_rate_limit_events (user_id, operation, created_at);

alter table slidemakerpublic_rate_limit_events enable row level security;
-- ポリシーは意図的に作らない（security definer 関数経由のみ）

create or replace function slidemakerpublic_check_rate_limit(op text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  lim int;
  win constant interval := interval '60 seconds';
  cnt int;
  oldest timestamptz;
begin
  if uid is null then
    return jsonb_build_object('allowed', false, 'retry_after', 60);
  end if;

  if op = 'generate' then
    lim := 10;
  elsif op = 'edit' then
    lim := 5;
  else
    return jsonb_build_object('allowed', false, 'retry_after', 60);
  end if;

  -- 期限切れイベントの日和見掃除（テーブルを小さく保つ。分間数十件規模なので十分軽い）
  delete from public.slidemakerpublic_rate_limit_events
  where created_at < now() - win;

  select count(*), min(created_at)
  into cnt, oldest
  from public.slidemakerpublic_rate_limit_events
  where user_id = uid and operation = op and created_at > now() - win;

  if cnt >= lim then
    return jsonb_build_object(
      'allowed', false,
      'retry_after', greatest(1, ceil(extract(epoch from (oldest + win - now())))::int)
    );
  end if;

  insert into public.slidemakerpublic_rate_limit_events (user_id, operation)
  values (uid, op);

  return jsonb_build_object('allowed', true, 'retry_after', 0);
end;
$$;

revoke all on function slidemakerpublic_check_rate_limit(text) from public;
grant execute on function slidemakerpublic_check_rate_limit(text) to authenticated;
