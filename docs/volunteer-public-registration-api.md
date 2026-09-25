# Public volunteer registration API

The POST /api/volunteer/registrations request now requires submissionToken: a
canonical base64url encoding of 32 cryptographically random bytes. A client
must create it once for a logical submission and retain it until it receives
the response. Retries must reuse the same token and the same registration
fields. Reusing a token with changed details returns HTTP 409. A new token is
a new submission.

Example token generation in Node.js:

    import { randomBytes } from "node:crypto";
    const submissionToken = randomBytes(32).toString("base64url");

The token is also the bearer credential in the returned statusUrl. Treat it
as secret and store it only as long as needed to recover a response. A repeat
request returns the original registration and status URL; the status link
expires after 30 days. Once expired, the old token cannot be reused. A new token cannot create a second
active registration for the same supporter and activity; the API returns 409.

The response includes confirmationEmailSent. When false, preserve and show the
statusUrl; the registration may still have been stored. If email delivery is
unavailable, the message is recorded as failed instead of left queued without
a delivery worker.

Current volunteer policy requires versioned booking and a verified member
profile for future activities. The public activity list marks anonymous
registration unavailable, and a POST for such an activity returns
current_policy_required (HTTP 409). Clients should not offer an anonymous
booking action while publicRegistrationAvailable is false. Enabling future
anonymous signup requires a separate product and policy decision.
