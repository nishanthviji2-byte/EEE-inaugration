const locateBtn = document.getElementById('locateBtn');
const searchForm = document.getElementById('searchForm');
const placeInput = document.getElementById('placeInput');
const stationList = document.getElementById('stationList');
const statusMessage = document.getElementById('statusMessage');
const stationCount = document.getElementById('stationCount');

const state = {
  map: null,
  userMarker: null,
  stationLayer: null,
  userLocation: null,
  stations: [],
};

function setStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`;
}

function initializeMap() {
  if (state.map) return;

  state.map = L.map('map', { zoomControl: true }).setView([20.5937, 78.9629], 5);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(state.map);

  state.stationLayer = L.layerGroup().addTo(state.map);
}

function createUserMarker(lat, lng) {
  if (state.userMarker) {
    state.userMarker.setLatLng([lat, lng]);
    return;
  }

  const markerIcon = L.divIcon({
    className: 'user-marker',
    html: '<span>YOU</span>',
    iconSize: [40, 20],
    iconAnchor: [20, 10],
  });

  state.userMarker = L.marker([lat, lng], { icon: markerIcon }).addTo(state.map);
  state.userMarker.bindPopup('Your location');
}

function formatDistance(distanceKm) {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function renderStations(stations) {
  stationList.innerHTML = '';
  stationCount.textContent = String(stations.length);

  if (!stations.length) {
    stationList.innerHTML = '<li class="empty-state">No charging stations found nearby.</li>';
    return;
  }

  state.stationLayer.clearLayers();

  stations.forEach((station) => {
    const listItem = document.createElement('li');
    listItem.className = 'station-item';

    listItem.innerHTML = `
      <div class="station-header">
        <strong>${station.name}</strong>
        <span class="distance">${station.distanceText}</span>
      </div>
      <div class="station-meta">
        <span>${station.type}</span>
        <span>${station.status}</span>
      </div>
      <a
        class="station-link"
        href="${station.directionsUrl}"
        target="_blank"
        rel="noopener noreferrer"
      >
        Get directions →
      </a>
    `;

    stationList.appendChild(listItem);

    const marker = L.marker([station.lat, station.lng]).addTo(state.stationLayer);
    marker.bindPopup(`
      <strong>${station.name}</strong><br>
      ${station.distanceText}<br>
      ${station.type}
    `);
  });
}

async function fetchNearbyStations(lat, lng, radiusMeters = 5000) {
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"="charging_station"](around:${radiusMeters},${lat},${lng});
      way["amenity"="charging_station"](around:${radiusMeters},${lat},${lng});
      relation["amenity"="charging_station"](around:${radiusMeters},${lat},${lng});
      node["charging_station"="yes"](around:${radiusMeters},${lat},${lng});
      node["power"="station"](around:${radiusMeters},${lat},${lng});
    );
    out center;
  `;

  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Charging station service is unavailable right now.');
  }

  const data = await response.json();

  const stations = data.elements
    .map((element) => {
      const latValue = element.lat ?? element.center?.lat;
      const lonValue = element.lon ?? element.center?.lon;

      if (!latValue || !lonValue) return null;

      const distanceKm = haversineDistanceKm(lat, lng, latValue, lonValue);

      return {
        lat: latValue,
        lng: lonValue,
        name: element.tags?.name || 'Charging station',
        type: element.tags?.['charge:output'] ? 'Fast charging' : 'EV charging',
        status: element.tags?.access === 'private' ? 'Private access' : 'Public access',
        distanceKm,
        distanceText: formatDistance(distanceKm),
        directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${latValue},${lonValue}`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 15);

  return stations;
}

async function updateLocation(lat, lng, label = 'Your location') {
  state.userLocation = { lat, lng, label };
  initializeMap();
  state.map.setView([lat, lng], 13);
  createUserMarker(lat, lng);
  state.userMarker.bindPopup(label);

  setStatus('Searching for nearby charging stations...', 'info');

  try {
    const stations = await fetchNearbyStations(lat, lng);
    state.stations = stations;
    renderStations(stations);
    setStatus(`Found ${stations.length} charging station${stations.length === 1 ? '' : 's'} near you.`, 'success');
  } catch (error) {
    setStatus(error.message || 'Unable to find charging stations.', 'error');
    stationCount.textContent = '0';
    stationList.innerHTML = '<li class="empty-state">No stations available for this area.</li>';
  }
}

function getCurrentLocation() {
  if (!navigator.geolocation) {
    setStatus('Geolocation is not supported by this browser.', 'error');
    return;
  }

  setStatus('Requesting your location...', 'info');

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      updateLocation(latitude, longitude, 'Your location');
    },
    (error) => {
      let message = 'Location access was denied. You can search for a place instead.';
      if (error.code === error.PERMISSION_DENIED) {
        message = 'Location access was denied. Try searching for a nearby city or address.';
      }
      setStatus(message, 'error');
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    }
  );
}

async function searchLocationByName(query) {
  const safeQuery = query.trim();
  if (!safeQuery) {
    setStatus('Please enter a city or address.', 'error');
    return;
  }

  setStatus(`Looking up ${safeQuery}...`, 'info');

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(safeQuery)}`;
    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'en',
      },
    });

    if (!response.ok) {
      throw new Error('Unable to determine that location.');
    }

    const results = await response.json();
    if (!results.length) {
      throw new Error('No matching location was found. Try a broader search.');
    }

    const { lat, lon, display_name } = results[0];
    updateLocation(Number(lat), Number(lon), display_name);
  } catch (error) {
    setStatus(error.message || 'Location lookup failed.', 'error');
  }
}

locateBtn.addEventListener('click', getCurrentLocation);

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  searchLocationByName(placeInput.value);
});

initializeMap();
setStatus('Allow location access to find charging stations near you.', 'info');
