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

El portal usa Node.js, Express, Prisma y PostgreSQL. Los miembros pueden registrarse con nombre, correo y contraseña, o iniciar sesión con Google o Microsoft. Los pastores y líderes pueden entrar con Google o Microsoft usando el correo que el administrador haya autorizado. Las contraseñas se almacenan con scrypt; el servidor crea sesiones con cookies HTTP-only. El registro público siempre crea una cuenta `MIEMBRO` y nunca concede permisos internos.

1. Copia `backend/.env.example` a `backend/.env` y completa la conexión PostgreSQL, una clave `SESSION_SECRET` aleatoria de al menos 32 caracteres y `BASE_URL`.
2. Registra en Google Cloud y Microsoft Entra las URL de retorno:
   - `{BASE_URL}/api/auth/google/callback`
   - `{BASE_URL}/api/auth/microsoft/callback`
   - En Microsoft Entra, permite cuentas personales y organizacionales y concede el permiso delegado `User.Read`.
3. Configura los correos autorizados del servidor:
   - El acceso comunitario está abierto; Google y Microsoft crean cuentas `MIEMBRO` sin permisos internos. El acceso de liderazgo solo se permite a cuentas `PASTOR`/`LIDER` ya existentes o correos asignados en `PASTOR_EMAILS`/`LEADER_ACCESS`. Para Microsoft, registra la aplicación para cuentas personales y organizacionales y conserva `MICROSOFT_TENANT_ID=common`.
   - `ADMIN_EMAILS`: compatibilidad con administradores técnicos existentes.
   - `PASTOR_EMAILS`: compatibilidad con pastores existentes.
   - `LEADER_ACCESS`: asignación por correo, ministerio e iglesia. La lista integrada comienza con `presidente.dynamos@gmail.com=dynamos@ciudad-camelot`; agrega hasta 33 asignaciones adicionales separadas por coma para una lista inicial de 34 líderes. Ejemplo: `lider@example.org=damas@ciudad-camelot`.
   - `CHURCHES`: códigos y nombres de iglesias separados por punto y coma. Ejemplo: `ciudad-camelot:CCICAEPCC Ciudad Camelot;iglesia-hija:Nombre de la iglesia hija`.
4. Desde `backend`, ejecuta `npm run prisma:migrate`, `npm run prisma:generate` y `npm start`.

Para comprobar la conexión PostgreSQL en un despliegue, abre `GET {BASE_URL}/api/health/db`. Una respuesta `200` con `{"status":"ok","database":"connected"}` confirma que Prisma pudo ejecutar `SELECT 1`; un `503` indica revisar los Function Logs de Vercel, donde se registra el error técnico sin exponerlo al navegador.

Las rutas de contraseña son `POST /api/auth/register` y `POST /api/auth/login`. El registro requiere una contraseña de 12 a 128 bytes y asigna el rol `MIEMBRO`; el rol `SUPER_DEVELOPER` solo se concede al correo `sandoval97825@gmail.com` tras verificarlo con Google OAuth. El acceso por contraseña para esa cuenta se rechaza. Los roles `DEVELOPER`, `PASTOR` y `LIDER` se conservan en Prisma. Los miembros pueden enviar y consultar sus peticiones privadas en `POST` y `GET /api/member/prayer-requests`, y acceder a los devocionales mediante `GET /api/member/devotionals`; la API filtra las peticiones por la cuenta autenticada.

Google y Microsoft crean o autentican cuentas miembro sin conceder permisos internos. Para entrar al panel de liderazgo, el correo debe tener rol `PASTOR`/`LIDER` en Prisma o estar autorizado en `PASTOR_EMAILS`/`LEADER_ACCESS`; la asignación de líder incluye ministerio e iglesia. La lista inicial autoriza `presidente.dynamos@gmail.com` como líder del ministerio Dynamos en Ciudad Camelot. Los pastores y líderes van a `/admin/church-dashboard.html`; `SUPER_DEVELOPER` va a `/admin/developer.html`. Express protege esos paneles y sus APIs en el servidor. Solo `SUPER_DEVELOPER` puede agregar o revocar desarrolladores delegados mediante `POST` y `DELETE /api/developer/developers`; revocar un rol también invalida sus sesiones activas. Un administrador debe verificar identidades antes de asignar `LIDER`, `PASTOR` o `DEVELOPER` en Prisma. Nunca permitas que el formulario público elija un rol.

