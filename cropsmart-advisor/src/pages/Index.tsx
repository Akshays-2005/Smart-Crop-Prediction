import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Sprout, MapPin, CloudSun, Wheat, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroFarm from "@/assets/hero-farm.jpg";

const features = [
  {
    icon: Sprout,
    title: "Smart Soil Detection",
    desc: "Upload soil images through Telegram and detect soil type using AI.",
    color: "bg-earth-light text-earth",
  },
  {
    icon: MapPin,
    title: "Farm Location Mapping",
    desc: "Locate farm on the map using GPS via Telegram.",
    color: "bg-profit-light text-profit",
  },
  {
    icon: CloudSun,
    title: "Weather Intelligence",
    desc: "Fetch real-time weather using OpenWeather API.",
    color: "bg-weather-light text-weather",
  },
  {
    icon: Wheat,
    title: "AI Crop Recommendation",
    desc: "Predict the best crops based on soil, weather, farm size, and location.",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: TrendingUp,
    title: "Market Price Insights",
    desc: "Fetch crop market price using AGMARKNET API.",
    color: "bg-warning/10 text-warning",
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const item = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const Index = () => {
  const navigate = useNavigate();
  const [showTranslator, setShowTranslator] = useState(false);

  useEffect(() => {
    (window as any).googleTranslateElementInit = () => {
      const googleWindow = (window as any).google;
      if (!googleWindow?.translate?.TranslateElement) {
        return;
      }

      const translatorRoot = document.getElementById("google_translate_element");
      if (!translatorRoot || translatorRoot.childElementCount > 0) {
        return;
      }

      new googleWindow.translate.TranslateElement(
        {
          pageLanguage: "en",
        },
        "google_translate_element",
      );
    };

    const existingScript = document.getElementById("google-translate-script");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "google-translate-script";
      script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      script.async = true;
      document.body.appendChild(script);
    } else if ((window as any).google?.translate?.TranslateElement) {
      (window as any).googleTranslateElementInit();
    }
  }, []);

  useEffect(() => {
    if (!showTranslator) {
      return;
    }

    const initFn = (window as any).googleTranslateElementInit;
    if (typeof initFn === "function") {
      setTimeout(() => initFn(), 0);
    }
  }, [showTranslator]);

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed right-4 top-4 z-50 flex flex-col items-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowTranslator((previous) => !previous)}>
          🌐 Language
        </Button>
        <div className={`rounded-md border bg-card p-2 shadow-card ${showTranslator ? "block" : "hidden"}`}>
          <div id="google_translate_element" />
        </div>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroFarm} alt="Lush farmland" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-foreground/60" />
        </div>
        <div className="relative container mx-auto flex min-h-[85vh] flex-col items-center justify-center px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <span className="mb-4 inline-block animate-float text-5xl">🌱</span>
            <h1 className="mb-4 text-4xl font-extrabold leading-tight text-primary-foreground md:text-6xl">
              Smart Crop Advisor
            </h1>
            <p className="mx-auto mb-8 max-w-xl text-lg text-primary-foreground/80 md:text-xl">
              Helping farmers choose the most profitable crops using AI
            </p>
            <Button
              variant="hero"
              size="lg"
              className="h-14 px-10 text-lg"
              onClick={() => navigate("/auth")}
            >
              🚀 Start Crop Prediction
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="mb-12 text-center text-3xl font-bold">How It Works</h2>
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((f) => (
            <motion.div
              key={f.title}
              variants={item}
              className="rounded-lg border bg-card p-6 shadow-card transition-shadow hover:shadow-elevated"
            >
              <div className={`mb-4 inline-flex rounded-lg p-3 ${f.color}`}>
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-lg font-bold">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        Smart Crop Advisor © 2026 — Empowering Farmers with AI
      </footer>
    </div>
  );
};

export default Index;
