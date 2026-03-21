import { NextResponse } from "next/server";

const GOOGLE_PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";
const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const DEFAULT_USER_AGENT = "SeaNeB-Property-App";

const getApiKey = () => "";

const normalizeCoordinate = (value) => {
  if (value === "" || value === null || value === undefined) return "";
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : "";
};

const resolvePlaceId = (request, body = null) => {
  if (body) {
    const fromBody = String(body.place_id || body.placeId || "").trim();
    if (fromBody) return fromBody;
  }

  try {
    const { searchParams } = new URL(request.url);
    return String(searchParams.get("place_id") || searchParams.get("placeId") || "").trim();
  } catch {
    return "";
  }
};

const resolveQuery = (request, body = null) => {
  if (body) {
    const fromBody = String(body.query || body.q || body.address || "").trim();
    if (fromBody) return fromBody;
  }

  try {
    const { searchParams } = new URL(request.url);
    return String(
      searchParams.get("query") ||
        searchParams.get("q") ||
        searchParams.get("address") ||
        ""
    ).trim();
  } catch {
    return "";
  }
};

const fetchGeometry = async (placeId, apiKey) => {
  const params = new URLSearchParams({
    place_id: placeId,
    fields: "geometry",
    key: apiKey,
  });

  const response = await fetch(`${GOOGLE_PLACES_DETAILS_URL}?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  const location = data?.result?.geometry?.location;
  const lat = normalizeCoordinate(location?.lat);
  const lng = normalizeCoordinate(location?.lng);

  return { response, data, lat, lng };
};

const fetchNominatimGeometry = async (query) => {
  const safeQuery = String(query || "").trim();
  if (!safeQuery) {
    return { lat: "", lng: "", provider: "" };
  }

  const params = new URLSearchParams({
    format: "json",
    q: safeQuery,
    limit: "1",
  });

  const response = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      "User-Agent": DEFAULT_USER_AGENT,
      "Accept-Language": "en",
    },
  });

  const data = await response.json().catch(() => []);
  const first = Array.isArray(data) ? data[0] : null;
  const lat = normalizeCoordinate(first?.lat);
  const lng = normalizeCoordinate(first?.lon);
  return { lat, lng, provider: "nominatim" };
};

export async function GET(request) {
  const placeId = resolvePlaceId(request);
  const query = resolveQuery(request);
  if (!placeId) {
    return NextResponse.json(
      { error: { code: "PLACE_ID_REQUIRED", message: "place_id is required" } },
      { status: 400 }
    );
  }

  const apiKey = getApiKey();
  try {
    if (apiKey) {
      const { response, data, lat, lng } = await fetchGeometry(placeId, apiKey);
      if (response.ok && (lat !== "" || lng !== "")) {
        return NextResponse.json({ lat, lng, status: data?.status, provider: "google" }, { status: 200 });
      }
    }

    if (query) {
      const fallback = await fetchNominatimGeometry(query);
      if (fallback.lat !== "" || fallback.lng !== "") {
        return NextResponse.json(fallback, { status: 200 });
      }
    }

    return NextResponse.json(
      {
        error: {
          code: apiKey ? "GOOGLE_PLACES_EMPTY" : "GOOGLE_API_KEY_MISSING",
          message: apiKey
            ? "Unable to resolve place geometry"
            : "Google Maps API key is not configured",
        },
      },
      { status: 502 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "GEOMETRY_LOOKUP_FAILED",
          message: error?.message || "Failed to fetch place geometry",
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const placeId = resolvePlaceId(request, body);
  const query = resolveQuery(request, body);
  if (!placeId) {
    return NextResponse.json(
      { error: { code: "PLACE_ID_REQUIRED", message: "place_id is required" } },
      { status: 400 }
    );
  }

  const apiKey = getApiKey();
  try {
    if (apiKey) {
      const { response, data, lat, lng } = await fetchGeometry(placeId, apiKey);
      if (response.ok && (lat !== "" || lng !== "")) {
        return NextResponse.json({ lat, lng, status: data?.status, provider: "google" }, { status: 200 });
      }
    }

    if (query) {
      const fallback = await fetchNominatimGeometry(query);
      if (fallback.lat !== "" || fallback.lng !== "") {
        return NextResponse.json(fallback, { status: 200 });
      }
    }

    return NextResponse.json(
      {
        error: {
          code: apiKey ? "GOOGLE_PLACES_EMPTY" : "GOOGLE_API_KEY_MISSING",
          message: apiKey
            ? "Unable to resolve place geometry"
            : "Google Maps API key is not configured",
        },
      },
      { status: 502 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "GEOMETRY_LOOKUP_FAILED",
          message: error?.message || "Failed to fetch place geometry",
        },
      },
      { status: 500 }
    );
  }
}
