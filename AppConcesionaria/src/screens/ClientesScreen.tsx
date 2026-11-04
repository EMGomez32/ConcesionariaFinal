import React, { useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator, Linking, Pressable, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { spacing, radius, fonts, fontSize, touchMin } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/theme';
import { Card, Badge, Field, T, EstadoLista, PieLista } from '../components/ui';
import { clientesApi, Cliente, ESTADO_LEAD_LABEL, ORIGEN_LEAD_LABEL } from '../api/clientes.api';
import { useDebounced, useListaPaginada } from '../hooks/useListaPaginada';
import { waLink } from '../lib/formato';

export const nombreCliente = (c: Pick<Cliente, 'nombre' | 'apellido'>) => [c.nombre, c.apellido].filter(Boolean).join(' ');
const soloDigitos = (s?: string | null) => (s ?? '').replace(/\D+/g, '');

/** Llamar / WhatsApp a un cliente (los usan la lista y la ficha). */
export const llamarCliente = (tel?: string | null) => {
    const d = soloDigitos(tel);
    if (d) Linking.openURL(`tel:${d}`).catch(() => Alert.alert('No pudimos iniciar la llamada'));
};
export const whatsappCliente = (c: Pick<Cliente, 'nombre' | 'telefono'>) => {
    const d = soloDigitos(c.telefono);
    if (!d) return;
    Linking.openURL(waLink(d, `Hola ${c.nombre},`)).catch(() => Alert.alert('No pudimos abrir WhatsApp', 'Revisá que esté instalado en el teléfono.'));
};

export default function ClientesScreen({ navigation }: any) {
    const s = useStyles();
    const { colors } = useTheme();
    const [search, setSearch] = useState('');
    const busqueda = useDebounced(search.trim());
    const lista = useListaPaginada(
        ['clientes', busqueda],
        (page, limit) => clientesApi.list(busqueda || undefined, page, limit),
    );

    return (
        <View style={s.root}>
            <FlatList
                data={lista.items}
                keyExtractor={(c) => String(c.id)}
                contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={lista.refrescando} onRefresh={lista.refrescar} tintColor={colors.accentText} />}
                onEndReached={lista.cargarMas}
                onEndReachedThreshold={0.4}
                ListHeaderComponent={
                    <View>
                        <T.Muted style={{ marginBottom: spacing.lg }}>Tu cartera. Tocá un cliente para ver su ficha.</T.Muted>
                        <Field
                            placeholder="Buscar por nombre, teléfono o DNI…"
                            accessibilityLabel="Buscar clientes"
                            autoCorrect={false}
                            value={search}
                            onChangeText={setSearch}
                            right={lista.buscando ? <ActivityIndicator color={colors.accentText} style={{ marginRight: spacing.md }} /> : null}
                        />
                    </View>
                }
                renderItem={({ item }) => {
                    const est = item.estadoLead ? ESTADO_LEAD_LABEL[item.estadoLead] : null;
                    const nombre = nombreCliente(item);
                    return (
                        // La tarjeta no es un único botón: así "Llamar" y "WhatsApp" siguen
                        // siendo alcanzables con el lector de pantalla.
                        <Card style={{ marginTop: spacing.md }}>
                            <Pressable
                                onPress={() => navigation.navigate('ClienteDetalle', { id: item.id })}
                                accessibilityRole="button"
                                accessibilityLabel={[nombre, est?.label, item.telefono].filter(Boolean).join(', ')}
                                accessibilityHint="Abre la ficha del cliente"
                                style={({ pressed }) => pressed && { opacity: 0.7 }}
                            >
                                <View style={s.rowTop}>
                                    <Text style={s.nombre}>{nombre}</Text>
                                    {est ? <Badge label={est.label} tone={est.tone} /> : null}
                                    <Feather name="chevron-right" size={18} color={colors.textMuted} />
                                </View>
                                <T.Muted style={{ marginTop: 2 }}>
                                    {[item.telefono, item.origenLead ? ORIGEN_LEAD_LABEL[item.origenLead] : null].filter(Boolean).join(' · ') || 'Sin teléfono'}
                                </T.Muted>
                                {item.observaciones ? <T.Muted style={{ marginTop: spacing.xs }} >{item.observaciones}</T.Muted> : null}
                            </Pressable>
                            {item.telefono ? (
                                <View style={s.actions}>
                                    <Pressable
                                        onPress={() => llamarCliente(item.telefono)}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Llamar a ${nombre}`}
                                        style={({ pressed }) => [s.action, pressed && { opacity: 0.7 }]}
                                    >
                                        <Feather name="phone" size={15} color={colors.textSecondary} />
                                        <Text style={s.actionText}>Llamar</Text>
                                    </Pressable>
                                    <Pressable
                                        onPress={() => whatsappCliente(item)}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Escribirle a ${nombre} por WhatsApp`}
                                        style={({ pressed }) => [s.action, pressed && { opacity: 0.7 }]}
                                    >
                                        <Feather name="message-circle" size={15} color={colors.textSecondary} />
                                        <Text style={s.actionText}>WhatsApp</Text>
                                    </Pressable>
                                </View>
                            ) : null}
                        </Card>
                    );
                }}
                ListEmptyComponent={<EstadoLista q={lista.q} que="los clientes" vacio={busqueda ? 'Ningún cliente coincide con la búsqueda.' : 'No hay clientes.'} />}
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
    nombre: { color: colors.text, fontFamily: fonts.brand, fontSize: fontSize.md, fontWeight: '700', flex: 1 },
    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: touchMin, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.inputBorder },
    actionText: { color: colors.textSecondary, fontWeight: '600', fontSize: fontSize.sm },
}));
