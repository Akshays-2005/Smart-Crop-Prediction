import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, CalendarDays, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import heroFarm from "@/assets/hero-farm.jpg";

const cropCatalog = [
  {
    name: "Rice",
    price: 2200,
    investment: 45000,
    yield: 32,
    reasons: [
      "Soil type (Loamy) retains water well which is ideal for rice cultivation",
      "Current rainfall and humidity support rice growth",
      "Local temperature range is suitable",
      "Market demand and price are favorable in this region",
    ],
    tips: ["Ensure proper irrigation channels", "Use SRI method for better yield", "Apply urea in split doses"],
    fertilizer: 12000,
    seed: 8000,
    irrigation: 15000,
    labor: 10000,
  },
  {
    name: "Wheat",
    price: 2015,
    investment: 35000,
    yield: 28,
    reasons: [
      "Soil has good drainage suitable for wheat",
      "Temperature is within optimal range",
      "Market prices are stable",
    ],
    tips: ["Sow in November for best results", "Irrigate at crown root stage"],
    fertilizer: 10000,
    seed: 6000,
    irrigation: 12000,
    labor: 7000,
  },
  {
    name: "Corn",
    price: 1850,
    investment: 30000,
    yield: 25,
    reasons: [
      "Soil nutrient levels support maize growth",
      "Adequate rainfall expected",
      "Good local market demand",
    ],
    tips: ["Plant in rows with 60cm spacing", "Monitor for stem borer"],
    fertilizer: 9000,
    seed: 5000,
    irrigation: 10000,
    labor: 6000,
  },
];

type PredictionItem = {
  crop: string;
  confidence: number;
  market_price?: number | null;
  probable_profit?: number | null;
  expected_revenue?: number | null;
  expected_yield_qtl_per_acre?: number | null;
  estimated_cost_per_acre?: number | null;
  area_acres?: number | null;
  price_status?: string;
  price_message?: string;
};

const cropAssetModules = import.meta.glob("../assets/crop images/*.{png,jpg,jpeg,webp,avif}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const cropAliases: Record<string, string> = {
  corn: "maize",
  redgram: "pigeonpeas",
  pigeonpea: "pigeonpeas",
  kidneybean: "kidneybeans",
  mothbean: "mothbeans",
  mungbean: "mungbean",
  blackgram: "blackgram",
};

const cropImageMap = Object.entries(cropAssetModules).reduce<Record<string, string>>((acc, [path, imageUrl]) => {
  const fileName = path.split("/").pop()?.split(".")[0] ?? "";
  const withoutPrefix = fileName.replace(/^crop[-_]?/i, "");
  acc[normalizeName(fileName)] = imageUrl;
  acc[normalizeName(withoutPrefix)] = imageUrl;
  return acc;
}, {});

const fallbackImage = heroFarm;

const getCropImageFromAssets = (cropName: string) => {
  const normalized = normalizeName(cropName);
  const alias = cropAliases[normalized];
  return cropImageMap[normalized] ?? (alias ? cropImageMap[normalizeName(alias)] : undefined) ?? fallbackImage;
};

const toTitleCase = (value: string) =>
  value
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const createFallbackCrop = (cropName: string) => ({
  name: toTitleCase(cropName),
  image: getCropImageFromAssets(cropName),
  price: 2000,
  investment: 35000,
  yield: 25,
  reasons: [
    "Recommended by ML model based on your NPK and weather inputs",
    "Soil and climate signals are compatible for this crop",
    "Check local market and seasonal availability before sowing",
  ],
  tips: [
    "Use certified seeds and follow local agronomy guidelines",
    "Monitor irrigation and nutrient schedule weekly",
  ],
  fertilizer: 10000,
  seed: 7000,
  irrigation: 10000,
  labor: 8000,
});

