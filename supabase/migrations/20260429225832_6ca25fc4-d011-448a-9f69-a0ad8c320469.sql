-- Allow admins to delete visits and uploads
CREATE POLICY "Admins can delete visits"
ON public.visits FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete uploads"
ON public.uploads FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
