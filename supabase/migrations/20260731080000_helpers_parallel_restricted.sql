-- Los helpers de rol quedaron PARALLEL UNSAFE, que es el valor por defecto de
-- `create function` y que nadie escribe a propósito.
--
-- Por qué importa: basta con que UNA función parallel-unsafe aparezca en el `qual`
-- de una política —aunque sea dentro de un InitPlan que se evalúa una sola vez—
-- para que el planner descarte cualquier plan paralelo en TODA la consulta. Antes
-- del 30-07-2026 las políticas eran `using (true)`, constante que desaparecía en
-- la fase de planificación; desde que hay helpers, cada consulta del panel sobre
-- una tabla con RLS perdió la posibilidad de paralelizarse. En los volúmenes de
-- hoy (345 productores, 344 mensajes) no se nota —medido: 77-209 ms—, pero es una
-- limitación gratuita que crece con los datos, y las tres pantallas que cargan
-- `wa_messages` entera (deuda §12.5) son justo las que más lo pagarían.
--
-- RESTRICTED y no SAFE, a propósito: leen estado de la sesión (`auth.uid()`) y son
-- `security definer` con `pg_temp` en el search_path. RESTRICTED permite el plan
-- paralelo pero obliga a que estas funciones se ejecuten en el proceso líder, que
-- es exactamente la semántica correcta. Marcarlas SAFE sería incorrecto.
--
-- No cambia ni permisos ni resultados: solo cómo puede planificar Postgres.

alter function public.roles_activos() parallel restricted;
alter function public.es_intern() parallel restricted;
alter function public.pot_aprovar() parallel restricted;
alter function public.es_super_admin() parallel restricted;
alter function public.mi_rol() parallel restricted;
alter function public.mis_productores() parallel restricted;
alter function public.mis_entidades() parallel restricted;
alter function public.soc_titular(text, uuid) parallel restricted;
alter function public.get_my_session_context() parallel restricted;
alter function public.excedents_amb_interes_meu() parallel restricted;
alter function public.excedents_dels_meus_productors() parallel restricted;
