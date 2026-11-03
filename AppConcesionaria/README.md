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

La app apunta por defecto a **producción**: entrás con tu usuario de AUTENZA (el mismo de la web). Para probar sin tocar datos reales, apuntala a un backend local (abajo) y usá los usuarios que crea el seed de ese entorno.

> En un dispositivo nativo **no hay CORS** (es cosa del navegador), así que la app habla con el backend de prod sin configuración extra.

### Apuntar a un backend local

Poné la variable antes de arrancar (Expo expone al bundle las que empiezan con `EXPO_PUBLIC_`):

```bash
EXPO_PUBLIC_API_BASE_URL=http://TU_IP_LAN:3000/api npm start
```

- **Emulador Android:** el `localhost` del host es `10.0.2.2`.
- **Dispositivo real:** usá la IP de tu PC en la LAN (ej. `http://192.168.0.15:3000/api`).
- **La web** ("¿Olvidaste tu contraseña?" y los roles sin app) se abre en el mismo origen que la API; si en desarrollo corre en otro puerto: `EXPO_PUBLIC_WEB_BASE_URL=http://TU_IP_LAN:5173`.

## Estructura

```
src/
  config.ts            # URL del backend (override con EXPO_PUBLIC_API_BASE_URL)
  theme/tokens.ts      # paletas clara y oscura, tipografía y gradiente de marca AUTENZA
  theme/theme.ts       # useTheme() (sigue el tema del sistema) y makeStyles()
  api/                 # cliente axios (auth + refresh) y módulos por recurso
  store/authStore.ts   # sesión + tokens en almacenamiento seguro (Keychain/Keystore)
  components/ui.tsx    # botones, campos, badges, tarjetas, estados de error/vacío (accesibles)
  hooks/               # listas paginadas con scroll infinito y búsqueda con debounce
  lib/                 # funciones puras: formatos, errores legibles, URLs, paginación
  navigation/          # gate de auth y por rol + tabs (Mostrador, Clientes, Stock, Más)
  screens/             # Login, Mostrador, atención, fichas de unidad/cliente/tasación, ...
```

## Estado

Cubre el trabajo del **vendedor** y del **tasador**:

- **Mostrador:** abrir la atención, relevar qué busca, mostrar unidades, cargar el canje, cerrar con resultado y pasar a presupuesto o venta con el cliente (y la unidad) ya cargados.
- **Clientes** y **Stock:** listas con búsqueda y ficha (la de la unidad, con fotos y "Compartir por WhatsApp"; nunca el precio de compra).
- **Más:** presupuestos, ventas y tasaciones (lista, alta y detalle).
- Login con verificación en dos pasos (código de la app o de recuperación).
- Sigue el tema claro/oscuro del sistema.

Los roles **cobrador**, **postventa** y **lectura** todavía no tienen pantallas: al entrar ven un aviso que los manda a la web.

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
