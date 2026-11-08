const ministryLabels = {
  damas: 'Damas',
  caballeros: 'Caballeros',
  jovenes: 'Jóvenes',
  adolescentes: 'Adolescentes',
  ninos: 'Niños',
  banda: 'Banda Musical y Canto',
  evangelismo: 'Evangelismo y Diáconos',
  vendimias: 'Vendimias',
  pastores: 'Pastores',
  dynamos: 'Dynamos'
};

const metricLabels = {
  totalMembers: 'Integrantes',
  activeMembers: 'Activos',
  inactiveMembers: 'Inactivos',
  baptizedMembers: 'Bautizados',
  nonBaptizedMembers: 'No bautizados',
  newMembers: 'Nuevos integrantes',
  departedMembers: 'Retirados',
  peopleToConsolidate: 'Por consolidar',
  scheduledVisits: 'Visitas programadas',
  completedUnplannedVisits: 'Visitas realizadas',
  teamMembers: 'Equipo de trabajo',
  pastoralGoal: 'Meta pastoral'
};

let authenticatedActor = null;
let currentMinistryCode = null;
let currentChurchCode = null;
let ministryReports = [];
const memberEventAttendance = new Set();

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : { error: await response.text() };
  if (!response.ok) {
    const error = new Error(payload.error || 'No se pudo completar la solicitud.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

function showMessage(elementId, message, isError = false) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = message;
  element.style.color = isError ? '#b91c1c' : '#166534';
}

function formatDate(value) {
  if (!value) return 'Fecha por confirmar';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha por confirmar';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function renderEmpty(container, message, className = 'events-empty') {
  const empty = document.createElement('p');
  empty.className = className;
  empty.textContent = message;
  container.replaceChildren(empty);
}

function createRatingStars(rating) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  const stars = document.createElement('span');
  stars.className = 'testimonial-rating';
  stars.textContent = `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`;
  stars.setAttribute('role', 'img');
  stars.setAttribute('aria-label', `${rating} de 5 estrellas`);
  return stars;
}

function renderEvents(events) {
  const container = document.getElementById('publicEvents');
  if (!events.length) {
    renderEmpty(container, 'Aún no hay eventos publicados por los ministerios.');
    return;
  }
  const cards = events.map(event => {
    const card = document.createElement('article');
    card.className = 'event-card';
    const title = document.createElement('h3');
    title.textContent = event.title;
    const date = document.createElement('p');
    date.textContent = formatDate(event.meetingAt);
    const ministry = document.createElement('p');
    ministry.textContent = ministryLabels[event.ministryCode] || 'Actividad de la iglesia';
    card.append(title, date, ministry);
    if (event.churchName) {
      const church = document.createElement('p');
      church.textContent = `Iglesia: ${event.churchName}`;
      card.append(church);
    }
    if (event.location) {
      const location = document.createElement('p');
      location.textContent = `Lugar: ${event.location}`;
      card.append(location);
    }
    if (event.publicDescription) {
      const description = document.createElement('p');
      description.textContent = event.publicDescription;
      card.append(description);
    }
    return card;
  });
  container.replaceChildren(...cards);
}

function renderTestimonials(testimonials) {
  const track = document.getElementById('publicTestimonials');
  if (!testimonials.length) {
    renderEmpty(track, 'Todavía no hay testimonios aprobados para compartir.', 'testimonial-empty');
    return;
  }
  const cards = testimonials.map(testimonial => {
    const card = document.createElement('article');
    card.className = 'card testimonial-card';
    if (testimonial.imageUrl) {
      const image = document.createElement('img');
      image.className = 'testimonial-image';
      image.src = testimonial.imageUrl;
      image.alt = `Imagen compartida por ${testimonial.name}`;
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => image.remove(), { once: true });
      card.append(image);
    }
    const name = document.createElement('h3');
    name.textContent = testimonial.name;
    const text = document.createElement('p');
    text.className = 'testimonial-text';
    text.textContent = testimonial.content;
    const rating = createRatingStars(testimonial.rating);
    card.append(name);
    if (rating) card.append(rating);
    card.append(text);
    return card;
  });
  const copies = cards.length ? cards.map(card => {
    const copy = card.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    return copy;
  }) : [];
  track.replaceChildren(...cards, ...copies);
}

async function loadPublicContent() {
  const results = await Promise.allSettled([
    apiRequest('/api/public/events'),
    apiRequest('/api/public/testimonials')
  ]);
  if (results[0].status === 'fulfilled') {
    renderEvents(results[0].value);
  } else {
    renderEmpty(document.getElementById('publicEvents'), 'No fue posible cargar los eventos. Intenta de nuevo más tarde.');
  }
  if (results[1].status === 'fulfilled') {
    renderTestimonials(results[1].value);
  } else {
    renderEmpty(document.getElementById('publicTestimonials'), 'No fue posible cargar los testimonios.', 'testimonial-empty');
  }
}