type ResultsState = {
    soilType?: string;
    latitude?: string;
    longitude?: string;
    farmSize?: string;
    unit?: string;
    weather?: { temp?: number; humidity?: number; rainfall?: number };
    predictions?: PredictionItem[];
    modelInput?: { N?: number; P?: number; K?: number };
};

const getResultsState = (locationState: unknown): ResultsState => {
  // Prefer React Router state; fall back to sessionStorage (survives Google Translate reloads)
  if (locationState && typeof locationState === "object" && "predictions" in locationState) {
    return locationState as ResultsState;
  }
  try {
    const stored = sessionStorage.getItem("resultsState");
    if (stored) return JSON.parse(stored) as ResultsState;
  } catch { /* ignore */ }
  return {};
};

const Results = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [choosingCrop, setChoosingCrop] = useState<string | null>(null);
  const state = getResultsState(location.state);

  const handleChooseCrop = async (cropName: string) => {
    setChoosingCrop(cropName);
    const farmerRaw = localStorage.getItem("farmer");
    const farmerPhone = farmerRaw ? JSON.parse(farmerRaw)?.phone ?? "" : "";
    try {
      const now = new Date();
      const res = await fetch("http://127.0.0.1:5000/cultivation-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crop: cropName,
          soil_type: state.soilType ?? "Loamy",
          weather: state.weather ?? {},
          farm_size: Number(state.farmSize) || 1,
          unit: state.unit ?? "Acres",
          start_date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
          phone: farmerPhone,
          latitude: Number(state.latitude) || undefined,
          longitude: Number(state.longitude) || undefined,
          nitrogen: state.modelInput?.N ?? undefined,
          phosphorus: state.modelInput?.P ?? undefined,
          potassium: state.modelInput?.K ?? undefined,
        }),
      });
      const data = await res.json();
      if (data.schedule) {
        const calendarState = {
            crop: cropName,
            soil_type: state.soilType,
            weather: state.weather,
            farm_size: Number(state.farmSize) || 1,
            unit: state.unit,
            schedule: data.schedule,
            source: data.source,
            start_date: data.start_date,
        };
        sessionStorage.setItem("calendarState", JSON.stringify(calendarState));
        navigate("/calendar", { state: calendarState });
      } else {
        toast.error("Failed to generate cultivation plan.");
      }
    } catch {
      toast.error("Could not reach the backend. Make sure the server is running.");
    } finally {
      setChoosingCrop(null);
    }
  };

  const predictions = state.predictions ?? [];
  const cropData = predictions.map((prediction) => {
    const matchedCrop = cropCatalog.find(
      (entry) => entry.name.toLowerCase() === prediction.crop.toLowerCase(),
    );
    const displayName = matchedCrop?.name ?? prediction.crop;
    const base = matchedCrop ?? createFallbackCrop(prediction.crop);
    const areaAcres = Number(prediction.area_acres ?? 1) || 1;
    const marketPrice = prediction.market_price ?? base.price ?? 0;
    const predictedInvestment = prediction.estimated_cost_per_acre != null
      ? Number(prediction.estimated_cost_per_acre) * areaAcres
      : base.investment;
    const totalInvestment = predictedInvestment ?? 30000;
    const predictedYield = prediction.expected_yield_qtl_per_acre ?? base.yield;

    // Distribute investment across 4 cost components proportionally
    const baseFert = base.fertilizer;
    const baseSeed = base.seed;
    const baseIrr = base.irrigation;
    const baseLab = base.labor;
    const baseTotal = baseFert + baseSeed + baseIrr + baseLab;
    const ratio = baseTotal > 0 ? totalInvestment / baseTotal : 1;

    const hasPriceData = prediction.price_status === "ok" && prediction.market_price != null;

    return {
      ...base,
      image: getCropImageFromAssets(displayName),
      confidence: prediction.confidence,
      price: marketPrice,
      investment: totalInvestment,
      yield: predictedYield ?? 20,
      areaAcres,
      fertilizer: Math.round(baseFert * ratio),
      seed: Math.round(baseSeed * ratio),
      irrigation: Math.round(baseIrr * ratio),
      labor: Math.round(baseLab * ratio),
      probableProfit: prediction.probable_profit,
      expectedRevenue: prediction.expected_revenue,
      priceStatus: prediction.price_status,
      priceMessage: prediction.price_message,
      hasPriceData,
    };
  });

  if (!predictions.length) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-card">
          <p className="text-lg font-semibold">No prediction data found</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Please go back and run crop prediction from the dashboard.
          </p>
          <Button className="mt-4" variant="hero" onClick={() => navigate("/dashboard")}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-hero px-4 py-4">
        <div className="container mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-primary-foreground" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-primary-foreground">🌾 Crop Recommendations</h1>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {state && (
          <div className="mb-6 rounded-lg bg-muted p-4 text-sm">
            <p><span className="font-semibold">Soil:</span> {state.soilType} · <span className="font-semibold">Farm:</span> {state.farmSize} {state.unit} · <span className="font-semibold">Temp:</span> {state.weather?.temp}°C</p>
          </div>
        )}

        <h2 className="mb-6 text-2xl font-bold">Top 3 Recommended Crops</h2>

        <div className="grid gap-6 md:grid-cols-3">
          {cropData.map((crop, i) => (
            <motion.div
              key={crop.name}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.15 }}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/crop/${crop.name.toLowerCase()}`, { state: { crop, farmState: state } })}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/crop/${crop.name.toLowerCase()}`, { state: { crop, farmState: state } }); } }}
              className="cursor-pointer overflow-hidden rounded-xl border bg-card shadow-card transition-all hover:shadow-elevated hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2"
            >
              <div className="h-40 overflow-hidden bg-primary/5">
                <img
                  src={crop.image}
                  alt={crop.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="p-5">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xl font-bold">🌾 {crop.name}</h3>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                    crop.confidence >= 80 ? "bg-primary/10 text-primary" : "bg-warning/10 text-warning"
                  }`}>
                    {crop.confidence}%
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {crop.hasPriceData
                    ? `₹${crop.price.toLocaleString()} / Quintal`
                    : "Market price not available"}
                </p>
                {!crop.hasPriceData && (
                  <p className="mt-1 text-xs text-warning">Profit & investment data unavailable without market price</p>
                )}
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="hero"
                    size="sm"
                    className="flex-1 gap-1.5 text-xs"
                    disabled={choosingCrop !== null}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleChooseCrop(crop.name);
                    }}
                  >
                    {choosingCrop === crop.name ? (
                      <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</>
                    ) : (
                      <><CalendarDays className="h-3 w-3" /> Choose Crop</>
                    )}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Tap card for detailed analysis →</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Comparison */}
        <div className="mt-12 rounded-xl border bg-card p-6 shadow-card">
          <h3 className="mb-6 text-lg font-bold">📊 Profit Comparison</h3>
          <div className="space-y-4">
            {cropData.map((crop) => {
              if (!crop.hasPriceData) {
                return (
                  <div key={crop.name}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">{crop.name}</span>
                      <span className="text-xs text-muted-foreground">Price data unavailable</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-muted" />
                  </div>
                );
              }
              const fallbackProfit = crop.price * crop.yield - crop.investment;
              const profit = crop.probableProfit ?? fallbackProfit;
              const maxProfit = Math.max(...cropData.map(c => c.probableProfit ?? (c.price * c.yield - c.investment)), 1);
              const widthPct = Math.max(0, Math.min(100, (profit / maxProfit) * 100));
              return (
                <div key={crop.name}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium">{crop.name}</span>
                    <span className="font-bold text-primary">₹{profit.toLocaleString()}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${widthPct}%` }}
                      transition={{ duration: 0.8, delay: 0.3 }}
                      className="h-full rounded-full gradient-hero"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Results;
