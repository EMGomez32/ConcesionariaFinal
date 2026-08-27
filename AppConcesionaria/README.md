# AUTENZA — App móvil (iOS / Android)

App nativa para el **rol vendedor y el rol tasador**, construida con **Expo** (SDK 57 / React Native 0.86). Consume el mismo backend que la web (`autenza.nebulant.com.ar/api`), así que no hay datos nuevos: es otra puerta de entrada al mismo sistema.

## Por qué Expo

Se desarrolla iOS **y** Android desde Windows (sin Mac): la app corre en el teléfono con **Expo Go** escaneando un QR, y para publicar en las tiendas se compila en la nube con **EAS Build**.

## Correrla en tu teléfono (desarrollo)

1. Instalá **Expo Go** desde la App Store (iOS) o Play Store (Android).
2. En esta carpeta:
   ```bash
   npm install
   npm start
   ```
3. Escaneá el QR que aparece en la terminal con Expo Go (Android) o con la cámara (iOS).

La app apunta por defecto a **producción**, así que podés entrar directo con una cuenta demo:

- **Vendedor:** `vendedor2@demo.com` / `demo1234`
- **Admin/Tasador:** `admin@demo.com` / `demo1234`

> En un dispositivo nativo **no hay CORS** (es cosa del navegador), así que la app habla con el backend de prod sin configuración extra.

### Apuntar a un backend local

Poné la variable antes de arrancar (Expo expone al bundle las que empiezan con `EXPO_PUBLIC_`):

```bash
EXPO_PUBLIC_API_BASE_URL=http://TU_IP_LAN:3000/api npm start
```

- **Emulador Android:** el `localhost` del host es `10.0.2.2`.
- **Dispositivo real:** usá la IP de tu PC en la LAN (ej. `http://192.168.0.15:3000/api`).

## Estructura

```
src/
  config.ts            # URL del backend (override con EXPO_PUBLIC_API_BASE_URL)
  theme/tokens.ts      # colores, tipografía y gradiente de marca AUTENZA
  api/                 # cliente axios (auth + refresh) y módulos por recurso
  store/authStore.ts   # sesión + tokens en almacenamiento seguro (Keychain/Keystore)
  components/ui.tsx    # botones, campos, badges, tarjetas
  navigation/          # gate de auth + tabs del vendedor + stack del mostrador
  screens/             # Login, Mostrador (atenciones), detalle, ...
```

## Estado

Primera rebanada funcionando de punta a punta: **login → Mostrador (lista de atenciones + alertas) → detalle**. Las secciones Clientes, Vehículos y Tasaciones están como *placeholder* y se van completando por iteración (alcance objetivo: rol vendedor + rol tasador completos).

## Publicar a las tiendas (más adelante)

Con [EAS Build](https://docs.expo.dev/build/introduction/): `npx eas build -p android` / `-p ios`. Requiere cuenta de Expo y, para iOS, credenciales de Apple Developer (la compilación es en la nube, no necesita Mac).
