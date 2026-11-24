/**
 * Partner (rider) form validation — mirrors superapp-backend/app/modules/delivery/kyc.py so people get instant
 * feedback; the server re-validates everything.
 */
export type VehicleClass = 'bike' | 'auto' | 'cab';

export const VEHICLES: { key: VehicleClass; emoji: string; title: string; blurb: string; minAge: number }[] = [
  { key: 'bike', emoji: '🛵', title: 'Bike / Scooter', blurb: 'Food & grocery deliveries + bike rides', minAge: 18 },
  { key: 'auto', emoji: '🛺', title: 'Auto', blurb: 'Auto-rickshaw rides', minAge: 20 },
  { key: 'cab', emoji: '🚕', title: 'Cab / Car', blurb: 'Cab rides', minAge: 20 },
];

const DL_RE = /^[A-Z]{2}[0-9]{2}(19|20)[0-9]{2}[0-9]{7}$/;
const REG_RE = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/;
const BH_RE = /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/;
const PHONE_RE = /^(\+91)?[6-9][0-9]{9}$/;
const UPI_RE = /^[\w.\-]{2,}@[\w.\-]{2,}$/;

export const normDl = (v: string) => v.toUpperCase().replace(/[\s-]/g, '');
export const normReg = (v: string) => v.toUpperCase().replace(/[\s-]/g, '');
export const validDl = (v: string) => DL_RE.test(normDl(v));
export const validReg = (v: string) => REG_RE.test(normReg(v)) || BH_RE.test(normReg(v));
export const validPhone = (v: string) => PHONE_RE.test(v.replace(/[\s-]/g, ''));
export const validUpi = (v: string) => UPI_RE.test(v.trim());

/** "14/05/1996" -> "1996-05-14" (null if not a real calendar date). */
export function dmyToIso(v: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (d.getFullYear() !== Number(yyyy) || d.getMonth() !== Number(mm) - 1 || d.getDate() !== Number(dd)) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** Live mask while typing: digits only -> DD/MM/YYYY. */
export function maskDate(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

export function ageOn(dobIso: string, today: Date = new Date()): number {
  const [y, m, d] = dobIso.split('-').map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
}

export type PartnerForm = {
  vehicle_class: VehicleClass | '';
  vehicle_number: string;
  vehicle_make_model: string;
  vehicle_color: string;
  rc_expiry: string;        // DD/MM/YYYY
  insurance_expiry: string; // DD/MM/YYYY
  name: string;
  dob: string;              // DD/MM/YYYY
  license_no: string;
  dl_expiry: string;        // DD/MM/YYYY
  aadhaar_last4: string;
  emergency_name: string;
  emergency_phone: string;
  upi_id: string;
  password: string;
  confirm_password: string;
};

export const EMPTY_FORM: PartnerForm = {
  vehicle_class: '', vehicle_number: '', vehicle_make_model: '', vehicle_color: '', rc_expiry: '', insurance_expiry: '',
  name: '', dob: '', license_no: '', dl_expiry: '', aadhaar_last4: '', emergency_name: '', emergency_phone: '', upi_id: '',
  password: '', confirm_password: '',
};

const future = (dmy: string, today: Date) => {
  const iso = dmyToIso(dmy);
  return !!iso && new Date(iso + 'T00:00:00') > today;
};

/** Per-step validation. Returns { field: message } (empty = step is valid). */
export function validateStep(step: number, f: PartnerForm, today: Date = new Date()): Record<string, string> {
  const e: Record<string, string> = {};
  if (step === 0) {
    if (!f.vehicle_class) e.vehicle_class = 'Choose the vehicle you will drive';
  } else if (step === 1) {
    if (!validReg(f.vehicle_number)) e.vehicle_number = 'Enter a valid registration number, e.g. RJ14 AB 1234';
    if (f.vehicle_make_model.trim().length < 2) e.vehicle_make_model = 'Enter make & model, e.g. Honda Activa';
    if (!future(f.rc_expiry, today)) e.rc_expiry = dmyToIso(f.rc_expiry) ? 'Registration has expired — renew it first' : 'Enter a date as DD/MM/YYYY';
    if (!future(f.insurance_expiry, today)) e.insurance_expiry = dmyToIso(f.insurance_expiry) ? 'Insurance has expired — renew it first' : 'Enter a date as DD/MM/YYYY';
  } else if (step === 2) {
    if (f.name.trim().length < 2) e.name = 'Enter your full name as on the licence';
    const dob = dmyToIso(f.dob);
    const minAge = VEHICLES.find((v) => v.key === f.vehicle_class)?.minAge ?? 18;
    if (!dob) e.dob = 'Enter your date of birth as DD/MM/YYYY';
    else if (ageOn(dob, today) < minAge) e.dob = `You must be at least ${minAge} to drive this vehicle`;
    else if (ageOn(dob, today) > 70) e.dob = 'Please check the date of birth';
    if (!validDl(f.license_no)) e.license_no = 'Enter a valid licence number, e.g. RJ14 2019 0012345';
    if (!future(f.dl_expiry, today)) e.dl_expiry = dmyToIso(f.dl_expiry) ? 'Licence has expired — renew it first' : 'Enter a date as DD/MM/YYYY';
    if (f.aadhaar_last4 && !/^\d{4}$/.test(f.aadhaar_last4)) e.aadhaar_last4 = 'Only the LAST 4 digits';
  } else if (step === 3) {
    if (f.emergency_name.trim().length < 2) e.emergency_name = 'Add an emergency contact name';
    if (!validPhone(f.emergency_phone)) e.emergency_phone = 'Enter a valid 10-digit mobile number';
    if (f.upi_id && !validUpi(f.upi_id)) e.upi_id = 'Enter a valid UPI id, e.g. name@okaxis';
    if (f.password.length < 8) e.password = 'Password must be at least 8 characters';
    if (f.password !== f.confirm_password) e.confirm_password = 'Passwords do not match';
  }
  return e;
}

/** API payload for POST /auth/complete-profile (role added by the store). */
export function toPayload(f: PartnerForm): Record<string, string> {
  return {
    name: f.name.trim(),
    password: f.password,
    vehicle_class: f.vehicle_class,
    vehicle_number: normReg(f.vehicle_number),
    vehicle_make_model: f.vehicle_make_model.trim(),
    vehicle_color: f.vehicle_color.trim(),
    license_no: normDl(f.license_no),
    dob: dmyToIso(f.dob) ?? '',
    dl_expiry: dmyToIso(f.dl_expiry) ?? '',
    rc_expiry: dmyToIso(f.rc_expiry) ?? '',
    insurance_expiry: dmyToIso(f.insurance_expiry) ?? '',
    aadhaar_last4: f.aadhaar_last4,
    emergency_name: f.emergency_name.trim(),
    emergency_phone: f.emergency_phone.replace(/[\s-]/g, ''),
    upi_id: f.upi_id.trim(),
  };
}
