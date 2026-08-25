/**
 * Contenido de la página pública /capacitacion.
 *
 * Regla de redacción que gobierna este archivo: cada frase tiene que poder
 * señalarse en una pantalla del sistema. Nada de métricas de resultado, ni
 * testimonios, ni precios, ni funciones a medio terminar contadas como si
 * estuvieran listas. Lo que todavía no está, se dice en ESTADO_HONESTO.
 *
 * Es data pura (sin JSX) para que la página la maquete como quiera y para que
 * revisar la veracidad del texto no obligue a leer componentes.
 */

/* ------------------------------------------------------------------ */
/* A) Presentación de venta: los cuatro ángulos                        */
/* ------------------------------------------------------------------ */

export interface Ventaja {
    titulo: string;
    /** El dolor tal como lo vive hoy el dueño, sin exagerar. */
    problema: string;
    /**
     * Qué hace el sistema, en criollo y sin prometer resultados.
     *
     * Es un array de párrafos cortos y no un bloque único: esta sección es lo
     * primero que se lee después de la portada y se lee en un celular. Un solo
     * <p> de 170 palabras son más de veinte líneas seguidas a 13px, y el lector
     * abandona justo en el argumento de venta. Regla de este campo: ningún
     * párrafo de más de ~45 palabras, y el que más pega va primero.
     */
    solucion: string[];
    /** Pantallas y reportes reales donde se comprueba lo de arriba. */
    dondeSeVe: string[];
}

export const VENTAJAS: Ventaja[] = [
    {
        titulo: 'La plata: cuánto ganás de verdad en cada auto',
        problema:
            'Sabés lo que pagaste el auto y sabés a cuánto lo vendiste. Lo del medio está repartido: el remito del mecánico en un cajón, la chapa y pintura pagada en efectivo, el lavado que nadie anotó, el juego de cubiertas que entró como "gasto del mes". Cerrás el mes con la sensación de que ganaste, pero si te preguntan qué unidad te dejó plata y cuál te la comió, no lo podés contestar con un número.',
        solucion: [
            'Cada gasto se carga contra el auto, no contra el mes: fecha, monto, moneda, proveedor que lo hizo y el comprobante.',
            'En la ficha de la unidad ves el total gastado sumado por moneda, con el detalle de cada trabajo. Y el reporte de Rentabilidad te muestra, auto por auto: precio de venta, precio de compra, gastos, cuánto quedó y qué margen fue.',
            'Es honesto con la moneda: si compraste en dólares y vendiste en pesos, no te imprime un número lindo y falso. Te deja el margen en blanco y te dice qué importes no pudo restar y en qué moneda.',
            'Si cargaste la cotización del día, te ofrece el total convertido, aclarándote qué cotización usó y de qué fecha.',
            'Aparte, los gastos de tener el negocio abierto van por separado, mes a mes, y el reporte de Caja los cruza con lo que entró.',
        ],
        dondeSeVe: [
            'Ficha del vehículo → pestaña Gastos: el total gastado en esa unidad, sumado por moneda, con cada gasto y su proveedor',
            'Gastos Unidades: la carga de cada arreglo contra el auto, con comprobante',
            'Reportes → Rentabilidad: por unidad vendida, precio de venta, precio de compra, gastos, ganancia y margen. Baja a Excel',
            'Reportes → Caja mensual: lo que entró (ventas y cuotas) contra lo que salió (gastos de unidades y gastos fijos), con el neto por moneda',
            'Gastos Fijos: alquiler, sueldos, servicios, por mes, por sucursal y por categoría',
            'Dashboard → alerta de stock estancado: qué unidades pasaron los 60 días en el playón y cuánta plata tenés parada ahí, a precio de compra',
            'Ficha del vehículo → pestaña Precios: cada cambio de precio de lista, con el valor anterior, el nuevo, el motivo y quién lo tocó',
        ],
    },
    {
        titulo: 'Las consultas: ninguna queda sin dueño',
        problema:
            'El formulario que dejó uno en la campaña de Instagram lo vio un vendedor, la pregunta de Mercado Libre la contestó otro dos días después, y el WhatsApp quedó quince chats más abajo. Cuando preguntás quién atendió a fulano, cada uno dice que pensó que lo tenía el otro. El cliente que nadie contestó ya compró en otro lado y vos ni te enteraste de que existió, porque nunca quedó anotado en ningún lado.',
        solucion: [
            'Todas las consultas entran por el mismo lugar y salen con un vendedor asignado. Si no elegís vos a quién, va sola al vendedor activo que menos consultas nuevas tiene arriba.',
            'Si el teléfono o el mail ya estaban cargados no se duplica el cliente: se le anota la consulta nueva con fecha y canal, y si lo habían dado por perdido, se reabre.',
            'Los formularios de campaña de Instagram y Facebook —los Lead Ads de Meta— entran solos. Los avisos que te llegan por mail a una casilla también: esa casilla el sistema la revisa cada cinco minutos.',
            'Las de WhatsApp y las preguntas de Mercado Libre caen en una bandeja y se pasan a consulta con un botón.',
            'Después, la pantalla Consultas te muestra las que nadie tocó todavía, la más vieja arriba, con los días que lleva esperando, de qué canal vino, qué auto preguntó y quién la tiene.',
            'Y el reloj del primer contacto lo para el vendedor cuando registra el contacto de verdad: el sistema no se anota a sí mismo como si hubiera llamado.',
        ],
        dondeSeVe: [
            'Consultas → Sin atender: los días que lleva esperando cada una, el canal, el vendedor, el teléfono y qué auto preguntó',
            'Consultas → Por vendedor: el embudo de cada uno (nuevo, contactado, negociando, ganado, perdido) y las horas promedio que tarda en hacer el primer contacto',
            'Consultas → Por canal: cuántas entraron, cuántas se ganaron, cuántas se perdieron y la tasa de conversión de cada origen',
            'WhatsApp: bandeja compartida con los no leídos, el filtro de "sin responder" y la asignación del chat a un vendedor',
            'Mercado Libre → Preguntas: asignar, responder desde acá (la respuesta se publica en el aviso) y pasar la pregunta a cliente con un botón',
            'Ajustes → Integraciones: el canal de formularios de Instagram y Facebook (Lead Ads) y la casilla de correo, con el último dato que entró y el último error, para saber si está funcionando',
            'Seguimientos: la agenda de a quién hay que llamar hoy, con los contactos vencidos marcados',
        ],
    },
    {
        titulo: 'El equipo: saber qué pasó en el salón sin estar en el salón',
        problema:
            'Si faltás dos días, volvés preguntando todo: qué se vendió, quién bajó ese precio, por qué ese auto figura reservado, qué le prometieron al cliente que vino el sábado. La respuesta cambia según a quién le preguntes. Y a fin de mes, la comisión de cada vendedor la sacás a mano de la misma planilla que estás tratando de reemplazar.',
        solucion: [
            'A cada vendedor le fijás su objetivo del mes en unidades o en facturado, y el reporte te muestra el avance real de cada uno. El vendedor ve el suyo en su tablero y no ve el de los demás.',
            'Tenés el ranking del período —unidades, facturado y rentabilidad por vendedor— y la liquidación de comisiones con el porcentaje que le pusiste a cada uno en su ficha, con el detalle de sus ventas en PDF.',
            'Todo lo que se toca queda registrado: quién creó, editó o anuló cada cosa, cuándo, desde qué dirección y desde qué navegador. Los cambios de precio de un auto quedan con el motivo que escribió el que lo cambió.',
            'Y cada rol entra a su propio tablero: el cobrador ve su cola de cobranza, el vendedor sus consultas y sus reservas, el de postventa sus turnos. Vos ves todo eso junto, más el resultado del mes.',
        ],
        dondeSeVe: [
            'Usuarios: alta de cada empleado con su rol, su sucursal y su porcentaje de comisión',
            'Reportes → Objetivos: la meta mensual de cada vendedor y el porcentaje que lleva cumplido',
            'Reportes → Ranking: unidades, facturado y rentabilidad por vendedor en el período',
            'Reportes → Comisiones: lo que le tenés que pagar a cada uno, por moneda, con la liquidación en PDF',
            'Dashboard: la meta del mes de la concesionaria con la barra de avance, la tendencia de ventas de los últimos seis meses y la actividad reciente del equipo',
            'Auditoría: el registro de cada operación con usuario, fecha, dirección y detalle. Se filtra por fecha, por persona y por tipo de operación, y baja a Excel',
            'Ficha del vehículo → pestaña Precios: quién repreció, cuándo y por qué',
        ],
    },
    {
        titulo: 'El orden: se termina el Excel que entiende uno solo',
        problema:
            'El stock está en una planilla que sabe manejar una sola persona. Las señas en un cuaderno. Las fotos, en el celular del vendedor que las sacó. Los papeles del auto, en una carpeta que hay que revolver. Cuando alguien se va, se va con la mitad de la información en la cabeza. Y si dos personas abren la planilla el mismo día, ya no sabés cuál es la buena.',
        solucion: [
            'Cada auto tiene una ficha sola, y de esa ficha cuelga todo: fotos y archivos con el nombre de quién los subió, los gastos, los movimientos, los presupuestos, las reservas, la venta y los clientes que preguntaron por él.',
            'La información no vive en la computadora de nadie: cada uno entra con su usuario y ve lo suyo.',
            // "Nada se borra de verdad" era falso: hay cuatro modelos (cotización, meta,
            // objetivo de vendedor e interés en un vehículo) sin columna de baja lógica,
            // así que su borrado es físico. Se acota la promesa a lo que la extensión de
            // Prisma sí cubre, y la segunda mitad (queda quién lo hizo) es cierta siempre.
            'Las bajas del negocio son lógicas: el vehículo, el cliente, la venta, la reserva, el presupuesto, el gasto, la financiación y el caso de postventa quedan marcados como dados de baja, no desaparecen. Y toda baja, sin excepción, queda registrada con quién la hizo y cuándo.',
            'Si tenés más de una sucursal, cada unidad, cada venta y cada gasto sabe a cuál pertenece, y los reportes se filtran por sucursal.',
            'Los documentos que le entregás al cliente salen del sistema con el logo, los colores y el pie de tu concesionaria: catálogo de stock, ficha del auto, presupuesto, comprobante de venta, comprobante de seña, recibo de cuota, orden de trabajo del taller, tasación y estado de cuenta.',
            'Y el sistema te avisa antes de que se te pase algo: VTV y seguro por vencer, señas que caen, cuotas que vencen, turnos del taller.',
        ],
        dondeSeVe: [
            'Ficha del vehículo: pestañas de Información, Archivos, Gastos, Movimientos, Presupuestos, Reservas, Ventas, Interesados y Precios',
            'Ficha del cliente: sus ventas, reservas, presupuestos, financiaciones, solicitudes al banco, casos de postventa, el historial de contactos y los autos que le interesan',
            'Movimientos: a qué taller mandaste cada unidad y desde cuándo está afuera, con el botón para marcar el retorno',
            'Ajustes: el logo, los colores y el pie que salen impresos en todos los documentos',
            'Vehículos → Catálogo PDF y exportación a Excel del listado filtrado',
            'Dashboard → alertas: documentación por vencer, reservas por vencer, cuotas en mora, turnos de taller y seguimientos agendados',
            'Buscador de arriba (Ctrl o Cmd + K): encontrás un auto, un cliente o un proveedor escribiendo, desde cualquier pantalla',
        ],
    },
];

