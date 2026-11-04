/**
 * Contador de eventos por clave en una ventana deslizante, en memoria. Base de la
 * alerta de fuerza bruta: dice "ya van N fallos contra esta cuenta / desde esta IP
 * en los últimos X minutos". Es un proceso único (una sola instancia del backend),
 * así que memoria alcanza; al reiniciar el contador vuelve a cero, que es aceptable
 * para una ALERTA (el bloqueo real lo hacen los rate limiters, que no dependen de esto).
 */
export class VentanaDeUso {
    private readonly eventos = new Map<string, number[]>();

    constructor(
        private readonly ventanaMs: number,
        /** Tope de claves distintas: evita crecer sin límite ante un barrido de emails. */
        private readonly maxClaves = 10_000,
        private readonly ahora: () => number = Date.now,
    ) { }

    /** Registra un evento y devuelve cuántos hay en la ventana (contando éste). */
    registrar(clave: string): number {
        const t = this.ahora();
        const desde = t - this.ventanaMs;
        const vigentes = (this.eventos.get(clave) ?? []).filter((x) => x > desde);
        vigentes.push(t);
        this.eventos.set(clave, vigentes);
        if (this.eventos.size > this.maxClaves) this.purgar(desde);
        return vigentes.length;
    }

    private purgar(desde: number): void {
        for (const [clave, ts] of this.eventos) {
            if (ts.every((x) => x <= desde)) this.eventos.delete(clave);
        }
        // Si igual sigue lleno (todo vigente), se descartan las más viejas.
        while (this.eventos.size > this.maxClaves) {
            const primera = this.eventos.keys().next().value;
            if (primera === undefined) break;
            this.eventos.delete(primera);
        }
    }
}

/**
 * Decide cuándo una racha de fallos merece ALERTA: se dispara UNA vez, al cruzar el
 * umbral (no en cada intento posterior, que inundaría el log).
 */
export class DetectorFuerzaBruta {
    private readonly porCuenta: VentanaDeUso;
    private readonly porIp: VentanaDeUso;

    constructor(
        private readonly umbralCuenta = 5,
        private readonly umbralIp = 10,
        ventanaMs = 10 * 60 * 1000,
        ahora: () => number = Date.now,
    ) {
        this.porCuenta = new VentanaDeUso(ventanaMs, 10_000, ahora);
        this.porIp = new VentanaDeUso(ventanaMs, 10_000, ahora);
    }

    /** Devuelve qué umbrales acaba de cruzar este fallo (vacío si ninguno). */
    fallo(cuentaHash: string | null, ip: string | null): Array<'cuenta' | 'ip'> {
        const cruzados: Array<'cuenta' | 'ip'> = [];
        if (cuentaHash && this.porCuenta.registrar(cuentaHash) === this.umbralCuenta) cruzados.push('cuenta');
        if (ip && this.porIp.registrar(ip) === this.umbralIp) cruzados.push('ip');
        return cruzados;
    }
}
