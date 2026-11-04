# Política de seguridad

Gracias por ayudar a proteger AUTENZA y los datos de las concesionarias y de sus clientes.

## Cómo reportar una vulnerabilidad

Usá el **reporte privado de vulnerabilidades de GitHub**: en este repositorio,
pestaña **Security** → **Report a vulnerability**. El reporte queda visible
solo para el equipo de AUTENZA.

> Pendiente de decisión del dueño: activar "Private vulnerability reporting" en la configuración de seguridad del repositorio.

Si esa opción no aparece, abrí un issue **sin ningún detalle técnico** pidiendo
un canal privado, y te contactamos.

**No** reportes vulnerabilidades en issues, pull requests ni discusiones públicas.

## Qué incluir

- Qué componente afecta (API, web, app móvil, infraestructura) y en qué versión o commit.
- Pasos para reproducirlo y una prueba de concepto mínima.
- Impacto que estimás.
- Si accediste a datos que no eran tuyos, cuáles (para poder evaluar y avisar a quien corresponda).

## Qué podés esperar

Objetivos de respuesta (no son un compromiso contractual):

| Etapa | Objetivo |
|---|---|
| Acuse de recibo | 3 días hábiles |
| Evaluación inicial y severidad | 10 días hábiles |
| Corrección | Según la severidad: crítica 7 días, alta 30 días, media 90 días |
| Aviso de cierre | Cuando el arreglo esté en producción |

Te vamos a mantener al tanto. Si querés, te damos crédito en el aviso de
cierre. No hay programa de recompensas.

Pedimos **divulgación coordinada**: no publiques detalles hasta que el arreglo
esté en producción o hasta 90 días después del reporte, lo que ocurra primero,
salvo que acordemos otra cosa.

## Alcance

**Dentro del alcance**

- El código de este repositorio (`BackConcesionaria`, `FrontConcesionaria`, `AppConcesionaria`, `scripts`).
- La aplicación web, la API y la app móvil de AUTENZA en producción.

**Fuera del alcance**

- Denegación de servicio, pruebas de carga o volumétricas.
- Ingeniería social, phishing y ataques físicos.
- Servicios de terceros (Cloudflare, GitHub, Meta, Mercado Libre, WhatsApp): reportalos a cada proveedor.
- Resultados de escáneres automáticos sin una prueba de impacto.
- Cabeceras o configuraciones faltantes sin un escenario de explotación concreto.
- Self-XSS y problemas que requieren un dispositivo ya comprometido.

## Reglas para investigar

- No accedas, modifiques ni borres datos que no son tuyos más allá de lo mínimo
  para demostrar el problema. Si llegás a datos de una concesionaria o de
  personas, frená y reportá.
- No uses credenciales ajenas ni intentes adivinarlas por fuerza bruta.
- No degrades el servicio para otros usuarios.
- Si necesitás un entorno o una cuenta de prueba, pedilo en el reporte.

Si actuás de buena fe y dentro de estas reglas, consideramos tu investigación
autorizada y no vamos a iniciar acciones en tu contra.

> Pendiente de decisión del dueño: confirmar con un abogado el alcance de esta cláusula de puerto seguro.

## Versiones soportadas

Se corrige solo la versión que está en producción (la rama `main`).

## Más información

Cómo gestionamos las vulnerabilidades y los incidentes:
[docs/seguridad/gestion-de-vulnerabilidades.md](docs/seguridad/gestion-de-vulnerabilidades.md) y
[docs/seguridad/gestion-de-incidentes.md](docs/seguridad/gestion-de-incidentes.md).
