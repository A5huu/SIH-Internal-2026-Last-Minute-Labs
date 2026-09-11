import re

from datetime import date
from typing import Any, Dict, Optional


# ============================================================
# MONTHS
# ============================================================

MONTHS = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}


MONTH_ALIASES = {
    "jan": "january",
    "feb": "february",
    "mar": "march",
    "apr": "april",
    "jun": "june",
    "jul": "july",
    "aug": "august",
    "sep": "september",
    "sept": "september",
    "oct": "october",
    "nov": "november",
    "dec": "december",
}


# ============================================================
# QUANTITY EXTRACTION
# ============================================================

def extract_quantity(text: str) -> Optional[int]:
    """
    Extract cargo quantity from natural language.

    Supported examples:

        75,000 MT
        75000 MT
        75k MT
        75.5k MT
        75 thousand tons
        75,000 tons
        75,000 tonnes
        75 thousand metric tons
    """

    text_lower = text.lower()

    # --------------------------------------------------------
    # 1. Standard quantity
    #
    # 75,000 MT
    # 75000 MT
    # 75,000 tons
    # 75,000 tonnes
    # --------------------------------------------------------

    match = re.search(
        r"(\d+(?:,\d{3})*(?:\.\d+)?)"
        r"\s*"
        r"(?:mt|metric\s*tons?|tonnes?|tons?)\b",
        text_lower,
    )

    if match:
        number = match.group(1).replace(",", "")
        return int(float(number))

    # --------------------------------------------------------
    # 2. Thousand notation
    #
    # 75k MT
    # 75.5k MT
    # --------------------------------------------------------

    match = re.search(
        r"(\d+(?:\.\d+)?)"
        r"\s*k"
        r"\s*"
        r"(?:mt|metric\s*tons?|tonnes?|tons?)\b",
        text_lower,
    )

    if match:
        number = float(match.group(1))
        return int(number * 1000)

    # --------------------------------------------------------
    # 3. Thousand words
    #
    # 75 thousand tons
    # 75 thousand MT
    # --------------------------------------------------------

    match = re.search(
        r"(\d+(?:\.\d+)?)"
        r"\s*thousand"
        r"(?:\s*(?:mt|metric\s*tons?|tonnes?|tons?))?",
        text_lower,
    )

    if match:
        number = float(match.group(1))
        return int(number * 1000)

    return None


# ============================================================
# CARGO TYPE
# ============================================================

def extract_cargo_type(text: str) -> Optional[str]:
    """
    Extract cargo type.

    Examples:

        coking coal
        coal
        iron ore
        limestone
        steel
        petcoke
        bauxite
        grain
    """

    text_lower = text.lower()

    cargo_types = {
        "coking coal": "Coking Coal",
        "iron ore": "Iron Ore",
        "petroleum coke": "Petcoke",
        "petcoke": "Petcoke",
        "limestone": "Limestone",
        "bauxite": "Bauxite",
        "steel": "Steel",
        "grain": "Grain",
        "coal": "Coal",
    }

    # Check longer phrases first.
    for keyword, cargo_type in cargo_types.items():
        if keyword in text_lower:
            return cargo_type

    return None


# ============================================================
# ORIGIN EXTRACTION
# ============================================================

def extract_origin(text: str) -> Optional[str]:
    """
    Extract cargo origin.

    Supported origins include:

        Australia
        Indonesia
        South Africa
        USA
        Canada
        Brazil
        Russia
        Mozambique
    """

    text_lower = text.lower()

    origins = [
        "australia",
        "indonesia",
        "south africa",
        "usa",
        "canada",
        "brazil",
        "russia",
        "mozambique",
    ]

    for origin in origins:
        if origin in text_lower:
            return origin.title()

    return None


# ============================================================
# DESTINATION EXTRACTION
# ============================================================

def extract_destination(text: str) -> Optional[str]:
    """
    Extract destination port.

    Supported ports:

        Paradip
        Visakhapatnam
        Vizag
        Dhamra
        Gangavaram
        Krishnapatnam
        Haldia
        Kolkata
    """

    text_lower = text.lower()

    # Longer names first.
    ports = [
        "visakhapatnam",
        "krishnapatnam",
        "gangavaram",
        "paradip",
        "dhamra",
        "haldia",
        "kolkata",
        "vizag",
    ]

    for port in ports:
        if port in text_lower:
            return port.title()

    return None


# ============================================================
# PRIORITY EXTRACTION
# ============================================================