async function loadAuthProviders() {
  const buttons = [...document.querySelectorAll('[data-auth-provider]')];
  try {
    const providers = await apiRequest('/api/auth/providers');
    for (const button of buttons) {
      button.disabled = providers[button.dataset.authProvider] !== true;
    }
    const availableProviders = ['google', 'microsoft'].filter(provider => providers[provider] === true);
    const availableLabel = availableProviders
      .map(provider => provider === 'google' ? 'Google' : 'Microsoft')
      .join(' y ');
    const communityStatus = document.getElementById('communityProviderStatus');
    const leadershipStatus = document.getElementById('leadershipProviderStatus');
    communityStatus.textContent = availableProviders.length
      ? `Acceso disponible con ${availableLabel}.`
      : 'El acceso con Google/Microsoft aún no está configurado. Puedes registrarte o ingresar con correo y contraseña.';
    leadershipStatus.textContent = availableProviders.length
      ? `Acceso disponible con ${availableLabel}. Usa el correo que el administrador autorizó para tu rol de pastor o líder.`
      : 'El acceso con Google/Microsoft aún no está configurado. El ingreso por contraseña sigue disponible.';
  } catch (error) {
    for (const button of buttons) button.disabled = true;
    showMessage('communityProviderStatus', `No se pudo verificar el acceso con Google/Microsoft: ${error.message}`, true);
    showMessage('leadershipProviderStatus', `No se pudo verificar el acceso con Google/Microsoft: ${error.message}`, true);
  }
}

async function submitTestimonial(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  const imageUrl = String(values.get('imageUrl') || '').trim();
  const imageConsent = values.get('imageConsent') === 'true';
  if (imageUrl && !imageConsent) {
    showMessage('testimonialFormStatus', 'Autoriza explícitamente el uso de la imagen o elimina el enlace.', true);
    return;
  }
  try {
    const result = await apiRequest('/api/public/testimonials', {
      method: 'POST',
      body: JSON.stringify({
        name: values.get('name'),
        content: values.get('content'),
        rating: Number(values.get('rating')),
        imageUrl,
        imageConsent
      })
    });
    form.reset();
    showMessage('testimonialFormStatus', result.message);
  } catch (error) {
    showMessage('testimonialFormStatus', error.message, true);
  }
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = '';
}

async function startAuth(provider, audience = 'leadership') {
  if (provider === 'google') {
    window.location.assign(`/api/auth/google?audience=${encodeURIComponent(audience)}`);
    return;
  }
  window.location.assign(`/api/auth/${provider}?audience=${encodeURIComponent(audience)}`);
}

async function submitCommunityRegistration(event, values) {
  const form = event.currentTarget;
  try {
    const actor = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(values)
    });
    form.reset();
    authenticatedActor = actor;
    document.getElementById('communityLogoutButton').hidden = false;
    closeModal('modal-acc-public');
    await showMemberDashboard(actor);
    if (actor.welcomeEmailSent === false) {
      showMessage('prayerRequestMessage', 'Tu cuenta se creó, pero no pudimos enviar el correo de bienvenida. Contacta al equipo de la iglesia.', true);
    }
  } catch (error) {
    showMessage('generalAuthMessage', error.message, true);
  }
}

async function submitEmailLogin(event, audience) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  try {
    const actor = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ ...values, audience })
    });
    form.reset();
    if (actor.role === 'community') {
      document.getElementById('communityLogoutButton').hidden = false;
      closeModal(audience === 'community' ? 'modal-acc-public' : 'modal-acc-leaders');
      await showMemberDashboard(actor);
      return;
    }
    if (['developer', 'superDeveloper'].includes(actor.role)) {
      window.location.assign('/admin/developer-panel.html');
      return;
    }
    if (['pastor', 'leader'].includes(actor.role)) {
      window.location.assign('/admin/church-dashboard.html');
      return;
    }
    await setupDashboard(actor);
    closeModal(audience === 'community' ? 'modal-acc-public' : 'modal-acc-leaders');
    showMessage('dashboardMessage', `Acceso correcto. Bienvenido/a, ${actor.name}.`);
  } catch (error) {
    showMessage(audience === 'community' ? 'generalAuthMessage' : 'leaderAuthMessage', error.message, true);
  }
}

