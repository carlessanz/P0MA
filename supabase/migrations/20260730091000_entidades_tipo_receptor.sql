-- Subtipo de receptor: social · alimentació animal · transformador · comercial.
--
-- El panel de receptor no es uno solo: un banco de alimentos, una granja y un obrador
-- ven cosas distintas. Hacía falta un discriminador y `modalitat` no sirve tal cual:
-- describe CÓMO aprovecha la entidad el excedente (Donació/Transformació/Venda/
-- Maquila/Altres), es texto libre, admite null y **no puede expresar "alimentació
-- animal"**. Sí sirve como fuente de derivación.
--
-- Se añade una columna con vocabulario cerrado y se deriva de `modalitat` lo que se
-- puede, dejando null lo no concluyente para triaje manual desde el CRUD: exactamente
-- el mismo criterio que ya se usó con productes_frescos/productes_frescos_txt
-- (20260721120100_modelo_poma.sql).

alter table entidades add column if not exists tipo_receptor text;

alter table entidades drop constraint if exists entidades_tipo_receptor_check;
alter table entidades add constraint entidades_tipo_receptor_check
  check (tipo_receptor is null
      or tipo_receptor in ('social', 'animal', 'transformador', 'comercial'));

-- Derivación inicial de las 111 fichas. Lo que no case queda null a propósito.
-- Para ver el reparto antes/después:
--   select coalesce(modalitat,'(null)') m, coalesce(tipo_receptor,'(null)') t, count(*)
--     from entidades group by 1,2 order by 3 desc;
update entidades
   set tipo_receptor = case
     when modalitat ilike 'donaci%'       then 'social'
     when modalitat ilike 'transformaci%' then 'transformador'
     when modalitat ilike 'maquila%'      then 'transformador'
     when modalitat ilike 'venda%'        then 'comercial'
     else null                            -- 'Altres' y null: triaje manual
   end
 where tipo_receptor is null;

-- 'animal' NO es derivable: ninguna columna del Excel SDA lo recoge. Se marca a mano
-- desde la ficha (ENTIDAD_CAMPOS). Mientras `tipo_receptor` sea null la entidad no ve
-- ninguna oferta en su panel, pero SIGUE apareciendo en la priorización interna (que
-- corre con service_role), así que el flujo actual del equipo no se degrada.
create index if not exists entidades_tipo_receptor_idx on entidades (tipo_receptor);

-- ---------------------------------------------------------------------------
-- Matriz de compatibilidad oferta ↔ receptor, EN TABLA
-- ---------------------------------------------------------------------------
-- §6bis: "las opciones salen siempre de las tablas, nunca escritas a mano". La usan
-- la política de lectura de `excedentes` y la RPC manifestar_interes(), así que
-- cambiar la regla de negocio es un insert/delete, no una migración de políticas.
create table if not exists modalitat_receptor_compat (
  modalitat     text not null check (modalitat in ('donacio', 'venda', 'maquila')),
  tipo_receptor text not null check (tipo_receptor in ('social', 'animal', 'transformador', 'comercial')),
  primary key (modalitat, tipo_receptor)
);

insert into modalitat_receptor_compat (modalitat, tipo_receptor) values
  ('donacio', 'social'),          -- donación social: el core del servicio
  ('donacio', 'animal'),          -- lo que no es apto para consumo humano
  ('donacio', 'transformador'),   -- obradores que transforman lo donado
  ('venda',   'comercial'),
  ('venda',   'transformador'),
  ('maquila', 'transformador')
on conflict do nothing;

alter table modalitat_receptor_compat enable row level security;

-- Catálogo sin datos personales: legible por cualquier autenticado, como productos
-- o causas. La escritura queda solo para service_role.
grant select on modalitat_receptor_compat to authenticated;
grant all privileges on modalitat_receptor_compat to service_role;

drop policy if exists "catalogo legible" on modalitat_receptor_compat;
create policy "catalogo legible"
  on modalitat_receptor_compat for select to authenticated using (true);
