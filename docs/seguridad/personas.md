# Personas

Versión 1.0 · Responsable: Dirección · Revisión: anual o al incorporar a alguien.

## Objetivo

Que quien acceda a sistemas o datos de AUTENZA sepa sus obligaciones, tenga
solo los accesos necesarios mientras los necesite y trabaje desde equipos
seguros.

## Alcance

Dueño, colaboradores, contratistas, proveedores con acceso y el equipo de un
licenciatario o comprador durante una transferencia de conocimiento.

## Antes del acceso

1. **Verificación proporcional** al acceso: identidad y referencias para
   cualquier acceso a producción o a datos Confidenciales o Restringidos (A.6.1).
2. **NDA o cláusula de confidencialidad** firmado antes del primer acceso. Cubre
   datos de las concesionarias y de sus clientes, código, infraestructura y
   secretos, y sigue vigente después de la relación (A.6.6, art. 10 de la Ley 25.326).
   > Pendiente de decisión del dueño: modelo de NDA revisado por un abogado.
3. **Condiciones de trabajo** escritas: aceptación de estas políticas,
   propiedad intelectual de lo que se produce y consecuencias del
   incumplimiento (A.6.2, A.6.4).

## Alta de accesos (checklist)

- [ ] NDA firmado y archivado.
- [ ] Cuenta nominal en GitHub con 2FA; permisos mínimos sobre el repo.
- [ ] Acceso al gestor de contraseñas solo a las bóvedas necesarias.
- [ ] Usuario en el tenant de demostración (no en el de un cliente).
- [ ] Si necesita producción: autorización escrita de la Dirección, llave SSH
      propia, alta en la red de administración y fecha de revisión.
- [ ] Lectura de este SGSI y de [uso aceptable e IA](uso-aceptable-y-ia.md), con constancia.
- [ ] Anotación en el inventario de accesos.

## Baja de accesos (checklist, el mismo día)

- [ ] GitHub: quitar del repo y revocar sus tokens y llaves de deploy.
- [ ] Gestor de contraseñas: quitar acceso. **Rotar todo secreto que haya podido ver.**
- [ ] Host: borrar su llave de `authorized_keys`; quitar su dispositivo de la red de administración.
- [ ] Aplicación: desactivar sus cuentas (incluida cualquier `super_admin`).
- [ ] Cuentas SaaS (Cloudflare, SMTP, Expo, etc.): quitar o transferir.
- [ ] Recuperar o confirmar el borrado de datos y equipos de AUTENZA (A.5.11).
- [ ] Recordatorio por escrito de la confidencialidad vigente (A.6.5).
- [ ] Constancia de la baja con fecha en el archivo privado.

Al cambiar de rol, se repite la baja de lo que ya no necesita.

## Concientización

- **Una hora por año** como mínimo, registrada: este SGSI, phishing y
  suplantación, manejo de datos personales, uso de IA, cómo reportar un
  incidente, y los incidentes del año (A.6.3).
- Al incorporarse: lectura guiada de las políticas.
- Cuando una política cambia de forma relevante: aviso a todos con acceso.

## Trabajo remoto y equipos

1. **Disco cifrado** (BitLocker, FileVault, LUKS) en todo equipo con acceso.
2. **Bloqueo de pantalla** automático en 5 minutos o menos; sesión con contraseña o biometría.
3. Sistema operativo y navegador **actualizados**; protección contra malware activa.
4. **Nada de `.env`, dumps, backups, exportes ni planillas con datos personales
   en carpetas sincronizadas** (OneDrive, Dropbox, Google Drive) ni en
   descargas sin borrar. El repo se clona fuera de esas carpetas.
5. Redes públicas: solo con la VPN o la red de administración para tareas de producción.
6. Gestor de contraseñas para todas las credenciales; 2FA en todo.
7. Equipo perdido o robado: avisar enseguida; se revocan sus llaves y sesiones
   y se rotan los secretos que guardaba ([incidentes](gestion-de-incidentes.md)).
8. Pantalla y escritorio despejados en lugares compartidos (A.7.7).

## Responsable

Dirección (altas, bajas, NDA). Cada persona cumple la sección de trabajo remoto.

## Evidencia que se guarda

NDA firmados; checklists de alta y baja con fecha; registro de concientización
(fecha, contenido, asistentes).

## Frecuencia de revisión

Anual, y con cada alta o baja.

## Controles que cubre

ISO 27001:2022 A.6.1, A.6.2, A.6.3, A.6.4, A.6.5, A.6.6, A.6.7, A.5.11, A.7.7, A.8.1 ·
ISO 27701 6.4.2.2, 6.10.2.4 · SOC 2 CC1.4, CC1.5, CC2.2, CC6.2, CC6.3.