/* ------------------------------------------------------------------ */
/* B) El circuito completo, de punta a punta                           */
/* ------------------------------------------------------------------ */

export interface PasoDelCircuito {
    orden: number;
    titulo: string;
    que: string;
    /** Ids de ROLES que intervienen en el paso. */
    quien: string[];
    pantalla: string;
}

export const CIRCUITO: PasoDelCircuito[] = [
    {
        orden: 1,
        titulo: 'Entra la unidad',
        que: 'Das de alta el auto con marca, modelo, versión, año, dominio, kilómetros, color, sucursal y —lo que después define el margen— precio de compra, moneda, a quién se lo compraste y la fecha. Nace en estado En preparación. Aparte queda el acta de ingreso: si fue compra a un proveedor, a un particular, permuta o consignación, con el valor tomado.',
        quien: ['admin', 'vendedor'],
        pantalla: 'Vehículos e Ingresos',
    },
    {
        orden: 2,
        titulo: 'Se va a preparación',
        que: 'Registrás que la unidad salió al mecánico, al lavadero, a chapa y pintura, al gomero o al electricista. Mientras no marques el retorno, el auto figura afuera y sabés dónde está. El mismo formulario sirve para trasladarlo a otra sucursal.',
        quien: ['admin', 'vendedor'],
        pantalla: 'Movimientos',
    },
    {
        orden: 3,
        titulo: 'Se cargan los gastos de esa unidad',
        que: 'Cada arreglo, repuesto o trámite se carga contra el auto: fecha, monto, moneda, el proveedor que lo hizo, la descripción y el comprobante. Esto es exactamente lo que después descuenta el reporte de Rentabilidad.',
        quien: ['admin', 'vendedor'],
        pantalla: 'Gastos Unidades',
    },
    {
        orden: 4,
        titulo: 'Se publica',
        que: 'Le ponés precio de lista, cargás las fotos y pasás el auto a Publicado. Desde ahí sacás la ficha en PDF para el cliente (sin lo que pagaste ni lo que gastaste) o el catálogo de todo el stock filtrado. Si tenés la cuenta de Mercado Libre vinculada, se publica la unidad desde acá, de a una y siempre a pedido.',
        quien: ['admin', 'vendedor'],
        pantalla: 'Vehículos y Mercado Libre',
    },
    {
        orden: 5,
        titulo: 'Entra la consulta',
        que: 'La consulta llega de un formulario de campaña de Instagram o Facebook, de una casilla de mail, de WhatsApp, de Mercado Libre o del mostrador. Queda con un vendedor asignado y sin duplicar al cliente si ya estaba. Si el canal dice por qué auto preguntaron —una pregunta de Mercado Libre siempre cuelga de una publicación— el vehículo queda anotado solo; si no lo dice, lo carga el vendedor cuando atiende.',
        quien: ['admin', 'vendedor'],
        pantalla: 'Consultas, WhatsApp y Mercado Libre',
    },
    {
        orden: 6,
        titulo: 'Se contacta y se agenda el próximo llamado',
        que: 'El vendedor registra el contacto (llamada, WhatsApp, mail o visita), escribe la nota y deja agendado para cuándo lo vuelve a llamar. Esa agenda es la lista de a quién hay que contactar hoy, con los atrasados marcados.',
        quien: ['admin', 'vendedor'],
        pantalla: 'Seguimientos y Clientes',
    },
    {
        orden: 7,
        titulo: 'Se tasa el usado que trae',
        que: 'Cargás el auto del cliente con marca, modelo, año, kilómetros, dominio y condición, y le ponés un valor estimado. Queda a nombre del tasador y con fecha, y le entregás la tasación en PDF. Todavía no es una unidad de tu stock.',
        quien: ['admin', 'vendedor'],
        pantalla: 'Tasaciones',
    },
    {
        orden: 8,
        titulo: 'Se arma el presupuesto',
        que: 'Uno o varios autos con su precio de lista, el descuento y el precio final; los extras como conceptos aparte; y el usado que entrega, con el valor tomado. El total se calcula solo: autos más extras menos canje. Sale en PDF y tiene su estado (borrador, enviado, aceptado, rechazado, vencido).',
        quien: ['admin', 'vendedor'],
        pantalla: 'Presupuestos',
    },
    {
        orden: 9,
        titulo: 'Se toma la seña',
        que: 'Monto de la seña, moneda, método de pago y hasta cuándo vale. Al guardarla el auto queda Reservado y, si estaba publicado en Mercado Libre, el aviso se pausa. Sale el comprobante de seña en PDF. Si la reserva se cae, se cancela y el auto vuelve a Publicado.',
        quien: ['admin', 'vendedor'],
        pantalla: 'Reservas',
    },
    {
        orden: 10,
        titulo: 'Si va a banco o financiera',
        que: 'Armás la solicitud con la financiera, el monto pedido, el plazo, la tasa estimada y el legajo de papeles adjuntos. La seguís por estado, hasta aprobada o rechazada, con el monto y la tasa que finalmente salieron. Puede existir sin auto elegido, para la pre-aprobación.',
        quien: ['admin', 'vendedor'],
        pantalla: 'Fin. Externa',
    },
    {
        orden: 11,
        titulo: 'Se registra la venta',
        que: 'Auto, cliente, vendedor, precio, moneda, forma de pago, los pagos que entraron, los extras y el usado que se tomó en parte de pago. Se guarda todo junto: el auto pasa a Vendido, la reserva se cierra, el presupuesto queda aceptado y el aviso de Mercado Libre se baja. Dos vendedores no pueden vender la misma unidad.',
        quien: ['admin', 'vendedor'],
        pantalla: 'Ventas',
    },
    {
        orden: 12,
        titulo: 'Si le financiás vos, plan de cuotas y cobranza',
        que: 'Primero le mostrás el plan con el simulador, que no guarda nada. Cuando arreglan, armás el plan sobre la venta: monto, cuotas, día de vencimiento, tasa si hay, y qué cobrador queda a cargo. Después se cobra cuota por cuota, con pagos parciales si hace falta, y sale el recibo. Si el cliente se atrasa, se refinancia el saldo real en un contrato nuevo y la deuda no se cuenta dos veces.',
        quien: ['admin', 'vendedor', 'cobrador'],
        pantalla: 'Financiación',
    },
    {
        orden: 13,
        titulo: 'Se entrega el auto',
        que: 'La entrega tiene su propio estado: pendiente, bloqueada, autorizada y entregada. Sirve para que nadie entregue una unidad que todavía no terminó de pagar o a la que le falta un papel. Cuando se marca entregada, queda la fecha.',
        quien: ['admin', 'vendedor'],
        pantalla: 'Ventas',
    },
    {
        orden: 14,
        titulo: 'Postventa',
        que: 'El reclamo se abre siempre sobre una unidad vendida, con el tipo tomado de tu propio catálogo, el turno de taller con día y hora, y la orden de trabajo en PDF. Los trabajos y repuestos se cargan con su proveedor y su monto: eso es el costo. Contra lo que le facturaste al cliente, tenés el margen del caso. Y queda agendado el próximo service.',
        quien: ['admin', 'postventa', 'vendedor'],
        pantalla: 'Postventa',
    },
    {
        orden: 15,
        titulo: 'Los números del mes',
        que: 'Qué se vendió, cuánto entró y cuánto salió, quién te debe, qué cuotas vencen la semana que viene, qué dejó cada auto, cómo viene cada vendedor contra su objetivo y cuánto hay que pagarle de comisión. Cada reporte se filtra por fecha y por sucursal, y la mayoría baja a Excel.',
        quien: ['admin'],
        pantalla: 'Reportes',
    },
];

