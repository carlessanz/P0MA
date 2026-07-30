-- Helpers de sesión y rol, más el interruptor que hace reversible todo el cambio.
--
-- POR QUÉ `security definer`: corren como su propietario (postgres), que es dueño de
-- perfiles/usuario_roles/membresias y por tanto NO está sujeto a su RLS. Eso permite
-- consultarlas DESDE una política sin recursión infinita (la política de `membresias`
-- puede llamar a mis_entidades(), que lee `membresias`).
--
-- ⚠️ NUNCA poner `alter table … force row level security` en esas tres tablas: forzaría
--    RLS también al propietario y estos helpers dejarían de funcionar, en silencio.
--
-- ⚠️ `create function` concede EXECUTE a PUBLIC por defecto. Se revoca al final: si no,
--    `anon` podría invocarlas.
--
-- EL INTERRUPTOR (`app_settings.roles_activos`, creado apagado en 20260730090000):
-- mientras esté apagado, es_intern()/pot_aprovar()/es_super_admin() devuelven true
-- para cualquier usuario autenticado, así que las políticas nuevas se comportan
-- exactamente como las permisivas de hoy. Es un **fail-open deliberado**, justo lo
-- contrario del fail-safe de `test_mode` (§8): allí la duda debe cortar el envío;
-- aquí la duda no debe dejar al equipo sin poder trabajar.

-- ---------------------------------------------------------------------------
-- Interruptor
-- ---------------------------------------------------------------------------
create or replace function public.roles_activos()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Solo un 'true' explícito enciende el modelo de roles.
  select coalesce((select value from app_settings where key = 'roles_activos'), 'false') = 'true';
$$;

-- ---------------------------------------------------------------------------
-- Roles de plataforma
-- ---------------------------------------------------------------------------
create or replace function public.es_intern()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not public.roles_activos()
      or exists (
           select 1
             from usuario_roles r
             join perfiles p on p.id = r.user_id
            where r.user_id = auth.uid()
              and p.activo
              and r.rol in ('super_admin', 'admin', 'tecnic'));
$$;

-- Aprobar una aceptación y convertirla en canalización, tocar las whitelists de test.
create or replace function public.pot_aprovar()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not public.roles_activos()
      or exists (
           select 1
             from usuario_roles r
             join perfiles p on p.id = r.user_id
            where r.user_id = auth.uid()
              and p.activo
              and r.rol in ('super_admin', 'admin'));
$$;

-- Apagar el modo test, borrar fichas: lo más sensible del sistema.
create or replace function public.es_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not public.roles_activos()
      or exists (
           select 1
             from usuario_roles r
             join perfiles p on p.id = r.user_id
            where r.user_id = auth.uid()
              and p.activo
              and r.rol = 'super_admin');
$$;

-- Rol más alto del usuario, para pintarlo en la interfaz (null si es externo).
create or replace function public.mi_rol()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.rol
    from usuario_roles r
    join perfiles p on p.id = r.user_id
   where r.user_id = auth.uid()
     and p.activo
   order by case r.rol when 'super_admin' then 1 when 'admin' then 2 else 3 end
   limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Organizaciones del usuario
-- ---------------------------------------------------------------------------
-- Devuelven `setof uuid` para usarlas como `x in (select public.mis_productores())`
-- dentro de las políticas. Estas NO llevan interruptor: son aditivas (dan acceso a lo
-- propio), nunca quitan nada.
create or replace function public.mis_productores()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.productor_id
    from membresias m
    join perfiles p on p.id = m.user_id
   where m.user_id = auth.uid()
     and m.activo
     and p.activo
     and m.productor_id is not null;
$$;

create or replace function public.mis_entidades()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.entidad_id
    from membresias m
    join perfiles p on p.id = m.user_id
   where m.user_id = auth.uid()
     and m.activo
     and p.activo
     and m.entidad_id is not null;
$$;

-- ¿Soy titular (no simple operador) de esta ficha? Decide quién edita los datos de la
-- organización y quién puede invitar a su equipo.
create or replace function public.soc_titular(p_tipo text, p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from membresias m
      join perfiles p on p.id = m.user_id
     where m.user_id = auth.uid()
       and m.activo
       and p.activo
       and m.rol_org = 'titular'
       and ((p_tipo = 'productor' and m.productor_id = p_org)
         or (p_tipo = 'entidad'   and m.entidad_id   = p_org)));
$$;

-- ---------------------------------------------------------------------------
-- Contexto de sesión: una sola llamada al entrar decide qué panel se pinta
-- ---------------------------------------------------------------------------
create or replace function public.get_my_session_context()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'user_id',        p.id,
    'email',          p.email,
    'nombre',         p.nombre,
    'idioma',         p.idioma,
    'activo',         p.activo,
    'rol',            public.mi_rol(),
    'roles_activos',  public.roles_activos(),
    -- coalesce porque mi_rol() es null en los usuarios externos, y `null in (…)`
    -- devolvería null: la interfaz espera booleanos, no nulos.
    'es_intern',      public.mi_rol() is not null,
    'pot_aprovar',    coalesce(public.mi_rol() in ('super_admin', 'admin'), false),
    'es_super_admin', coalesce(public.mi_rol() = 'super_admin', false),
    'vista_defecto',  coalesce(
        p.vista_defecto,
        case
          when public.mi_rol() is not null then 'intern'
          when exists (select 1 from membresias m
                        where m.user_id = p.id and m.activo and m.productor_id is not null)
            then 'productor'
          when exists (select 1 from membresias m
                        where m.user_id = p.id and m.activo and m.entidad_id is not null)
            then 'receptor'
        end),
    'organizaciones', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'tipo',          m.tipo,
                 'id',            coalesce(m.productor_id, m.entidad_id),
                 'nombre',        coalesce(pr.empresa, pr.name, en.nombre),
                 'rol_org',       m.rol_org,
                 'tipo_receptor', en.tipo_receptor,
                 'modalitat',     en.modalitat,
                 'poblacion',     coalesce(pr.poblacion, en.poblacion))
               order by m.tipo, m.created_at)
          from membresias m
          left join productores pr on pr.id = m.productor_id
          left join entidades   en on en.id = m.entidad_id
         where m.user_id = p.id and m.activo), '[]'::jsonb))
    from perfiles p
   where p.id = auth.uid();
$$;

-- OJO: `es_intern` y `pot_aprovar` del contexto se calculan con mi_rol(), NO con los
-- helpers homónimos. Los helpers llevan el fail-open del interruptor (lo necesitan las
-- políticas); la interfaz, en cambio, debe saber el rol REAL para decidir qué menú
-- pinta. Con el interruptor apagado, un usuario sin fila en usuario_roles sigue
-- pudiéndolo todo en la base, pero ve el panel que le corresponde.

-- ---------------------------------------------------------------------------
-- EXECUTE: quitar el PUBLIC por defecto y conceder lo justo
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'roles_activos()', 'es_intern()', 'pot_aprovar()', 'es_super_admin()', 'mi_rol()',
    'mis_productores()', 'mis_entidades()', 'soc_titular(text,uuid)',
    'get_my_session_context()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- NOTA DE RENDIMIENTO: en las políticas hay que envolver los helpers en un subselect
--   using ((select public.es_intern()) or …)
-- para que Postgres los evalúe UNA VEZ por consulta (InitPlan) y no una por fila. Con
-- 341 productores y listados sin paginar (deuda §12.5) la diferencia es notable.
