-- RLS por rol: fichas, mensajería, configuración y whitelists.
--
-- Deroga las políticas permisivas de 20260721160000 ("authenticated puede leer" en 11
-- tablas), 20260722140000 (CRUD de productores y entidades), 20260723120000 (borrado
-- de conversaciones), 20260723140000 (app_settings) y 20260722120000/150000 (listas de
-- test). Nunca se editan esas migraciones: se sustituyen sus políticas aquí (§7).
--
-- Con `roles_activos` apagado todo esto se comporta igual que antes, porque
-- es_intern() / pot_aprovar() / es_super_admin() devuelven true para cualquier
-- autenticado. Encender el interruptor es lo que cambia el comportamiento.
--
-- Los helpers van envueltos en `(select …)` para que el planner los evalúe una vez por
-- consulta y no una por fila.

-- ---------------------------------------------------------------------------
-- productores
-- ---------------------------------------------------------------------------
drop policy if exists "authenticated puede leer"        on productores;
drop policy if exists "authenticated crea productores"  on productores;
drop policy if exists "authenticated edita productores" on productores;
drop policy if exists "authenticated borra productores" on productores;

create policy "productores: lectura intern o propia"
  on productores for select to authenticated
  using ((select public.es_intern()) or id in (select public.mis_productores()));

create policy "productores: alta intern"
  on productores for insert to authenticated
  with check ((select public.es_intern()));

create policy "productores: edicio intern"
  on productores for update to authenticated
  using ((select public.es_intern()))
  with check ((select public.es_intern()));

create policy "productores: baixa super_admin"
  on productores for delete to authenticated
  using ((select public.es_super_admin()));

-- No hay política de UPDATE para el propio productor A PROPÓSITO: una política es por
-- FILA, no por columna, así que no podría impedirle tocar `es_test` (que decide quién
-- recibe WhatsApp), `conveni`, `codigo` o `activo`. La autoedición va por la RPC
-- actualizar_mi_productor(), con lista blanca de columnas (20260730097000).

-- ---------------------------------------------------------------------------
-- entidades — mismo patrón
-- ---------------------------------------------------------------------------
drop policy if exists "authenticated puede leer"      on entidades;
drop policy if exists "authenticated crea entidades"  on entidades;
drop policy if exists "authenticated edita entidades" on entidades;
drop policy if exists "authenticated borra entidades" on entidades;

create policy "entidades: lectura intern o propia"
  on entidades for select to authenticated
  using ((select public.es_intern()) or id in (select public.mis_entidades()));

create policy "entidades: alta intern"
  on entidades for insert to authenticated
  with check ((select public.es_intern()));

create policy "entidades: edicio intern"
  on entidades for update to authenticated
  using ((select public.es_intern()))
  with check ((select public.es_intern()));

create policy "entidades: baixa super_admin"
  on entidades for delete to authenticated
  using ((select public.es_super_admin()));

-- ---------------------------------------------------------------------------
-- productor_ubicaciones — el único caso donde el externo SÍ puede escribir directo:
-- todas sus columnas son inocuas (alias, enlace de Maps, coordenadas, municipio).
-- ---------------------------------------------------------------------------
drop policy if exists "authenticated puede leer" on productor_ubicaciones;

create policy "ubicaciones: lectura intern o propia"
  on productor_ubicaciones for select to authenticated
  using ((select public.es_intern()) or productor_id in (select public.mis_productores()));

create policy "ubicaciones: gestio intern o propia"
  on productor_ubicaciones for all to authenticated
  using ((select public.es_intern()) or productor_id in (select public.mis_productores()))
  with check ((select public.es_intern()) or productor_id in (select public.mis_productores()));

grant insert, update, delete on productor_ubicaciones to authenticated;

-- ---------------------------------------------------------------------------
-- Mensajería: es la consola interna. Nadie de fuera entra aquí.
-- ---------------------------------------------------------------------------
drop policy if exists "authenticated puede leer"                 on wa_contacts;
drop policy if exists "authenticated puede crear contactos"      on wa_contacts;
drop policy if exists "authenticated puede actualizar contactos" on wa_contacts;
drop policy if exists "authenticated puede borrar contactos"     on wa_contacts;
drop policy if exists "authenticated puede leer"                 on wa_messages;
drop policy if exists "authenticated puede borrar mensajes"      on wa_messages;

create policy "wa_contacts: nomes intern"
  on wa_contacts for all to authenticated
  using ((select public.es_intern()))
  with check ((select public.es_intern()));

create policy "wa_messages: lectura intern"
  on wa_messages for select to authenticated
  using ((select public.es_intern()));

create policy "wa_messages: esborrat intern"
  on wa_messages for delete to authenticated
  using ((select public.es_intern()));

-- Sigue sin haber INSERT en wa_messages para nadie salvo el servidor (§4).

-- ---------------------------------------------------------------------------
-- intake_sessions: lleva teléfono y datos a medias. Solo el equipo (lo usa el Dashboard).
-- ---------------------------------------------------------------------------
drop policy if exists "authenticated puede leer" on intake_sessions;

create policy "intake_sessions: lectura intern"
  on intake_sessions for select to authenticated
  using ((select public.es_intern()));

-- ---------------------------------------------------------------------------
-- Whitelists de test: son teléfonos y correos, y deciden a quién se puede escribir.
-- ---------------------------------------------------------------------------
drop policy if exists "authenticated gestiona meta_test_recipients"  on meta_test_recipients;
drop policy if exists "authenticated gestiona email_test_recipients" on email_test_recipients;

create policy "meta_test: lectura intern"
  on meta_test_recipients for select to authenticated
  using ((select public.es_intern()));
create policy "meta_test: escriptura admin"
  on meta_test_recipients for all to authenticated
  using ((select public.pot_aprovar()))
  with check ((select public.pot_aprovar()));

create policy "email_test: lectura intern"
  on email_test_recipients for select to authenticated
  using ((select public.es_intern()));
create policy "email_test: escriptura admin"
  on email_test_recipients for all to authenticated
  using ((select public.pot_aprovar()))
  with check ((select public.pot_aprovar()));

-- ---------------------------------------------------------------------------
-- app_settings: aquí vive `test_mode`. Apagarlo abre el envío a 272 móviles reales,
-- así que la escritura es solo de super_admin (§8).
-- ---------------------------------------------------------------------------
drop policy if exists "authenticated gestiona app_settings" on app_settings;

create policy "app_settings: lectura intern"
  on app_settings for select to authenticated
  using ((select public.es_intern()));

create policy "app_settings: escriptura super_admin"
  on app_settings for all to authenticated
  using ((select public.es_super_admin()))
  with check ((select public.es_super_admin()));

-- ---------------------------------------------------------------------------
-- Lo que NO se toca, y por qué
-- ---------------------------------------------------------------------------
-- · productos / causas / factores_conversion: catálogos sin datos personales que el
--   formulario de alta de oferta necesita. Siguen legibles por cualquier autenticado.
-- · app_config: sigue siendo solo service_role (20260722130000). Ni se menciona aquí
--   para no reintroducirlo por descuido.
-- · Las políticas "service_role acceso total": redundantes (service_role tiene
--   BYPASSRLS) pero inocuas. Se dejan.