async function loadPrayerRequests() {
  const list = document.getElementById('prayerRequestList');
  try {
    const { requests } = await apiRequest('/api/member/prayer-requests');
    list.replaceChildren();
    if (!requests.length) {
      const emptyState = document.createElement('li');
      emptyState.textContent = 'Aún no has enviado peticiones de oración.';
      list.append(emptyState);
      return;
    }
    for (const request of requests) {
      const item = document.createElement('li');
      item.textContent = request.content;
      const details = document.createElement('small');
      details.textContent = `${formatDate(request.createdAt)} · ${
        request.status === 'ANSWERED' ? 'Respondida' : request.status === 'PRAYING' ? 'En oración' : 'Recibida'
      }`;
      item.append(details);
      list.append(item);
    }
  } catch (error) {
    showMessage('prayerRequestMessage', error.message, true);
  }
}

async function loadMemberDevotionals() {
  const list = document.getElementById('memberDevotionalList');
  try {
    const { devotionals } = await apiRequest('/api/member/devotionals');
    list.replaceChildren();
    for (const devotional of devotionals) {
      const article = document.createElement('article');
      const heading = document.createElement('h4');
      heading.textContent = devotional.title;
      const content = document.createElement('p');
      content.textContent = devotional.content;
      article.append(heading, content);
      list.append(article);
    }
  } catch (error) {
    showMessage('memberDevotionalMessage', error.message, true);
  }
}

async function loadMemberEvents() {
  const list = document.getElementById('memberEventsList');
  try {
    const events = await apiRequest('/api/public/events');
    const upcomingEvents = events.filter(event => event.meetingAt && new Date(event.meetingAt) >= new Date());
    if (!upcomingEvents.length) {
      renderEmpty(list, 'Por ahora no hay próximos eventos publicados.', 'member-events-empty');
      return;
    }

    const cards = upcomingEvents.map(event => {
      const card = document.createElement('article');
      card.className = 'member-event-card';

      const title = document.createElement('h4');
      title.textContent = event.title;
      const date = document.createElement('p');
      date.className = 'member-event-date';
      date.textContent = formatDate(event.meetingAt);
      const details = document.createElement('p');
      details.textContent = [
        ministryLabels[event.ministryCode] || 'Actividad de la iglesia',
        event.churchName,
        event.location
      ].filter(Boolean).join(' · ');
      card.append(title, date, details);

      if (event.publicDescription) {
        const description = document.createElement('p');
        description.className = 'member-event-description';
        description.textContent = event.publicDescription;
        card.append(description);
      }

      const button = document.createElement('button');
      button.className = 'member-rsvp-button';
      button.type = 'button';
      button.dataset.eventId = event.id;
      button.setAttribute('aria-pressed', String(memberEventAttendance.has(event.id)));
      button.textContent = memberEventAttendance.has(event.id)
        ? 'Asistencia confirmada · Cancelar'
        : 'Confirmar asistencia';
      card.append(button);
      return card;
    });

    list.replaceChildren(...cards);
  } catch (error) {
    renderEmpty(list, error.message, 'member-events-empty');
  }
}

async function submitPrayerRequest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const content = new FormData(form).get('content');
  try {
    await apiRequest('/api/member/prayer-requests', {
      method: 'POST',
      body: JSON.stringify({ content })
    });
    form.reset();
    showMessage('prayerRequestMessage', 'Tu petición privada fue enviada.');
    await loadPrayerRequests();
  } catch (error) {
    showMessage('prayerRequestMessage', error.message, true);
  }
}

function toggleCommunityAuthMode() {
  const toggle = document.getElementById('communityAuthToggle');
  const isRegistering = toggle.dataset.mode === 'register';
  toggle.dataset.mode = isRegistering ? 'login' : 'register';
  document.getElementById('form-registro').hidden = isRegistering;
  document.getElementById('communityLoginForm').hidden = !isRegistering;
  document.getElementById('communityAuthTitle').textContent = isRegistering ? 'Inicia sesión' : 'Regístrate';
  document.getElementById('communityAuthDescription').textContent = isRegistering
    ? 'Ingresa con el correo y la contraseña de tu cuenta de comunidad.'
    : 'Crea una cuenta de comunidad con tu nombre completo, correo y contraseña.';
  document.querySelector('.auth-benefit').hidden = isRegistering;
  toggle.textContent = isRegistering ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión';
  document.getElementById('generalAuthMessage').textContent = '';
}

function createMetricCard(label, value) {
  const card = document.createElement('div');
  card.className = 'metric-card';
  const heading = document.createElement('h5');
  heading.textContent = label;
  const amount = document.createElement('div');
  amount.className = 'val';
  amount.textContent = typeof value === 'number'
    ? new Intl.NumberFormat('es-CO').format(value)
    : String(value || 0);
  card.append(heading, amount);
  return card;
}

