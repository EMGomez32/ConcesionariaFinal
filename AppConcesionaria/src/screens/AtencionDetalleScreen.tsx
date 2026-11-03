import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { spacing, radius, fontSize, touchMin } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/theme';
import {
    Card, Badge, Checkbox, Chips, Field, GradientButton, GhostButton, IconButton, KeyboardSafeView, Segmented, Sheet, T, ErrorCarga,
} from '../components/ui';
import { errorMessage } from '../api/client';
import {
    atencionesApi, unidadDeLaVisita, ModoBusqueda, TipoFinanciamiento, CondicionTasacion,
    ResultadoAtencion, ResultadoBusqueda, Sugerencia, UnidadSugerida, TipoSeguimiento,
    num, MOTIVO_LABEL, RESULTADO_LABEL, RESULTADOS_DEFINITIVOS,
    CONDICION_LABEL, CONDICIONES, ESTADO_PERMUTA_LABEL, MEDIO_CONTACTO_LABEL, MEDIOS_CONTACTO,
    faltanDatosDelCliente, codigoDeError, COD_SOLO_TASADOR,
} from '../api/atenciones.api';
import { clienteAOpcion } from '../api/clientes.api';
import { unidadAOpcion } from '../api/vehiculos.api';
import { formatKm, formatMontoInput, montoATexto, parseMonto } from '../lib/formato';

