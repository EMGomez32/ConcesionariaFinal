import React, { useState } from 'react';
import { View, Text, FlatList, RefreshControl, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, radius, fonts, fontSize } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/theme';
import {
    Card, Badge, Field, GradientButton, GhostButton, Segmented, T, BadgeTone, EstadoLista, PieLista, KeyboardSafeView,
} from '../components/ui';
import { errorMessage } from '../api/client';
import {
    atencionesApi, AtencionListItem, EstadoAtencion, MotivoAtencion, ResultadoAtencion,
    RespuestaIdentificar, MOTIVO_LABEL, RESULTADO_LABEL, codigoDeError, COD_CLIENTE_AJENO,
} from '../api/atenciones.api';
import { useListaPaginada } from '../hooks/useListaPaginada';
import { plural } from '../lib/formato';

type Tab = 'abierta' | 'cerrada' | 'todas';

const nombreCompleto = (c?: AtencionListItem['cliente']) =>
    c ? [c.nombre, c.apellido].filter(Boolean).join(' ') : 'Sin cliente';

const cuando = (iso: string) => {
    const d = new Date(iso);
    const hoy = new Date();
    const mismo = d.toDateString() === hoy.toDateString();
    const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return mismo ? `hoy ${hh}` : `${d.toLocaleDateString('es-AR')} ${hh}`;
};

const RES_TONE: Record<ResultadoAtencion, BadgeTone> = {
    reserva: 'success', cotizacion: 'cyan', test_drive: 'violet',
    permuta_a_tasar: 'warning', en_analisis: 'warning', sin_unidad: 'muted', se_retiro: 'danger',
};

/** Texto del aviso de atenciones pendientes, con el plural bien hecho. */
const textoAlerta = (a?: { abiertas: number; cerradasPorSistema: number }): string | null => {
    if (!a) return null;
    if (a.cerradasPorSistema > 0) {
        return a.cerradasPorSistema === 1
            ? 'El sistema cerró 1 atención que dejaste abierta.'
            : `El sistema cerró ${a.cerradasPorSistema} atenciones que dejaste abiertas.`;
    }
    if (a.abiertas > 0) return `Tenés ${plural(a.abiertas, 'atención', 'atenciones')} sin cerrar.`;
    return null;
};

