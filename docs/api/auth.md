# Auth: Success CRM

Base URL: `https://api.successedu.com.au/success-crm`

## Login

`POST /auth/login`

Headers: `content-type: application/json`, `accept: application/json`. No other headers are required. Browser headers from the CRM web app (origin, referer, sec-*) are not needed.

Request body:

```json
{ "email": "string", "password": "string" }
```

Response 200:

```json
{
  "token": "<JWT, HS256>",
  "user": {
    "id": 1,
    "profileUrl": null,
    "firstName": "Super",
    "lastName": "Admin",
    "email": "admin@example.com",
    "phone": "1111111111",
    "roleId": 1,
    "branchId": null,
    "isActive": true
    // ...many more CRM-internal fields (permissions flags, clock-in data, etc.)
  },
  "expiry": 1792358008
}
```

- `expiry`: unix timestamp in **seconds**.
- JWT payload: `{ user: { id, email, roleId, branchId }, iat, exp }`. Token lifetime is 12h (`exp - iat = 43200`).
- No refresh endpoint exists.

## Authenticated requests

**ASSUMPTION:** `Authorization: Bearer <token>`. Define it in ONE constant (`AUTH_HEADER_NAME` / `AUTH_HEADER_PREFIX`) so it can be changed if the CRM uses a raw token or a custom header.

## Session rules for the extension

- Persist only `{ token, expiry, user: { id, firstName, lastName, email, roleId, branchId } }` in `chrome.storage.session`. Discard the rest of `user`.
- Treat the session as expired when `Date.now() / 1000 >= expiry - 60`.
- On expiry or HTTP 401: clear the session and route to the login screen.
- Error response shape is unknown. Show `message` if present, else a generic error.
- Never log the token, password, or response bodies.
