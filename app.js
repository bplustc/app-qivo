const STORAGE_SESSION = 'qivo_session_mode';
const STORAGE_REQUESTS = 'qivo_requests';
const STORAGE_PASSENGER_PROFILE = 'qivo_passenger_profile';
const STORAGE_DRIVER_WALLET = 'qivo_driver_wallet';
const SCREEN_TRANSITION_MS = 750;
const WALLET_API_BASE = 'http://localhost:4000/api/v1';
const WALLET_PROVIDER = 'kushki';
const DEMO_DRIVER_ID = '11111111-1111-1111-1111-111111111111';

const PRESET_USERS = {
  passenger: {
    username: 'pasajero',
    password: '1234',
    label: 'Pasajero',
  },
  driver: {
    username: 'conductor',
    password: '1234',
    label: 'Conductor',
  },
};

let qivoMapInstance = null;
let qivoMapMarker = null;
let qivoAutocomplete = null;
let qivoTypingTimer = null;
let pendingAuthMode = null;
let welcomeTimer = null;
let screenTransitionCleanupTimer = null;
let hasInitializedFlow = false;

function formatUsd(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function getLocalDriverWallet() {
  const fallback = { balance: 0, movements: [] };

  try {
    const raw = localStorage.getItem(STORAGE_DRIVER_WALLET);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw);
    const balance = Number(parsed.balance || 0);
    const movements = Array.isArray(parsed.movements) ? parsed.movements : [];

    return {
      balance: isFinite(balance) ? balance : 0,
      movements,
    };
  } catch (error) {
    return fallback;
  }
}

function saveLocalDriverWallet(state) {
  localStorage.setItem(STORAGE_DRIVER_WALLET, JSON.stringify(state));
}

function mapMovementLabel(type) {
  if (type === 'topup') {
    return 'Recarga con tarjeta';
  }

  if (type === 'service_fee') {
    return 'Descuento por servicio';
  }

  if (type === 'refund') {
    return 'Reembolso';
  }

  return 'Ajuste de saldo';
}

function renderDriverWalletState(state, statusText) {
  const balanceTarget = document.getElementById('driver-wallet-balance');
  const statusTarget = document.getElementById('driver-wallet-status');
  const movementsTarget = document.getElementById('driver-wallet-movements');

  if (balanceTarget) {
    balanceTarget.textContent = formatUsd(state.balance);
  }

  if (statusTarget) {
    statusTarget.textContent = statusText || 'Sin movimientos recientes.';
  }

  if (!movementsTarget) {
    return;
  }

  if (!state.movements.length) {
    movementsTarget.innerHTML = '<li class="wallet-empty">Aun no tienes recargas registradas.</li>';
    return;
  }

  movementsTarget.innerHTML = state.movements
    .slice()
    .reverse()
    .slice(0, 6)
    .map((item) => {
      const sign = Number(item.amount) >= 0 ? '+' : '-';
      const amount = formatUsd(Math.abs(Number(item.amount || 0)));
      const date = item.date ? new Date(item.date).toLocaleString('es-EC') : '-';
      return `<li><span>${item.label}</span><strong>${sign}${amount}</strong><small>${date}</small></li>`;
    })
    .join('');
}

