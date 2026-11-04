# Proveedores y subencargados

Versión 1.0 · Responsable: Responsable de proveedores · Revisión: semestral para los críticos, anual para el resto.

## Objetivo

Saber qué terceros tocan los datos o la operación de AUTENZA, qué riesgo
representan y cómo salir de cada uno; y poder informar a las concesionarias qué
subencargados tratan los datos de sus clientes.

## Alcance

Todo proveedor de servicios, plataforma integrada, librería con acceso a datos y
registro de paquetes que use AUTENZA.

## Reglas

1. **Antes de sumar un proveedor** que toque datos personales, secretos o la
   operación: se completa su fila en este registro, se revisa su acuerdo de
   tratamiento de datos (DPA) y su documentación de cumplimiento, y se define
   la alternativa y la salida. Si es una integración, además, el modelo de
   amenazas de [desarrollo seguro](desarrollo-seguro.md).
2. **Subencargados** (tratan datos de clientes de las concesionarias): la lista
   vigente es el Anexo II del [contrato de encargado](../privacidad/contrato-de-encargado-plantilla.md).
   Un subencargado nuevo o un cambio se avisa a las concesionarias **con 30 días
   de anticipación**, y pueden oponerse.
   > Pendiente de decisión del dueño: confirmar el plazo de aviso previo (propuesta: 30 días).
3. **Transferencias internacionales** (art. 12 de la Ley 25.326): cada
   proveedor fuera de Argentina que trata datos personales necesita una base
   documentada (cláusulas contractuales del tipo de los modelos aprobados por la
   autoridad de control, u otra que valide el abogado).
   > Borrador para revisión legal: base de transferencia para cada proveedor de EE.UU.
4. **Cuentas en los proveedores:** nominales, con 2FA, revisadas cada trimestre
   ([control de acceso](control-de-acceso.md)).
5. **Baja de un proveedor:** revocar accesos y tokens, exportar lo propio,
   pedir o verificar el borrado y anotarlo.
6. El **estado** de cada DPA (aceptado, fecha, versión) y los informes de
   cumplimiento descargados se guardan en el archivo privado. Este registro
   público dice qué hay que revisar, no si ya se firmó.

## Registro: terceros que tocan datos de clientes de las concesionarias

| Proveedor | Servicio | Datos que toca | Criticidad | País | DPA / cumplimiento a revisar | Alternativa y salida | Próxima revisión |
|---|---|---|---|---|---|---|---|
| **Cloudflare** — borde y túnel | Exposición pública, TLS, DNS, caché | Todo el tráfico de la plataforma pasa por su borde (datos de clientes, credenciales en tránsito); IP de los visitantes | Crítica | EE.UU. (red global) | DPA estándar del proveedor e informes en su portal de confianza | Otro proxy inverso o túnel; el DNS se mueve desde el registrador en horas | 2027-05 |
| **Cloudflare** — almacenamiento offsite | Copia de los backups | Backups **cifrados con `age`** antes de salir (el proveedor no tiene la clave) | Alta | Según la jurisdicción elegida para el bucket | Mismo DPA; elegir y documentar la jurisdicción | Cualquier almacenamiento S3-compatible (`rclone`) | 2027-05 |
| **Meta** (Lead Ads, Messenger, Instagram) | Integración que activa cada concesionaria | Entrantes: nombre, teléfono, email, mensajes; salientes: respuestas del vendedor | Media | EE.UU. / Irlanda | Condiciones de la plataforma. La concesionaria es titular de su app y su página; AUTENZA actúa por su instrucción | Carga manual de consultas; desvincular y revocar el token | 2027-11 |
| **WhatsApp** mediante una librería no oficial (Baileys) | Bandeja de WhatsApp | Chats del número vinculado, nombre y teléfono de los contactos; la sesión del número vive en el host | Media | EE.UU. (descifrado en el host de AUTENZA) | No hay contrato: es un cliente no oficial y el número puede ser bloqueado por WhatsApp. Se informa a la concesionaria antes de vincular | WhatsApp Business Platform oficial a través de un proveedor; desvincular y borrar la sesión | 2027-05 |
| **Mercado Libre** | Publicación de stock y preguntas | Entrantes: id y apodo del usuario, texto de la pregunta; salientes: datos y fotos de la unidad | Media | Argentina | Condiciones para desarrolladores | Publicación manual; desvincular y revocar tokens | 2027-11 |
| Proveedor de email de la concesionaria (IMAP) | Lectura de la carpeta de avisos de portales | Mails de la carpeta configurada | Baja | Depende del proveedor | Lo elige y contrata la concesionaria: no es subencargado de AUTENZA | Borrar la configuración de la integración | — |
| Proveedor de internet del host | Conectividad | Tráfico ya cifrado por el túnel | Alta (disponibilidad) | Argentina | Condiciones del servicio contratado | Segundo enlace o reconstruir en otro proveedor ([continuidad](respaldo-y-continuidad.md)) | 2027-11 |