export default function MostradorScreen({ navigation }: any) {
    const s = useStyles();
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const qc = useQueryClient();
    const [tab, setTab] = useState<Tab>('abierta');

    // ── Apertura ──────────────────────────────────────────────────────────
    const [nombre, setNombre] = useState('');
    const [telefono, setTelefono] = useState('');
    const [ident, setIdent] = useState<RespuestaIdentificar | null>(null);
    const [motivo, setMotivo] = useState<MotivoAtencion>('consulta_general');

    const filtroEstado: EstadoAtencion | undefined = tab === 'todas' ? undefined : tab;
    const lista = useListaPaginada(
        ['atenciones', tab],
        (page, limit) => atencionesApi.list(filtroEstado, page, limit),
        { mantenerAnterior: false },
    );
    const alerta = useQuery({ queryKey: ['atenciones', 'alertas'], queryFn: atencionesApi.alertas });

    const identificar = useMutation({
        mutationFn: () => atencionesApi.identificar({ nombre: nombre.trim() || undefined, telefono: telefono.trim() || undefined }),
        onSuccess: (r) => {
            setIdent(r);
            // Se puede buscar solo con el teléfono, pero el backend exige nombre para
            // abrir la atención: si el cliente ya existe, el nombre sale de su ficha.
            if (r.cliente && !nombre.trim()) setNombre(nombreCompleto(r.cliente));
        },
        onError: (e) => Alert.alert('No pudimos buscar', errorMessage(e)),
    });

    const abrir = useMutation({
        mutationFn: (confirmaAtenderAjeno?: boolean) =>
            atencionesApi.abrir({
                nombre: nombre.trim(),
                telefono: telefono.trim() || undefined,
                motivo,
                confirmaAtenderAjeno,
            }),
        onSuccess: (r) => {
            limpiar();
            qc.invalidateQueries({ queryKey: ['atenciones'] });
            navigation.navigate('AtencionDetalle', { id: r.atencion.id });
        },
        onError: (e) => {
            if (codigoDeError(e) === COD_CLIENTE_AJENO) {
                Alert.alert(
                    'Cliente de otro vendedor',
                    ident?.aviso?.mensaje || 'Este cliente lo atiende otro vendedor. ¿Lo atendés igual?',
                    [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Atender igual', onPress: () => abrir.mutate(true) },
                    ],
                );
                return;
            }
            Alert.alert('No se pudo abrir', errorMessage(e));
        },
    });

    const limpiar = () => { setNombre(''); setTelefono(''); setIdent(null); setMotivo('consulta_general'); };

    const clienteAjeno = ident?.aviso?.esDeOtroVendedor && !ident?.aviso?.retencionVencida;
    const avisoAlertas = textoAlerta(alerta.data);

    const header = (
        <View>
            <View style={s.header}>
                <View style={s.iconBadge}><Feather name="user-check" size={20} color={colors.accentText} /></View>
                <T.H1>Mostrador</T.H1>
            </View>
            <T.Muted style={{ marginBottom: spacing.lg }}>
                Atención presencial: abrí la visita con el nombre y el teléfono.
            </T.Muted>

            {avisoAlertas ? (
                <Card style={s.aviso}>
                    <View style={{ flexDirection: 'row', gap: spacing.sm }} accessibilityRole="alert">
                        <Feather name="alert-triangle" size={18} color={colors.warning} />
                        <View style={{ flex: 1 }}>
                            <Text style={s.avisoTitle}>{avisoAlertas}</Text>
                            <T.Muted style={{ marginTop: 2 }}>Ninguna puede quedar sin resultado.</T.Muted>
                        </View>
                    </View>
                </Card>
            ) : null}

            {/* Abrir una atención */}
            <Card style={{ marginBottom: spacing.lg }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
                    <Feather name="log-in" size={18} color={colors.accentText} />
                    <T.H2>Abrir una atención</T.H2>
                </View>
                <Field label="Nombre" placeholder="Cómo se llama" autoCapitalize="words" value={nombre} onChangeText={setNombre} />
                <Field label="Teléfono" placeholder="Ej: 261 555-1234" keyboardType="phone-pad" autoComplete="tel" value={telefono} onChangeText={setTelefono} style={{ marginTop: spacing.md }} />

                {!ident ? (
                    <GradientButton
                        title="Buscar y abrir"
                        loading={identificar.isPending}
                        disabled={!nombre.trim() && !telefono.trim()}
                        onPress={() => identificar.mutate()}
                        style={{ marginTop: spacing.lg }}
                    />
                ) : (
                    <View style={{ marginTop: spacing.lg }}>
                        {ident.cliente ? (
                            <View style={s.fichaBox}>
                                <Text style={s.fichaNombre}>{nombreCompleto(ident.cliente)}</Text>
                                <T.Muted>Ya estaba en el sistema · no se duplica</T.Muted>
                                {clienteAjeno ? (
                                    <View style={[s.aviso, { marginTop: spacing.sm, marginBottom: 0 }]}>
                                        <Text style={s.avisoTitle}>
                                            Lo atiende {ident.aviso?.vendedorAsignado ?? 'otro vendedor'}.
                                        </Text>
                                        <T.Muted>Al abrir vas a tener que confirmar que lo atendés igual.</T.Muted>
                                    </View>
                                ) : null}
                            </View>
                        ) : (
                            <View style={s.fichaBox}>
                                <Text style={s.fichaNombre}>Cliente nuevo</Text>
                                <T.Muted>No hay ficha con ese teléfono. Se crea una y se sigue desde ahí.</T.Muted>
                            </View>
                        )}
                        {ident.avisos?.map((a) => <T.Muted key={a} style={{ marginTop: spacing.sm }}>{a}</T.Muted>)}

                        <Text style={[s.miniLabel, { marginTop: spacing.lg }]}>MOTIVO DE LA VISITA</Text>
                        <Segmented
                            value={motivo}
                            onChange={setMotivo}
                            accessibilityLabel="Motivo de la visita"
                            options={[
                                { value: 'consulta_general', label: 'Consulta' },
                                { value: 'unidad_puntual', label: 'Unidad puntual' },
                            ]}
                            style={{ marginTop: spacing.sm }}
                        />

                        {!nombre.trim() ? (
                            <T.Muted style={{ marginTop: spacing.lg }}>Escribí el nombre para abrir la visita.</T.Muted>
                        ) : null}
                        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
                            <GhostButton title="Descartar" onPress={limpiar} style={{ paddingHorizontal: spacing.lg }} />
                            <GradientButton title="Abrir atención" loading={abrir.isPending} disabled={!nombre.trim()} onPress={() => abrir.mutate(undefined)} style={{ flex: 1 }} />
                        </View>
                    </View>
                )}
            </Card>

            <Segmented
                value={tab}
                onChange={setTab}
                accessibilityLabel="Qué atenciones ver"
                options={[{ value: 'abierta', label: 'Abiertas' }, { value: 'cerrada', label: 'Cerradas' }, { value: 'todas', label: 'Todas' }]}
                style={{ marginBottom: spacing.lg }}
            />
        </View>
    );

    return (
        <View style={s.root}>
            <KeyboardSafeView>
                <FlatList
                    data={lista.items}
                    keyExtractor={(a) => String(a.id)}
                    // Sin header: el contenido arranca debajo del notch / la barra de estado.
                    contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxl }}
                    keyboardShouldPersistTaps="handled"
                    refreshControl={
                        <RefreshControl refreshing={lista.refrescando} onRefresh={() => { lista.refrescar(); alerta.refetch(); }} tintColor={colors.accentText} />
                    }
                    onEndReached={lista.cargarMas}
                    onEndReachedThreshold={0.4}
                    ListHeaderComponent={header}
                    renderItem={({ item }) => {
                        const abierta = item.estado === 'abierta';
                        return (
                            <Card
                                style={{ marginBottom: spacing.md }}
                                onPress={() => navigation.navigate('AtencionDetalle', { id: item.id })}
                                accessibilityLabel={`Atención ${abierta ? 'abierta' : 'cerrada'} de ${nombreCompleto(item.cliente)}, ${cuando(item.iniciadaEn)}`}
                                accessibilityHint="Abre la atención"
                            >
                                <View style={s.rowTop}>
                                    <Badge label={abierta ? 'ABIERTA' : 'CERRADA'} tone={abierta ? 'warning' : 'muted'} />
                                    <T.Muted>{cuando(item.iniciadaEn)}</T.Muted>
                                    {item.cerradaAutomaticamente ? <T.Muted style={{ color: colors.warning }}>· cerrada por el sistema</T.Muted> : null}
                                </View>
                                <Text style={s.cliente}>{nombreCompleto(item.cliente)}</Text>
                                <T.Muted>{MOTIVO_LABEL[item.motivo]}</T.Muted>
                                {item.resultado ? (
                                    <View style={{ marginTop: spacing.sm }}>
                                        <Badge label={RESULTADO_LABEL[item.resultado].toUpperCase()} tone={RES_TONE[item.resultado]} />
                                    </View>
                                ) : null}
                            </Card>
                        );
                    }}
                    ListEmptyComponent={<EstadoLista q={lista.q} que="las atenciones" vacio="No hay atenciones en esta vista." />}
                    ListFooterComponent={
                        <PieLista
                            cargandoMas={lista.q.isFetchingNextPage}
                            errorMas={lista.q.isFetchNextPageError}
                            onRetry={lista.cargarMas}
                            mostrando={lista.items.length}
                            total={lista.total}
                        />
                    }
                />
            </KeyboardSafeView>
        </View>
    );
}

const useStyles = makeStyles((colors) => ({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xs, marginTop: spacing.sm },
    iconBadge: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center' },
    aviso: { borderColor: colors.warning + '55', backgroundColor: colors.warning + '14', marginBottom: spacing.lg, borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
    avisoTitle: { color: colors.text, fontWeight: '700', fontSize: fontSize.base },
    fichaBox: { backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
    fichaNombre: { color: colors.text, fontFamily: fonts.brand, fontSize: fontSize.md, fontWeight: '700' },
    miniLabel: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.5 },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm, flexWrap: 'wrap' },
    cliente: { color: colors.text, fontFamily: fonts.brand, fontSize: fontSize.md, fontWeight: '700' },
}));