/* ------------------------------------------------------------------ */
/* C) Capacitación por rol                                             */
/* ------------------------------------------------------------------ */

export interface TareaDeRol {
    titulo: string;
    pasos: string[];
    pantalla: string;
}

export interface Rol {
    id: string;
    nombre: string;
    resumen: string;
    diaTipico: string;
    /**
     * Los módulos donde el rol TRABAJA. No es "el menú recortado": hoy el menú
     * sólo esconde las bandejas (Consultas, WhatsApp, Mercado Libre, Seguimientos,
     * Tasaciones) y los ítems de administrador (Usuarios, Auditoría). Cuando el
     * menú real muestra bastante más que esta lista, el rol lo aclara en `notaMenu`.
     */
    modulos: string[];
    /** Aclaración de qué le aparece en el menú además de los `modulos` de arriba. */
    notaMenu?: string;
    tareas: TareaDeRol[];
    /** Lo que el sistema efectivamente le niega. Sale de los permisos reales. */
    noPuede: string[];
}

export const ROLES: Rol[] = [
    {
        id: 'vendedor',
        nombre: 'Vendedor',
        resumen:
            'El que atiende, cotiza, reserva y vende. Trabaja sobre su cartera: sus consultas, sus clientes, sus operaciones. Ve su objetivo del mes, no el de los demás.',
        diaTipico:
            'Abre el tablero y le aparecen tres cosas: las consultas que todavía no atendió, las reservas que están por vencer y los clientes que tenía agendado llamar hoy. Arranca por las consultas más viejas, contesta la bandeja de WhatsApp y las preguntas de Mercado Libre que tiene asignadas, y va cargando lo que sale: una tasación, un presupuesto, una seña, una venta.',
        modulos: [
            'Dashboard',
            'Consultas',
            'WhatsApp',
            'Mercado Libre (preguntas)',
            'Clientes',
            'Seguimientos',
            'Tasaciones',
            'Vehículos y Comparador',
            'Presupuestos',
            'Reservas',
            'Ventas',
            'Financiación y Fin. Externa',
            'Gastos Unidades',
            'Postventa',
            'Reportes (sus pestañas)',
        ],
        tareas: [
            {
                titulo: 'Atender una consulta que entró recién',
                pasos: [
                    'Entrá a Consultas. La tabla "Sin atender" te muestra las que nadie tocó, la más vieja arriba, con los días que lleva esperando: en ámbar a los dos días, en rojo a partir del tercero.',
                    'En la misma fila ves de qué canal vino, el teléfono y por qué auto preguntó.',
                    'Tocá el botón de WhatsApp: se abre el chat con un mensaje ya redactado. Lo revisás y lo mandás vos. El sistema no manda nada solo.',
                    'Volvé y tocá "Contactado": queda registrado el seguimiento y el cliente pasa a la etapa contactado.',
                    'Si esa consulta no era para vos, cambiá el vendedor desde el selector de la fila.',
                ],
                pantalla: 'Consultas',
            },
            {
                titulo: 'Tasar el usado que el cliente entrega',
                pasos: [
                    'Entrá a Tasaciones y cargá marca, modelo, año, kilómetros y dominio del auto del cliente.',
                    'Elegí la condición: excelente, muy bueno, bueno, regular o malo.',
                    'Poné el valor estimado y la moneda. Queda con tu nombre como tasador y con la fecha.',
                    'Bajá la tasación en PDF y entregásela al cliente.',
                    'Tené presente que la tasación todavía no es una unidad del stock: el auto se da de alta en Vehículos recién cuando la operación se cierra, con origen permuta.',
                ],
                pantalla: 'Tasaciones',
            },
            {
                titulo: 'Armar el presupuesto y convertirlo en venta',
                pasos: [
                    'En Presupuestos, elegí el cliente y hasta cuándo vale la cotización.',
                    'Sumá el auto o los autos del stock: cada uno con su precio de lista, el descuento y el precio final.',
                    'Cargá los extras como conceptos aparte, y el usado que entrega en el canje, con el valor tomado. El total se calcula solo: autos más extras menos canje.',
                    'Bajá el PDF y mandáselo. El presupuesto va cambiando de estado: borrador, enviado, y después aceptado o rechazado.',
                    'Cuando el cliente acepta, pasalo a aceptado y tocá "Convertir en venta": se crea la operación con los datos que ya cargaste.',
                ],
                pantalla: 'Presupuestos',
            },
            {
                titulo: 'Tomar una seña',
                pasos: [
                    'En Reservas, elegí el auto y el cliente, y cargá el monto de la seña, la moneda, el método de pago y hasta cuándo vale.',
                    'Al guardar, el auto queda Reservado y el movimiento queda registrado. Si estaba publicado en Mercado Libre, el aviso se pausa.',
                    'Bajá el comprobante de seña en PDF y entregáselo al cliente.',
                    'Las reservas que están por vencer se marcan en ámbar, y también te aparecen en el tablero.',
                    'Si la operación se cae, cancelá la reserva: el auto vuelve a Publicado y queda el movimiento de liberación.',
                ],
                pantalla: 'Reservas',
            },
            {
                titulo: 'Registrar la venta',
                pasos: [
                    'En Ventas, registrá la operación: auto, cliente, vendedor, precio, moneda y forma de pago.',
                    'Cargá los pagos que entraron (efectivo, transferencia, tarjeta, cheque) con su referencia y su comprobante, y los extras.',
                    'Si hay permuta, elegí el usado que tomás. Ojo: ese auto tiene que estar dado de alta antes en Vehículos, con origen permuta. El sistema no lo crea solo desde el canje.',
                    'Guardás una vez y se acomoda todo junto: el auto pasa a Vendido, la reserva se cierra, el presupuesto queda aceptado y el aviso de Mercado Libre se baja.',
                    'Bajá el comprobante de venta en PDF. Después manejás la entrega desde la misma pantalla.',
                ],
                pantalla: 'Ventas',
            },
            {
                titulo: 'Armar el plan de cuotas propio',
                pasos: [
                    'En Financiación, usá "Simular cuotas" para mostrarle el plan al cliente. No guarda nada: es sólo para mostrar.',
                    'Cuando arreglan, armá el plan sobre la venta: monto financiado, cantidad de cuotas, día de vencimiento, tasa mensual si hay, y qué cobrador queda a cargo.',
                    'Con tasa, la cuota sale fija (sistema francés). Sin tasa, se reparte el capital en partes iguales.',
                    'El plan queda generado con todos los vencimientos puestos, mes a mes. A partir de ahí se cobra cuota por cuota.',
                ],
                pantalla: 'Financiación',
            },
        ],
        noPuede: [
            // Decía "el precio de compra ... es sólo del administrador": falso. El
            // vendedor carga el alta del vehículo (POST es admin+vendedor) y la ficha
            // muestra el precio de compra sin gate de rol. Lo que sí es sólo del
            // administrador es el reporte de Rentabilidad (authorize('admin')).
            'No ve el reporte de Rentabilidad: el margen de cada unidad, con el precio de compra y todos los gastos ya descontados, es sólo del administrador.',
            'No ve el Ranking de vendedores ni el reporte de Comisiones. Ve su propio objetivo del mes y su avance, no el de los compañeros.',
            // Decía "no ve la antigüedad del stock": falso, la lista de Vehículos trae la
            // columna de días en stock y el orden por antigüedad para todos los roles.
            // Lo admin-only es el capital inmovilizado (reporte stock-antiguedad).
            'Ve hace cuántos días está cada auto en stock, pero no cuánta plata tenés parada ahí: el capital inmovilizado sale a precio de compra y es sólo del administrador.',
            // Este punto había quedado acotado a cinco sustantivos porque ventas,
            // reservas, financiaciones, ingresos y archivos no tenían candado por rol.
            // Ahora lo tienen —anular es authorize('admin')— así que vuelve a decir
            // lo que el dueño quiere oír, y esta vez es cierto. Se dice "anular
            // operaciones" y no "no borra nada": tasaciones, seguimientos e intereses
            // sí los da de baja, porque son su propia agenda de trabajo.
            // Decía también "una seña": es FALSO y hay que decirlo con precisión, porque
            // el dueño lee esto y decide a quién le da qué perfil. El DELETE de reservas
            // está cerrado a admin, pero el front no lo usa NUNCA: cancela por
            // PATCH /reservas/:id con estado 'cancelada', que es admin+vendedor y hace
            // lo mismo (libera el vehículo, lo republica en Mercado Libre y registra el
            // movimiento). Y está bien que sea así: el cliente que se arrepiente lo
            // atiende el vendedor, en el momento, o la unidad queda bloqueada.
            'No anula operaciones. Una venta, un plan de financiación o un acta de ingreso los carga y los corrige, pero darlos de baja es del administrador. Lo mismo con vehículos, clientes, presupuestos, gastos y proveedores.',
            'La seña es la excepción, y es a propósito: si el cliente se arrepiente, el vendedor la cancela en el momento y el auto vuelve a publicarse solo. Queda en Auditoría con nombre y fecha.',
            // Decía "ni un extra, ni el usado que se tomó en canje": de las tres, sólo
            // la del pago era cierta. El canje se CERRÓ a admin al detectar esto (es el
            // renglón que baja el total de la venta: un usado de $8.000.000 se descuenta
            // de lo que el cliente debe, y borrarlo y recargarlo con otro valor era el
            // único camino que le quedaba al vendedor para mover el neto de una
            // operación cerrada). El extra queda abierto A PROPÓSITO y por eso se dice
            // acá en vez de esconderlo: es un renglón de $30.000 mal tipeado, se corrige
            // en el mismo acordeón donde se cargó, y queda auditado igual.
            'Tampoco saca un pago ya registrado en una venta ni el usado que se tomó en canje: ésos los quita sólo el administrador, y queda en Auditoría con nombre y fecha.',
            'Los extras de la venta sí los corrige él —los carga y los quita en el mismo lugar—, porque son la carga de su propia operación y no plata que ya entró. También queda en Auditoría.',
            // "ni a Gastos Fijos" era falso: el ítem no tiene gate en el menú y el GET del
            // listado tampoco. Lo que sí es del administrador es cargarlos y editarlos.
            // Decía "no entra a Usuarios" a secas y era falso a nivel servidor: GET
            // /usuarios no lleva authorize porque media docena de pantallas lo usan de
            // lookup para el combo de "vendedor asignado". Lo que se hizo es RECORTAR la
            // respuesta para los no-admin (nombre y rol; sin mail ni comisión), así que
            // ahora la frase dice exactamente eso.
            'No entra a Auditoría ni administra Usuarios, y no carga la cotización del dólar. Del equipo ve los nombres y qué hace cada uno —los necesita para asignar—, no los mails ni las comisiones. Gastos Fijos los ve, pero cargarlos y editarlos es del administrador.',
            'No vincula la cuenta de WhatsApp ni la de Mercado Libre, y no publica avisos: eso lo hace el administrador. Sí responde y atiende las dos bandejas.',
            'En WhatsApp y en las preguntas de Mercado Libre ve sólo lo que tiene asignado o lo que no tiene dueño. Si intenta responder la pregunta de otro vendedor, el sistema se lo rechaza.',
            'En Consultas ve su cartera, no la del resto del equipo.',
            'No importa clientes en lote desde una planilla: eso es del administrador.',
        ],
    },
    {
        id: 'cobrador',
        nombre: 'Cobrador',
        resumen:
            'El que sale a buscar la plata de las cuotas. Entra a un contrato, registra el pago y emite el recibo. Su trabajo pasa por dos pantallas, aunque en el menú le aparezcan más.',
        // Decía "ve dos cosas nada más": el tablero le muestra además las cuatro
        // tarjetas de conteo y el gráfico de distribución del stock, que no están
        // gateados por rol. Lo que sí es exclusivamente suyo son las dos alertas.
        diaTipico:
            'Abre el tablero y sus dos señales son las cuotas que están en mora y las que vencen en los próximos días: son las únicas alertas que le aparecen. Con eso arma la ruta del día. Cada cobro que registra queda con fecha, monto, método y referencia, y el recibo sale al momento.',
        modulos: [
            'Dashboard',
            'Financiación',
            'Reportes → Caja mensual',
            'Reportes → Cartera de mora',
            'Reportes → Por vencer',
        ],
        notaMenu:
            'Son los módulos donde trabaja, no un menú recortado: hoy el menú le esconde las bandejas (Consultas, WhatsApp, Mercado Libre, Seguimientos y Tasaciones), Usuarios y Auditoría, y los reportes que no le corresponden no le abren. El resto de las pantallas de la concesionaria le siguen apareciendo, pero en Ventas, Movimientos y la ficha del auto va a ver sólo los botones que su perfil puede usar.',
        tareas: [
            {
                titulo: 'Cobrar una cuota',
                pasos: [
                    'Entrá a Financiación y abrí el contrato del cliente.',
                    'Elegí la cuota y registrá el pago: monto, método, fecha y referencia.',
                    'Si el cliente paga una parte, cargá lo que trajo. La cuota queda en parcial con el saldo que falta. No se puede cargar más que el saldo.',
                    'Bajá el recibo de la cuota en PDF y entregáselo.',
                    'Si tocás dos veces o se corta internet y reintentás, el sistema no cobra dos veces la misma cuota.',
                ],
                pantalla: 'Financiación',
            },
            {
                titulo: 'Armar la ruta de la mora',
                pasos: [
                    'Entrá a Reportes → Cartera de mora.',
                    'Tenés cuota por cuota: cliente, teléfono, qué auto compró, número de cuota, vencimiento, días de atraso y saldo adeudado.',
                    'Abajo, el resumen: cuántas cuotas vencidas hay, cuántos clientes distintos y el total por moneda.',
                    'Bajalo a Excel si querés repartirlo o imprimirlo.',
                ],
                pantalla: 'Reportes → Cartera de mora',
            },
            {
                titulo: 'Llamar antes de que se atrase',
                pasos: [
                    'Entrá a Reportes → Por vencer y elegí la ventana de días (por defecto, los próximos siete).',
                    'Te lista las cuotas que están por caer, con el cliente y el teléfono.',
                    'Es la misma cuenta que la campanita del tablero: lo que ves ahí es lo que vas a ver acá.',
                ],
                pantalla: 'Reportes → Por vencer',
            },
        ],
        noPuede: [
            // Punto nuevo: hasta que las pantallas de operación tuvieron candado,
            // el cobrador podía registrar una venta o tomar una seña con sólo abrir
            // la URL. Ahora el servidor se lo niega, y eso define su puesto.
            // La segunda oración decía "esas pantallas las abre para mirar... no para
            // operarlas" e incluía Ventas, justo la pantalla donde el cobrador SÍ opera:
            // POST /ventas/:id/pagos es admin+vendedor+cobrador, y el formulario está
            // adentro del detalle de la venta. Dos bullets seguidos que se desmentían,
            // en la única lista que esta página tiene para ofrecer como prueba.
            'No registra ventas, no toma señas y no da de alta unidades. Reservas y Vehículos los abre para mirar de dónde viene el contrato que está cobrando; a Ventas entra además a cargarle el pago.',
            'Registra el cobro —la cuota o el pago de la venta— pero no lo saca después. Anular un pago ya cobrado o dar de baja una financiación es del administrador.',
            // No estaba dicho en ningún lado y es permiso que ya tiene: la tarjeta de
            // módulo vende "refinanciación del saldo real cuando hace falta" como
            // función del producto, y el que la usa es él.
            'Sí arma planes de financiación propia y refinancia el saldo cuando el cliente no llega: es la herramienta con la que cierra una visita a un moroso. Lo que no puede es dar de baja el contrato.',
            'De los reportes ve tres: Caja mensual, Cartera de mora y Por vencer. Ventas, Rentabilidad, Ranking, Comisiones, Objetivos, Postventa y Documentación le dan permiso denegado.',
            'No puede bajar el estado de cuenta del cliente en PDF: ese documento está habilitado para el administrador y el vendedor.',
            'No entra a Consultas, WhatsApp, Mercado Libre, Seguimientos ni Tasaciones: no le aparecen en el menú y el servidor tampoco se los da.',
            'No da de alta usuarios, no toca los datos de la concesionaria ni las integraciones.',
        ],
    },
    {
        id: 'postventa',
        nombre: 'Postventa / Taller',
        resumen:
            'El que atiende el reclamo después de la entrega y maneja la agenda del taller. Trabaja sobre unidades ya vendidas.',
        diaTipico:
            'Abre el tablero y ve los turnos de taller de los próximos días y las unidades del stock con la VTV o el seguro por vencer. Va abriendo los casos que entran, los clasifica, les da turno, carga los trabajos que se hicieron y los cierra. Antes de irse, deja agendado el próximo service de los clientes que atendió.',
        modulos: [
            'Dashboard',
            'Postventa → Casos',
            'Postventa → Agenda de taller',
            'Postventa → Tipos de caso',
            'Movimientos (para marcar el retorno de la unidad que vuelve del taller)',
            'Vehículos → Archivos (para adjuntar las fotos del trabajo)',
            'Ventas (para marcar la unidad como entregada)',
            'Reportes → Postventa',
            'Reportes → Documentación',
            'Reportes → Próx. service',
        ],
        notaMenu:
            'Son los módulos donde trabaja, no un menú recortado: hoy el menú le esconde las bandejas (Consultas, WhatsApp, Mercado Libre, Seguimientos y Tasaciones), Usuarios y Auditoría, y los reportes que no le corresponden no le abren. El resto de las pantallas de la concesionaria le siguen apareciendo, pero en Ventas, Movimientos y la ficha del auto va a ver sólo los botones que su perfil puede usar.',
        tareas: [
            {
                titulo: 'Abrir un caso',
                pasos: [
                    'En Postventa → Casos, abrí el reclamo sobre la venta correspondiente. Siempre cuelga de una unidad vendida, con su cliente.',
                    'Elegí el tipo del catálogo propio de la concesionaria (mecánica, climatización, tapicería, lo que hayas cargado) y escribí el reclamo.',
                    'Poné el turno de taller con día y hora. Ese turno se ve en la agenda y en el tablero.',
                    'Bajá la orden de servicio en PDF: sale con el cliente, el auto, el reclamo, el turno y la tabla de trabajos.',
                ],
                pantalla: 'Postventa → Casos',
            },
            {
                titulo: 'Cargar los trabajos y ver si el caso dejó plata',
                pasos: [
                    'Dentro del caso, cargá cada trabajo o repuesto: proveedor, fecha, descripción, monto y comprobante. Eso es el costo del caso.',
                    'Si al cliente le facturaste algo, cargá el monto facturado.',
                    'El margen del caso es lo facturado menos los trabajos. Si todavía no facturaste, el sistema deja el margen sin dato en vez de ponerlo en cero, para no ensuciar el total.',
                    'Movés el caso de pendiente a en curso y después a resuelto. Al resolverlo queda la fecha de cierre.',
                ],
                pantalla: 'Postventa → Casos',
            },
            {
                titulo: 'Manejar la agenda y traer al cliente de vuelta',
                pasos: [
                    // Los tres pasos de abajo son permisos que el servidor ya le daba y
                    // que esta sección no enseñaba: la función quedaba muerta y la
                    // unidad figuraba "en taller" para siempre porque nadie cerraba el
                    // movimiento.
                    'Cuando la unidad vuelve del taller, entrá a Movimientos y marcá el retorno: si no, el auto queda figurando en preparación en el stock y en el reporte de documentación.',
                    'La foto del trabajo hecho subila a la ficha del auto, pestaña Archivos. Es la ficha que sale en el PDF y en la publicación de Mercado Libre. La portada la elige el vendedor.',
                    'Cuando la entregás, marcala como entregada desde la venta. Anular la operación no: eso es del administrador.',
                    'La pestaña Agenda de taller te muestra los turnos, con el recordatorio por WhatsApp a mano.',
                    'En cada caso dejá cargada la fecha del próximo service.',
                    'Reportes → Próx. service te arma la lista de a quién hay que llamar para que vuelva.',
                    'Reportes → Documentación te marca qué unidades del stock tienen la VTV o el seguro vencido o por vencer.',
                ],
                pantalla: 'Postventa → Agenda de taller',
            },
        ],
        noPuede: [
            'No ve Consultas, WhatsApp, Mercado Libre, Seguimientos ni Tasaciones: no le aparecen en el menú y el servidor tampoco se los da.',
            'De los reportes tiene tres pestañas: Postventa, Documentación y Próx. service. Ventas, caja, mora, ranking, comisiones y rentabilidad no las ve.',
            // Punto nuevo, por la misma razón que el del cobrador: hasta que las
            // pantallas de operación tuvieron candado, este perfil podía registrar
            // una venta o una seña entrando por la URL.
            // Decía "las operaciones las mira": falso, y era la afirmación que le
            // escondía al taller tres permisos que YA tiene. Las tres negaciones sí son
            // ciertas; lo que hacía falta era decir lo que sí puede, que está más abajo
            // en `tareas` y en `modulos`.
            'No registra ventas, no toma señas y no arma planes de financiación. Su trabajo empieza después de la entrega.',
            'Crea y edita los tipos de caso del catálogo, pero borrarlos es del administrador.',
            'No borra casos de postventa: la baja la hace el administrador.',
            // Decía "no toca ... gastos fijos" a secas, y eso se leía como que no los ve.
            // Los ve: el ítem no tiene gate en el menú y el GET del listado tampoco.
            'No da de alta usuarios ni edita los datos de la concesionaria. Los gastos fijos los ve, pero cargarlos y editarlos es del administrador.',
        ],
    },
    {
        id: 'admin',
        nombre: 'Administrador (el dueño o el gerente)',
        resumen:
            // Decía "el precio de compra" en esta enumeración y era falso: el vendedor
            // lo carga al dar de alta la unidad, así que no puede ser exclusivo del
            // administrador. La corrección ya se había aplicado al bullet del vendedor
            // (más arriba) y este resumen había quedado repitiendo la versión vieja. Lo
            // que sí se cerró en la misma pasada es la lista de compras por proveedor,
            // que era el único lugar donde el costo de cada unidad se veía en grilla.
            'El perfil del que se hace cargo del negocio. Ve todo lo de la concesionaria y es el único que ve la plata fina: el margen por unidad, el capital inmovilizado, el ranking, las comisiones y lo que se le pagó a cada proveedor por cada auto.',
        diaTipico:
            'Abre el tablero completo: ventas del mes, ingresos y egresos con el resultado neto, la mora, la tendencia de los últimos seis meses, el objetivo del mes con su barra, la actividad reciente del equipo y las ocho alertas juntas. Desde ahí baja a lo que le llamó la atención. A fin de mes cierra los números, revisa objetivos y liquida comisiones.',
        modulos: [
            'Todas las pantallas de la concesionaria',
            'Reportes: las once pestañas',
            'Usuarios',
            'Auditoría',
            'Sucursales',
            'Gastos Fijos',
            'Cotización del dólar',
            'Ajustes: datos y marca',
            'Ajustes: integraciones',
        ],
        tareas: [
            {
                titulo: 'Ver cuánto dejó cada auto',
                pasos: [
                    'Entrá a Reportes → Rentabilidad y elegí el rango de fechas y la sucursal.',
                    'Tenés una fila por unidad vendida: precio de venta, precio de compra, gastos cargados, cuánto quedó y el margen.',
                    'Si una fila muestra el margen en blanco, tocá el detalle: te dice qué importes no pudo restar y en qué moneda. No te inventa el número.',
                    'Si querés todo en una sola moneda, cargá la cotización del día en Ajustes y volvé a consolidar. El reporte te aclara qué cotización usó.',
                    'Bajalo a Excel si lo querés trabajar aparte.',
                ],
                pantalla: 'Reportes → Rentabilidad',
            },
            {
                titulo: 'Cerrar el mes',
                pasos: [
                    'Cargá los gastos fijos del mes en Gastos Fijos: alquiler, sueldos, servicios, con su categoría y su sucursal.',
                    'Entrá a Reportes → Caja mensual: te cruza lo que entró (cobros de ventas y de cuotas) con lo que salió (gastos de unidades más gastos fijos) y te deja el neto por moneda.',
                    'Mirá Reportes → Ventas para el detalle de qué se vendió y a quién.',
                    'Revisá la mora en Reportes → Cartera de mora antes de dar el mes por cerrado.',
                ],
                pantalla: 'Gastos Fijos y Reportes',
            },
            {
                titulo: 'Poner objetivos y liquidar comisiones',
                pasos: [
                    'En Usuarios, poné el porcentaje de comisión de cada vendedor en su ficha.',
                    'Fijá la meta del mes de la concesionaria (unidades y/o facturado): aparece en el tablero con la barra de avance.',
                    'Fijá el objetivo mensual de cada vendedor. Cada uno ve el suyo en su tablero, no el de los demás.',
                    'A fin de mes, Reportes → Objetivos te muestra el avance de cada uno, Ranking quién vendió qué, y Comisiones lo que hay que pagarle, con la liquidación en PDF.',
                ],
                pantalla: 'Usuarios y Reportes',
            },
            {
                titulo: 'Dar de alta al equipo',
                pasos: [
                    'En Usuarios, cargá nombre, mail, sucursal y uno o más roles. Una misma persona puede ser vendedor y cobrador.',
                    'Si alguien pierde la contraseña, se la reseteás desde acá. Cada uno también puede cambiar la suya solo.',
                    'Cuando alguien deja de trabajar, lo das de baja: deja de entrar, pero todo lo que hizo queda en el historial.',
                    'La cantidad de usuarios tiene un cupo por concesionaria: si lo alcanzaste, el sistema no te deja crear uno más.',
                ],
                pantalla: 'Usuarios',
            },
            {
                titulo: 'Saber quién tocó qué',
                pasos: [
                    'Entrá a Auditoría. Cada operación quedó registrada: qué se creó, editó, anuló o dio de baja, quién lo hizo, cuándo, desde qué dirección y desde qué navegador.',
                    'Filtrá por fecha, por tipo de registro, por acción o por persona.',
                    'Abrí el detalle de una línea para ver qué decía exactamente esa operación.',
                    'Bajalo a Excel si necesitás guardarlo o mostrarlo.',
                ],
                pantalla: 'Auditoría',
            },
            {
                titulo: 'Dejar el sistema con tu cara y conectar los canales',
                pasos: [
                    'En Ajustes cargá los datos de la concesionaria, subí el logo y elegí los colores y el pie: eso sale impreso en todos los documentos que le entregás al cliente.',
                    'En Integraciones configurás el canal de formularios de Instagram y Facebook (los Lead Ads de Meta), y la casilla de correo que el sistema revisa cada cinco minutos. Las claves quedan guardadas cifradas y en pantalla se ven tapadas.',
                    'La misma pantalla te muestra el último dato que entró por cada canal y el último error, así sabés si está andando sin llamar a nadie.',
                    'WhatsApp se vincula escaneando un QR, como WhatsApp Web. Mercado Libre se vincula autorizando tu propia cuenta (leé el estado honesto más abajo).',
                ],
                pantalla: 'Ajustes',
            },
        ],
        noPuede: [
            'No puede pasarse del cupo de usuarios de la concesionaria: ese número lo fija la administración de la plataforma.',
            'No ve ni toca datos de otra concesionaria.',
            'No puede borrar una sucursal que tenga operaciones vivas: el sistema lo rechaza y te obliga a desactivarla, para no romper el histórico.',
            // Decía "No puede hacer desaparecer un registro" en absoluto. Hay cuatro
            // modelos chicos sin baja lógica (cotización, meta, objetivo de vendedor e
            // interés en un vehículo) que sí se borran físicamente. Se acota a lo que
            // la extensión de Prisma cubre de verdad; la parte de Auditoría es cierta
            // siempre, porque el registro se escribe igual.
            'No puede hacer desaparecer un vehículo, un cliente, una venta, una reserva, un presupuesto, un gasto, una financiación ni un caso de postventa: esas bajas son lógicas, el dato queda marcado. Y toda baja queda en Auditoría con nombre y fecha.',
        ],
    },
    {
        id: 'lectura',
        nombre: 'Consulta (sólo mirar)',
        // El resumen se había acotado a "ve las pantallas" porque el candado de
        // operación no existía y no se lo podía vender como "mirar y no operar".
        // Ahora sí existe y lo aplica el servidor, así que el rol vuelve a
        // describirse por lo que es: consulta de verdad, no un menú recortado.
        resumen:
            'Para el que entra a buscar un dato y no a trabajar: el contador, un socio, alguien de administración. Mira y no toca: no crea, no edita y no da de baja nada. Los reportes y las bandejas de atención los tiene cerrados.',
        diaTipico:
            'Entra, busca lo que necesita y se va. Ve el stock, los clientes, las ventas, las reservas, los presupuestos, los gastos, las financiaciones, la postventa, los proveedores y las sucursales. No tiene tablero de trabajo ni bandejas que atender. Y no opera: no registra una venta, no toma una seña, no arma un plan de cuotas, no carga el ingreso de una unidad ni le sube un archivo a la ficha de un auto, y tampoco da de baja nada. En las pantallas de operación directamente no le aparecen los botones de alta ni los de baja, y si alguien probara la dirección a mano el servidor tampoco lo dejaría: el límite está en los dos lados.',
        modulos: [
            'Vehículos y Comparador',
            'Clientes',
            'Reservas',
            'Ventas',
            'Presupuestos',
            'Ingresos y Movimientos',
            'Gastos Unidades y Gastos Fijos',
            'Financiación y Fin. Externa',
            'Postventa',
            'Proveedores y Sucursales',
        ],
        tareas: [
            {
                titulo: 'Buscar un dato puntual',
                pasos: [
                    'Usá el buscador de arriba (Ctrl o Cmd + K): escribís y te aparecen vehículos, clientes y proveedores.',
                    'Entrá a la ficha y mirá las pestañas: en un auto, sus gastos, movimientos y operaciones; en un cliente, sus ventas, reservas y financiaciones.',
                ],
                pantalla: 'Buscador y fichas',
            },
            {
                titulo: 'Revisar el stock',
                pasos: [
                    'Entrá a Vehículos y filtrá por estado, tipo o sucursal.',
                    'Abrí la ficha de la unidad que te interese para ver el detalle.',
                ],
                pantalla: 'Vehículos',
            },
        ],
        noPuede: [
            // El primero es el que define al rol, así que va primero. Antes este
            // punto no existía porque las pantallas de operación no tenían candado.
            'No registra nada: ni una venta, ni una seña, ni un plan de cuotas, ni un ingreso de unidad, ni un movimiento al taller, ni un archivo en la ficha de un auto. Tampoco edita ni da de baja. Es el único perfil que sólo lee.',
            'No entra a ningún reporte. Si abre la pantalla Reportes, no tiene ninguna pestaña habilitada.',
            // "Seguimientos" y "Usuarios" eran los dos flojos de esta enumeración. La
            // bitácora del cliente (la nota libre del vendedor sobre la negociación) se
            // leía entera desde la pestaña Seguimiento de cualquier ficha, y ahora está
            // cerrada de verdad. Con Usuarios el arreglo fue otro —hay pantallas que
            // necesitan el lookup de nombres—, así que la frase dice lo que pasa.
            'No ve Consultas, WhatsApp, Mercado Libre, Tasaciones ni Auditoría. Tampoco la bitácora de seguimiento de un cliente: lo que el vendedor anota de la negociación no le aparece.',
            'De los usuarios no ve nada: ni el listado, ni los mails, ni quién cobra qué comisión.',
            'No exporta a Excel y no ve el historial de precios de una unidad.',
        ],
    },
    {
        id: 'super_admin',
        nombre: 'Administración de la plataforma',
        resumen:
            'No es un puesto del salón: es la cuenta de mantenimiento del sistema. Da de alta la concesionaria, sus sucursales y sus usuarios, y fija el cupo de usuarios.',
        diaTipico:
            'No tiene día en la concesionaria. Cuando entra, el sistema lo saca del salón y lo manda a su propio panel, que tiene tres pantallas: Concesionarias, Sucursales y Usuarios. No ve stock, ni ventas, ni consultas desde su sesión. Es transparente decirlo: es el único perfil que, por diseño, puede entrar a cualquier concesionaria, porque es el que las da de alta y las mantiene.',
        modulos: [
            'Plataforma → Concesionarias',
            'Plataforma → Sucursales',
            'Plataforma → Usuarios',
        ],
        tareas: [
            {
                titulo: 'Dar de alta una concesionaria',
                // Estos pasos estaban en impersonal ("Se crea la concesionaria...") y
                // eran los únicos del archivo fuera del voseo imperativo del resto.
                pasos: [
                    'En Plataforma → Concesionarias, tocá "Nueva Concesionaria" y cargá sus datos y el cupo de usuarios que le corresponde.',
                    'Pasá a Plataforma → Sucursales y cargá los locales de esa concesionaria, eligiéndola en el selector.',
                    'En Plataforma → Usuarios, creá el usuario administrador sobre esa concesionaria. A partir de ahí el dueño maneja todo lo suyo sin depender de nadie.',
                ],
                pantalla: 'Panel de plataforma',
            },
            {
                titulo: 'Agregar una sucursal a una concesionaria que ya está andando',
                pasos: [
                    'Entrá a Plataforma → Sucursales y tocá "Nueva Sucursal".',
                    'Elegí a qué concesionaria pertenece y cargá el nombre y los datos del local.',
                    'Desde ahí en adelante, cada vehículo, venta, gasto y reserva de esa concesionaria puede quedar asignado a la sucursal nueva, y sus reportes se filtran por ella.',
                ],
                pantalla: 'Plataforma → Sucursales',
            },
            {
                titulo: 'Subirle el cupo de usuarios a un cliente que suma vendedores',
                pasos: [
                    'Entrá a Plataforma → Concesionarias y abrí la ficha de la concesionaria con el botón de editar.',
                    'Cambiá el límite de usuarios y guardá. Es el número que el administrador de esa concesionaria no puede tocar por su cuenta.',
                    'Avisale: recién con el cupo nuevo va a poder dar de alta al empleado que le rebotaba.',
                ],
                pantalla: 'Plataforma → Concesionarias',
            },
        ],
        // Antes decía "No opera el día a día...", y eso quedaba bajo un cartel de
        // bloqueo que acá no aplica: al super_admin lo saca del salón un redirect de
        // navegador, no el servidor (el authorize tiene bypass explícito para él).
        // Se cuenta como lo que es: una decisión de producto sobre dónde arranca su
        // sesión, apoyada en el párrafo de transparencia del día típico.
        noPuede: [
            'Su sesión no arranca en las pantallas de la concesionaria: al entrar, el sistema lo manda derecho a su panel de plataforma. No tiene stock, ni ventas, ni consultas, ni campanita de alertas ahí.',
        ],
    },
];