## Registro: proveedores de la operación (sin datos de clientes de las concesionarias)

| Proveedor | Servicio | Datos que toca | Criticidad | País | DPA / cumplimiento a revisar | Alternativa y salida | Próxima revisión |
|---|---|---|---|---|---|---|---|
| **GitHub** | Repositorio, CI, alertas de seguridad | Código, documentación, configuración sin secretos | Alta | EE.UU. | DPA estándar y documentación de cumplimiento | Otro proveedor de git y CI; clones locales completos | 2027-11 |
| Proveedor de SMTP (Brevo) | Emails transaccionales (recuperación de contraseña) | Email del usuario, link de un solo uso, metadatos del envío (AUTENZA como responsable) | Media | UE (a verificar) | DPA estándar | Cualquier SMTP transaccional (variables `SMTP_*`) | 2027-11 |
| Red de administración (Tailscale) | Acceso administrativo al host | Metadatos de dispositivos e IP del operador; no ve datos de clientes | Alta | Canadá / EE.UU. (a verificar) | DPA y documentación de cumplimiento | VPN propia; consola física | 2027-05 |
| Google Fonts | Tipografías de la web | IP, user-agent y página de origen de cada visitante (AUTENZA como responsable) | Baja | EE.UU. | Condiciones del servicio | Autoalojar las fuentes en el bundle | 2027-11 |
| Asistente de IA (Anthropic) | Asistencia en desarrollo y operación | Código, documentación y salidas que se le muestran. **No autorizado** a recibir datos personales ni secretos de producción ([uso aceptable e IA](uso-aceptable-y-ia.md)) | Alta (por impacto potencial) | EE.UU. | Condiciones comerciales y de retención de datos: configurar la retención y archivar | Otro asistente; revocar llaves y accesos del agente | 2027-05 |
| Gestor de contraseñas (`<gestor-de-contraseñas>`) | Custodia de secretos y códigos de recuperación | Todos los secretos (cifrados del lado del cliente) | Crítica | `<país>` | Modelo de seguridad y documentación de cumplimiento | Exportación cifrada de la bóveda a otro gestor | 2027-05 |
| Registrador del dominio | Dominio y delegación de DNS | Datos del titular del dominio | Alta | `<país>` | Condiciones del registro | Transferir el dominio a otro registrador | 2027-11 |
| Expo / EAS | Compilación y distribución de la app | Código de la app, credenciales de firma | Media | EE.UU. | DPA y condiciones | Compilación local en Linux; exportar las credenciales de firma | 2027-11 |
| Servicio de alertas (`<servicio-de-alertas>`) | Destino de `SECURITY_ALERT_WEBHOOK_URL` y `BACKUP_ALERT_CMD` | Texto de las alertas, sin datos personales | Media | `<país>` | Condiciones del servicio | Otro webhook o canal | 2027-11 |
| Sincronización de archivos del equipo de desarrollo | Copia de archivos de trabajo | Ninguno sensible: prohibido guardar `.env`, dumps o planillas con datos ([personas](personas.md)) | Baja | EE.UU. | — | Excluir carpetas | 2027-11 |
| Registros de paquetes e imágenes (npm, Docker Hub) | Dependencias y bases de contenedores | Ninguno (cadena de suministro) | Alta | EE.UU. | — | Lockfiles, `npm ci`, Dependabot, imágenes oficiales | 2027-11 |
| dolarapi.com | Cotización del dólar | Ninguno (consulta desde el servidor) | Baja | A verificar | Sin contrato ni SLA | Otra fuente pública; si falla, el sistema no convierte | 2027-11 |
| argautos.com | Catálogo de marcas y modelos | Ninguno | Baja | A verificar | Verificar las condiciones de uso de los datos | Carga manual o fuente licenciada | 2027-11 |

ARCA/AFIP no es un proveedor: cuando la facturación real exista, recibirá los
datos del receptor por obligación legal.

## Responsable

Responsable de proveedores.

## Evidencia que se guarda

DPA aceptados con fecha y versión, informes de cumplimiento descargados,
avisos de cambio de subencargados enviados a las concesionarias, revisiones
periódicas, bajas de proveedores.

## Frecuencia de revisión

Semestral (críticos y altos con datos), anual (resto), y cuando un proveedor
cambie sus términos o informe un incidente.

## Controles que cubre

ISO 27001:2022 A.5.19, A.5.20, A.5.21, A.5.22, A.5.23, A.5.14 ·
ISO 27701 A.7.2.6, A.7.5.1–A.7.5.4, B.8.5.1, B.8.5.2, B.8.5.6, B.8.5.7, B.8.5.8, 6.12.1.2 ·
SOC 2 CC9.2, CC3.2, P6.1, P6.4.