const money = (v: any, m = 'ARS') => {
    const n = num(v);
    if (n == null) return '—';
    return `${m === 'USD' ? 'US$' : '$'}${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
};
const numOr = (s: string): number | undefined => parseMonto(s) ?? undefined;
const tituloUnidad = (u?: UnidadSugerida) => u ? [u.marca, u.modelo, u.version, u.anio].filter(Boolean).join(' ') : 'Unidad';
const enDias = (n: number) => {
    const d = new Date(); d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const MONEDAS = [
    { value: 'ARS' as const, label: 'Pesos' },
    { value: 'USD' as const, label: 'Dólares' },
];


export default function AtencionDetalleScreen({ route, navigation }: any) {
    const s = useStyles();
    const { colors } = useTheme();
    const id: number = route.params?.id;
    const qc = useQueryClient();
    const detalleKey = ['atencion', id];
    const q = useQuery({ queryKey: detalleKey, queryFn: () => atencionesApi.getById(id) });
    const a = q.data;

    // ── Relevamiento ──────────────────────────────────────────────────────
    const [modo, setModo] = useState<ModoBusqueda>('presupuesto');
    const [presMin, setPresMin] = useState('');
    const [presMax, setPresMax] = useState('');
    const [moneda, setMoneda] = useState<'ARS' | 'USD'>('ARS');
    const [anticipo, setAnticipo] = useState('');
    const [cuota, setCuota] = useState('');
    // Lo que se ve elegido es lo que se manda: arranca en Contado (antes se veía
    // "Contado" y se enviaba undefined).
    const [tipoFin, setTipoFin] = useState<TipoFinanciamiento>('contado');
    // Búsqueda por modelo/unidad.
    const [bMarca, setBMarca] = useState('');
    const [bModelo, setBModelo] = useState('');
    const [bDominio, setBDominio] = useState('');

    // ── Canje (el usado que entrega el cliente) ─────────────────────────────
    const [pMarca, setPMarca] = useState('');
    const [pModelo, setPModelo] = useState('');
    const [pDominio, setPDominio] = useState('');
    const [pAnio, setPAnio] = useState('');
    const [pKm, setPKm] = useState('');
    const [pCondicion, setPCondicion] = useState<CondicionTasacion>('bueno');
    const [pValor, setPValor] = useState('');
    // El canje tiene su PROPIA moneda: antes quedaba atada a la de la búsqueda.
    const [pMoneda, setPMoneda] = useState<'ARS' | 'USD'>('ARS');

    // Sembramos desde la atención cargada (una vez).
    const [seeded, setSeeded] = useState(false);
    useEffect(() => {
        if (a && !seeded) {
            if (a.modoBusqueda) setModo(a.modoBusqueda);
            if (num(a.presupuestoMin) != null) setPresMin(montoATexto(num(a.presupuestoMin)));
            if (num(a.presupuestoMax) != null) setPresMax(montoATexto(num(a.presupuestoMax)));
            if (a.moneda === 'USD' || a.moneda === 'ARS') { setMoneda(a.moneda); setPMoneda(a.moneda); }
            if (num(a.anticipo) != null) setAnticipo(montoATexto(num(a.anticipo)));
            if (num(a.cuotaMaxima) != null) setCuota(montoATexto(num(a.cuotaMaxima)));
            if (a.tipoFinanciamiento) setTipoFin(a.tipoFinanciamiento);
            setSeeded(true);
        }
    }, [a, seeded]);

    // ── Datos del cliente (gate Ley 25.326) ────────────────────────────────
    const [datosOpen, setDatosOpen] = useState(false);
    const [dDni, setDDni] = useState('');
    const [dEmail, setDEmail] = useState('');
    const [dDir, setDDir] = useState('');
    const [dConsent, setDConsent] = useState(false);
    const [pendiente, setPendiente] = useState<null | (() => void)>(null);

    // ── Cierre ──────────────────────────────────────────────────────────────
    const [cierreOpen, setCierreOpen] = useState(false);
    const [resElegido, setResElegido] = useState<ResultadoAtencion | null>(null);
    const [proximo, setProximo] = useState('');
    const [medio, setMedio] = useState<TipoSeguimiento>('llamada');
    const [notaCierre, setNotaCierre] = useState('');

    // ── Resultado de búsqueda ────────────────────────────────────────────────
    const [busq, setBusq] = useState<ResultadoBusqueda | null>(null);

    const buscar = useMutation({
        mutationFn: () => atencionesApi.buscar(id, {
            modo,
            presupuestoMin: numOr(presMin),
            presupuestoMax: numOr(presMax),
            anticipo: numOr(anticipo),
            cuotaMaxima: numOr(cuota),
            tipoFinanciamiento: tipoFin,
            moneda,
            marca: bMarca.trim() || undefined,
            modelo: bModelo.trim() || undefined,
            dominio: bDominio.trim() || undefined,
        }),
        onSuccess: (r) => { setBusq(r); qc.invalidateQueries({ queryKey: detalleKey }); },
        onError: (e) => Alert.alert('No se pudo buscar', errorMessage(e)),
    });

    const registrar = useMutation({
        mutationFn: (v: { vehiculoId: number; tipo: 'buscada' | 'sugerida'; motivoSugerencia?: string }) =>
            atencionesApi.registrarUnidad(id, { ...v, accion: 'vista' }),
        onSuccess: () => { Alert.alert('Registrado', 'Quedó anotado en la visita.'); qc.invalidateQueries({ queryKey: detalleKey }); },
        onError: (e, vars) => {
            // Faltaban datos del cliente: se completan y la unidad SE REGISTRA (antes
            // se completaban y la unidad quedaba sin anotar).
            if (faltanDatosDelCliente(e)) return pedirDatos(() => registrar.mutate(vars));
            Alert.alert('No se pudo registrar', errorMessage(e));
        },
    });

    const [soloTasador, setSoloTasador] = useState(false);
    const guardarCanje = useMutation({
        mutationFn: (sinValor: boolean) => atencionesApi.registrarPermuta(id, {
            marca: pMarca.trim(), modelo: pModelo.trim(), dominio: pDominio.trim(),
            anio: numOr(pAnio), km: numOr(pKm), condicion: pCondicion,
            valorEstimado: sinValor ? undefined : numOr(pValor), moneda: pMoneda,
        }),
        onSuccess: () => {
            Alert.alert('Canje cargado', soloTasador ? 'Quedó sin tasar: lo completa el tasador.' : 'Quedó registrado.');
            setPMarca(''); setPModelo(''); setPDominio(''); setPAnio(''); setPKm(''); setPValor('');
            qc.invalidateQueries({ queryKey: detalleKey });
        },
        onError: (e) => {
            if (faltanDatosDelCliente(e)) return pedirDatos(() => guardarCanje.mutate(soloTasador));
            if (codigoDeError(e) === COD_SOLO_TASADOR) { setSoloTasador(true); setPValor(''); guardarCanje.mutate(true); return; }
            Alert.alert('No se pudo cargar el canje', errorMessage(e));
        },
    });

    const completarDatos = useMutation({
        mutationFn: () => atencionesApi.completarCliente(id, {
            dni: dDni.trim() || undefined, email: dEmail.trim() || undefined,
            direccion: dDir.trim() || undefined, consentimientoContacto: dConsent || undefined,
        }),
        onSuccess: () => {
            setDatosOpen(false);
            qc.invalidateQueries({ queryKey: detalleKey });
            const fn = pendiente; setPendiente(null); fn && fn();
        },
        onError: (e) => Alert.alert('No se guardó', errorMessage(e)),
    });

    /** Parámetros para presupuestar o vender con lo que ya se sabe de la visita. */
    const paramsVenta = () => {
        const u = a ? unidadDeLaVisita(a) : undefined;
        return {
            ...(a?.cliente ? { cliente: clienteAOpcion(a.cliente) } : {}),
            ...(u ? { vehiculo: unidadAOpcion(u) } : {}),
        };
    };

    const cerrar = useMutation({
        mutationFn: () => atencionesApi.cerrar(id, {
            resultado: resElegido!,
            proximoContacto: proximo || undefined,
            medioProximoContacto: proximo ? medio : undefined,
            notaProximoContacto: notaCierre.trim() || undefined,
        }),
        onSuccess: () => {
            setCierreOpen(false);
            qc.invalidateQueries({ queryKey: ['atenciones'] });
            qc.invalidateQueries({ queryKey: detalleKey });
            if (resElegido === 'cotizacion') {
                // Se le entregó un presupuesto: se ofrece cargarlo ya, con el cliente
                // (y la unidad) puestos. La espera deja cerrar el modal antes del aviso.
                setTimeout(() => {
                    Alert.alert('Atención cerrada', '¿Cargás ahora el presupuesto que le entregaste?', [
                        { text: 'Ahora no', style: 'cancel', onPress: () => navigation.goBack() },
                        { text: 'Crear presupuesto', onPress: () => navigation.replace('PresupuestoNuevo', paramsVenta()) },
                    ]);
                }, 400);
                return;
            }
            navigation.goBack();
        },
        onError: (e) => Alert.alert('No se pudo cerrar', errorMessage(e)),
    });

    const pedirDatos = (fn: () => void) => {
        const c = a?.cliente;
        setDDni(c?.dni ?? ''); setDEmail(c?.email ?? ''); setDDir(c?.direccion ?? ''); setDConsent(!!c?.consentimientoContacto);
        setPendiente(() => fn);
        setDatosOpen(true);
    };

    const vender = () => {
        const p = paramsVenta();
        const detalle = [
            p.cliente ? `Cliente: ${p.cliente.label}` : null,
            p.vehiculo ? `Unidad: ${p.vehiculo.label}` : 'La unidad la elegís en el paso siguiente.',
        ].filter(Boolean).join('\n');
        Alert.alert('Vender', detalle, [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Crear presupuesto', onPress: () => navigation.navigate('PresupuestoNuevo', p) },
            { text: 'Registrar venta', onPress: () => navigation.navigate('VentaNueva', p) },
        ]);
    };

    const canjeActual = a?.tasaciones?.[0];
    const soloLectura = a?.estado === 'cerrada';

    if (q.isLoading) return <View style={s.center}><ActivityIndicator color={colors.accentText} accessibilityLabel="Cargando" /></View>;
    if (!a) {
        return (
            <View style={[s.center, { padding: spacing.lg }]}>
                <ErrorCarga que="la atención" error={q.error} onRetry={() => { q.refetch(); }} style={{ alignSelf: 'stretch' }} />
            </View>
        );
    }

    const cliente = a.cliente ? [a.cliente.nombre, a.cliente.apellido].filter(Boolean).join(' ') : 'Sin cliente';
    const abierta = a.estado === 'abierta';

    return (
        <KeyboardSafeView style={s.root}>
            <ScrollView style={s.root} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
                {/* Header */}
                <T.H1>{cliente}</T.H1>
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Badge label={abierta ? 'ABIERTA' : 'CERRADA'} tone={abierta ? 'warning' : 'muted'} />
                    <T.Muted>{MOTIVO_LABEL[a.motivo]}</T.Muted>
                    {a.cliente?.telefono ? <T.Muted>· {a.cliente.telefono}</T.Muted> : null}
                </View>

                {abierta ? (
                    <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
                        <GradientButton title="Cerrar atención" onPress={() => setCierreOpen(true)} />
                        <GhostButton
                            title="Vender" icon="dollar-sign" onPress={vender}
                            accessibilityHint="Crear un presupuesto o registrar la venta con este cliente"
                        />
                    </View>
                ) : a.resultado ? (
                    <View style={{ marginTop: spacing.lg }}>
                        <Badge label={RESULTADO_LABEL[a.resultado].toUpperCase()} tone="cyan" />
                    </View>
                ) : null}

                {/* Relevamiento */}
                <Card style={{ marginTop: spacing.lg }}>
                    <T.H2>Qué está buscando</T.H2>
                    <Segmented
                        value={modo} onChange={setModo} accessibilityLabel="Buscar por"
                        options={[{ value: 'presupuesto', label: 'Presupuesto' }, { value: 'modelo', label: 'Modelo' }, { value: 'unidad', label: 'Unidad' }]}
                        style={{ marginTop: spacing.md }}
                    />

                    {modo === 'presupuesto' ? (
                        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                            <Field label="Desde" placeholder="0" keyboardType="numeric" value={presMin} onChangeText={(v) => setPresMin(formatMontoInput(v))} style={{ flex: 1 }} />
                            <Field label="Hasta" placeholder="Tope" keyboardType="numeric" value={presMax} onChangeText={(v) => setPresMax(formatMontoInput(v))} style={{ flex: 1 }} />
                        </View>
                    ) : modo === 'modelo' ? (
                        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                            <Field label="Marca" placeholder="Toyota" value={bMarca} onChangeText={setBMarca} style={{ flex: 1 }} />
                            <Field label="Modelo" placeholder="Corolla" value={bModelo} onChangeText={setBModelo} style={{ flex: 1 }} />
                        </View>
                    ) : (
                        <Field
                            label="Dominio" placeholder="AB123CD" autoCapitalize="characters" autoCorrect={false} spellCheck={false} autoComplete="off"
                            value={bDominio} onChangeText={setBDominio} style={{ marginTop: spacing.md }}
                        />
                    )}

                    <Text style={s.miniLabel}>MONEDA</Text>
                    <Segmented value={moneda} onChange={setMoneda} accessibilityLabel="Moneda de la búsqueda" options={MONEDAS} style={{ marginTop: spacing.xs }} />

                    <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                        <Field label="Anticipo" placeholder="0" keyboardType="numeric" value={anticipo} onChangeText={(v) => setAnticipo(formatMontoInput(v))} style={{ flex: 1 }} />
                        <Field label="Cuota máx." placeholder="0" keyboardType="numeric" value={cuota} onChangeText={(v) => setCuota(formatMontoInput(v))} style={{ flex: 1 }} />
                    </View>
                    <Text style={s.miniLabel}>FINANCIAMIENTO</Text>
                    <Segmented
                        value={tipoFin} onChange={setTipoFin} accessibilityLabel="Financiamiento"
                        options={[{ value: 'contado', label: 'Contado' }, { value: 'credito', label: 'Crédito' }, { value: 'plan_de_ahorro', label: 'Plan', accessibilityLabel: 'Plan de ahorro' }]}
                        style={{ marginTop: spacing.xs }}
                    />

                    {!soloLectura ? (
                        <GradientButton title="Buscar unidades" loading={buscar.isPending} onPress={() => buscar.mutate()} style={{ marginTop: spacing.lg }} />
                    ) : null}
                </Card>

                {/* Resultado de búsqueda */}
                {busq ? (
                    <Card style={{ marginTop: spacing.md }}>
                        <T.H2>Para mostrarle</T.H2>
                        {busq.relevamiento.presupuestoQueMandaElFiltro != null ? (
                            <T.Muted style={{ marginTop: spacing.xs }}>
                                Se filtró con {money(busq.relevamiento.presupuestoQueMandaElFiltro, moneda)} ({busq.relevamiento.origenDelFiltro}).
                            </T.Muted>
                        ) : null}
                        {/* Autos de otra moneda convertidos al blue para poder compararlos.
                            El equivalente en pesos es orientativo; el precio real sigue en su moneda. */}
                        {busq.relevamiento.cotizacion && (busq.relevamiento.unidadesConvertidas ?? 0) > 0 ? (
                            <T.Muted style={{ marginTop: spacing.xs, color: colors.accent3 }}>
                                {busq.relevamiento.unidadesConvertidas} en otra moneda, convertida{(busq.relevamiento.unidadesConvertidas ?? 0) === 1 ? '' : 's'} al dólar {busq.relevamiento.cotizacion.tipo} (${busq.relevamiento.cotizacion.valor.toLocaleString('es-AR')}) para compararlas.
                            </T.Muted>
                        ) : null}

                        {busq.exacta ? (
                            <UnidadRow u={busq.exacta} tag={busq.exactaPorEncimaDelMaximo ? 'sobre el máximo' : 'la buscada'}
                                onVer={() => navigation.navigate('VehiculoDetalle', { id: busq.exacta!.id })}
                                onRegistrar={() => registrar.mutate({ vehiculoId: busq.exacta!.id, tipo: 'buscada' })} />
                        ) : busq.estadoDeLaExacta ? (
                            <T.Muted style={{ marginTop: spacing.sm }}>La unidad buscada no está disponible ({busq.estadoDeLaExacta}).</T.Muted>
                        ) : null}

                        {busq.alternativas.map((alt: Sugerencia) => (
                            <UnidadRow key={alt.unidad.id} u={alt.unidad} motivo={alt.motivo}
                                tag={alt.porEncimaDelMaximo ? 'sobre el máximo' : 'sugerida'}
                                onVer={() => navigation.navigate('VehiculoDetalle', { id: alt.unidad.id })}
                                onRegistrar={() => registrar.mutate({ vehiculoId: alt.unidad.id, tipo: 'sugerida', motivoSugerencia: alt.motivo })} />
                        ))}

                        {busq.aviso ? <T.Muted style={{ marginTop: spacing.sm }}>{busq.aviso}</T.Muted> : null}
                        {busq.exacta == null && busq.alternativas.length === 0 ? (
                            <T.Muted style={{ marginTop: spacing.sm }}>No hay ninguna alternativa que cumpla los criterios.</T.Muted>
                        ) : null}
                    </Card>
                ) : null}

                {/* Unidades ya mostradas en la visita */}
                {a.vehiculos?.length ? (
                    <Card style={{ marginTop: spacing.md }}>
                        <T.H2>En esta visita</T.H2>
                        {a.vehiculos.map((v) => (
                            <View key={v.id} style={s.vehRow}>
                                <T.Body style={{ flex: 1 }}>{tituloUnidad(v.vehiculo)}</T.Body>
                                <Badge label={v.tipo === 'sugerida' ? 'sugerida' : 'la buscó'} tone={v.tipo === 'sugerida' ? 'violet' : 'accent'} />
                            </View>
                        ))}
                    </Card>
                ) : null}

                {/* Canje */}
                <Card style={{ marginTop: spacing.md }}>
                    <T.H2>Canje</T.H2>
                    {canjeActual ? (
                        <View style={s.canjeBox}>
                            <T.Body style={{ fontWeight: '700' }}>{[canjeActual.marca, canjeActual.modelo, canjeActual.anio].filter(Boolean).join(' ')}</T.Body>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs }}>
                                <Badge label={ESTADO_PERMUTA_LABEL[canjeActual.estado].toUpperCase()} tone={canjeActual.estado === 'tasada' ? 'success' : canjeActual.estado === 'rechazada' ? 'danger' : 'warning'} />
                                <T.Muted>{money(canjeActual.valorEstimado, canjeActual.moneda)}</T.Muted>
                            </View>
                        </View>
                    ) : soloLectura ? (
                        <T.Muted style={{ marginTop: spacing.sm }}>No se cargó un canje.</T.Muted>
                    ) : (
                        <View>
                            <T.Muted style={{ marginTop: spacing.xs }}>El usado que el cliente entrega en parte de pago.</T.Muted>
                            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                                <Field label="Marca" placeholder="Del usado" value={pMarca} onChangeText={setPMarca} style={{ flex: 1 }} />
                                <Field label="Modelo" value={pModelo} onChangeText={setPModelo} style={{ flex: 1 }} />
                            </View>
                            <Field
                                label="Dominio *" placeholder="AB123CD" autoCapitalize="characters" autoCorrect={false} spellCheck={false} autoComplete="off"
                                value={pDominio} onChangeText={setPDominio} style={{ marginTop: spacing.sm }}
                            />
                            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                                <Field label="Año" keyboardType="numeric" value={pAnio} onChangeText={(v) => setPAnio(v.replace(/\D/g, '').slice(0, 4))} style={{ flex: 1 }} />
                                <Field label="Km" keyboardType="numeric" value={pKm} onChangeText={(v) => setPKm(formatMontoInput(v))} style={{ flex: 1 }} />
                            </View>
                            <Text style={s.miniLabel}>ESTADO GENERAL</Text>
                            {/* Etiquetas completas: "Muy bueno" no se corta en "Muy". */}
                            <Chips
                                value={pCondicion} onChange={setPCondicion} accessibilityLabel="Estado general del usado"
                                options={CONDICIONES.map((c) => ({ value: c, label: CONDICION_LABEL[c] }))}
                                style={{ marginTop: spacing.xs }}
                            />
                            <Field label="Valor estimado de toma" placeholder="Lo que estimás" keyboardType="numeric" value={pValor} onChangeText={(v) => setPValor(formatMontoInput(v))} style={{ marginTop: spacing.sm }} />
                            <Text style={s.miniLabel}>MONEDA DEL CANJE</Text>
                            <Segmented value={pMoneda} onChange={setPMoneda} accessibilityLabel="Moneda del canje" options={MONEDAS} style={{ marginTop: spacing.xs }} />
                            <GhostButton title="Cargar canje" onPress={() => guardarCanje.mutate(false)} disabled={guardarCanje.isPending} style={{ marginTop: spacing.md }} />
                        </View>
                    )}
                </Card>

                {/* Modal: completar datos del cliente (Ley 25.326) */}
                <Sheet
                    visible={datosOpen}
                    onClose={() => setDatosOpen(false)}
                    title="Completar los datos del cliente"
                    subtitle="Para test drive, presupuesto, reserva o canje hacen falta (Ley 25.326)."
                    footer={<>
                        <GhostButton title="Cancelar" onPress={() => setDatosOpen(false)} style={{ flex: 1, paddingHorizontal: spacing.md }} />
                        <GradientButton title="Guardar" loading={completarDatos.isPending} onPress={() => completarDatos.mutate()} style={{ flex: 1 }} />
                    </>}
                >
                    <Field label="DNI" keyboardType="numeric" value={dDni} onChangeText={setDDni} />
                    <Field label="Email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" value={dEmail} onChangeText={setDEmail} style={{ marginTop: spacing.sm }} />
                    <Field label="Domicilio" value={dDir} onChangeText={setDDir} style={{ marginTop: spacing.sm }} />
                    <Checkbox
                        checked={dConsent}
                        onChange={setDConsent}
                        label="El cliente presta conformidad para ser contactado (Ley 25.326)."
                    />
                </Sheet>

                {/* Modal: cierre */}
                <Sheet
                    visible={cierreOpen}
                    onClose={() => setCierreOpen(false)}
                    title="Cerrar la atención"
                    subtitle="Elegí el resultado. Ninguna visita queda sin explicar."
                    footer={<>
                        <GhostButton title="Cancelar" onPress={() => setCierreOpen(false)} style={{ flex: 1, paddingHorizontal: spacing.md }} />
                        <GradientButton title="Cerrar" loading={cerrar.isPending} disabled={!resElegido} onPress={() => cerrar.mutate()} style={{ flex: 1 }} />
                    </>}
                >
                    <View accessibilityRole="radiogroup" accessibilityLabel="Resultado de la atención">
                        {(Object.keys(RESULTADO_LABEL) as ResultadoAtencion[]).map((r) => {
                            const on = resElegido === r;
                            return (
                                <Pressable
                                    key={r}
                                    onPress={() => setResElegido(r)}
                                    accessibilityRole="radio"
                                    accessibilityLabel={RESULTADO_LABEL[r]}
                                    accessibilityState={{ selected: on, checked: on }}
                                    style={({ pressed }) => [s.resOpt, on && s.resOptOn, pressed && !on && { opacity: 0.7 }]}
                                >
                                    <Text style={[s.resText, on && { color: colors.text, fontWeight: '700' }]}>{RESULTADO_LABEL[r]}</Text>
                                    {on ? <Feather name="check" size={16} color={colors.accentText} /> : null}
                                </Pressable>
                            );
                        })}
                    </View>
                    {resElegido && !RESULTADOS_DEFINITIVOS.includes(resElegido) ? (
                        <View style={{ marginTop: spacing.md }}>
                            <Text style={s.miniLabel}>PRÓXIMO CONTACTO</Text>
                            <Chips
                                value={proximo}
                                onChange={setProximo}
                                accessibilityLabel="Próximo contacto"
                                options={[['Mañana', 1], ['En 3 días', 3], ['En 1 semana', 7]].map(([lbl, n]) => ({ value: enDias(n as number), label: lbl as string }))}
                                style={{ marginTop: spacing.xs }}
                            />
                            <Text style={[s.miniLabel, { marginTop: spacing.md }]}>MEDIO</Text>
                            <Segmented value={medio} onChange={setMedio} accessibilityLabel="Medio del próximo contacto"
                                options={MEDIOS_CONTACTO.slice(0, 3).map((m) => ({ value: m, label: MEDIO_CONTACTO_LABEL[m] }))}
                                style={{ marginTop: spacing.xs }} />
                            <Field label="Nota" placeholder="Qué quedó pendiente" value={notaCierre} onChangeText={setNotaCierre} style={{ marginTop: spacing.sm }} />
                        </View>
                    ) : null}
                </Sheet>
            </ScrollView>
        </KeyboardSafeView>
    );
}

function UnidadRow({ u, motivo, tag, onRegistrar, onVer }: { u: UnidadSugerida; motivo?: string; tag: string; onRegistrar: () => void; onVer: () => void }) {
    const s = useStyles();
    const { colors } = useTheme();
    const titulo = tituloUnidad(u);
    return (
        <View style={s.unidad}>
            <Pressable
                onPress={onVer}
                accessibilityRole="button"
                accessibilityLabel={`${titulo}, ${money(u.precioLista, u.moneda)}`}
                accessibilityHint="Abre la ficha con las fotos"
                style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.7 }]}
            >
                <T.Body style={{ fontWeight: '700' }}>{titulo}</T.Body>
                <T.Muted>{[u.dominio, money(u.precioLista, u.moneda), formatKm(u.kmIngreso)].filter(Boolean).join(' · ')}</T.Muted>
                {/* Precio equivalente en la moneda del presupuesto (blue). Sólo cuando el
                    auto está en otra moneda y se lo convirtió. ORIENTATIVO: el de arriba es el real. */}
                {u.precioEnMonedaPresupuesto != null && u.monedaPresupuesto ? (
                    <T.Muted style={{ marginTop: 2, color: colors.accent3, fontWeight: '600' }}>
                        ≈ {money(u.precioEnMonedaPresupuesto, u.monedaPresupuesto)} · {u.cotizacionAplicada?.tipo ?? 'blue'}
                    </T.Muted>
                ) : null}
                {motivo ? <T.Muted style={{ marginTop: 2, color: colors.accent3 }}>{motivo}</T.Muted> : null}
                <View style={{ marginTop: spacing.xs }}><Badge label={tag} tone={tag === 'sugerida' ? 'violet' : tag === 'sobre el máximo' ? 'warning' : 'accent'} /></View>
            </Pressable>
            <IconButton icon="plus" label={`Anotar que le mostraste ${titulo}`} color={colors.accentText} onPress={onRegistrar} />
        </View>
    );
}

const useStyles = makeStyles((colors) => ({
    root: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    miniLabel: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.5, marginTop: spacing.md },
    vehRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm },
    canjeBox: { backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.sm },
    unidad: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
    resOpt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: touchMin, paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginTop: spacing.sm },
    resOptOn: { borderColor: colors.accent, backgroundColor: colors.accent + '14' },
    resText: { color: colors.textSecondary, fontSize: fontSize.base },
}));
