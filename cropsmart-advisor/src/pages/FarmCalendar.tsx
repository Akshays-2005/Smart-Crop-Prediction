import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Leaf,
  Search,
  Bug,
  FlaskConical,
  Bell,
  CalendarDays,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
type Task = {
  type: string;
  title: string;
  description: string;
};

type DaySchedule = {
  date: string; // YYYY-MM-DD
  tasks: Task[];
};

type CalendarState = {
  crop: string;
  soil_type?: string;
  weather?: { temp?: number; humidity?: number; rainfall?: number };
  farm_size?: number;
  unit?: string;
  schedule?: DaySchedule[];
  source?: string;
};

/* ------------------------------------------------------------------ */
/* Activity‑type config (colours + icons)                              */
/* ------------------------------------------------------------------ */
const ACTIVITY_META: Record<string, { color: string; bg: string; dot: string; Icon: typeof Droplets }> = {
  Watering:      { color: "text-blue-600",   bg: "bg-blue-100",    dot: "bg-blue-500",   Icon: Droplets },
  Fertilizing:   { color: "text-amber-600",  bg: "bg-amber-100",   dot: "bg-amber-500",  Icon: Leaf },
  Inspection:    { color: "text-emerald-600", bg: "bg-emerald-100", dot: "bg-emerald-500", Icon: Search },
  "Pest Control": { color: "text-purple-600", bg: "bg-purple-100",  dot: "bg-purple-500",  Icon: Bug },
  "Soil Testing": { color: "text-rose-600",   bg: "bg-rose-100",    dot: "bg-rose-500",    Icon: FlaskConical },
};

const activityKeys = Object.keys(ACTIVITY_META);

const getMeta = (type: string) =>
  ACTIVITY_META[type] ?? { color: "text-gray-600", bg: "bg-gray-100", dot: "bg-gray-500", Icon: CalendarDays };

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Build a map  dateStr → DaySchedule  for O(1) lookups. */
const buildScheduleMap = (schedule: DaySchedule[]) => {
  const map = new Map<string, DaySchedule>();
  schedule.forEach((d) => map.set(d.date, d));
  return map;
};

