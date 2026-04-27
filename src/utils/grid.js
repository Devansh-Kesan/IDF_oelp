const GRID_STEP = 0.25;

export function snapToGrid(value, step = GRID_STEP) {
  const offset = step / 2;
  return Number((Math.round((value - offset) / step) * step + offset).toFixed(3));
}

export function isCoordinateInsideIndiaBounds(lat, lon) {
  // Coarse envelope for mainland + islands coverage, including northern Kashmir extent.
  return lat >= 5 && lat <= 39.5 && lon >= 66 && lon <= 100;
}

export function normalizeCoordinates(lat, lon) {
  const snappedLat = snapToGrid(Number(lat));
  const snappedLon = snapToGrid(Number(lon));

  return {
    latitude: snappedLat,
    longitude: snappedLon
  };
}

export function parseCoordinateInput(value) {
  const asNumber = Number(value);
  if (Number.isNaN(asNumber)) {
    return null;
  }
  return asNumber;
}