async function walletApiRequest(path, options = {}) {
  const response = await fetch(`${WALLET_API_BASE}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-driver-id': DEMO_DRIVER_ID,
      'x-role': 'driver',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.message || 'Error al consumir API de billetera';
    throw new Error(message);
  }

  return data;
}

async function fetchDriverWalletFromApi() {
  const [wallet, movements] = await Promise.all([
    walletApiRequest('/wallet/me'),
    walletApiRequest('/wallet/movements?limit=6'),
  ]);

  return {
    balance: Number(wallet.balanceUsd || 0),
    movements: Array.isArray(movements.items)
      ? movements.items.map((item) => ({
        amount: Number(item.amountUsd || 0),
        label: mapMovementLabel(item.type),
        date: item.createdAt,
      }))
      : [],
  };
}

async function renderDriverWallet() {
  try {
    const state = await fetchDriverWalletFromApi();
    renderDriverWalletState(state, 'Saldo sincronizado con servidor.');
    saveLocalDriverWallet(state);
  } catch (error) {
    const state = getLocalDriverWallet();
    const hasLocalMovements = state.movements.length > 0;
    const statusText = hasLocalMovements
      ? 'Mostrando saldo local temporal (backend no disponible).'
      : 'Sin conexión al backend. Usa recarga local temporal.';
    renderDriverWalletState(state, statusText);
  }
}

function addDriverWalletMovement(amount, label) {
  const state = getLocalDriverWallet();
  const numericAmount = Number(amount || 0);
  state.balance = Number((state.balance + numericAmount).toFixed(2));
  state.movements.push({
    amount: numericAmount,
    label,
    date: new Date().toISOString(),
  });

  if (state.movements.length > 30) {
    state.movements = state.movements.slice(-30);
  }

  saveLocalDriverWallet(state);
  renderDriverWalletState(state, 'Saldo actualizado en modo local.');
}

async function topupDriverWallet(amount) {
  const statusTarget = document.getElementById('driver-wallet-status');

  if (statusTarget) {
    statusTarget.textContent = `Procesando recarga de ${formatUsd(amount)}...`;
  }

  try {
    const intent = await walletApiRequest('/wallet/topup/create-intent', {
      method: 'POST',
      body: {
        amountUsd: amount,
        provider: WALLET_PROVIDER,
      },
    });

    await walletApiRequest(`/payments/webhook/${WALLET_PROVIDER}`, {
      method: 'POST',
      body: {
        eventId: `demo-event-${Date.now()}`,
        eventType: 'payment.paid',
        paymentId: intent.paymentId,
        providerPaymentId: `demo-provider-${intent.paymentId}`,
      },
    });

    await renderDriverWallet();

    if (statusTarget) {
      statusTarget.textContent = `Recarga aplicada en servidor: ${formatUsd(amount)}.`;
    }
    return;
  } catch (error) {
    addDriverWalletMovement(amount, `Recarga local ${formatUsd(amount)}`);

    if (statusTarget) {
      statusTarget.textContent = `Backend no disponible. Recarga guardada localmente (${formatUsd(amount)}).`;
    }
  }
}

function isDesktopRestricted() {
  const hasDesktopPointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const isMobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return hasDesktopPointer && !isMobileUa;
}

function applyDesktopRestriction() {
  const blocked = isDesktopRestricted();
  document.body.classList.toggle('is-desktop-blocked', blocked);
  return !blocked;
}

function getRequests() {
  try {
    const raw = localStorage.getItem(STORAGE_REQUESTS);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveRequests(requests) {
  localStorage.setItem(STORAGE_REQUESTS, JSON.stringify(requests));
}

function setActiveScreen(screenId) {
  const nextScreen = document.getElementById(screenId);
  if (!nextScreen) {
    return;
  }

  const currentScreen = document.querySelector('.screen.is-active:not(.is-leaving)');

  if (currentScreen && currentScreen.id === screenId) {
    return;
  }

  if (screenTransitionCleanupTimer) {
    clearTimeout(screenTransitionCleanupTimer);
    screenTransitionCleanupTimer = null;
  }

  if (!currentScreen) {
    document.querySelectorAll('.screen').forEach((screen) => {
      screen.classList.remove('is-active', 'is-entering', 'is-leaving');
    });

    nextScreen.classList.add('is-active', 'is-entering');
    screenTransitionCleanupTimer = window.setTimeout(() => {
      nextScreen.classList.remove('is-entering');
    }, SCREEN_TRANSITION_MS);
    return;
  }

  currentScreen.classList.add('is-leaving');
  nextScreen.classList.add('is-active', 'is-entering');

  screenTransitionCleanupTimer = window.setTimeout(() => {
    currentScreen.classList.remove('is-active', 'is-leaving');
    nextScreen.classList.remove('is-entering');
  }, SCREEN_TRANSITION_MS);
}

function setTab(mode, tab) {
  const root = document.getElementById(`${mode}-tabs`);
  if (!root) {
    return;
  }

  root.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.tabPanel === tab);
  });

  document.querySelectorAll(`[data-nav-root="${mode}"] .nav-item`).forEach((item) => {
    item.classList.toggle('is-active', item.dataset.tabTarget === tab);
  });

  if (mode === 'driver' && tab === 'home') {
    renderDriverRequests();
  }

  if (mode === 'driver' && tab === 'finance') {
    renderDriverWallet();
  }
}

function enterMode(mode) {
  if (mode === 'passenger') {
    setActiveScreen('passenger-view');
    setTab('passenger', 'home');
    refreshPassengerProfile();
    refreshMapIfNeeded();
    return;
  }

  if (mode === 'driver') {
    setActiveScreen('driver-view');
    setTab('driver', 'home');
    renderDriverRequests();
    renderDriverWallet();
    return;
  }

  showModeSelection();
}

function loginToMode(mode) {
  localStorage.setItem(STORAGE_SESSION, mode);
  enterMode(mode);
}

function showModeSelection() {
  pendingAuthMode = null;
  if (welcomeTimer) {
    clearTimeout(welcomeTimer);
    welcomeTimer = null;
  }
  setActiveScreen('auth-view');
}

function showWelcomeFlow() {
  pendingAuthMode = null;
  setActiveScreen('welcome-view');

  if (welcomeTimer) {
    clearTimeout(welcomeTimer);
  }

  welcomeTimer = window.setTimeout(() => {
    showModeSelection();
  }, 3000);
}

function getModeCopy(mode) {
  if (mode === 'driver') {
    return {
      title: 'Acceso Conductor',
      subtitle: 'Inicia sesion para gestionar solicitudes',
    };
  }

  return {
    title: 'Acceso Pasajero',
    subtitle: 'Inicia sesion para solicitar tu traslado',
  };
}

function openLoginForMode(mode) {
  const profile = PRESET_USERS[mode];
  if (!profile) {
    return;
  }

  pendingAuthMode = mode;

  const title = document.getElementById('login-title');
  const subtitle = document.getElementById('login-subtitle');
  const hint = document.getElementById('login-hint');
  const error = document.getElementById('login-error');
  const username = document.getElementById('login-username');
  const password = document.getElementById('login-password');
  const copy = getModeCopy(mode);

  if (title) {
    title.textContent = copy.title;
  }

  if (subtitle) {
    subtitle.textContent = copy.subtitle;
  }

  if (hint) {
    hint.textContent = `Credenciales demo: ${profile.username} / ${profile.password}`;
  }

  if (error) {
    error.textContent = '';
    error.style.display = 'none';
  }

  if (username) {
    username.value = '';
  }

  if (password) {
    password.value = '';
  }

  setActiveScreen('login-view');

  if (username) {
    username.focus();
  }
}

function hasValidCredentials(mode, username, password) {
  const profile = PRESET_USERS[mode];
  if (!profile) {
    return false;
  }

  return profile.username === username && profile.password === password;
}

function logout() {
  localStorage.removeItem(STORAGE_SESSION);
  showWelcomeFlow();
}

function renderDriverRequests() {
  const container = document.getElementById('driver-requests');
  if (!container) {
    return;
  }

  const requests = getRequests().filter((item) => item.conductor === 'Ramon Bolivar');

  if (!requests.length) {
    container.innerHTML = '<p class="empty-state">No tienes solicitudes por el momento.</p>';
    return;
  }

  container.innerHTML = requests
    .slice()
    .reverse()
    .map((item) => `
      <article class="request-card">
        <strong>${item.servicio}</strong>
        <p><b>Cliente:</b> ${item.nombre} ${item.apellido}</p>
        <p><b>Teléfono:</b> ${item.telefono}</p>
        <p><b>Dirección:</b> ${item.direccion}</p>
        <p><b>Fecha:</b> ${item.fecha} ${item.hora}</p>
        <p><b>GPS:</b> ${item.latitud || '-'}, ${item.longitud || '-'}</p>
      </article>
    `)
    .join('');
}

function refreshPassengerProfile() {
  const nameTarget = document.getElementById('profile-passenger-name');
  const phoneTarget = document.getElementById('profile-passenger-phone');
  const profile = JSON.parse(localStorage.getItem(STORAGE_PASSENGER_PROFILE) || '{}');

  if (nameTarget) {
    nameTarget.textContent = profile.name || 'Sin definir';
  }

  if (phoneTarget) {
    phoneTarget.textContent = profile.phone || 'Sin definir';
  }
}

function validatePhone(input, errorElement) {
  const digits = input.value.replace(/\D/g, '').slice(0, 10);
  input.value = digits;

  if (digits.length !== 10) {
    const faltan = Math.max(0, 10 - digits.length);
    const message = faltan > 0
      ? `El teléfono debe tener 10 dígitos. Faltan ${faltan}.`
      : 'El teléfono debe tener exactamente 10 dígitos.';

    input.setCustomValidity(message);
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }
    return false;
  }

  input.setCustomValidity('');
  if (errorElement) {
    errorElement.textContent = '';
    errorElement.style.display = 'none';
  }
  return true;
}

function setMapCoordinates(latLng, latInput, lngInput) {
  if (!latLng || !latInput || !lngInput) {
    return;
  }

  latInput.value = String(latLng.lat());
  lngInput.value = String(latLng.lng());

  if (qivoMapMarker) {
    qivoMapMarker.setPosition(latLng);
  }
}

function refreshMapIfNeeded() {
  if (!qivoMapInstance || !qivoMapMarker || !window.google || !window.google.maps) {
    return;
  }

  window.google.maps.event.trigger(qivoMapInstance, 'resize');
  qivoMapInstance.setCenter(qivoMapMarker.getPosition());
}

window.initQivoMap = function initQivoMap() {
  const mapContainer = document.getElementById('qivo-map');
  const direccionInput = document.getElementById('direccion');
  const latInput = document.getElementById('latitud');
  const lngInput = document.getElementById('longitud');

  if (!mapContainer || !direccionInput || !latInput || !lngInput || !window.google || !window.google.maps) {
    return;
  }

  const quitoCenter = { lat: -0.180653, lng: -78.467834 };

  qivoMapInstance = new window.google.maps.Map(mapContainer, {
    center: quitoCenter,
    zoom: 13,
    mapTypeControl: false,
    fullscreenControl: false,
    streetViewControl: false,
  });

  qivoMapMarker = new window.google.maps.Marker({
    map: qivoMapInstance,
    position: quitoCenter,
    draggable: true,
  });

  setMapCoordinates(qivoMapMarker.getPosition(), latInput, lngInput);

  qivoMapInstance.addListener('click', (event) => {
    if (!event.latLng) {
      return;
    }
    setMapCoordinates(event.latLng, latInput, lngInput);
  });

  qivoMapMarker.addListener('dragend', (event) => {
    if (!event.latLng) {
      return;
    }
    setMapCoordinates(event.latLng, latInput, lngInput);
  });

  qivoAutocomplete = new window.google.maps.places.Autocomplete(direccionInput, {
    fields: ['formatted_address', 'geometry'],
    componentRestrictions: { country: 'ec' },
  });

  qivoAutocomplete.addListener('place_changed', () => {
    const place = qivoAutocomplete.getPlace();
    if (!place || !place.geometry || !place.geometry.location) {
      return;
    }

    qivoMapInstance.setCenter(place.geometry.location);
    qivoMapInstance.setZoom(16);
    setMapCoordinates(place.geometry.location, latInput, lngInput);

    if (place.formatted_address) {
      direccionInput.value = place.formatted_address;
    }
  });

  direccionInput.addEventListener('input', () => {
    const query = direccionInput.value.trim();

    if (qivoTypingTimer) {
      clearTimeout(qivoTypingTimer);
    }

    if (query.length < 5) {
      return;
    }

    qivoTypingTimer = setTimeout(() => {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ec&q=${encodeURIComponent(query)}`;

      fetch(url, { headers: { 'Accept-Language': 'es' } })
        .then((res) => res.json())
        .then((data) => {
          if (!Array.isArray(data) || !data[0]) {
            return;
          }

          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);

          if (!isFinite(lat) || !isFinite(lng)) {
            return;
          }

          const latLng = new window.google.maps.LatLng(lat, lng);
          qivoMapInstance.setCenter(latLng);
          qivoMapInstance.setZoom(16);
          setMapCoordinates(latLng, latInput, lngInput);
        })
        .catch(() => {});
    }, 600);
  });
};

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (isLocalHost) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
      });
    });
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

