let apiBaseUrl = (window.CAMPUS_API_BASE_URL || '').replace(/\/$/, '');
const userIdStorageKey = 'quadpulse-user-id';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const state = {
  events: [],
  registrations: [],
  userId: localStorage.getItem(userIdStorageKey) || '',
};

const elements = {
  apiIndicator: document.getElementById('api-indicator'),
  apiIndicatorLabel: document.getElementById('api-indicator-label'),
  identityForm: document.getElementById('identity-form'),
  backendForm: document.getElementById('backend-form'),
  backendUrl: document.getElementById('backend-url'),
  backendHelp: document.getElementById('backend-help'),
  userId: document.getElementById('user-id'),
  identityHelp: document.getElementById('identity-help'),
  eventCount: document.getElementById('event-count'),
  eventList: document.getElementById('event-list'),
  eventsMessage: document.getElementById('events-message'),
  eventSearch: document.getElementById('event-search'),
  eventSort: document.getElementById('event-sort'),
  registrationCount: document.getElementById('registration-count'),
  registrationList: document.getElementById('registration-list'),
  hostedCount: document.getElementById('hosted-count'),
  hostedList: document.getElementById('hosted-list'),
};

elements.userId.value = state.userId;
elements.backendUrl.value = apiBaseUrl;

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || `Request failed (${response.status})`);
  }
  return data;
}

function setApiStatus(status, label) {
  elements.apiIndicator.dataset.state = status;
  elements.apiIndicatorLabel.textContent = label;
}

