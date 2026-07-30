-- RLS de las tablas de identidad, ahora que ya existen los helpers de rol.
--
-- En 20260730090000 se crearon con políticas mínimas (cada uno ve lo suyo) porque los
-- helpers todavía no existían. Aquí se amplía la visibilidad al equipo interno y al
-- titular de una organización, que necesita ver a su propio equipo.
--
-- Con el interruptor `roles_activos` apagado, es_intern() devuelve true para cualquier
-- autenticado: el comportamiento es el de hoy.

-- ---------------------------------------------------------------------------
-- perfiles
-- ---------------------------------------------------------------------------
drop policy if exists "perfiles: propio" on perfiles;
create policy "perfiles: propi o intern"
  on perfiles for select to authenticated
  using (id = (select auth.uid()) or (select public.es_intern()));

-- La de UPDATE ("perfiles: edito el meu") sigue igual: cada uno edita el suyo, y el
-- GRANT por columnas impide tocar `activo`.

-- ---------------------------------------------------------------------------
-- usuario_roles
-- ---------------------------------------------------------------------------
drop policy if exists "roles: el meu" on usuario_roles;
create policy "roles: el meu o tots si intern"
  on usuario_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.es_intern()));

-- Sin políticas de escritura a propósito: tampoco hay GRANT. Los roles se otorgan
-- desde el servidor (service_role), nunca desde el navegador.

-- ---------------------------------------------------------------------------
-- membresias
-- ---------------------------------------------------------------------------
drop policy if exists "membresias: les meves" on membresias;
create policy "membresias: meves, de la meva organitzacio o intern"
  on membresias for select to authenticated
  using (
       user_id = (select auth.uid())
    or (select public.es_intern())
    -- El titular ve a su equipo: es lo que hace posible la pantalla «Equip».
    or productor_id in (select public.mis_productores())
    or entidad_id   in (select public.mis_entidades())
  );
