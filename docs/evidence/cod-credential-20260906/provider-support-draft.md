Subject: Production order_details returns internal_server_error — merchant2088831950966386

Hello COD team,

We validated the supplied matching RSA2048 merchant keypair and both raw AES keys locally. The integration sends the documented encrypted/signed JSON to https://aqs-api.codpayment.com/v1/service.

Production merchant:2088831950966386
Segment:2470305571
Wallet:ALIPAYHK
Service tested:order_details
Input:unique nonexistent order_ref (no payment order was created)

Results:
- AES128:HTTP500, success=false, error_code=internal_server_error.
- AES256:HTTP500, success=false, error_code=internal_server_error.

The December2024API document section7.5.3.2 specifies HTTP404/order_not_found for an unregistered order_ref. Please investigate the production500s and confirm that the merchant public key and selected AES key are registered for this merchant and that order_details is enabled.

Please also register this production COD AQS notification URL and confirm asynchronous notifications are enabled:
https://hkscda.vercel.app/api/webhooks/cod

Merchant public-key SPKI SHA256:
422e424e24a372d69aa69f875ac0e9d5991f3639067bb4b6da69809f14d7b0f4

No private/AES key material is included in this message. No successful authentication, order creation, charge, settlement or notification delivery is claimed.