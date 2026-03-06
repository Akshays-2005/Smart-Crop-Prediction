import os
from typing import Any

import requests


DEFAULT_AGMARKNET_RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070"

UNIT_TO_ACRE = {
    "acres": 1.0,
    "hectares": 2.47105,
    "square meters": 0.000247105,
}

DEFAULT_YIELD_QTL_PER_ACRE = {
    "rice": 32,
    "wheat": 28,
    "maize": 25,
    "corn": 25,
    "cotton": 10,
    "chickpea": 12,
    "blackgram": 8,
    "mungbean": 7,
    "pigeon peas": 8,
    "pigeonpeas": 8,
    "coffee": 6,
    "jute": 18,
    "muskmelon": 20,
    "watermelon": 25,
    "coconut": 45,
    "banana": 120,
}

DEFAULT_COST_PER_ACRE = {
    "rice": 45000,
    "wheat": 35000,
    "maize": 30000,
    "corn": 30000,
    "cotton": 38000,
    "chickpea": 26000,
    "coffee": 52000,
}

AGMARKNET_COMMODITY_ALIASES = {
    "paddy": ["Paddy", "Paddy(Dhan)(Common)", "Paddy(Dhan)(Basmati)"],
    "rice": ["Rice", "Paddy", "Paddy(Dhan)(Common)"],
    "maize": ["Maize"],
    "corn": ["Maize"],
    "muskmelon": ["Musk Melon", "Muskmelon"],
    "pigeonpeas": ["Arhar (Tur/Red Gram)(Whole)", "Arhar Dal(Tur Dal)", "Pigeon Pea"],
    "pigeon peas": ["Arhar (Tur/Red Gram)(Whole)", "Arhar Dal(Tur Dal)", "Pigeon Pea"],
    "mungbean": ["Green Gram (Moong)(Whole)", "Moong Dal"],
    "blackgram": ["Black Gram (Urd Beans)(Whole)", "Urad"],
    "chickpea": ["Bengal Gram (Gram)(Whole)", "Gram Dal"],
}


class MarketPriceService:
    def __init__(self) -> None:
        self.api_key = os.getenv("AGMARKNET_API_KEY", "").strip()
        self.resource_id = os.getenv(
            "AGMARKNET_RESOURCE_ID", DEFAULT_AGMARKNET_RESOURCE_ID
        ).strip()
        self.base_url = f"https://api.data.gov.in/resource/{self.resource_id}"

    def is_configured(self) -> bool:
        return bool(self.api_key and self.resource_id)

    def _normalize_crop_name(self, crop: str) -> str:
        return " ".join(str(crop).lower().replace("_", " ").split())

    def _to_acres(self, farm_size: float, unit: str) -> float:
        normalized_unit = str(unit or "acres").strip().lower()
        factor = UNIT_TO_ACRE.get(normalized_unit, 1.0)
        return max(farm_size, 0) * factor

    def _extract_price_from_records(
        self, records: list[dict[str, Any]]
    ) -> float | None:
        values = []
        for record in records:
            modal_price = record.get("modal_price") or record.get("modal price")
            if modal_price is None:
                continue
            modal_price_str = str(modal_price).replace(",", "").strip()
            try:
                values.append(float(modal_price_str))
            except ValueError:
                continue

        if not values:
            return None

        return round(sum(values) / len(values), 2)

    def fetch_crop_market_price(self, crop: str) -> dict[str, Any]:
        normalized_crop = self._normalize_crop_name(crop)

        if not self.is_configured():
            return {
                "price": None,
                "source": "agmarknet",
                "status": "unconfigured",
                "message": "AGMARKNET API is not configured",
            }

        candidates = AGMARKNET_COMMODITY_ALIASES.get(
            normalized_crop, [normalized_crop.title()]
        )

        try:
            for commodity in candidates:
                params = {
                    "api-key": self.api_key,
                    "format": "json",
                    "limit": 20,
                    "filters[commodity]": commodity,
                }

                response = requests.get(self.base_url, params=params, timeout=15)
                response.raise_for_status()
                payload = response.json()
                records = (
                    payload.get("records", []) if isinstance(payload, dict) else []
                )
                price = self._extract_price_from_records(records)

                if price is not None:
                    return {
                        "price": price,
                        "source": "agmarknet",
                        "status": "ok",
                        "recordsFound": len(records),
                        "matchedCommodity": commodity,
                    }

            return {
                "price": None,
                "source": "agmarknet",
                "status": "not-found",
                "recordsFound": 0,
                "message": "No matching commodity price found",
            }
        except requests.RequestException as error:
            return {
                "price": None,
                "source": "agmarknet",
                "status": "error",
                "message": str(error),
            }

    def calculate_profit(
        self, crop: str, farm_size: float, unit: str, market_price: float | None
    ) -> dict[str, Any]:
        normalized_crop = self._normalize_crop_name(crop)
        area_acres = self._to_acres(farm_size, unit)
        expected_yield = DEFAULT_YIELD_QTL_PER_ACRE.get(normalized_crop, 20)
        cost_per_acre = DEFAULT_COST_PER_ACRE.get(normalized_crop, 30000)

        revenue = None
        probable_profit = None

        if market_price is not None:
            revenue = round(market_price * expected_yield * area_acres, 2)
            probable_profit = round(revenue - (cost_per_acre * area_acres), 2)

        return {
            "area_acres": round(area_acres, 3),
            "expected_yield_qtl_per_acre": expected_yield,
            "estimated_cost_per_acre": cost_per_acre,
            "expected_revenue": revenue,
            "probable_profit": probable_profit,
        }

    def enrich_prediction(
        self, crop: str, confidence: float, farm_size: float, unit: str
    ) -> dict[str, Any]:
        market = self.fetch_crop_market_price(crop)
        price = market.get("price")
        profit = self.calculate_profit(crop, farm_size, unit, price)

        return {
            "crop": crop,
            "confidence": confidence,
            "market_price": price,
            "price_source": market.get("source"),
            "price_status": market.get("status"),
            "price_message": market.get("message", ""),
            **profit,
        }
