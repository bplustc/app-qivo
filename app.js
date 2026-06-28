const STORAGE_SESSION = 'qivo_session_mode';
const STORAGE_REQUESTS = 'qivo_requests';
const STORAGE_PASSENGER_PROFILE = 'qivo_passenger_profile';

let qivoMapInstance = null;
let qivoMapMarker = null;
let qivoAutocomplete = null;
let qivoTypingTimer = null;

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
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.toggle('is-active', screen.id === screenId);
  });
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
}

function setMode(mode) {
  localStorage.setItem(STORAGE_SESSION, mode);

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
    return;
  }

  localStorage.removeItem(STORAGE_SESSION);
  setActiveScreen('auth-view');
}

function logout() {
  localStorage.removeItem(STORAGE_SESSION);
  setActiveScreen('auth-view');
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

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

document.addEventListener('DOMContentLoaded', () => {
  registerServiceWorker();

  document.querySelectorAll('[data-enter-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.enterMode;
      setMode(mode);
    });
  });

  document.querySelectorAll('[data-switch-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.switchMode;
      setMode(mode);
    });
  });

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
      if (feedback) {
        feedback.textContent = 'Solicitud enviada correctamente. El conductor la verá en su panel.';
        feedback.classList.add('ok');
      }
    });
  }

  document.getElementById('logout-passenger')?.addEventListener('click', logout);
  document.getElementById('logout-driver')?.addEventListener('click', logout);

  const savedMode = localStorage.getItem(STORAGE_SESSION);
  if (savedMode === 'passenger' || savedMode === 'driver') {
    setMode(savedMode);
  } else {
    setActiveScreen('auth-view');
  }
});
