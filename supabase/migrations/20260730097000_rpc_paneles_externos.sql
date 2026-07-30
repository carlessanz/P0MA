-- RPC de los paneles externos.
--
-- Hay tres cosas que RLS no sabe hacer y que aquí se resuelven con funciones:
--   · restringir por COLUMNA (que un productor edite su ficha pero no su `es_test`)
--   · comparar con el valor ANTERIOR de una fila (que nadie se auto-apruebe)
--   · hacer varias escrituras en UNA transacción (aprobar = canalización + respuesta
--     + estado del excedente; hoy son 3-4 llamadas sueltas desde OfferDetail.tsx, y
--     si falla la segunda queda estado inconsistente)
--
-- Todas son `security definer` con `search_path` fijado y comprueban permisos ellas
-- mismas: son la superficie de escritura de los paneles de productor y receptor.

-- El interés desde el panel es un canal más, junto a WhatsApp y correo.
alter table oferta_respuestas drop constraint if exists oferta_respuestas_canal_check;
alter table oferta_respuestas add constraint oferta_respuestas_canal_check
  check (canal in ('whatsapp', 'email', 'panel'));

-- ---------------------------------------------------------------------------
-- 1. El receptor manifiesta interés (equivale al diálogo SÍ → kg → preu de WhatsApp)
-- ---------------------------------------------------------------------------
-- Deja la fila igual que la dejaría el diálogo de WhatsApp: `acceptada` + `pendent` de
-- aprobación. Así cae en la MISMA cola que ya gestiona el panel interno («Aprovar i
-- canalitzar»), con su Realtime ya cableado: cero trabajo nuevo del lado del equipo.
create or replace function public.manifestar_interes(
  p_excedente uuid,
  p_entidad   uuid,
  p_kg        numeric,
  p_preu      numeric default null,
  p_caixes    int default null
)
returns oferta_respuestas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ex   excedentes;
  fila oferta_respuestas;
  tel  text;
begin
  if p_entidad not in (select public.mis_entidades()) then
    raise exception 'No pertanys a aquesta entitat' using errcode = '42501';
  end if;

  select * into ex from excedentes where id = p_excedente;
  if ex.id is null or ex.estado not in ('publicada', 'parcial') then
    raise exception 'Aquesta oferta ja no esta disponible' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from entidades e
      join modalitat_receptor_compat c on c.tipo_receptor = e.tipo_receptor
     where e.id = p_entidad and c.modalitat = ex.modalitat
  ) then
    raise exception 'Aquesta oferta no encaixa amb el tipus de receptor' using errcode = '22023';
  end if;

  if p_kg is null or p_kg <= 0 then
    raise exception 'Cal indicar quants kg' using errcode = '22023';
  end if;

  -- En venda/maquila el preu mínimo lo fija el productor en el intake (§6bis).
  if ex.modalitat in ('venda', 'maquila') and ex.preu_minim is not null
     and (p_preu is null or p_preu < ex.preu_minim) then
    raise exception 'El preu ha de ser com a minim % EUR/kg', ex.preu_minim using errcode = '22023';
  end if;

  select telefono into tel from entidades where id = p_entidad;

  -- Upsert sobre unique(excedente_id, entidad_id): si el equipo ya le había enviado la
  -- oferta, se actualiza esa fila en vez de duplicarla.
  insert into oferta_respuestas (
    excedente_id, entidad_id, telefono, canal, estado,
    kg_solicitados, caixes_solicitades, preu_ofert, respondido_at
  ) values (
    p_excedente, p_entidad, tel, 'panel', 'acceptada',
    p_kg, p_caixes, p_preu, now()
  )
  on conflict (excedente_id, entidad_id) do update
     set estado             = 'acceptada',
         canal              = 'panel',
         kg_solicitados     = excluded.kg_solicitados,
         caixes_solicitades = excluded.caixes_solicitades,
         preu_ofert         = excluded.preu_ofert,
         respondido_at      = now()
   where oferta_respuestas.aprovacio = 'pendent'   -- lo ya resuelto no se toca
  returning * into fila;

  if fila.id is null then
    raise exception 'Aquesta resposta ja esta resolta' using errcode = '22023';
  end if;
  return fila;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. El superadmin aprueba y canaliza, en una sola transacción
-- ---------------------------------------------------------------------------
create or replace function public.aprovar_resposta(
  p_resposta uuid,
  p_kg       numeric default null,
  p_preu     numeric default null,
  p_motiu    text default null
)
returns canalizaciones
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r        oferta_respuestas;
  ex       excedentes;
  c        canalizaciones;
  kg       numeric;
  cubierto numeric;
