-- Retirer la policy permissive : l'update de l'image se fera côté serveur (edge function avec service role)
DROP POLICY IF EXISTS "Authenticated can set exercise image" ON public.exercises;