def extract_priority(text: str) -> Dict[str, bool]:
    """
    Detect user preferences.

    Returns:

        low_risk
        low_cost
        reliability
        fastest
    """

    text_lower = text.lower()

    return {
        "low_risk": any(
            phrase in text_lower
            for phrase in [
                "low risk",
                "minimum risk",
                "lowest risk",
                "safe",
                "safest",
            ]
        ),

        "low_cost": any(
            phrase in text_lower
            for phrase in [
                "cheapest",
                "lowest cost",
                "low cost",
                "economical",
                "most economical",
                "cheaper",
            ]
        ),

        "reliability": any(
            phrase in text_lower
            for phrase in [
                "reliable",
                "reliability",
                "trusted",
                "dependable",
            ]
        ),

        "fastest": any(
            phrase in text_lower
            for phrase in [
                "fastest",
                "quickest",
                "earliest",
                "fast",
            ]
        ),
    }


# ============================================================
# MONTH HELPERS
# ============================================================

def normalize_month(month_name: str) -> str:
    """
    Convert abbreviated month names to full month names.

    Example:

        nov -> november
        sept -> september
    """

    month_name = month_name.lower()

    return MONTH_ALIASES.get(
        month_name,
        month_name,
    )


def _month_number(month_name: str) -> Optional[int]:
    """
    Return numeric month.
    """

    month_name = normalize_month(month_name)

    return MONTHS.get(month_name)


def _infer_year(month_number: int) -> int:
    """
    Infer the most appropriate year.

    If the requested month has already passed,
    use the next year.

    Example for September 2026:

        November -> 2026
        December -> 2026
        January -> 2027
    """

    today = date.today()

    if month_number < today.month:
        return today.year + 1

    return today.year


# ============================================================
# LAYCAN EXTRACTION
# ============================================================

