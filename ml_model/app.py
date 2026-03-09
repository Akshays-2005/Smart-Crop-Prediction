from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
import sqlite3
from datetime import datetime, timedelta
import pickle
import pandas as pd
import numpy as np
from market_price_service import MarketPriceService
from cultivation_service import generate_cultivation_plan

try:
    from twilio.rest import Client
except Exception:
    Client = None

app = Flask(__name__)
CORS(app)

model = pickle.load(open("crop_model.pkl", "rb"))
db_path = os.path.join(os.path.dirname(__file__), "farmers.db")


def load_env_file(file_path):
    if not os.path.exists(file_path):
        return

    with open(file_path, "r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")

            if key and (key not in os.environ or not os.environ.get(key)):
                os.environ[key] = value


load_env_file(os.path.join(os.path.dirname(__file__), ".env"))

twilio_account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
twilio_auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
twilio_verify_service_sid = os.getenv("TWILIO_VERIFY_SERVICE_SID", "")
twilio_default_country_code = os.getenv("TWILIO_DEFAULT_COUNTRY_CODE", "+91")

columns = ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]
market_price_service = MarketPriceService()


def get_db_connection():
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    connection = get_db_connection()
    cursor = connection.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS farmers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS otp_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            otp TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS cultivation_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT NOT NULL,
            crop TEXT NOT NULL,
            soil_type TEXT,
            weather_json TEXT,
            farm_size REAL,
            unit TEXT,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            schedule_json TEXT NOT NULL,
            source TEXT,
            created_at TEXT NOT NULL,
            latitude REAL,
            longitude REAL,
            nitrogen REAL,
            phosphorus REAL,
            potassium REAL
        )
        """
    )
    # Add columns if they don't exist (for existing DBs)
    for col, coltype in [
        ("latitude", "REAL"),
        ("longitude", "REAL"),
        ("nitrogen", "REAL"),
        ("phosphorus", "REAL"),
        ("potassium", "REAL"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE cultivation_plans ADD COLUMN {col} {coltype}")
        except Exception:
            pass  # column already exists

    # Ensure telegram_links has a preferred_language column
    try:
        cursor.execute(
            "ALTER TABLE telegram_links ADD COLUMN preferred_language TEXT DEFAULT 'en'"
        )
    except Exception:
        pass  # column already exists

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS crop_photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT NOT NULL,
            date TEXT NOT NULL,
            filename TEXT NOT NULL,
            created_at TEXT NOT NULL,
            analysis TEXT
        )
        """
    )

    # Add analysis column if missing (existing databases)
    try:
        cursor.execute("ALTER TABLE crop_photos ADD COLUMN analysis TEXT")
    except Exception:
        pass  # column already exists

    connection.commit()
    connection.close()


def normalize_phone(phone):
    return "".join(ch for ch in str(phone) if ch.isdigit())


def is_valid_10_digit_phone(phone):
    return len(phone) == 10 and phone.isdigit()


def to_e164_phone(phone):
    return f"{twilio_default_country_code}{phone}"


def send_otp_via_verify(phone):
    if not (
        twilio_account_sid
        and twilio_auth_token
        and twilio_verify_service_sid
        and Client
    ):
        return False, "Twilio is not configured."

    try:
        client = Client(twilio_account_sid, twilio_auth_token)
        e164_phone = to_e164_phone(phone)
        client.verify.v2.services(twilio_verify_service_sid).verifications.create(
            to=e164_phone,
            channel="sms",
        )
        return True, "OTP sent"
    except Exception as error:
        return False, f"Twilio send failed: {str(error)}"


def verify_otp_via_verify(phone, otp):
    if not (
        twilio_account_sid
        and twilio_auth_token
        and twilio_verify_service_sid
        and Client
    ):
        return False, "Twilio is not configured."

    try:
        client = Client(twilio_account_sid, twilio_auth_token)
        e164_phone = to_e164_phone(phone)
        result = client.verify.v2.services(
            twilio_verify_service_sid
        ).verification_checks.create(
            to=e164_phone,
            code=otp,
        )
        if result.status == "approved":
            return True, "approved"
        return False, "Invalid or expired OTP"
    except Exception as error:
        return False, f"Twilio verify failed: {str(error)}"


init_db()


@app.route("/")
def home():
    return "Crop Prediction API running"


@app.route("/auth/send-otp", methods=["POST"])
def send_otp():
    data = request.json or {}
    name = str(data.get("name", "")).strip()
    phone = normalize_phone(data.get("phone", ""))

    if not name or not phone:
        return jsonify({"error": "Name and phone are required"}), 400

    if not is_valid_10_digit_phone(phone):
        return jsonify({"error": "Phone number must be exactly 10 digits"}), 400

    expires_at = (datetime.utcnow() + timedelta(minutes=5)).isoformat()
    created_at = datetime.utcnow().isoformat()

    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute("DELETE FROM otp_requests WHERE phone = ?", (phone,))
    cursor.execute(
        "INSERT INTO otp_requests (name, phone, otp, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
        (name, phone, "twilio_verify", expires_at, created_at),
    )
    connection.commit()
    connection.close()

    sent, message = send_otp_via_verify(phone)
    if not sent:
        return jsonify({"error": message}), 500

    return jsonify({"message": f"OTP sent to {phone}"})


