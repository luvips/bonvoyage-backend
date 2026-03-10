import { NextRequest, NextResponse } from "next/server";

const PRICE_LEVEL: Record<string, string> = {
  PRICE_LEVEL_FREE:           "Gratis",
  PRICE_LEVEL_INEXPENSIVE:    "$",
  PRICE_LEVEL_MODERATE:       "$$",
  PRICE_LEVEL_EXPENSIVE:      "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

const WEEKDAY_PREFIXES = [
  ["Lunes", "Monday"],
  ["Martes", "Tuesday"],
  ["Miércoles", "Wednesday"],
  ["Jueves", "Thursday"],
  ["Viernes", "Friday"],
  ["Sábado", "Saturday"],
  ["Domingo", "Sunday"],
] as const;

function extractHours(place: any) {
  const regularWeek = place?.regularOpeningHours?.weekdayDescriptions;
  const currentWeek = place?.currentOpeningHours?.weekdayDescriptions;

  const weeklyHours = Array.isArray(regularWeek)
    ? regularWeek
    : Array.isArray(currentWeek)
      ? currentWeek
      : [];

  const isOpenNow = Boolean(place?.currentOpeningHours?.openNow);

  const now = new Date();
  const mondayFirstIndex = (now.getDay() + 6) % 7;
  const [esDay, enDay] = WEEKDAY_PREFIXES[mondayFirstIndex];

  const todayHours =
    weeklyHours.find(
      (description: string) =>
        description.startsWith(`${esDay}:`) ||
        description.startsWith(`${enDay}:`)
    ) ?? weeklyHours[mondayFirstIndex] ?? null;

  return {
    isOpenNow,
    todayHours,
    weeklyHours,
  };
}

function parseIncludedTypes(rawTypes: string | null, fallback: string[]) {
  if (!rawTypes) return fallback;

  const parsed = rawTypes
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^[a-z_]+$/.test(value))
    .slice(0, 10);

  return parsed.length > 0 ? parsed : fallback;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const radiusParam = searchParams.get("radius");
  const typesParam = searchParams.get("types");
  const maxResultsParam = searchParams.get("maxResults");

  if (!lat || !lng) {
    return NextResponse.json({ error: "Missing lat/lng" }, { status: 400 });
  }

  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: "Invalid lat/lng" }, { status: 400 });
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: "lat/lng out of range" }, { status: 400 });
  }

  const parsedRadius = radiusParam ? Number(radiusParam) : 10000;
  if (!Number.isFinite(parsedRadius) || parsedRadius <= 0) {
    return NextResponse.json({ error: "Invalid radius" }, { status: 400 });
  }

  const radius = Math.min(Math.round(parsedRadius), 50000);
  const maxResultsParsed = maxResultsParam ? Number(maxResultsParam) : 15;
  const maxResultCount = Number.isFinite(maxResultsParsed)
    ? Math.min(Math.max(Math.round(maxResultsParsed), 1), 20)
    : 15;

  const includedTypes = parseIncludedTypes(typesParam, ["tourist_attraction"]);

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.rating",
        "places.userRatingCount",
        "places.priceLevel",
        "places.editorialSummary",
        "places.photos",
        "places.location",
        "places.types",
        "places.currentOpeningHours",
        "places.regularOpeningHours",
      ].join(","),
    },
    body: JSON.stringify({
      includedTypes,
      locationRestriction: {
        circle: {
          center: { latitude, longitude },
          radius,
        },
      },
      maxResultCount,
      languageCode: "es",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: "Google Places error", detail: err }, { status: 502 });
  }

  const data = await res.json();

  const places = (data.places ?? []).map((p: any) => {
    const photoName = p.photos?.[0]?.name;
    
    const photoUrl = photoName
      ? `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400&maxWidthPx=600&key=${apiKey}`
      : null;
    const { isOpenNow, todayHours, weeklyHours } = extractHours(p);

    return {
      id: p.id,
      name: p.displayName?.text ?? "Sin nombre",
      address: p.formattedAddress ?? "",
      rating: p.rating ?? null,
      ratingCount: p.userRatingCount ?? null,
      priceLevel: PRICE_LEVEL[p.priceLevel] ?? null,
      description: p.editorialSummary?.text ?? null,
      photoUrl,
      lat: p.location?.latitude ?? 0,
      lng: p.location?.longitude ?? 0,
      isOpenNow,
      todayHours,
      weeklyHours,
    };
  });

  return NextResponse.json({ places });
}