document.addEventListener('DOMContentLoaded', () => {
  registerServiceWorker();

  const tryStartFlow = () => {
    const allowed = applyDesktopRestriction();
    if (!allowed || hasInitializedFlow) {
      return;
    }

    hasInitializedFlow = true;
    showWelcomeFlow();
  };

  window.addEventListener('resize', () => {
    tryStartFlow();
  });

  document.querySelectorAll('[data-enter-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.enterMode;
      openLoginForMode(mode);
    });
  });

  document.querySelectorAll('[data-switch-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.switchMode;
      openLoginForMode(mode);
    });
  });

  document.getElementById('back-to-mode')?.addEventListener('click', () => {
    showModeSelection();
  });

  const loginForm = document.getElementById('login-form');
  const loginUsername = document.getElementById('login-username');
  const loginPassword = document.getElementById('login-password');
  const loginError = document.getElementById('login-error');

  if (loginForm && loginUsername && loginPassword) {
    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();

      if (!pendingAuthMode) {
        showModeSelection();
        return;
      }

      const username = loginUsername.value.trim();
      const password = loginPassword.value.trim();

      if (!hasValidCredentials(pendingAuthMode, username, password)) {
        if (loginError) {
          loginError.textContent = 'Usuario o contrasena incorrectos.';
          loginError.style.display = 'block';
        }
        return;
      }

      if (loginError) {
        loginError.textContent = '';
        loginError.style.display = 'none';
      }

      loginToMode(pendingAuthMode);
    });
  }

  document.querySelectorAll('[data-nav-root]').forEach((nav) => {
    const mode = nav.dataset.navRoot;
    nav.querySelectorAll('.nav-item').forEach((item) => {
      item.addEventListener('click', () => {
        setTab(mode, item.dataset.tabTarget);
      });
    });
  });

  const phoneInput = document.getElementById('telefono');
  const phoneError = document.getElementById('telefono-error');
  const serviceInput = document.getElementById('servicio');
  const serviceButtons = document.querySelectorAll('.service-option');
  const driverInput = document.getElementById('conductor');
  const driverButtons = document.querySelectorAll('.driver-option');

  serviceButtons.forEach((button) => {
    if (button.classList.contains('driver-option')) {
      return;
    }

    button.addEventListener('click', () => {
      serviceButtons.forEach((item) => {
        if (!item.classList.contains('driver-option')) {
          item.classList.remove('is-active');
        }
      });
      button.classList.add('is-active');

      if (serviceInput) {
        serviceInput.value = button.dataset.serviceValue || '';
      }
    });
  });

  driverButtons.forEach((button) => {
    button.addEventListener('click', () => {
      driverButtons.forEach((item) => item.classList.remove('is-active'));
      button.classList.add('is-active');

      if (driverInput) {
        driverInput.value = button.dataset.driverValue || '';
      }
    });
  });
  if (phoneInput) {
    phoneInput.addEventListener('input', () => {
      validatePhone(phoneInput, phoneError);
    });
  }

  const form = document.getElementById('request-form');
  const feedback = document.getElementById('request-feedback');

  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();

      if (!validatePhone(phoneInput, phoneError)) {
        phoneInput.focus();
        return;
      }

      if (serviceInput && !serviceInput.value.trim()) {
        if (feedback) {
          feedback.textContent = 'Selecciona un tipo de servicio para continuar.';
          feedback.classList.remove('ok');
        }
        return;
      }

      if (driverInput && !driverInput.value.trim()) {
        if (feedback) {
          feedback.textContent = 'Selecciona un conductor para continuar.';
          feedback.classList.remove('ok');
        }
        return;
      }

      const formData = new FormData(form);
      const request = {
        id: Date.now(),
        servicio: String(formData.get('servicio') || ''),
        nombre: String(formData.get('nombre') || '').trim(),
        apellido: String(formData.get('apellido') || '').trim(),
        telefono: String(formData.get('telefono') || '').trim(),
        direccion: String(formData.get('direccion') || '').trim(),
        fecha: String(formData.get('fecha') || ''),
        hora: String(formData.get('hora') || ''),
        conductor: String(formData.get('conductor') || ''),
        latitud: String(formData.get('latitud') || ''),
        longitud: String(formData.get('longitud') || ''),
        createdAt: new Date().toISOString(),
      };

      const requests = getRequests();
      requests.push(request);
      saveRequests(requests);

      localStorage.setItem(STORAGE_PASSENGER_PROFILE, JSON.stringify({
        name: `${request.nombre} ${request.apellido}`.trim(),
        phone: request.telefono,
      }));

      refreshPassengerProfile();
      renderDriverRequests();

      form.reset();
      serviceButtons.forEach((item) => item.classList.remove('is-active'));
      driverButtons.forEach((item) => item.classList.remove('is-active'));
      if (serviceInput) {
        serviceInput.value = '';
      }
      if (driverInput) {
        driverInput.value = '';
      }
      if (feedback) {
        feedback.textContent = 'Solicitud enviada correctamente. El conductor la verá en su panel.';
        feedback.classList.add('ok');
      }
    });
  }

  document.getElementById('logout-passenger')?.addEventListener('click', logout);
  document.getElementById('logout-driver')?.addEventListener('click', logout);

  document.querySelectorAll('.wallet-topup-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const amount = Number(button.dataset.topupAmount || 0);
      if (!isFinite(amount) || amount <= 0) {
        return;
      }

      await topupDriverWallet(amount);
    });
  });

  document.getElementById('wallet-refresh-btn')?.addEventListener('click', async () => {
    await renderDriverWallet();
    const statusTarget = document.getElementById('driver-wallet-status');
    const walletState = getLocalDriverWallet();
    if (statusTarget && !walletState.movements.length) {
      statusTarget.textContent = 'Saldo actualizado.';
    }
  });

  tryStartFlow();
});
