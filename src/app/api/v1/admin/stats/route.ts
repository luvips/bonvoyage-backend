import { auth } from '@clerk/nextjs/server'
import { ok, err } from '@/lib/response'
import { requireAdmin } from '@/lib/services/admin.service'
import db from '@/lib/db'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return err('No autorizado', 401)

    const adminId = await requireAdmin(userId)
    if (!adminId) return err('Forbidden', 403)

    const result = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL)                                      AS total_users,
        (SELECT COUNT(*) FROM trips)                                                               AS total_trips,
        (SELECT COUNT(*) FROM trips WHERE status = 'DRAFT')                                        AS draft_trips,
        (SELECT COUNT(*) FROM trips WHERE status = 'CONFIRMED')                                    AS confirmed_trips,
        (SELECT COUNT(*) FROM trips WHERE status = 'COMPLETED')                                    AS completed_trips,
        (SELECT COUNT(*) FROM trips WHERE status = 'CANCELLED')                                    AS cancelled_trips,
        (SELECT COUNT(*) FROM tickets WHERE budget_status = 'OVER_BUDGET')                          AS tickets_excedidos,
<parameter name="new_string">        (SELECT COUNT(*) FROM tickets WHERE budget_status = 'OVER_BUDGET')                          AS tickets_excedidos,
        (SELECT COUNT(*) FROM tickets WHERE budget_status = 'WARNING')                             AS tickets_advertencia,
        (SELECT COUNT(*) FROM wishlist)                                                            AS total_wishlist,
        (SELECT COUNT(*) FROM trip_tags)                                                           AS total_tags_asignados,
        (SELECT COUNT(*) FROM vw_hipotesis_validacion WHERE resultado_hipotesis = 'HIPOTESIS VALIDADA') AS hipotesis_validadas,
        (SELECT COUNT(*) FROM vw_hipotesis_validacion)                                             AS hipotesis_total,
        (SELECT ROUND(AVG(horas_planificacion), 2) FROM vw_hipotesis_validacion)                   AS promedio_horas_planificacion
    `)

    return ok(result.rows[0])
  } catch (e: any) {
    return err(e.message, 500)
  }
}
