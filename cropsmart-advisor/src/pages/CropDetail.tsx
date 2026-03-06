import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, TrendingUp, Coins, BarChart3, Lightbulb, CheckCircle, CalendarDays, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const CropDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { crop, farmState } = (location.state as any) || {};
  const [generatingPlan, setGeneratingPlan] = useState(false);

  if (!crop) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>No crop data. <button className="text-primary underline" onClick={() => navigate("/results")}>Go back</button></p>
      </div>
    );
  }

  const profit = crop.price * crop.yield - crop.investment;

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="gradient-hero px-4 py-4">
        <div className="container mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-primary-foreground" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-primary-foreground">🌾 {crop.name} — Detailed Analysis</h1>
        </div>
      </header>

      <div className="container mx-auto max-w-2xl px-4 py-8 space-y-6">
        {/* Crop Overview */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-6 rounded-xl border bg-card p-6 shadow-card">
          <img src={crop.image} alt={crop.name} className="h-24 w-24 rounded-lg object-contain bg-primary/5 p-2" />
          <div>
            <h2 className="text-2xl font-extrabold">{crop.name}</h2>
            <span className={`mt-1 inline-block rounded-full px-3 py-1 text-sm font-bold ${
              crop.confidence >= 80 ? "bg-primary/10 text-primary" : "bg-warning/10 text-warning"
            }`}>
              Confidence: {crop.confidence}%
            </span>
          </div>
        </motion.div>

        {/* Market Price */}
        <Card icon={<TrendingUp className="h-5 w-5" />} title="Market Price" color="bg-weather-light text-weather">
          <p className="text-3xl font-extrabold">₹{crop.price.toLocaleString()} <span className="text-base font-normal text-muted-foreground">/ Quintal</span></p>
          <p className="mt-1 text-xs text-muted-foreground">Source: AGMARKNET API</p>
        </Card>

        {/* Investment */}
        <Card icon={<Coins className="h-5 w-5" />} title="Investment Estimate" color="bg-earth-light text-earth">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: "Fertilizer", val: crop.fertilizer },
              { label: "Seeds", val: crop.seed },
              { label: "Irrigation", val: crop.irrigation },
              { label: "Labor", val: crop.labor },
            ].map((item) => (
              <div key={item.label} className="flex justify-between rounded-lg bg-background p-3">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-semibold">₹{item.val.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg bg-earth/10 p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Estimated Investment</p>
            <p className="text-2xl font-extrabold text-earth">₹{crop.investment.toLocaleString()}</p>
          </div>
        </Card>

        {/* Yield & Profit */}
        <Card icon={<BarChart3 className="h-5 w-5" />} title="Expected Yield & Profit" color="bg-profit-light text-profit">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="rounded-lg bg-background p-4">
              <p className="text-xs text-muted-foreground">Expected Yield</p>
              <p className="text-2xl font-extrabold">{crop.yield} <span className="text-sm font-normal">Quintals</span></p>
            </div>
            <div className="rounded-lg bg-primary/10 p-4">
              <p className="text-xs text-muted-foreground">Expected Profit</p>
              <p className={`text-2xl font-extrabold ${profit >= 0 ? "text-primary" : "text-destructive"}`}>
                ₹{profit.toLocaleString()}
              </p>
            </div>
          </div>
          {/* Profit bar */}
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Investment</span>
              <span>Revenue</span>
            </div>
            <div className="flex h-6 overflow-hidden rounded-full">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(crop.investment / (crop.price * crop.yield)) * 100}%` }}
                transition={{ duration: 0.8 }}
                className="gradient-earth"
              />
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(profit / (crop.price * crop.yield)) * 100}%` }}
                transition={{ duration: 0.8, delay: 0.3 }}
                className="gradient-hero"
              />
            </div>
          </div>
        </Card>

        {/* AI Reasoning */}
        <Card icon={<Lightbulb className="h-5 w-5" />} title={`Why ${crop.name}?`} color="bg-warning/10 text-warning">
          <ul className="space-y-3">
            {crop.reasons.map((r: string, i: number) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-start gap-2 text-sm"
              >
                <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                <span>{r}</span>
              </motion.li>
            ))}
          </ul>
        </Card>

        {/* Farming Tips */}
        <Card icon={<Lightbulb className="h-5 w-5" />} title="Farming Tips" color="bg-primary/10 text-primary">
          <ul className="space-y-2">
            {crop.tips.map((t: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 text-primary">💡</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Button variant="hero" className="h-14 w-full text-lg gap-2" disabled={generatingPlan} onClick={async () => {
          setGeneratingPlan(true);
          try {
            const res = await fetch("http://127.0.0.1:5000/cultivation-plan", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                crop: crop.name,
                soil_type: farmState?.soilType ?? "Loamy",
                weather: farmState?.weather ?? {},
                farm_size: Number(farmState?.farmSize) || 1,
                unit: farmState?.unit ?? "Acres",
              }),
            });
            const data = await res.json();
            if (data.schedule) {
              navigate("/calendar", {
                state: {
                  crop: crop.name,
                  soil_type: farmState?.soilType,
                  weather: farmState?.weather,
                  farm_size: Number(farmState?.farmSize) || 1,
                  unit: farmState?.unit,
                  schedule: data.schedule,
                  source: data.source,
                },
              });
            } else {
              toast.error("Failed to generate cultivation plan.");
            }
          } catch {
            toast.error("Could not reach the backend.");
          } finally {
            setGeneratingPlan(false);
          }
        }}>
          {generatingPlan ? (<><Loader2 className="h-5 w-5 animate-spin" /> Generating Calendar…</>) : (<><CalendarDays className="h-5 w-5" /> 📅 Choose This Crop &amp; View Calendar</>)}
        </Button>

        <Button variant="hero" className="h-14 w-full text-lg" onClick={() => navigate("/dashboard")}>
          🔄 New Prediction
        </Button>
      </div>
    </div>
  );
};

const Card = ({ icon, title, color, children }: { icon: React.ReactNode; title: string; color: string; children: React.ReactNode }) => (
  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border bg-card p-6 shadow-card">
    <div className="mb-4 flex items-center gap-2">
      <div className={`rounded-lg p-2 ${color}`}>{icon}</div>
      <h3 className="text-lg font-bold">{title}</h3>
    </div>
    {children}
  </motion.div>
);

export default CropDetail;
