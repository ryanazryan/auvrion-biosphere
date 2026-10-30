#include "listen_remote.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>

#include "listen_device_config.h"
#include "device_sync.h"

namespace {
String remoteUrl() {
  const String url(LISTEN_UPLOAD_URL);
  const int at = url.indexOf("/api/device/recordings");
  if (at < 0 || at + 22 != static_cast<int>(url.length())) return "";
  return url.substring(0, at) + "/api/device/remote";
}

bool ready() {
  return listenSyncConfigured() && WiFi.status() == WL_CONNECTED &&
         time(nullptr) > 1735689600 && !remoteUrl().isEmpty();
}
void headers(HTTPClient &http) {
  http.addHeader("Authorization", String("Bearer ") + LISTEN_DEVICE_TOKEN);
  http.addHeader("X-Device-ID", LISTEN_DEVICE_ID);
}
}

bool listenPollRemote(ListenRemoteCommand &out, bool monitoring, uint32_t intervalSeconds) {
  out = ListenRemoteCommand();
  if (!ready()) return false;
  WiFiClientSecure tls;
  tls.setCACert(LISTEN_TLS_CA_PEM);
  tls.setTimeout(8);
  HTTPClient http;
  http.setTimeout(10000);
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  if (!http.begin(tls, remoteUrl())) return false;
  headers(http);
  http.addHeader("X-Listen-Monitoring", monitoring ? "on" : "off");
  http.addHeader("X-Listen-Interval", String(intervalSeconds));
  const int status = http.GET();
  if (status != 200 || http.getSize() > 1024) {
    Serial.printf("Remote poll HTTP: %d\n", status);
    http.end();
    return false;
  }
  const String content = http.getString();
  http.end();
  if (content.length() > 1024) return false;
  StaticJsonDocument<768> doc;
  if (deserializeJson(doc, content) || doc["protocolVersion"] != 1 ||
      doc["status"] != "ok" || doc["deviceId"] != LISTEN_DEVICE_ID) return false;
  if (doc["command"].isNull()) return true;
  const uint32_t revision = doc["command"]["revision"].as<uint32_t>();
  const uint32_t seconds = doc["command"]["intervalSeconds"].as<uint32_t>();
  const String action = doc["command"]["action"].as<String>();
  if (!revision || (seconds != 60 && seconds != 300 && seconds != 900) ||
      (action != "start" && action != "pause" && action != "interval")) return false;
  out.pending = true;
  out.revision = revision;
  out.intervalSeconds = seconds;
  out.action = action;
  return true;
}

bool listenAckRemote(uint32_t revision, bool monitoring, uint32_t intervalSeconds) {
  if (!ready() || !revision) return false;
  WiFiClientSecure tls;
  tls.setCACert(LISTEN_TLS_CA_PEM);
  tls.setTimeout(8);
  HTTPClient http;
  http.setTimeout(10000);
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  if (!http.begin(tls, remoteUrl())) return false;
  headers(http);
  http.addHeader("Content-Type", "application/json");
  StaticJsonDocument<192> payload;
  payload["revision"] = revision;
  payload["monitoring"] = monitoring;
  payload["intervalSeconds"] = intervalSeconds;
  String body;
  serializeJson(payload, body);
  const int code = http.POST(body);
  Serial.printf("Remote ACK HTTP: %d\n", code);
  http.end();
  return code == 200;
}
