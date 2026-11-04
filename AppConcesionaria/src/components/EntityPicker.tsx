import React, { useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { spacing, radius, fontSize, touchMin } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/theme';
import { Field, GhostButton, Sheet, EstadoLista, PieLista } from './ui';
import { useDebounced, useListaPaginada } from '../hooks/useListaPaginada';
import { Paginado } from '../lib/paginacion';

export interface PickerItem<D = unknown> { id: number; label: string; sub?: string; data?: D }

/**
 * Campo selector: muestra el elemento elegido y abre un buscador (modal) que
 * consulta `fetchPage(query, page)`. Sirve para elegir cliente, vehículo, etc.
 * Distingue "no se pudo cargar" (con Reintentar) de "sin resultados", busca con
 * debounce sin borrar la lista en cada tecla y pagina al llegar al final.
 */
export function EntityPicker<D = unknown>({
    label, placeholder, value, fetchPage, toItem, onSelect, queryKey,
}: {
    label: string;
    placeholder: string;
    value: PickerItem<D> | null;
    /** Clave de caché propia del selector (p. ej. ['picker', 'clientes']). */
    queryKey: readonly unknown[];
    fetchPage: (query: string, page: number, limit: number) => Promise<Paginado<any>>;
    toItem: (row: any) => PickerItem<D>;
    onSelect: (item: PickerItem<D>) => void;
}) {
    const s = useStyles();
    const { colors } = useTheme();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const busqueda = useDebounced(query.trim(), 350);

    const lista = useListaPaginada<any>(
        [...queryKey, busqueda],
        (page, limit) => fetchPage(busqueda, page, limit),
        { enabled: open },
    );
    const items = lista.items.map(toItem);

    return (
        <View>
            {label ? <Text style={s.label}>{label}</Text> : null}
            <Pressable
                onPress={() => { setQuery(''); setOpen(true); }}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${value ? value.label : 'sin elegir'}`}
                accessibilityHint="Abre un buscador para elegir"
                style={({ pressed }) => [s.control, pressed && { opacity: 0.7 }]}
            >
                <Text style={[s.controlText, !value && { color: colors.textMuted }]} numberOfLines={1}>
                    {value ? value.label : placeholder}
                </Text>
                <Feather name="chevron-down" size={18} color={colors.textMuted} />
            </Pressable>

            <Sheet
                visible={open}
                onClose={() => setOpen(false)}
                title={label || 'Elegir'}
                footer={<GhostButton title="Cerrar" onPress={() => setOpen(false)} style={{ flex: 1 }} />}
            >
                <Field
                    placeholder="Buscar…"
                    value={query}
                    onChangeText={setQuery}
                    autoFocus
                    autoCorrect={false}
                    accessibilityLabel={`Buscar ${label.toLowerCase()}`}
                    right={lista.buscando ? <ActivityIndicator color={colors.accentText} style={{ marginRight: spacing.md }} /> : null}
                />
                <View style={{ height: 300, marginTop: spacing.sm }}>
                    <FlatList
                        data={items}
                        keyExtractor={(i) => String(i.id)}
                        keyboardShouldPersistTaps="handled"
                        onEndReached={lista.cargarMas}
                        onEndReachedThreshold={0.4}
                        renderItem={({ item }) => {
                            const on = value?.id === item.id;
                            return (
                                <Pressable
                                    onPress={() => { onSelect(item); setOpen(false); }}
                                    accessibilityRole="button"
                                    accessibilityLabel={[item.label, item.sub].filter(Boolean).join(', ')}
                                    accessibilityState={{ selected: on }}
                                    style={({ pressed }) => [s.opt, on && s.optOn, pressed && { opacity: 0.7 }]}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.optLabel}>{item.label}</Text>
                                        {item.sub ? <Text style={s.optSub}>{item.sub}</Text> : null}
                                    </View>
                                    {on ? <Feather name="check" size={16} color={colors.accentText} /> : null}
                                </Pressable>
                            );
                        }}
                        ListEmptyComponent={
                            <EstadoLista q={lista.q} que="las opciones" vacio={busqueda ? 'Sin resultados para esa búsqueda.' : 'No hay nada para elegir.'} />
                        }
                        ListFooterComponent={
                            <PieLista
                                cargandoMas={lista.q.isFetchingNextPage}
                                errorMas={lista.q.isFetchNextPageError}
                                onRetry={lista.cargarMas}
                                mostrando={items.length}
                                total={lista.total}
                            />
                        }
                    />
                </View>
            </Sheet>
        </View>
    );
}

const useStyles = makeStyles((colors) => ({
    label: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: spacing.sm },
    control: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 52 },
    controlText: { color: colors.text, fontSize: fontSize.md, flex: 1 },
    opt: { flexDirection: 'row', alignItems: 'center', minHeight: touchMin, paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
    optOn: { borderColor: colors.accent, backgroundColor: colors.accent + '14' },
    optLabel: { color: colors.text, fontSize: fontSize.base, fontWeight: '600' },
    optSub: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
}));