function renderOverview(overview) {
  const metrics = document.getElementById('overviewMetrics');
  const membershipTotal = overview.membershipByChurch.reduce((sum, church) => sum + church.total, 0);
  const activeMembership = overview.membershipByChurch.reduce((sum, church) => sum + church.active, 0);
  const goalProgress = overview.totals.pastoralGoal
    ? Math.min(100, Math.round(overview.totals.totalMembers / overview.totals.pastoralGoal * 100))
    : 0;
  metrics.replaceChildren(
    createMetricCard('Personas registradas en iglesias', membershipTotal),
    createMetricCard('Personas en proceso o activas', activeMembership),
    createMetricCard('Personas por consolidar', overview.totals.peopleToConsolidate),
    createMetricCard('Avance de metas pastorales', `${goalProgress}%`),
    createMetricCard('Informes registrados', overview.reportCounts)
  );
  const list = document.getElementById('overviewMinistries');
  const sections = [];
  for (const church of overview.byChurch || []) {
    const summary = document.createElement('p');
    summary.textContent = `${church.churchName}: ${church.metrics.totalMembers} registros ministeriales · ${church.metrics.peopleToConsolidate} por consolidar · meta ${church.metrics.pastoralGoal}`;
    sections.push(summary);
  }
  for (const church of overview.membershipByChurch || []) {
    const summary = document.createElement('p');
    summary.textContent = `Censo de ${church.name}: ${church.total} personas · ${church.active} en proceso o activas · ${church.visitors} visitantes`;
    sections.push(summary);
  }
  if (!overview.reportsByMinistry.length && !sections.length) {
    renderEmpty(list, 'No hay informes pendientes.');
    return;
  }
  const rows = overview.reportsByMinistry.map(item => {
    const row = document.createElement('p');
    row.textContent = `${item.churchName} · ${ministryLabels[item.ministryCode] || item.ministryCode}: ${item._count._all} pendiente(s)`;
    return row;
  });
  list.replaceChildren(...sections, ...rows);
}

function renderPendingTestimonials(testimonials) {
  const container = document.getElementById('pendingTestimonials');
  if (!testimonials.length) {
    renderEmpty(container, 'No hay testimonios pendientes de revisión.');
    return;
  }
  const cards = testimonials.map(testimonial => {
    const card = document.createElement('article');
    card.className = 'review-card';
    const name = document.createElement('strong');
    name.textContent = testimonial.name;
    const content = document.createElement('p');
    content.textContent = testimonial.content;
    const rating = createRatingStars(testimonial.rating);
    card.append(name);
    if (rating) card.append(rating);
    card.append(content);
    if (testimonial.imageUrl) {
      const image = document.createElement('a');
      image.href = testimonial.imageUrl;
      image.target = '_blank';
      image.rel = 'noopener noreferrer';
      image.textContent = 'Ver imagen enviada';
      card.append(image);
    }
    const actions = document.createElement('div');
    actions.className = 'review-actions';
    for (const [status, label] of [['APPROVED', 'Aprobar'], ['REJECTED', 'Rechazar']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn-primary-peace';
      button.textContent = label;
      button.addEventListener('click', () => reviewTestimonial(testimonial.id, status));
      actions.append(button);
    }
    card.append(actions);
    return card;
  });
  container.replaceChildren(...cards);
}

async function loadPastoralOverview() {
  try {
    const [overview, testimonials] = await Promise.all([
      apiRequest('/api/leadership/overview'),
      apiRequest('/api/leadership/testimonials')
    ]);
    renderOverview(overview);
    renderPendingTestimonials(testimonials);
  } catch (error) {
    showMessage('dashboardMessage', error.message, true);
  }
}

async function reviewTestimonial(id, moderationStatus) {
  try {
    await apiRequest(`/api/leadership/testimonials/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ moderationStatus })
    });
    await loadPastoralOverview();
    await loadPublicContent();
  } catch (error) {
    showMessage('dashboardMessage', error.message, true);
  }
}

function setMetricsForm(metrics) {
  const form = document.getElementById('metricsForm');
  for (const field of Object.keys(metricLabels)) {
    form.elements[field].value = metrics[field] || 0;
  }
}

async function loadMetrics(ministryCode) {
  try {
    const metrics = await apiRequest(
      `/api/leadership/metrics/${encodeURIComponent(ministryCode)}?churchCode=${encodeURIComponent(currentChurchCode)}`
    );
    setMetricsForm(metrics);
  } catch (error) {
    showMessage('dashboardMessage', error.message, true);
  }
}

function renderReports() {
  const body = document.getElementById('reportRows');
  const visibleReports = ministryReports.filter(report =>
    report.ministryCode === currentMinistryCode && report.churchCode === currentChurchCode
  );
  if (!visibleReports.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.textContent = 'No hay reuniones, actas ni proyectos registrados para este ministerio.';
    row.append(cell);
    body.replaceChildren(row);
    return;
  }
  const rows = visibleReports.map(report => {
    const row = document.createElement('tr');
    const type = document.createElement('td');
    type.textContent = report.reportType;
    const title = document.createElement('td');
    title.textContent = report.title;
    const date = document.createElement('td');
    date.textContent = `${formatDate(report.meetingAt)}${report.location ? ` · ${report.location}` : ''}`;
    const status = document.createElement('td');
    status.textContent = { PENDING: 'En revisión', APPROVED: 'Aprobado', REJECTED: 'No aprobado' }[report.status] || report.status;
    const visibility = document.createElement('td');
    visibility.textContent = report.publishToWeb ? 'Publicado' : 'Privado';
    const action = document.createElement('td');
    if (report.status === 'APPROVED') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn-primary-peace';
      button.textContent = report.publishToWeb ? 'Retirar' : 'Publicar';
      button.addEventListener('click', () => setReportVisibility(report.id, !report.publishToWeb));
      action.append(button);
    } else {
      action.textContent = 'Requiere aprobación';
    }
    row.append(type, title, date, status, visibility, action);
    return row;
  });
  body.replaceChildren(...rows);
}

async function loadReports() {
  try {
    ministryReports = await apiRequest('/api/leadership/reports');
    renderReports();
  } catch (error) {
    showMessage('dashboardMessage', error.message, true);
  }
}

async function setReportVisibility(id, publishToWeb) {
  try {
    await apiRequest(`/api/leadership/reports/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ publishToWeb })
    });
    await loadReports();
    await loadPublicContent();
  } catch (error) {
    showMessage('dashboardMessage', error.message, true);
  }
}

