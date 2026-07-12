import {
  getStatusAfterSelfRatingSubmit,
  getStatusAfterSupervisorRatingSubmit,
  getStatusAfterSign,
  isSignAllowedInStatus,
} from '../../server/modules/assessment-operation/assessment-operation.service';

describe('assessment operation workflow status machine', () => {
  it('moves self review submission to employee signing', () => {
    expect(getStatusAfterSelfRatingSubmit()).toBe('pending_sign');
  });

  it('allows only employee signature in pending_sign', () => {
    expect(isSignAllowedInStatus('pending_sign', 'self')).toBe(true);
    expect(isSignAllowedInStatus('pending_sign', 'supervisor')).toBe(false);
    expect(getStatusAfterSign('pending_sign', 'self')).toBe(
      'supervisor_review',
    );
  });

  it('moves supervisor rating submission to supervisor signing', () => {
    expect(getStatusAfterSupervisorRatingSubmit()).toBe('supervisor_sign');
  });

  it('allows only supervisor signature in supervisor_sign and completes after signing', () => {
    expect(isSignAllowedInStatus('supervisor_sign', 'self')).toBe(false);
    expect(isSignAllowedInStatus('supervisor_sign', 'supervisor')).toBe(true);
    expect(getStatusAfterSign('supervisor_sign', 'supervisor')).toBe(
      'completed',
    );
  });
});
