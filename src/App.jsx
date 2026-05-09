import groupLogo from "./assets/Group_logo.png";
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
  getModelDataForShape,
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
const FEEDBACK_FORM_URL = import.meta.env.VITE_FEEDBACK_FORM_URL || "";

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
  const [theme, setTheme] = useState("light");
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
  const [polygonCoordinates, setPolygonCoordinates] = useState(null);
  const [polygonPath, setPolygonPath] = useState([]);
  const [polygonGridPoints, setPolygonGridPoints] = useState([]);
  const [polygonBufferKm, setPolygonBufferKm] = useState(0);
  const [polygonBufferInput, setPolygonBufferInput] = useState("0");
  const [shapeError, setShapeError] = useState("");
  const [shapeSuccess, setShapeSuccess] = useState("");
  const [isShapeDownloadLoading, setIsShapeDownloadLoading] = useState(false);
  const [hoveredShapeCoordinateKey, setHoveredShapeCoordinateKey] = useState("");
  const [tabRefreshKey, setTabRefreshKey] = useState(0);

  const availableScenarios =
    modelOptions.find((option) => option.id === modelId)?.scenarios || ["historical"];
  const isObservedModel = modelId === "imd" || modelId === "imdaa";
  const historicalRangeLimits =
    modelId === "imd"
      ? {
          min: 1951,
          max: 2014
        }
      : HISTORICAL_RANGE_LIMITS;

  const rangeMin = historicalRangeLimits.min;
  const rangeMax = historicalRangeLimits.max;
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
    setRequestError("");
    setCoordinateError("");
    setShapeError("");
    setShapeSuccess("");
    setHoveredShapeCoordinateKey("");
    setTabRefreshKey((currentKey) => currentKey + 1);
    if (coordinateTab === "manual") {
      setPolygonCoordinates(null);
      setPolygonPath([]);
      setPolygonGridPoints([]);
      setPolygonBufferKm(0);
      setPolygonBufferInput("0");
    }
  }, [coordinateTab]);

  useEffect(() => {
    if (coordinateTab !== "polygon") {
      setHoveredShapeCoordinateKey("");
    }
  }, [coordinateTab]);

  useEffect(() => {
    setHistoricalFrom((currentFrom) => Math.max(rangeMin, Math.min(currentFrom, rangeMax)));
    setHistoricalTo((currentTo) => Math.max(rangeMin, Math.min(currentTo, rangeMax)));
  }, [rangeMin, rangeMax]);

  useEffect(() => {
    if (historicalFrom > historicalTo) {
      setHistoricalTo(historicalFrom);
    }
  }, [historicalFrom, historicalTo]);

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

  function rebuildPolygonGrid(nextPolygonCoordinates, nextBufferKm, options = {}) {
    const nextPolygonPath = toLeafletLatLngPath(nextPolygonCoordinates);
    const nextGridPoints = generateGridPointsWithinPolygon(
      nextPolygonCoordinates,
      POLYGON_GRID_STEP,
      nextBufferKm
    );

    if (!nextGridPoints.length) {
      throw new Error("No grid points were found inside polygon/buffer. Try reducing the buffer or upload another shape.");
    }

    const bufferedCount = nextGridPoints.filter((point) => point.isBufferPoint).length;
    const insideCount = nextGridPoints.length - bufferedCount;

    setPolygonPath(nextPolygonPath);
    setPolygonGridPoints(nextGridPoints);
    setLatitude(nextGridPoints[0].latitude);
    setLongitude(nextGridPoints[0].longitude);
    setShapeSuccess(
      `Polygon loaded: ${insideCount} inside-shape points + ${bufferedCount} buffer points (buffer ${nextBufferKm} km).`
    );
    setShapeError("");
    if (!options.keepHoveredPoint) {
      setHoveredShapeCoordinateKey("");
    }
  }

  async function processShapeZip(file) {
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

      setPolygonCoordinates(polygonCoordinates);
      rebuildPolygonGrid(polygonCoordinates, polygonBufferKm);
    } catch (error) {
      setShapeSuccess("");
      setShapeError(error?.message || "Failed to process shapefile.");
      setPolygonCoordinates(null);
      setPolygonPath([]);
      setPolygonGridPoints([]);
      setHoveredShapeCoordinateKey("");
    }
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
    await processShapeZip(file);
  }

  function handlePolygonBufferChange(value) {
    setPolygonBufferInput(value);

    const normalized = value.trim();
    if (!normalized) {
      setPolygonBufferKm(0);
      if (!polygonCoordinates) {
        return;
      }
      try {
        rebuildPolygonGrid(polygonCoordinates, 0, { keepHoveredPoint: true });
      } catch (error) {
        setShapeSuccess("");
        setShapeError(error?.message || "Failed to apply polygon buffer.");
        setPolygonPath([]);
        setPolygonGridPoints([]);
        setHoveredShapeCoordinateKey("");
      }
      return;
    }

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }

    const nextBufferKm = parsed;
    setPolygonBufferKm(nextBufferKm);

    if (!polygonCoordinates) {
      return;
    }

    try {
      rebuildPolygonGrid(polygonCoordinates, nextBufferKm, { keepHoveredPoint: true });
    } catch (error) {
      setShapeSuccess("");
      setShapeError(error?.message || "Failed to apply polygon buffer.");
      setPolygonPath([]);
      setPolygonGridPoints([]);
      setHoveredShapeCoordinateKey("");
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
          model: backendModelName,
          scenerio: scenario,
          ...(!isObservedModel && isFutureScenario
            ? {
                future_start_year: Number(futureFrom),
                future_end_year: Number(futureTo)
              }
            : {})
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
      setHoveredShapeCoordinateKey("");
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
        starting_year: Number(!isObservedModel && isFutureScenario ? futureFrom : historicalFrom),
        ending_year: Number(!isObservedModel && isFutureScenario ? futureTo : historicalTo),
        model: backendModelName,
        scenerio: scenario
      };
      const shapeData = isObservedModel
        ? await getObservedDataForShape(payload)
        : await getModelDataForShape(payload);
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

      const startYear = !isObservedModel && isFutureScenario ? futureFrom : historicalFrom;
      const endYear = !isObservedModel && isFutureScenario ? futureTo : historicalTo;
      link.download = `shape-data-${backendModelName}-${scenario}-${startYear}-${endYear}.csv`;

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

  function handleOpenFeedbackForm() {
    if (!FEEDBACK_FORM_URL) {
      setRequestError("Feedback form URL is not configured. Set VITE_FEEDBACK_FORM_URL.");
      return;
    }
    window.open(FEEDBACK_FORM_URL, "_blank", "noopener,noreferrer");
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
        <div className="header-actions-modern">
          <div className="research-group-name" style={{ display: "flex", alignItems: "center", gap: "0.5em" }}>
            <img src={groupLogo} alt="Research Group Logo" className="group-logo-img" style={{height: "100px", width: "auto"}} />
            <span>Hydraulic Modeling Lab</span>
          </div>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"))}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <span>{theme === "dark" ? "☀️" : "🌙"}</span>
            <span className="hide-on-mobile">{theme === "dark" ? "Bright Mode" : "Dark Mode"}</span>
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

                  <label>
                    📏 Buffer Around Polygon (km)
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={polygonBufferInput}
                      onChange={(event) => handlePolygonBufferChange(event.target.value)}
                    />
                  </label>
                  {!!polygonGridPoints.length && (
                    <p className="helper-text">
                      🔵 Blue points are inside shape,<br></br>
                      🟣 pink points are included by buffer.
                    </p>
                  )}

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
                      {(option.label || option.id).toUpperCase()}
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
                    <span>📅 Year Range</span>
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
            key={`map-${coordinateTab}-${tabRefreshKey}`}
            latitude={latitude}
            longitude={longitude}
            onCoordinateSelect={handleCoordinateSelect}
            polygonPath={polygonPath}
            gridPoints={polygonGridPoints}
            highlightedShapeCoordinateKey={hoveredShapeCoordinateKey}
          />
          <div id="results">
            <IdfChartPanel
              key={`panel-${coordinateTab}-${tabRefreshKey}`}
              idfData={idfData}
              isLoading={isLoading}
              theme={theme}
              isShapeMode={coordinateTab === "polygon"}
              onDownloadShapeData={handleDownloadShapeData}
              isShapeDownloadLoading={isShapeDownloadLoading}
              onShapeCoordinateHoverChange={setHoveredShapeCoordinateKey}
            />
          </div>
        </div>
      </main>

      <footer className="site-footer">
        <div className="footer-main">
          <div className="footer-branding">
            <img src={iitPalakkadLogo} alt="IIT Palakkad logo" className="footer-logo" />
            <div>
              <p className="footer-kicker">Indian Institute of Technology Palakkad</p>
              <h3 className="footer-title">IDF Curve Analysis Tool</h3>
              <p className="footer-subtitle">Climate-ready design intelligence for data-driven rainfall analysis. Built for precision rainfall frequency analysis across India.</p>
            </div>
            {/* --- Social Icons --- */}
              <div style={{ marginTop: "1rem", display: "flex", gap: "1rem" }}>
                {/* LinkedIn */}
                <a 
                  href="https://www.linkedin.com/school/iitpkd/posts/?feedView=all" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  aria-label="LinkedIn"
                  style={{ color: "inherit", opacity: 0.7, transition: "opacity 0.2s" }}
                  onMouseOver={(e) => e.currentTarget.style.opacity = 1} 
                  onMouseOut={(e) => e.currentTarget.style.opacity = 0.7}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                  </svg>
                </a>
                
                {/* Instagram */}
                <a 
                  href="https://www.instagram.com/iit_pkd/" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  aria-label="Instagram"
                  style={{ color: "inherit", opacity: 0.7, transition: "opacity 0.2s" }}
                  onMouseOver={(e) => e.currentTarget.style.opacity = 1} 
                  onMouseOut={(e) => e.currentTarget.style.opacity = 0.7}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </a>
              </div>
            {/* --------------------------- */}
          </div>

          <div className="footer-columns">
            <article className="footer-column">
              <h4>Developers</h4>
              <p>Chirag Varshney (112201023)</p>
              <p>Devansh Kesan (142201017)</p>
            </article>
            <article className="footer-column">
              <h4>Research Scholar</h4>
              <p>Ajith Bhaskar V</p>
            </article>
            <article className="footer-column">
              <h4>Faculty Advisor</h4>
              <p>Dr. B Sridharan</p>
            </article>
          </div>
        </div>

        <div className="footer-bottom">
          
          <p className="footer-copyright">
            © {new Date().getFullYear()} Indian Institute of Technology Palakkad. All rights reserved.
          </p>
        </div>
      </footer>
      <button type="button" className="feedback-fab" onClick={handleOpenFeedbackForm}>
        💬 Feedback
      </button>
    </div>
  );
}

export default App;
