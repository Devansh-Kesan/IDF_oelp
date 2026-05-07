import { useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";

const PERIOD_COLORS = ["#00d4ff", "#00ffa3", "#f59e0b", "#f97316", "#ef4444", "#a855f7", "#ec4899"];

export default function IdfChartPanel({
  idfData,
  isLoading,
  theme = "dark",
  isShapeMode = false,
  onDownloadShapeData,
  isShapeDownloadLoading = false,
  onShapeCoordinateHoverChange
}) {
  const [activeView, setActiveView] = useState("curve");
  const [selectedShapeReturnPeriod, setSelectedShapeReturnPeriod] = useState("");
  const [selectedShapeCoordinateKey, setSelectedShapeCoordinateKey] = useState("");
  const chartData = idfData?.rows || [];
  const returnPeriods = idfData?.returnPeriods || [];
  const shapeCoordinateKeys = idfData?.coordinateKeys || [];
  const shapeDurations = idfData?.durations || [];
  const shapeIdfByCoordinate = idfData?.shapeIdfByCoordinate || {};
  const hasData = chartData.length > 0 && returnPeriods.length > 0;
  const rainfallSeries = idfData?.fullSeries || { time: [], obs: [], model: [], corrected: [] };
  const rainfallData = useMemo(
    () => {
      const toFiniteOrNull = (value) => {
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue : null;
      };

      return rainfallSeries.time.map((timeValue, index) => ({
        time: timeValue,
        obs: toFiniteOrNull(rainfallSeries.obs?.[index]),
        model: toFiniteOrNull(rainfallSeries.model?.[index]),
        corrected: toFiniteOrNull(rainfallSeries.corrected?.[index])
      }));
    },
    [rainfallSeries]
  );
  const hasRainfallData = rainfallData.length > 0;
  const modelText = idfData?.metadata?.model ? `Model: ${idfData.metadata.model}` : "Advanced Results";
  const scenarioText = idfData?.metadata?.scenario || "historical";
  const hasModelSeries = rainfallData.some((row) => row.model !== null);
  const hasCorrectedSeries = rainfallData.some((row) => row.corrected !== null);
  const hasObservedSeries = rainfallData.some((row) => row.obs !== null);
  const shouldSplitHistoricalModelView =
    Boolean(idfData?.metadata?.model) && scenarioText === "historical" && hasObservedSeries && hasModelSeries && hasCorrectedSeries;
  const isLightMode = theme === "light";
  const axisColor = isLightMode ? "rgba(15, 23, 42, 0.72)" : "rgba(255, 255, 255, 0.6)";
  const gridColor = isLightMode ? "rgba(30, 41, 59, 0.15)" : "rgba(0, 212, 255, 0.12)";
  const legendBackground = isLightMode ? "rgba(255, 255, 255, 0.9)" : "rgba(15, 23, 42, 0.86)";
  const buildRainfallLayout = (title) => ({
      title: {
        text: title,
        x: 0.01,
        xanchor: "left",
        font: { size: 16, color: isLightMode ? "#0f172a" : "#f8fafc" }
      },
      xaxis: {
        title: { text: "Date", font: { color: axisColor } },
        tickfont: { color: axisColor },
        showgrid: true,
        gridcolor: gridColor
      },
      yaxis: {
        title: { text: "Rainfall (mm/day)", font: { color: axisColor } },
        tickfont: { color: axisColor },
        showgrid: true,
        gridcolor: gridColor,
        zeroline: false
      },
      legend: {
        orientation: "h",
        y: 1.15,
        x: 0,
        font: { color: axisColor },
        bgcolor: legendBackground,
        bordercolor: isLightMode ? "rgba(14, 116, 144, 0.25)" : "rgba(148, 163, 184, 0.25)",
        borderwidth: 1
      },
      hoverlabel: {
        bgcolor: isLightMode ? "rgba(255,255,255,0.98)" : "rgba(15,23,42,0.98)",
        font: { color: isLightMode ? "#0f172a" : "#f8fafc" },
        bordercolor: isLightMode ? "rgba(14,116,144,0.3)" : "rgba(148,163,184,0.35)"
      },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 70, r: 24, t: 70, b: 62 },
      hovermode: "closest"
    });
  const rainfallPlotData = useMemo(() => {
    const observedValues = rainfallData.map((row) => row.obs);
    const modelValues = rainfallData.map((row) => row.model);
    const correctedValues = rainfallData.map((row) => row.corrected);
    const timeValues = rainfallData.map((row) => row.time);
    const traces = [];

    if (hasObservedSeries) {
      traces.push({
        x: timeValues,
        y: observedValues,
        type: "scatter",
        mode: "lines",
        name: "Observed Rainfall (IMD)",
        line: { color: "#22d3ee", width: 2.5 },
        hovertemplate: "Date: %{x}<br>Observed: %{y:.2f} mm/day<extra></extra>",
        connectgaps: true
      });
    }

    if (hasCorrectedSeries) {
      traces.push({
        x: timeValues,
        y: correctedValues,
        type: "scatter",
        mode: "lines",
        name: "Bias-Corrected Rainfall",
        line: { color: "#a855f7", width: 2.2 },
        hovertemplate: "Date: %{x}<br>Corrected: %{y:.2f} mm/day<extra></extra>",
        connectgaps: true
      });
    }

    if (hasModelSeries) {
      traces.push({
        x: timeValues,
        y: modelValues,
        type: "scatter",
        mode: "lines",
        name: "Model Rainfall",
        line: { color: "#f59e0b", width: 2.2 },
        hovertemplate: "Date: %{x}<br>Model: %{y:.2f} mm/day<extra></extra>",
        connectgaps: true
      });
    }

    return traces;
  }, [hasCorrectedSeries, hasModelSeries, hasObservedSeries, rainfallData]);
  const historicalModelPlotData = useMemo(() => {
    const timeValues = rainfallData.map((row) => row.time);
    return {
      imdVsModel: [
        {
          x: timeValues,
          y: rainfallData.map((row) => row.obs),
          type: "scatter",
          mode: "lines",
          name: "Observed Rainfall (IMD)",
          line: { color: "#22d3ee", width: 2.5 },
          hovertemplate: "Date: %{x}<br>Observed: %{y:.2f} mm/day<extra></extra>",
          connectgaps: true
        },
        {
          x: timeValues,
          y: rainfallData.map((row) => row.model),
          type: "scatter",
          mode: "lines",
          name: "Historical Model Rainfall",
          line: { color: "#f59e0b", width: 2.2 },
          hovertemplate: "Date: %{x}<br>Model: %{y:.2f} mm/day<extra></extra>",
          connectgaps: true
        }
      ],
      imdVsCorrected: [
        {
          x: timeValues,
          y: rainfallData.map((row) => row.obs),
          type: "scatter",
          mode: "lines",
          name: "Observed Rainfall (IMD)",
          line: { color: "#22d3ee", width: 2.5 },
          hovertemplate: "Date: %{x}<br>Observed: %{y:.2f} mm/day<extra></extra>",
          connectgaps: true
        },
        {
          x: timeValues,
          y: rainfallData.map((row) => row.corrected),
          type: "scatter",
          mode: "lines",
          name: "Bias-Corrected Model Rainfall",
          line: { color: "#a855f7", width: 2.2 },
          hovertemplate: "Date: %{x}<br>Corrected: %{y:.2f} mm/day<extra></extra>",
          connectgaps: true
        }
      ]
    };
  }, [rainfallData]);
  const rainfallPlotLayout = useMemo(
    () => buildRainfallLayout("Daily Rainfall Time Series"),
    [axisColor, gridColor, isLightMode]
  );
  const splitPlotLayouts = useMemo(
    () => ({
      imdVsModel: buildRainfallLayout("Observed IMD vs Historical Model Rainfall"),
      imdVsCorrected: buildRainfallLayout("Observed IMD vs Bias-Corrected Model Rainfall")
    }),
    [axisColor, gridColor, isLightMode]
  );
  const idfPlotData = useMemo(
    () =>
      returnPeriods.map((period, index) => ({
        x: chartData.map((row) => row.duration),
        y: chartData.map((row) => row[String(period)]),
        type: "scatter",
        mode: "lines+markers",
        name: `${period} Year Return Period`,
        line: {
          color: PERIOD_COLORS[index % PERIOD_COLORS.length],
          width: 2.4
        },
        marker: {
          size: 5
        },
        hovertemplate:
          "Duration: %{x} hr<br>Intensity: %{y:.2f} mm/hr<br>Return Period: " +
          `${period} year<extra></extra>`,
        connectgaps: true
      })),
    [chartData, returnPeriods]
  );
  const idfPlotLayout = useMemo(
    () => ({
      title: {
        text: "IDF Curve by Return Period",
        x: 0.01,
        xanchor: "left",
        font: { size: 16, color: isLightMode ? "#0f172a" : "#f8fafc" }
      },
      xaxis: {
        title: { text: "Duration (hours)", font: { color: axisColor } },
        tickfont: { color: axisColor },
        showgrid: true,
        gridcolor: gridColor
      },
      yaxis: {
        title: { text: "Intensity (mm/hr)", font: { color: axisColor } },
        tickfont: { color: axisColor },
        showgrid: true,
        gridcolor: gridColor,
        zeroline: false
      },
      legend: {
        orientation: "h",
        y: 1.15,
        x: 0,
        font: { color: axisColor },
        bgcolor: legendBackground,
        bordercolor: isLightMode ? "rgba(14, 116, 144, 0.25)" : "rgba(148, 163, 184, 0.25)",
        borderwidth: 1
      },
      hoverlabel: {
        bgcolor: isLightMode ? "rgba(255,255,255,0.98)" : "rgba(15,23,42,0.98)",
        font: { color: isLightMode ? "#0f172a" : "#f8fafc" },
        bordercolor: isLightMode ? "rgba(14,116,144,0.3)" : "rgba(148,163,184,0.35)"
      },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 70, r: 24, t: 70, b: 62 },
      hovermode: "closest"
    }),
    [axisColor, gridColor, isLightMode, legendBackground]
  );
  const selectedShapePeriod = Number(selectedShapeReturnPeriod);
  const shapeTableRows = useMemo(() => {
    if (!isShapeMode || !Number.isFinite(selectedShapePeriod)) {
      return [];
    }

    return shapeDurations.map((duration) => {
      const row = { duration };
      shapeCoordinateKeys.forEach((coordKey) => {
        const value = shapeIdfByCoordinate?.[coordKey]?.[String(selectedShapePeriod)]?.[String(duration)];
        const numericValue = typeof value === "number" ? value : Number(value);
        row[coordKey] = Number.isFinite(numericValue) ? numericValue.toFixed(2) : "-";
      });
      return row;
    });
  }, [isShapeMode, selectedShapePeriod, shapeDurations, shapeCoordinateKeys, shapeIdfByCoordinate]);

  const rainfallCsv = useMemo(() => {
    if (!hasRainfallData) {
      return "";
    }

    const header = ["date", "observed_imd", "model", "bias_corrected"];
    const rows = rainfallData.map((row) => [
      row.time ?? "",
      row.obs ?? "",
      row.model ?? "",
      row.corrected ?? ""
    ]);
    return [header, ...rows].map((parts) => parts.join(",")).join("\n");
  }, [hasRainfallData, rainfallData]);

  const idfTableCsv = useMemo(() => {
    if (!hasData) {
      return "";
    }

    const header = ["duration_hr", ...returnPeriods.map((period) => `${period}_year`)];
    const rows = chartData.map((row) => [
      row.duration ?? "",
      ...returnPeriods.map((period) => row[String(period)] ?? "")
    ]);
    return [header, ...rows].map((parts) => parts.join(",")).join("\n");
  }, [chartData, hasData, returnPeriods]);

  const shapeIdfTableCsv = useMemo(() => {
    if (!isShapeMode || !Number.isFinite(selectedShapePeriod) || !shapeTableRows.length) {
      return "";
    }

    const header = ["duration_hr", ...shapeCoordinateKeys];
    const rows = shapeTableRows.map((row) => [row.duration ?? "", ...shapeCoordinateKeys.map((key) => row[key] ?? "")]);
    return [header, ...rows].map((parts) => parts.join(",")).join("\n");
  }, [isShapeMode, selectedShapePeriod, shapeTableRows, shapeCoordinateKeys]);
  const selectedShapeCoordinateRows = useMemo(() => {
    if (!isShapeMode || !selectedShapeCoordinateKey) {
      return [];
    }

    const coordinateData = shapeIdfByCoordinate?.[selectedShapeCoordinateKey] || {};
    if (!shapeDurations.length || !returnPeriods.length) {
      return [];
    }

    return shapeDurations.map((duration) => {
      const row = { duration };
      returnPeriods.forEach((period) => {
        const value = coordinateData?.[String(period)]?.[String(duration)];
        const numericValue = typeof value === "number" ? value : Number(value);
        row[String(period)] = Number.isFinite(numericValue) ? numericValue : null;
      });
      return row;
    });
  }, [isShapeMode, selectedShapeCoordinateKey, shapeIdfByCoordinate, shapeDurations, returnPeriods]);
  const hasSelectedShapeCoordinateData = selectedShapeCoordinateRows.some((row) =>
    returnPeriods.some((period) => row[String(period)] !== null)
  );
  const selectedShapeCoordinatePlotData = useMemo(
    () =>
      returnPeriods.map((period, index) => ({
        x: selectedShapeCoordinateRows.map((row) => row.duration),
        y: selectedShapeCoordinateRows.map((row) => row[String(period)]),
        type: "scatter",
        mode: "lines+markers",
        name: `${period} Year Return Period`,
        line: {
          color: PERIOD_COLORS[index % PERIOD_COLORS.length],
          width: 2.4
        },
        marker: {
          size: 5
        },
        hovertemplate:
          "Duration: %{x} hr<br>Intensity: %{y:.2f} mm/hr<br>Return Period: " +
          `${period} year<extra></extra>`,
        connectgaps: true
      })),
    [selectedShapeCoordinateRows, returnPeriods]
  );
  const selectedShapeCoordinateLabel = useMemo(() => {
    if (!selectedShapeCoordinateKey) {
      return "";
    }

    const [latRaw = "", lonRaw = ""] = selectedShapeCoordinateKey.split("_");
    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`;
    }
    return selectedShapeCoordinateKey;
  }, [selectedShapeCoordinateKey]);
  const selectedShapeCoordinateCsv = useMemo(() => {
    if (!selectedShapeCoordinateRows.length) {
      return "";
    }

    const header = ["duration_hr", ...returnPeriods.map((period) => `${period}_year`)];
    const rows = selectedShapeCoordinateRows.map((row) => [
      row.duration ?? "",
      ...returnPeriods.map((period) => row[String(period)] ?? "")
    ]);
    return [header, ...rows].map((parts) => parts.join(",")).join("\n");
  }, [selectedShapeCoordinateRows, returnPeriods]);

  function downloadCsvFile(csvContent, filename) {
    if (!csvContent) {
      return;
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
  function handleDownloadRainfallCsv() {
    if (!rainfallCsv) {
      return;
    }

    const blob = new Blob([rainfallCsv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rainfall-series-${idfData?.metadata?.model || "imd"}-${scenarioText}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleDownloadIdfTableCsv() {
    downloadCsvFile(idfTableCsv, `idf-table-${idfData?.metadata?.model || "model"}-${scenarioText}.csv`);
  }

  function handleDownloadShapeIdfTableCsv() {
    downloadCsvFile(
      shapeIdfTableCsv,
      `shape-idf-table-${idfData?.metadata?.model || "model"}-${selectedShapePeriod || "period"}-year.csv`
    );
  }
  function handleOpenShapeCoordinateModal(coordKey) {
    setSelectedShapeCoordinateKey(coordKey);
  }

  function handleCloseShapeCoordinateModal() {
    setSelectedShapeCoordinateKey("");
  }

  function handleDownloadSelectedShapeCoordinateCsv() {
    if (!selectedShapeCoordinateCsv || !selectedShapeCoordinateKey) {
      return;
    }
    const safeCoordinate = selectedShapeCoordinateKey.replaceAll("_", "-");
    downloadCsvFile(
      selectedShapeCoordinateCsv,
      `idf-table-${idfData?.metadata?.model || "model"}-${safeCoordinate}-${scenarioText}.csv`
    );
  }
  const formattedRows = useMemo(
    () =>
      chartData.map((row) => ({
        ...row,
        ...Object.fromEntries(
          returnPeriods.map((period) => [String(period), Number(row[String(period)]).toFixed(2)])
        )
      })),
    [chartData, returnPeriods]
  );

  useEffect(() => {
    if (!isShapeMode) {
      onShapeCoordinateHoverChange?.("");
      return;
    }

    if (!returnPeriods.length) {
      setSelectedShapeReturnPeriod("");
      return;
    }

    const asNumber = Number(selectedShapeReturnPeriod);
    if (!Number.isFinite(asNumber) || !returnPeriods.includes(asNumber)) {
      setSelectedShapeReturnPeriod(String(returnPeriods[0]));
    }
  }, [isShapeMode, returnPeriods, selectedShapeReturnPeriod, onShapeCoordinateHoverChange]);
  useEffect(() => {
    if (!isShapeMode) {
      setSelectedShapeCoordinateKey("");
      return;
    }

    if (
      selectedShapeCoordinateKey &&
      shapeCoordinateKeys.length &&
      !shapeCoordinateKeys.includes(selectedShapeCoordinateKey)
    ) {
      setSelectedShapeCoordinateKey("");
    }
  }, [isShapeMode, selectedShapeCoordinateKey, shapeCoordinateKeys]);

  return (
    <section className="card">
      <div className="result-toolbar">
        {isShapeMode ? (
          <>
            <button type="button" className="result-pill active">
              📋 Shape Table View
            </button>
            <button
              type="button"
              className="download-btn"
              onClick={onDownloadShapeData}
              disabled={isShapeDownloadLoading || !shapeCoordinateKeys.length}
            >
              {isShapeDownloadLoading ? "⏳ Downloading..." : "⬇ Download Shape Data"}
            </button>
            <button
              type="button"
              className="download-btn"
              onClick={handleDownloadShapeIdfTableCsv}
              disabled={!shapeIdfTableCsv}
            >
              ⬇ Download IDF Table CSV
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`result-pill ${activeView === "curve" ? "active" : ""}`}
              onClick={() => setActiveView("curve")}
            >
              📊 Curve View
            </button>
            <button
              type="button"
              className={`result-pill ${activeView === "table" ? "active" : ""}`}
              onClick={() => setActiveView("table")}
            >
              📋 Table View
            </button>
            <button
              type="button"
              className={`result-pill ${activeView === "rainfall" ? "active" : ""}`}
              onClick={() => setActiveView("rainfall")}
            >
              🌧️ Rainfall View
            </button>
            {activeView === "rainfall" && hasRainfallData ? (
              <button type="button" className="download-btn" onClick={handleDownloadRainfallCsv}>
                ⬇ Download CSV
              </button>
            ) : null}
            {hasData ? (
              <button type="button" className="download-btn" onClick={handleDownloadIdfTableCsv}>
                ⬇ Download IDF Table CSV
              </button>
            ) : null}
          </>
        )}
        <div className="result-spacer" />
        <div className="result-meta">{modelText}</div>
      </div>

      {isLoading ? (
        <div className="state-box">✨ Generating your IDF curve with advanced climate models...</div>
      ) : isShapeMode && returnPeriods.length > 0 ? (
        <div className="idf-table-wrap">
          <div className="shape-return-period-select">
            <label>
              Return Period
              <select
                value={selectedShapeReturnPeriod}
                onChange={(event) => setSelectedShapeReturnPeriod(event.target.value)}
              >
                {returnPeriods.map((period) => (
                  <option key={period} value={String(period)}>
                    {period} Year
                  </option>
                ))}
              </select>
            </label>
          </div>
          <table className="idf-table">
            <thead>
              <tr>
                <th>Duration (hr)</th>
                {shapeCoordinateKeys.map((coordKey) => (
                  <th
                    key={coordKey}
                    onClick={() => handleOpenShapeCoordinateModal(coordKey)}
                    onMouseEnter={() => onShapeCoordinateHoverChange?.(coordKey)}
                    onMouseLeave={() => onShapeCoordinateHoverChange?.("")}
                    style={{ cursor: "pointer" }}
                  >
                    {coordKey}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shapeTableRows.map((row) => (
                <tr key={row.duration}>
                  <td>{row.duration}</td>
                  {shapeCoordinateKeys.map((coordKey) => (
                    <td
                      key={`${row.duration}-${coordKey}`}
                      onClick={() => handleOpenShapeCoordinateModal(coordKey)}
                      onMouseEnter={() => onShapeCoordinateHoverChange?.(coordKey)}
                      onMouseLeave={() => onShapeCoordinateHoverChange?.("")}
                      style={{ cursor: "pointer" }}
                    >
                      {row[coordKey]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : isShapeMode ? (
        <div className="state-box">Upload a polygon and generate results to view shape IDF table.</div>
      ) : hasData && activeView === "curve" ? (
        <div className="chart-wrap">
          <Plot
            data={idfPlotData}
            layout={idfPlotLayout}
            config={{
              responsive: true,
              displaylogo: false,
              scrollZoom: true,
              modeBarButtonsToRemove: ["lasso2d", "select2d"]
            }}
            style={{ width: "100%", height: "100%" }}
            useResizeHandler
          />
        </div>
      ) : hasData && activeView === "table" ? (
        <div className="idf-table-wrap">
          <table className="idf-table">
            <thead>
              <tr>
                <th>Duration (hr)</th>
                {returnPeriods.map((period) => (
                  <th key={period}>{period} Year</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {formattedRows.map((row) => (
                <tr key={row.duration}>
                  <td>{row.duration}</td>
                  {returnPeriods.map((period) => (
                    <td key={`${row.duration}-${period}`}>{row[String(period)]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : activeView === "rainfall" && hasRainfallData ? (
        <div className={shouldSplitHistoricalModelView ? "split-rainfall-wrap" : "chart-wrap"}>
          {shouldSplitHistoricalModelView ? (
            <>
              <div className="chart-wrap rainfall-subplot">
                <Plot
                  data={historicalModelPlotData.imdVsModel}
                  layout={splitPlotLayouts.imdVsModel}
                  config={{
                    responsive: true,
                    displaylogo: false,
                    scrollZoom: true,
                    modeBarButtonsToRemove: ["lasso2d", "select2d"]
                  }}
                  style={{ width: "100%", height: "100%" }}
                  useResizeHandler
                />
              </div>
              <div className="chart-wrap rainfall-subplot">
                <Plot
                  data={historicalModelPlotData.imdVsCorrected}
                  layout={splitPlotLayouts.imdVsCorrected}
                  config={{
                    responsive: true,
                    displaylogo: false,
                    scrollZoom: true,
                    modeBarButtonsToRemove: ["lasso2d", "select2d"]
                  }}
                  style={{ width: "100%", height: "100%" }}
                  useResizeHandler
                />
              </div>
            </>
          ) : (
            <Plot
              data={rainfallPlotData}
              layout={rainfallPlotLayout}
              config={{
                responsive: true,
                displaylogo: false,
                scrollZoom: true,
                modeBarButtonsToRemove: ["lasso2d", "select2d"]
              }}
              style={{ width: "100%", height: "100%" }}
              useResizeHandler
            />
          )}
        </div>
      ) : (
        <div className="state-box">
          Select a location and run analysis to render the IDF curve.
        </div>
      )}
      {isShapeMode && selectedShapeCoordinateKey ? (
        <div className="shape-coordinate-modal-overlay" onClick={handleCloseShapeCoordinateModal}>
          <div className="shape-coordinate-modal" onClick={(event) => event.stopPropagation()}>
            <div className="shape-coordinate-modal-header">
              <h3>IDF Curve for Selected Grid Point</h3>
              <button type="button" className="result-pill" onClick={handleCloseShapeCoordinateModal}>
                Close
              </button>
            </div>
            <p className="shape-coordinate-modal-subtitle">{selectedShapeCoordinateLabel}</p>
            <div className="shape-coordinate-modal-actions">
              <button
                type="button"
                className="download-btn"
                onClick={handleDownloadSelectedShapeCoordinateCsv}
                disabled={!selectedShapeCoordinateCsv}
              >
                ⬇ Download IDF Table CSV
              </button>
            </div>
            {hasSelectedShapeCoordinateData ? (
              <>
                <div className="chart-wrap shape-coordinate-chart">
                  <Plot
                    data={selectedShapeCoordinatePlotData}
                    layout={idfPlotLayout}
                    config={{
                      responsive: true,
                      displaylogo: false,
                      scrollZoom: true,
                      modeBarButtonsToRemove: ["lasso2d", "select2d"]
                    }}
                    style={{ width: "100%", height: "100%" }}
                    useResizeHandler
                  />
                </div>
                <div className="idf-table-wrap">
                  <table className="idf-table">
                    <thead>
                      <tr>
                        <th>Duration (hr)</th>
                        {returnPeriods.map((period) => (
                          <th key={period}>{period} Year</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedShapeCoordinateRows.map((row) => (
                        <tr key={`selected-shape-row-${row.duration}`}>
                          <td>{row.duration}</td>
                          {returnPeriods.map((period) => (
                            <td key={`selected-shape-${row.duration}-${period}`}>
                              {row[String(period)] === null ? "-" : Number(row[String(period)]).toFixed(2)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="state-box">No IDF values are available for this grid point.</div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
