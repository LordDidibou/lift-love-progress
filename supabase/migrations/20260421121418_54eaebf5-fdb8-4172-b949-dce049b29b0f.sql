-- Ajouter une colonne image_url aux exercices
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS image_url text;

-- Bucket de stockage public pour les images d'exercices
INSERT INTO storage.buckets (id, name, public)
VALUES ('exercise-images', 'exercise-images', true)
ON CONFLICT (id) DO NOTHING;

-- Policies storage : lecture publique, écriture par utilisateurs connectés
DROP POLICY IF EXISTS "Public read exercise images" ON storage.objects;
CREATE POLICY "Public read exercise images"
ON storage.objects FOR SELECT
USING (bucket_id = 'exercise-images');

DROP POLICY IF EXISTS "Authenticated upload exercise images" ON storage.objects;
CREATE POLICY "Authenticated upload exercise images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'exercise-images');

DROP POLICY IF EXISTS "Authenticated update exercise images" ON storage.objects;
CREATE POLICY "Authenticated update exercise images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'exercise-images');

-- Permettre à tout utilisateur connecté de mettre à jour l'image_url des exercices (built-in et siens)
DROP POLICY IF EXISTS "Authenticated can set exercise image" ON public.exercises;
CREATE POLICY "Authenticated can set exercise image"
ON public.exercises FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);