/* ------------------------------------------------------------------ */
/* D) Los módulos, agrupados como están en el menú                     */
/* ------------------------------------------------------------------ */

export interface Modulo {
    nombre: string;
    seccion: string;
    qué: string;
    /** Ids de ROLES que lo ven en el menú. Adentro, cada acción tiene su permiso. */
    roles: string[];
}

const TODOS = ['admin', 'vendedor', 'cobrador', 'postventa', 'lectura'];

export const MODULOS: Modulo[] = [
    {
        nombre: 'Dashboard',
        seccion: 'General',
        qué: 'El tablero de entrada. Cada rol ve las señales de su trabajo: el vendedor sus consultas y reservas, el cobrador su mora, el de postventa sus turnos. El administrador ve además el resultado del mes, la tendencia de ventas, la meta y las ocho alertas juntas.',
        roles: TODOS,
    },
    {
        nombre: 'Vehículos',
        seccion: 'Gestión de Stock',
        qué: 'La ficha de cada unidad, con precio de compra, precio de lista, VTV, seguro, estado y sucursal. De la ficha cuelgan las fotos y archivos, los gastos, los movimientos, los presupuestos, las reservas, la venta, los interesados y el historial de precios. Ficha en PDF para el cliente, catálogo del stock filtrado y exportación a Excel.',
        roles: TODOS,
    },
    {
        nombre: 'Comparador',
        seccion: 'Gestión de Stock',
        qué: 'Elegís hasta tres unidades del stock y las ponés lado a lado con foto, ficha, kilómetros y precio. Arma el enlace para mandarle la comparación al cliente por WhatsApp.',
        roles: TODOS,
    },
    {
        nombre: 'Ingresos',
        seccion: 'Gestión de Stock',
        qué: 'El acta de cómo entró cada unidad: compra a proveedor, compra a particular, permuta, consignación u otro, con el valor tomado, de quién vino y quién lo registró.',
        roles: TODOS,
    },
    {
        nombre: 'Movimientos',
        seccion: 'Gestión de Stock',
        qué: 'Traslados entre sucursales y envíos a preparación (mecánico, taller, chapa y pintura, lavadero, electricista, gomería). Mientras no marques el retorno, la unidad figura afuera.',
        roles: TODOS,
    },
    {
        nombre: 'Reservas',
        seccion: 'Gestión de Stock',
        qué: 'Las señas: monto, moneda, método de pago y vencimiento. Al tomarla el auto queda reservado; al cancelarla vuelve a publicado. Comprobante en PDF y aviso de las que están por vencer.',
        roles: TODOS,
    },
    {
        nombre: 'Gastos Unidades',
        seccion: 'Gestión de Stock',
        qué: 'Cada peso que se le mete a un auto, atado a esa unidad: fecha, monto, moneda, proveedor, descripción y comprobante. Es lo que después descuenta el reporte de Rentabilidad.',
        roles: TODOS,
    },
    {
        nombre: 'Consultas',
        seccion: 'Operaciones',
        qué: 'Las que nadie atendió todavía, con los días que llevan esperando; el embudo de cada vendedor con las horas hasta su primer contacto; y la conversión por canal. El vendedor ve su cartera, el administrador ve todo el equipo.',
        roles: ['admin', 'vendedor'],
    },
    {
        nombre: 'WhatsApp',
        seccion: 'Operaciones',
        qué: 'Bandeja compartida del número de la concesionaria: hilos ordenados por actividad, no leídos, filtro de "sin responder", búsqueda y asignación del chat a un vendedor. El hilo se engancha solo al cliente si el teléfono ya estaba cargado.',
        roles: ['admin', 'vendedor'],
    },
    {
        nombre: 'Mercado Libre',
        seccion: 'Operaciones',
        qué: 'Publicás la unidad desde el sistema, de a una y a pedido, y el aviso sigue al stock: si reservás se pausa, si vendés se cierra, si cambiás el precio se actualiza. Las preguntas entran a una bandeja, se asignan, se responden desde acá y se pasan a cliente con un botón.',
        roles: ['admin', 'vendedor'],
    },
    {
        nombre: 'Clientes',
        seccion: 'Operaciones',
        qué: 'La ficha con datos, etapa del embudo, canal por el que llegó y vendedor asignado. Tiene sus ventas, reservas, presupuestos, financiaciones, solicitudes, postventa, historial de contactos y los autos que le interesan. Exporta a Excel, y el administrador puede importar la cartera vieja en lotes de hasta trescientas filas.',
        roles: TODOS,
    },
    {
        nombre: 'Seguimientos',
        seccion: 'Operaciones',
        qué: 'La agenda de contactos: a quién había que llamar hoy, qué quedó atrasado y qué viene. Cada contacto queda con su tipo, su nota y la fecha del próximo llamado.',
        roles: ['admin', 'vendedor'],
    },
    {
        nombre: 'Tasaciones',
        seccion: 'Operaciones',
        qué: 'La valuación del usado que trae el cliente antes de que exista como unidad del stock: marca, modelo, año, kilómetros, dominio, condición y valor estimado, con el tasador y la fecha. Sale en PDF para entregar.',
        roles: ['admin', 'vendedor'],
    },
    {
        nombre: 'Proveedores',
        seccion: 'Operaciones',
        qué: 'El mecánico, el chapista, el lavadero, la importadora, la financiera. Cada uno con su ficha y sus pestañas: qué unidades le mandaste, qué le compraste, qué le pagaste y qué trabajos de taller hizo.',
        roles: TODOS,
    },
    {
        nombre: 'Presupuestos',
        seccion: 'Operaciones',
        qué: 'Autos con precio de lista, descuento y precio final; extras aparte; y el usado en canje con su valor tomado. El total se calcula solo. Sale en PDF y se convierte en venta con un botón.',
        roles: TODOS,
    },
    {
        nombre: 'Ventas',
        seccion: 'Operaciones',
        qué: 'La operación con sus pagos, extras y permutas, la forma de pago y el estado de la entrega. Al guardarla se acomoda el stock, la reserva y el presupuesto de una sola vez. Comprobante en PDF.',
        roles: TODOS,
    },
    {
        nombre: 'Financiación',
        seccion: 'Finanzas & Postventa',
        qué: 'La financiación propia: simulador para mostrarle el plan al cliente, alta del plan sobre la venta, plan de cuotas con vencimientos, cobro cuota por cuota con pagos parciales y recibo, y refinanciación del saldo real cuando hace falta.',
        roles: TODOS,
    },
    {
        nombre: 'Fin. Externa',
        seccion: 'Finanzas & Postventa',
        qué: 'Las solicitudes a bancos y financieras: monto pedido, plazo, tasa estimada, papeles adjuntos y el seguimiento hasta que sale aprobada o rechazada, con el monto y la tasa finales. Puede existir sin auto elegido, para la pre-aprobación.',
        roles: TODOS,
    },
    {
        nombre: 'Gastos Fijos',
        seccion: 'Finanzas & Postventa',
        qué: 'Lo que cuesta tener el negocio abierto, mes a mes, por categoría y por sucursal. Alimenta la parte de egresos del reporte de Caja. Cargarlos y editarlos es del administrador.',
        roles: TODOS,
    },
    {
        nombre: 'Postventa',
        seccion: 'Finanzas & Postventa',
        qué: 'Tres vistas: los casos (siempre sobre una unidad vendida), la agenda de taller con los turnos y el catálogo de tipos de caso, que armás vos. Cada caso tiene sus trabajos con proveedor y monto, lo facturado y el próximo service.',
        roles: TODOS,
    },
    {
        nombre: 'Reportes',
        seccion: 'Finanzas & Postventa',
        qué: 'Once pestañas, y cada rol ve sólo las que le corresponden: el vendedor no ve rentabilidad ni comisiones, el cobrador ve caja, mora y por vencer, el de postventa ve taller y documentación. Casi todos se filtran por fecha y sucursal y bajan a Excel.',
        roles: ['admin', 'vendedor', 'cobrador', 'postventa'],
    },
    {
        nombre: 'Sucursales',
        seccion: 'Configuración',
        qué: 'Los locales de la concesionaria. Cada vehículo, venta, gasto y reserva sabe a cuál pertenece, y los reportes se filtran por sucursal. Darlas de alta o de baja es del administrador.',
        roles: TODOS,
    },
    {
        nombre: 'Usuarios',
        seccion: 'Configuración',
        qué: 'El equipo: nombre, mail, sucursal, uno o más roles y el porcentaje de comisión del vendedor. Alta, edición, reseteo de contraseña y baja.',
        roles: ['admin'],
    },
    {
        nombre: 'Auditoría',
        seccion: 'Configuración',
        qué: 'El registro de todo lo que se toca: qué se creó, editó, anuló o dio de baja, quién, cuándo, desde qué dirección y desde qué navegador. Se filtra y baja a Excel.',
        roles: ['admin'],
    },
    {
        nombre: 'Ajustes',
        seccion: 'Configuración',
        qué: 'Los datos de la concesionaria, el logo y los colores que salen en todos los documentos, la cotización del dólar del día, y las integraciones de canales (los formularios de Instagram y Facebook, la casilla de correo, WhatsApp y Mercado Libre). Editar es del administrador; el resto lo ve en gris.',
        roles: TODOS,
    },
    {
        nombre: 'Panel de plataforma',
        seccion: 'Plataforma',
        qué: 'Pantalla aparte, fuera de la concesionaria: alta de concesionarias, sus sucursales y sus usuarios, y el cupo de usuarios de cada una. Es la administración del sistema, no un puesto del salón.',
        roles: ['super_admin'],
    },
];

