import { decode } from "@msgpack/msgpack";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://10.32.15.241:8000";

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/x-msgpack")) {
    const buffer = await response.arrayBuffer();
    const decoded = decode(new Uint8Array(buffer));
    return decoded;
  }

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...(options.headers || {})
    },
    ...options
  });

  const data = await parseResponse(response);

  if (!response.ok) {
    if (typeof data === "string") {
      throw new Error(data || "Request failed");
    }

    throw new Error(data?.detail || data?.message || "Request failed");
  }

  return data;
}

export async function generateIdfCurve(payload) {
  const isImdRequest = payload.model === "imd";
  const isImdaaRequest = payload.model === "imdaa";
  const isFutureScenario = payload.scenario !== "historical";
  const historicalRange = payload.biasCorrection?.historicalRange || {};

  const query = new URLSearchParams({
    lat: String(payload.coordinate.latitude),
    lon: String(payload.coordinate.longitude),
    model: payload.model,
    starting_year: String(historicalRange.from),
    ending_year: String(historicalRange.to)
  });

  let endpoint = "/getIdfCurve_historic";

  // Observed endpoints (IMD/IMD-AA) generate IDF directly from observed precipitation.
  if (isImdRequest || isImdaaRequest) {
    endpoint = "/getObservedData";
  } else if (isFutureScenario) {
    // Future GCM values require bias-correction against historical observations/model.
    const futureRange = payload.biasCorrection?.futureRange || {};

    query.set("scenerio", payload.scenario);
    query.set("future_start_year", String(futureRange.from));
    query.set("future_end_year", String(futureRange.to));
    endpoint = "/getIdfCurve_future";
  }

  const raw = await request(`${endpoint}?${query.toString()}`);

  if (raw?.status === "Failed") {
    throw new Error(raw.message || "IDF generation failed.");
  }

  return normalizeIdfResponse(raw);
}

export async function generateShapeIdfCurve(payload) {
  const raw = await request("/getIdfCurveForShape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (raw?.status === "Failed") {
    throw new Error(raw.message || "Shape IDF generation failed.");
  }

  return normalizeShapeIdfResponse(raw, payload);
}

export async function getObservedDataForShape(payload) {
  const raw = await request("/getObservedDataForShape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (raw?.status === "Failed") {
    throw new Error(raw.message || "Shape observed data request failed.");
  }

  return raw?.data || {};
}

export async function getModelDataForShape(payload) {
  const raw = await request("/getModelDataForShape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (raw?.status === "Failed") {
    throw new Error(raw.message || "Shape model data request failed.");
  }

  return raw?.data || {};
}

export async function getAvailableModels() {
  const raw = await request("/getAvailableModels");
  return Array.isArray(raw?.data?.models) ? raw.data.models : [];
}

export function getSampleIdfResponse() {
  return {
    returnPeriods: [2, 5, 10, 20, 25, 50, 100],
    rows: [
      { duration: 1, "2": 112, "5": 126, "10": 136, "20": 146, "25": 150, "50": 161, "100": 172 },
      { duration: 3, "2": 84, "5": 93, "10": 100, "20": 108, "25": 110, "50": 118, "100": 126 },
      { duration: 6, "2": 66, "5": 73, "10": 78, "20": 84, "25": 86, "50": 92, "100": 99 },
      { duration: 12, "2": 42, "5": 47, "10": 50, "20": 54, "25": 55, "50": 59, "100": 63 },
      { duration: 24, "2": 26, "5": 29, "10": 31, "20": 34, "25": 35, "50": 37, "100": 40 }
    ],
    metadata: {
      source: "sample",
      note: "Replace with backend response"
    },
    fullSeries: {
      time: [],
      obs: [],
      model: [],
      corrected: []
    }
  };
}

function normalizeIdfResponse(rawResponse) {
  const idfTable = rawResponse?.idf_table || {};

  const returnPeriods = Object.keys(idfTable)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (!returnPeriods.length) {
    return {
      returnPeriods: [],
      rows: [],
      metadata: rawResponse?.metadata || {},
      message: rawResponse?.message || "",
      fullSeries: normalizeFullSeries(rawResponse?.full_series || rawResponse?.data)
    };
  }

  const firstPeriod = String(returnPeriods[0]);

  const durations = Object.keys(idfTable[firstPeriod] || {})
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  const rows = durations.map((duration) => {
    const row = { duration };

    returnPeriods.forEach((period) => {
      const cell = idfTable[String(period)]?.[String(duration)];
      const numericValue = typeof cell === "number" ? cell : Number(cell);
      row[String(period)] = Number.isFinite(numericValue) ? numericValue : null;
    });

    return row;
  });

  return {
    returnPeriods,
    rows,
    metadata: rawResponse?.metadata || {},
    message: rawResponse?.message || "",
    fullSeries: normalizeFullSeries(rawResponse?.full_series || rawResponse?.data)
  };
}

function normalizeFullSeries(fullSeries) {
  if (!fullSeries || typeof fullSeries !== "object") {
    return {
      time: [],
      obs: [],
      model: [],
      corrected: []
    };
  }

  return {
    time: Array.isArray(fullSeries.time) ? fullSeries.time : [],
    obs: Array.isArray(fullSeries.obs) ? fullSeries.obs : [],
    model: Array.isArray(fullSeries.model) ? fullSeries.model : [],
    corrected: Array.isArray(fullSeries.corrected) ? fullSeries.corrected : []
  };
}

function normalizeShapeIdfResponse(rawResponse, payload) {
  const data = rawResponse?.data;
  const coordinateKeys = data && typeof data === "object" ? Object.keys(data) : [];
  const firstCoordinate = coordinateKeys[0];
  const firstIdfTable = firstCoordinate ? data[firstCoordinate] : {};
  const returnPeriods = Object.keys(firstIdfTable || {})
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  const durations = returnPeriods.length
    ? Object.keys(firstIdfTable?.[String(returnPeriods[0])] || {})
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b)
    : [];

  return {
    mode: "shape",
    coordinateKeys,
    returnPeriods,
    durations,
    shapeIdfByCoordinate: data || {},
    metadata: {
      model: payload?.model || "observed",
      startingYear: payload?.starting_year,
      endingYear: payload?.ending_year
    }
  };
}
