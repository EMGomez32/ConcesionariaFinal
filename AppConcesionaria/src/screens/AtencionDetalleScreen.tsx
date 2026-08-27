import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radius, fonts, fontSize } from '../theme/tokens';
import { Card, Badge, Field, GradientButton, GhostButton, Segmented, Sheet, T } from '../components/ui';
import { errorMessage } from '../api/client';
import {
    atencionesApi, AtencionDetalle, ModoBusqueda, TipoFinanciamiento, CondicionTasacion,
    ResultadoAtencion, ResultadoBusqueda, Sugerencia, UnidadSugerida, TipoSeguimiento,
    num, MOTIVO_LABEL, RESULTADO_LABEL, RESULTADOS_DEFINITIVOS, FINANCIAMIENTO_LABEL,
    CONDICION_LABEL, CONDICIONES, ESTADO_PERMUTA_LABEL, MEDIO_CONTACTO_LABEL, MEDIOS_CONTACTO,
    faltanDatosDelCliente, codigoDeError, COD_SOLO_TASADOR,
} from '../api/atenciones.api';

const money = (v: any, m = 'ARS') => {
    const n = num(v);
    if (n == null) return '—';
    return `${m === 'USD' ? 'US$' : '$'}${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
};
const numOr = (s: string): number | undefined => (s.trim() === '' ? undefined : Number(s));
const tituloUnidad = (u?: UnidadSugerida) => u ? [u.marca, u.modelo, u.version, u.anio].filter(Boolean).join(' ') : 'Unidad';
const enDias = (n: number) => {
    const d = new Date(); d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function AtencionDetalleScreen({ route, navigation }: any) {
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
    const [tipoFin, setTipoFin] = useState<TipoFinanciamiento | ''>('');
    // Búsqueda por modelo/unidad.
    const [bMarca, setBMarca] = useState('');
    const [bModelo, setBModelo] = useState('');
    const [bDominio, setBDominio] = useState('');

    // Sembramos desde la atención cargada (una vez).
    const [seeded, setSeeded] = useState(false);
    useEffect(() => {
        if (a && !seeded) {
            if (a.modoBusqueda) setModo(a.modoBusqueda);
            if (num(a.presupuestoMin) != null) setPresMin(String(num(a.presupuestoMin)));
            if (num(a.presupuestoMax) != null) setPresMax(String(num(a.presupuestoMax)));
            if (a.moneda === 'USD' || a.moneda === 'ARS') setMoneda(a.moneda);
            if (num(a.anticipo) != null) setAnticipo(String(num(a.anticipo)));
            if (num(a.cuotaMaxima) != null) setCuota(String(num(a.cuotaMaxima)));
            if (a.tipoFinanciamiento) setTipoFin(a.tipoFinanciamiento);
            setSeeded(true);
        }
    }, [a, seeded]);

    // ── Permuta ───────────────────────────────────────────────────────────
    const [pMarca, setPMarca] = useState('');
    const [pModelo, setPModelo] = useState('');
    const [pDominio, setPDominio] = useState('');
    const [pAnio, setPAnio] = useState('');
    const [pKm, setPKm] = useState('');
    const [pCondicion, setPCondicion] = useState<CondicionTasacion>('bueno');
    const [pValor, setPValor] = useState('');

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
            tipoFinanciamiento: tipoFin || undefined,
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
        onError: (e) => {
            if (faltanDatosDelCliente(e)) return pedirDatos(() => {});
            Alert.alert('No se pudo registrar', errorMessage(e));
        },
    });

    const [soloTasador, setSoloTasador] = useState(false);
    const guardarPermuta = useMutation({
        mutationFn: (sinValor: boolean) => atencionesApi.registrarPermuta(id, {
            marca: pMarca.trim(), modelo: pModelo.trim(), dominio: pDominio.trim(),
            anio: numOr(pAnio), km: numOr(pKm), condicion: pCondicion,
            valorEstimado: sinValor ? undefined : numOr(pValor), moneda,
        }),
        onSuccess: () => {
            Alert.alert('Permuta cargada', soloTasador ? 'Quedó sin tasar: la completa el tasador.' : 'Registrada.');
            setPMarca(''); setPModelo(''); setPDominio(''); setPAnio(''); setPKm(''); setPValor('');
            qc.invalidateQueries({ queryKey: detalleKey });
        },
        onError: (e) => {
            if (faltanDatosDelCliente(e)) return pedirDatos(() => guardarPermuta.mutate(soloTasador));
            if (codigoDeError(e) === COD_SOLO_TASADOR) { setSoloTasador(true); setPValor(''); guardarPermuta.mutate(true); return; }
            Alert.alert('No se pudo cargar la permuta', errorMessage(e));
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

    const permutaActual = a?.tasaciones?.[0];
    const soloLectura = a?.estado === 'cerrada';

    if (q.isLoading) return <View style={s.center}><ActivityIndicator color={colors.accent} /></View>;
    if (!a) return <View style={s.center}><T.Muted>No se pudo cargar la atención.</T.Muted></View>;

    const cliente = a.cliente ? [a.cliente.nombre, a.cliente.apellido].filter(Boolean).join(' ') : 'Sin cliente';
    const abierta = a.estado === 'abierta';

    return (
        <ScrollView style={s.root} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
            {/* Header */}
            <T.H1>{cliente}</T.H1>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge label={abierta ? 'ABIERTA' : 'CERRADA'} tone={abierta ? 'warning' : 'muted'} />
                <T.Muted>{MOTIVO_LABEL[a.motivo]}</T.Muted>
                {a.cliente?.telefono ? <T.Muted>· {a.cliente.telefono}</T.Muted> : null}
            </View>

            {abierta ? (
                <GradientButton title="Cerrar atención" onPress={() => setCierreOpen(true)} style={{ marginTop: spacing.lg }} />
            ) : a.resultado ? (
                <View style={{ marginTop: spacing.lg }}>
                    <Badge label={RESULTADO_LABEL[a.resultado].toUpperCase()} tone="cyan" />
                </View>
            ) : null}

            {/* Relevamiento */}
            <Card style={{ marginTop: spacing.lg }}>
                <T.H2>Qué está buscando</T.H2>
                <Segmented
                    value={modo} onChange={setModo}
                    options={[{ value: 'presupuesto', label: 'Presupuesto' }, { value: 'modelo', label: 'Modelo' }, { value: 'unidad', label: 'Unidad' }]}
                    style={{ marginTop: spacing.md }}
                />

                {modo === 'presupuesto' ? (
                    <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                        <Field label="Desde" placeholder="0" keyboardType="numeric" value={presMin} onChangeText={setPresMin} style={{ flex: 1 }} />
                        <Field label="Hasta" placeholder="Tope" keyboardType="numeric" value={presMax} onChangeText={setPresMax} style={{ flex: 1 }} />
                    </View>
                ) : modo === 'modelo' ? (
                    <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                        <Field label="Marca" placeholder="Toyota" value={bMarca} onChangeText={setBMarca} style={{ flex: 1 }} />
                        <Field label="Modelo" placeholder="Corolla" value={bModelo} onChangeText={setBModelo} style={{ flex: 1 }} />
                    </View>
                ) : (
                    <Field label="Dominio" placeholder="AB123CD" autoCapitalize="characters" value={bDominio} onChangeText={setBDominio} style={{ marginTop: spacing.md }} />
                )}

                <Text style={s.miniLabel}>MONEDA</Text>
                <Segmented value={moneda} onChange={setMoneda} options={[{ value: 'ARS', label: 'Pesos' }, { value: 'USD', label: 'Dólares' }]} style={{ marginTop: spacing.xs }} />

                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                    <Field label="Anticipo" placeholder="0" keyboardType="numeric" value={anticipo} onChangeText={setAnticipo} style={{ flex: 1 }} />
                    <Field label="Cuota máx." placeholder="0" keyboardType="numeric" value={cuota} onChangeText={setCuota} style={{ flex: 1 }} />
                </View>
                <Text style={s.miniLabel}>FINANCIAMIENTO</Text>
                <Segmented
                    value={tipoFin || 'contado'} onChange={(v) => setTipoFin(v as TipoFinanciamiento)}
                    options={[{ value: 'contado', label: 'Contado' }, { value: 'credito', label: 'Crédito' }, { value: 'plan_de_ahorro', label: 'Plan' }]}
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

                    {busq.exacta ? (
                        <UnidadRow u={busq.exacta} tag={busq.exactaPorEncimaDelMaximo ? 'sobre el máximo' : 'la buscada'}
                            onRegistrar={() => registrar.mutate({ vehiculoId: busq.exacta!.id, tipo: 'buscada' })} />
                    ) : busq.estadoDeLaExacta ? (
                        <T.Muted style={{ marginTop: spacing.sm }}>La unidad buscada no está disponible ({busq.estadoDeLaExacta}).</T.Muted>
                    ) : null}

                    {busq.alternativas.map((alt: Sugerencia) => (
                        <UnidadRow key={alt.unidad.id} u={alt.unidad} motivo={alt.motivo}
                            tag={alt.porEncimaDelMaximo ? 'sobre el máximo' : 'sugerida'}
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
                            <T.Body>{tituloUnidad(v.vehiculo)}</T.Body>
                            <Badge label={v.tipo === 'sugerida' ? 'sugerida' : 'la buscó'} tone={v.tipo === 'sugerida' ? 'violet' : 'accent'} />
                        </View>
                    ))}
                </Card>
            ) : null}

            {/* Permuta */}
            <Card style={{ marginTop: spacing.md }}>
                <T.H2>Permuta</T.H2>
                {permutaActual ? (
                    <View style={s.permutaBox}>
                        <T.Body style={{ fontWeight: '700' }}>{[permutaActual.marca, permutaActual.modelo, permutaActual.anio].filter(Boolean).join(' ')}</T.Body>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs }}>
                            <Badge label={ESTADO_PERMUTA_LABEL[permutaActual.estado].toUpperCase()} tone={permutaActual.estado === 'tasada' ? 'success' : permutaActual.estado === 'rechazada' ? 'danger' : 'warning'} />
                            <T.Muted>{money(permutaActual.valorEstimado, permutaActual.moneda)}</T.Muted>
                        </View>
                    </View>
                ) : soloLectura ? (
                    <T.Muted style={{ marginTop: spacing.sm }}>No se cargó permuta.</T.Muted>
                ) : (
                    <View>
                        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                            <Field label="Marca" placeholder="Del usado" value={pMarca} onChangeText={setPMarca} style={{ flex: 1 }} />
                            <Field label="Modelo" value={pModelo} onChangeText={setPModelo} style={{ flex: 1 }} />
                        </View>
                        <Field label="Dominio *" placeholder="AB123CD" autoCapitalize="characters" value={pDominio} onChangeText={setPDominio} style={{ marginTop: spacing.sm }} />
                        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                            <Field label="Año" keyboardType="numeric" value={pAnio} onChangeText={setPAnio} style={{ flex: 1 }} />
                            <Field label="Km" keyboardType="numeric" value={pKm} onChangeText={setPKm} style={{ flex: 1 }} />
                        </View>
                        <Text style={s.miniLabel}>ESTADO GENERAL</Text>
                        <Segmented
                            value={pCondicion} onChange={setPCondicion}
                            options={CONDICIONES.map((c) => ({ value: c, label: CONDICION_LABEL[c].split(' ')[0] }))}
                            style={{ marginTop: spacing.xs }}
                        />
                        <Field label="Valor estimado de toma" placeholder="Lo que estimás" keyboardType="numeric" value={pValor} onChangeText={setPValor} style={{ marginTop: spacing.sm }} />
                        <GhostButton title="Cargar permuta" onPress={() => guardarPermuta.mutate(false)} style={{ marginTop: spacing.md }} />
                    </View>
                )}
            </Card>

            {/* Modal: completar datos del cliente (Ley 25.326) */}
            <Sheet
                visible={datosOpen}
                onClose={() => setDatosOpen(false)}
                title="Completar los datos del cliente"
                subtitle="Para test drive, cotización, reserva o permuta hacen falta (Ley 25.326)."
                footer={<>
                    <GhostButton title="Cancelar" onPress={() => setDatosOpen(false)} style={{ flex: 1 }} />
                    <GradientButton title="Guardar" loading={completarDatos.isPending} onPress={() => completarDatos.mutate()} style={{ flex: 1 }} />
                </>}
            >
                <Field label="DNI" keyboardType="numeric" value={dDni} onChangeText={setDDni} />
                <Field label="Email" keyboardType="email-address" autoCapitalize="none" value={dEmail} onChangeText={setDEmail} style={{ marginTop: spacing.sm }} />
                <Field label="Domicilio" value={dDir} onChangeText={setDDir} style={{ marginTop: spacing.sm }} />
                <Pressable onPress={() => setDConsent((v) => !v)} style={s.check}>
                    <View style={[s.checkbox, dConsent && s.checkboxOn]}>{dConsent ? <Feather name="check" size={14} color={colors.onAccent} /> : null}</View>
                    <Text style={s.checkText}>El cliente presta conformidad para ser contactado (Ley 25.326).</Text>
                </Pressable>
            </Sheet>

            {/* Modal: cierre */}
            <Sheet
                visible={cierreOpen}
                onClose={() => setCierreOpen(false)}
                title="Cerrar la atención"
                subtitle="Elegí el resultado. Ninguna visita queda sin explicar."
                footer={<>
                    <GhostButton title="Cancelar" onPress={() => setCierreOpen(false)} style={{ flex: 1 }} />
                    <GradientButton title="Cerrar" loading={cerrar.isPending} disabled={!resElegido} onPress={() => cerrar.mutate()} style={{ flex: 1 }} />
                </>}
            >
                {(Object.keys(RESULTADO_LABEL) as ResultadoAtencion[]).map((r) => {
                    const on = resElegido === r;
                    return (
                        <Pressable key={r} onPress={() => setResElegido(r)} style={[s.resOpt, on && s.resOptOn]}>
                            <Text style={[s.resText, on && { color: colors.text, fontWeight: '700' }]}>{RESULTADO_LABEL[r]}</Text>
                            {on ? <Feather name="check" size={16} color={colors.accent} /> : null}
                        </Pressable>
                    );
                })}
                {resElegido && !RESULTADOS_DEFINITIVOS.includes(resElegido) ? (
                    <View style={{ marginTop: spacing.md }}>
                        <Text style={s.miniLabel}>PRÓXIMO CONTACTO</Text>
                        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs, flexWrap: 'wrap' }}>
                            {[['Mañana', 1], ['En 3 días', 3], ['En 1 semana', 7]].map(([lbl, n]) => {
                                const val = enDias(n as number);
                                const on = proximo === val;
                                return (
                                    <Pressable key={lbl as string} onPress={() => setProximo(val)} style={[s.chip, on && s.chipOn]}>
                                        <Text style={[s.chipText, on && { color: colors.onAccent }]}>{lbl}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                        <Text style={[s.miniLabel, { marginTop: spacing.md }]}>MEDIO</Text>
                        <Segmented value={medio} onChange={setMedio}
                            options={MEDIOS_CONTACTO.slice(0, 3).map((m) => ({ value: m, label: MEDIO_CONTACTO_LABEL[m] }))}
                            style={{ marginTop: spacing.xs }} />
                        <Field label="Nota" placeholder="Qué quedó pendiente" value={notaCierre} onChangeText={setNotaCierre} style={{ marginTop: spacing.sm }} />
                    </View>
                ) : null}
            </Sheet>
        </ScrollView>
    );
}

function UnidadRow({ u, motivo, tag, onRegistrar }: { u: UnidadSugerida; motivo?: string; tag: string; onRegistrar: () => void }) {
    return (
        <View style={s.unidad}>
            <View style={{ flex: 1 }}>
                <T.Body style={{ fontWeight: '700' }}>{tituloUnidad(u)}</T.Body>
                <T.Muted>{u.dominio ? `${u.dominio} · ` : ''}{money(u.precioLista, u.moneda)}{u.kmIngreso != null ? ` · ${Number(u.kmIngreso).toLocaleString('es-AR')} km` : ''}</T.Muted>
                {motivo ? <T.Muted style={{ marginTop: 2, color: colors.accent3 }}>{motivo}</T.Muted> : null}
                <View style={{ marginTop: spacing.xs }}><Badge label={tag} tone={tag === 'sugerida' ? 'violet' : tag === 'sobre el máximo' ? 'warning' : 'accent'} /></View>
            </View>
            <Pressable onPress={onRegistrar} hitSlop={8} style={s.regBtn}><Feather name="plus" size={18} color={colors.accent} /></Pressable>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    miniLabel: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.5, marginTop: spacing.md },
    vehRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm },
    permutaBox: { backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.sm },
    unidad: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
    regBtn: { width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
    check: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
    checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    checkText: { color: colors.textSecondary, fontSize: fontSize.sm, flex: 1 },
    resOpt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginTop: spacing.sm },
    resOptOn: { borderColor: colors.accent, backgroundColor: colors.accent + '14' },
    resText: { color: colors.textSecondary, fontSize: fontSize.base },
    chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
    chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: { color: colors.textSecondary, fontWeight: '600', fontSize: fontSize.sm },
});
