export type SignType = 'self' | 'supervisor';

export function getStatusAfterSelfRatingSubmit(): string {
  return 'pending_sign';
}

export function getStatusAfterSupervisorRatingSubmit(): string {
  return 'supervisor_sign';
}

export function getStatusAfterSelfRatingWithSignSubmit(): string {
  return 'supervisor_review';
}

export function getStatusAfterSupervisorRatingWithSignSubmit(): string {
  return 'completed';
}

export function isSignAllowedInStatus(
  status: string,
  signType: SignType,
): boolean {
  return (
    (status === 'pending_sign' && signType === 'self') ||
    (status === 'supervisor_sign' && signType === 'supervisor')
  );
}

export function getStatusAfterSign(
  status: string,
  signType: SignType,
): string {
  if (status === 'pending_sign' && signType === 'self') {
    return 'supervisor_review';
  }
  if (status === 'supervisor_sign' && signType === 'supervisor') {
    return 'completed';
  }
  return status;
}
