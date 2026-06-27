let qivoMapInstance = null;
let qivoMapMarker = null;
let qivoMapGeocoder = null;
let qivoAutocomplete = null;
let qivoTypingGeocodeTimer = null;

function setMapCoordinates(latLng, direccionInput, latitudInput, longitudInput) {
    if (!latLng) {
        return;
    }

    latitudInput.value = String(latLng.lat());
    longitudInput.value = String(latLng.lng());

    if (qivoMapMarker) {
        qivoMapMarker.setPosition(latLng);
    }
}

function reverseGeocodeAddress(latLng, direccionInput) {
    if (!qivoMapGeocoder || !latLng || !direccionInput) {
        return;
    }

    qivoMapGeocoder.geocode({ location: latLng }, function(results, status) {
        if (status === 'OK' && Array.isArray(results) && results[0]) {
            direccionInput.value = results[0].formatted_address;
        }
    });
}

window.initQivoMap = function() {
    const mapContainer = document.getElementById('qivo-map');
    const direccionInput = document.getElementById('direccion');
    const latitudInput = document.getElementById('latitud');
    const longitudInput = document.getElementById('longitud');

    if (!mapContainer || !direccionInput || !latitudInput || !longitudInput || !window.google || !window.google.maps) {
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
        title: 'Punto de retiro',
    });

    qivoMapGeocoder = new window.google.maps.Geocoder();
    setMapCoordinates(qivoMapMarker.getPosition(), direccionInput, latitudInput, longitudInput);

    qivoMapInstance.addListener('click', function(event) {
        if (!event.latLng) {
            return;
        }

        setMapCoordinates(event.latLng, direccionInput, latitudInput, longitudInput);
        reverseGeocodeAddress(event.latLng, direccionInput);
    });

    qivoMapMarker.addListener('dragend', function(event) {
        if (!event.latLng) {
            return;
        }

        setMapCoordinates(event.latLng, direccionInput, latitudInput, longitudInput);
        reverseGeocodeAddress(event.latLng, direccionInput);
    });

    qivoAutocomplete = new window.google.maps.places.Autocomplete(direccionInput, {
        fields: ['formatted_address', 'geometry', 'name'],
        componentRestrictions: { country: 'ec' },
    });

    qivoAutocomplete.addListener('place_changed', function() {
        const place = qivoAutocomplete.getPlace();

        if (!place || !place.geometry || !place.geometry.location) {
            return;
        }

        const location = place.geometry.location;
        qivoMapInstance.setCenter(location);
        qivoMapInstance.setZoom(16);
        setMapCoordinates(location, direccionInput, latitudInput, longitudInput);

        if (place.formatted_address) {
            direccionInput.value = place.formatted_address;
        }
    });

    direccionInput.addEventListener('input', function() {
        const query = direccionInput.value.trim();

        if (qivoTypingGeocodeTimer) {
            clearTimeout(qivoTypingGeocodeTimer);
        }

        if (query.length < 5) {
            return;
        }

        qivoTypingGeocodeTimer = setTimeout(function() {
            if (!qivoMapGeocoder) {
                return;
            }

            qivoMapGeocoder.geocode(
                {
                    address: query,
                    componentRestrictions: { country: 'EC' },
                },
                function(results, status) {
                    if (status !== 'OK' || !Array.isArray(results) || !results[0] || !results[0].geometry || !results[0].geometry.location) {
                        return;
                    }

                    const location = results[0].geometry.location;
                    qivoMapInstance.setCenter(location);
                    qivoMapInstance.setZoom(16);
                    setMapCoordinates(location, direccionInput, latitudInput, longitudInput);
                }
            );
        }, 500);
    });

    window.qivoRefreshMap = function() {
        if (!qivoMapInstance || !qivoMapMarker) {
            return;
        }

        window.google.maps.event.trigger(qivoMapInstance, 'resize');
        qivoMapInstance.setCenter(qivoMapMarker.getPosition());
    };
};

