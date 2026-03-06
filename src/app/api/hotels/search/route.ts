import { NextRequest, NextResponse } from "next/server";
import { searchHotels } from "@/lib/services/airscraper.service"; 
import { CleanHotelSchema } from "@/lib/schemas/hotel-response.schema";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  const destination = searchParams.get("destination");
  const checkIn = searchParams.get("checkin") || searchParams.get("checkIn"); 
  const checkOut = searchParams.get("checkout") || searchParams.get("checkOut");
  const adults = searchParams.get("adults") || "1";
  const rooms = searchParams.get("rooms") || "1";
  const currency = searchParams.get("currency") || "USD";

  if (!destination || !checkIn || !checkOut) {
    return NextResponse.json(
      { error: "Faltan parámetros obligatorios" },
      { status: 400 }
    );
  }

try {
    const rawHotelData: any = await searchHotels({
      destination, checkIn, checkOut, adults, rooms, currency
    });

    const hotelList = rawHotelData?.data?.hotels || [];

    if (!Array.isArray(hotelList)) {
      return NextResponse.json({ success: true, count: 0, data: [] });
    }

const cleanHotels = hotelList.map((hotel: Record<string, any>) => {
      const rawCleanHotel = {
        id: hotel?.hotelId || null,
        name: hotel?.name,
        // Usamos || "" para asegurar que si es null, al menos mande un string vacío y Zod no se queje
        destination: destination || "", 
        price: hotel?.price,
        rating: hotel?.rating?.value || hotel?.stars,
        imageUrl: hotel?.heroImage,
        latitude: hotel?.coordinates?.[1] || null,
        longitude: hotel?.coordinates?.[0] || null,
      };

      return CleanHotelSchema.parse(rawCleanHotel);
    });
    return NextResponse.json({
      success: true,
      count: cleanHotels.length,
      data: cleanHotels
    });

  } catch (err) {
    const detalle = err instanceof Error ? err.message : "Error desconocido";

    return NextResponse.json(
      { error: "Error al buscar hoteles", detalle },
      { status: 500 }
    );
  }

}