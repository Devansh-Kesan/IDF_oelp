function closeRingIfNeeded(ring) {
  if (!ring.length) {
    return ring;
  }

  const [firstLon, firstLat] = ring[0];
  const [lastLon, lastLat] = ring[ring.length - 1];
  if (firstLon === lastLon && firstLat === lastLat) {
    return ring;
  }

  return [...ring, ring[0]];
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function pointInPolygon(point, polygonCoordinates) {
  const [outerRing, ...holes] = polygonCoordinates;
  if (!pointInRing(point, closeRingIfNeeded(outerRing))) {
    return false;
  }

  return !holes.some((hole) => pointInRing(point, closeRingIfNeeded(hole)));
}

function polygonArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

export function getPolygonFromFeature(feature) {
  const geometry = feature?.geometry;
  if (!geometry || !geometry.type || !geometry.coordinates) {
    return null;
  }

  if (geometry.type === "Polygon") {
    return geometry.coordinates;
  }

  if (geometry.type === "MultiPolygon") {
    if (!geometry.coordinates.length) {
      return null;
    }

    return geometry.coordinates
      .slice()
      .sort((a, b) => polygonArea(closeRingIfNeeded(b[0])) - polygonArea(closeRingIfNeeded(a[0])))[0];
  }

  return null;
}

export function generateGridPointsWithinPolygon(polygonCoordinates, gridStep) {
  const outerRing = closeRingIfNeeded(polygonCoordinates[0] || []);
  if (!outerRing.length) {
    return [];
  }

  const longitudes = outerRing.map(([lon]) => lon);
  const latitudes = outerRing.map(([, lat]) => lat);

  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);

  const points = [];
  const epsilon = 1e-9;

  for (let lat = minLat; lat <= maxLat + epsilon; lat += gridStep) {
    for (let lon = minLon; lon <= maxLon + epsilon; lon += gridStep) {
      const candidate = [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
      if (pointInPolygon(candidate, polygonCoordinates)) {
        points.push({
          longitude: candidate[0],
          latitude: candidate[1]
        });
      }
    }
  }

  return points;
}

export function toLeafletLatLngPath(polygonCoordinates) {
  const outerRing = closeRingIfNeeded(polygonCoordinates[0] || []);
  return outerRing.map(([lon, lat]) => [lat, lon]);
}
