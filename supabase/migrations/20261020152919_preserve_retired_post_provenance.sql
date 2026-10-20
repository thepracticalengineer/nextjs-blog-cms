-- Keep retired AI provenance indefinitely even when its CMS post is deleted.
-- The provenance row, chat link and existing owner-only SELECT policies remain.
ALTER TABLE public.ai_generated_posts ALTER COLUMN post_id DROP NOT NULL;
ALTER TABLE public.ai_generated_posts DROP CONSTRAINT ai_generated_posts_post_id_fkey;
ALTER TABLE public.ai_generated_posts ADD CONSTRAINT ai_generated_posts_post_id_fkey
  FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE SET NULL;
