import {
  getStatusAfterSelfRatingWithSignSubmit,
  getStatusAfterSupervisorRatingWithSignSubmit,
  getStatusAfterSign,
  isSignAllowedInStatus,
} from '../../server/modules/assessment-operation/assessment-operation.service';

describe('assessment operation workflow status machine', () => {
  it('moves self review submit with signature to supervisor review', () => {
    expect(getStatusAfterSelfRatingWithSignSubmit()).toBe('supervisor_review');
  });

  it('keeps legacy pending_sign readable for employee signature compatibility', () => {
    expect(isSignAllowedInStatus('pending_sign', 'self')).toBe(true);
    expect(isSignAllowedInStatus('pending_sign', 'supervisor')).toBe(false);
    expect(getStatusAfterSign('pending_sign', 'self')).toBe(
      'supervisor_review',
    );
  });

  it('moves supervisor review submit with signature to completed', () => {
    expect(getStatusAfterSupervisorRatingWithSignSubmit()).toBe('completed');
  });

  it('keeps legacy supervisor_sign readable for supervisor signature compatibility', () => {
    expect(isSignAllowedInStatus('supervisor_sign', 'self')).toBe(false);
    expect(isSignAllowedInStatus('supervisor_sign', 'supervisor')).toBe(true);
    expect(getStatusAfterSign('supervisor_sign', 'supervisor')).toBe(
      'completed',
    );
  });
});
