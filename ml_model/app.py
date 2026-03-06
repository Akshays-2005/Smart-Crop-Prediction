from flask import Flask, request, jsonify
from flask_cors import CORS
import os
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

    result = generate_cultivation_plan(
        crop=crop,
        soil_type=soil_type,
        weather=weather,
        farm_size=farm_size,
        unit=unit,
        start_date=start_date,
    )
    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True)
