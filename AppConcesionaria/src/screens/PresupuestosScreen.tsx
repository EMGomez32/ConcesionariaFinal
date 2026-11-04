import React, { useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { spacing, fonts, fontSize } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/theme';
import { Card, Badge, Field, GhostButton, T, EstadoLista, PieLista } from '../components/ui';
import { presupuestosApi, ESTADO_PRESUPUESTO_LABEL } from '../api/presupuestos.api';
import { useDebounced, useListaPaginada } from '../hooks/useListaPaginada';
import { fechaDia, formatMoneda } from '../lib/formato';

export default function PresupuestosScreen({ navigation }: any) {
    const s = useStyles();
    const { colors } = useTheme();
    const [search, setSearch] = useState('');
    const busqueda = useDebounced(search.trim());
    const lista = useListaPaginada(
        ['presupuestos', busqueda],
        (page, limit) => presupuestosApi.list(busqueda || undefined, page, limit),
    );

    return (
        <View style={s.root}>
            <FlatList
                data={lista.items}
                keyExtractor={(p) => String(p.id)}
                contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={lista.refrescando} onRefresh={lista.refrescar} tintColor={colors.accentText} />}
                onEndReached={lista.cargarMas}
                onEndReachedThreshold={0.4}
                ListHeaderComponent={
                    <View>
                        <T.Muted style={{ marginBottom: spacing.lg }}>Los presupuestos que le pasaste a cada cliente.</T.Muted>
                        <GhostButton title="Crear presupuesto" icon="plus" onPress={() => navigation.navigate('PresupuestoNuevo')} />
                        <Field
                            placeholder="Buscar por número, cliente o unidad…"
                            accessibilityLabel="Buscar presupuestos"
                            autoCorrect={false}
                            value={search}
                            onChangeText={setSearch}
                            style={{ marginTop: spacing.md }}
                            right={lista.buscando ? <ActivityIndicator color={colors.accentText} style={{ marginRight: spacing.md }} /> : null}
                        />
                    </View>
                }
                renderItem={({ item }) => {
                    const est = ESTADO_PRESUPUESTO_LABEL[item.estado];
                    const total = formatMoneda(item.total, item.moneda);
                    return (
                        <Card
                            style={{ marginTop: spacing.md }}
                            onPress={() => navigation.navigate('PresupuestoDetalle', { id: item.id })}
                            accessibilityLabel={`Presupuesto ${item.nroPresupuesto}, ${est.label}, ${total}, ${item.cliente?.nombre ?? ''}`}
                            accessibilityHint="Abre el presupuesto"
                        >
                            <View style={s.rowTop}>
                                <Text style={s.nro}>{item.nroPresupuesto}</Text>
                                <Badge label={est.label} tone={est.tone} />
                            </View>
                            <Text style={s.total}>{total}</Text>
                            <T.Muted style={{ marginTop: 2 }}>
                                {[item.cliente?.nombre, fechaDia(item.fechaCreacion)].filter(Boolean).join(' · ')}
                            </T.Muted>
                        </Card>
                    );
                }}
                ListEmptyComponent={<EstadoLista q={lista.q} que="los presupuestos" vacio={busqueda ? 'Ningún presupuesto coincide con la búsqueda.' : 'No hay presupuestos.'} />}
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
        </View>
    );
}

const useStyles = makeStyles((colors) => ({
    root: { flex: 1, backgroundColor: colors.bg },
    rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    nro: { color: colors.text, fontFamily: fonts.brand, fontSize: fontSize.md, fontWeight: '700', flex: 1 },
    total: { color: colors.text, fontFamily: fonts.brandBold, fontSize: fontSize.xl, fontWeight: '800', marginTop: spacing.xs, fontVariant: ['tabular-nums'] },
}));