/* ------------------------------------------------------------------ */
/* E) Los reportes, en criollo                                         */
/* ------------------------------------------------------------------ */

export interface Reporte {
    nombre: string;
    responde: string;
}

export const REPORTES: Reporte[] = [
    {
        nombre: 'Ventas',
        responde: 'Qué vendiste en el período: cada operación con el auto, el dominio, el cliente, el vendedor, la sucursal, la forma de pago y el precio con extras, más los totales por moneda.',
    },
    {
        nombre: 'Caja mensual',
        responde: 'Cuánta plata entró y cuánta salió este mes: cobros de ventas y de cuotas contra gastos de unidades y gastos fijos, con el neto por moneda.',
    },
    {
        nombre: 'Cartera de mora',
        responde: 'Quién te debe y desde cuándo: cada cuota vencida con el cliente, su teléfono, qué auto compró, los días de atraso y el saldo.',
    },
    {
        nombre: 'Rentabilidad',
        responde: 'Cuánto ganaste de verdad en cada auto, con el precio de compra y todos los gastos de la unidad ya descontados. Si hay monedas mezcladas y no cargaste cotización, te avisa qué no pudo restar en vez de inventar el número.',
    },
    {
        nombre: 'Por vencer',
        responde: 'Qué cuotas vencen en los próximos días, para llamar antes de que caigan en mora. La ventana la elegís vos.',
    },
    {
        // Antes figuraba como "Antigüedad del stock" y prometía "la distribución por
        // tramos de días": el backend calcula esos tramos, pero ninguna pantalla los
        // dibuja, así que no se pueden señalar. Se deja lo que sí se ve, y con el
        // nombre con el que aparece de verdad en el sistema.
        nombre: 'Estancadas y capital parado',
        responde: 'Qué autos llevan mucho tiempo sin venderse y cuánta plata tenés parada ahí: la alerta del tablero te da las unidades que pasaron los 60 días con el capital inmovilizado a precio de compra, y en Vehículos tenés la columna de antigüedad en días y el orden por antigüedad.',
    },
    {
        nombre: 'Ranking de vendedores',
        responde: 'Quién vende: unidades, facturado y rentabilidad por vendedor en el período.',
    },
    {
        nombre: 'Comisiones',
        responde: 'Cuánto le tenés que pagar a cada vendedor: su porcentaje, sus unidades, lo facturado y la comisión, por moneda. Con la liquidación detallada en PDF.',
    },
    {
        nombre: 'Estado de cuenta del cliente',
        responde: 'Cuánto debe un cliente puntual: por cada financiación, cuotas pagadas, saldo, cuotas vencidas y cuál es la próxima. Sale en PDF para entregárselo.',
    },
    {
        nombre: 'Ventas mensuales',
        responde: 'Cómo viene la tendencia: unidades y facturado mes a mes, incluyendo los meses en cero.',
    },
    {
        nombre: 'Reservas por vencer',
        responde: 'Qué señas caen pronto: hay que cerrar la venta o liberar el auto.',
    },
    {
        nombre: 'Turnos de taller',
        responde: 'Qué autos entran al taller en los próximos días, con los casos que todavía no están resueltos.',
    },
    {
        nombre: 'Próximos service',
        responde: 'A qué clientes hay que llamarlos para que vuelvan al service.',
    },
    {
        nombre: 'Próximos seguimientos',
        responde: 'A quién tenías que llamar: los contactos agendados, marcando los que ya se te pasaron y los de hoy.',
    },
    {
        nombre: 'Embudo de clientes',
        responde: 'Cuántos clientes tenés en cada etapa: nuevo, contactado, negociando, ganado y perdido.',
    },
    {
        nombre: 'Consultas sin atender (resumen)',
        responde: 'Cuántas consultas están sin atender ahora mismo y hace cuántos días espera la más vieja.',
    },
    {
        nombre: 'Consultas',
        responde: 'Qué consultas quedaron sin atender, cómo las gestiona cada vendedor (con las horas que tarda en hacer el primer contacto) y qué canal te convierte mejor.',
    },
    {
        nombre: 'Postventa',
        responde: 'Cómo anda el taller: casos por estado y por tipo, tiempo promedio de resolución, costo, facturado y margen.',
    },
    {
        nombre: 'Documentación',
        responde: 'Qué autos del stock tienen la VTV o el seguro vencido, y cuáles están por vencer.',
    },
];

