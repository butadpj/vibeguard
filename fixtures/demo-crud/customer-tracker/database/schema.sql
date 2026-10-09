-- Public, synthetic-only local demo credentials. No production connection.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'customer_demo_anon') THEN
    CREATE ROLE customer_demo_anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'customer_demo_api') THEN
    CREATE ROLE customer_demo_api LOGIN NOINHERIT PASSWORD 'synthetic-demo-api';
  END IF;
END $$;
GRANT customer_demo_anon TO customer_demo_api;
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  email text NOT NULL CHECK (length(email) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT USAGE ON SCHEMA public TO customer_demo_anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO customer_demo_anon;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS synthetic_demo_access ON public.customers;
CREATE POLICY synthetic_demo_access ON public.customers FOR ALL TO customer_demo_anon USING (true) WITH CHECK (true);
INSERT INTO public.customers (id, name, email) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Alex Example', 'alex@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'Sam Sample', 'sam@example.test')
ON CONFLICT (id) DO NOTHING;
NOTIFY pgrst, 'reload schema';
