import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PageLoader from './components/ui/PageLoader';
import { PLATAFORMA_NAV } from './config/plataformaNav';

/*
 * El shell autenticado también va lazy. Antes era eager con el argumento de que
 * el login es "la entrada", y eso dejó de ser cierto: /capacitacion es pública y
 * se le manda por WhatsApp a alguien que todavía no tiene usuario. Con los
 * imports eager, esa visita bajaba el layout, el sidebar, el buscador y axios
 * dentro del chunk de entrada para leer un documento estático. Todos estos
 * componentes se usan como `element` de un <Route>, o sea dentro del <Suspense>
 * de abajo, así que el lazy no necesita ningún fallback extra.
 */
const AppLayout = lazy(() => import('./components/layout/AppLayout'));
const ProtectedRoute = lazy(() => import('./components/layout/ProtectedRoute'));
const RequireRole = lazy(() => import('./components/auth/RequireRole'));
const RedirectSuperAdmin = lazy(() => import('./components/auth/RedirectSuperAdmin'));
const RedirectTasador = lazy(() => import('./components/auth/RedirectTasador'));

const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));

// Resto de pages: lazy — un chunk por feature
const CapacitacionPage = lazy(() => import('./pages/capacitacion/CapacitacionPage'));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const VehiculosPage = lazy(() => import('./pages/vehiculos/VehiculosPage'));
const VehiculoFormPage = lazy(() => import('./pages/vehiculos/VehiculoFormPage'));
const VehiculoDetallePage = lazy(() => import('./pages/vehiculos/VehiculoDetallePage'));
const ComparadorPage = lazy(() => import('./pages/vehiculos/ComparadorPage'));
const AtencionesPage = lazy(() => import('./pages/atenciones/AtencionesPage'));
const AtencionPage = lazy(() => import('./pages/atenciones/AtencionPage'));
const ClientesPage = lazy(() => import('./pages/clientes/ClientesPage'));
const ClienteDetallePage = lazy(() => import('./pages/clientes/ClienteDetallePage'));
const SeguimientosPage = lazy(() => import('./pages/seguimientos/SeguimientosPage'));
const ConsultasPage = lazy(() => import('./pages/consultas/ConsultasPage'));
const BandejaPage = lazy(() => import('./pages/conversaciones/BandejaPage'));
const PreguntasMlPage = lazy(() => import('./pages/mercadolibre/PreguntasPage'));
const TasacionesPage = lazy(() => import('./pages/tasaciones/TasacionesPage'));
const VentasPage = lazy(() => import('./pages/ventas/VentasPage'));
const PresupuestosPage = lazy(() => import('./pages/presupuestos/PresupuestosPage'));
const ConcesionariasPage = lazy(() => import('./pages/concesionarias/ConcesionariasPage'));
const SucursalesPage = lazy(() => import('./pages/sucursales/SucursalesPage'));
const UsuariosPage = lazy(() => import('./pages/usuarios/UsuariosPage'));
const ProveedoresPage = lazy(() => import('./pages/proveedores/ProveedoresPage'));
const ProveedorDetallePage = lazy(() => import('./pages/proveedores/ProveedorDetallePage'));
const IngresosPage = lazy(() => import('./pages/ingresos/IngresosPage'));
const MovimientosPage = lazy(() => import('./pages/movimientos/MovimientosPage'));
const ReservasPage = lazy(() => import('./pages/reservas/ReservasPage'));
const ReservaDetallePage = lazy(() => import('./pages/reservas/ReservaDetallePage'));
const GastosPage = lazy(() => import('./pages/gastos/GastosPage'));
const GastosFijosPage = lazy(() => import('./pages/gastos-fijos/GastosFijosPage'));
const FinanciacionesPage = lazy(() => import('./pages/financiaciones/FinanciacionesPage'));
const FinanciacionExternaPage = lazy(() => import('./pages/solicitudes/FinanciacionExternaPage'));
const PostventaPage = lazy(() => import('./pages/postventa/PostventaPage'));
const AuditoriaPage = lazy(() => import('./pages/auditoria/AuditoriaPage'));
const ReportesPage = lazy(() => import('./pages/reportes/ReportesPage'));
// Billing deshabilitado temporalmente — descomentar este import y la ruta para reactivar.
// const BillingPage = lazy(() => import('./pages/billing/BillingPage'));
const ConfiguracionPage = lazy(() => import('./pages/configuracion/ConfiguracionPage'));
const ForbiddenPage = lazy(() => import('./pages/error/ForbiddenPage'));

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Capacitación: PÚBLICA a propósito, sin ProtectedRoute. Se le manda el
              link por WhatsApp a un dueño de concesionaria que todavía no es
              cliente y no tiene usuario: si pidiera login, no la vería nadie.
              No consume la API — todo su contenido es estático. Va acá arriba
              porque el catch-all <Route path="*"> redirige a "/" y la comería. */}
          <Route path="/capacitacion" element={<CapacitacionPage />} />

          <Route element={<ProtectedRoute />}>
            {/* Panel de PLATAFORMA (super_admin): front separado con su propio
                layout y navegación. Sólo administración global de tenants; no
                muestra las pantallas operativas de la concesionaria. */}
            <Route
              element={
                <RequireRole allowedRoles={['super_admin']}>
                  <AppLayout sections={PLATAFORMA_NAV} brandTag="Plataforma" showNotifications={false} />
                </RequireRole>
              }
            >
              <Route path="/plataforma" element={<Navigate to="/plataforma/concesionarias" replace />} />
              <Route path="/plataforma/concesionarias" element={<ConcesionariasPage />} />
              <Route path="/plataforma/sucursales" element={<SucursalesPage />} />
              <Route path="/plataforma/usuarios" element={<UsuariosPage />} />
            </Route>

            {/* Shell operativo del tenant. RedirectSuperAdmin manda al super_admin
                a /plataforma: nunca ve estas pantallas. */}
            <Route element={<RedirectSuperAdmin />}>
            {/* El tasador puro queda confinado a /tasaciones (ver RedirectTasador). */}
            <Route element={<RedirectTasador />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />

              {/* Vehículos */}
              <Route path="/vehiculos" element={<VehiculosPage />} />
              <Route path="/comparador" element={<ComparadorPage />} />
              <Route path="/vehiculos/nuevo" element={<VehiculoFormPage />} />
              <Route path="/vehiculos/:id/editar" element={<VehiculoFormPage />} />
              <Route path="/vehiculos/:id" element={<VehiculoDetallePage />} />

              {/* Clientes */}
              {/* Panel de consultas entrantes (leads multicanal): el backend ya
                  acota los datos por rol, así que no lleva RequireRole extra. */}
              <Route path="/consultas" element={<ConsultasPage />} />
              {/* Bandeja de WhatsApp: igual que consultas, el backend acota los
                  hilos por rol (el vendedor puro sólo ve los suyos o los libres). */}
              <Route path="/conversaciones" element={<BandejaPage />} />
              {/* Preguntas de Mercado Libre: la atienden admin y vendedor. El
                  backend además acota por rol adentro de la bandeja. */}
              {/* /mercadolibre no tiene página propia: es el prefijo de la sección
                  (mañana cuelga /publicaciones). Sin este redirect el primer
                  breadcrumb de /mercadolibre/preguntas apunta a una ruta muerta y
                  cae en el catch-all. Mismo recurso que /plataforma. */}
              <Route path="/mercadolibre" element={<Navigate to="/mercadolibre/preguntas" replace />} />
              <Route path="/mercadolibre/preguntas" element={<RequireRole allowedRoles={['admin', 'super_admin', 'vendedor']}><PreguntasMlPage /></RequireRole>} />
              {/* Mostrador (atención presencial). Va con RequireRole y no "suelta"
                  como /consultas: acá el vendedor VE stock con precio de lista y
                  marca lo que le mostró al cliente. Postventa, cobrador y lectura
                  no tienen nada que hacer en esta pantalla. `/atenciones/:id` lleva
                  el MISMO gate: sin él, un rol sin permiso entraba por la URL
                  directa a una atención concreta. TAMPOCO super_admin: el backend
                  (authorize('admin','vendedor') + SIN_CONCESIONARIA) no lo deja abrir
                  una visita, así que dejarlo entrar era ofrecerle una pantalla rota. */}
              <Route path="/atenciones" element={<RequireRole allowedRoles={['admin', 'vendedor']}><AtencionesPage /></RequireRole>} />
              <Route path="/atenciones/:id" element={<RequireRole allowedRoles={['admin', 'vendedor']}><AtencionPage /></RequireRole>} />
              <Route path="/clientes" element={<ClientesPage />} />
              <Route path="/clientes/:id" element={<ClienteDetallePage />} />
              {/* Agenda de seguimientos del CRM: admin y vendedor (no postventa). */}
              <Route path="/seguimientos" element={<RequireRole allowedRoles={['admin', 'super_admin', 'vendedor']}><SeguimientosPage /></RequireRole>} />
              <Route path="/tasaciones" element={<RequireRole allowedRoles={['admin', 'super_admin', 'vendedor']}><TasacionesPage /></RequireRole>} />

              {/* Operaciones */}
              <Route path="/presupuestos" element={<PresupuestosPage />} />
              <Route path="/ventas" element={<VentasPage />} />

              {/* Empresa y Usuarios */}
              <Route path="/sucursales" element={<SucursalesPage />} />
              <Route path="/usuarios" element={<RequireRole allowedRoles={['admin', 'super_admin']}><UsuariosPage /></RequireRole>} />

              {/* Proveedores */}
              <Route path="/proveedores" element={<ProveedoresPage />} />
              <Route path="/proveedores/:id" element={<ProveedorDetallePage />} />

              {/* Ingresos y Movimientos */}
              <Route path="/ingresos" element={<IngresosPage />} />
              <Route path="/movimientos" element={<MovimientosPage />} />

              {/* Reservas */}
              <Route path="/reservas" element={<ReservasPage />} />
              <Route path="/reservas/:id" element={<ReservaDetallePage />} />

              {/* Gastos de vehículos */}
              <Route path="/gastos" element={<GastosPage />} />

              {/* Gastos fijos operativos */}
              <Route path="/gastos-fijos" element={<GastosFijosPage />} />

              {/* Otros */}
              <Route path="/financiaciones" element={<FinanciacionesPage />} />
              <Route path="/solicitudes" element={<FinanciacionExternaPage />} />
              <Route path="/postventa" element={<PostventaPage />} />
              <Route path="/reportes" element={<ReportesPage />} />
              <Route path="/auditoria" element={<RequireRole allowedRoles={['admin', 'super_admin']}><AuditoriaPage /></RequireRole>} />
              {/* Billing deshabilitado temporalmente — descomentar (y su import arriba + ítem en nav.ts) para reactivar. */}
              {/* <Route path="/billing" element={<RequireRole allowedRoles={['admin', 'super_admin']}><BillingPage /></RequireRole>} /> */}
              <Route path="/configuracion" element={<ConfiguracionPage />} />
              <Route path="/403" element={<ForbiddenPage />} />
            </Route>
            </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