/** Is the date today (local time)? */
const isToday = (d: Date) => {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

/** Zero‑padded YYYY‑MM‑DD from a Date. */
const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
const FarmCalendar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state as CalendarState | null) ?? ({} as CalendarState);

  const [loading, setLoading] = useState(!routeState.schedule);
  const [schedule, setSchedule] = useState<DaySchedule[]>(routeState.schedule ?? []);
  const [source, setSource] = useState(routeState.source ?? "");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Calendar navigation — month/year
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0‑indexed

  // Notification state
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  /* ---------- Fetch schedule from backend if not passed via state ---------- */
  useEffect(() => {
    if (schedule.length > 0) return; // already loaded
    if (!routeState.crop) {
      toast.error("No crop selected. Please go back and choose a crop.");
      return;
    }

    const fetchPlan = async () => {
      setLoading(true);
      try {
        const res = await fetch("http://127.0.0.1:5000/cultivation-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            crop: routeState.crop,
            soil_type: routeState.soil_type,
            weather: routeState.weather,
            farm_size: routeState.farm_size,
            unit: routeState.unit,
          }),
        });
        const data = await res.json();
        if (data.schedule) {
          setSchedule(data.schedule);
          setSource(data.source ?? "backend");
        } else {
          toast.error("Failed to generate cultivation plan.");
        }
      } catch {
        toast.error("Could not reach the backend. Make sure the server is running.");
      } finally {
        setLoading(false);
      }
    };
    fetchPlan();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleMap = useMemo(() => buildScheduleMap(schedule), [schedule]);

  /* ---------- Calendar grid computation ---------- */
  const firstDay = new Date(viewYear, viewMonth, 1);
  const startDow = firstDay.getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const calendarCells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(new Date(viewYear, viewMonth, d));
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };

  /* ---------- Selected day tasks ---------- */
  const selectedDaySchedule = selectedDate ? scheduleMap.get(selectedDate) : null;

  /* ---------- Today's tasks for notification banner ---------- */
  const todayStr = toDateStr(today);
  const todaySchedule = scheduleMap.get(todayStr);

  /* ---------- Enable browser notifications ---------- */
  const enableNotifications = () => {
    if (!("Notification" in window)) {
      toast.error("Your browser does not support notifications.");
      return;
    }
    Notification.requestPermission().then((perm) => {
      if (perm === "granted") {
        setNotificationsEnabled(true);
        toast.success("Daily notifications enabled!");
        // Show today's tasks immediately
        if (todaySchedule) {
          const taskSummary = todaySchedule.tasks.map((t) => `• ${t.title}`).join("\n");
          new Notification(`🌾 Today's Farm Tasks — ${routeState.crop}`, {
            body: taskSummary,
            icon: "/robots.txt", // placeholder
          });
        }
      } else {
        toast.error("Notification permission denied.");
      }
    });
  };

  /* ---------- Periodic notification check (every hour) ---------- */
  useEffect(() => {
    if (!notificationsEnabled || !todaySchedule) return;
    const interval = setInterval(() => {
      const tasks = todaySchedule.tasks;
      if (tasks.length > 0) {
        new Notification(`🌾 Reminder — ${routeState.crop}`, {
          body: tasks.map((t) => `• ${t.title}`).join("\n"),
        });
      }
    }, 3600_000); // every hour
    return () => clearInterval(interval);
  }, [notificationsEnabled, todaySchedule, routeState.crop]);

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-lg font-semibold">Generating your farming calendar…</p>
          <p className="text-sm text-muted-foreground">AI is building a 90-day schedule for {routeState.crop}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Header */}
      <header className="gradient-hero px-4 py-4">
        <div className="container mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-primary-foreground" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-primary-foreground">
              🗓️ Farm Activity Calendar
            </h1>
            <p className="text-xs text-primary-foreground/70">
              Plan and track your daily farming activities
              {source === "gemini" ? " (AI‑generated)" : source === "fallback" ? " (template)" : ""}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className={`gap-1 text-xs text-primary-foreground ${notificationsEnabled ? "opacity-60" : ""}`}
            onClick={enableNotifications}
            disabled={notificationsEnabled}
          >
            <Bell className="h-4 w-4" />
            {notificationsEnabled ? "Enabled" : "Notify Me"}
          </Button>
        </div>
      </header>

      {/* Today's tasks banner */}
      {todaySchedule && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="container mx-auto mt-4 px-4"
        >
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <h3 className="mb-2 text-sm font-bold text-primary">📋 Today's Tasks — {todayStr}</h3>
            <div className="flex flex-wrap gap-2">
              {todaySchedule.tasks.map((task, i) => {
                const meta = getMeta(task.type);
                return (
                  <span key={i} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${meta.bg} ${meta.color}`}>
                    <meta.Icon className="h-3 w-3" />
                    {task.title}
                  </span>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      <div className="container mx-auto px-4 py-6">
        {/* Calendar card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border bg-card p-6 shadow-card"
        >
          {/* Legend */}
          <div className="mb-4 flex flex-wrap items-center gap-4 text-xs">
            {activityKeys.map((key) => {
              const meta = ACTIVITY_META[key];
              return (
                <span key={key} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                  {key}
                </span>
              );
            })}
          </div>

          {/* Month navigation */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">{routeState.crop} — Schedule</h2>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={prevMonth}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <span className="min-w-[160px] text-center font-bold text-primary">
                {MONTH_NAMES[viewMonth]} {viewYear}
              </span>
              <Button variant="ghost" size="icon" onClick={nextMonth}>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Day‑of‑week header */}
          <div className="grid grid-cols-7 gap-px text-center text-xs font-semibold text-muted-foreground">
            {DAY_LABELS.map((d) => (
              <div key={d} className="py-2">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-px">
            {calendarCells.map((cell, idx) => {
              if (!cell) {
                return <div key={`empty-${idx}`} className="min-h-[90px] rounded-lg bg-muted/30" />;
              }
              const dateStr = toDateStr(cell);
              const dayData = scheduleMap.get(dateStr);
              const isTodayCell = isToday(cell);
              const isSelected = selectedDate === dateStr;
              const hasTask = dayData && dayData.tasks.length > 0;

              // Collect unique activity dots
              const uniqueTypes = [...new Set((dayData?.tasks ?? []).map((t) => t.type))];

              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={`relative min-h-[110px] rounded-lg border p-2 text-left transition-all hover:bg-primary/5
                    ${isTodayCell ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-transparent"}
                    ${isSelected ? "ring-2 ring-primary shadow-card" : ""}
                  `}
                >
                  <span className={`text-xs font-semibold ${isTodayCell ? "text-primary" : "text-foreground/70"}`}>
                    {cell.getDate()}
                  </span>

                  {/* Activity dots & mini labels */}
                  {hasTask && (
                    <div className="mt-1 flex flex-col gap-1">
                      {uniqueTypes.slice(0, 3).map((type) => {
                        const meta = getMeta(type);
                        const count = dayData!.tasks.filter((t) => t.type === type).length;
                        return (
                          <span key={type} className={`block truncate rounded-md px-2 py-1 text-sm font-semibold leading-normal ${meta.bg} ${meta.color}`}>
                            {type.split(" ")[0]}{count > 1 ? ` ×${count}` : ""}
                          </span>
                        );
                      })}
                      {uniqueTypes.length > 3 && (
                        <span className="text-xs text-muted-foreground">+{uniqueTypes.length - 3} more</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* Selected day detail panel */}
        <AnimatePresence>
          {selectedDaySchedule && (
            <motion.div
              key={selectedDate}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="mt-6 rounded-xl border bg-card p-6 shadow-card"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold">
                  📅 Tasks for {selectedDate}
                </h3>
                <Button variant="ghost" size="icon" onClick={() => setSelectedDate(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-3">
                {selectedDaySchedule.tasks.map((task, i) => {
                  const meta = getMeta(task.type);
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className={`flex items-start gap-3 rounded-lg border p-4 ${meta.bg}/30`}
                    >
                      <div className={`mt-0.5 rounded-lg p-2 ${meta.bg}`}>
                        <meta.Icon className={`h-5 w-5 ${meta.color}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${meta.bg} ${meta.color}`}>
                            {task.type}
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-semibold">{task.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{task.description}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick stats */}
        {schedule.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5"
          >
            {activityKeys.map((key) => {
              const meta = ACTIVITY_META[key];
              const count = schedule.reduce(
                (sum, day) => sum + day.tasks.filter((t) => t.type === key).length,
                0,
              );
              return (
                <div key={key} className="flex flex-col items-center rounded-xl border bg-card p-4 shadow-card">
                  <div className={`rounded-lg p-2 ${meta.bg}`}>
                    <meta.Icon className={`h-5 w-5 ${meta.color}`} />
                  </div>
                  <span className="mt-2 text-2xl font-extrabold">{count}</span>
                  <span className="text-xs text-muted-foreground">{key}</span>
                </div>
              );
            })}
          </motion.div>
        )}

        {/* Back to results button */}
        <div className="mt-8 flex justify-center">
          <Button variant="hero" className="h-12 px-8 text-base" onClick={() => navigate(-1)}>
            ← Back to Recommendations
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FarmCalendar;
