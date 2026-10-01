import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    useFonts,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';

import { colors } from './src/theme/tokens';
import { useAuthStore } from './src/store/authStore';
import RootNavigator from './src/navigation';

const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function App() {
    const [fontsLoaded] = useFonts({ SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold });
    const hydrated = useAuthStore((s) => s.hydrated);
    const bootstrap = useAuthStore((s) => s.bootstrap);

    useEffect(() => { bootstrap(); }, [bootstrap]);

    if (!fontsLoaded || !hydrated) {
        return (
            <View style={s.splash}>
                <ActivityIndicator color={colors.accent} size="large" />
            </View>
        );
    }

    return (
        <SafeAreaProvider>
            <QueryClientProvider client={queryClient}>
                <StatusBar style="light" />
                <RootNavigator />
            </QueryClientProvider>
        </SafeAreaProvider>
    );
}

const s = StyleSheet.create({
    splash: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
