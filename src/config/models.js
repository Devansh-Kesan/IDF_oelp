export const MODEL_OPTIONS = [
  {
    id: "imd",
    label: "IMD (Observed)",
    backendModel: "imd",
    scenarios: ["historical"]
  },
  {
    id: "imdaa",
    label: "IMDAA (Observed)",
    backendModel: "imdaa",
    scenarios: ["historical"]
  },
  {
    id: "access-cm2",
    label: "access-cm2",
    backendModel: "access_cm2",
    scenarios: ["historical", "ssp126", "ssp245", "ssp370", "ssp585"]
  }
];

export const DEFAULT_MODEL_ID = MODEL_OPTIONS[0].id;

export const DEFAULT_HISTORICAL_RANGE = {
  from: 1981,
  to: 2010
};

export const HISTORICAL_RANGE_LIMITS = {
  min: 1979,
  max: 2014
};

export const FUTURE_GCM_RANGE_LIMITS = {
  min: 2015,
  max: 2100
};

export const DEFAULT_FUTURE_GCM_RANGE = {
  from: 2020,
  to: 2100
};


