import { useEffect, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Marker, Polygon, TileLayer, useMapEvents } from "react-leaflet";
import indiaBoundaryGeoJsonUrl from "../assets/India_bnd.geojson?url";

const INDIA_VIEW_BOUNDS = [
  [5.0, 66.0],
  [39.5, 100.0]
];
const INDIA_MAX_BOUNDS = [
  [2.5, 60.0],
  [41.5, 103.5]
];

function MapClickHandler({ onCoordinateSelect }) {
  useMapEvents({
    click(event) {
      const { lat, lng } = event.latlng;
      onCoordinateSelect(lat, lng);
    }
  });

  return null;
}

export default function MapSelector({
  latitude,
  longitude,
  onCoordinateSelect,
  polygonPath = [],
  gridPoints = []
}) {
  const [indiaBoundaryGeoJson, setIndiaBoundaryGeoJson] = useState(null);
  const hasSelectedPoint =
    typeof latitude === "number" &&
    !Number.isNaN(latitude) &&
    typeof longitude === "number" &&
    !Number.isNaN(longitude);

  useEffect(() => {
    let isMounted = true;

    async function loadBoundary() {
      try {
        const response = await fetch(indiaBoundaryGeoJsonUrl);
        if (!response.ok) {
          return;
        }
        const parsed = await response.json();
        if (isMounted) {
          setIndiaBoundaryGeoJson(parsed);
        }
      } catch {
        // Keep map interactive even if boundary layer fails to load.
      }
    }

    loadBoundary();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section className="card map-card">
      <div className="card-header">
        <h2>🗺️ Spatial Grid Canvas</h2>
        <p>Click or tap any point on the map to lock the exact coordinate. Your selection will update in real-time.</p>
      </div>
      <MapContainer
        bounds={INDIA_VIEW_BOUNDS}
        boundsOptions={{ padding: [26, 26] }}
        maxBounds={INDIA_MAX_BOUNDS}
        maxBoundsViscosity={0.75}
        zoomSnap={0.1}
        minZoom={3}
        maxZoom={22}
        className="india-map"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={22}         // allows extreme zoom
          maxNativeZoom={19}
        />
        {indiaBoundaryGeoJson && (
          <GeoJSON
            data={indiaBoundaryGeoJson}
            style={() => ({
              color: "#111827",
              weight: 2.2,
              fillOpacity: 0
            })}
          />
        )}
        <MapClickHandler onCoordinateSelect={onCoordinateSelect} />
        {polygonPath.length > 2 && (
          <Polygon
            positions={polygonPath}
            pathOptions={{
              color: "#00d4ff",
              weight: 2,
              fillColor: "#00d4ff",
              fillOpacity: 0.12
            }}
          />
        )}
        {gridPoints.map((point) => (
          <CircleMarker
            key={`${point.latitude}-${point.longitude}`}
            center={[point.latitude, point.longitude]}
            radius={4}
            pathOptions={{
              color: "#ff006e",
              fillColor: "#ff006e",
              fillOpacity: 0.85,
              weight: 1
            }}
          />
        ))}
        {hasSelectedPoint && <Marker position={[latitude, longitude]} />}
      </MapContainer>
    </section>
  );
}