El inicio de sesión con Google usa Passport (`passport-google-oauth20`) y cookies HTTP-only para la sesión Prisma. Las rutas `/api/auth/google` y `/api/auth/google/callback` validan el perfil y el correo verificado, y solo autorizan los roles y listas permitidos arriba. Un líder o pastor incluido en `LEADER_ACCESS` o `PASTOR_EMAILS` recibe su rol correspondiente al crear la cuenta OAuth. Una cuenta existente inactiva no se reactiva al autenticar con Google. En Vercel configura `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, un `SESSION_SECRET` aleatorio de al menos 32 caracteres y `BASE_URL=https://icaepcamelot.vercel.app`. El callback se deriva del `BASE_URL` (o de `VERCEL_PROJECT_PRODUCTION_URL`/`VERCEL_URL`) y debe estar registrado exactamente como `https://icaepcamelot.vercel.app/api/auth/google/callback` en Google Cloud Console. Un error `401 invalid_client` indica credenciales OAuth incorrectas o deshabilitadas; confirma el Client ID y crea/reemplaza el Client Secret correcto en Google Cloud y en Vercel. Los botones de Google usan `/api/auth/google` en el mismo origen. Todo usuario creado por primera vez con contraseña, Google o Microsoft recibe un correo de bienvenida; configura `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM` en `backend/.env` y en las variables de Vercel. El servidor informa explícitamente si no puede entregar ese correo.

Los informes de ministerios quedan privados salvo que se marquen para publicación y estén aprobados. Los testimonios enviados por el público se guardan como pendientes y solo aparecen tras revisión pastoral; el carrusel público muestra hasta seis testimonios aprobados. Las métricas de integrantes solo están disponibles dentro del panel autorizado y no se publican en la web. Usa HTTPS en producción y no compartas ni confirmes credenciales OAuth desde el navegador.

## Despliegue en Vercel

La aplicación se despliega como una app Express con la API y la interfaz bajo el mismo dominio. En la configuración del proyecto de Vercel:

1. Importa el repositorio y deja la raíz del repositorio como **Root Directory** para que se use el `vercel.json` raíz.
2. La configuración raíz enruta el tráfico al handler `backend/server.js`, que exporta directamente la aplicación Express. El servidor confía en el proxy de Vercel y sirve los archivos estáticos desde la interfaz de backend. Después del despliegue, comprueba que `{BASE_URL}/api/auth/providers` devuelve JSON y no una página `NOT_FOUND`.
3. Configura en Vercel las variables: `DATABASE_URL`, `BASE_URL=https://icaepcamelot.vercel.app`, `SESSION_SECRET` aleatorio de al menos 32 caracteres, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID=common`, ajustes SMTP, correos autorizados y `CHURCHES`. No subas `backend/.env`.
4. Registra en Google Cloud Console la URI de redirección autorizada exacta `https://icaepcamelot.vercel.app/api/auth/google/callback` y en Microsoft Entra `https://icaepcamelot.vercel.app/api/auth/microsoft/callback`. La ruta `GET /api/auth/providers` indica cuáles proveedores quedaron listos; requiere credenciales y `SESSION_SECRET`.
5. Antes de abrir el sitio al público, aplica la migración a la base PostgreSQL de producción desde un entorno autorizado con `npm run prisma:migrate`. No se ejecuta automáticamente durante el despliegue.

La web y la API siguen siendo una aplicación integrada. El formulario de testimonios envía `POST {BASE_URL}/api/public/testimonials`; Express recibe nombre, calificación, texto, enlace de imagen opcional y consentimiento. Si esa URL devuelve una página `NOT_FOUND` de Vercel en vez de JSON de Express, verifica que el **Root Directory** sea la raíz del repositorio, que la configuración raíz enrute al entrypoint `backend/server.js` y que las variables de entorno estén completas. Las instrucciones oficiales de [Express en Vercel](https://vercel.com/docs/frameworks/backend/express) describen este modelo.

Netlify puede alojar la interfaz generada en `backend/public/`; para mantener inicio de sesión, API y panel, configura también un backend Node.js accesible por HTTPS y enruta `/api/*` a ese servicio. Un despliegue únicamente estático en Netlify no proporciona el backend ni las funciones privadas.

---

## 👤 Autor

**Manuel Dionicio Sandoval Carranza**  
Estudiante de *Ingeniería en Inteligencia Artificial y Ciencias de Datos* (UNAD).  
* **LinkedIn:** [mdsandoval7](https://www.linkedin.com/in/mdsandoval7/)
* **GitHub:** [mdsandoval7](https://github.com/mdsandoval7)

  git clone https://github.com/mdsandoval7/plataforma-comunidad-iglesia.git
