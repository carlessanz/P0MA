-- RLS por rol: ofertas, canalizaciones y respuestas.
--
-- Deroga las políticas de 20260721160000 (lectura), 20260724100000 (canalizar y editar
-- excedentes) y 20260723100000 (oferta_respuestas). Es la parte que da forma a los dos
-- paneles nuevos:
--   · el productor ve SUS ofertas, en cualquier estado
--   · el receptor ve las ofertas vivas COMPATIBLES con su tipo, más el histórico de
--     aquello en lo que participó
--   · el equipo lo ve todo, como hasta ahora

-- ---------------------------------------------------------------------------
-- excedentes
-- ---------------------------------------------------------------------------
drop policy if exists "authenticated puede leer"           on excedentes;
drop policy if exists "authenticated actualitza excedentes" on excedentes;

create policy "excedentes: lectura per rol"
  on excedentes for select to authenticated
  using (
       (select public.es_intern())
    -- Productor: sus ofertas, en cualquier estado.
    or productor_id in (select public.mis_productores())
    -- Receptor: ofertas vivas cuya modalitat encaja con su tipo (matriz en tabla).
    or (estado in ('publicada', 'parcial')
        and exists (
          select 1
            from entidades e
            join modalitat_receptor_compat c
              on c.tipo_receptor = e.tipo_receptor
             and c.modalitat     = excedentes.modalitat
           where e.id in (select public.mis_entidades())))
    -- Receptor: histórico de aquello en lo que participó, aunque ya esté cerrada.
    or exists (
         select 1 from oferta_respuestas r
          where r.excedente_id = excedentes.id
            and r.entidad_id in (select public.mis_entidades()))
  );

create policy "excedentes: edicio intern"
  on excedentes for update to authenticated
  using ((select public.es_intern()))
  with check ((select public.es_intern()));

-- Sin política ni GRANT de INSERT para `authenticated`: los excedentes los crea
-- siempre el servidor (el intake del webhook o la Edge Function `crear-oferta`), que
-- es el único sitio donde se generan `id_excedente` y `texto_oferta`. Si el navegador
-- pudiera insertar, el correlativo del identificador sería falsificable.
-- El productor cancela la suya con la RPC cancelar_meva_oferta().

-- ---------------------------------------------------------------------------
-- canalizaciones
-- ---------------------------------------------------------------------------
drop policy if exists "authenticated puede leer"             on canalizaciones;
drop policy if exists "authenticated gestiona canalizaciones" on canalizaciones;

create policy "canalizaciones: lectura per rol"
  on canalizaciones for select to authenticated
  using (
       (select public.es_intern())
    or entidad_id in (select public.mis_entidades())
    or exists (
         select 1 from excedentes e
          where e.id = canalizaciones.excedente_id
            and e.productor_id in (select public.mis_productores()))
  );

create policy "canalizaciones: gestio intern"
  on canalizaciones for all to authenticated
  using ((select public.es_intern()))
  with check ((select public.es_intern()));

-- ---------------------------------------------------------------------------
-- oferta_respuestas
-- ---------------------------------------------------------------------------
drop policy if exists "authenticated gestiona oferta_respuestas" on oferta_respuestas;

create policy "respuestas: lectura per rol"
  on oferta_respuestas for select to authenticated
  using (
       (select public.es_intern())
    or entidad_id in (select public.mis_entidades())   -- el receptor ve SOLO las suyas
    or exists (
         select 1 from excedentes e
          where e.id = oferta_respuestas.excedente_id
            and e.productor_id in (select public.mis_productores()))
  );

create policy "respuestas: gestio intern"
  on oferta_respuestas for all to authenticated
  using ((select public.es_intern()))
  with check ((select public.es_intern()));

-- El receptor NO escribe aquí directamente: usa manifestar_interes() (20260730097000).
-- Motivo: un WITH CHECK no puede comparar con el valor ANTERIOR de la fila, así que
-- con UPDATE directo podría ponerse `aprovacio = 'aprovada'` él solo.

-- ---------------------------------------------------------------------------
-- Cinturón y tirantes: el eje de aprobación solo lo mueve quien puede aprobar.
-- Cierra la deuda §12.18 incluso si alguien relaja las políticas de arriba.
-- ---------------------------------------------------------------------------
create or replace function trg_respuestas_control_aprovacio()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Los flujos del servidor (webhook, jobs) corren con service_role: auth.uid() es
  -- null y pasan de largo, como debe ser.
  if auth.uid() is null then
    return new;
  end if;
  if new.aprovacio is distinct from old.aprovacio and not public.pot_aprovar() then
    raise exception 'Nomes admin o super_admin poden aprovar una resposta'
      using errcode = '42501';
  end if;
  if new.canalizacion_id is distinct from old.canalizacion_id and not public.pot_aprovar() then
    raise exception 'Nomes admin o super_admin poden canalitzar'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists respuestas_control_aprovacio on oferta_respuestas;
create trigger respuestas_control_aprovacio
  before update on oferta_respuestas
  for each row execute function trg_respuestas_control_aprovacio();

-- ---------------------------------------------------------------------------
-- Índices que las políticas de arriba recorren en cada consulta. Sin ellos, cada
-- lectura del panel del receptor haría un seq scan de excedentes y respuestas.
-- ---------------------------------------------------------------------------
create index if not exists excedentes_productor_id_idx      on excedentes (productor_id);
create index if not exists canalizaciones_entidad_id_idx    on canalizaciones (entidad_id);
create index if not exists oferta_respuestas_entidad_id_idx on oferta_respuestas (entidad_id);
create index if not exists oferta_respuestas_excedente_idx  on oferta_respuestas (excedente_id);
