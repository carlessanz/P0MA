-- Siembra del equipo interno. SIN ESTO, encender el interruptor de roles deja el
-- panel en blanco.
--
-- Todas las cuentas que existen hoy son del equipo: el registro público está
-- desactivado (config.toml → enable_signup = false) y la única vía de alta es la
-- Admin API (scripts/crear-usuario.ts). Así que se les da rol 'admin' a todas, y
-- cuando entren las políticas nuevas —que empiezan por es_intern()— el panel seguirá
-- funcionando exactamente igual.
--
-- Detalle importante: una RLS mal sembrada NO da error, devuelve 0 filas. El síntoma
-- sería un panel que carga bien y está vacío, que es justo lo que más cuesta
-- diagnosticar. De ahí que esta migración vaya antes que ninguna política.

-- 1. Un perfil por cada cuenta existente (el trigger solo cubre las futuras).
insert into perfiles (id, email)
  select u.id, u.email from auth.users u
on conflict (id) do nothing;

-- 2. Rol de equipo para todas ellas.
insert into usuario_roles (user_id, rol)
  select u.id, 'admin' from auth.users u
on conflict do nothing;

-- 3. El o los super_admin se promueven FUERA de git: los correos del equipo son datos
--    personales (§7). Con la service key:
--      update usuario_roles set rol = 'super_admin' where user_id = '<uuid>';
--    o, más cómodo, por email:
--      update usuario_roles r set rol = 'super_admin'
--        from perfiles p where p.id = r.user_id and lower(p.email) = lower('<email>');
--
--    Mientras no se haga, nadie es super_admin y las acciones reservadas a ese rol
--    (apagar el modo test, borrar fichas) quedan bloqueadas al encender el interruptor.
--    Hazlo ANTES del encendido.

-- VERIFICACIÓN (debe devolver 0 filas: ninguna cuenta sin rol):
--   select u.id, u.email
--     from auth.users u
--     left join usuario_roles r on r.user_id = u.id
--    where r.user_id is null;
