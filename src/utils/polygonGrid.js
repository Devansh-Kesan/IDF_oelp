import { snapToGrid } from "./grid";

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

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function toLocalKm(point, referenceLat) {
  const [lon, lat] = point;
  const latScale = 111.32;
  const lonScale = 111.32 * Math.cos(toRadians(referenceLat));
  return {
    x: lon * lonScale,
    y: lat * latScale
  };
}

function distancePointToSegmentKm(point, segmentStart, segmentEnd, referenceLat) {
  const p = toLocalKm(point, referenceLat);
  const a = toLocalKm(segmentStart, referenceLat);
  const b = toLocalKm(segmentEnd, referenceLat);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denominator = dx * dx + dy * dy;

  if (denominator <= Number.EPSILON) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }

  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / denominator;
  const clampedT = Math.max(0, Math.min(1, t));
  const projectionX = a.x + clampedT * dx;
  const projectionY = a.y + clampedT * dy;
  return Math.hypot(p.x - projectionX, p.y - projectionY);
}

function distancePointToPolygonBoundaryKm(point, polygonCoordinates) {
  const rings = (polygonCoordinates || []).map((ring) => closeRingIfNeeded(ring || []));
  const validRings = rings.filter((ring) => ring.length >= 2);
  if (!validRings.length) {
    return Number.POSITIVE_INFINITY;
  }

  const referenceLat = point[1];
  let minimumDistance = Number.POSITIVE_INFINITY;

  validRings.forEach((ring) => {
    for (let index = 0; index < ring.length - 1; index += 1) {
      const distance = distancePointToSegmentKm(point, ring[index], ring[index + 1], referenceLat);
      if (distance < minimumDistance) {
        minimumDistance = distance;
      }
    }
  });

  return minimumDistance;
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

export function generateGridPointsWithinPolygon(polygonCoordinates, gridStep, bufferKm = 0) {
  const outerRing = closeRingIfNeeded(polygonCoordinates[0] || []);
  if (!outerRing.length) {
    return [];
  }

  const longitudes = outerRing.map(([lon]) => lon);
  const latitudes = outerRing.map(([, lat]) => lat);

  const ringMinLon = Math.min(...longitudes);
  const ringMaxLon = Math.max(...longitudes);
  const ringMinLat = Math.min(...latitudes);
  const ringMaxLat = Math.max(...latitudes);
  const normalizedBufferKm = Math.max(0, Number(bufferKm) || 0);
  const meanLat = (ringMinLat + ringMaxLat) / 2;
  const latBufferDegrees = normalizedBufferKm / 111.32;
  const lonBufferDenominator = 111.32 * Math.max(Math.cos(toRadians(meanLat)), 0.2);
  const lonBufferDegrees = normalizedBufferKm / lonBufferDenominator;
  const minLon = ringMinLon - lonBufferDegrees;
  const maxLon = ringMaxLon + lonBufferDegrees;
  const minLat = ringMinLat - latBufferDegrees;
  const maxLat = ringMaxLat + latBufferDegrees;

  const points = [];
  const epsilon = 1e-9;
  const offset = gridStep / 2;

  // Align scan to the canonical grid centers:
  // ... 0.125, 0.375, 0.625, 0.875 for step=0.25
  const alignedStart = (value) => {
    const snapped = snapToGrid(value, gridStep);
    if (snapped + epsilon < value) {
      return Number((snapped + gridStep).toFixed(3));
    }
    return Number(snapped.toFixed(3));
  };

  const alignedEnd = (value) => {
    const snapped = snapToGrid(value, gridStep);
    if (snapped - epsilon > value) {
      return Number((snapped - gridStep).toFixed(3));
    }
    return Number(snapped.toFixed(3));
  };

  // Fallback-safe alignment using arithmetic if needed.
  const startLat = Number(
    (Math.max(alignedStart(minLat), Math.ceil((minLat - offset) / gridStep) * gridStep + offset)).toFixed(3)
  );
  const endLat = Number(
    (Math.min(alignedEnd(maxLat), Math.floor((maxLat - offset) / gridStep) * gridStep + offset)).toFixed(3)
  );
  const startLon = Number(
    (Math.max(alignedStart(minLon), Math.ceil((minLon - offset) / gridStep) * gridStep + offset)).toFixed(3)
  );
  const endLon = Number(
    (Math.min(alignedEnd(maxLon), Math.floor((maxLon - offset) / gridStep) * gridStep + offset)).toFixed(3)
  );

  for (let lat = startLat; lat <= endLat + epsilon; lat += gridStep) {
    for (let lon = startLon; lon <= endLon + epsilon; lon += gridStep) {
      const candidate = [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
      const isInsidePolygon = pointInPolygon(candidate, polygonCoordinates);
      const isWithinBuffer =
        !isInsidePolygon &&
        normalizedBufferKm > 0 &&
        distancePointToPolygonBoundaryKm(candidate, polygonCoordinates) <= normalizedBufferKm;

      if (isInsidePolygon || isWithinBuffer) {
        points.push({
          longitude: Number(candidate[0].toFixed(3)),
          latitude: Number(candidate[1].toFixed(3)),
          isBufferPoint: isWithinBuffer
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
