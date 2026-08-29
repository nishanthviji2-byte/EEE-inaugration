# ChargeFinder

A lightweight web app that:

- requests the user's current location with browser geolocation
- searches for nearby EV charging stations using OpenStreetMap's Overpass API
- shows the results on a map and in a list
- allows searching for another city or address manually

## Run locally

From this folder, start a simple local server:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Notes

- The app uses browser geolocation, so permission is required when the user clicks "Use my location".
- Search and charging station data depend on OpenStreetMap and Overpass services.
