-- Modelo de identidad de POMA: perfil, rol de plataforma y membresía de organización.
--
-- Hasta ahora NO existía ningún modelo de usuario: solo la sesión de Supabase Auth, y
-- AuthGate era binario (hay sesión -> acceso total a las 452 fichas). Esta migración
-- crea la identidad; NO cambia ninguna política todavía (eso llega en 20260730094000+).
--
-- DECISIÓN DE MODELO (AGENTS.md §1bis, brechas 1-2): no se crea todavía la tabla
-- `organizacion` unificada. Las fichas canónicas siguen siendo `productores` y
-- `entidades` —las usan el panel, el intake, la priorización y los gates de envío—, y
-- lo que se añade encima es una tabla de MEMBRESÍAS con dos FK excluyentes. Eso cubre
-- ya los dos requisitos reales sin deduplicar `entidades` (que no tiene ninguna clave
-- única) ni tocar el panel:
--   · doble rol productor+entidad (§12.16): dos filas para el mismo usuario
--   · varios usuarios por organización: N filas con el mismo productor_id/entidad_id
--
-- ⚠️ TRAMPA de `alter default privileges`: 20260721160000_auth_authenticated.sql dejó
--    `alter default privileges in schema public grant select on tables to authenticated`,
--    así que estas tablas NACEN legibles por cualquier autenticado. Hay que revocarlo
--    explícitamente, como ya se hizo con app_config (20260722130000).

-- ---------------------------------------------------------------------------
-- 1. perfiles — 1:1 con auth.users. Datos de la persona, no de la organización.
-- ---------------------------------------------------------------------------
create table if not exists perfiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  nombre        text,
  telefono      text,                       -- E.164 sin '+', como el resto del proyecto (§7)
  idioma        text not null default 'ca' check (idioma in ('ca', 'es')),
  -- Panel que se abre al entrar cuando el usuario tiene más de un rol.
  vista_defecto text check (vista_defecto in ('intern', 'productor', 'receptor')),
  -- Desactivar una cuenta corta su acceso EN LA SIGUIENTE CONSULTA: los helpers de
  -- rol comprueban `activo`, y el rol no viaja en el JWT (ver 20260730092000).
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists perfiles_email_idx on perfiles (lower(email));

-- ---------------------------------------------------------------------------
-- 2. usuario_roles — rol de PLATAFORMA (equipo interno).
--    Jerarquía: super_admin > admin > tecnic. Los usuarios EXTERNOS no tienen
--    ninguna fila aquí: su acceso sale exclusivamente de `membresias`.
--      · super_admin: además de todo, toca app_settings y borra fichas
--      · admin:       aprueba y canaliza, gestiona whitelists
--      · tecnic:      opera el día a día, no aprueba ni cambia configuración
-- ---------------------------------------------------------------------------
create table if not exists usuario_roles (
  user_id      uuid not null references auth.users(id) on delete cascade,
  rol          text not null check (rol in ('super_admin', 'admin', 'tecnic')),
  otorgado_por uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (user_id, rol)
);

create index if not exists usuario_roles_user_idx on usuario_roles (user_id);

-- ---------------------------------------------------------------------------
-- 3. membresias — enlaza una cuenta con una ficha de productor O de entidad.
--    rol_org: titular (edita los datos de la organización e invita) / operador.
-- ---------------------------------------------------------------------------
create table if not exists membresias (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  tipo         text not null check (tipo in ('productor', 'entidad')),
  productor_id uuid references productores(id) on delete cascade,
  entidad_id   uuid references entidades(id)   on delete cascade,
  rol_org      text not null default 'operador' check (rol_org in ('titular', 'operador')),
  activo       boolean not null default true,
  invitado_por uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  -- Exactamente UNA de las dos FK, y coherente con `tipo`.
  constraint membresias_fk_excluyente check (
    (tipo = 'productor' and productor_id is not null and entidad_id   is null) or
    (tipo = 'entidad'   and entidad_id   is not null and productor_id is null)
  )
);

-- Una membresía por usuario y ficha; varias fichas por usuario sí (doble rol).
create unique index if not exists membresias_user_productor_uidx
  on membresias (user_id, productor_id) where productor_id is not null;
create unique index if not exists membresias_user_entidad_uidx
  on membresias (user_id, entidad_id) where entidad_id is not null;

-- Índices que las políticas RLS recorren en cada consulta.
create index if not exists membresias_user_idx      on membresias (user_id) where activo;
create index if not exists membresias_productor_idx on membresias (productor_id);
create index if not exists membresias_entidad_idx   on membresias (entidad_id);

-- ---------------------------------------------------------------------------
-- 4. Perfil automático al crear la cuenta (Admin API, invitación o script).
-- ---------------------------------------------------------------------------
create or replace function crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.perfiles (id, email, nombre)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nombre', new.raw_user_meta_data ->> 'full_name')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function crear_perfil_nuevo_usuario();

-- ---------------------------------------------------------------------------
-- 5. RLS + GRANTs
-- ---------------------------------------------------------------------------
alter table perfiles      enable row level security;
alter table usuario_roles enable row level security;
alter table membresias    enable row level security;

-- Deshacer la herencia de `alter default privileges` antes de conceder lo justo.
revoke all on perfiles      from anon, authenticated;
revoke all on usuario_roles from anon, authenticated;
revoke all on membresias    from anon, authenticated;

grant select on perfiles, usuario_roles, membresias to authenticated;

-- GRANT por columnas: aunque la política deje pasar el UPDATE del propio perfil,
-- `activo` es intocable desde el cliente (nadie reactiva su propia cuenta). RLS no
-- sabe restringir columnas; el GRANT sí.
grant update (nombre, telefono, idioma, vista_defecto) on perfiles to authenticated;

-- Sin INSERT/UPDATE/DELETE sobre usuario_roles ni membresias para `authenticated`:
-- la escalada de privilegios queda cortada en el GRANT, antes de evaluar RLS. Las
-- escrituras van por Edge Function (service_role) o por script.
grant all privileges on perfiles, usuario_roles, membresias to service_role;

-- Políticas de lectura (las de escritura no hacen falta: no hay GRANT que las active).
create policy "perfiles: propio"
  on perfiles for select to authenticated
  using (id = (select auth.uid()));

create policy "perfiles: edito el meu"
  on perfiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "roles: el meu"
  on usuario_roles for select to authenticated
  using (user_id = (select auth.uid()));

create policy "membresias: les meves"
  on membresias for select to authenticated
  using (user_id = (select auth.uid()));

-- Las políticas que dan visibilidad ampliada al equipo interno se añaden en
-- 20260730094000_rls_identidad.sql, junto con el resto del cambio de RLS: aquí
-- todavía no existen los helpers de rol.

-- ---------------------------------------------------------------------------
-- 6. Interruptor global del modelo de roles (apagado)
-- ---------------------------------------------------------------------------
-- Mientras valga 'false', TODOS los helpers de rol devuelven true para cualquier
-- usuario autenticado y las políticas nuevas se comportan exactamente como las
-- permisivas de hoy. Encenderlo es el único paso que cambia el comportamiento, y
-- se revierte con el mismo update (AGENTS.md §9).
insert into app_settings (key, value)
values ('roles_activos', 'false')
on conflict (key) do nothing;

-- Verificación (los tres deben dar f):
--   select has_table_privilege('authenticated','public.usuario_roles','INSERT'),
--          has_table_privilege('anon','public.perfiles','SELECT'),
--          has_table_privilege('authenticated','public.membresias','UPDATE');
