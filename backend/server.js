require('dotenv').config();

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const path = require('node:path');
const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const nodemailer = require('nodemailer');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();
const frontendPath = path.join(__dirname, 'prisma', 'frontend');
const sessionCookieName = 'ccicaep_session';
const oauthCookieName = 'ccicaep_oauth';
const superDeveloperEmail = 'sandoval97825@gmail.com';
const sessionLifetimeMs = 8 * 60 * 60 * 1000;
const passwordKeyLength = 64;
const scryptAsync = promisify(crypto.scrypt);
const scryptOptions = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const dummyPasswordSalt = Buffer.alloc(16, 0x5a);
const dummyPasswordHash = crypto.scryptSync('invalid-password-placeholder', dummyPasswordSalt, passwordKeyLength, scryptOptions).toString('hex');
const ministries = new Set([
  'damas',
  'caballeros',
  'jovenes',
  'adolescentes',
  'ninos',
  'banda',
  'evangelismo',
  'vendimias',
  'pastores'
]);
const defaultChurchCode = 'ciudad-camelot';
const metricFields = [
  'totalMembers',
  'activeMembers',
  'inactiveMembers',
  'baptizedMembers',
  'nonBaptizedMembers',
  'newMembers',
  'departedMembers',
  'peopleToConsolidate',
  'scheduledVisits',
  'completedUnplannedVisits',
  'teamMembers',
  'pastoralGoal'
];
const oauthRateLimits = new Map();
function resolveBaseUrl(env = process.env) {
  const configuredUrl = env.BASE_URL
    || (env.VERCEL_PROJECT_PRODUCTION_URL && `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`)
    || (env.VERCEL_URL && `https://${env.VERCEL_URL}`)
    || 'http://localhost:3000';
  let parsedUrl;
  try {
    parsedUrl = new URL(configuredUrl);
  } catch {
    throw new Error('BASE_URL debe ser una URL HTTP o HTTPS válida.');
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
    throw new Error('BASE_URL debe usar HTTP o HTTPS y no incluir credenciales.');
  }
  return parsedUrl.origin;
}
const baseUrl = resolveBaseUrl();
const configuredBaseUrl = new URL(baseUrl);
const secureCookies = process.env.NODE_ENV === 'production'
  || Boolean(process.env.VERCEL)
  || configuredBaseUrl.protocol === 'https:';

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(passport.initialize());
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': "default-src 'self'; img-src 'self' https: data:; media-src https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' https://unpkg.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  });
  next();
});
app.use(express.json({ limit: '64kb' }));
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.is('application/json') && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) {
    return res.status(400).json({ error: 'El cuerpo de la solicitud debe ser un objeto JSON.' });
  }
  next();
});

function parseEmailList(value = '') {
  return new Set(value.split(',').map(email => email.trim().toLowerCase()).filter(Boolean));
}

function normalizeEmail(value) {
  if (typeof value !== 'string') throw Object.assign(new Error('Ingresa un correo electrónico válido.'), { status: 400 });
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error('Ingresa un correo electrónico válido.'), { status: 400 });
  }
  return email;
}

function validateRegistration(body = {}) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 100) {
    throw Object.assign(new Error('El nombre es obligatorio y no puede superar 100 caracteres.'), { status: 400 });
  }
  const email = normalizeEmail(body.email);
  if (typeof body.password !== 'string' || body.password.length < 12 || Buffer.byteLength(body.password, 'utf8') > 128) {
    throw Object.assign(new Error('La contraseña debe tener entre 12 y 128 bytes.'), { status: 400 });
  }
  return { name, email, password: body.password };
}

function validateLogin(body = {}) {
  const email = normalizeEmail(body.email);
  if (typeof body.password !== 'string' || !body.password || Buffer.byteLength(body.password, 'utf8') > 128) {
    throw Object.assign(new Error('Ingresa tu contraseña.'), { status: 400 });
  }
  const audience = body.audience || 'leadership';
  if (!['community', 'leadership'].includes(audience)) {
    throw Object.assign(new Error('El tipo de acceso solicitado no es válido.'), { status: 400 });
  }
  return { email, password: body.password, audience };
}

