/**
 * UTF-8 / windows-874 double-encoding protection (Apps Script port).
 *
 * Mojibake appears when a UTF-8 byte sequence is decoded as windows-874
 * (cp874) and then re-encoded as UTF-8 — a classic paste-through-wrong-
 * encoding bug. `canonicalizeThai_` detects that corruption and repairs it
 * without ever touching healthy Thai text.
 *
 * Gate: every write path in PortalApi.gs (doPost) and PeopleImportUi.gs
 * runs payload fields through `canonicalizePayload_` before Sheets writes.
 */

var CS874_MAP_ = (function () {
  var m = {};
  for (var i = 0; i <= 0x7f; i++) m[i] = i;
  for (var i = 0x0e01; i <= 0x0e5b; i++) m[i] = 0xa1 + (i - 0x0e01);
  var special = [[0x20ac,0x80],[0x201a,0x82],[0x0192,0x83],[0x201e,0x84],[0x2026,0x85],[0x2020,0x86],[0x2021,0x87],[0x02c6,0x88],[0x2030,0x89],[0x0160,0x8a],[0x2039,0x8b],[0x0152,0x8c],[0x017d,0x8d],[0x2018,0x91],[0x2019,0x92],[0x201c,0x93],[0x201d,0x94],[0x2022,0x95],[0x2013,0x96],[0x2014,0x97],[0x02dc,0x98],[0x2122,0x99],[0x0161,0x9a],[0x203a,0x9b],[0x0153,0x9c],[0x017e,0x9d],[0x0178,0x9f]];
  for (var s = 0; s < special.length; s++) m[special[s][0]] = special[s][1];
  return m;
})();
var CS874_HARD_ = /[\u0080-\u009f\u20ac]/;
var CS874_THAI_ = /[\u0e00-\u0e7f]/;

function containsThai_(text) {
  return CS874_THAI_.test(String(text || ''));
}

function hasHardSig_(text) {
  return CS874_HARD_.test(String(text || ''));
}

/** Encode text to its windows-874 byte interpretation. */
function cp874Encode_(text) {
  var out = [];
  for (var i = 0; i < text.length; i++) {
    var cp = text.charCodeAt(i);
    out.push(CS874_MAP_[cp] === undefined ? 0x3f : CS874_MAP_[cp]);
  }
  return out;
}

/** Strict UTF-8 decode; null when any byte is invalid UTF-8. */
function strictDecodeUtf8_(bytes) {
  try {
    var s = Utilities.newBlob(bytes).getDataAsString('UTF-8');
    return s.indexOf('\ufffd') === -1 ? s : null;
  } catch (err) {
    return null;
  }
}

/** A non-Thai-flanked "\u0E22\u0E17" pair is a double-encoded middle-dot. */
function separatorDotRoundtrip_(line) {
  var found = false;
  for (var i = 0; i < line.length - 1; i++) {
    if (line.charCodeAt(i) === 0x0e22 && line.charCodeAt(i + 1) === 0x0e17) {
      found = true;
      var prev = i > 0 ? line.charCodeAt(i - 1) : -1;
      var next = i + 2 < line.length ? line.charCodeAt(i + 2) : -1;
      var prevThai = prev >= 0x0e00 && prev <= 0x0e7f;
      var nextThai = next >= 0x0e00 && next <= 0x0e7f;
      if (prevThai || nextThai) return false;
    }
  }
  return found;
}

function genuineRoundtrip_(line) {
  var recovered = strictDecodeUtf8_(cp874Encode_(line));
  if (recovered === null || recovered === line) return false;
  return CS874_THAI_.test(recovered) || separatorDotRoundtrip_(line);
}

/** Repair double-encoded Thai in one string. Returns input when inconclusive. */
var CS874_SAFE_ = ['\u2014','\u2026','\u00b7','\u2013','\u2019','\u201c','\u201d','"',"'"];
function canonicalizeThai_(text) {
  text = String(text == null ? '' : text);
  if (!CS874_THAI_.test(text)) return text;
  if (!hasHardSig_(text) && !genuineRoundtrip_(text)) return text;
  var recovered = strictDecodeUtf8_(cp874Encode_(text));
  if (recovered === null || recovered === text) return text;
  if (CS874_THAI_.test(recovered)) return recovered;
  if (CS874_SAFE_.indexOf(recovered) >= 0) return recovered;
  if (separatorDotRoundtrip_(text)) return recovered;
  return text;
}

/** Repair every string inside a JSON-ish payload (objects, arrays, primes). */
function canonicalizePayload_(value) {
  if (typeof value === 'string') return canonicalizeThai_(value);
  if (Object.prototype.toString.call(value) === '[object Array]') {
    return value.map(canonicalizePayload_);
  }
  if (value !== null && typeof value === 'object') {
    var out = {};
    Object.keys(value).forEach(function (k) { out[k] = canonicalizePayload_(value[k]); });
    return out;
  }
  return value;
}

/** Repair a single imported row object (people/request import). */
function canonicalizeRow_(row) {
  return canonicalizePayload_(row || {});
}