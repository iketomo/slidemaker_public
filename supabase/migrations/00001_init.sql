-- SlideMaker Public: initial schema
-- 対象: docs/REQUIREMENTS.md §2.1 / §2.2, docs/DECISIONS.md Q1
-- 方針: 全テーブルで RLS を有効化し、テーブル作成と同一マイグレーション内に
--       own-row ポリシー（select/insert/update/delete）を定義する（RLS 無し期間を作らない）。
--       anon ロール向けポリシーは作らない（未ログインは一切アクセス不可）。

-- ============================================================
-- 1. slidemakerpublic_user_settings（1ユーザー1行）
-- ============================================================

create table slidemakerpublic_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  crop_top_px int not null default 78,
  crop_bottom_px int not null default 36,
  pptx_template_path text,             -- Storage 内パス。null ならデフォルトテンプレ（public/defaults/template.pptx）
  default_model text not null default 'gpt-image-2',  -- 'nanobanana2' | 'gpt-image-2'
  default_aspect_ratio text not null default '16:9',
  updated_at timestamptz not null default now()
);

alter table slidemakerpublic_user_settings enable row level security;

create policy "own_row_select" on slidemakerpublic_user_settings
  for select using (auth.uid() = user_id);
create policy "own_row_insert" on slidemakerpublic_user_settings
  for insert with check (auth.uid() = user_id);
create policy "own_row_update" on slidemakerpublic_user_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_row_delete" on slidemakerpublic_user_settings
  for delete using (auth.uid() = user_id);

-- ============================================================
-- 2. slidemakerpublic_design_templates（F1: デザイン要望テンプレート）
-- ============================================================

create table slidemakerpublic_design_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  content text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index on slidemakerpublic_design_templates (user_id);

alter table slidemakerpublic_design_templates enable row level security;

create policy "own_row_select" on slidemakerpublic_design_templates
  for select using (auth.uid() = user_id);
create policy "own_row_insert" on slidemakerpublic_design_templates
  for insert with check (auth.uid() = user_id);
create policy "own_row_update" on slidemakerpublic_design_templates
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_row_delete" on slidemakerpublic_design_templates
  for delete using (auth.uid() = user_id);

-- ============================================================
-- 3. slidemakerpublic_reference_images（F1: per-user 参考画像ライブラリ）
-- ============================================================

create table slidemakerpublic_reference_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  storage_path text not null,
  mime_type text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index on slidemakerpublic_reference_images (user_id, sort_order);

alter table slidemakerpublic_reference_images enable row level security;

create policy "own_row_select" on slidemakerpublic_reference_images
  for select using (auth.uid() = user_id);
create policy "own_row_insert" on slidemakerpublic_reference_images
  for insert with check (auth.uid() = user_id);
create policy "own_row_update" on slidemakerpublic_reference_images
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_row_delete" on slidemakerpublic_reference_images
  for delete using (auth.uid() = user_id);

-- ============================================================
-- 4. slidemakerpublic_generations（F1/F2: 生成履歴メタ + 生成画像）
-- ============================================================
-- docs/DECISIONS.md Q1: v1 から生成画像本体を Supabase Storage に保存する方針に変更。
-- images 列には以下の要素を持つ配列を格納する（バケット: slidemakerpublic-generated-images）:
--   {
--     "storage_path": "{userId}/{generationId}/{index}.png",
--     "mime_type": "image/png",
--     "width": 1024,
--     "height": 1024,
--     "model": "gpt-image-2"
--   }

create table slidemakerpublic_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null check (feature in ('presentation', 'free')),
  input_text text,
  metadata jsonb not null default '{}',   -- ページ構成、モデル、AR、推定コスト等
  images jsonb not null default '[]',     -- 生成画像メタの配列（構造は上記コメント参照）
  created_at timestamptz not null default now()
);
create index on slidemakerpublic_generations (user_id, created_at desc);

alter table slidemakerpublic_generations enable row level security;

create policy "own_row_select" on slidemakerpublic_generations
  for select using (auth.uid() = user_id);
create policy "own_row_insert" on slidemakerpublic_generations
  for insert with check (auth.uid() = user_id);
create policy "own_row_update" on slidemakerpublic_generations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_row_delete" on slidemakerpublic_generations
  for delete using (auth.uid() = user_id);
