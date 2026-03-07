import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Sprout, MapPin, Ruler, CloudSun, ChevronRight, Wheat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const soilTypes = ["Sandy", "Clay", "Loamy", "Black Soil", "Red Soil"];
const units = ["Acres", "Hectares", "Square meters"];

const steps = [
  { id: 1, label: "Location", icon: MapPin },
  { id: 2, label: "Soil Type", icon: Sprout },
  { id: 3, label: "Weather", icon: CloudSun },
  { id: 4, label: "Farm Size", icon: Ruler },
];

type PredictionItem = {
  crop: string;
  confidence: number;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [soilType, setSoilType] = useState("");
  const [latitude, setLatitude] = useState("17.3850");
  const [longitude, setLongitude] = useState("78.4867");
  const [farmSize, setFarmSize] = useState("");
  const [unit, setUnit] = useState("Acres");
  const [nitrogen, setNitrogen] = useState("90");
  const [phosphorus, setPhosphorus] = useState("42");
  const [potassium, setPotassium] = useState("43");
  const [temperature, setTemperature] = useState("");
  const [humidity, setHumidity] = useState("");
  const [ph, setPh] = useState("6.5");
  const [rainfall, setRainfall] = useState("");
  const [isPredicting, setIsPredicting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isFetchingWeather, setIsFetchingWeather] = useState(false);
  const [isFetchingSoil, setIsFetchingSoil] = useState(false);
  const [weatherUpdatedAt, setWeatherUpdatedAt] = useState<string | null>(null);
  const [soilUpdatedAt, setSoilUpdatedAt] = useState<string | null>(null);

  const openWeatherApiKey = (import.meta.env.VITE_OPENWEATHER_API_KEY as string | undefined)?.trim() ?? "";

  const weather = {
    temp: Number(temperature) || 0,
    humidity: Number(humidity) || 0,
    rainfall: Number(rainfall) || 0,
    rainType: (Number(rainfall) || 0) > 10 ? "Moderate Rain" : "Light Rain",
  };

  const inferSoilType = (clay: number, sand: number, silt: number) => {
    if (sand >= clay && sand >= silt) return "Sandy";
    if (clay >= sand && clay >= silt) return "Clay";
    return "Loamy";
  };

  const estimateSoilFromLocation = (lat: number, _lon: number) => {
    // Regional soil defaults for India based on latitude bands
    if (lat > 25) {
      // North India – Indo-Gangetic plains: alluvial / loamy
      return { ph: 7.2, clay: 28, sand: 35, silt: 37, soc: 0.8 };
    } else if (lat > 18) {
      // Central India – black / clay-rich (Deccan)
      return { ph: 7.5, clay: 45, sand: 20, silt: 35, soc: 0.6 };
    } else if (lat > 12) {
      // South-Central – red / laterite
      return { ph: 6.2, clay: 30, sand: 45, silt: 25, soc: 0.5 };
    }
    // Far South – coastal / sandy
    return { ph: 6.0, clay: 20, sand: 50, silt: 30, soc: 0.4 };
  };

  const fetchSoilAndEstimateNpk = async (lat: number, lon: number) => {
    setIsFetchingSoil(true);
    try {
      const params = new URLSearchParams();
      params.append("lat", String(lat));
      params.append("lon", String(lon));
      params.append("property", "phh2o");
      params.append("property", "clay");
      params.append("property", "sand");
      params.append("property", "silt");
      params.append("property", "soc");
      params.append("depth", "0-5cm");
      params.append("value", "mean");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(
        `https://rest.isric.org/soilgrids/v2.0/properties/query?${params.toString()}`,
        { signal: controller.signal },
      );
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Soil API HTTP ${response.status}`);
      }

      const data = await response.json();
      const layers = data?.properties?.layers;

      if (!Array.isArray(layers)) {
        throw new Error("Invalid soil response");
      }

      const getLayerValue = (name: string) => {
        const layer = layers.find((item: { name?: string }) => item?.name === name);
        const rawValue = layer?.depths?.[0]?.values?.mean;
        return typeof rawValue === "number" ? rawValue / 10 : null;
      };

      const estimatedPh = getLayerValue("phh2o") ?? 6.5;
      const clay = getLayerValue("clay") ?? 30;
      const sand = getLayerValue("sand") ?? 30;
      const silt = getLayerValue("silt") ?? 30;
      const soc = getLayerValue("soc") ?? 1;

      const estimatedN = soc * 20;
      const estimatedP = estimatedPh * 5 + silt * 0.5;
      const estimatedK = clay * 1.2 + sand * 0.3;

      setPh(String(Number(estimatedPh.toFixed(2))));
      setNitrogen(String(Number(estimatedN.toFixed(2))));
      setPhosphorus(String(Number(estimatedP.toFixed(2))));
      setPotassium(String(Number(estimatedK.toFixed(2))));
      setSoilType((previous) => previous || inferSoilType(clay, sand, silt));
      setSoilUpdatedAt(new Date().toLocaleTimeString());
      toast.success("Soil NPK and pH auto-filled from location");
    } catch {
      // API unreachable / timed out – use regional estimates
      const est = estimateSoilFromLocation(lat, lon);
      const estimatedN = est.soc * 20;
      const estimatedP = est.ph * 5 + est.silt * 0.5;
      const estimatedK = est.clay * 1.2 + est.sand * 0.3;

      setPh(String(Number(est.ph.toFixed(2))));
      setNitrogen(String(Number(estimatedN.toFixed(2))));
      setPhosphorus(String(Number(estimatedP.toFixed(2))));
      setPotassium(String(Number(estimatedK.toFixed(2))));
      setSoilType((previous) => previous || inferSoilType(est.clay, est.sand, est.silt));
      setSoilUpdatedAt(new Date().toLocaleTimeString());
      toast.info("Soil data estimated from your region (live API unavailable)");
    } finally {
      setIsFetchingSoil(false);
    }
  };

  const fetchWeatherByCoordinates = async (lat: number, lon: number) => {
    if (!openWeatherApiKey) {
      toast.error("OpenWeather API key missing. Set VITE_OPENWEATHER_API_KEY in frontend env.");
      return;
    }

    setIsFetchingWeather(true);
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${openWeatherApiKey}&units=metric`,
      );

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        const errorMessage = errorPayload?.message ?? `HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const rainMm = data?.rain?.["1h"] ?? data?.rain?.["3h"] ?? 0;
      const rainfallCm = Number((Number(rainMm) / 10).toFixed(2));

      setTemperature(String(Number(data?.main?.temp ?? 0).toFixed(2)));
      setHumidity(String(data?.main?.humidity ?? 0));
      setRainfall(String(rainfallCm));
      setWeatherUpdatedAt(new Date().toLocaleTimeString());
      toast.success("Weather data fetched from OpenWeather");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Unable to fetch weather: ${message}`);
    } finally {
      setIsFetchingWeather(false);
    }
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported on this device/browser");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lon = Number(position.coords.longitude.toFixed(6));
        setLatitude(String(lat));
        setLongitude(String(lon));
        setIsLocating(false);
        await Promise.all([
          fetchWeatherByCoordinates(lat, lon),
          fetchSoilAndEstimateNpk(lat, lon),
        ]);
      },
      () => {
        setIsLocating(false);
        toast.error("Unable to access current location");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleFetchWeatherFromEnteredCoords = async () => {
    const lat = Number(latitude);
    const lon = Number(longitude);

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      toast.error("Please enter valid latitude and longitude");
      return;
    }

    await Promise.all([
      fetchWeatherByCoordinates(lat, lon),
      fetchSoilAndEstimateNpk(lat, lon),
    ]);
  };

  const handlePredict = async () => {
    if (!soilType || !farmSize) {
      toast.error("Please complete all steps");
      return;
    }

    if (!temperature || !humidity || !rainfall) {
      toast.error("Weather data is missing. Fetch weather or enter values manually.");
      return;
    }

    const modelInput = {
      N: Number(nitrogen),
      P: Number(phosphorus),
      K: Number(potassium),
      temperature: Number(temperature),
      humidity: Number(humidity),
      ph: Number(ph),
      rainfall: Number(rainfall),
      farm_size: Number(farmSize),
      unit,
    };

    if (Object.values(modelInput).some((value) => Number.isNaN(value))) {
      toast.error("Please enter valid numeric values for model inputs");
      return;
    }

    setIsPredicting(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:5000"}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modelInput),
      });

      if (!response.ok) {
        throw new Error("Prediction request failed");
      }

      const predictions = (await response.json()) as PredictionItem[];

      if (!Array.isArray(predictions) || predictions.length === 0) {
        throw new Error("No predictions returned from model");
      }

      // Persist farm input for verdant-credits integration
      localStorage.setItem("farmInput", JSON.stringify({
        N: Number(nitrogen),
        P: Number(phosphorus),
        K: Number(potassium),
        latitude: Number(latitude),
        longitude: Number(longitude),
        farmSize: Number(farmSize),
        unit,
      }));

      const resultsState = {
          soilType,
          latitude,
          longitude,
          farmSize,
          unit,
          weather,
          predictions,
          modelInput,
      };
      // Persist in sessionStorage so the data survives Google Translate page reloads
      sessionStorage.setItem("resultsState", JSON.stringify(resultsState));
      navigate("/results", { state: resultsState });
    } catch {
      toast.error("Could not connect to ML model API. Make sure backend is running on port 5000.");
    } finally {
      setIsPredicting(false);
    }
  };

  const canProceed = () => {
    if (currentStep === 1) return !!latitude && !!longitude;
    if (currentStep === 2) return !!soilType;
    if (currentStep === 3) return !!temperature && !!humidity && !!rainfall;
    if (currentStep === 4) return !!farmSize;
    return false;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="gradient-hero px-4 py-4">
        <div className="container mx-auto flex items-center gap-2">
          <Sprout className="h-6 w-6 text-primary-foreground" />
          <h1 className="text-lg font-bold text-primary-foreground">Enter Farm Details</h1>
        </div>
      </header>

      {/* Step indicator */}
      <div className="container mx-auto px-4 py-6">
        <div className="mb-8 flex items-center justify-between">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <button
                onClick={() => setCurrentStep(s.id)}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                  currentStep >= s.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <s.icon className="h-5 w-5" />
              </button>
              {i < steps.length - 1 && (
                <div
                  className={`mx-1 hidden h-0.5 w-8 sm:block md:w-16 ${
                    currentStep > s.id ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="rounded-xl border bg-card p-6 shadow-card"
          >
            {/* Step 1: Soil Type */}
            {currentStep === 2 && (
              <div>
                <h2 className="mb-1 text-xl font-bold">🌍 Soil Type Detection</h2>
                <p className="mb-6 text-sm text-muted-foreground">
                  Soil type and NPK + pH are auto-filled from farm location (you can still edit values).
                </p>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleFetchWeatherFromEnteredCoords}
                    disabled={isFetchingSoil || isFetchingWeather}
                  >
                    {isFetchingSoil ? "Fetching soil..." : "Refresh Soil from Location"}
                  </Button>
                  {soilUpdatedAt && (
                    <p className="text-xs text-muted-foreground">Soil updated at: {soilUpdatedAt}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {soilTypes.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSoilType(s)}
                      className={`rounded-lg border-2 p-4 text-center text-sm font-semibold transition-all ${
                        soilType === s
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Nitrogen (N)</label>
                    <Input value={nitrogen} onChange={(e) => setNitrogen(e.target.value)} type="number" className="h-12" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Phosphorus (P)</label>
                    <Input value={phosphorus} onChange={(e) => setPhosphorus(e.target.value)} type="number" className="h-12" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Potassium (K)</label>
                    <Input value={potassium} onChange={(e) => setPotassium(e.target.value)} type="number" className="h-12" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Soil pH</label>
                    <Input value={ph} onChange={(e) => setPh(e.target.value)} type="number" step="0.1" className="h-12" />
                  </div>
                </div>

                {soilType && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-4 rounded-lg bg-primary/10 p-3 text-sm font-medium text-primary"
                  >
                    ✅ Soil detected: {soilType}
                  </motion.p>
                )}
              </div>
            )}

            {/* Step 2: Location */}
            {currentStep === 1 && (
              <div>
                <h2 className="mb-1 text-xl font-bold">📍 Farm Location</h2>
                <p className="mb-6 text-sm text-muted-foreground">
                  Click Get Current Location to auto-fill coordinates and weather for prediction.
                </p>
                <div className="mb-4 flex flex-wrap gap-3">
                  <Button type="button" variant="hero" onClick={handleGetCurrentLocation} disabled={isLocating || isFetchingWeather || isFetchingSoil}>
                    {isLocating ? "Getting location..." : "Get Current Location"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleFetchWeatherFromEnteredCoords}
                    disabled={isFetchingWeather || isFetchingSoil}
                  >
                    {isFetchingWeather || isFetchingSoil ? "Fetching data..." : "Fetch Weather + Soil"}
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Latitude</label>
                    <Input value={latitude} onChange={(e) => setLatitude(e.target.value)} className="h-12" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Longitude</label>
                    <Input value={longitude} onChange={(e) => setLongitude(e.target.value)} className="h-12" />
                  </div>
                </div>
                <div className="mt-4 overflow-hidden rounded-lg border">
                  <iframe
                    title="Farm Location"
                    width="100%"
                    height="250"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(longitude) - 0.01}%2C${Number(latitude) - 0.01}%2C${Number(longitude) + 0.01}%2C${Number(latitude) + 0.01}&layer=mapnik&marker=${latitude}%2C${longitude}`}
                    className="border-0"
                  />
                </div>
              </div>
            )}

            {/* Step 3: Farm Size */}
            {currentStep === 3 && (
              <div>
                <h2 className="mb-1 text-xl font-bold">🌦 Weather Data</h2>
                <p className="mb-6 text-sm text-muted-foreground">
                  Auto-calculated from OpenWeather using farm latitude/longitude, and you can edit manually.
                </p>

                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleFetchWeatherFromEnteredCoords}
                    disabled={isFetchingWeather}
                  >
                    {isFetchingWeather ? "Refreshing..." : "Refresh Weather"}
                  </Button>
                  {weatherUpdatedAt && (
                    <p className="text-xs text-muted-foreground">Updated at: {weatherUpdatedAt}</p>
                  )}
                </div>

                <div className="mb-6 grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Temperature (°C)</label>
                    <Input value={temperature} onChange={(e) => setTemperature(e.target.value)} type="number" className="h-12" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Humidity (%)</label>
                    <Input value={humidity} onChange={(e) => setHumidity(e.target.value)} type="number" className="h-12" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Rainfall (cm)</label>
                    <Input value={rainfall} onChange={(e) => setRainfall(e.target.value)} type="number" className="h-12" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Temperature", value: `${weather.temp}°C`, color: "bg-warning/10 text-warning" },
                    { label: "Humidity", value: `${weather.humidity}%`, color: "bg-weather-light text-weather" },
                    { label: "Rainfall", value: `${weather.rainfall} cm`, color: "bg-weather-light text-weather" },
                    { label: "Rain Type", value: weather.rainType, color: "bg-primary/10 text-primary" },
                  ].map((w) => (
                    <div key={w.label} className={`rounded-lg p-4 ${w.color}`}>
                      <p className="text-xs font-medium opacity-70">{w.label}</p>
                      <p className="text-lg font-bold">{w.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 4: Farm Size */}
            {currentStep === 4 && (
              <div>
                <h2 className="mb-1 text-xl font-bold">📐 Farm Size</h2>
                <p className="mb-6 text-sm text-muted-foreground">Enter the total cultivable area.</p>
                <div className="flex gap-3">
                  <Input
                    type="number"
                    placeholder="e.g. 2"
                    value={farmSize}
                    onChange={(e) => setFarmSize(e.target.value)}
                    className="h-14 flex-1 text-xl font-bold"
                  />
                  <Select value={unit} onValueChange={setUnit}>
                    <SelectTrigger className="h-14 w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((u) => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="mt-6 flex gap-3">
          {currentStep > 1 && (
            <Button variant="outline" className="h-12 flex-1" onClick={() => setCurrentStep(currentStep - 1)}>
              Back
            </Button>
          )}
          {currentStep < 4 ? (
            <Button
              variant="hero"
              className="h-12 flex-1"
              disabled={!canProceed()}
              onClick={() => setCurrentStep(currentStep + 1)}
            >
              Next <ChevronRight className="ml-1 h-5 w-5" />
            </Button>
          ) : (
            <Button variant="hero" className="h-12 flex-1" onClick={handlePredict} disabled={isPredicting}>
              <Wheat className="mr-2 h-5 w-5" /> {isPredicting ? "Predicting..." : "Get Crop Prediction"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
