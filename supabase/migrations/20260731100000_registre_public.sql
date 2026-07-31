-- Registro público self-service: una persona se da de alta sola y el equipo la valida.
--
-- Hasta hoy dar de alta a alguien era trabajo manual (scripts/crear-usuario.ts + la
-- membresía escrita con la service key), así que la puerta de entrada al servicio era
-- una conversación con el equipo. Esto abre el alta desde la web SIN abrir el acceso:
-- la cuenta se crea, la ficha se crea, y todo queda esperando a que alguien del equipo
-- lo apruebe. Mientras tanto la persona no ve absolutamente nada, porque los helpers de
-- rol (mis_productores/mis_entidades, 20260730092000) filtran por `membresias.activo`.
--
-- POR QUÉ UN EJE NUEVO Y NO `activo`: hoy `activo = false` tendría que significar dos
-- cosas a la vez —«todavía no validada» y «desactivada por el equipo»— y ni la persona
-- ni la cola de aprobación podrían distinguirlas: la primera debe ver «estem revisant la
-- teva sol·licitud» y salir en la cola; la segunda no debe reaparecer en la cola nunca.
-- Se separan en dos columnas, exactamente como ya se hizo en `oferta_respuestas`
-- (20260723130000), donde `estado` es la respuesta de la entidad y `aprovacio` la
-- decisión del equipo. Mismo vocabulario a propósito: pendent/aprovada/rebutjada.
--
-- TABLA DE ESTADOS (los cuatro que existen, y no hay más):
--   pendent   + activo = false   registro esperando validación
--   rebutjada + activo = false   registro rechazado, con su motivo (es auditoría)
--   aprovada  + activo = true    membresía normal, la de siempre
--   aprovada  + activo = false   membresía desactivada por el equipo
-- El check de abajo hace imposible el quinto estado: no aprobada pero activa.
--
-- NO hacen falta GRANT ni políticas nuevas. La política de lectura de `membresias`
-- (20260730094000) no filtra por `activo`, así que quien espera validación ya puede leer
-- su propia fila y el equipo interno las ve todas; y `authenticated` no tiene ningún
-- GRANT de escritura sobre la tabla, así que la única forma de mover el eje de
-- aprobación son las dos RPC de más abajo.

-- ---------------------------------------------------------------------------
-- 1. Eje de aprobación en membresias
-- ---------------------------------------------------------------------------
alter table membresias
  add column if not exists aprovacio       text not null default 'aprovada',
  add column if not exists aprovat_at      timestamptz,
  add column if not exists aprovat_per     uuid references auth.users(id) on delete set null,
  add column if not exists motiu_aprovacio text;

-- Checks separados e idempotentes, por si alguna columna ya existía (mismo patrón que
-- 20260723130000). El default 'aprovada' es lo que mantiene válidas las filas que ya
-- hay —equipo y usuarios de prueba—: eran altas hechas a mano, o sea aprobadas por
-- definición, y el segundo check ni las mira porque solo exige algo a las NO aprobadas.
alter table membresias drop constraint if exists membresias_aprovacio_check;
alter table membresias add constraint membresias_aprovacio_check
  check (aprovacio in ('pendent', 'aprovada', 'rebutjada'));

alter table membresias drop constraint if exists membresias_aprovacio_activo_check;
alter table membresias add constraint membresias_aprovacio_activo_check
  check (aprovacio = 'aprovada' or activo = false);

-- La cola de aprobaciones se lee en orden de llegada y es una fracción minúscula de la
-- tabla: índice parcial, no índice entero.
create index if not exists membresias_pendents_idx
  on membresias (created_at) where aprovacio = 'pendent';

-- ---------------------------------------------------------------------------
-- 2. RPC de validación (la superficie de escritura del eje de aprobación)
-- ---------------------------------------------------------------------------
-- Mismo patrón que aprovar_resposta() (20260730097000): comprueban el permiso ellas
-- mismas, bloquean la fila con `for update` para que dos personas del equipo no
-- resuelvan el mismo registro a la vez, y exigen que siga `pendent` (lo ya resuelto no
-- se toca).
create or replace function public.aprovar_registre(p_membresia uuid)
returns membresias
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  m membresias;
begin
  if not public.pot_aprovar() then
    raise exception 'Nomes admin o super_admin poden validar un registre' using errcode = '42501';
  end if;

  select * into m from membresias where id = p_membresia for update;
  if m.id is null or m.aprovacio <> 'pendent' then
    raise exception 'Aquest registre no es pot aprovar' using errcode = '22023';
  end if;

  update membresias
     set activo          = true,
         aprovacio       = 'aprovada',
         aprovat_at      = now(),
         aprovat_per     = auth.uid(),
         motiu_aprovacio = null
   where id = m.id
  returning * into m;
  return m;
end;
$$;

