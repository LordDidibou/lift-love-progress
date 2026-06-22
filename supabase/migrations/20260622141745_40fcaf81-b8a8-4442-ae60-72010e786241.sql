
-- 1. Lock down SECURITY DEFINER / trigger functions so they're not directly callable via Data API
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- 2. Public bucket listing (exercise-images): remove broad SELECT policy that allowed listing via API.
-- Public CDN reads continue to work because the bucket is marked public.
DROP POLICY IF EXISTS "Public read exercise images" ON storage.objects;

-- 3. exercise-images: restrict INSERT/UPDATE to authenticated users uploading under their own user-id folder
DROP POLICY IF EXISTS "Authenticated upload exercise images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update exercise images" ON storage.objects;

CREATE POLICY "Users upload own exercise images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'exercise-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users update own exercise images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'exercise-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'exercise-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users delete own exercise images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'exercise-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- 4. Avatars bucket: add an explicit owner-scoped SELECT policy so the listing API
-- only returns the caller's own avatars. Public CDN fetches by URL continue to work
-- because the bucket is marked public.
CREATE POLICY "Users list own avatar"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
