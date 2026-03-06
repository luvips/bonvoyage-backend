const RAPIDAPI_HOST = "sky-scrapper.p.rapidapi.com";
const RAPIDAPI_BASE_URL = `https://${RAPIDAPI_HOST}`;

type CabinClass = "economy" | "premium_economy" | "business" | "first";

type FlightSortBy =
  | "best"
  | "price_low"
  | "price_high"
  | "fastest"
  | "outbound_take_off_time"
  | "outbound_landing_time"
  | "return_take_off_time"
  | "return_landing_time";

export interface HotelSearchParams {
  destination: string;
  checkIn: string;
  checkOut: string;
  adults?: string;
  rooms?: string;
  currency?: string;
  market?: string;
  countryCode?: string;
  limit?: number;
}

export interface FlightSearchParams {
  originSkyId: string;
  destinationSkyId: string;
  originEntityId: string;
  destinationEntityId: string;
  date: string;
  returnDate?: string;
  cabinClass?: CabinClass;
  adults?: number;
  childrens?: number;
  infants?: number;
  sortBy?: FlightSortBy;
  limit?: number;
  carriersIds?: string | string[];
  currency?: string;
  market?: string;
  countryCode?: string;
}

function getRapidApiHeaders() {
  const apiKey = process.env.RAPIDAPI_KEY;

  if (!apiKey) {
    throw new Error("Falta la variable de entorno RAPIDAPI_KEY");
  }

  return {
    "x-rapidapi-key": apiKey,
    "x-rapidapi-host": RAPIDAPI_HOST,
  };
}

type QueryValue = string | number | undefined;

type LocationCandidate = {
  navigation?: {
    entityId?: string;
    relevantHotelParams?: {
      entityId?: string;
    };
  };
};

export class AirscraperServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "AirscraperServiceError";
    this.statusCode = statusCode;
  }
}

async function skyScraperGet(pathname: string, query: Record<string, QueryValue>) {
  const url = new URL(pathname, RAPIDAPI_BASE_URL);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: getRapidApiHeaders(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new AirscraperServiceError(
      `La solicitud a Sky Scraper falló (${response.status}): ${errorText}`,
      response.status
    );
  }

  const payload = await response.json();

  if (payload && typeof payload === "object" && "status" in payload && payload.status === false) {
    const providerMessage =
      "message" in payload && typeof payload.message === "string"
        ? payload.message
        : "La API de Sky Scraper devolvió un error";

    throw new AirscraperServiceError(providerMessage, 400);
  }

  return payload;
}

export async function searchHotels(params: HotelSearchParams) {
  const {
    destination,
    checkIn,
    checkOut,
    adults = "1",
    rooms = "1",
    currency = "USD",
    market = "en-US",
    countryCode = "US",
    limit = 30,
  } = params;

  const destinationValue = destination.trim();
  const isNumericDestination = /^\d+$/.test(destinationValue);

  let hotelEntityId = destinationValue;

  if (!isNumericDestination) {
    const locationResult = await searchLocation(destinationValue);
    const candidates: LocationCandidate[] = Array.isArray(locationResult?.data)
      ? locationResult.data
      : [];

    const match = candidates.find((candidate) => {
      return Boolean(
        candidate?.navigation?.relevantHotelParams?.entityId ||
          candidate?.navigation?.entityId
      );
    });

    const resolvedEntityId =
      match?.navigation?.relevantHotelParams?.entityId || match?.navigation?.entityId;

    if (!resolvedEntityId) {
      throw new AirscraperServiceError(
        "No se pudo resolver el destino. Usa un entityId numérico o un nombre de ciudad válido.",
        400
      );
    }

    hotelEntityId = String(resolvedEntityId);
  }

  return skyScraperGet("/api/v1/hotels/searchHotels", {
    limit,
    sorting: "-relevance",
    market,
    countryCode,
    adults,
    rooms,
    currency,
    entityId: hotelEntityId,
    checkin: checkIn,
    checkout: checkOut,
  });
}

export async function searchLocation(query: string) {
  return skyScraperGet("/api/v1/flights/searchAirport", {
    query,
  });
}

export async function searchFlights(params: FlightSearchParams) {
  const {
    originSkyId,
    destinationSkyId,
    originEntityId,
    destinationEntityId,
    date,
    returnDate,
    cabinClass,
    adults = 1,
    childrens,
    infants,
    sortBy,
    limit,
    carriersIds,
    currency = "USD",
    market = "en-US",
    countryCode = "US",
  } = params;

  const flightsQuery = {
    originSkyId,
    destinationSkyId,
    originEntityId,
    destinationEntityId,
    date,
    returnDate,
    cabinClass,
    adults,
    childrens,
    infants,
    sortBy,
    limit,
    carriersIds: Array.isArray(carriersIds) ? carriersIds.join(",") : carriersIds,
    currency,
    market,
    countryCode,
  };

  try {
    return await skyScraperGet("/api/v2/flights/searchFlights", flightsQuery);
  } catch (error) {
    const isGenericProviderError =
      error instanceof AirscraperServiceError &&
      error.statusCode === 400 &&
      error.message.includes("Something went wrong");

    if (!isGenericProviderError) {
      throw error;
    }

    return skyScraperGet("/api/v1/flights/searchFlights", flightsQuery);
  }
}