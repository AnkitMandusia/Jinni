"""Indian partner KYC validation (format checks — real verification is done in person by admin).

Rules referenced: Motor Vehicles Act (valid driving licence of the right class, valid registration & insurance,
age >= 18 / >= 20 for commercial passenger vehicles in many states — we enforce 18 for bikes and 20 for auto/cab)
and the MoRTH Motor Vehicle Aggregator Guidelines 2025 (vehicle registration, insurance, driver verification).
"""
import re
from datetime import date
from typing import Optional

VEHICLE_CLASSES = {"bike": "Bike", "auto": "Auto", "cab": "Cab"}
MIN_AGE = {"bike": 18, "auto": 20, "cab": 20}

# Driving licence: SS RR YYYY NNNNNNN  (state, RTO, year of issue, serial) — spaces/hyphens optional.
_DL_RE = re.compile(r"^[A-Z]{2}[0-9]{2}(19|20)[0-9]{2}[0-9]{7}$")
# Registration: SS RR [series 1-3 letters] NNNN  e.g. RJ14AB1234, DL1CAB1234 ; Bharat series 22BH1234AA.
_REG_RE = re.compile(r"^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$")
_BH_RE = re.compile(r"^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$")
_PHONE_RE = re.compile(r"^(\+91)?[6-9][0-9]{9}$")


def norm_dl(v: str) -> str:
    return re.sub(r"[\s\-]", "", (v or "").upper())


def norm_reg(v: str) -> str:
    return re.sub(r"[\s\-]", "", (v or "").upper())


def valid_dl(v: str) -> bool:
    return bool(_DL_RE.match(norm_dl(v)))


def valid_reg(v: str) -> bool:
    n = norm_reg(v)
    return bool(_REG_RE.match(n) or _BH_RE.match(n))


def valid_phone(v: str) -> bool:
    return bool(_PHONE_RE.match(re.sub(r"[\s\-]", "", v or "")))


def parse_date(v: Optional[str], field: str) -> Optional[date]:
    if v in (None, ""):
        return None
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        raise ValueError(f"{field} must be a valid date (YYYY-MM-DD)")


def age_on(dob: date, today: date) -> int:
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def validate_partner(data: dict, *, today: Optional[date] = None) -> dict:
    """Validate + normalise the partner form. Returns clean values; raises ValueError(message) on the first problem."""
    today = today or date.today()
    vc = (data.get("vehicle_class") or "").lower()
    if vc not in VEHICLE_CLASSES:
        raise ValueError("Choose your vehicle: Bike, Auto or Cab")
    dl = norm_dl(data.get("license_no") or "")
    if not valid_dl(dl):
        raise ValueError("Enter a valid driving licence number (e.g. RJ14 2019 0012345)")
    reg = norm_reg(data.get("vehicle_number") or "")
    if not valid_reg(reg):
        raise ValueError("Enter a valid vehicle registration number (e.g. RJ14AB1234)")

    dob = parse_date(data.get("dob"), "Date of birth")
    if not dob:
        raise ValueError("Date of birth is required")
    if age_on(dob, today) < MIN_AGE[vc]:
        raise ValueError(f"You must be at least {MIN_AGE[vc]} years old to ride a {VEHICLE_CLASSES[vc].lower()}")
    if age_on(dob, today) > 70:
        raise ValueError("Please check the date of birth")

    out = {"vehicle_class": vc, "vehicle_type": VEHICLE_CLASSES[vc], "license_no": dl, "vehicle_number": reg, "dob": dob}
    for key, label in (("dl_expiry", "Licence expiry"), ("rc_expiry", "Registration (RC) expiry"),
                       ("insurance_expiry", "Insurance expiry")):
        d = parse_date(data.get(key), label)
        if not d:
            raise ValueError(f"{label} date is required")
        if d <= today:
            raise ValueError(f"{label} has passed — renew it before registering")
        out[key] = d

    make = (data.get("vehicle_make_model") or "").strip()
    if len(make) < 2:
        raise ValueError("Enter your vehicle make & model (e.g. Honda Activa)")
    out["vehicle_make_model"] = make[:80]
    out["vehicle_color"] = ((data.get("vehicle_color") or "").strip() or None)

    a4 = re.sub(r"\D", "", data.get("aadhaar_last4") or "")
    if a4 and len(a4) != 4:
        raise ValueError("Enter only the LAST 4 digits of your Aadhaar")
    out["aadhaar_last4"] = a4 or None

    ename, ephone = (data.get("emergency_name") or "").strip(), (data.get("emergency_phone") or "").strip()
    if not ename or not valid_phone(ephone):
        raise ValueError("Add an emergency contact (name and a valid 10-digit mobile number)")
    out["emergency_name"], out["emergency_phone"] = ename[:80], re.sub(r"[\s\-]", "", ephone)

    upi = (data.get("upi_id") or "").strip()
    if upi and not re.match(r"^[\w.\-]{2,}@[\w.\-]{2,}$", upi):
        raise ValueError("Enter a valid UPI id (e.g. name@okaxis)")
    out["upi_id"] = upi or None
    return out


def expiry_issues(profile, *, today: Optional[date] = None) -> list[str]:
    """Human-readable problems that must be fixed before the partner can take rides."""
    today = today or date.today()
    issues = []
    for attr, label in (("dl_expiry", "driving licence"), ("rc_expiry", "vehicle registration"),
                        ("insurance_expiry", "insurance")):
        d = getattr(profile, attr, None)
        if d is None:
            issues.append(f"Add your {label} expiry date")
        elif d <= today:
            issues.append(f"Your {label} has expired")
    return issues
