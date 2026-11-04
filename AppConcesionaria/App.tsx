import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import {
    useFonts,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';

import { useTheme } from './src/theme/theme';
import { queryClient } from './src/api/queryClient';
import { useAuthStore } from './src/store/authStore';
import RootNavigator from './src/navigation';

export default function App() {
    const { dark, colors } = useTheme();
    const [fontsLoaded] = useFonts({ SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold });
    const hydrated = useAuthStore((s) => s.hydrated);
    const bootstrap = useAuthStore((s) => s.bootstrap);

    useEffect(() => { bootstrap(); }, [bootstrap]);

    if (!fontsLoaded || !hydrated) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
                <StatusBar style={dark ? 'light' : 'dark'} />
                <ActivityIndicator color={colors.accentText} size="large" accessibilityLabel="Cargando" />
            </View>
        );
    }

    return (
        <SafeAreaProvider>
            <QueryClientProvider client={queryClient}>
                {/* Texto de la barra de estado según el tema (claro sobre oscuro y al revés). */}
                <StatusBar style={dark ? 'light' : 'dark'} />
                <RootNavigator />
            </QueryClientProvider>
        </SafeAreaProvider>
    );
}