@app.route("/auth/verify-otp", methods=["POST"])
def verify_otp():
    data = request.json or {}
    name = str(data.get("name", "")).strip()
    phone = normalize_phone(data.get("phone", ""))
    otp = str(data.get("otp", "")).strip()

    if not name or not phone or not otp:
        return jsonify({"error": "Name, phone and otp are required"}), 400

    if not is_valid_10_digit_phone(phone):
        return jsonify({"error": "Phone number must be exactly 10 digits"}), 400

    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute(
        "SELECT * FROM otp_requests WHERE phone = ? ORDER BY created_at DESC LIMIT 1",
        (phone,),
    )
    otp_row = cursor.fetchone()

    if not otp_row:
        connection.close()
        return jsonify({"error": "OTP not found. Please request a new OTP."}), 404

    if datetime.fromisoformat(otp_row["expires_at"]) < datetime.utcnow():
        connection.close()
        return jsonify({"error": "OTP expired. Please request a new OTP."}), 401

    connection.close()

    is_verified, verify_message = verify_otp_via_verify(phone, otp)
    if not is_verified:
        return jsonify({"error": verify_message}), 401

    connection = get_db_connection()
    cursor = connection.cursor()

    cursor.execute(
        "INSERT OR REPLACE INTO farmers (id, name, phone, created_at) VALUES ((SELECT id FROM farmers WHERE phone = ?), ?, ?, COALESCE((SELECT created_at FROM farmers WHERE phone = ?), ?))",
        (phone, name, phone, phone, datetime.utcnow().isoformat()),
    )
    cursor.execute("DELETE FROM otp_requests WHERE phone = ?", (phone,))
    connection.commit()

    cursor.execute(
        "SELECT id, name, phone, created_at FROM farmers WHERE phone = ?", (phone,)
    )
    farmer = cursor.fetchone()
    connection.close()

    return jsonify(
        {
            "message": "Registration verified",
            "farmer": dict(farmer) if farmer else None,
        }
    )


@app.route("/auth/login", methods=["POST"])
def login():
    data = request.json or {}
    phone = normalize_phone(data.get("phone", ""))

    if not phone:
        return jsonify({"error": "Phone is required"}), 400

    if not is_valid_10_digit_phone(phone):
        return jsonify({"error": "Phone number must be exactly 10 digits"}), 400

    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute(
        "SELECT id, name, phone, created_at FROM farmers WHERE phone = ?", (phone,)
    )
    farmer = cursor.fetchone()
    connection.close()

    if not farmer:
        return jsonify({"error": "Phone number not registered"}), 404

    return jsonify(
        {
            "message": "Login successful",
            "farmer": dict(farmer),
            "active_plan": _get_active_plan(phone),
        }
    )


@app.route("/predict", methods=["POST"])
def predict():

    data = request.json
    farm_size = float(data.get("farm_size", 1) or 1)
    unit = str(data.get("unit", "Acres") or "Acres")

    input_data = pd.DataFrame(
        [
            [
                data["N"],
                data["P"],
                data["K"],
                data["temperature"],
                data["humidity"],
                data["ph"],
                data["rainfall"],
            ]
        ],
        columns=columns,
    )

    probs = model.predict_proba(input_data)[0]
    crops = model.classes_

    top3_idx = np.argsort(probs)[::-1]  # sort all crops by probability

    results = []

    for i in top3_idx:
        if probs[i] > 0:  # skip 0% crops
            enriched = market_price_service.enrich_prediction(
                crop=str(crops[i]),
                confidence=round(float(probs[i]) * 100, 2),
                farm_size=farm_size,
                unit=unit,
            )
            results.append(enriched)

        if len(results) == 3:  # stop after 3 crops
            break

    return jsonify(results)


@app.route("/cultivation-plan", methods=["POST"])
def cultivation_plan():
    """Generate a 90-day AI cultivation calendar for a chosen crop."""
    data = request.json or {}
    crop = str(data.get("crop", "")).strip()
    if not crop:
        return jsonify({"error": "crop is required"}), 400

    soil_type = str(data.get("soil_type", "Loamy"))
    weather = data.get("weather") or {}
    farm_size = float(data.get("farm_size", 1) or 1)
    unit = str(data.get("unit", "Acres") or "Acres")
    start_date = data.get("start_date")  # optional, defaults to today

    latitude = data.get("latitude")
    longitude = data.get("longitude")
    nitrogen = data.get("nitrogen")
    phosphorus = data.get("phosphorus")
    potassium = data.get("potassium")

    result = generate_cultivation_plan(
        crop=crop,
        soil_type=soil_type,
        weather=weather,
        farm_size=farm_size,
        unit=unit,
        start_date=start_date,
    )

    # Auto-persist if phone provided
    phone = str(data.get("phone", "")).strip()
    if phone and result.get("schedule"):
        _save_plan(
            phone,
            crop,
            soil_type,
            weather,
            farm_size,
            unit,
            result,
            latitude=latitude,
            longitude=longitude,
            nitrogen=nitrogen,
            phosphorus=phosphorus,
            potassium=potassium,
        )

    return jsonify(result)


