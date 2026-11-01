# 🏛️ Plataforma de Gestión y Comunicación Comunitaria

Plataforma tecnológica enfocada en la automatización de procesos, gestión de actividades y mejora de la comunicación para comunidades y grupos locales. 

Este proyecto nace con el objetivo de aplicar tecnologías accesibles e innovadoras para resolver retos operativos reales en la gestión comunitaria e impactar positivamente a sus miembros.

---

## 🎯 Objetivos del Proyecto

* **Optimización de Procesos:** Centralizar el registro de miembros, asistencia a eventos y organización de actividades.
* **Comunicación Eficiente:** Facilitar la difusión de avisos, cronogramas de actividades y recursos comunitarios.
* **Impacto Social:** Brindar una herramienta intuitiva que apoye el liderazgo técnico y la toma de decisiones basada en datos organizados.

---

## 🛠️ Stack Tecnológico & Herramientas

* **Frontend:** HTML5, CSS3, JavaScript
* **Backend / Lógica:** Node.js, Express, Prisma y PostgreSQL
* **Control de Versiones:** Git & GitHub
* **IDE / Entorno:** Visual Studio Code

---

## 🚀 Características Principales (En desarrollo)

- [ ] Módulo de registro y consulta de eventos / reuniones.
- [ ] Panel de control para líderes de grupo y colaboradores.
- [ ] Sección de recursos, guías y material educativo/formativo.
- [ ] Interfaz accesible, responsiva y adaptable a dispositivos móviles.

## Backend y acceso al portal

El portal usa Node.js, Express, Prisma y PostgreSQL. La comunidad puede crear una sesión de acceso con OAuth de Google o Microsoft. Los correos de líderes, pastores y administradores se autorizan por separado en el servidor; una cuenta comunitaria nunca obtiene permisos internos.

1. Copia `backend/.env.example` a `backend/.env` y completa la conexión PostgreSQL, una clave `SESSION_SECRET` aleatoria de al menos 32 caracteres y `BASE_URL`.
2. Registra en Google Cloud y/o Microsoft Entra las URL de retorno:
   - `{BASE_URL}/api/auth/google/callback`
   - `{BASE_URL}/api/auth/microsoft/callback`
3. Configura los correos autorizados del servidor:
   - El registro de comunidad está abierto mediante Google o Microsoft; estas cuentas no reciben permisos internos.
   - `ADMIN_EMAILS`: administradores técnicos con acceso total.
   - `PASTOR_EMAILS`: pastores con acceso consolidado y moderación.
   - `LEADER_ACCESS`: asignación por correo, ministerio e iglesia. Ejemplo: `lider@example.org=damas@ciudad-camelot`.
   - `CHURCHES`: códigos y nombres de iglesias separados por punto y coma. Ejemplo: `ciudad-camelot:CCICAEPCC Ciudad Camelot;iglesia-hija:Nombre de la iglesia hija`.
4. Desde `backend`, ejecuta `npm run prisma:migrate`, `npm run prisma:generate` y `npm start`.

Los informes de ministerios quedan privados salvo que se marquen para publicación y estén aprobados. Los testimonios enviados por el público se guardan como pendientes y solo aparecen tras revisión pastoral; el carrusel público muestra hasta seis testimonios aprobados. Las métricas de integrantes solo están disponibles dentro del panel autorizado y no se publican en la web. Usa HTTPS en producción y no compartas ni confirmes credenciales OAuth desde el navegador.

## Despliegue en Vercel

La aplicación se despliega como una app Express con la API y la interfaz bajo el mismo dominio. En la configuración del proyecto de Vercel:

1. Importa el repositorio y define `backend` como **Root Directory**.
2. Deja que Vercel detecte Express y ejecute `npm run vercel-build`. El entrypoint `backend/index.js` exporta la app; el build genera Prisma Client y copia la interfaz desde `backend/prisma/frontend/` a `backend/public/`, que Vercel sirve desde su CDN.
3. Configura en Vercel las variables de `backend/.env.example`: `DATABASE_URL`, `BASE_URL` con el dominio HTTPS de producción, `SESSION_SECRET`, credenciales OAuth, correos autorizados y `CHURCHES`. No subas `backend/.env`.
4. Registra en Google y Microsoft las URL OAuth `{BASE_URL}/api/auth/google/callback` y `{BASE_URL}/api/auth/microsoft/callback`.
5. Antes de abrir el sitio al público, aplica la migración a la base PostgreSQL de producción desde un entorno autorizado con `npm run prisma:migrate`. No se ejecuta automáticamente durante el despliegue.

Vercel sirve `public/` como archivos estáticos y no ejecuta `express.static()` para esas rutas; por eso el script de build prepara esa carpeta. La web y la API siguen siendo una aplicación integrada, y el panel no funcionará hasta que estén configurados la base de datos y los proveedores OAuth. Las instrucciones oficiales de [Express en Vercel](https://vercel.com/docs/frameworks/backend/express) describen este modelo.

Netlify puede alojar la interfaz generada en `backend/public/`; para mantener inicio de sesión, API y panel, configura también un backend Node.js accesible por HTTPS y enruta `/api/*` a ese servicio. Un despliegue únicamente estático en Netlify no proporciona el backend ni las funciones privadas.

---

## 👤 Autor

**Manuel Dionicio Sandoval Carranza**  
Estudiante de *Ingeniería en Inteligencia Artificial y Ciencias de Datos* (UNAD).  
* **LinkedIn:** [mdsandoval7](https://www.linkedin.com/in/mdsandoval7/)
* **GitHub:** [mdsandoval7](https://github.com/mdsandoval7)

  git clone https://github.com/mdsandoval7/plataforma-comunidad-iglesia.git
