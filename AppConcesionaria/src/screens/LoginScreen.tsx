import React, { useState } from 'react';
import {
    View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius, fonts, fontSize, brandGradient } from '../theme/tokens';
import { Field, GradientButton, T } from '../components/ui';
import { login } from '../store/authStore';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const onSubmit = async () => {
        if (!email.trim() || !password) {
            Alert.alert('Faltan datos', 'Ingresá tu correo y contraseña.');
            return;
        }
        setLoading(true);
        try {
            await login(email.trim(), password);
            // El gate de navegación reacciona al store: no hace falta navegar a mano.
        } catch (e) {
            Alert.alert('No pudimos entrar', (e as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={s.root}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
                    <View style={s.brand}>
                        <LinearGradient
                            colors={brandGradient}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            style={s.logo}
                        >
                            <Text style={s.logoLetter}>A</Text>
                        </LinearGradient>
                        <Text style={s.wordmark}>AUTENZA</Text>
                        <Text style={s.tagline}>DEALER OPERATING SYSTEM</Text>
                    </View>

                    <View style={s.card}>
                        <T.H2 style={{ marginBottom: 4 }}>Bienvenido de vuelta</T.H2>
                        <T.Muted>Iniciá sesión para acceder a tu panel.</T.Muted>

                        <Field
                            label="Correo electrónico"
                            placeholder="tu@email.com"
                            autoCapitalize="none"
                            keyboardType="email-address"
                            autoCorrect={false}
                            value={email}
                            onChangeText={setEmail}
                            style={{ marginTop: spacing.xl }}
                        />
                        <Field
                            label="Contraseña"
                            placeholder="••••••••"
                            secureTextEntry
                            value={password}
                            onChangeText={setPassword}
                            onSubmitEditing={onSubmit}
                            returnKeyType="go"
                            style={{ marginTop: spacing.lg }}
                        />

                        <GradientButton
                            title="Iniciar sesión"
                            onPress={onSubmit}
                            loading={loading}
                            style={{ marginTop: spacing.xl }}
                        />
                    </View>

                    <Text style={s.footer}>© 2026 AUTENZA · Concesionaria</Text>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
    brand: { alignItems: 'center', marginBottom: spacing.xxl },
    logo: { width: 72, height: 72, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center' },
    logoLetter: { color: colors.onAccent, fontSize: 40, fontFamily: fonts.brandBold, fontWeight: '700' },
    wordmark: { color: colors.text, fontSize: fontSize.xl, letterSpacing: 6, fontFamily: fonts.brandBold, fontWeight: '700', marginTop: spacing.lg },
    tagline: { color: colors.textMuted, fontSize: 11, letterSpacing: 3, marginTop: 4 },
    card: {
        backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
        borderRadius: radius.xl, padding: spacing.xl,
    },
    footer: { color: colors.textMuted, fontSize: fontSize.xs, textAlign: 'center', marginTop: spacing.xxl },
});
