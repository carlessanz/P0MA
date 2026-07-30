-- RESTAURACIÓN DE EMERGENCIA DE LAS POLÍTICAS RLS
--
-- ⚠️ Este fichero vive FUERA de supabase/migrations/ a propósito: `supabase db push`
-- no lo aplica nunca. Es el paracaídas, no parte del historial.
--
-- Cuándo usarlo: si tras endurecer la RLS el equipo se queda sin datos (listados
-- vacíos, toasts con 42501, «new row violates row-level security policy» al
-- canalizar) y el Nivel 0 no ha bastado.
--
--   NIVEL 0 (10 segundos, pruébalo SIEMPRE primero):
--     update app_settings set value = 'false' where key = 'roles_activos';
--
--   Todas las políticas nuevas empiezan por `not app.roles_activos() or …`, así que
--   apagar el interruptor las devuelve al comportamiento permisivo sin desplegar
--   nada y sin cerrar ninguna sesión.
--
--   NIVEL 1 (2 minutos): este fichero. Borra las políticas nuevas y recrea las
--   permisivas tal como estaban en 20260721160000, 20260722140000, 20260723100000,
--   20260723120000, 20260723140000, 20260722120000/150000 y 20260724100000.
--
-- Pégalo entero en el SQL Editor de Supabase (o `psql -f`). Es idempotente.
-- Después, deja el repo coherente con una migración inversa: NUNCA se edita una
-- migración ya aplicada (AGENTS.md §7).

begin;

-- ---------------------------------------------------------------------------
-- 0. Interruptor abajo (por si se llega aquí sin haber probado el Nivel 0)
-- ---------------------------------------------------------------------------
update app_settings set value = 'false', updated_at = now() where key = 'roles_activos';

-- ---------------------------------------------------------------------------
-- 1. Fuera las políticas por rol
-- ---------------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and (policyname like 'productores: %'    or policyname like 'entidades: %'
         or policyname like 'ubicaciones: %'    or policyname like 'wa_contacts: %'
         or policyname like 'wa_messages: %'    or policyname like 'intake_sessions: %'
         or policyname like 'meta_test: %'      or policyname like 'email_test: %'
         or policyname like 'app_settings: %'   or policyname like 'excedentes: %'
         or policyname like 'canalizaciones: %' or policyname like 'respuestas: %'
         or policyname like 'perfiles: %'       or policyname like 'roles: %'
         or policyname like 'membresias: %')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- El trigger que impide aprobar sin rol también estorba si el modelo está roto.
drop trigger if exists respuestas_control_aprovacio on oferta_respuestas;

-- ---------------------------------------------------------------------------
-- 2. Recrear las políticas permisivas originales
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tablas text[] := array[
    'wa_contacts', 'wa_messages', 'productores', 'productor_ubicaciones',
    'entidades', 'excedentes', 'canalizaciones', 'intake_sessions',
    'productos', 'causas', 'factores_conversion'
  ];
begin
  foreach t in array tablas loop
    execute format('drop policy if exists "authenticated puede leer" on %I', t);
    execute format(
      'create policy "authenticated puede leer" on %I for select to authenticated
         using (true)', t);
  end loop;
end $$;

-- Mensajería (20260721160000 + 20260723120000)
drop policy if exists "authenticated puede crear contactos" on wa_contacts;
create policy "authenticated puede crear contactos"
  on wa_contacts for insert to authenticated with check (true);
drop policy if exists "authenticated puede actualizar contactos" on wa_contacts;
create policy "authenticated puede actualizar contactos"
  on wa_contacts for update to authenticated using (true) with check (true);
drop policy if exists "authenticated puede borrar contactos" on wa_contacts;
create policy "authenticated puede borrar contactos"
  on wa_contacts for delete to authenticated using (true);
drop policy if exists "authenticated puede borrar mensajes" on wa_messages;
create policy "authenticated puede borrar mensajes"
  on wa_messages for delete to authenticated using (true);

-- CRUD de productores y entidades (20260722140000)
drop policy if exists "authenticated crea productores" on productores;
create policy "authenticated crea productores"
  on productores for insert to authenticated with check (true);
drop policy if exists "authenticated edita productores" on productores;
create policy "authenticated edita productores"
  on productores for update to authenticated using (true) with check (true);
drop policy if exists "authenticated borra productores" on productores;
create policy "authenticated borra productores"
  on productores for delete to authenticated using (true);

drop policy if exists "authenticated crea entidades" on entidades;
create policy "authenticated crea entidades"
  on entidades for insert to authenticated with check (true);
drop policy if exists "authenticated edita entidades" on entidades;
create policy "authenticated edita entidades"
  on entidades for update to authenticated using (true) with check (true);
drop policy if exists "authenticated borra entidades" on entidades;
create policy "authenticated borra entidades"
  on entidades for delete to authenticated using (true);

-- Canalizaciones y excedentes (20260724100000)
drop policy if exists "authenticated gestiona canalizaciones" on canalizaciones;
create policy "authenticated gestiona canalizaciones"
  on canalizaciones for all to authenticated using (true) with check (true);
drop policy if exists "authenticated actualitza excedentes" on excedentes;
create policy "authenticated actualitza excedentes"
  on excedentes for update to authenticated using (true) with check (true);

-- Respuestas a ofertas (20260723100000)
drop policy if exists "authenticated gestiona oferta_respuestas" on oferta_respuestas;
create policy "authenticated gestiona oferta_respuestas"
  on oferta_respuestas for all to authenticated using (true) with check (true);

-- Configuración y whitelists (20260723140000, 20260722120000, 20260722150000)
drop policy if exists "authenticated gestiona app_settings" on app_settings;
create policy "authenticated gestiona app_settings"
  on app_settings for all to authenticated using (true) with check (true);
drop policy if exists "authenticated gestiona meta_test_recipients" on meta_test_recipients;
create policy "authenticated gestiona meta_test_recipients"
  on meta_test_recipients for all to authenticated using (true) with check (true);
drop policy if exists "authenticated gestiona email_test_recipients" on email_test_recipients;
create policy "authenticated gestiona email_test_recipients"
  on email_test_recipients for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 3. GRANTs que las políticas necesitan (por si se revocó alguno)
-- ---------------------------------------------------------------------------
grant select on all tables in schema public to authenticated;
grant insert, update, delete on productores, entidades to authenticated;
grant insert, update, delete on canalizaciones, oferta_respuestas to authenticated;
grant insert, update, delete on wa_contacts to authenticated;
grant delete on wa_messages to authenticated;
grant update on excedentes to authenticated;
grant select, insert, update on app_settings to authenticated;
grant select, insert, delete on meta_test_recipients, email_test_recipients to authenticated;
-- app_config sigue siendo SOLO service_role: aquí no se toca a propósito (§9).
revoke all on app_config from authenticated, anon;

commit;

-- Comprobación rápida tras aplicarlo (debe devolver filas):
--   select count(*) from productores;
--   select count(*) from entidades;