document.addEventListener('DOMContentLoaded', function() {
    // Selección de tarjetas y modal
    const serviceCards = document.querySelectorAll('.service-card');
    const modal = document.getElementById('modal-solicitud');
    const closeModal = document.querySelector('.close-modal');
    const telefonoInput = document.getElementById('telefono');

    if (telefonoInput) {
        telefonoInput.addEventListener('input', function() {
            const digitsOnly = telefonoInput.value.replace(/\D/g, '').slice(0, 10);
            telefonoInput.value = digitsOnly;
        });
    }

    // Mostrar modal al hacer clic en una tarjeta
    // --- Personalización de label de dirección según servicio ---
    const direccionLabel = document.querySelector('label[for="direccion"]');
    const direccionInput = document.getElementById('direccion');
    let servicioActual = '';
    serviceCards.forEach(card => {
        card.addEventListener('click', () => {
            // Detectar tipo de servicio
            const esAeropuertoVuelta = card.classList.contains('aeropuerto-vuelta');
            servicioActual = esAeropuertoVuelta ? 'aeropuerto-vuelta' : 'otro';
            if (direccionLabel) {
                if (esAeropuertoVuelta) {
                    direccionLabel.textContent = 'Dirección Destino';
                    if (direccionInput) direccionInput.placeholder = 'Dirección Destino';
                } else {
                    direccionLabel.textContent = 'Dirección de Recogida';
                    if (direccionInput) direccionInput.placeholder = 'Dirección de Recogida';
                }
            }
            if (modal) {
                modal.classList.add('active');
                modal.style.display = 'flex';
                document.body.style.overflow = 'hidden';
                if (typeof window.qivoRefreshMap === 'function') {
                    setTimeout(function() {
                        window.qivoRefreshMap();
                    }, 120);
                }
            }
        });
    });

    // Cerrar modal
    if (closeModal) {
        closeModal.addEventListener('click', () => {
            if (modal) {
                modal.classList.remove('active');
                modal.style.display = 'none';
                document.body.style.overflow = '';
            }
        });
    }

    // Cerrar modal al hacer clic fuera del contenido
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.classList.remove('active');
                modal.style.display = 'none';
                document.body.style.overflow = '';
            }
        });
    }

    // Cerrar modal con Escape
    window.addEventListener('keydown', function(e) {
        if (modal && e.key === 'Escape' && modal.classList.contains('active')) {
            modal.classList.remove('active');
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    });

    // --- Mostrar información del vehículo según conductor ---
    const selectConductor = document.getElementById('conductor');
    const infoVehiculo = document.getElementById('info-vehiculo');
    // Datos de vehículos por conductor
    const vehiculos = {
        'Ramon Bolivar': {
            Placa: 'PDQ-1328',
            Modelo: 'Chevrolet Beat',
            Color: 'Plateado',
            Whatsapp: '593999893971'
        },
        'Jesus Reyes': {
            Placa: 'GCT-3331',
            Modelo: 'Chevrolet Beat',
            Color: 'Rojo',
            Whatsapp: '593984940957'
        }
    };

    if (selectConductor && infoVehiculo) {
        selectConductor.addEventListener('change', function() {
            const value = selectConductor.value;
            if (vehiculos[value]) {
                infoVehiculo.innerHTML =
                    `<strong>Información de Vehículo:</strong><br><br>` +
                    `<strong>Placa:</strong> ${vehiculos[value].Placa}<br>` +
                    `<strong>Modelo:</strong> ${vehiculos[value].Modelo}<br>` +
                    `<strong>Color:</strong> ${vehiculos[value].Color}`;
                infoVehiculo.style.display = 'block';
            } else {
                infoVehiculo.innerHTML = '';
                infoVehiculo.style.display = 'none';
            }
        });
    }

    // --- Enviar datos a WhatsApp ---
    const formSolicitud = document.getElementById('form-solicitud');
    const latitudInput = document.getElementById('latitud');
    const longitudInput = document.getElementById('longitud');
    if (formSolicitud) {
        formSolicitud.addEventListener('submit', function(e) {
            e.preventDefault();
            const nombre = document.getElementById('nombre').value;
            const apellido = document.getElementById('apellido').value;
            const telefono = document.getElementById('telefono').value;
            const correo = document.getElementById('correo').value;
            const direccion = document.getElementById('direccion').value;
            const fecha = document.getElementById('fecha').value;
            const hora = document.getElementById('hora').value;
            const conductor = selectConductor.value;
            const latitud = latitudInput ? latitudInput.value : '';
            const longitud = longitudInput ? longitudInput.value : '';
            const vehiculo = vehiculos[conductor];

            if (!/^\d{10}$/.test(telefono)) {
                alert('El teléfono debe tener exactamente 10 dígitos numéricos.');
                return;
            }

            if (!vehiculo) {
                alert('Selecciona un conductor válido.');
                return;
            }
            // Mensaje para WhatsApp
            let direccionLabelTexto = 'Dirección de recogida';
            if (servicioActual === 'aeropuerto-vuelta') {
                direccionLabelTexto = 'Dirección destino';
            }
            const mensaje =
                `*Solicitud de viaje Qivo*%0A` +
                `Nombre: ${nombre} ${apellido}%0A` +
                `Teléfono: ${telefono}%0A` +
                `Correo: ${correo}%0A` +
                `${direccionLabelTexto}: ${direccion}%0A` +
                `Ubicación GPS: ${latitud && longitud ? `${latitud}, ${longitud}` : 'No seleccionada'}%0A` +
                `Fecha: ${fecha}%0A` +
                `Hora: ${hora}%0A` +
                `Conductor: ${conductor}%0A` +
                `Vehículo: ${vehiculo.Modelo} (${vehiculo.Placa}, ${vehiculo.Color})`;
            const url = `https://wa.me/${vehiculo.Whatsapp}?text=${mensaje}`;
            window.open(url, '_blank');
            // Limpiar formulario y ocultar info vehículo
            formSolicitud.reset();
            if (direccionLabel) {
                direccionLabel.textContent = 'Dirección de Recogida';
                if (direccionInput) direccionInput.placeholder = 'Dirección de Recogida';
            }
            servicioActual = '';
            if (infoVehiculo) {
                infoVehiculo.innerHTML = '';
                infoVehiculo.style.display = 'none';
            }

            if (latitudInput) {
                latitudInput.value = '';
            }

            if (longitudInput) {
                longitudInput.value = '';
            }
        });
    }
    console.log('APP Qivo cargada');
});