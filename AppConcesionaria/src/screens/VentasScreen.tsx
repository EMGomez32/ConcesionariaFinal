import React, { useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { spacing, fonts, fontSize } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/theme';
import { Card, Badge, Field, GhostButton, T, EstadoLista, PieLista } from '../components/ui';
import { ventasApi, Venta, ESTADO_ENTREGA_LABEL } from '../api/ventas.api';
import { useDebounced, useListaPaginada } from '../hooks/useListaPaginada';
import { fechaDia, formatMoneda } from '../lib/formato';

const veh = (v: Venta) => v.vehiculo ? [v.vehiculo.marca, v.vehiculo.modelo].filter(Boolean).join(' ') : `Unidad #${v.vehiculoId}`;

export default function VentasScreen({ navigation }: any) {
    const s = useStyles();
    const { colors } = useTheme();
    const [search, setSearch] = useState('');
    const busqueda = useDebounced(search.trim());
    const lista = useListaPaginada(
        ['ventas', busqueda],
        (page, limit) => ventasApi.list(busqueda || undefined, page, limit),
    );

    return (
        <View style={s.root}>
            <FlatList
                data={lista.items}
                keyExtractor={(v) => String(v.id)}
                contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={lista.refrescando} onRefresh={lista.refrescar} tintColor={colors.accentText} />}
                onEndReached={lista.cargarMas}
                onEndReachedThreshold={0.4}
                ListHeaderComponent={
                    <View>
                        <T.Muted style={{ marginBottom: spacing.lg }}>Las ventas registradas y sus pagos.</T.Muted>
                        <GhostButton title="Registrar venta" icon="plus" onPress={() => navigation.navigate('VentaNueva')} />
                        <Field
                            placeholder="Buscar por cliente, unidad o dominio…"
                            accessibilityLabel="Buscar ventas"
                            autoCorrect={false}
                            value={search}
                            onChangeText={setSearch}
                            style={{ marginTop: spacing.md }}
                            right={lista.buscando ? <ActivityIndicator color={colors.accentText} style={{ marginRight: spacing.md }} /> : null}
                        />
                    </View>
                }
                renderItem={({ item }) => {
                    const ent = ESTADO_ENTREGA_LABEL[item.estadoEntrega];
                    const precio = formatMoneda(item.precioVenta, item.moneda);
                    return (
                        <Card
                            style={{ marginTop: spacing.md }}
                            onPress={() => navigation.navigate('VentaDetalle', { id: item.id })}
                            accessibilityLabel={`Venta de ${veh(item)}, ${precio}, ${ent.label}, ${item.cliente?.nombre ?? ''}`}
                            accessibilityHint="Abre la venta"
                        >
                            <View style={s.rowTop}>
                                <Text style={s.veh}>{veh(item)}</Text>
                                <Badge label={ent.label} tone={ent.tone} />
                            </View>
                            <Text style={s.precio}>{precio}</Text>
                            <T.Muted style={{ marginTop: 2 }}>
                                {[item.cliente?.nombre, fechaDia(item.fechaVenta)].filter(Boolean).join(' · ')}
                            </T.Muted>
                        </Card>
                    );
                }}
                ListEmptyComponent={<EstadoLista q={lista.q} que="las ventas" vacio={busqueda ? 'Ninguna venta coincide con la búsqueda.' : 'No hay ventas.'} />}
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
    veh: { color: colors.text, fontFamily: fonts.brand, fontSize: fontSize.md, fontWeight: '700', flex: 1 },
    precio: { color: colors.text, fontFamily: fonts.brandBold, fontSize: fontSize.xl, fontWeight: '800', marginTop: spacing.xs, fontVariant: ['tabular-nums'] },
}));
