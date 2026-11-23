import {test} from 'node:test';
import assert from 'node:assert/strict';
import {phoneAuthIssue} from '../src/lib/firebase-phone-error';

test('the reported billing rejection has its own actionable message, not a CAPTCHA error', () => {
  const result = phoneAuthIssue({code: 'auth/billing-not-enabled', message: 'sensitive-provider-response', customData: {phoneNumber: 'private-number'}});
  assert.equal(result?.key, 'firebase_billing_error');
  assert.equal(result?.restart, false);
  assert.doesNotMatch(JSON.stringify(result), /sensitive-provider-response|private-number|customData/);
});

test('expired verification restarts the phone step but a mistyped code can be corrected', () => {
  for (const code of ['auth/code-expired', 'auth/session-expired']) assert.equal(phoneAuthIssue({code})?.restart, true);
  assert.equal(phoneAuthIssue({code: 'auth/invalid-verification-code'})?.restart, false);
});

test('unrecognized SDK codes get safe fallback guidance and arbitrary error text is rejected', () => {
  assert.equal(phoneAuthIssue({code: 'auth/new-sdk-error', message: 'private-data'})?.key, 'firebase_sms_error');
  for (const error of [null, 'private-data', {code: 'auth/billing-not-enabled\nprivate-data'}, {code: 'auth/' + 'a'.repeat(100)}, {code: 400}]) {
    assert.equal(phoneAuthIssue(error), null);
  }
});
