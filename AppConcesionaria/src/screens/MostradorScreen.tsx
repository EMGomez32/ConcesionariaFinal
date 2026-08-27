import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radius, fonts, fontSize } from '../theme/tokens';
import { Card, Badge, T, BadgeTone } from '../components/ui';
import {
    atencionesApi, AtencionListItem, EstadoAtencion, MOTIVO_LABEL, RESULTADO_LABEL, ResultadoAtencion,
} from '../api/atenciones.api';

type Tab = 'abierta' | 'cerrada' | 'todas';

const nombre = (c?: AtencionListItem['cliente']) =>
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

export default function MostradorScreen({ navigation }: any) {
    const [tab, setTab] = useState<Tab>('abierta');

    const filtroEstado: EstadoAtencion | undefined = tab === 'todas' ? undefined : tab;
    const atenciones = useQuery({
        queryKey: ['atenciones', tab],
        queryFn: () => atencionesApi.list(filtroEstado ? { estado: filtroEstado } : {}, 1, 50),
    });
    const alerta = useQuery({ queryKey: ['atenciones', 'alertas'], queryFn: atencionesApi.alertas });

    const items = atenciones.data?.results ?? [];

    return (
        <View style={s.root}>
            <FlatList
                data={items}
                keyExtractor={(a) => String(a.id)}
                contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
                refreshControl={
                    <RefreshControl
                        refreshing={atenciones.isFetching}
                        onRefresh={() => { atenciones.refetch(); alerta.refetch(); }}
                        tintColor={colors.accent}
                    />
                }
                ListHeaderComponent={
                    <View>
                        <View style={s.header}>
                            <View style={s.iconBadge}><Feather name="user-check" size={20} color={colors.accent} /></View>
                            <T.H1>Mostrador</T.H1>
                        </View>
                        <T.Muted style={{ marginBottom: spacing.lg }}>
                            Atención presencial: abrí la visita con el nombre y el teléfono.
                        </T.Muted>

                        {alerta.data && (alerta.data.abiertas > 0 || alerta.data.cerradasPorSistema > 0) ? (
                            <Card style={s.aviso}>
                                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                                    <Feather name="alert-triangle" size={18} color={colors.warning} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.avisoTitle}>
                                            {alerta.data.cerradasPorSistema > 0
                                                ? `El sistema cerró ${alerta.data.cerradasPorSistema} atención(es) que dejaste abiertas.`
                                                : `Tenés ${alerta.data.abiertas} atención(es) sin cerrar.`}
                                        </Text>
                                        <T.Muted style={{ marginTop: 2 }}>Ninguna puede quedar sin resultado.</T.Muted>
                                    </View>
                                </View>
                            </Card>
                        ) : null}

                        <View style={s.tabs}>
                            {(['abierta', 'cerrada', 'todas'] as Tab[]).map((t) => (
                                <Pressable key={t} onPress={() => setTab(t)} style={[s.tab, tab === t && s.tabActive]}>
                                    <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                                        {t === 'abierta' ? 'Abiertas' : t === 'cerrada' ? 'Cerradas' : 'Todas'}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                }
                renderItem={({ item }) => {
                    const abierta = item.estado === 'abierta';
                    return (
                        <Card style={{ marginBottom: spacing.md }} onPress={() => navigation.navigate('AtencionDetalle', { id: item.id })}>
                            <View style={s.rowTop}>
                                <Badge label={abierta ? 'ABIERTA' : 'CERRADA'} tone={abierta ? 'warning' : 'muted'} />
                                <T.Muted>{cuando(item.iniciadaEn)}</T.Muted>
                                {item.cerradaAutomaticamente ? <T.Muted style={{ color: colors.warning }}>· cerrada por sistema</T.Muted> : null}
                            </View>
                            <Text style={s.cliente}>{nombre(item.cliente)}</Text>
                            <T.Muted>{MOTIVO_LABEL[item.motivo]}</T.Muted>
                            {item.resultado ? (
                                <View style={{ marginTop: spacing.sm }}>
                                    <Badge label={RESULTADO_LABEL[item.resultado].toUpperCase()} tone={RES_TONE[item.resultado]} />
                                </View>
                            ) : null}
                        </Card>
                    );
                }}
                ListEmptyComponent={
                    atenciones.isLoading
                        ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xxl }} />
                        : <T.Muted style={{ textAlign: 'center', marginTop: spacing.xxl }}>No hay atenciones en esta vista.</T.Muted>
                }
            />
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xs, marginTop: spacing.sm },
    iconBadge: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center' },
    aviso: { borderColor: colors.warning + '55', backgroundColor: colors.warning + '14', marginBottom: spacing.lg },
    avisoTitle: { color: colors.text, fontWeight: '700', fontSize: fontSize.base },
    tabs: { flexDirection: 'row', backgroundColor: colors.bgSecondary, borderRadius: radius.pill, padding: 4, marginBottom: spacing.lg },
    tab: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center' },
    tabActive: { backgroundColor: colors.accent },
    tabText: { color: colors.textSecondary, fontWeight: '700', fontSize: fontSize.sm },
    tabTextActive: { color: colors.onAccent },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm, flexWrap: 'wrap' },
    cliente: { color: colors.text, fontFamily: fonts.brand, fontSize: fontSize.md, fontWeight: '700' },
});
