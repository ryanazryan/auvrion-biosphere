#pragma once

// Local-only template: copy to include/listen_device_config.h and replace values.
// Never commit your real token or trusted TLS root CA material if it is private.
// HTTPS endpoint must be publicly/reliably reachable from ESP32, and the Next.js
// backend must observe an HTTPS request (HTTP LAN IP is rejected by WC-017).
static constexpr char LISTEN_UPLOAD_URL[] =
    "https://YOUR-APP-HOST.example/api/device/recordings";

// Provision using an authorized admin session: POST /api/admin/devices.
// The server returns the deviceId and one-time credential.
static constexpr char LISTEN_DEVICE_ID[] = "REPLACE_WITH_PROVISIONED_DEVICE_UUID";
static constexpr char LISTEN_DEVICE_TOKEN[] = "REPLACE_WITH_ABDEV_V1_TOKEN";

// Install the PEM of the trusted CA for your HTTPS deployment, not your API token.
// Do NOT call WiFiClientSecure.setInsecure(), even for demos.
static const char LISTEN_TLS_CA_PEM[] = R"PEM(
-----BEGIN CERTIFICATE-----
REPLACE_WITH_TRUSTED_ROOT_CA_PEM
-----END CERTIFICATE-----
)PEM";
