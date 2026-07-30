-- Corrige una recursión infinita entre las políticas de `excedentes` y
-- `oferta_respuestas` (introducidas en 20260730096000).
--
-- EL FALLO: las dos políticas se referenciaban mutuamente.
--   · `excedentes` miraba `oferta_respuestas` para dejar que un receptor vea el
--     histórico de aquello en lo que participó
--   · `oferta_respuestas` miraba `excedentes` para dejar que un productor vea las
--     respuestas a SUS ofertas
-- Cada consulta a una evaluaba la política de la otra, que volvía a evaluar la
-- primera: Postgres lo corta con «infinite recursion detected in policy for relation».
-- Arrastraba también a `canalizaciones`, cuya política consulta `excedentes`.
--
-- Lo encontró `scripts/comprobar-rls.ts` al ejecutarlo con cuentas reales: la prueba
-- equivalente hecha a mano en psql no lo vio, porque no llegó a leer `excedentes` con
-- una sesión externa. Es exactamente para lo que existe el arnés.
--
-- LA SOLUCIÓN: mover los dos cruces a funciones `security definer`, que corren como su
-- propietario y por tanto NO evalúan RLS. El ciclo se rompe y, de paso, cada cruce se
-- calcula una vez por consulta en lugar de una vez por fila.

-- ---------------------------------------------------------------------------
-- Funciones puente
-- ---------------------------------------------------------------------------

/** Ofertas en las que alguna de mis entidades ha mostrado interés (histórico). */
create or replace function public.excedents_amb_interes_meu()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct r.excedente_id
    from oferta_respuestas r
   where r.entidad_id in (select public.mis_entidades());
$$;

/** Ofertas de mis fichas de productor. */
create or replace function public.excedents_dels_meus_productors()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id
    from excedentes e
   where e.productor_id in (select public.mis_productores());
$$;

do $$
declare
  f text;
begin
  foreach f in array array['excedents_amb_interes_meu()', 'excedents_dels_meus_productors()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Políticas sin ciclo
-- ---------------------------------------------------------------------------
drop policy if exists "excedentes: lectura per rol" on excedentes;
create policy "excedentes: lectura per rol"
  on excedentes for select to authenticated
  using (
       (select public.es_intern())
    or productor_id in (select public.mis_productores())
    or (estado in ('publicada', 'parcial')
        and exists (
          select 1
            from entidades e
            join modalitat_receptor_compat c
              on c.tipo_receptor = e.tipo_receptor
             and c.modalitat     = excedentes.modalitat
           where e.id in (select public.mis_entidades())))
    or id in (select public.excedents_amb_interes_meu())
  );

drop policy if exists "respuestas: lectura per rol" on oferta_respuestas;
create policy "respuestas: lectura per rol"
  on oferta_respuestas for select to authenticated
  using (
       (select public.es_intern())
    or entidad_id in (select public.mis_entidades())
    or excedente_id in (select public.excedents_dels_meus_productors())
  );

drop policy if exists "canalizaciones: lectura per rol" on canalizaciones;
create policy "canalizaciones: lectura per rol"
  on canalizaciones for select to authenticated
  using (
       (select public.es_intern())
    or entidad_id in (select public.mis_entidades())
    or excedente_id in (select public.excedents_dels_meus_productors())
  );
