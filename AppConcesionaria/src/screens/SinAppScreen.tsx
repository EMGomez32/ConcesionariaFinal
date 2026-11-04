import React from 'react';
import { View, Linking, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { spacing, radius } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/theme';
import { GradientButton, GhostButton, T, confirmarCerrarSesion } from '../components/ui';
import { useAuthStore } from '../store/authStore';
import { WEB_BASE_URL } from '../config';
import { rolesLegibles } from '../lib/formato';

/**
 * Roles que todavía no tienen pantallas en la app (cobrador, postventa, lectura).
 * En vez de mostrarles listas vacías por los 403 del backend, se lo decimos claro
 * y los mandamos a la web.
 */
export default function SinAppScreen() {
    const s = useStyles();
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const user = useAuthStore((st) => st.user);
    const logout = useAuthStore((st) => st.logout);

    const abrirWeb = () => {
        Linking.openURL(WEB_BASE_URL).catch(() => Alert.alert('No pudimos abrir la web', WEB_BASE_URL));
    };

    return (
        <View style={[s.root, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
            <View style={s.icon}><Feather name="monitor" size={28} color={colors.accentText} /></View>
            <T.H2 style={{ textAlign: 'center', marginTop: spacing.lg }}>Tu rol todavía no tiene app</T.H2>
            <T.Muted style={{ textAlign: 'center', marginTop: spacing.sm }}>
                Usá la versión web desde el navegador del teléfono o de la computadora.
            </T.Muted>
            {user ? (
                <T.Muted style={{ textAlign: 'center', marginTop: spacing.md }}>
                    {user.nombre} · {rolesLegibles(user.roles) || 'Sin rol asignado'}
                </T.Muted>
            ) : null}
            <GradientButton title="Abrir la versión web" onPress={abrirWeb} style={{ marginTop: spacing.xl, alignSelf: 'stretch' }} />
            <GhostButton title="Cerrar sesión" icon="log-out" onPress={() => confirmarCerrarSesion(() => { logout(); })} style={{ marginTop: spacing.md, alignSelf: 'stretch' }} />
        </View>
    );
}

const useStyles = makeStyles((colors) => ({
    root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
    icon: { width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center' },
}));
