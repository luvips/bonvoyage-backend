import { NextRequest, NextResponse } from "next/server";
import  db  from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { resolveUserId } from "@/lib/services/clerk.service";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const internalUserId = await resolveUserId(clerkId);
    if (!internalUserId) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const body = await req.json();
    const { seconds } = body;

    // Accept only bounded positive integer values to avoid noisy/abusive writes.
    if (!Number.isInteger(seconds) || seconds <= 0 || seconds > 1800) {
      return NextResponse.json({ error: "Segundos inválidos" }, { status: 400 });
    }

    const { tripId } = await params;

    const tripCheck = await db.query<{ status: string }>(
      `SELECT status
       FROM trips
       WHERE trip_id = $1
         AND user_id = $2
       LIMIT 1`,
      [tripId, internalUserId]
    );

    if (!tripCheck.rows[0]) {
      return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
    }

    if (tripCheck.rows[0].status !== "DRAFT") {
      return NextResponse.json(
        { error: "Solo se acumula tiempo para viajes en estado DRAFT" },
        { status: 409 }
      );
    }

    await db.query(`
      UPDATE trips 
      SET planning_time_seconds = COALESCE(planning_time_seconds, 0) + $1,
          updated_at = NOW()
      WHERE trip_id = $2
        AND user_id = $3
    `, [seconds, tripId, internalUserId]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