def extract_laycan(
    text: str,
) -> Dict[str, Optional[str]]:
    """
    Extract laycan dates from natural language.

    Supports:
        12 to 23 November
        12-23 November 2026
        12 November to 23 November 2026
        12 November 2026 to 23 November 2026
        12 Nov 2026 to 23 Nov 2026
        November 12 2026 to November 23 2026
        between 12 and 23 November 2026
    """

    text_lower = text.lower()

    month_regex = (
        r"january|february|march|april|may|june|july|"
        r"august|september|october|november|december|"
        r"jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec"
    )

    def build_dates(
        start_day: int,
        start_month_name: str,
        start_year: int,
        end_day: int,
        end_month_name: str,
        end_year: int,
    ):
        try:
            start_month = MONTHS[normalize_month(start_month_name)]
            end_month = MONTHS[normalize_month(end_month_name)]

            start_date = date(start_year, start_month, start_day)
            end_date = date(end_year, end_month, end_day)

            return {
                "laycan_start": start_date.isoformat(),
                "laycan_end": end_date.isoformat(),
            }
        except (ValueError, KeyError):
            return {
                "laycan_start": None,
                "laycan_end": None,
            }

    # ========================================================
    # FORMAT 0
    #
    # Full date on BOTH sides:
    #
    # 12 November 2026 to 23 November 2026
    # 12 Nov 2026 - 23 Nov 2026
    # ========================================================

    pattern_0 = (
        rf"(?<!\d)(\d{{1,2}})(?:st|nd|rd|th)?"
        rf"\s+({month_regex})\s+(\d{{4}})"
        rf"\s*(?:to|and|-|–|—)\s*"
        rf"(?<!\d)(\d{{1,2}})(?:st|nd|rd|th)?"
        rf"\s+({month_regex})\s+(\d{{4}})"
    )

    match = re.search(pattern_0, text_lower)

    if match:
        return build_dates(
            int(match.group(1)),
            match.group(2),
            int(match.group(3)),
            int(match.group(4)),
            match.group(5),
            int(match.group(6)),
        )

    # ========================================================
    # FORMAT 1
    #
    # 12 to 23 November
    # between 12 and 23 November
    # 12-23 November 2026
    #
    # (?<!\d) is important: it prevents "2026" from being
    # incorrectly read as day "26".
    # ========================================================

    pattern_1 = (
        rf"(?:between\s+)?"
        rf"(?<!\d)(\d{{1,2}})(?:st|nd|rd|th)?"
        rf"\s*"
        rf"(?:to|and|-|–|—)"
        rf"\s*"
        rf"(?<!\d)(\d{{1,2}})(?:st|nd|rd|th)?"
        rf"\s+({month_regex})"
        rf"(?:\s+(\d{{4}}))?"
    )

    match = re.search(pattern_1, text_lower)

    if match:
        start_day = int(match.group(1))
        end_day = int(match.group(2))
        month_name = normalize_month(match.group(3))
        month_number = MONTHS[month_name]
        year = int(match.group(4)) if match.group(4) else _infer_year(month_number)

        return build_dates(
            start_day,
            month_name,
            year,
            end_day,
            month_name,
            year,
        )

    # ========================================================
    # FORMAT 2
    #
    # November 12 to November 23
    # November 12 2026 to November 23 2026
    # November 12 to 23 November 2026
    # ========================================================

    pattern_2 = (
        rf"({month_regex})"
        rf"\s+"
        rf"(?<!\d)(\d{{1,2}})(?:st|nd|rd|th)?"
        rf"(?:\s+(\d{{4}}))?"
        rf"\s*"
        rf"(?:to|and|-|–|—)"
        rf"\s*"
        rf"(?:({month_regex})\s+)?"
        rf"(?<!\d)(\d{{1,2}})(?:st|nd|rd|th)?"
        rf"(?:\s+(\d{{4}}))?"
    )

    match = re.search(pattern_2, text_lower)

    if match:
        start_month_name = normalize_month(match.group(1))
        start_day = int(match.group(2))
        start_year_text = match.group(3)

        second_month_name = match.group(4)
        end_day = int(match.group(5))
        end_year_text = match.group(6)

        start_month = MONTHS[start_month_name]

        if second_month_name:
            end_month_name = normalize_month(second_month_name)
        else:
            end_month_name = start_month_name

        end_month = MONTHS[end_month_name]

        if start_year_text:
            start_year = int(start_year_text)
        elif end_year_text:
            start_year = int(end_year_text)
        else:
            start_year = _infer_year(start_month)

        if end_year_text:
            end_year = int(end_year_text)
        else:
            end_year = start_year

        if end_month < start_month and not end_year_text:
            end_year += 1

        return build_dates(
            start_day,
            start_month_name,
            start_year,
            end_day,
            end_month_name,
            end_year,
        )

    # ========================================================
    # FORMAT 3
    #
    # 12 November to 23 November
    # 12 November - 23 November 2026
    # 12 Nov to 23 Nov
    #
    # The year may be supplied after the END date.
    # ========================================================

    pattern_3 = (
        rf"(?<!\d)(\d{{1,2}})(?:st|nd|rd|th)?"
        rf"\s+({month_regex})"
        rf"\s*"
        rf"(?:to|and|-|–|—)"
        rf"\s*"
        rf"(?<!\d)(\d{{1,2}})(?:st|nd|rd|th)?"
        rf"\s+({month_regex})"
        rf"(?:\s+(\d{{4}}))?"
    )

    match = re.search(pattern_3, text_lower)

    if match:
        start_day = int(match.group(1))
        start_month_name = normalize_month(match.group(2))
        end_day = int(match.group(3))
        end_month_name = normalize_month(match.group(4))
        year_text = match.group(5)

        start_month = MONTHS[start_month_name]
        end_month = MONTHS[end_month_name]

        year = int(year_text) if year_text else _infer_year(start_month)
        end_year = year

        if end_month < start_month:
            end_year += 1

        return build_dates(
            start_day,
            start_month_name,
            year,
            end_day,
            end_month_name,
            end_year,
        )

    return {
        "laycan_start": None,
        "laycan_end": None,
    }


# ============================================================
# COMPLETE CHARTERING REQUEST PARSER
# ============================================================

def parse_chartering_request(
    text: str,
) -> Dict[str, Any]:
    """
    Convert a natural-language chartering request
    into structured FreightIQ requirements.

    Example:

        Find the best vessel for 75,000 MT
        coking coal from Australia to Paradip
        between 12 and 23 November.
        Prioritize low risk and reliability.

    Returns:

        {
            "raw_request": "...",
            "cargo_type": "Coking Coal",
            "quantity": 75000,
            "origin": "Australia",
            "destination": "Paradip",
            "laycan_start": "2026-11-12",
            "laycan_end": "2026-11-23",
            "priority": {
                "low_risk": True,
                "low_cost": False,
                "reliability": True,
                "fastest": False
            },
            "parsed": True
        }
    """

    if not text:
        return {
            "raw_request": text,
            "cargo_type": None,
            "quantity": None,
            "origin": None,
            "destination": None,
            "laycan_start": None,
            "laycan_end": None,
            "priority": {
                "low_risk": False,
                "low_cost": False,
                "reliability": False,
                "fastest": False,
            },
            "parsed": False,
        }

    laycan = extract_laycan(text)

    return {
        "raw_request": text,
        "cargo_type": extract_cargo_type(text),
        "quantity": extract_quantity(text),
        "origin": extract_origin(text),
        "destination": extract_destination(text),
        "laycan_start": laycan["laycan_start"],
        "laycan_end": laycan["laycan_end"],
        "priority": extract_priority(text),
        "parsed": True,
    }