def _save_plan(
    phone,
    crop,
    soil_type,
    weather,
    farm_size,
    unit,
    result,
    latitude=None,
    longitude=None,
    nitrogen=None,
    phosphorus=None,
    potassium=None,
):
    """Persist a cultivation plan for a farmer."""
    import json as _json

    schedule = result.get("schedule", [])
    start_date = result.get("start_date", "")
    # Compute end date from last schedule entry
    end_date = schedule[-1]["date"] if schedule else start_date
    connection = get_db_connection()
    cursor = connection.cursor()
    # Remove any old plan for this farmer
    cursor.execute("DELETE FROM cultivation_plans WHERE phone = ?", (phone,))
    cursor.execute(
        """INSERT INTO cultivation_plans
           (phone, crop, soil_type, weather_json, farm_size, unit, start_date, end_date, schedule_json, source, created_at, latitude, longitude, nitrogen, phosphorus, potassium)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            phone,
            crop,
            soil_type,
            _json.dumps(weather),
            farm_size,
            unit,
            start_date,
            end_date,
            _json.dumps(schedule),
            result.get("source", ""),
            datetime.now().isoformat(),
            float(latitude) if latitude is not None else None,
            float(longitude) if longitude is not None else None,
            float(nitrogen) if nitrogen is not None else None,
            float(phosphorus) if phosphorus is not None else None,
            float(potassium) if potassium is not None else None,
        ),
    )
    connection.commit()
    connection.close()


def _get_active_plan(phone):
    """Return the active cultivation plan for a farmer, or None."""
    import json as _json

    today = datetime.now().strftime("%Y-%m-%d")
    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute(
        "SELECT * FROM cultivation_plans WHERE phone = ? AND end_date >= ? ORDER BY created_at DESC LIMIT 1",
        (phone, today),
    )
    row = cursor.fetchone()
    connection.close()
    if not row:
        return None
    plan = {
        "crop": row["crop"],
        "soil_type": row["soil_type"],
        "weather": _json.loads(row["weather_json"]) if row["weather_json"] else {},
        "farm_size": row["farm_size"],
        "unit": row["unit"],
        "start_date": row["start_date"],
        "end_date": row["end_date"],
        "schedule": _json.loads(row["schedule_json"]),
        "source": row["source"],
    }
    # Include lat/lng/NPK if stored
    for col in ("latitude", "longitude", "nitrogen", "phosphorus", "potassium"):
        try:
            plan[col] = row[col]
        except (IndexError, KeyError):
            pass
    return plan


@app.route("/farmer/plan", methods=["GET"])
def get_farmer_plan():
    """Get the active cultivation plan for a farmer by phone."""
    phone = normalize_phone(request.args.get("phone", ""))
    if not phone:
        return jsonify({"error": "phone is required"}), 400
    plan = _get_active_plan(phone)
    if not plan:
        return jsonify({"active_plan": None})
    return jsonify({"active_plan": plan})


@app.route("/farmer/language", methods=["POST"])
def set_farmer_language():
    """Store the farmer's preferred language for Telegram notifications."""
    data = request.get_json(force=True)
    phone = normalize_phone(data.get("phone", ""))
    language = (data.get("language") or "en").strip().lower()

    if not phone:
        return jsonify({"error": "phone is required"}), 400

    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute(
        "UPDATE telegram_links SET preferred_language = ? WHERE phone = ?",
        (language, phone),
    )
    updated = cursor.rowcount
    connection.commit()
    connection.close()

    if updated:
        return jsonify(
            {"message": f"Language set to '{language}'", "language": language}
        )
    return (
        jsonify(
            {
                "message": "No linked Telegram account found for this phone",
                "language": language,
            }
        ),
        404,
    )


@app.route("/farmer/photos", methods=["GET"])
def get_farmer_photos():
    """Return all crop photos for a farmer, grouped by date."""
    phone = normalize_phone(request.args.get("phone", ""))
    if not phone:
        return jsonify({"error": "phone is required"}), 400

    connection = get_db_connection()
    rows = connection.execute(
        "SELECT date, filename, created_at, analysis FROM crop_photos WHERE phone = ? ORDER BY date DESC, created_at DESC",
        (phone,),
    ).fetchall()
    connection.close()

    photos = []
    for r in rows:
        analysis = None
        if r["analysis"]:
            try:
                analysis = json.loads(r["analysis"])
            except Exception:
                pass
        photos.append(
            {
                "date": r["date"],
                "filename": r["filename"],
                "url": f"/photos/{phone}/{r['filename']}",
                "created_at": r["created_at"],
                "analysis": analysis,
            }
        )
    return jsonify({"photos": photos})


@app.route("/photos/<phone>/<filename>", methods=["GET"])
def serve_photo(phone, filename):
    """Serve a crop photo from disk."""
    from flask import send_from_directory

    photo_dir = os.path.join(os.path.dirname(__file__), "crop_photos", phone)
    return send_from_directory(photo_dir, filename)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)