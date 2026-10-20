BEGIN;
CREATE TABLE public.article_reactions (
 post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 reaction text NOT NULL CHECK (reaction IN ('love','unicorn','mind_blown','celebrate','fire')),
 PRIMARY KEY (post_id,user_id,reaction)
);
CREATE INDEX article_reactions_user_idx ON public.article_reactions(user_id);
ALTER TABLE public.article_reactions ENABLE ROW LEVEL SECURITY;
-- Aggregate/own-selection RPCs are the only client access. No reactor lists.
REVOKE ALL ON public.article_reactions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.article_reactions TO service_role;

CREATE TABLE auth_private.article_reaction_budgets (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 window_start timestamptz NOT NULL,
 changes integer NOT NULL
);
ALTER TABLE auth_private.article_reaction_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON auth_private.article_reaction_budgets FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_article_reactions(p_post_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT jsonb_build_object(
  'counts',jsonb_build_object(
   'love',count(*) FILTER (WHERE r.reaction='love'),
   'unicorn',count(*) FILTER (WHERE r.reaction='unicorn'),
   'mind_blown',count(*) FILTER (WHERE r.reaction='mind_blown'),
   'celebrate',count(*) FILTER (WHERE r.reaction='celebrate'),
   'fire',count(*) FILTER (WHERE r.reaction='fire')),
  'selections',coalesce(jsonb_agg(r.reaction ORDER BY r.reaction) FILTER (
   WHERE r.user_id=(SELECT auth.uid()) AND (SELECT auth_private.has_required_assurance())), '[]'::jsonb))
 FROM public.posts p LEFT JOIN public.article_reactions r ON r.post_id=p.id
 WHERE p.id=p_post_id AND p.status='published'
 GROUP BY p.id
$$;
REVOKE ALL ON FUNCTION public.get_article_reactions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_article_reactions(uuid) TO anon, authenticated;

-- Explicit desired state for ONE type. Repeating set/remove is a no-op.
-- Caller identity is derived from the JWT, never a client-supplied user ID.
CREATE FUNCTION public.set_article_reaction(p_post_id uuid, p_reaction text, p_selected boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); previous boolean; used integer;
BEGIN
 IF actor IS NULL OR NOT auth_private.has_required_assurance()
   OR NOT EXISTS (SELECT FROM public.profiles WHERE id=actor) THEN
  RAISE EXCEPTION 'REACTION_AUTH_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF p_reaction IS NULL OR p_reaction NOT IN ('love','unicorn','mind_blown','celebrate','fire') OR p_selected IS NULL THEN
  RAISE EXCEPTION 'REACTION_INVALID' USING ERRCODE='23514';
 END IF;
 -- Serialize with unpublication/deletion; consistent parent-before-child order.
 PERFORM 1 FROM public.posts WHERE id=p_post_id AND status='published' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'REACTION_UNAVAILABLE' USING ERRCODE='P0002'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('article-reactions:' || actor::text,0));
 SELECT EXISTS(SELECT FROM public.article_reactions WHERE post_id=p_post_id AND user_id=actor AND reaction=p_reaction) INTO previous;
 IF previous IS DISTINCT FROM p_selected THEN
  INSERT INTO auth_private.article_reaction_budgets AS b(user_id,window_start,changes)
  VALUES(actor,clock_timestamp(),1)
  ON CONFLICT(user_id) DO UPDATE SET
   window_start=CASE WHEN b.window_start <= clock_timestamp()-interval '1 minute' THEN clock_timestamp() ELSE b.window_start END,
   changes=CASE WHEN b.window_start <= clock_timestamp()-interval '1 minute' THEN 1 ELSE b.changes+1 END
  RETURNING changes INTO used;
  IF used>30 THEN RAISE EXCEPTION 'REACTION_RATE_LIMIT' USING ERRCODE='P0001'; END IF;
  IF p_selected THEN
   INSERT INTO public.article_reactions(post_id,user_id,reaction) VALUES(p_post_id,actor,p_reaction) ON CONFLICT DO NOTHING;
  ELSE
   DELETE FROM public.article_reactions WHERE post_id=p_post_id AND user_id=actor AND reaction=p_reaction;
  END IF;
 END IF;
 RETURN public.get_article_reactions(p_post_id);
END $$;
REVOKE ALL ON FUNCTION public.set_article_reaction(uuid,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_article_reaction(uuid,text,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