function setEventsMessage(message, kind = 'info') {
  elements.eventsMessage.hidden = !message;
  elements.eventsMessage.textContent = message;
  elements.eventsMessage.dataset.kind = kind;
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatId(value) {
  if (!value) return 'ID unavailable';
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function getEventStatus(event) {
  return String(event.status || 'published').toLowerCase();
}

function createStatusChip(status) {
  const chip = makeElement('span', 'status-chip', status);
  chip.dataset.status = status;
  return chip;
}

function createEventCard(event) {
  const article = makeElement('article', 'event-card');
  const top = makeElement('div', 'event-card-top');
  const identity = makeElement('div');
  const id = makeElement('span', 'event-id', formatId(event.id));
  id.title = event.id || '';
  const title = makeElement('h3', '', event.title || 'Untitled event');
  const status = getEventStatus(event);
  const chip = createStatusChip(status);
  identity.append(id, title);
  top.append(identity, chip);

  const meta = makeElement('div', 'event-meta');
  const organizer = makeElement('span');
  const organizerIcon = makeElement('span', 'material-symbols-outlined', 'person');
  organizerIcon.setAttribute('aria-hidden', 'true');
  const organizerText = makeElement('span', '', `Organizer ${formatId(event.organizer_id)}`);
  organizer.append(organizerIcon, organizerText);
  meta.append(organizer);

  const footer = makeElement('footer', 'event-card-footer');
  const capacity = event.capacity == null ? 'Capacity not set' : `${event.capacity} seats`;
  footer.append(makeElement('span', 'event-capacity', capacity));

  const button = makeElement('button', 'button button-primary button-small');
  button.type = 'button';
  button.dataset.action = 'register';
  button.dataset.eventId = event.id || '';

  const alreadyRegistered = state.registrations.some((registration) => registration.event_id === event.id);
  const isPublished = ['published', 'open', 'active'].includes(status);
  button.textContent = alreadyRegistered ? 'Reserved' : 'Reserve spot';
  button.disabled = alreadyRegistered || !state.userId || !isPublished || !event.id;
  button.title = !state.userId
    ? 'Save your campus UUID above to register'
    : (!isPublished ? 'This event is not open for registration' : '');
  if (alreadyRegistered) button.classList.add('button-reserved');
  footer.append(button);
  article.append(top, meta, footer);
  return article;
}

function sortEvents(events) {
  const sorted = [...events];
  if (elements.eventSort.value === 'capacity') {
    sorted.sort((a, b) => (Number(b.capacity) || 0) - (Number(a.capacity) || 0));
  } else {
    sorted.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  }
  return sorted;
}

function renderEvents() {
  const search = elements.eventSearch.value.trim().toLowerCase();
  const matches = sortEvents(state.events.filter((event) => String(event.title || '').toLowerCase().includes(search)));
  elements.eventCount.textContent = `${matches.length} ${matches.length === 1 ? 'event' : 'events'}`;
  elements.eventList.replaceChildren();

  if (!matches.length) {
    const empty = makeElement('div', 'empty-state', state.events.length ? 'No events match your search.' : 'No events are available yet. Check back soon.');
    elements.eventList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  matches.forEach((event) => fragment.append(createEventCard(event)));
  elements.eventList.append(fragment);
}

function createCompactItem(titleText, idText, statusText) {
  const article = makeElement('article', 'compact-item');
  const copy = makeElement('div', 'compact-item-copy');
  const title = makeElement('h3', '', titleText);
  const id = makeElement('p', '', idText);
  copy.append(title, id);
  article.append(copy, createStatusChip(statusText));
  return article;
}

function renderRegistrations() {
  elements.registrationList.replaceChildren();
  if (!state.userId) {
    elements.registrationCount.textContent = 'Add your campus ID to view';
    elements.registrationList.append(makeElement('p', 'empty-state', 'Save your UUID above to see your registrations.'));
    return;
  }

  elements.registrationCount.textContent = `${state.registrations.length} ${state.registrations.length === 1 ? 'reservation' : 'reservations'}`;
  if (!state.registrations.length) {
    elements.registrationList.append(makeElement('p', 'empty-state', 'No registrations found for this UUID.'));
    return;
  }

  const eventById = new Map(state.events.map((event) => [event.id, event]));
  const fragment = document.createDocumentFragment();
  state.registrations.forEach((registration) => {
    const event = eventById.get(registration.event_id);
    fragment.append(createCompactItem(event?.title || 'Campus event', formatId(registration.event_id), 'reserved'));
  });
  elements.registrationList.append(fragment);
}

function renderHostedEvents() {
  elements.hostedList.replaceChildren();
  if (!state.userId) {
    elements.hostedCount.textContent = 'Add your campus ID to view';
    elements.hostedList.append(makeElement('p', 'empty-state', 'Save your organizer UUID above to see hosted events.'));
    return;
  }

  const hosted = state.events.filter((event) => String(event.organizer_id || '').toLowerCase() === state.userId.toLowerCase());
  elements.hostedCount.textContent = `${hosted.length} ${hosted.length === 1 ? 'event' : 'events'}`;
  if (!hosted.length) {
    elements.hostedList.append(makeElement('p', 'empty-state', 'No hosted events match this UUID.'));
    return;
  }

  const fragment = document.createDocumentFragment();
  hosted.forEach((event) => fragment.append(createCompactItem(event.title || 'Untitled event', formatId(event.id), getEventStatus(event))));
  elements.hostedList.append(fragment);
}

function renderAll() {
  renderEvents();
  renderRegistrations();
  renderHostedEvents();
}

async function loadData() {
  if (!apiBaseUrl) {
    state.events = [];
    state.registrations = [];
    setApiStatus('offline', 'Set backend URL');
    setEventsMessage('Enter your Render service URL above to connect this frontend to the API.', 'info');
    elements.eventList.setAttribute('aria-busy', 'false');
    renderAll();
    return;
  }

  setApiStatus('loading', 'Connecting');
  elements.eventList.setAttribute('aria-busy', 'true');
  setEventsMessage('Loading events...');

  try {
    const events = await request('/api/events');
    state.events = Array.isArray(events) ? events : [];
    setApiStatus('online', 'API connected');
    setEventsMessage('');
  } catch (error) {
    state.events = [];
    setApiStatus('offline', 'API unavailable');
    setEventsMessage(`Could not load events. Check the backend URL and Supabase table permissions. ${error.message}`, 'error');
  }

  if (state.userId) {
    try {
      const registrations = await request(`/api/me/registrations?user_id=${encodeURIComponent(state.userId)}`);
      state.registrations = Array.isArray(registrations) ? registrations : [];
    } catch (error) {
      state.registrations = [];
      if (state.events.length) {
        setEventsMessage(`Events loaded, but registrations could not be read: ${error.message}`, 'error');
      }
    }
  } else {
    state.registrations = [];
  }

  elements.eventList.setAttribute('aria-busy', 'false');
  renderAll();
}

elements.backendForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  let parsedUrl;
  try {
    parsedUrl = new URL(elements.backendUrl.value.trim());
  } catch {
    elements.backendHelp.textContent = 'Enter a complete URL, such as https://your-service.onrender.com.';
    elements.backendHelp.dataset.kind = 'error';
    return;
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.pathname !== '/' || parsedUrl.search || parsedUrl.hash) {
    elements.backendHelp.textContent = 'Use the service root URL, without a path, query, or /api suffix.';
    elements.backendHelp.dataset.kind = 'error';
    return;
  }

  apiBaseUrl = parsedUrl.origin;
  localStorage.setItem('quadpulse-api-url', apiBaseUrl);
  window.CAMPUS_API_BASE_URL = apiBaseUrl;
  elements.backendUrl.value = apiBaseUrl;
  elements.backendHelp.textContent = 'Backend URL saved in this browser.';
  elements.backendHelp.dataset.kind = 'success';
  await loadData();
});

elements.identityForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const userId = elements.userId.value.trim();
  if (!uuidPattern.test(userId)) {
    elements.identityHelp.textContent = 'Enter a complete UUID, for example 123e4567-e89b-12d3-a456-426614174000.';
    elements.identityHelp.dataset.kind = 'error';
    return;
  }

  state.userId = userId;
  localStorage.setItem(userIdStorageKey, userId);
  elements.identityHelp.textContent = 'ID saved in this browser.';
  elements.identityHelp.dataset.kind = 'success';
  await loadData();
});

elements.eventList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action="register"]');
  if (!button || button.disabled) return;
  if (!state.userId) {
    elements.identityHelp.textContent = 'Save your campus UUID before reserving a spot.';
    elements.userId.focus();
    return;
  }

  button.disabled = true;
  button.textContent = 'Reserving...';
  try {
    await request('/api/registrations', {
      method: 'POST',
      body: JSON.stringify({ user_id: state.userId, event_id: button.dataset.eventId }),
    });
    setEventsMessage('Your registration was saved.', 'success');
    await loadData();
  } catch (error) {
    setEventsMessage(`Could not register: ${error.message}`, 'error');
    button.disabled = false;
    button.textContent = 'Reserve spot';
  }
});

elements.eventSearch.addEventListener('input', renderEvents);
elements.eventSort.addEventListener('change', renderEvents);
document.getElementById('refresh-events').addEventListener('click', loadData);

loadData();