function validatePrayerRequest(body = {}) {
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (content.length < 10 || content.length > 4000) {
    throw Object.assign(new Error('La petición debe tener entre 10 y 4000 caracteres.'), { status: 400 });
  }
  return { content };
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(password, salt, passwordKeyLength, scryptOptions);
  return `scrypt$16384$8$1$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function verifyPassword(password, encodedHash) {
  const parts = typeof encodedHash === 'string' ? encodedHash.split('$') : [];
  const validFormat = parts.length === 6
    && parts[0] === 'scrypt'
    && parts[1] === '16384'
    && parts[2] === '8'
    && parts[3] === '1'
    && /^[a-f0-9]{32}$/i.test(parts[4])
    && /^[a-f0-9]{128}$/i.test(parts[5]);
  const salt = validFormat ? Buffer.from(parts[4], 'hex') : dummyPasswordSalt;
  const expected = validFormat ? Buffer.from(parts[5], 'hex') : Buffer.from(dummyPasswordHash, 'hex');
  const actual = await scryptAsync(password, salt, passwordKeyLength, scryptOptions);
  return validFormat && crypto.timingSafeEqual(actual, expected);
}

function getChurches() {
  const entries = (process.env.CHURCHES || 'ciudad-camelot:CCICAEPCC Ciudad Camelot')
    .split(';')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const separator = entry.indexOf(':');
      const code = (separator < 0 ? entry : entry.slice(0, separator)).trim().toLowerCase();
      const name = (separator < 0 ? entry : entry.slice(separator + 1)).trim();
      return /^[a-z0-9-]{2,64}$/.test(code) && name
        ? { code, name: name.slice(0, 120) }
        : null;
    })
    .filter(Boolean);
  return entries.length ? entries : [{ code: defaultChurchCode, name: 'CCICAEPCC Ciudad Camelot' }];
}

function parseLeaderAccess(value = '') {
  const entries = new Map();
  for (const assignment of value.split(',')) {
    const [rawEmail, rawAssignment] = assignment.split('=').map(part => part.trim());
    const email = rawEmail && rawEmail.toLowerCase();
    const [rawMinistry, rawChurch] = (rawAssignment || '').split('@');
    const ministryCode = rawMinistry && rawMinistry.toLowerCase();
    const churchCode = (rawChurch || defaultChurchCode).toLowerCase();
    if (email && ministries.has(ministryCode) && getChurches().some(church => church.code === churchCode)) {
      entries.set(email, { ministryCode, churchCode });
    }
  }
  return entries;
}

function getChurchName(code) {
  return getChurches().find(church => church.code === code)?.name || code;
}

function getAccess(email) {
  const normalizedEmail = email.toLowerCase();
  const administrators = parseEmailList(process.env.ADMIN_EMAILS);
  const pastors = parseEmailList(process.env.PASTOR_EMAILS);
  const leaderAccess = parseLeaderAccess(process.env.LEADER_ACCESS);
  const churchCodes = getChurches().map(church => church.code);

  if (administrators.has(normalizedEmail)) {
    return { role: 'admin', ministries: [...ministries], churchCodes };
  }
  if (pastors.has(normalizedEmail)) {
    return { role: 'pastor', ministries: [...ministries], churchCodes };
  }
  const assignment = leaderAccess.get(normalizedEmail);
  if (assignment) {
    return {
      role: 'leader',
      ministries: [assignment.ministryCode],
      churchCodes: [assignment.churchCode]
    };
  }
  return { role: 'community', ministries: [], churchCodes: [] };
}

function getPasswordAccess(user) {
  const communityAccess = { role: 'community', ministries: [], churchCodes: [] };
  const configuredAccess = getAccess(user.email);

  if (user.email.toLowerCase() === superDeveloperEmail || user.role === 'SUPER_DEVELOPER') return null;
  if (user.role === 'DEVELOPER') {
    return { role: 'developer', ministries: [], churchCodes: [] };
  }
  if (user.role === 'MIEMBRO') return communityAccess;
  if (user.role === 'LIDER') {
    return configuredAccess.role === 'leader' ? configuredAccess : null;
  }
  if (user.role === 'PASTOR') {
    if (configuredAccess.role === 'admin') return configuredAccess;
    return {
      role: 'pastor',
      ministries: [...ministries],
      churchCodes: getChurches().map(church => church.code)
    };
  }
  return communityAccess;
}

function getOAuthAccess(user) {
  const email = user.email.toLowerCase();
  const churchCodes = getChurches().map(church => church.code);

  if (email === superDeveloperEmail && user.role === 'SUPER_DEVELOPER') {
    return { role: 'superDeveloper', ministries: [...ministries], churchCodes };
  }
  if (user.role === 'SUPER_DEVELOPER') return null;
  if (user.role === 'DEVELOPER') {
    return { role: 'developer', ministries: [], churchCodes: [] };
  }
  if (user.role === 'PASTOR') {
    return { role: 'pastor', ministries: [...ministries], churchCodes };
  }
  if (user.role === 'LIDER') {
    const configuredAccess = getAccess(email);
    return configuredAccess.role === 'leader'
      ? configuredAccess
      : { role: 'leader', ministries: [], churchCodes: [] };
  }
  return getAccess(email);
}

function canAccessAudience(access, audience) {
  if (!access) return false;
  if (audience === 'admin') return ['superDeveloper', 'developer', 'admin'].includes(access.role);
  if (audience === 'leadership') return !['community', 'developer'].includes(access.role);
  return true;
}

function getOAuthRedirectPath(user, access) {
  if (access?.role === 'superDeveloper') return '/admin/developer.html';
  if (access?.role === 'developer') return '/admin/developer-panel.html';
  if (['PASTOR', 'LIDER'].includes(user.role) || ['pastor', 'leader'].includes(access?.role)) {
    return '/admin/church-dashboard.html';
  }
  if (access?.role === 'admin') return '/#adminDashboard';
  return '/dashboard.html';
}

function getWelcomeEmailFailureRedirect(destination) {
  const redirect = new URL(destination, baseUrl);
  redirect.searchParams.set('welcomeEmail', 'failed');
  return `${redirect.pathname}${redirect.search}${redirect.hash}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

async function sendWelcomeEmail(user) {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE.toLowerCase() === 'true'
    : port === 465;

  if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('Welcome email not sent: configure valid SMTP_HOST, SMTP_PORT, and SMTP_FROM.');
    return false;
  }
  if (process.env.SMTP_SECURE && !['true', 'false'].includes(process.env.SMTP_SECURE.toLowerCase())) {
    console.error('Welcome email not sent: SMTP_SECURE must be true or false.');
    return false;
  }
  if (Boolean(process.env.SMTP_USER) !== Boolean(process.env.SMTP_PASS)) {
    console.error('Welcome email not sent: configure both SMTP_USER and SMTP_PASS, or neither.');
    return false;
  }

  const safeName = escapeHtml(user.name);
  const text = `¡Bienvenido/a al Centro Cristiano ICAEP, ${user.name}!\n\nNos alegra que formes parte de nuestra comunidad. Ya puedes iniciar sesión para conocer las actividades, devocionales y recursos disponibles.\n\nCentro Cristiano ICAEP`;
  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      ...(process.env.SMTP_USER ? {
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      } : {})
    });
    await transporter.sendMail({
      from,
      to: user.email,
      subject: 'Bienvenido/a al Centro Cristiano ICAEP',
      text,
      html: `<!doctype html><html lang="es"><body style="margin:0;background:#f3f5f8;font-family:Arial,sans-serif;color:#243247"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden"><tr><td style="background:#12345a;padding:28px 32px;color:#fff"><p style="margin:0;font-size:12px;letter-spacing:1px">CENTRO CRISTIANO ICAEP</p><h1 style="margin:12px 0 0;font-size:24px">¡Te damos la bienvenida!</h1></td></tr><tr><td style="padding:32px"><p style="font-size:16px;line-height:1.6">Hola, <strong>${safeName}</strong>:</p><p style="font-size:15px;line-height:1.7">Nos alegra que formes parte de nuestra comunidad. Ya puedes iniciar sesión para conocer las actividades, devocionales y recursos disponibles.</p><p style="font-size:15px;line-height:1.7">Que este espacio sea de encuentro, crecimiento y bendición para ti.</p><p style="margin:28px 0 0;font-size:14px;color:#53657c">Con aprecio,<br><strong>Centro Cristiano ICAEP</strong></p></td></tr></table><p style="font-size:12px;color:#718096;margin:16px 0 0">Este mensaje se envió porque se creó una cuenta en nuestra plataforma.</p></td></tr></table></body></html>`
    });
    return true;
  } catch (error) {
    console.error('Welcome email delivery failed:', error.code || error.name || 'unknown error');
    return false;
  }
}

