import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { auth } from "@clerk/nextjs/server";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const id = body.id ?? body.external_id;
    const name = body.name ?? body.item_name;
    const latitudeRaw = body.latitude ?? body.lat;
    const longitudeRaw = body.longitude ?? body.lng;
    const ratingRaw = body.rating;
    const type = body.type ?? body.service_type ?? null;
    const address = body.address ?? null;
    const trip_id = body.trip_id;
    const day_id = body.day_id;

    if (!trip_id || !day_id || !id || !name) {
      return NextResponse.json(
        { error: "Faltan datos obligatorios (trip_id, day_id, id, name)" },
        { status: 400 }
      );
    }

    const latitude = Number(latitudeRaw);
    const longitude = Number(longitudeRaw);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ error: "latitude/longitude inválidos" }, { status: 400 });
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return NextResponse.json({ error: "latitude/longitude fuera de rango" }, { status: 400 });
    }

    const rating = Number(ratingRaw);
    const safeRating = Number.isFinite(rating) ? rating : 0;

    const upsertPlaceQuery = `
      INSERT INTO place_references (external_id, category, name, latitude, longitude, rating, api_source, extended_data)
      VALUES ($1, 'SERVICE', $2, $3, $4, $5, 'frontend', $6)
      ON CONFLICT (external_id, category)
      DO UPDATE SET name = EXCLUDED.name, extended_data = EXCLUDED.extended_data
      RETURNING reference_id;
    `;

    const extendedData = JSON.stringify({
      service_type: type,
      address: address || null,
    });

    const placeResult = await db.query(upsertPlaceQuery, [
      id,
      name,
      latitude,
      longitude,
      safeRating,
      extendedData,
    ]);
    const reference_id = placeResult.rows[0].reference_id;

    const result = await db.query<{ item_id: string }>(
      `SELECT fn_add_itinerary_item(
         $1::uuid, $2::uuid, $3::varchar, $4::uuid, NULL::uuid, NULL::time, NULL::time, 0::numeric, $5::text
       ) AS item_id`,
      [trip_id, day_id, "PLACE", reference_id, `Servicio de emergencia / utilidad: ${type}`]
    );

    return NextResponse.json(
      {
        success: true,
        message: "Servicio guardado exitosamente en el itinerario",
        item_id: result.rows[0].item_id,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[POST /api/services] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
