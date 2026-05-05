import { useEffect, useState } from "react";
import MapSelector from "./components/MapSelector";
import IdfChartPanel from "./components/IdfChartPanel";
import iitPalakkadLogo from "./assets/IIT_PKD_logo.png";
import {
  DEFAULT_HISTORICAL_RANGE,
  DEFAULT_FUTURE_GCM_RANGE,
  DEFAULT_MODEL_ID,
  FUTURE_GCM_RANGE_LIMITS,
  HISTORICAL_RANGE_LIMITS,
  MODEL_OPTIONS
} from "./config/models";
import {
  generateIdfCurve,
  generateShapeIdfCurve,
  getAvailableModels,
  getObservedDataForShape
} from "./services/apiClient";
import { isCoordinateInsideIndiaBounds, normalizeCoordinates, parseCoordinateInput } from "./utils/grid";
import {
  generateGridPointsWithinPolygon,
  getPolygonFromFeature,
  toLeafletLatLngPath
} from "./utils/polygonGrid";

const DEFAULT_SCENARIOS = ["historical", "ssp126", "ssp245", "ssp370", "ssp585"];
const POLYGON_GRID_STEP = 0.25;

function formatCoordinateForInput(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "";
  }

  const fixed = numericValue.toFixed(6);
  return fixed.replace(/\.?0+$/, "");
}

