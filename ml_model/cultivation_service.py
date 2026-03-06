"""
Cultivation Plan Service — uses Google Gemini to generate a structured
farming activity calendar for a given crop.
"""

import json
import os
import re
from datetime import datetime, timedelta

try:
    import google.generativeai as genai
except ImportError:
    genai = None  # graceful fallback


# ---------------------------------------------------------------------------
# Activity‑type catalogue (kept in‑sync with the frontend legend)
# ---------------------------------------------------------------------------
ACTIVITY_TYPES = [
    "Watering",
    "Fertilizing",
    "Inspection",
    "Pest Control",
    "Soil Testing",
]


def _configure_gemini():
    """Lazily configure the Gemini client."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key or genai is None:
        return None
    genai.configure(api_key=api_key)
    return genai.GenerativeModel("gemini-2.0-flash")


def _build_prompt(
    crop: str,
    soil_type: str,
    weather: dict,
    farm_size: float,
    unit: str,
    start_date: str,
) -> str:
    """Build a detailed prompt asking Gemini for a JSON cultivation calendar."""
    return f"""You are an expert agronomist AI assistant. Generate a detailed 90-day farming activity schedule for a farmer.

Crop: {crop}
Soil type: {soil_type}
Weather — Temperature: {weather.get('temp', 'N/A')}°C, Humidity: {weather.get('humidity', 'N/A')}%, Rainfall: {weather.get('rainfall', 'N/A')} mm
Farm size: {farm_size} {unit}
Start date: {start_date}

Produce a JSON array of daily schedule entries. Each entry has:
- "date": the ISO date string (YYYY-MM-DD)
- "tasks": an array of task objects, each with:
  - "type": one of {json.dumps(ACTIVITY_TYPES)}
  - "title": a short actionable title (max 8 words)
  - "description": a 1–2 sentence practical instruction

Rules:
1. Cover all 90 days from the start date.
2. Every day MUST have at least one task.
3. Watering should be daily or almost daily depending on crop/weather.
4. Fertilizing typically every 10–20 days.
5. Inspection every 3–5 days.
6. Pest Control every 7–14 days.
7. Soil Testing at day 1, day 30, and day 60.
8. Tailor the schedule to the specific crop growth stages (germination, vegetative, flowering, maturity).
9. Return ONLY the JSON array — no markdown fences, no commentary.
"""


def _parse_gemini_response(text: str) -> list:
    """Extract the JSON array from Gemini's response text."""
    # Strip markdown code fences if present
    cleaned = re.sub(r"```(?:json)?\s*", "", text).strip()
    cleaned = re.sub(r"```\s*$", "", cleaned).strip()
    try:
        data = json.loads(cleaned)
        if isinstance(data, list):
            return data
    except json.JSONDecodeError:
        # Try to find a JSON array in the text
        match = re.search(r"\[.*\]", cleaned, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
    return []


def _generate_fallback_schedule(crop: str, start_date: str) -> list:
    """Generate a sensible offline fallback schedule when Gemini is unavailable."""
    base = datetime.strptime(start_date, "%Y-%m-%d")
    schedule = []

    phases = [
        (0, 14, "Germination"),
        (15, 45, "Vegetative Growth"),
        (46, 70, "Flowering & Fruiting"),
        (71, 89, "Maturity & Harvest"),
    ]

    for day_offset in range(90):
        current_date = base + timedelta(days=day_offset)
        date_str = current_date.strftime("%Y-%m-%d")
        tasks = []

        # Determine phase
        phase = "Growth"
        for s, e, p in phases:
            if s <= day_offset <= e:
                phase = p
                break

        # Watering — daily
        tasks.append(
            {
                "type": "Watering",
                "title": f"Water {crop} crop",
                "description": f"Provide adequate irrigation for {crop} during {phase.lower()} phase.",
            }
        )

        # Fertilizing — every 14 days
        if day_offset % 14 == 0:
            fert_map = {
                "Germination": "Apply starter fertilizer with balanced NPK",
                "Vegetative Growth": "Apply nitrogen-rich fertilizer for leaf growth",
                "Flowering & Fruiting": "Apply phosphorus-potassium booster",
                "Maturity & Harvest": "Light foliar feed if needed",
            }
            tasks.append(
                {
                    "type": "Fertilizing",
                    "title": f"Fertilize {crop} field",
                    "description": fert_map.get(phase, "Apply suitable fertilizer."),
                }
            )

        # Inspection — every 4 days
        if day_offset % 4 == 0:
            tasks.append(
                {
                    "type": "Inspection",
                    "title": f"Inspect {crop} plants",
                    "description": f"Check plant health, leaf color, and growth progress during {phase.lower()} stage.",
                }
            )

        # Pest Control — every 10 days
        if day_offset % 10 == 0:
            tasks.append(
                {
                    "type": "Pest Control",
                    "title": "Apply pest management",
                    "description": f"Scout for pests and diseases. Apply organic/chemical treatment if needed for {crop}.",
                }
            )

        # Soil Testing — day 0, 30, 60
        if day_offset in (0, 30, 60):
            tasks.append(
                {
                    "type": "Soil Testing",
                    "title": "Conduct soil test",
                    "description": "Collect soil samples and test pH, N, P, K levels. Adjust fertilizer plan accordingly.",
                }
            )

        schedule.append({"date": date_str, "tasks": tasks})

    return schedule


def generate_cultivation_plan(
    crop: str,
    soil_type: str = "Loamy",
    weather: dict | None = None,
    farm_size: float = 1,
    unit: str = "Acres",
    start_date: str | None = None,
) -> dict:
    """
    Main entry point — returns a dict with:
      status, source, crop, start_date, schedule (list of day objects)
    """
    if weather is None:
        weather = {}
    if not start_date:
        start_date = datetime.now().strftime("%Y-%m-%d")

    model = _configure_gemini()

    if model is not None:
        try:
            prompt = _build_prompt(
                crop, soil_type, weather, farm_size, unit, start_date
            )
            response = model.generate_content(prompt)
            schedule = _parse_gemini_response(response.text)
            if schedule:
                return {
                    "status": "ok",
                    "source": "gemini",
                    "crop": crop,
                    "start_date": start_date,
                    "schedule": schedule,
                }
        except Exception as exc:
            print(f"[cultivation_service] Gemini call failed: {exc}")

    # Fallback
    schedule = _generate_fallback_schedule(crop, start_date)
    return {
        "status": "ok",
        "source": "fallback",
        "crop": crop,
        "start_date": start_date,
        "schedule": schedule,
    }