function readCookie(req, name) {
  const cookieHeader = req.headers.cookie || '';
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return null;
}

function sessionCookieOptions(maxAge, secure = secureCookies) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge
  };
}

function signState(payload) {
  if (!isConfiguredSessionSecret(process.env.SESSION_SECRET)) {
    throw new Error('SESSION_SECRET debe tener al menos 32 caracteres y no ser un valor de ejemplo.');
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyState(value) {
  if (!value || !isConfiguredSessionSecret(process.env.SESSION_SECRET)) return null;
  const [encoded, signature] = value.split('.');
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(encoded).digest();
  let actual;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return payload.expiresAt > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function providerConfig(provider, env = process.env, applicationBaseUrl = baseUrl) {
  const callbackUrl = new URL(`/api/auth/${provider}/callback`, applicationBaseUrl).toString();
  if (provider === 'google') {
    const clientId = env.GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET;
    return isConfiguredOAuthCredential(clientId) && isConfiguredOAuthCredential(clientSecret) ? {
      clientId,
      clientSecret,
      callbackUrl,
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: 'openid email profile'
    } : null;
  }
  if (provider === 'microsoft') {
    const clientId = env.MICROSOFT_CLIENT_ID;
    const clientSecret = env.MICROSOFT_CLIENT_SECRET;
    const tenantId = env.MICROSOFT_TENANT_ID || 'common';
    const authority = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0`;
    return clientId && clientSecret ? {
      clientId,
      clientSecret,
      callbackUrl,
      authorizationUrl: `${authority}/authorize`,
      tokenUrl: `${authority}/token`,
      scopes: 'openid profile email User.Read'
    } : null;
  }
  return null;
}

function isConfiguredOAuthCredential(value) {
  return typeof value === 'string'
    && value.length > 0
    && !/^(?:PEGA_AQUI|YOUR_|CHANGE_ME|PLACEHOLDER)/i.test(value);
}

function isConfiguredSessionSecret(value) {
  return typeof value === 'string'
    && value.length >= 32
    && !/(?:replace-with|change-me|placeholder|your-secret)/i.test(value);
}

function configureGooglePassport() {
  const config = providerConfig('google');
  if (!config) return false;

  passport.use('google', new GoogleStrategy({
    clientID: config.clientId,
    clientSecret: config.clientSecret,
    callbackURL: config.callbackUrl,
    passReqToCallback: true
  }, async (req, accessToken, refreshToken, profile, done) => {
    try {
      const email = normalizeEmail(profile.emails?.find(item => item.value)?.value);
      if (profile._json?.email_verified !== true) {
        return done(null, false, { message: 'Google no confirmó que el correo esté verificado.' });
      }
      const state = verifyState(readCookie(req, oauthCookieName));
      if (!state || state.provider !== 'google') {
        return done(null, false, { message: 'La solicitud de acceso expiró o no es válida.' });
      }
      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, email: true, role: true, status: true, isActive: true }
      });
      if (existingUser && (!existingUser.isActive || existingUser.status !== 'ACTIVE')) {
        return done(null, false, { message: 'La cuenta está inactiva. Contacta al administrador.' });
      }
      const account = email === superDeveloperEmail ? {
        email,
        role: 'SUPER_DEVELOPER'
      } : existingUser || {
        email,
        role: 'MIEMBRO'
      };
      const access = getOAuthAccess(account);
      if (!canAccessAudience(access, state.audience)) {
        return done(null, false, { message: 'El correo autenticado no está autorizado para este acceso.' });
      }

      const user = await prisma.user.upsert({
        where: { email },
        create: {
          name: profile.displayName || email.split('@')[0],
          email,
          passwordHash: 'OAUTH_ONLY',
          role: email === superDeveloperEmail ? 'SUPER_DEVELOPER' : 'MIEMBRO',
          lastLoginAt: new Date()
        },
        update: {
          ...(profile.displayName ? { name: profile.displayName } : {}),
          ...(email === superDeveloperEmail ? { role: 'SUPER_DEVELOPER' } : {}),
          lastLoginAt: new Date()
        },
        select: { id: true, name: true, email: true, role: true, status: true, isActive: true }
      });
      if (!existingUser) user.welcomeEmailSent = await sendWelcomeEmail(user);
      done(null, user);
    } catch (error) {
      done(error);
    }
  }));
  return true;
}

const googlePassportConfigured = configureGooglePassport();

function authRateLimit(req, res, next) {
  const now = Date.now();
  const key = `${req.ip}:${req.path}`;
  const window = oauthRateLimits.get(key);
  if (window && window.expiresAt > now && window.count >= 20) {
    return res.status(429).send('Demasiados intentos. Espera un momento antes de volver a intentarlo.');
  }
  if (!window || window.expiresAt <= now) {
    oauthRateLimits.set(key, { count: 1, expiresAt: now + 60_000 });
    const expiry = setTimeout(() => oauthRateLimits.delete(key), 60_000);
    expiry.unref();
  } else {
    window.count += 1;
  }
  next();
}

function requireSameOrigin(req, res, next) {
  const origin = req.get('origin');
  if (origin !== configuredBaseUrl.origin) {
    return res.status(403).json({ error: 'Origen no autorizado.' });
  }
  next();
}

async function authenticate(req, res, next) {
  const token = readCookie(req, sessionCookieName);
  if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar.' });

  try {
    const session = await prisma.session.findFirst({
      where: {
        tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { isActive: true, status: 'ACTIVE' }
      },
      include: { user: { select: { id: true, name: true, email: true, role: true } } }
    });
    if (!session) return res.status(401).json({ error: 'La sesión expiró. Vuelve a ingresar.' });

    const access = session.authMethod === 'PASSWORD'
      ? getPasswordAccess(session.user)
      : getOAuthAccess(session.user);
    if (!access) {
      await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      res.clearCookie(sessionCookieName, sessionCookieOptions(0));
      return res.status(403).json({ error: 'Este correo ya no tiene acceso autorizado.' });
    }
    req.actor = { ...session.user, ...access, sessionId: session.id };
    next();
  } catch (error) {
    next(error);
  }
}

function requirePastor(req, res, next) {
  if (!['pastor', 'admin', 'superDeveloper'].includes(req.actor.role)) {
    return res.status(403).json({ error: 'Esta acción requiere permisos pastorales.' });
  }
  next();
}

function requireDeveloper(req, res, next) {
  if (!['developer', 'superDeveloper'].includes(req.actor.role)) {
    return res.status(403).json({ error: 'Esta ruta está reservada a desarrolladores autorizados.' });
  }
  next();
}

function requireSuperDeveloper(req, res, next) {
  if (req.actor.role !== 'superDeveloper' || req.actor.email.toLowerCase() !== superDeveloperEmail) {
    return res.status(403).json({ error: 'Solo el SUPER_DEVELOPER puede gestionar desarrolladores.' });
  }
  next();
}

function requireChurchLeadership(req, res, next) {
  if (!['pastor', 'leader'].includes(req.actor.role)) {
    return res.status(403).json({ error: 'Esta ruta está reservada a pastores y líderes.' });
  }
  next();
}

function requireMember(req, res, next) {
  if (req.actor.role !== 'community') {
    return res.status(403).json({ error: 'Esta función está disponible para cuentas de la comunidad.' });
  }
  next();
}

function sendProtectedInterface(req, res, next) {
  res.set('Cache-Control', 'private, no-store');
  res.sendFile(path.join(frontendPath, 'index.html'), error => {
    if (error) next(error);
  });
}

function canAccessMinistry(actor, code, churchCode = defaultChurchCode) {
  return actor.ministries.includes(code) && actor.churchCodes.includes(churchCode);
}

function validateMetrics(body) {
  const values = {};
  for (const field of metricFields) {
    const value = Number(body[field] ?? 0);
    if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
      throw Object.assign(new Error(`El valor de ${field} debe ser un entero no negativo.`), { status: 400 });
    }
    values[field] = value;
  }
  return values;
}

function validateTestimonialRating(value) {
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw Object.assign(new Error('Selecciona una calificación de 1 a 5 estrellas.'), { status: 400 });
  }
  return rating;
}

function validateReport(body, actor) {
  const ministryCode = String(body.ministryCode || '').toLowerCase();
  const churchCode = String(body.churchCode || defaultChurchCode).toLowerCase();
  if (!ministries.has(ministryCode) || !canAccessMinistry(actor, ministryCode, churchCode)) {
    throw Object.assign(new Error('No tienes permiso para gestionar este ministerio.'), { status: 403 });
  }
  const title = String(body.title || '').trim();
  if (!title || title.length > 180) {
    throw Object.assign(new Error('El título es obligatorio y no puede superar 180 caracteres.'), { status: 400 });
  }
  const status = ['PENDING', 'APPROVED', 'REJECTED'].includes(body.status) ? body.status : 'PENDING';
  const publishToWeb = body.publishToWeb === true;
  if (publishToWeb && status !== 'APPROVED') {
    throw Object.assign(new Error('Solo se puede publicar un registro aprobado.'), { status: 400 });
  }
  const budget = body.budget === '' || body.budget == null ? null : Number(body.budget);
  if (budget !== null && (!Number.isFinite(budget) || budget < 0 || budget > 999999999999)) {
    throw Object.assign(new Error('El presupuesto debe ser un valor válido no negativo.'), { status: 400 });
  }
  const meetingAt = body.meetingAt ? new Date(body.meetingAt) : null;
  if (meetingAt && Number.isNaN(meetingAt.getTime())) {
    throw Object.assign(new Error('La fecha y hora no son válidas.'), { status: 400 });
  }
  const details = body.details && typeof body.details === 'object' && !Array.isArray(body.details)
    ? body.details
    : {};

  return {
    ministryCode,
    churchCode,
    title,
    reportType: ['MEETING', 'MINUTES', 'PROPOSAL', 'PROJECT', 'REHEARSAL', 'OUTREACH'].includes(body.reportType)
      ? body.reportType
      : 'MEETING',
    meetingAt,
    location: String(body.location || '').trim().slice(0, 180) || null,
    status,
    minutes: String(body.minutes || '').trim().slice(0, 10_000) || null,
    publicDescription: String(body.publicDescription || '').trim().slice(0, 1_000) || null,
    proposals: String(body.proposals || '').trim().slice(0, 10_000) || null,
    pastorDirectives: String(body.pastorDirectives || '').trim().slice(0, 5_000) || null,
    budget,
    publishToWeb,
    details
  };
}

async function loadCensusByChurch() {
  const groups = await prisma.person.groupBy({
    by: ['churchCode', 'status'],
    where: { deletedAt: null },
    _count: { _all: true }
  });
  const churches = new Map(getChurches().map(church => [church.code, {
    code: church.code,
    name: church.name,
    total: 0,
    active: 0,
    visitors: 0
  }]));
  for (const group of groups) {
    const current = churches.get(group.churchCode) || {
      code: group.churchCode,
      name: getChurchName(group.churchCode),
      total: 0,
      active: 0,
      visitors: 0
    };
    current.total += group._count._all;
    if (['CATECHUMEN', 'MEMBER'].includes(group.status)) current.active += group._count._all;
    if (group.status === 'VISITOR') current.visitors += group._count._all;
    churches.set(group.churchCode, current);
  }
  return [...churches.values()].sort((left, right) => left.name.localeCompare(right.name));
}

async function fetchProviderIdentity(provider, config, code, codeVerifier) {
  const tokenResponse = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      code_verifier: codeVerifier,
      redirect_uri: config.callbackUrl,
      grant_type: 'authorization_code'
    })
  });
  if (!tokenResponse.ok) throw new Error('El proveedor rechazó la autenticación.');
  const tokens = await tokenResponse.json();
  if (!tokens.access_token) throw new Error('El proveedor no devolvió un token de acceso.');

  const identityUrl = provider === 'google'
    ? 'https://openidconnect.googleapis.com/v1/userinfo'
    : 'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName,id';
  const identityResponse = await fetch(identityUrl, {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });
  if (!identityResponse.ok) throw new Error('No se pudo verificar el correo con el proveedor.');
  const identity = await identityResponse.json();
  const email = String(provider === 'google' ? identity.email : identity.mail || identity.userPrincipalName || '')
    .trim()
    .toLowerCase();
  if (!email || (provider === 'google' && identity.email_verified !== true)) {
    throw new Error('El proveedor no confirmó un correo verificado.');
  }
  return { email, name: String(identity.name || identity.displayName || '') };
}

app.get('/api/auth/providers', (req, res) => {
  res.json({
    google: Boolean(providerConfig('google')),
    microsoft: Boolean(providerConfig('microsoft'))
  });
});

app.post('/api/auth/register', requireSameOrigin, authRateLimit, async (req, res, next) => {
  let registration;
  try {
    registration = validateRegistration(req.body);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
  if (registration.email === superDeveloperEmail) {
    return res.status(403).json({ error: 'Esta cuenta debe autenticarse con Google y un correo verificado.' });
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  try {
    const passwordHash = await hashPassword(registration.password);
    const user = await prisma.$transaction(async transaction => {
      const createdUser = await transaction.user.create({
        data: {
          name: registration.name,
          email: registration.email,
          passwordHash,
          role: 'MIEMBRO',
          status: 'ACTIVE',
          isActive: true,
          lastLoginAt: now
        },
        select: { id: true, name: true, email: true, role: true }
      });
      await transaction.session.create({
        data: {
          userId: createdUser.id,
          authMethod: 'PASSWORD',
          tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
          ip: req.ip,
          userAgent: req.get('user-agent')?.slice(0, 500) || null,
          expiresAt: new Date(Date.now() + sessionLifetimeMs)
        }
      });
      return createdUser;
    });
    const welcomeEmailSent = await sendWelcomeEmail(user);

    res.cookie(sessionCookieName, token, sessionCookieOptions(sessionLifetimeMs));
    res.status(201).json({
      name: user.name,
      email: user.email,
      role: 'community',
      ministries: [],
      churchCodes: [],
      churches: [],
      welcomeEmailSent
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo electrónico.' });
    }
    next(error);
  }
});

app.post('/api/auth/login', requireSameOrigin, authRateLimit, async (req, res, next) => {
  let credentials;
  try {
    credentials = validateLogin(req.body);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: credentials.email },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        role: true,
        status: true,
        isActive: true
      }
    });
    const passwordMatches = await verifyPassword(credentials.password, user?.passwordHash);
    if (!user || !passwordMatches) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }
    if (!user.isActive || user.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'La cuenta está inactiva. Contacta al administrador.' });
    }

    const access = getPasswordAccess(user);
    if (!access) {
      return res.status(403).json({ error: 'La cuenta no tiene un rol de acceso habilitado.' });
    }

    const token = crypto.randomBytes(32).toString('base64url');
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null }
      }),
      prisma.session.create({
        data: {
          userId: user.id,
          authMethod: 'PASSWORD',
          tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
          ip: req.ip,
          userAgent: req.get('user-agent')?.slice(0, 500) || null,
          expiresAt: new Date(Date.now() + sessionLifetimeMs)
        }
      })
    ]);
    res.cookie(sessionCookieName, token, sessionCookieOptions(sessionLifetimeMs));
    res.json({
      name: user.name,
      email: user.email,
      ...access,
      churches: getChurches().filter(church => access.churchCodes.includes(church.code))
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/google', authRateLimit, (req, res, next) => {
  if (!googlePassportConfigured) {
    return res.status(503).send('Este proveedor de acceso aún no está configurado.');
  }
  if (!isConfiguredSessionSecret(process.env.SESSION_SECRET)) {
    return res.status(503).send('Configura SESSION_SECRET con al menos 32 caracteres aleatorios.');
  }
  const audience = ['admin', 'community', 'leadership'].includes(req.query.audience)
    ? req.query.audience
    : 'community';
  const state = crypto.randomBytes(32).toString('base64url');
  res.cookie(oauthCookieName, signState({
    provider: 'google',
    audience,
    state,
    expiresAt: Date.now() + 10 * 60_000
  }), {
    ...sessionCookieOptions(10 * 60_000),
    path: '/api/auth'
  });
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
    state
  })(req, res, next);
});

app.get('/api/auth/google/callback', authRateLimit, (req, res, next) => {
  const state = verifyState(readCookie(req, oauthCookieName));
  res.clearCookie(oauthCookieName, { ...sessionCookieOptions(0), path: '/api/auth' });
  if (!googlePassportConfigured || !state || state.provider !== 'google' || state.state !== req.query.state) {
    return res.status(400).send('La solicitud de acceso expiró o no es válida. Intenta de nuevo.');
  }
  if (req.query.error || typeof req.query.code !== 'string') {
    return res.status(401).send('No fue posible completar el acceso con Google.');
  }

  passport.authenticate('google', { session: false }, async (error, user, info) => {
    if (error) return next(error);
    if (!user) {
      return res.status(403).send(info?.message || 'No fue posible autenticar la cuenta de Google.');
    }
    if (!user.isActive || user.status !== 'ACTIVE') {
      return res.status(403).send('La cuenta está inactiva. Contacta al administrador.');
    }

    try {
      const token = crypto.randomBytes(32).toString('base64url');
      await prisma.session.create({
        data: {
          userId: user.id,
          authMethod: 'OAUTH',
          tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
          ip: req.ip,
          userAgent: req.get('user-agent')?.slice(0, 500) || null,
          expiresAt: new Date(Date.now() + sessionLifetimeMs)
        }
      });
      res.cookie(sessionCookieName, token, sessionCookieOptions(sessionLifetimeMs));
      const access = getOAuthAccess(user);
      const destination = getOAuthRedirectPath(user, access);
      res.redirect(user.welcomeEmailSent === false ? getWelcomeEmailFailureRedirect(destination) : destination);
    } catch (sessionError) {
      next(sessionError);
    }
  })(req, res, next);
});

app.get('/api/auth/:provider', authRateLimit, (req, res) => {
  const provider = req.params.provider;
  const config = providerConfig(provider);
  if (!config) return res.status(503).send('Este proveedor de acceso aún no está configurado.');
  if (!isConfiguredSessionSecret(process.env.SESSION_SECRET)) {
    return res.status(503).send('Configura SESSION_SECRET con al menos 32 caracteres aleatorios.');
  }
  const audience = ['admin', 'community', 'leadership'].includes(req.query.audience)
    ? req.query.audience
    : 'leadership';
  const state = crypto.randomBytes(32).toString('base64url');
  const codeVerifier = crypto.randomBytes(48).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const signedState = signState({
    provider,
    audience,
    state,
    codeVerifier,
    expiresAt: Date.now() + 10 * 60_000
  });
  res.cookie(oauthCookieName, signedState, {
    ...sessionCookieOptions(10 * 60_000),
    path: '/api/auth'
  });
  const authorizationUrl = new URL(config.authorizationUrl);
  authorizationUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    response_type: 'code',
    scope: config.scopes,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  }).toString();
  res.redirect(302, authorizationUrl.toString());
});

app.get('/api/auth/:provider/callback', authRateLimit, async (req, res, next) => {
  const provider = req.params.provider;
  const config = providerConfig(provider);
  const signedState = verifyState(readCookie(req, oauthCookieName));
  res.clearCookie(oauthCookieName, { ...sessionCookieOptions(0), path: '/api/auth' });
  if (!config || !signedState || signedState.provider !== provider || signedState.state !== req.query.state) {
    return res.status(400).send('La solicitud de acceso expiró o no es válida. Intenta de nuevo.');
  }
  if (req.query.error || typeof req.query.code !== 'string') {
    return res.status(401).send('No fue posible completar el acceso con el proveedor elegido.');
  }

  try {
    const identity = await fetchProviderIdentity(provider, config, req.query.code, signedState.codeVerifier);
    const existingUser = await prisma.user.findUnique({
      where: { email: identity.email },
      select: { id: true, name: true, email: true, role: true, status: true, isActive: true }
    });
    if (existingUser && (!existingUser.isActive || existingUser.status !== 'ACTIVE')) {
      return res.status(403).send('La cuenta está inactiva. Contacta al administrador.');
    }
    const access = getOAuthAccess(existingUser || { email: identity.email, role: 'MIEMBRO' });
    if (!canAccessAudience(access, signedState.audience)) {
      return res.status(403).send('El correo autenticado no está autorizado para este acceso.');
    }
    const user = await prisma.user.upsert({
      where: { email: identity.email },
      create: {
        name: identity.name || identity.email.split('@')[0],
        email: identity.email,
        passwordHash: 'OAUTH_ONLY',
        role: 'MIEMBRO',
        lastLoginAt: new Date()
      },
      update: {
        ...(identity.name ? { name: identity.name } : {}),
        lastLoginAt: new Date()
      },
      select: { id: true, name: true, email: true, role: true, status: true, isActive: true }
    });
    const welcomeEmailSent = existingUser ? null : await sendWelcomeEmail(user);
    if (!user.isActive || user.status !== 'ACTIVE') {
      return res.status(403).send('La cuenta está inactiva. Contacta al administrador.');
    }
    const token = crypto.randomBytes(32).toString('base64url');
    await prisma.session.create({
      data: {
        userId: user.id,
        authMethod: 'OAUTH',
        tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
        ip: req.ip,
        userAgent: req.get('user-agent')?.slice(0, 500) || null,
        expiresAt: new Date(Date.now() + sessionLifetimeMs)
      }
    });
    res.cookie(sessionCookieName, token, sessionCookieOptions(sessionLifetimeMs));
    const destination = getOAuthRedirectPath(user, access);
    res.redirect(welcomeEmailSent === false ? getWelcomeEmailFailureRedirect(destination) : destination);
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({
    name: req.actor.name,
    email: req.actor.email,
    role: req.actor.role,
    ministries: req.actor.ministries,
    churchCodes: req.actor.churchCodes,
    churches: getChurches().filter(church => req.actor.churchCodes.includes(church.code))
  });
});

app.post('/api/auth/logout', requireSameOrigin, authenticate, async (req, res, next) => {
  try {
    await prisma.session.update({ where: { id: req.actor.sessionId }, data: { revokedAt: new Date() } });
    res.clearCookie(sessionCookieName, sessionCookieOptions(0));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/developer/developers', authenticate, requireDeveloper, async (req, res, next) => {
  try {
    const developers = await prisma.user.findMany({
      where: { role: 'DEVELOPER' },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { email: 'asc' }
    });
    res.json({
      developers,
      canManage: req.actor.role === 'superDeveloper' && req.actor.email.toLowerCase() === superDeveloperEmail
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/developer/developers', requireSameOrigin, authenticate, requireSuperDeveloper, async (req, res, next) => {
  let email;
  try {
    email = normalizeEmail(req.body?.email);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
  if (email === superDeveloperEmail) {
    return res.status(400).json({ error: 'La cuenta SUPER_DEVELOPER no puede agregarse como desarrollador delegado.' });
  }

  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (name.length > 100) {
    return res.status(400).json({ error: 'El nombre no puede superar 100 caracteres.' });
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true }
    });
    if (existing?.role === 'SUPER_DEVELOPER') {
      return res.status(409).json({ error: 'No se puede modificar la cuenta SUPER_DEVELOPER.' });
    }
    if (existing && !['MIEMBRO', 'DEVELOPER'].includes(existing.role)) {
      return res.status(409).json({ error: 'Solo se pueden asignar desarrolladores a cuentas miembro o ya delegadas.' });
    }

    const developer = await prisma.user.upsert({
      where: { email },
      create: {
        name: name || email.split('@')[0],
        email,
        passwordHash: 'OAUTH_ONLY',
        role: 'DEVELOPER'
      },
      update: {
        role: 'DEVELOPER',
        ...(name ? { name } : {})
      },
      select: { id: true, name: true, email: true, role: true }
    });
    res.status(201).json(developer);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/developer/developers/:id', requireSameOrigin, authenticate, requireSuperDeveloper, async (req, res, next) => {
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(req.params.id)) {
    return res.status(400).json({ error: 'El identificador del desarrollador no es válido.' });
  }
  try {
    const developer = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, email: true, role: true }
    });
    if (!developer) return res.status(404).json({ error: 'No se encontró el desarrollador.' });
    if (developer.email.toLowerCase() === superDeveloperEmail || developer.role === 'SUPER_DEVELOPER') {
      return res.status(403).json({ error: 'La cuenta SUPER_DEVELOPER no puede eliminarse ni degradarse.' });
    }
    if (developer.role !== 'DEVELOPER') {
      return res.status(409).json({ error: 'La cuenta ya no tiene el rol DEVELOPER.' });
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: developer.id }, data: { role: 'MIEMBRO' } }),
      prisma.session.updateMany({
        where: { userId: developer.id, revokedAt: null },
        data: { revokedAt: new Date() }
      })
    ]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get(['/admin/developer.html', '/admin/developer-panel.html'], authenticate, requireDeveloper, sendProtectedInterface);
app.use('/admin/developer', authenticate, requireDeveloper, sendProtectedInterface);
app.get('/admin/church-dashboard.html', authenticate, requireChurchLeadership, sendProtectedInterface);
app.use('/admin/church', authenticate, requireChurchLeadership, sendProtectedInterface);
app.get('/dashboard.html', authenticate, requireMember, sendProtectedInterface);

app.get('/api/member/prayer-requests', authenticate, requireMember, async (req, res, next) => {
  try {
    const requests = await prisma.prayerRequest.findMany({
      where: { userId: req.actor.id },
      select: { id: true, content: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ requests });
  } catch (error) {
    next(error);
  }
});

app.get('/api/member/devotionals', authenticate, requireMember, (req, res) => {
  res.json({
    devotionals: [
      {
        title: 'Un momento para confiar',
        content: 'Haz una pausa, presenta tus preocupaciones en oración y recuerda que no tienes que recorrer el camino en soledad.'
      },
      {
        title: 'Crecer en comunidad',
        content: 'La fe también se fortalece al compartir, escuchar y acompañarnos con amor y esperanza.'
      }
    ]
  });
});

app.post('/api/member/prayer-requests', requireSameOrigin, authenticate, requireMember, authRateLimit, async (req, res, next) => {
  let request;
  try {
    request = validatePrayerRequest(req.body);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  try {
    const createdRequest = await prisma.prayerRequest.create({
      data: { userId: req.actor.id, content: request.content },
      select: { id: true, content: true, status: true, createdAt: true }
    });
    res.status(201).json({ request: createdRequest });
  } catch (error) {
    next(error);
  }
});

app.get('/api/public/events', async (req, res, next) => {
  try {
    const reports = await prisma.ministryReport.findMany({
      where: {
        status: 'APPROVED',
        publishToWeb: true,
        OR: [{ meetingAt: null }, { meetingAt: { gte: new Date() } }]
      },
      select: {
        id: true,
        ministryCode: true,
        churchCode: true,
        reportType: true,
        title: true,
        meetingAt: true,
        location: true,
        publicDescription: true
      },
      orderBy: { meetingAt: 'asc' },
      take: 30
    });
    res.json(reports.map(report => ({ ...report, churchName: getChurchName(report.churchCode) })));
  } catch (error) {
    next(error);
  }
});

app.get('/api/public/testimonials', async (req, res, next) => {
  try {
    const testimonials = await prisma.publicTestimonial.findMany({
      where: { moderationStatus: 'APPROVED' },
      select: { id: true, name: true, content: true, imageUrl: true, rating: true, createdAt: true },
      orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
      take: 6
    });
    res.json(testimonials);
  } catch (error) {
    next(error);
  }
});

app.post('/api/public/testimonials', requireSameOrigin, authRateLimit, async (req, res, next) => {
  const name = String(req.body?.name || '').trim();
  const content = String(req.body?.content || '').trim();
  const imageUrl = String(req.body?.imageUrl || '').trim();
  const rating = validateTestimonialRating(req.body?.rating);
  if (name.length < 2 || name.length > 100 || content.length < 10 || content.length > 4000) {
    return res.status(400).json({ error: 'Escribe tu nombre y un testimonio de entre 10 y 4.000 caracteres.' });
  }
  if (imageUrl) {
    let parsedImageUrl;
    try {
      parsedImageUrl = new URL(imageUrl);
    } catch {
      return res.status(400).json({ error: 'El enlace de imagen no es válido.' });
    }
    if (parsedImageUrl.protocol !== 'https:' || parsedImageUrl.username || parsedImageUrl.password || req.body?.imageConsent !== true) {
      return res.status(400).json({ error: 'Para compartir una imagen, usa un enlace HTTPS y autoriza explícitamente su publicación.' });
    }
  }
  try {
    await prisma.publicTestimonial.create({ data: { name, content, rating, imageUrl: imageUrl || null } });
    res.status(201).json({ message: 'Tu testimonio fue recibido y quedará pendiente de revisión antes de publicarse.' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/leadership/reports', authenticate, async (req, res, next) => {
  if (!['leader', 'pastor', 'admin', 'superDeveloper'].includes(req.actor.role)) {
    return res.status(403).json({ error: 'Esta información está reservada a líderes y pastores autorizados.' });
  }
  try {
    const where = req.actor.role === 'leader'
      ? { ministryCode: { in: req.actor.ministries }, churchCode: { in: req.actor.churchCodes } }
      : {};
    const reports = await prisma.ministryReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200
    });
    res.json(reports);
  } catch (error) {
    next(error);
  }
});

app.post('/api/leadership/reports', requireSameOrigin, authenticate, async (req, res, next) => {
  try {
    const report = validateReport(req.body, req.actor);
    const created = await prisma.ministryReport.create({
      data: { ...report, createdById: req.actor.id }
    });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/leadership/reports/:id', requireSameOrigin, authenticate, async (req, res, next) => {
  try {
    const existing = await prisma.ministryReport.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'No se encontró el registro.' });
    if (!canAccessMinistry(req.actor, existing.ministryCode, existing.churchCode)) {
      return res.status(403).json({ error: 'No tienes permiso para gestionar este registro.' });
    }
    const nextStatus = req.body.status === undefined ? existing.status : req.body.status;
    const publishToWeb = req.body.publishToWeb === undefined ? existing.publishToWeb : req.body.publishToWeb === true;
    if (!['PENDING', 'APPROVED', 'REJECTED'].includes(nextStatus)) {
      return res.status(400).json({ error: 'Estado de publicación no válido.' });
    }
    if (publishToWeb && nextStatus !== 'APPROVED') {
      return res.status(400).json({ error: 'Solo se puede publicar un registro aprobado.' });
    }
    const updated = await prisma.ministryReport.update({
      where: { id: existing.id },
      data: { status: nextStatus, publishToWeb }
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

app.get('/api/leadership/metrics/:ministryCode', authenticate, async (req, res, next) => {
  const ministryCode = req.params.ministryCode;
  const churchCode = String(req.query.churchCode || defaultChurchCode);
  if (!ministries.has(ministryCode) || !canAccessMinistry(req.actor, ministryCode, churchCode)) {
    return res.status(403).json({ error: 'No tienes permiso para consultar este ministerio.' });
  }
  try {
    const metrics = await prisma.departmentMetrics.findUnique({
      where: { ministryCode_churchCode: { ministryCode, churchCode } }
    });
    res.json(metrics || {
      ministryCode,
      churchCode,
      ...Object.fromEntries(metricFields.map(field => [field, 0]))
    });
  } catch (error) {
    next(error);
  }
});

app.put('/api/leadership/metrics/:ministryCode', requireSameOrigin, authenticate, async (req, res, next) => {
  const ministryCode = req.params.ministryCode;
  const churchCode = String(req.body.churchCode || defaultChurchCode);
  if (!ministries.has(ministryCode) || !canAccessMinistry(req.actor, ministryCode, churchCode)) {
    return res.status(403).json({ error: 'No tienes permiso para gestionar este ministerio.' });
  }
  try {
    const values = validateMetrics(req.body);
    const metrics = await prisma.departmentMetrics.upsert({
      where: { ministryCode_churchCode: { ministryCode, churchCode } },
      create: { ministryCode, churchCode, ...values },
      update: values
    });
    res.json(metrics);
  } catch (error) {
    next(error);
  }
});

app.get('/api/leadership/overview', authenticate, requirePastor, async (req, res, next) => {
  try {
    const [metrics, reportsByMinistry, reportCounts, membershipByChurch] = await Promise.all([
      prisma.departmentMetrics.findMany({ orderBy: { ministryCode: 'asc' } }),
      prisma.ministryReport.groupBy({
        by: ['ministryCode', 'churchCode'],
        _count: { _all: true },
        where: { status: 'PENDING' }
      }),
      prisma.ministryReport.count(),
      loadCensusByChurch()
    ]);
    const totals = metricFields.reduce((result, field) => {
      result[field] = metrics.reduce((sum, row) => sum + row[field], 0);
      return result;
    }, {});
    const byChurch = new Map();
    for (const row of metrics) {
      const current = byChurch.get(row.churchCode) || {
        churchCode: row.churchCode,
        churchName: getChurchName(row.churchCode),
        metrics: Object.fromEntries(metricFields.map(field => [field, 0]))
      };
      for (const field of metricFields) current.metrics[field] += row[field];
      byChurch.set(row.churchCode, current);
    }
    res.json({
      totals,
      byChurch: [...byChurch.values()],
      membershipByChurch,
      reportsByMinistry: reportsByMinistry.map(item => ({
        ...item,
        churchName: getChurchName(item.churchCode)
      })),
      reportCounts
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/leadership/testimonials', authenticate, requirePastor, async (req, res, next) => {
  try {
    const testimonials = await prisma.publicTestimonial.findMany({
      where: { moderationStatus: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 100
    });
    res.json(testimonials);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/leadership/testimonials/:id', requireSameOrigin, authenticate, requirePastor, async (req, res, next) => {
  const moderationStatus = req.body.moderationStatus;
  if (!['APPROVED', 'REJECTED'].includes(moderationStatus)) {
    return res.status(400).json({ error: 'La decisión de moderación no es válida.' });
  }
  try {
    const testimonial = await prisma.publicTestimonial.update({
      where: { id: req.params.id },
      data: { moderationStatus, reviewedAt: new Date(), reviewedById: req.actor.id }
    });
    res.json({ id: testimonial.id, moderationStatus: testimonial.moderationStatus });
  } catch (error) {
    next(error);
  }
});

app.use(express.static(frontendPath, { extensions: ['html'] }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error('Request failed:', error.name, error.code || error.status || 'unhandled');
  const status = Number.isInteger(error.status) ? error.status : 500;
  res.status(status).json({
    error: status === 500 ? 'Ocurrió un error interno. Intenta de nuevo más tarde.' : error.message
  });
});

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL es obligatorio para iniciar el servidor.');
  }
  app.listen(port, () => {
    console.log(`CCICAEPCC disponible en ${baseUrl}`);
  });
}

module.exports = Object.assign(app, {
  app,
  canAccessAudience,
  getAccess,
  getOAuthRedirectPath,
  getOAuthAccess,
  getPasswordAccess,
  hashPassword,
  isConfiguredOAuthCredential,
  normalizeEmail,
  parseLeaderAccess,
  requireChurchLeadership,
  requireDeveloper,
  requireMember,
  requireSuperDeveloper,
  validateLogin,
  validateMetrics,
  validatePrayerRequest,
  validateRegistration,
  validateReport,
  validateTestimonialRating,
  verifyPassword,
  providerConfig,
  resolveBaseUrl,
  isConfiguredSessionSecret,
  sessionCookieOptions
});
