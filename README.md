# IIT Palakkad OELP - IDF Frontend

React frontend for generating and visualizing IDF curves for precipitation data across India.

## Features Implemented

- Professional UI tailored for IIT Palakkad OELP portal.
- India map-based coordinate selection with grid snapping (`0.25 x 0.25` degree).
- Manual latitude/longitude input (alternative to map click).
- Model dropdown with dynamic scenario options:
  - If model supports only historical, scenario is locked to `historical`.
  - If model supports future scenarios, user can choose `historical` or SSP options.
- Bias-correction historical year-range controls.
- IDF chart visualization panel.
- Backend-ready API service layer with fallback sample response.

## Quick Start

1. Install Node.js (LTS 18+ recommended).
2. Install dependencies:
   - `npm install`
3. Configure environment:
   - `cp .env.example .env`
   - Update `VITE_API_BASE_URL` if needed.
4. Start app:
   - `npm run dev`

## Backend Integration Contract

Frontend sends this payload to:

- `POST /idf/generate`

Payload shape:

```json
{
  "coordinate": {
    "latitude": 10.25,
    "longitude": 76.5
  },
  "model": "cmip6-mpi-esm",
  "scenario": "ssp120",
  "biasCorrection": {
    "historicalRange": {
      "from": 1981,
      "to": 2010
    }
  }
}
```

Expected response shape:

```json
{
  "durations": [1, 3, 6, 12, 24],
  "intensities": [112, 84, 66, 42, 26],
  "meta": {
    "source": "backend"
  }
}
```

The API client is at `src/services/apiClient.js`, which can be extended for authentication, retries, and additional endpoints.