function App() {
  const [latitude, setLatitude] = useState(22.5);
  const [longitude, setLongitude] = useState(78.75);
  const [theme, setTheme] = useState("dark");
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [modelOptions, setModelOptions] = useState(MODEL_OPTIONS);
  const [scenario, setScenario] = useState("historical");
  const [historicalFrom, setHistoricalFrom] = useState(DEFAULT_HISTORICAL_RANGE.from);
  const [historicalTo, setHistoricalTo] = useState(DEFAULT_HISTORICAL_RANGE.to);
  const [futureFrom, setFutureFrom] = useState(DEFAULT_FUTURE_GCM_RANGE.from);
  const [futureTo, setFutureTo] = useState(DEFAULT_FUTURE_GCM_RANGE.to);
  const [idfData, setIdfData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [coordinateError, setCoordinateError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [coordinateTab, setCoordinateTab] = useState("manual");
  const [latitudeInput, setLatitudeInput] = useState("22.5000");
  const [longitudeInput, setLongitudeInput] = useState("78.7500");
  const [polygonPath, setPolygonPath] = useState([]);
  const [polygonGridPoints, setPolygonGridPoints] = useState([]);
  const [shapeError, setShapeError] = useState("");
  const [shapeSuccess, setShapeSuccess] = useState("");
  const [isShapeDownloadLoading, setIsShapeDownloadLoading] = useState(false);

  const availableScenarios =
    modelOptions.find((option) => option.id === modelId)?.scenarios || ["historical"];
  const isObservedModel = modelId === "imd" || modelId === "imdaa";
  const rangeMin = HISTORICAL_RANGE_LIMITS.min;
  const rangeMax = HISTORICAL_RANGE_LIMITS.max;
  const rangeSpread = Math.max(1, rangeMax - rangeMin);
  const fromPercent = ((historicalFrom - rangeMin) / rangeSpread) * 100;
  const toPercent = ((historicalTo - rangeMin) / rangeSpread) * 100;

  const futureRangeMin = FUTURE_GCM_RANGE_LIMITS.min;
  const futureRangeMax = FUTURE_GCM_RANGE_LIMITS.max;
  const futureRangeSpread = Math.max(1, futureRangeMax - futureRangeMin);
  const futureFromPercent = ((futureFrom - futureRangeMin) / futureRangeSpread) * 100;
  const futureToPercent = ((futureTo - futureRangeMin) / futureRangeSpread) * 100;
  const isFutureScenario = scenario !== "historical";
  function handleModelChange(nextModelId) {
    setModelId(nextModelId);
    const nextModel = modelOptions.find((option) => option.id === nextModelId);
    if (!nextModel) {
      return;
    }

    if (!nextModel.scenarios.includes(scenario)) {
      setScenario(nextModel.scenarios[0]);
    }
  }

  useEffect(() => {
    setIdfData(null);
  }, [coordinateTab]);

  useEffect(() => {
    async function loadModels() {
      try {
        const backendModels = await getAvailableModels();
        if (!backendModels.length) {
          return;
        }

        const mappedBackendOptions = backendModels.map((backendModel) => {
          const localMatch = MODEL_OPTIONS.find((option) => option.backendModel === backendModel);
          if (localMatch) {
            return localMatch;
          }

          return {
            id: backendModel,
            label: backendModel,
            backendModel,
            scenarios: DEFAULT_SCENARIOS
          };
        });

        const localOnlyOptions = MODEL_OPTIONS.filter(
          (option) => !mappedBackendOptions.some((mappedOption) => mappedOption.id === option.id)
        );
        const mergedOptions = [...localOnlyOptions, ...mappedBackendOptions];

        setModelOptions(mergedOptions);

        const hasCurrentModel = mergedOptions.some((option) => option.id === modelId);
        if (!hasCurrentModel) {
          setModelId(mergedOptions[0].id);
          setScenario(mergedOptions[0].scenarios[0] || "historical");
        }
      } catch {
        // Keep static model list as fallback when model discovery fails.
      }
    }

    loadModels();
  }, []);

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    setLatitudeInput(formatCoordinateForInput(latitude));
    setLongitudeInput(formatCoordinateForInput(longitude));
  }, [latitude, longitude]);

  function handleCoordinateSelect(nextLatitude, nextLongitude) {
    setLatitude(nextLatitude);
    setLongitude(nextLongitude);
    setCoordinateError("");
  }

  function handleCoordinateInputChange(type, value) {
    if (type === "lat") {
      setLatitudeInput(value);
    } else {
      setLongitudeInput(value);
    }
  }

  function finalizeCoordinateInput(type) {
    const rawValue = type === "lat" ? latitudeInput : longitudeInput;
    const parsed = parseCoordinateInput(rawValue);
    if (parsed === null) {
      setCoordinateError("Latitude/Longitude must be valid numbers.");
      setLatitudeInput(formatCoordinateForInput(latitude));
      setLongitudeInput(formatCoordinateForInput(longitude));
      return;
    }

    if (type === "lat") {
      setLatitude(parsed);
      setLatitudeInput(formatCoordinateForInput(parsed));
    } else {
      setLongitude(parsed);
      setLongitudeInput(formatCoordinateForInput(parsed));
    }
    setCoordinateError("");
  }

  async function handleShapeZipUpload(file) {
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      setShapeError("Please upload a zipped shapefile (.zip).");
      setShapeSuccess("");
      return;
    }

    setShapeError("");
    setShapeSuccess("Processing shapefile...");

    try {
      if (!window.shp) {
        throw new Error("Shapefile parser is not loaded. Please refresh and try again.");
      }

      const buffer = await file.arrayBuffer();
      const parsed = await window.shp(buffer);

      const collections = Array.isArray(parsed) ? parsed : [parsed];
      const allFeatures = collections.flatMap((collection) => collection?.features || []);

      const polygonFeature = allFeatures.find((feature) => {
        const type = feature?.geometry?.type;
        return type === "Polygon" || type === "MultiPolygon";
      });

      if (!polygonFeature) {
        throw new Error("No Polygon/MultiPolygon found in the uploaded shapefile.");
      }

      const polygonCoordinates = getPolygonFromFeature(polygonFeature);
      if (!polygonCoordinates) {
        throw new Error("Uploaded polygon geometry could not be parsed.");
      }

      const nextPolygonPath = toLeafletLatLngPath(polygonCoordinates);
      const nextGridPoints = generateGridPointsWithinPolygon(polygonCoordinates, POLYGON_GRID_STEP);

      if (!nextGridPoints.length) {
        throw new Error("No grid points were found inside polygon. Try a smaller grid scale.");
      }

      setPolygonPath(nextPolygonPath);
      setPolygonGridPoints(nextGridPoints);
      setLatitude(nextGridPoints[0].latitude);
      setLongitude(nextGridPoints[0].longitude);
      setShapeSuccess(`Polygon loaded. Selected ${nextGridPoints.length} grid points.`);
      setShapeError("");
    } catch (error) {
      setShapeSuccess("");
      setShapeError(error?.message || "Failed to process shapefile.");
      setPolygonPath([]);
      setPolygonGridPoints([]);
    }
  }

  function handleHistoricalFromChange(value) {
    const nextFrom = Math.max(rangeMin, Math.min(Number(value), historicalTo));
    setHistoricalFrom(nextFrom);
  }

  function handleHistoricalToChange(value) {
    const nextTo = Math.min(rangeMax, Math.max(Number(value), historicalFrom));
    setHistoricalTo(nextTo);
  }

  function handleFutureFromChange(value) {
    const nextFrom = Math.max(futureRangeMin, Math.min(Number(value), futureTo));
    setFutureFrom(nextFrom);
  }

  function handleFutureToChange(value) {
    const nextTo = Math.min(futureRangeMax, Math.max(Number(value), futureFrom));
    setFutureTo(nextTo);
  }

  function validateRequestPayload() {
    if (!isCoordinateInsideIndiaBounds(latitude, longitude)) {
      setCoordinateError("Coordinate is outside supported India boundary envelope.");
      return false;
    }

    if (historicalFrom > historicalTo) {
      setRequestError("Historical start year should be less than or equal to end year.");
      return false;
    }

    if (isFutureScenario && futureFrom > futureTo) {
      setRequestError("Future GCM start year should be less than or equal to end year.");
      return false;
    }

    setCoordinateError("");
    setRequestError("");
    return true;
  }

  async function handleGenerateCurve() {
    if (!validateRequestPayload()) {
      return;
    }

    setIsLoading(true);
    setRequestError("");

    try {
      const selectedModel = modelOptions.find((option) => option.id === modelId);
      const backendModelName = selectedModel?.backendModel || modelId.replaceAll("-", "_");

      if (coordinateTab === "polygon") {
        if (!polygonGridPoints.length) {
          throw new Error("Upload a polygon and ensure it has valid grid points before generating.");
        }

        const shapePayload = {
          coords: polygonGridPoints.map((point) => [point.latitude, point.longitude]),
          starting_year: Number(historicalFrom),
          ending_year: Number(historicalTo),
          model_name: backendModelName
        };
        const result = await generateShapeIdfCurve(shapePayload);
        setIdfData(result);
      } else {
        const normalized = normalizeCoordinates(latitude, longitude);
        const payload = {
          coordinate: normalized,
          model: backendModelName,
          scenario,
          biasCorrection: {
            historicalRange: {
              from: Number(historicalFrom),
              to: Number(historicalTo)
            },
            ...(isFutureScenario
              ? {
                  futureRange: {
                    from: Number(futureFrom),
                    to: Number(futureTo)
                  }
                }
              : {})
          }
        };
        const result = await generateIdfCurve(payload);
        setIdfData({
          ...result,
          metadata: {
            ...(result?.metadata || {}),
            scenario
          }
        });
      }
    } catch (error) {
      setRequestError(error.message || "Failed to generate IDF curve from backend.");
      setIdfData(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDownloadShapeData() {
    if (!polygonGridPoints.length) {
      setRequestError("No polygon grid points available for download.");
      return;
    }

    setIsShapeDownloadLoading(true);
    setRequestError("");
    try {
      const selectedModel = modelOptions.find((option) => option.id === modelId);
      const backendModelName = selectedModel?.backendModel || modelId.replaceAll("-", "_");
      const payload = {
        coords: polygonGridPoints.map((point) => [point.latitude, point.longitude]),
        starting_year: Number(historicalFrom),
        ending_year: Number(historicalTo),
        model_name: backendModelName
      };
      const shapeData = await getObservedDataForShape(payload);
      const timeSeries = Array.isArray(shapeData.time) ? shapeData.time : [];
      const coordinateColumns = Object.keys(shapeData).filter((key) => key !== "time");
      const header = ["date", ...coordinateColumns];
      const rows = timeSeries.map((dateValue, index) => [
        dateValue,
        ...coordinateColumns.map((column) => {
          const values = Array.isArray(shapeData[column]) ? shapeData[column] : [];
          const rawValue = values[index];
          return rawValue ?? "";
        })
      ]);
      const csv = [header, ...rows].map((parts) => parts.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `shape-data-${backendModelName}-${historicalFrom}-${historicalTo}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      setRequestError(error.message || "Failed to download shape data.");
    } finally {
      setIsShapeDownloadLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="creative-header">
        <div className="header-brand">
          <img src={iitPalakkadLogo} alt="IIT Palakkad logo" className="iit-logo" />
          <div>
            <p className="eyebrow">Indian Institute of Technology Palakkad</p>
            <h1 className="header-title">IDF Curve Analysis Tool</h1>
          </div>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? "☀️ Bright Mode" : "🌙 Dark Mode"}
          </button>
        </div>
      </header>

      <main className="layout-grid" id="analysis">
        <div className="left-rail">
          <section className="card controls-card">
            <div className="card-header">
              <h2>⚙️ Control Deck</h2>
              <p>Set coordinates, model stream, scenario type, and correction window for precise analysis.</p>
            </div>

            <div className="form-grid">
              <div className="control-tabs">
                <button
                  type="button"
                  className={`result-pill ${coordinateTab === "manual" ? "active" : ""}`}
                  onClick={() => setCoordinateTab("manual")}
                >
                  📍 Manual Coordinate
                </button>
                <button
                  type="button"
                  className={`result-pill ${coordinateTab === "polygon" ? "active" : ""}`}
                  onClick={() => setCoordinateTab("polygon")}
                >
                  🗂️ Shapefile Polygon
                </button>
              </div>

              {coordinateTab === "manual" && (
                <>
                  <label>
                    📍 Latitude
                    <input
                      type="text"
                      value={latitudeInput}
                      onChange={(event) => handleCoordinateInputChange("lat", event.target.value)}
                      onBlur={() => finalizeCoordinateInput("lat")}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          finalizeCoordinateInput("lat");
                        }
                      }}
                    />
                  </label>

                  <label>
                    📍 Longitude
                    <input
                      type="text"
                      value={longitudeInput}
                      onChange={(event) => handleCoordinateInputChange("lon", event.target.value)}
                      onBlur={() => finalizeCoordinateInput("lon")}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          finalizeCoordinateInput("lon");
                        }
                      }}
                    />
                  </label>
                </>
              )}

              {coordinateTab === "polygon" && (
                <>
                  <label>
                    🗂️ Upload Polygon Shapefile (.zip)
                    <input
                      type="file"
                      accept=".zip,application/zip"
                      onChange={(event) => handleShapeZipUpload(event.target.files?.[0])}
                    />
                  </label>

                  {shapeSuccess && <p className="helper-text success">✅ {shapeSuccess}</p>}
                  {shapeError && <p className="helper-text error">⚠️ {shapeError}</p>}
                  
                </>
              )}

              {coordinateError && <p className="helper-text error">📍 {coordinateError}</p>}

              <label>
                🤖 Climate Model
                <select value={modelId} onChange={(event) => handleModelChange(event.target.value)}>
                  {modelOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                🔮 Scenario
                <select
                  value={scenario}
                  onChange={(event) => setScenario(event.target.value)}
                  disabled={isObservedModel || availableScenarios.length === 1}
                >
                  {availableScenarios.map((scenarioOption) => (
                    <option key={scenarioOption} value={scenarioOption}>
                      {scenarioOption.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>

              {isObservedModel && (
                <div className="year-range-wrap">
                  <div className="range-header">
                    <span>📅 IMD Year Range</span>
                    <strong>
                      {historicalFrom} - {historicalTo}
                    </strong>
                  </div>
                  <div className="dual-range">
                    <div className="slider-track" />
                    <div
                      className="slider-range"
                      style={{ left: `${fromPercent}%`, width: `${toPercent - fromPercent}%` }}
                    />
                    <input
                      type="range"
                      min={rangeMin}
                      max={rangeMax}
                      step="1"
                      value={historicalFrom}
                      onChange={(event) => handleHistoricalFromChange(event.target.value)}
                      className="thumb thumb-left"
                    />
                    <input
                      type="range"
                      min={rangeMin}
                      max={rangeMax}
                      step="1"
                      value={historicalTo}
                      onChange={(event) => handleHistoricalToChange(event.target.value)}
                      className="thumb thumb-right"
                    />
                  </div>
                  <div className="range-limits">
                    <span>{rangeMin}</span>
                    <span>{rangeMax}</span>
                  </div>
                </div>
              )}

              {!isObservedModel && (
                <div className="year-range-wrap">
                  <div className="range-header">
                    <span>📅 Bias-Correction Range</span>
                    <strong>
                      {historicalFrom} - {historicalTo}
                    </strong>
                  </div>
                  <div className="dual-range">
                    <div className="slider-track" />
                    <div
                      className="slider-range"
                      style={{ left: `${fromPercent}%`, width: `${toPercent - fromPercent}%` }}
                    />
                    <input
                      type="range"
                      min={rangeMin}
                      max={rangeMax}
                      step="1"
                      value={historicalFrom}
                      onChange={(event) => handleHistoricalFromChange(event.target.value)}
                      className="thumb thumb-left"
                    />
                    <input
                      type="range"
                      min={rangeMin}
                      max={rangeMax}
                      step="1"
                      value={historicalTo}
                      onChange={(event) => handleHistoricalToChange(event.target.value)}
                      className="thumb thumb-right"
                    />
                  </div>
                  <div className="range-limits">
                    <span>{rangeMin}</span>
                    <span>{rangeMax}</span>
                  </div>
                </div>
              )}

              {isFutureScenario && (
                <div className="year-range-wrap">
                  <div className="range-header">
                    <span>🔭 Future GCM Year Range</span>
                    <strong>
                      {futureFrom} - {futureTo}
                    </strong>
                  </div>
                  <div className="dual-range">
                    <div className="slider-track" />
                    <div
                      className="slider-range"
                      style={{ left: `${futureFromPercent}%`, width: `${futureToPercent - futureFromPercent}%` }}
                    />
                    <input
                      type="range"
                      min={futureRangeMin}
                      max={futureRangeMax}
                      step="1"
                      value={futureFrom}
                      onChange={(event) => handleFutureFromChange(event.target.value)}
                      className="thumb thumb-left"
                    />
                    <input
                      type="range"
                      min={futureRangeMin}
                      max={futureRangeMax}
                      step="1"
                      value={futureTo}
                      onChange={(event) => handleFutureToChange(event.target.value)}
                      className="thumb thumb-right"
                    />
                  </div>
                  <div className="range-limits">
                    <span>{futureRangeMin}</span>
                    <span>{futureRangeMax}</span>
                  </div>
                </div>
              )}
            </div>

            <button type="button" className="primary-btn" onClick={handleGenerateCurve} disabled={isLoading}>
              {isLoading ? "✨ Generating..." : "🚀 Generate Curve"}
            </button>

            {requestError && <p className="helper-text error">⚠️ {requestError}</p>}
          </section>
        </div>

        <div className="right-workspace">
          <MapSelector
            latitude={latitude}
            longitude={longitude}
            onCoordinateSelect={handleCoordinateSelect}
            polygonPath={polygonPath}
            gridPoints={polygonGridPoints}
          />
          <div id="results">
            <IdfChartPanel
              idfData={idfData}
              isLoading={isLoading}
              theme={theme}
              isShapeMode={coordinateTab === "polygon"}
              onDownloadShapeData={handleDownloadShapeData}
              isShapeDownloadLoading={isShapeDownloadLoading}
            />
          </div>
        </div>
      </main>

      <footer className="site-footer">
        <div className="footer-top">
          <div className="footer-branding">
            <img src={iitPalakkadLogo} alt="IIT Palakkad logo" className="footer-logo" />
            <div>
              <p className="footer-kicker">IIT Palakkad</p>
              <h3 className="footer-title">Monsoon Intensity Atlas</h3>
              <p className="footer-subtitle">Climate-ready design intelligence for data-driven rainfall analysis.</p>
            </div>
          </div>
        </div>
        <div className="footer-credits-grid">
          <article className="footer-credit-card">
            <h4>Developers</h4>
            <p>Chirag Varshney, Devansh Kesan</p>
          </article>
          <article className="footer-credit-card">
            <h4>Research Scholar</h4>
            <p>Dr. Ajith Bhaskar</p>
          </article>
          <article className="footer-credit-card">
            <h4>Faculty Advisor</h4>
            <p>Dr. B Sridharan</p>
          </article>
        </div>
        <p className="footer-bottom-note">Built for precision rainfall frequency analysis across India.</p>
      </footer>
    </div>
  );
}

export default App;