/* ------------------------------------------------------------------ */
/* F) Lo que todavía no está terminado, dicho de frente                */
/* ------------------------------------------------------------------ */

export const ESTADO_HONESTO: { titulo: string; detalle: string }[] = [
    {
        titulo: 'La facturación de AFIP está en modo demostración',
        detalle:
            'El circuito de facturación está armado y se puede mostrar en pantalla: determina si el comprobante es A, B o C según la condición de IVA de las dos partes, separa el neto del IVA, numera por punto de venta sin saltos y genera el PDF con el código QR. Pero el CAE que emite hoy es simulado: no tiene validez fiscal. Falta el certificado y la conexión real con AFIP, que es el próximo paso del módulo. Hasta que eso esté, la factura oficial la seguís emitiendo por donde la emitís hoy.',
    },
    {
        titulo: 'Mercado Libre funciona, pero no viene enchufado',
        detalle:
            'Se publica de verdad y el aviso sigue al stock: reservás y se pausa, vendés y se cierra, cambiás el precio y se actualiza. Ahora, para que eso ande hay dos pasos que no son automáticos: hay que cargar las credenciales de la aplicación en el servidor, y cada concesionaria tiene que crear su propia aplicación en el portal de desarrolladores de Mercado Libre y autorizar su cuenta. Aparte, publicar en Mercado Libre lo cobra Mercado Libre, no nosotros: por eso se publica unidad por unidad y siempre a pedido, nunca solo. Si querés verlo antes de conectar nada, hay un modo demostración que muestra el circuito completo sin salir a la red, y todo lo que genera queda rotulado como simulado y afuera de los reportes.',
    },
    {
        titulo: 'De Instagram y Facebook entra el formulario, no el chat',
        detalle:
            'Lo que entra solo es el formulario de campaña: ese que el interesado completa dentro de Instagram o Facebook, sin salir de la app. Cae en Consultas en el momento, con el nombre y el teléfono que dejó y un vendedor ya asignado. Los mensajes directos, los comentarios y Messenger no se leen: si lo probás mandándote un mensaje a vos mismo no va a aparecer, y no está fallando. Dos cosas antes de que funcione, y conviene saberlas de entrada: hay que conectar tu página con una aplicación propia de Meta —trámite de una sola vez, igual que con Mercado Libre— y tener avisos con formulario dando vueltas. Sin campañas publicadas no hay formularios, y sin formularios no entra nada.',
    },
    {
        titulo: 'Con los portales de avisos no hay conexión directa',
        detalle:
            'No hay integración con DeRuedas ni con otros portales de clasificados. Lo que sí hay es un lector de casilla de correo: configurás un mail, y cada cinco minutos el sistema lee los avisos que te llegan ahí, saca el nombre, el teléfono y el mail, y arma la consulta con su vendedor asignado. Sirve para cualquier portal que te avise por correo, pero es eso: leer tu casilla, no estar conectado al portal.',
    },
    {
        titulo: 'WhatsApp no es un bot',
        detalle:
            'El número se vincula escaneando un QR, igual que WhatsApp Web, y te sigue funcionando en el celular. No hay respuestas automáticas ni contestador: los mensajes los escribe una persona desde el panel. Salen espaciados a propósito, con un ritmo variable, para cuidar el número. No es la conexión oficial de Meta para empresas.',
    },
    {
        titulo: 'Los perfiles son cinco y vienen fijos: no se arman a medida',
        // Esta entrada nació admitiendo que las pantallas de operación no tenían
        // control de rol. Ya lo tienen: el candado lo aplica el servidor en todas
        // ellas, y ahora el front además esconde el control que el rol no puede
        // usar (ver hooks/usePermisos.ts), así que la promesa se cumple en las dos
        // capas. La entrada NO se borra ni se convierte en un cartel de logro: se
        // queda en esta sección porque lo que sí sigue siendo un límite real es
        // que el catálogo de perfiles es cerrado (seed de seis roles, sin pantalla
        // para inventar uno nuevo ni para mover un permiso suelto).
        //
        // El "cinco" contra el "6" del encabezado se reconcilia EN EL TEXTO, no se
        // esconde: el hero cuenta seis fichas de rol y esta sección hablaba de cinco
        // perfiles sin que ninguna de las dos frases se hiciera cargo de la otra. El
        // sexto es la cuenta de plataforma, que no es un puesto del salón.
        //
        // Sigue sin enumerar rutas ni endpoints, por lo mismo de siempre: la
        // página es pública y el sistema está en producción. Se nombran pantallas
        // y operaciones, que es lo que el dueño entiende y lo que se puede señalar.
        detalle:
            'Primero lo que cambió, porque es la parte buena: los límites por perfil los aplica el servidor y no el menú. Vale para los reportes de plata, para las bandejas de atención y para las pantallas de operación del día a día: registrar una venta, tomar una seña, armar un plan de cuotas, mandar una unidad al taller o subirle fotos. Saberse la dirección de una pantalla no alcanza para entrar. Y registrar quedó separado de anular: dar de baja una venta, una financiación, un acta de ingreso, un pago ya cobrado o el usado tomado en canje es del administrador. El vendedor carga la operación; no la borra. Dos excepciones, dichas de frente porque son a propósito: la seña la cancela el vendedor cuando el cliente se arrepiente —si no, la unidad queda bloqueada— y los extras de una venta los corrige quien los cargó. Las dos quedan en Auditoría con nombre y fecha. Del lado de la administración hay un matiz que conviene saber: Auditoría es del administrador y punto, pero el listado de usuarios lo necesitan media docena de pantallas para el selector de "vendedor asignado", así que en vez de cerrarlo se recortó — quien no es administrador ve nombres y funciones, no mails ni comisiones. Lo que sigue siendo un límite: los perfiles de la concesionaria son cinco y vienen fijos —administrador, vendedor, cobrador, postventa y consulta— más la cuenta de plataforma, que no se le asigna a nadie del salón y por eso arriba vas a contar seis fichas. No se inventa uno nuevo ni se le corre un permiso suelto a una persona. Si alguien hace dos trabajos, se le dan dos perfiles: vendedor y cobrador a la vez, por ejemplo, y suma los dos. Si tu concesionaria necesita un recorte que no entra en esos cinco, decilo antes de contratar y lo hablamos.',
    },
    {
        titulo: 'La tasación la hace tu tasador, no el sistema',
        detalle:
            'No hay valuación automática ni precio de mercado sugerido. El valor del usado lo pone la persona que tasa, y el sistema lo guarda con su nombre, la fecha y la condición del auto, y lo imprime para el cliente.',
    },
    {
        titulo: 'El sistema te avisa, no decide por vos',
        detalle:
            'La mora te la muestra calculada al día, cuota por cuota. Pero declarar un contrato en mora, dar por vencida una reserva o dar un cliente por ganado son decisiones de una persona, con su botón. No hay ningún proceso que cambie esos estados solo mientras no mirás.',
    },
    {
        titulo: 'Lo que no existe, para que no te lo prometa nadie',
        detalle:
            'No hay aplicación para celular (se usa desde el navegador), no hay página pública de stock para el comprador final, no hay firma digital de documentos, no hay contabilidad, no hay liquidación de sueldos, no hay conexión con el banco ni cobro online.',
    },
];
