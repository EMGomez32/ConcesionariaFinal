# Runbook: alta de una concesionaria (go-live)

Checklist de punta a punta, desde el contrato hasta la primera semana de uso.
Guardá la checklist completa, con fechas, en el archivo privado de evidencias
(una por concesionaria). La baja está en
[baja de una concesionaria](../privacidad/baja-de-una-concesionaria.md).

## 1. Antes del alta técnica

- [ ] Contrato de servicio firmado, con el anexo de tratamiento de datos
      ([modelo](../privacidad/contrato-de-encargado-plantilla.md)) y la lista de
      subencargados vigente ([proveedores](../seguridad/proveedores-y-subencargados.md)).
- [ ] Datos fiscales: razón social, CUIT, condición frente al IVA, domicilio.
- [ ] Responsable del lado de la concesionaria: nombre, cargo, email y teléfono
      para soporte y para avisos de seguridad.
- [ ] Sucursales (nombre y domicilio) y cupo de usuarios acordado.
- [ ] Lista de usuarios con su rol. Una persona, una cuenta. Sin cuentas compartidas.
- [ ] Integraciones que va a usar (WhatsApp, Meta, Mercado Libre, casilla de email)
      y quién de la concesionaria es dueño de cada cuenta externa.

## 2. Alta en la plataforma (super_admin)

Desde el panel de plataforma:

- [ ] **Concesionarias → Nueva concesionaria:** datos y cupo de usuarios.
- [ ] **Sucursales:** una por local, eligiendo la concesionaria en el selector.
- [ ] **Usuarios:** el administrador de la concesionaria, sobre esa concesionaria.
- [ ] Revisá que el usuario quedó en la concesionaria correcta antes de mandarle el acceso.
- [ ] El acceso inicial se entrega por un canal distinto del email del usuario
      (por ejemplo, un link de recuperación de contraseña o la contraseña en
      persona). Nunca por el mismo mensaje que el usuario.

## 3. Seguridad de las cuentas

- [ ] El administrador activa el 2FA en su primer ingreso y guarda los códigos
      de recuperación fuera del sistema.
- [ ] El administrador da de alta al resto de los usuarios con el rol mínimo
      necesario: vendedor, cobrador, postventa, tasador o lectura.
- [ ] Explicale el criterio de roles: quien hace el trabajo lo registra; anular
      es del administrador.
- [ ] Acordá cómo te avisan una baja de personal (el admin desactiva la cuenta
      el mismo día).

## 4. Integraciones

- [ ] **WhatsApp:** solo con un número **exclusivamente comercial**. El
      administrador lo vincula escaneando el QR en Configuración. Avisá que es un
      canal no oficial: el número puede ser bloqueado por WhatsApp. No se vincula
      el celular personal de nadie.
- [ ] **Meta (Lead Ads, Messenger, Instagram):** la concesionaria es dueña de su
      app y de su página. Cargá la configuración en Configuración → Integraciones.
- [ ] **Mercado Libre:** la concesionaria vincula su cuenta por OAuth desde la app.
- [ ] **Casilla de email:** una carpeta dedicada solo a avisos de portales. Nada
      de la casilla general de la empresa.
- [ ] Todas las integraciones se prueban con un caso real antes de anunciarlas
      como funcionando. Si alguna queda en modo demostración, se le dice así.

## 5. Privacidad (la concesionaria es la responsable de los datos de sus clientes)

- [ ] Entregale el [modelo de texto de consentimiento](../privacidad/texto-de-consentimiento-modelo.md)
      para el mostrador y explicale cómo se registra en la atención.
- [ ] Recordale que debe tener su propio aviso de privacidad y su base inscripta
      ante la AAIP. Es una obligación suya, no de AUTENZA.
- [ ] Mostrale las herramientas para atender pedidos de sus clientes (acceso,
      rectificación, supresión, bloqueo) y el procedimiento de
      [derechos de los titulares](../privacidad/derechos-de-los-titulares.md).
- [ ] Acordá los plazos de conservación que aplican a su caso
      ([política de retención](../privacidad/politica-de-retencion.md)).

## 6. Migración de datos

- [ ] Clientes desde Excel con la importación del sistema. Antes, el
      administrador declara por escrito de dónde salen esos datos y con qué base
      legal se recolectaron. Guardá esa declaración.
- [ ] Hacé primero una importación de prueba con pocas filas y revisala con la concesionaria.
- [ ] Planillas con datos reales: se reciben por un canal cifrado, se procesan
      y se borran del equipo del operador al terminar. Nunca en carpetas sincronizadas.
- [ ] Stock y financiaciones vigentes: se cargan desde la UI hasta que existan
      importadores. Acordá quién lo hace y para cuándo.

## 7. Capacitación

- [ ] Recorrida por rol con la página pública `/capacitacion` y los tours de cada módulo.
- [ ] Una venta y un cobro de prueba con la concesionaria, en un entorno de
      demostración, no en su tenant.
- [ ] Canal de soporte, horarios y cómo reportar un problema de seguridad.

## 8. Aceptación y seguimiento

- [ ] Acta de go-live firmada por el responsable de la concesionaria: fecha,
      usuarios creados, integraciones activas, pendientes acordados.
- [ ] Seguimiento a los 7 días: usuarios que entraron, dudas, errores.
- [ ] Seguimiento a los 30 días: uso por módulo, pendientes, ajuste de roles.
- [ ] Cualquier dato de prueba creado en su tenant durante el alta se borra
      antes del acta.
