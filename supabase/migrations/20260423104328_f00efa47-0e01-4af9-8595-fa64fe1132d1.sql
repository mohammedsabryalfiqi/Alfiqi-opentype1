
-- 1. App role enum + user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Admins can read user_roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Visits table
CREATE TABLE public.visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page text NOT NULL DEFAULT '/',
  ip text,
  country text DEFAULT 'غير معروف',
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert visits"
  ON public.visits FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can read visits"
  ON public.visits FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX visits_created_at_idx ON public.visits (created_at DESC);

-- 3. Uploads table
CREATE TABLE public.uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  font_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  features_count int NOT NULL DEFAULT 0,
  is_variable boolean NOT NULL DEFAULT false,
  axes_count int NOT NULL DEFAULT 0,
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert uploads"
  ON public.uploads FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can read uploads"
  ON public.uploads FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX uploads_created_at_idx ON public.uploads (created_at DESC);

-- 4. Stats counters (single row)
CREATE TABLE public.stats_counters (
  id int PRIMARY KEY DEFAULT 1,
  total_visits bigint NOT NULL DEFAULT 0,
  total_uploads bigint NOT NULL DEFAULT 0,
  total_downloads bigint NOT NULL DEFAULT 0,
  CONSTRAINT singleton CHECK (id = 1)
);

INSERT INTO public.stats_counters (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.stats_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read counters"
  ON public.stats_counters FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Atomic increment function callable by anyone
CREATE OR REPLACE FUNCTION public.bump_counter(_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _kind = 'visit' THEN
    UPDATE public.stats_counters SET total_visits = total_visits + 1 WHERE id = 1;
  ELSIF _kind = 'upload' THEN
    UPDATE public.stats_counters SET total_uploads = total_uploads + 1 WHERE id = 1;
  ELSIF _kind = 'download' THEN
    UPDATE public.stats_counters SET total_downloads = total_downloads + 1 WHERE id = 1;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_counter(text) TO anon, authenticated;

-- 5. Storage bucket for uploaded fonts (private — admin only)
INSERT INTO storage.buckets (id, name, public)
VALUES ('fonts', 'fonts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can upload fonts"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'fonts');

CREATE POLICY "Admins can read fonts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'fonts' AND public.has_role(auth.uid(), 'admin'));
