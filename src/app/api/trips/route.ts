import { NextRequest, NextResponse } from "next/server";
import  db  from "@/lib/db";
import { auth, currentUser } from "@clerk/nextjs/server";

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userQuery = await db.query(
      'SELECT user_id FROM user_identities WHERE provider_id = $1',
      [userId]
    );

    if (userQuery.rows.length === 0) {
      return NextResponse.json([], { status: 200 });
    }

    const internalUserId = userQuery.rows[0].user_id;

    const tripsResult = await db.query(
      `SELECT
         t.trip_id,
         t.user_id,
         t.destination_id,
         t.trip_name,
         t.start_date,
         t.end_date,
         t.status,
         t.total_budget,
         t.currency,
         t.is_favorite,
         t.confirmed_at,
         t.created_at,
         t.updated_at,
         d.name AS destination_name,
         d.city AS destination_city,
         d.image_url AS destination_image,
         (t.end_date - t.start_date + 1) AS total_days,
         COUNT(ii.item_id) FILTER (WHERE ii.status <> 'CANCELLED') AS total_items
       FROM trips t
       LEFT JOIN destinations d ON d.destination_id = t.destination_id
       LEFT JOIN itinerary_days id_ ON id_.trip_id = t.trip_id
       LEFT JOIN itinerary_items ii ON ii.day_id = id_.day_id
       WHERE t.user_id = $1
       GROUP BY t.trip_id, d.name, d.city, d.image_url
       ORDER BY t.is_favorite DESC, t.start_date DESC, t.created_at DESC`,
      [internalUserId]
    );

    return NextResponse.json(tripsResult.rows, { status: 200 });
  } catch (error: any) {
    console.error(" Error al listar viajes:", error.message);
    return NextResponse.json(
      { error: "Error interno del servidor", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    const user = await currentUser();

    if (!userId || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let userQuery = await db.query(
      'SELECT user_id FROM user_identities WHERE provider_id = $1',
      [userId]
    );

    let internalUserId;

    if (userQuery.rows.length === 0) {
      const email = user.emailAddresses[0].emailAddress;
      const firstName = user.firstName || "Viajero";
      const lastName = user.lastName || "Bonvoyage";

      const newUser = await db.query(`
        INSERT INTO users (email, first_name, last_name)
        VALUES ($1, $2, $3)
        RETURNING user_id;
      `, [email, firstName, lastName]);

      internalUserId = newUser.rows[0].user_id;

      await db.query(`
        INSERT INTO user_identities (user_id, provider, provider_id)
        VALUES ($1, 'GOOGLE', $2);
      `, [internalUserId, userId]);
    } else {
      internalUserId = userQuery.rows[0].user_id;
    }

    const body = await req.json();
    const {
      trip_name, start_date, end_date, currency, total_budget,
      destination_name, destination_country, destination_city, city, latitude, longitude,
      destination_image,
    } = body;

    const normalizedDestinationName = typeof destination_name === 'string'
      ? destination_name.trim()
      : '';
    const normalizedDestinationCity = typeof destination_city === 'string'
      ? destination_city.trim()
      : typeof city === 'string'
        ? city.trim()
        : '';
    const safeDestinationCity = normalizedDestinationCity || normalizedDestinationName || 'Unknown';

    if (!trip_name || !normalizedDestinationName || !start_date || !end_date) {
      return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 });
    }

    let destId;
    
    const existingDest = await db.query(
      'SELECT destination_id FROM destinations WHERE name = $1 LIMIT 1',
      [normalizedDestinationName]
    );

    if (existingDest.rows.length > 0) {
      destId = existingDest.rows[0].destination_id;
      // Update image_url if provided and not already set
      if (destination_image) {
        await db.query(
          `UPDATE destinations SET image_url = $1 WHERE destination_id = $2 AND image_url IS NULL`,
          [destination_image, destId]
        );
      }
    } else {
      const newDest = await db.query(`
        INSERT INTO destinations (name, city, country, latitude, longitude, image_url)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING destination_id;
      `, [
        normalizedDestinationName,
        safeDestinationCity,
        destination_country || 'Unknown',
        latitude || null,
        longitude || null,
        destination_image || null,
      ]);

      destId = newDest.rows[0].destination_id;
    }

    const tripQuery = `
      INSERT INTO trips (user_id, destination_id, trip_name, start_date, end_date, currency, total_budget, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT')
      RETURNING trip_id;
    `;

    const tripValues = [
      internalUserId, 
      destId, 
      trip_name, 
      start_date, 
      end_date, 
      currency || 'USD', 
      total_budget || 0
    ];

    const tripResult = await db.query(tripQuery, tripValues);
    const tripId = tripResult.rows[0].trip_id;

    const start = new Date(start_date);
    const end = new Date(end_date);
    
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    const totalDays = Math.min(diffDays, 30);

    for (let i = 0; i < totalDays; i++) {
      const currentDayDate = new Date(start);
      currentDayDate.setDate(start.getDate() + i);
      const dayDateString = currentDayDate.toISOString().split('T')[0];

      await db.query(`
        INSERT INTO itinerary_days (trip_id, day_date, day_number)
        VALUES ($1, $2, $3)
        ON CONFLICT (trip_id, day_number) DO NOTHING;
      `, [tripId, dayDateString, i + 1]);
    }

    return NextResponse.json({
      success: true,
      message: "Viaje, destino e itinerario creados exitosamente",
      trip_id: tripId 
    });

  } catch (error: any) {
    console.error(" Error en la creación del viaje:", error.message);
    return NextResponse.json(
      { error: "Error interno del servidor", details: error.message },
      { status: 500 }
    );
  }
}