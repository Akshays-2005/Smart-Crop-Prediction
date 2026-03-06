import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Phone, ArrowRight, Sprout, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const Auth = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"register" | "login">("register");

  const [name, setName] = useState("");
  const [registerPhone, setRegisterPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const [loginPhone, setLoginPhone] = useState("");

  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:5000";

  const normalizePhone = (value: string) => value.replace(/\D/g, "").trim();
  const isValidPhone = (value: string) => /^\d{10}$/.test(normalizePhone(value));

  const handleSendOtp = async () => {
    if (!name || !registerPhone) {
      toast.error("Please enter farmer name and phone number");
      return;
    }

    if (!isValidPhone(registerPhone)) {
      toast.error("Phone number must be exactly 10 digits");
      return;
    }

    setIsSendingOtp(true);
    try {
      const response = await fetch(`${apiBaseUrl}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: normalizePhone(registerPhone),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not send OTP");
      }

      setOtpSent(true);
      toast.success(`OTP sent to ${normalizePhone(registerPhone)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(message);
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpSent) {
      toast.error("Please send OTP first");
      return;
    }

    if (otp.length < 4) {
      toast.error("Enter a valid OTP");
      return;
    }

    if (!isValidPhone(registerPhone)) {
      toast.error("Phone number must be exactly 10 digits");
      return;
    }

    setIsVerifyingOtp(true);
    try {
      const response = await fetch(`${apiBaseUrl}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: normalizePhone(registerPhone),
          otp: otp.trim(),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? "OTP verification failed");
      }

      toast.success("Registration successful. Please login.");
      setLoginPhone(registerPhone);
      setOtp("");
      setActiveTab("login");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(message);
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleLogin = async () => {
    if (!loginPhone) {
      toast.error("Please enter phone number");
      return;
    }

    if (!isValidPhone(loginPhone)) {
      toast.error("Phone number must be exactly 10 digits");
      return;
    }

    setIsLoggingIn(true);
    try {
      const response = await fetch(`${apiBaseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizePhone(loginPhone) }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? "Login failed");
      }

      toast.success(`Welcome, ${payload?.farmer?.name ?? "Farmer"}!`);
      localStorage.setItem("farmer", JSON.stringify(payload.farmer));

      // If the farmer has an active cultivation plan, go straight to calendar
      if (payload.active_plan) {
        navigate("/calendar", {
          state: {
            crop: payload.active_plan.crop,
            soil_type: payload.active_plan.soil_type,
            weather: payload.active_plan.weather,
            farm_size: payload.active_plan.farm_size,
            unit: payload.active_plan.unit,
            schedule: payload.active_plan.schedule,
            source: payload.active_plan.source,
            start_date: payload.active_plan.start_date,
          },
        });
      } else {
        navigate("/dashboard", { state: { farmer: payload?.farmer } });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-xl border bg-card p-8 shadow-elevated"
      >
        <div className="mb-6 flex items-center justify-center gap-2">
          <Sprout className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-extrabold">Smart Crop Advisor</h1>
        </div>

        <div className="mb-6 grid grid-cols-2 rounded-lg bg-muted p-1">
          <button
            type="button"
            className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
              activeTab === "register" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
            onClick={() => setActiveTab("register")}
          >
            Register
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
              activeTab === "login" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
            onClick={() => setActiveTab("login")}
          >
            Login
          </button>
        </div>

        {activeTab === "register" ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Farmer Name</label>
              <div className="relative">
                <UserRound className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Enter farmer name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-12 pl-10 text-base"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="9876543210"
                  value={registerPhone}
                  onChange={(e) => setRegisterPhone(e.target.value)}
                  className="h-12 pl-10 text-base"
                  type="tel"
                  maxLength={10}
                />
              </div>
            </div>

            <Button variant="hero" className="h-12 w-full text-base" onClick={handleSendOtp} disabled={isSendingOtp}>
              {isSendingOtp ? "Sending OTP..." : "Send OTP"} <ArrowRight className="ml-1 h-5 w-5" />
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Enter the OTP sent to <span className="font-semibold text-foreground">{registerPhone || "your phone"}</span>
            </p>

            <Input
              placeholder="Enter 6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="h-14 text-center text-2xl tracking-widest"
              maxLength={6}
            />

            <Button variant="hero" className="h-12 w-full text-base" onClick={handleVerifyOtp} disabled={isVerifyingOtp || !otpSent}>
              {isVerifyingOtp ? "Verifying..." : "Verify OTP"}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              After successful verification, continue from Login tab.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="9876543210"
                  value={loginPhone}
                  onChange={(e) => setLoginPhone(e.target.value)}
                  className="h-12 pl-10 text-base"
                  type="tel"
                  maxLength={10}
                />
              </div>
            </div>

            <Button variant="hero" className="h-12 w-full text-base" onClick={handleLogin} disabled={isLoggingIn}>
              {isLoggingIn ? "Logging in..." : "Login"}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              No OTP required for login. Registered phone opens dashboard data.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Auth;
