export type PhoneAuthIssue = {key: string; code: string; restart: boolean};

// Firebase errors can contain phone numbers and credentials. Never render the
// raw error message, customData, or provider response; expose only an SDK code.
export function phoneAuthIssue(error: unknown): PhoneAuthIssue | null {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  if (typeof code !== 'string' || !/^auth\/[a-z][a-z0-9-]{1,70}$/.test(code)) return null;
  const messages: Record<string, string> = {
    'auth/billing-not-enabled': 'firebase_billing_error',
    'auth/unauthorized-domain': 'firebase_domain_error',
    'auth/invalid-app-credential': 'firebase_captcha_error',
    'auth/missing-app-credential': 'firebase_captcha_error',
    'auth/captcha-check-failed': 'firebase_captcha_error',
    'auth/invalid-recaptcha-token': 'firebase_captcha_error',
    'auth/too-many-requests': 'firebase_rate_error',
    'auth/quota-exceeded': 'firebase_quota_error',
    'auth/network-request-failed': 'firebase_network_error',
    'auth/operation-not-allowed': 'firebase_provider_error',
    'auth/invalid-api-key': 'firebase_app_error',
    'auth/app-not-authorized': 'firebase_app_error',
    'auth/invalid-phone-number': 'firebase_phone_error',
    'auth/invalid-verification-code': 'invalid_otp',
    'auth/code-expired': 'firebase_reauthenticate',
    'auth/session-expired': 'firebase_reauthenticate',
  };
  return {key: messages[code] || 'firebase_sms_error', code, restart: ['auth/code-expired', 'auth/session-expired'].includes(code)};
}