function updateSpecialFields(ministryCode) {
  document.getElementById('specialVendimias').style.display = ministryCode === 'vendimias' ? 'grid' : 'none';
  document.getElementById('specialBand').style.display = ministryCode === 'banda' ? 'grid' : 'none';
  document.getElementById('specialOutreach').style.display = ministryCode === 'evangelismo' ? 'grid' : 'none';
  document.getElementById('formAreaTitle').textContent =
    `Registrar reunión, acta o proyecto: ${ministryLabels[ministryCode] || ministryCode}`;
  document.getElementById('metricsTitle').textContent =
    `Métricas de ${ministryLabels[ministryCode] || ministryCode}`;
}

function selectMinistry(ministryCode) {
  if (!authenticatedActor?.ministries.includes(ministryCode)) return;
  currentMinistryCode = ministryCode;
  document.querySelectorAll('[data-ministry]').forEach(button => {
    button.classList.toggle('active', button.dataset.ministry === ministryCode);
  });
  updateSpecialFields(ministryCode);
  document.getElementById('dashboardMessage').textContent = '';
  loadMetrics(ministryCode);
  loadReports();
}

function selectChurch(churchCode) {
  if (!authenticatedActor?.churchCodes.includes(churchCode)) return;
  currentChurchCode = churchCode;
  if (currentMinistryCode) selectMinistry(currentMinistryCode);
}

function setupMinistrySelector() {
  const selector = document.getElementById('ministrySelector');
  const buttons = authenticatedActor.ministries.map(code => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-area';
    button.dataset.ministry = code;
    button.textContent = ministryLabels[code] || code;
    button.addEventListener('click', () => selectMinistry(code));
    return button;
  });
  selector.replaceChildren(...buttons);
  const churchSelector = document.getElementById('churchSelector');
  const churchNames = new Map((authenticatedActor.churches || []).map(church => [church.code, church.name]));
  const churchOptions = authenticatedActor.churchCodes.map(code => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = churchNames.get(code) || code;
    return option;
  });
  churchSelector.replaceChildren(...churchOptions);
  currentChurchCode = authenticatedActor.churchCodes[0];
  churchSelector.addEventListener('change', () => selectChurch(churchSelector.value));
}

