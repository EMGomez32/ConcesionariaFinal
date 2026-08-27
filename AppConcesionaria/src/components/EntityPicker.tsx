import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radius, fontSize } from '../theme/tokens';
import { Field, Sheet, T } from './ui';

export interface PickerItem { id: number; label: string; sub?: string }

/**
 * Campo selector: muestra el elemento elegido y abre un buscador (modal) que
 * consulta `fetch(query)`. Sirve para elegir cliente, vehículo, etc.
 */
export function EntityPicker({
    label, placeholder, value, fetch, onSelect,
}: {
    label: string;
    placeholder: string;
    value: PickerItem | null;
    fetch: (query: string) => Promise<PickerItem[]>;
    onSelect: (item: PickerItem) => void;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [items, setItems] = useState<PickerItem[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        let alive = true;
        setLoading(true);
        const t = setTimeout(() => {
            fetch(query).then((r) => { if (alive) setItems(r); }).catch(() => { if (alive) setItems([]); })
                .finally(() => { if (alive) setLoading(false); });
        }, 300);
        return () => { alive = false; clearTimeout(t); };
    }, [open, query, fetch]);

    return (
        <View>
            {label ? <Text style={s.label}>{label}</Text> : null}
            <Pressable onPress={() => { setQuery(''); setOpen(true); }} style={s.control}>
                <Text style={[s.controlText, !value && { color: colors.textMuted }]} numberOfLines={1}>
                    {value ? value.label : placeholder}
                </Text>
                <Feather name="chevron-down" size={18} color={colors.textMuted} />
            </Pressable>

            <Sheet visible={open} onClose={() => setOpen(false)} title={label || 'Elegir'} >
                <Field placeholder="Buscar…" value={query} onChangeText={setQuery} autoFocus />
                <View style={{ height: 300, marginTop: spacing.sm }}>
                    {loading ? (
                        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />
                    ) : (
                        <FlatList
                            data={items}
                            keyExtractor={(i) => String(i.id)}
                            keyboardShouldPersistTaps="handled"
                            renderItem={({ item }) => (
                                <Pressable
                                    onPress={() => { onSelect(item); setOpen(false); }}
                                    style={[s.opt, value?.id === item.id && s.optOn]}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.optLabel}>{item.label}</Text>
                                        {item.sub ? <Text style={s.optSub}>{item.sub}</Text> : null}
                                    </View>
                                    {value?.id === item.id ? <Feather name="check" size={16} color={colors.accent} /> : null}
                                </Pressable>
                            )}
                            ListEmptyComponent={<T.Muted style={{ textAlign: 'center', marginTop: spacing.lg }}>Sin resultados.</T.Muted>}
                        />
                    )}
                </View>
            </Sheet>
        </View>
    );
}

const s = StyleSheet.create({
    label: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: spacing.sm },
    control: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 52 },
    controlText: { color: colors.text, fontSize: fontSize.md, flex: 1 },
    opt: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
    optOn: { borderColor: colors.accent, backgroundColor: colors.accent + '14' },
    optLabel: { color: colors.text, fontSize: fontSize.base, fontWeight: '600' },
    optSub: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
});