begin
  if not public.pot_aprovar() then
    raise exception 'Nomes admin o super_admin poden aprovar' using errcode = '42501';
  end if;

  select * into r from oferta_respuestas where id = p_resposta for update;
  if r.id is null or r.estado <> 'acceptada' or r.aprovacio <> 'pendent' then
    raise exception 'Aquesta resposta no es pot aprovar' using errcode = '22023';
  end if;

  select * into ex from excedentes where id = r.excedente_id for update;
  kg := coalesce(p_kg, r.kg_solicitados);
  if kg is null or kg <= 0 then
    raise exception 'Cal indicar els kg a canalitzar' using errcode = '22023';
  end if;

  insert into canalizaciones (excedente_id, entidad_id, kg_confirmados, estado)
  values (r.excedente_id, r.entidad_id, kg, 'confirmada')
  returning * into c;

  update oferta_respuestas
     set aprovacio       = 'aprovada',
         aprovat_at      = now(),
         motiu_aprovacio = p_motiu,
         canalizacion_id = c.id,
         kg_solicitados  = kg,
         preu_ofert      = coalesce(p_preu, r.preu_ofert)
   where id = r.id;

  -- Misma regla que el alta manual: al cubrir los kg, la oferta se bloquea.
  select coalesce(sum(kg_confirmados), 0) into cubierto
    from canalizaciones where excedente_id = ex.id;

  update excedentes
     set estado = case
           when coalesce(ex.kg_total, 0) > 0 and cubierto >= ex.kg_total then 'bloqueada'
           else 'parcial'
         end
   where id = ex.id and estado in ('publicada', 'parcial');

  return c;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Autoedición de la ficha propia, con lista blanca de columnas
-- ---------------------------------------------------------------------------
-- Lo que NO se puede tocar desde fuera: es_test (decide quién recibe WhatsApp),
-- activo, codigo, conveni, prioritat, estat, gestio. Son gobierno interno.
create or replace function public.actualizar_mi_productor(
  p_id             uuid,
  p_name           text default null,
  p_empresa        text default null,
  p_email          text default null,
  p_phone          text default null,
  p_telefono_alt   text default null,
  p_direccion      text default null,
  p_codigo_postal  text default null,
  p_poblacion      text default null,
  p_nif            text default null,
  p_area           text default null
)
returns productores
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p productores;
begin
  if not public.soc_titular('productor', p_id) then
    raise exception 'Nomes el titular pot editar les dades' using errcode = '42501';
  end if;
  update productores
     set name            = coalesce(p_name, name),
         empresa         = p_empresa,
         email           = p_email,
         phone           = p_phone,
         telefono_alt    = p_telefono_alt,
         direccion       = p_direccion,
         codigo_postal   = p_codigo_postal,
         poblacion       = p_poblacion,
         nif             = p_nif,
         area_geografica = p_area
   where id = p_id
  returning * into p;
  return p;
end;
$$;

create or replace function public.actualizar_mi_entidad(
  p_id            uuid,
  p_nombre        text default null,
  p_contacto      text default null,
  p_telefono      text default null,
  p_email         text default null,
  p_direccion     text default null,
  p_codigo_postal text default null,
  p_poblacion     text default null,
  p_horario       text default null,
  p_calendari     text default null,
  p_frescos       boolean default null,
  p_transport     boolean default null,
  p_descarrega    boolean default null
)
returns entidades
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  e entidades;
begin
  if not public.soc_titular('entidad', p_id) then
    raise exception 'Nomes el titular pot editar les dades' using errcode = '42501';
  end if;
  update entidades
     set nombre                = coalesce(p_nombre, nombre),
         contacto              = p_contacto,
         telefono              = p_telefono,
         email                 = p_email,
         direccion             = p_direccion,
         codigo_postal         = p_codigo_postal,
         poblacion             = p_poblacion,
         horario               = p_horario,
         calendari_repartiment = p_calendari,
         productes_frescos     = p_frescos,
         transport_plataforma  = p_transport,
         descarrega_toro       = p_descarrega
   where id = p_id
  returning * into e;
  return e;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. El productor cancela su propia oferta
-- ---------------------------------------------------------------------------
-- Cancelar sí; editar no: el `texto_oferta` ya ha circulado por WhatsApp y cambiarlo
-- después dejaría a las entidades mirando una oferta que no existe.
create or replace function public.cancelar_meva_oferta(p_excedente uuid, p_motiu text)
returns excedentes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ex excedentes;
begin
  select * into ex from excedentes where id = p_excedente;
  if ex.id is null or ex.productor_id not in (select public.mis_productores()) then
    raise exception 'Aquesta oferta no es teva' using errcode = '42501';
  end if;
  if ex.estado not in ('borrador', 'publicada', 'parcial') then
    raise exception 'Aquesta oferta ja no es pot cancel·lar' using errcode = '22023';
  end if;
  update excedentes
     set estado = 'cancelada',
         motivo_no_colocada = coalesce(p_motiu, motivo_no_colocada)
   where id = p_excedente
  returning * into ex;
  return ex;
end;
$$;

-- ---------------------------------------------------------------------------
-- EXECUTE: quitar el PUBLIC por defecto
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'manifestar_interes(uuid,uuid,numeric,numeric,int)',
    'aprovar_resposta(uuid,numeric,numeric,text)',
    'actualizar_mi_productor(uuid,text,text,text,text,text,text,text,text,text,text)',
    'actualizar_mi_entidad(uuid,text,text,text,text,text,text,text,text,text,boolean,boolean,boolean)',
    'cancelar_meva_oferta(uuid,text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