-- Rechazar NO BORRA NADA, a propósito: queda la auditoría de quién rechazó y cuándo, y
-- la persona puede ver el motivo al entrar. La limpieza de verdad es el borrado manual
-- de la ficha por el super_admin, que ya cascadea sobre `membresias`
-- (20260730090000: `references productores(id) on delete cascade`).
create or replace function public.rebutjar_registre(p_membresia uuid, p_motiu text default null)
returns membresias
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  m membresias;
begin
  if not public.pot_aprovar() then
    raise exception 'Nomes admin o super_admin poden validar un registre' using errcode = '42501';
  end if;

  select * into m from membresias where id = p_membresia for update;
  if m.id is null or m.aprovacio <> 'pendent' then
    raise exception 'Aquest registre no es pot rebutjar' using errcode = '22023';
  end if;

  update membresias
     set activo          = false,
         aprovacio       = 'rebutjada',
         aprovat_at      = now(),
         aprovat_per     = auth.uid(),
         motiu_aprovacio = p_motiu
   where id = m.id
  returning * into m;
  return m;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Cinturón y tirantes: el eje de aprobación solo lo mueve quien puede aprobar
-- ---------------------------------------------------------------------------
-- Espejo de respuestas_control_aprovacio (20260730096000). Hoy `authenticated` ni
-- siquiera tiene GRANT de UPDATE sobre `membresias`, así que esto no protege de nada
-- que sea alcanzable: protege del día en que alguien conceda ese GRANT para permitir,
-- pongamos, que un titular cambie el `rol_org` de su equipo. Ese día `activo` y
-- `aprovacio` seguirán cerrados sin que nadie tenga que acordarse.
create or replace function trg_membresias_control_aprovacio()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Los flujos del servidor (Edge Functions, scripts) corren con service_role:
  -- auth.uid() es null y pasan de largo, como debe ser.
  if auth.uid() is null then
    return new;
  end if;
  if (new.activo    is distinct from old.activo
   or new.aprovacio is distinct from old.aprovacio)
     and not public.pot_aprovar() then
    raise exception 'Nomes admin o super_admin poden validar un registre'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists membresias_control_aprovacio on membresias;
create trigger membresias_control_aprovacio
  before update on membresias
  for each row execute function trg_membresias_control_aprovacio();

-- ---------------------------------------------------------------------------
-- 4. get_my_session_context(): dos claves nuevas, nada más
-- ---------------------------------------------------------------------------
-- Se recrea entera porque es `language sql` y no admite parches. El cuerpo es el de
-- 20260730092000 letra por letra, más `registre_pendent` y `registre_rebutjat`. Sin
-- ellas la interfaz no sabría distinguir a quien espera validación de quien
-- simplemente no tiene ninguna organización: los dos llegan con `organizaciones = []`
-- y `vista_defecto` null, porque la membresía pendiente es `activo = false`.
--
-- ⚠️ `parallel restricted` va explícito: `create or replace` reescribe TODOS los
--    atributos, y sin él la función volvería a PARALLEL UNSAFE, deshaciendo en
--    silencio 20260731080000.
create or replace function public.get_my_session_context()
returns jsonb
language sql
stable
parallel restricted
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
    -- Registro público (20260731100000).
    'registre_pendent', exists (
        select 1 from membresias m
         where m.user_id = p.id and m.aprovacio = 'pendent'),
    -- Rechazado SOLO si no le queda ninguna membresía activa: quien ya trabaja con una
    -- organización y ve rechazada el alta de una segunda no debe quedarse fuera.
    'registre_rebutjat', exists (
        select 1 from membresias m
         where m.user_id = p.id and m.aprovacio = 'rebutjada')
      and not exists (
        select 1 from membresias m
         where m.user_id = p.id and m.activo),
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

-- ---------------------------------------------------------------------------
-- EXECUTE: quitar el PUBLIC por defecto y conceder lo justo
-- ---------------------------------------------------------------------------
-- `create or replace` conserva los privilegios de una función que ya existía, pero se
-- reafirman igual: si un día alguien la borra y la vuelve a crear, `create function`
-- concede EXECUTE a PUBLIC otra vez.
do $$
declare
  f text;
begin
  foreach f in array array[
    'aprovar_registre(uuid)',
    'rebutjar_registre(uuid,text)',
    'get_my_session_context()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime: la cola de aprobaciones se refresca sola
-- ---------------------------------------------------------------------------
-- Igual que `oferta_respuestas`: el equipo tiene la pantalla abierta y un alta nueva
-- debe aparecer sin recargar. La replica identity por defecto solo publica la clave
-- primaria en los DELETE (deuda §12.24), así que no se filtra nada por ahí.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname    = 'supabase_realtime'
       and schemaname = 'public'
       and tablename  = 'membresias'
  ) then
    alter publication supabase_realtime add table membresias;
  end if;
exception
  when duplicate_object then null;   -- carrera con otro despliegue: ya estaba
end $$;

-- Verificación:
--   select aprovacio, activo, count(*) from membresias group by 1, 2;   -- todo aprovada/true
--   select has_table_privilege('authenticated','public.membresias','UPDATE');  -- f
