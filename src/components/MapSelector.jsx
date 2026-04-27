import { CircleMarker, MapContainer, Marker, Polygon, TileLayer, useMapEvents } from "react-leaflet";

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
  const hasSelectedPoint =
    typeof latitude === "number" &&
    !Number.isNaN(latitude) &&
    typeof longitude === "number" &&
    !Number.isNaN(longitude);

  return (
    <section className="card map-card">
      <div className="card-header">
        <h2>🗺️ Spatial Grid Canvas</h2>
        <p>Click or tap any point on the map to lock the exact coordinate. Your selection will update in real-time.</p>
      </div>
      <MapContainer
        center={[23.6, 80]}
        zoom={4.4}
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
