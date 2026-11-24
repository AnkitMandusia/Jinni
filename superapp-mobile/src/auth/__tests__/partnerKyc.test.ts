import {
  EMPTY_FORM, ageOn, dmyToIso, maskDate, normDl, toPayload, validDl, validPhone, validReg, validateStep,
} from '../utils/partnerKyc';

const TODAY = new Date('2026-06-01T00:00:00');
const good = {
  ...EMPTY_FORM, vehicle_class: 'bike' as const, vehicle_number: 'rj14 ab 1234', vehicle_make_model: 'Honda Activa',
  rc_expiry: '01/01/2031', insurance_expiry: '01/01/2027', name: 'Amit Singh', dob: '14/05/1996', license_no: 'RJ14 2019 0012345',
  dl_expiry: '01/01/2035', emergency_name: 'Mother', emergency_phone: '9876543210', password: 'Test@1234', confirm_password: 'Test@1234',
};

describe('formats', () => {
  it('validates driving licence numbers', () => {
    expect(validDl('RJ14 2019 0012345')).toBe(true);
    expect(validDl('rj14-20190012345')).toBe(true);
    expect(validDl('RJ14 1850 0012345')).toBe(false);
    expect(validDl('12345')).toBe(false);
    expect(normDl('rj14 2019 0012345')).toBe('RJ1420190012345');
  });
  it('validates registration numbers incl. Bharat series', () => {
    expect(validReg('RJ14 AB 1234')).toBe(true);
    expect(validReg('DL1CAB1234')).toBe(true);
    expect(validReg('22BH1234AA')).toBe(true);
    expect(validReg('RJ-14-1234')).toBe(false);
  });
  it('validates Indian mobiles', () => {
    expect(validPhone('9876543210')).toBe(true);
    expect(validPhone('+919876543210')).toBe(true);
    expect(validPhone('1234567890')).toBe(false);
  });
});

describe('dates', () => {
  it('masks and converts DD/MM/YYYY', () => {
    expect(maskDate('14051996')).toBe('14/05/1996');
    expect(maskDate('1405')).toBe('14/05');
    expect(dmyToIso('14/05/1996')).toBe('1996-05-14');
    expect(dmyToIso('31/02/2030')).toBeNull();
    expect(dmyToIso('1/1/2030')).toBeNull();
  });
  it('computes age', () => {
    expect(ageOn('1996-05-14', TODAY)).toBe(30);
    expect(ageOn('1996-06-02', TODAY)).toBe(29);
  });
});

describe('step validation', () => {
  it('requires a vehicle first', () => {
    expect(validateStep(0, EMPTY_FORM)).toHaveProperty('vehicle_class');
    expect(validateStep(0, good)).toEqual({});
  });
  it('rejects expired documents', () => {
    const e = validateStep(1, { ...good, insurance_expiry: '01/01/2025' }, TODAY);
    expect(e.insurance_expiry).toMatch(/expired/);
    expect(validateStep(1, good, TODAY)).toEqual({});
  });
  it('enforces age by vehicle and licence format', () => {
    expect(validateStep(2, { ...good, dob: '01/01/2010' }, TODAY).dob).toMatch(/at least 18/);
    expect(validateStep(2, { ...good, vehicle_class: 'cab', dob: '01/01/2007' }, TODAY).dob).toMatch(/at least 20/);
    expect(validateStep(2, { ...good, license_no: 'BAD' }, TODAY)).toHaveProperty('license_no');
    expect(validateStep(2, good, TODAY)).toEqual({});
  });
  it('needs emergency contact and matching passwords', () => {
    expect(Object.keys(validateStep(3, { ...good, emergency_phone: '123', confirm_password: 'x' }, TODAY))).toEqual(
      expect.arrayContaining(['emergency_phone', 'confirm_password']));
    expect(validateStep(3, good, TODAY)).toEqual({});
  });
});

describe('payload', () => {
  it('normalises for the API', () => {
    const p = toPayload(good);
    expect(p).toMatchObject({ vehicle_number: 'RJ14AB1234', license_no: 'RJ1420190012345', dob: '1996-05-14', dl_expiry: '2035-01-01', vehicle_class: 'bike' });
  });
});
