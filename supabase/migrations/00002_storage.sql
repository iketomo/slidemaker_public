-- SlideMaker Public: Storage buckets + RLS
-- 対象: docs/REQUIREMENTS.md §2.3, docs/DECISIONS.md Q1
-- 全バケットはプライベート（public = false）。公開 URL は使わず、
-- 認証付き download() / 署名付き URL（短寿命）のみでアクセスする想定。
-- パス構造は各バケットとも先頭セグメントが auth.uid() であることを
-- storage.foldername(name) で検証する own-folder パターンに統一する。

insert into storage.buckets (id, name, public)
values
  ('slidemakerpublic-pptx-templates', 'slidemakerpublic-pptx-templates', false),
  ('slidemakerpublic-reference-images', 'slidemakerpublic-reference-images', false),
  ('slidemakerpublic-generated-images', 'slidemakerpublic-generated-images', false);

-- ============================================================
-- slidemakerpublic-pptx-templates
-- パス構造: {userId}/template.pptx
-- ============================================================

create policy "slidemakerpublic_pptx_templates_own_folder_all" on storage.objects
  for all using (
    bucket_id = 'slidemakerpublic-pptx-templates'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'slidemakerpublic-pptx-templates'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- slidemakerpublic-reference-images
-- パス構造: {userId}/{referenceImageId}.{ext}
-- ============================================================

create policy "slidemakerpublic_reference_images_own_folder_all" on storage.objects
  for all using (
    bucket_id = 'slidemakerpublic-reference-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'slidemakerpublic-reference-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- slidemakerpublic-generated-images（docs/DECISIONS.md Q1 で追加）
-- パス構造: {userId}/{generationId}/{index}.png
-- ============================================================

create policy "slidemakerpublic_generated_images_own_folder_all" on storage.objects
  for all using (
    bucket_id = 'slidemakerpublic-generated-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'slidemakerpublic-generated-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
