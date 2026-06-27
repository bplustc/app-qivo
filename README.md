# Qivo - Quito en Movimiento

Qivo es una aplicacion web de reservas para traslados en Quito y hacia/desde el aeropuerto, con enfoque en experiencia movil y solicitud rapida por WhatsApp.

## Caracteristicas principales
- Flujo de reserva desde tarjetas de servicio (Hacia el Aeropuerto / Desde el Aeropuerto).
- Modal de solicitud con formulario completo de viaje.
- Integracion con Google Maps + Places API.
- Sincronizacion del mapa al escribir direccion (autocomplete y ajuste de marcador).
- Seleccion de punto GPS por clic en mapa o arrastre de marcador.
- Validacion estricta de telefono: solo numerico y exactamente 10 digitos.
- Integracion de envio por WhatsApp al conductor disponible.
- Modo solo movil (oculta interfaz principal en escritorio).
- SEO tecnico inicial (meta tags sociales, JSON-LD, robots y sitemap).

## Requisitos
- Navegador moderno.
- API Key de Google Maps con estas APIs habilitadas:
	- Maps JavaScript API
	- Places API
- Node.js LTS (para generar build de produccion).

## Instalacion y uso
1. Clona este repositorio.
2. Abre la carpeta del proyecto.
3. Ejecuta un servidor local estatico (ejemplo: Live Server en el puerto 5500).
4. Verifica que la API Key de Google Maps este configurada en `index.html`.
5. Abre la pagina en movil o emulacion movil para probar el flujo completo.

## Build de produccion
1. Instala dependencias:
	- `npm install`
2. Genera la version optimizada:
	- `npm run build`
3. Publica el contenido de la carpeta `dist/`.

La carpeta `dist/` se genera con:
- HTML minificado.
- CSS copiado para mantener compatibilidad de estilos actual.
- JavaScript minificado y ofuscado (mangle/compress).

## Deploy automatico (GitHub Pages)
El repositorio incluye el workflow `deploy-pages.yml` en `.github/workflows/`.

Flujo:
1. Cada push a `main` ejecuta `npm ci` y `npm run build`.
2. Se publica automaticamente la carpeta `dist/` en GitHub Pages.

Configuracion requerida en GitHub:
1. Ir a Settings > Pages.
2. En Build and deployment, seleccionar Source: GitHub Actions.
3. Guardar cambios.

Una vez habilitado, cada commit en `main` dispara el despliegue.

## Estructura del proyecto
- `index.html`: Estructura principal, formulario y metadatos SEO.
- `styles.css`: Estilos generales, modal y comportamiento de interfaz movil.
- `app.js`: Logica de UI, validaciones, mapa, sincronizacion y WhatsApp.
- `Images/`: Logo e iconos visuales.
- `robots.txt`: Politica de rastreo para buscadores.
- `sitemap.xml`: Sitemap XML para indexacion.
- `VERSIONES.md`: Historial de cambios por version.

## Versionado
El proyecto usa versionado semantico:
- MAJOR: cambios incompatibles.
- MINOR: nuevas funcionalidades compatibles.
- PATCH: correcciones y mejoras menores.

Consulta el detalle historico en `VERSIONES.md`.

## SEO implementado
- Meta description y keywords.
- Open Graph para compartir en redes.
- Twitter Card.
- Canonical.
- JSON-LD tipo `TaxiService`.
- `robots.txt` y `sitemap.xml`.

## Notas de produccion
- Actualizar dominio final en `canonical`, `og:url`, `og:image`, `robots.txt` y `sitemap.xml`.
- Restringir la API Key de Google Maps por dominio/referrer.
- No exponer claves privadas o credenciales sensibles en frontend.

## Autor
B+ Technology