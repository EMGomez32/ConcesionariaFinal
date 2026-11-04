import React, { useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { spacing, fonts, fontSize } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/theme';
import { Card, Badge, Field, Segmented, T, EstadoLista, PieLista } from '../components/ui';
import { vehiculosApi, ESTADO_VEHICULO_LABEL, ESTADO_VEHICULO_TONE } from '../api/vehiculos.api';
import { useDebounced, useListaPaginada } from '../hooks/useListaPaginada';
import { formatKm, formatMoneda } from '../lib/formato';

type Filtro = 'publicado' | 'reservado' | 'todos';

export default function VehiculosScreen({ navigation }: any) {
    const s = useStyles();
    const { colors } = useTheme();
    const [search, setSearch] = useState('');
    const [filtro, setFiltro] = useState<Filtro>('publicado');
    const busqueda = useDebounced(search.trim());

    const lista = useListaPaginada(
        ['vehiculos', busqueda, filtro],
        (page, limit) => vehiculosApi.list(
            { search: busqueda || undefined, estado: filtro === 'todos' ? undefined : filtro },
            page, limit,
        ),
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
                        <T.Muted style={{ marginBottom: spacing.lg }}>Las unidades para ofrecer en el salón. Tocá una para ver la ficha.</T.Muted>
                        <Field
                            placeholder="Buscar por marca, modelo o dominio…"
                            accessibilityLabel="Buscar unidades"
                            autoCorrect={false}
                            autoCapitalize="none"
                            value={search}
                            onChangeText={setSearch}
                            right={lista.buscando ? <ActivityIndicator color={colors.accentText} style={{ marginRight: spacing.md }} /> : null}
                        />
                        <Segmented
                            value={filtro} onChange={setFiltro}
                            accessibilityLabel="Estado de las unidades"
                            options={[{ value: 'publicado', label: 'Publicados' }, { value: 'reservado', label: 'Reservados' }, { value: 'todos', label: 'Todos' }]}
                            style={{ marginTop: spacing.md }}
                        />
                    </View>
                }
                renderItem={({ item }) => {
                    const titulo = [item.marca, item.modelo, item.version, item.anio].filter(Boolean).join(' ');
                    const precio = formatMoneda(item.precioLista, item.moneda, 'Consultar');
                    return (
                        <Card
                            style={{ marginTop: spacing.md }}
                            onPress={() => navigation.navigate('VehiculoDetalle', { id: item.id })}
                            accessibilityLabel={`${titulo}, ${ESTADO_VEHICULO_LABEL[item.estado]}, ${precio}`}
                            accessibilityHint="Abre la ficha de la unidad"
                        >
                            <View style={s.rowTop}>
                                <Text style={s.veh}>{titulo}</Text>
                                <Badge label={ESTADO_VEHICULO_LABEL[item.estado].toUpperCase()} tone={ESTADO_VEHICULO_TONE[item.estado]} />
                            </View>
                            <Text style={s.precio}>{precio}</Text>
                            <T.Muted style={{ marginTop: 2 }}>
                                {[item.dominio, formatKm(item.kmIngreso), item.color].filter(Boolean).join(' · ')}
                            </T.Muted>
                            {item.sucursal?.nombre ? <T.Muted style={{ marginTop: 2 }}>{item.sucursal.nombre}</T.Muted> : null}
                        </Card>
                    );
                }}
                ListEmptyComponent={<EstadoLista q={lista.q} que="el stock" vacio={busqueda ? 'Ninguna unidad coincide con la búsqueda.' : 'No hay unidades en esta vista.'} />}
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