async function setupDashboard(actor) {
  authenticatedActor = actor;
  document.getElementById('memberDashboard').hidden = true;
  document.getElementById('developerDashboard').hidden = true;
  const dashboard = document.getElementById('adminDashboard');
  dashboard.hidden = false;
  document.getElementById('welcomeUserText').textContent =
    `${actor.email} · ${actor.role === 'admin' ? 'Administrador del sistema' : actor.role === 'pastor' ? 'Pastor / cobertura' : 'Líder autorizado'}`;

  const hasPastoralAccess = actor.role === 'pastor' || actor.role === 'admin';
  document.getElementById('pastoralOverview').hidden = !hasPastoralAccess;
  document.getElementById('ministryWorkspace').hidden = false;
  setupMinistrySelector();
  if (hasPastoralAccess) await loadPastoralOverview();
  if (actor.ministries.length) selectMinistry(actor.ministries[0]);
  dashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function showMemberDashboard(actor) {
  authenticatedActor = actor;
  document.getElementById('adminDashboard').hidden = true;
  document.getElementById('developerDashboard').hidden = true;
  document.getElementById('communityLogoutButton').hidden = true;
  document.getElementById('memberWelcomeName').textContent = actor.name || actor.email;
  document.getElementById('memberEmail').textContent = actor.email;
  const dashboard = document.getElementById('memberDashboard');
  dashboard.hidden = false;
  await Promise.all([loadPrayerRequests(), loadMemberDevotionals(), loadMemberEvents()]);
  dashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderDeveloperList(developers, canManage) {
  const list = document.getElementById('developerList');
  if (!developers.length) {
    const empty = document.createElement('li');
    empty.textContent = 'Aún no hay desarrolladores delegados.';
    list.replaceChildren(empty);
    return;
  }

  const items = developers.map(developer => {
    const item = document.createElement('li');
    const details = document.createElement('span');
    details.textContent = `${developer.name} · ${developer.email}`;
    item.append(details);
    if (canManage) {
      const revokeButton = document.createElement('button');
      revokeButton.type = 'button';
      revokeButton.className = 'developer-revoke-button';
      revokeButton.dataset.revokeDeveloper = developer.id;
      revokeButton.textContent = 'Revocar acceso';
      item.append(revokeButton);
    }
    return item;
  });
  list.replaceChildren(...items);
}

async function loadDevelopers() {
  try {
    const { developers, canManage } = await apiRequest('/api/developer/developers');
    document.getElementById('developerForm').hidden = !canManage;
    renderDeveloperList(developers, canManage);
  } catch (error) {
    showMessage('developerMessage', error.message, true);
  }
}

async function setupDeveloperDashboard(actor) {
  authenticatedActor = actor;
  document.getElementById('adminDashboard').hidden = true;
  document.getElementById('memberDashboard').hidden = true;
  document.getElementById('developerWelcomeText').textContent =
    `${actor.name || actor.email} · ${actor.role === 'superDeveloper' ? 'SUPER_DEVELOPER' : 'DEVELOPER'}`;
  document.getElementById('developerDashboard').hidden = false;
  await loadDevelopers();
}

async function addDeveloper(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  try {
    await apiRequest('/api/developer/developers', {
      method: 'POST',
      body: JSON.stringify(values)
    });
    form.reset();
    showMessage('developerMessage', 'El desarrollador fue agregado correctamente.');
    await loadDevelopers();
  } catch (error) {
    showMessage('developerMessage', error.message, true);
  }
}

async function revokeDeveloper(id) {
  if (!window.confirm('¿Revocar el acceso de este desarrollador? Sus sesiones activas se cerrarán.')) return;
  try {
    await apiRequest(`/api/developer/developers/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showMessage('developerMessage', 'El acceso del desarrollador fue revocado.');
    await loadDevelopers();
  } catch (error) {
    showMessage('developerMessage', error.message, true);
  }
}

async function saveMetrics(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  for (const field of Object.keys(metricLabels)) values[field] = Number(values[field]);
  values.churchCode = currentChurchCode;
  try {
    await apiRequest(`/api/leadership/metrics/${encodeURIComponent(currentMinistryCode)}`, {
      method: 'PUT',
      body: JSON.stringify(values)
    });
    showMessage('dashboardMessage', 'Métricas guardadas correctamente.');
    if (authenticatedActor.role !== 'leader') await loadPastoralOverview();
  } catch (error) {
    showMessage('dashboardMessage', error.message, true);
  }
}

async function saveReport(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const details = {};
  const detailFields = {
    vendimias: ['investment', 'productQuantity', 'unitPrice'],
    banda: ['instrumentArea', 'singingLesson'],
    evangelismo: ['brigadeLocation', 'jointWork', 'partnerMinistry']
  }[currentMinistryCode] || [];
  for (const field of detailFields) {
    const value = values[field];
    if (value !== undefined && value !== '') details[field] = field === 'productQuantity' ? Number(value) : value;
  }
  if (currentMinistryCode === 'vendimias') {
    const profit = (Number(values.productQuantity) || 0) * (Number(values.unitPrice) || 0) - (Number(values.investment) || 0);
    details.estimatedProfit = profit;
    details.viability = profit > 0 ? 'Viable' : 'No viable';
  }
  const report = {
    ...values,
    ministryCode: currentMinistryCode,
    churchCode: currentChurchCode,
    meetingAt: values.meetingAt ? new Date(values.meetingAt).toISOString() : null,
    budget: values.budget || null,
    publishToWeb: values.publishToWeb === 'true',
    details
  };
  try {
    await apiRequest('/api/leadership/reports', {
      method: 'POST',
      body: JSON.stringify(report)
    });
    form.reset();
    updateSpecialFields(currentMinistryCode);
    showMessage('dashboardMessage', 'Registro guardado. Su visibilidad respeta la opción seleccionada.');
    await loadReports();
    await loadPublicContent();
  } catch (error) {
    showMessage('dashboardMessage', error.message, true);
  }
}

function updateVendimiaEstimate() {
  const form = document.getElementById('reportForm');
  if (!form) return;
  const investment = Number(form.elements.investment.value) || 0;
  const quantity = Number(form.elements.productQuantity.value) || 0;
  const unitPrice = Number(form.elements.unitPrice.value) || 0;
  const profit = quantity * unitPrice - investment;
  document.getElementById('vendimiasProfit').textContent = formatCurrency(profit);
  document.getElementById('vendimiasViability').textContent =
    quantity && unitPrice ? (profit > 0 ? 'Viable' : 'No viable') : 'Pendiente de cálculo';
}

async function logout() {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
    authenticatedActor = null;
    document.getElementById('adminDashboard').hidden = true;
    document.getElementById('memberDashboard').hidden = true;
    document.getElementById('developerDashboard').hidden = true;
    document.getElementById('communityLogoutButton').hidden = true;
    closeModal('modal-acc-public');
    if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
      window.location.assign('/');
      return;
    }
    window.location.hash = '#mision-vision';
  } catch (error) {
    const messageId = ['developer', 'superDeveloper'].includes(authenticatedActor?.role)
      ? 'developerMessage'
      : authenticatedActor?.role === 'community'
        ? 'generalAuthMessage'
        : 'dashboardMessage';
    showMessage(messageId, error.message, true);
  }
}

function initializePastorCarousel() {
  document.querySelectorAll('[data-pastor-carousel]').forEach(carousel => {
    const slides = [...carousel.querySelectorAll('.pastor-carousel-image')];
    const previousButton = carousel.querySelector('[data-pastor-previous]');
    const nextButton = carousel.querySelector('[data-pastor-next]');
    const status = carousel.querySelector('[data-pastor-carousel-status]');
    if (slides.length < 2 || !previousButton || !nextButton) return;

    let currentIndex = 0;
    let rotationInterval;

    function showSlide(index, announce = false) {
      currentIndex = (index + slides.length) % slides.length;
      slides.forEach((slide, slideIndex) => {
        const isActive = slideIndex === currentIndex;
        slide.classList.toggle('is-active', isActive);
        slide.setAttribute('aria-hidden', String(!isActive));
      });
      if (announce && status) status.textContent = `Fotografía ${currentIndex + 1} de ${slides.length}`;
    }

    function restartRotation() {
      window.clearInterval(rotationInterval);
      rotationInterval = window.setInterval(() => {
        if (!document.hidden) showSlide(currentIndex + 1);
      }, 4000);
    }

    previousButton.addEventListener('click', () => {
      showSlide(currentIndex - 1, true);
      restartRotation();
    });
    nextButton.addEventListener('click', () => {
      showSlide(currentIndex + 1, true);
      restartRotation();
    });

    restartRotation();
  });
}

function attachEventHandlers() {
  initializePastorCarousel();
  const formRegistro = document.getElementById('form-registro');
  if (formRegistro) {
    formRegistro.addEventListener('submit', async event => {
      event.preventDefault();
      const nombreInput = document.getElementById('nombre-registro');
      const emailInput = document.getElementById('email-registro');
      const passwordInput = document.getElementById('password-registro');
      if (!nombreInput || !emailInput || !passwordInput) {
        showMessage('generalAuthMessage', 'No se encontró el formulario de registro completo. Recarga la página e inténtalo de nuevo.', true);
        return;
      }
      const nombre = nombreInput.value;
      const email = emailInput.value;
      const password = passwordInput.value;
      await submitCommunityRegistration(event, { name: nombre, email, password });
    });
  }
  document.getElementById('communityLoginForm').addEventListener('submit', event => {
    submitEmailLogin(event, 'community');
  });
  document.getElementById('leaderLoginForm').addEventListener('submit', event => {
    submitEmailLogin(event, 'leadership');
  });
  document.getElementById('communityAuthToggle').addEventListener('click', toggleCommunityAuthMode);
  document.getElementById('feedbackForm').addEventListener('submit', submitTestimonial);
  document.getElementById('reportForm').addEventListener('submit', saveReport);
  document.getElementById('metricsForm').addEventListener('submit', saveMetrics);
  document.getElementById('logoutButton').addEventListener('click', logout);
  document.getElementById('memberLogoutButton').addEventListener('click', logout);
  document.getElementById('prayerRequestForm').addEventListener('submit', submitPrayerRequest);
  document.getElementById('memberEventsList').addEventListener('click', event => {
    const button = event.target.closest('[data-event-id]');
    if (!button) return;
    const confirmed = memberEventAttendance.has(button.dataset.eventId);
    if (confirmed) {
      memberEventAttendance.delete(button.dataset.eventId);
    } else {
      memberEventAttendance.add(button.dataset.eventId);
    }
    button.setAttribute('aria-pressed', String(!confirmed));
    button.textContent = confirmed ? 'Confirmar asistencia' : 'Asistencia confirmada · Cancelar';
    showMessage('memberEventsMessage', confirmed
      ? 'Se canceló tu confirmación de asistencia.'
      : '¡Tu asistencia quedó confirmada!');
  });
  document.getElementById('communityLogoutButton').addEventListener('click', logout);
  document.getElementById('developerLogoutButton').addEventListener('click', logout);
  document.getElementById('developerForm').addEventListener('submit', addDeveloper);
  document.getElementById('developerList').addEventListener('click', event => {
    const button = event.target.closest('[data-revoke-developer]');
    if (button) revokeDeveloper(button.dataset.revokeDeveloper);
  });
  const menuToggle = document.querySelector('.nav-toggle');
  const primaryMenu = document.getElementById('primaryMenu');
  menuToggle.addEventListener('click', () => {
    const isOpen = primaryMenu.classList.toggle('is-open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación');
  });
  primaryMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      primaryMenu.classList.remove('is-open');
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.setAttribute('aria-label', 'Abrir menú de navegación');
    });
  });
  document.querySelectorAll('[data-open-modal]').forEach(button => {
    button.addEventListener('click', () => openModal(button.dataset.openModal));
  });
  document.querySelectorAll('[data-close-modal]').forEach(button => {
    button.addEventListener('click', () => closeModal(button.dataset.closeModal));
  });
  document.querySelectorAll('[data-offering-message]').forEach(button => {
    button.addEventListener('click', () => {
      button.parentElement.querySelector('.offering-feedback').textContent = button.dataset.offeringMessage;
    });
  });
  for (const name of ['investment', 'productQuantity', 'unitPrice']) {
    document.querySelector(`[name="${name}"]`).addEventListener('input', updateVendimiaEstimate);
  }
  document.querySelectorAll('[data-auth-provider]').forEach(button => {
    button.addEventListener('click', async () => {
      await startAuth(button.dataset.authProvider, button.dataset.authAudience || 'leadership');
    });
  });
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', event => {
      if (event.target === modal) closeModal(modal.id);
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.modal-overlay').forEach(modal => closeModal(modal.id));
      primaryMenu.classList.remove('is-open');
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.setAttribute('aria-label', 'Abrir menú de navegación');
    }
  });
}

async function initialize() {
  attachEventHandlers();
  const currentPath = window.location.pathname;
  const isDeveloperRoute = ['/admin/developer.html', '/admin/developer-panel.html'].includes(currentPath)
    || currentPath.startsWith('/admin/developer/');
  const isChurchRoute = currentPath === '/admin/church-dashboard.html' || currentPath.startsWith('/admin/church/');
  const isMemberRoute = currentPath === '/dashboard.html';
  if (isDeveloperRoute) document.body.classList.add('developer-dashboard-route');
  if (isChurchRoute) document.body.classList.add('church-dashboard-route');
  if (isMemberRoute) document.body.classList.add('member-dashboard-route');
  if (typeof feather !== 'undefined') feather.replace();
  await loadPublicContent();
  await loadAuthProviders();
  try {
    const actor = await apiRequest('/api/auth/me');
    if (isDeveloperRoute) {
      await setupDeveloperDashboard(actor);
    } else if (isChurchRoute) {
      await setupDashboard(actor);
    } else if (isMemberRoute || actor.role === 'community') {
      await showMemberDashboard(actor);
      if (new URLSearchParams(window.location.search).get('community') === 'welcome') {
        showMessage('prayerRequestMessage', `¡Bienvenido/a, ${actor.name || actor.email}! Ya puedes enviar tus peticiones privadas.`);
        window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`);
      }
    } else if (['developer', 'superDeveloper'].includes(actor.role)) {
      window.location.replace('/admin/developer-panel.html');
    } else if (['pastor', 'leader'].includes(actor.role)) {
      window.location.replace('/admin/church-dashboard.html');
    } else {
      await setupDashboard(actor);
    }
    if (new URLSearchParams(window.location.search).get('welcomeEmail') === 'failed') {
      const messageId = isMemberRoute ? 'prayerRequestMessage' : 'dashboardMessage';
      showMessage(messageId, 'Tu cuenta se creó, pero no pudimos enviar el correo de bienvenida. Contacta al equipo de la iglesia.', true);
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`);
    }
  } catch (error) {
    if ([401, 403].includes(error.status) && (isDeveloperRoute || isChurchRoute || isMemberRoute)) {
      window.location.replace('/');
    } else if (error.status !== 401) {
      showMessage('leaderAuthMessage', error.message, true);
      showMessage('adminAuthMessage', error.message, true);
    }
  }
}

document.addEventListener('DOMContentLoaded', initialize);
