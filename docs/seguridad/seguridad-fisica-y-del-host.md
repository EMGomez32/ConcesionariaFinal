# Seguridad física y del host

Versión 1.0 · Responsable: Operador de producción · Revisión: anual y al cambiar de host.

## Objetivo

Proteger el equipo que corre producción, los medios con datos y el sistema
operativo del host contra el acceso físico indebido, las fallas del entorno y
los ataques por red.

## Alcance

El host de producción, sus discos y medios de backup, el equipo de red que lo
conecta, y los equipos de desarrollo en lo físico. La ubicación no se publica.

## Seguridad física

1. **Lugar con acceso restringido** a personas autorizadas; el equipo no queda
   a la vista ni al alcance de terceros (A.7.1–A.7.3).
2. **Protección del entorno:** lejos de agua y calor, con ventilación, y con
   protección eléctrica (estabilizador o UPS) que permita un apagado ordenado
   (A.7.5, A.7.8, A.7.11).
3. **Discos cifrados** en el host y en todo medio con backups (A.7.10). La clave
   de desbloqueo no queda escrita junto al equipo.
4. **Mantenimiento:** solo el operador; si un tercero repara el equipo, los
   discos se retiran antes o el tercero firma confidencialidad (A.7.13).
5. **Baja o reutilización de equipos y medios:** borrado criptográfico o
   destrucción física, con constancia (A.7.14).
6. **Equipos fuera del lugar** (notebooks del personal): reglas de
   [personas](personas.md) (A.7.9).

## Endurecimiento del host

El estado deseado lo aplica `scripts/hardening/pi-host-hardening.sh` (en modo
*dry-run* por defecto: primero se revisa qué haría) y la evidencia la junta
`scripts/hardening/verify-host.sh`. Reglas:

1. **Uso dedicado:** el host de producción corre solo AUTENZA y sus servicios
   de soporte. Cualquier excepción es un riesgo aceptado por escrito, y el
   servicio ajeno no comparte red de contenedores, socket de Docker ni
   volúmenes con AUTENZA.
2. **SSH solo con llave**, sin `root`, con bloqueo de intentos (fail2ban).
3. **Firewall** con política de entrada denegada por defecto, incluida la
   cadena `DOCKER-USER` (Docker saltea las reglas comunes si no). La
   administración entra solo por la interfaz de la red de administración.
4. **Ningún servicio escucha en todas las interfaces** salvo lo
   imprescindible del sistema. Los puertos de AUTENZA van a `127.0.0.1`
   (`docker-compose.yml`); la entrada pública es solo el túnel.
5. **Actualizaciones automáticas de seguridad** del sistema operativo.
6. **Reloj sincronizado** por NTP y zona horaria `America/Argentina/Buenos_Aires` (A.8.17).
7. **Contenedores:** procesos sin root, `no-new-privileges`, `cap_drop: ALL`
   (`docker-compose.yml`, `BackConcesionaria/Dockerfile`). Nada monta el socket
   de Docker. Paneles de administración de contenedores, si existen, solo en
   loopback y con 2FA.
8. **Usuarios:** el operador es nominal; la pertenencia a `sudo` y `docker` se
   revisa cada trimestre ([control de acceso](control-de-acceso.md)).
9. **Stacks viejos o de prueba** no quedan corriendo en el host de producción:
   se hace un backup final, se bajan y se borran sus volúmenes.
10. **Secretos en el host:** `.env` con permisos `600`, sin copias `.env.bak.*`
    viejas ([criptografía y secretos](criptografia-y-secretos.md)).

## Verificación

- Después de cada cambio de configuración del host y cada trimestre: correr
  `scripts/hardening/verify-host.sh` y guardar la salida en el archivo privado.
- Cualquier desvío se corrige o se registra como riesgo.

## Responsable

Operador de producción.

## Evidencia que se guarda

Salidas de `verify-host.sh` con fecha; constancias de baja de equipos y medios;
log de cambios de infraestructura.

## Frecuencia de revisión

Anual; verificación del host, trimestral.

## Controles que cubre

ISO 27001:2022 A.7.1, A.7.2, A.7.3, A.7.5, A.7.8, A.7.9, A.7.10, A.7.11, A.7.13, A.7.14,
A.8.9, A.8.17, A.8.19, A.8.20, A.8.22 · ISO 27701 6.8.2.7 · SOC 2 CC6.4, CC6.5, CC6.6, CC6.8, CC7.1, A1.2.
