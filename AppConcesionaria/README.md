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

## Generar un APK para instalar y probar (Android)

Un APK real se comporta como la app instalada (y en nativo **no hay CORS**, así que habla con prod sin vueltas). Se compila en la nube con **EAS Build** — no hace falta Android SDK ni Mac en tu PC.

Requisito: una cuenta de Expo (gratis en [expo.dev](https://expo.dev)).

```bash
cd AppConcesionaria
npx eas-cli@latest login          # tu cuenta de Expo (si no tenés, creala en expo.dev)
npx eas-cli@latest build -p android --profile preview
```

- La primera vez te pregunta si querés crear/enlazar un proyecto EAS: aceptá (escribe `extra.eas.projectId` en `app.json`).
- Compila en los servidores de Expo (~10-15 min la primera) y al terminar te da una **URL para descargar el `.apk`**.
- Abrí esa URL **desde el teléfono**, descargá el APK e instalalo (Android te va a pedir habilitar "instalar apps de orígenes desconocidos" para tu navegador).

El perfil `preview` (en `eas.json`) produce un **APK** instalable directo; el perfil `production` produce un **AAB** para subir a Google Play.

### Alternativa sin compilar: Expo Go
Si querés probar YA sin esperar el build: `npm start`, y escaneá el QR con **Expo Go** (Play Store / App Store). Corre el mismo código contra prod.

## Publicar a las tiendas (más adelante)

Android: `npx eas-cli@latest build -p android --profile production` (AAB) → subir a Google Play.
iOS: `npx eas-cli@latest build -p ios` — requiere credenciales de Apple Developer (la compilación es en la nube, no necesita Mac).
