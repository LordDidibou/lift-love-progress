-- Empêche le listing global tout en gardant l'accès direct par URL publique CDN
DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Public read exercise-images" ON storage.objects;
DROP POLICY IF EXISTS "Exercise images are publicly accessible" ON storage.objects;