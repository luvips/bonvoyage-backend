import db from '@/lib/db'
import { ok, err } from '@/lib/response'
import { sendEmail, NotificationType } from '@/lib/services/email.service'

// ------------------------------------------------------------
//  GET /api/v1/cron/send-emails (Cambio importante: De POST a GET)
//  Protegido con CRON_SECRET para evitar llamadas externas
// ------------------------------------------------------------
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return err('Unauthorized', 401)
  }

  const MAX_BATCH   = 50  
  const MAX_RETRIES = 3   

  try {
    const pending = await db.query<{
      notification_id: string
      user_id:         string
      notification_type: NotificationType
      template_data:   Record<string, unknown>
      retry_count:     number
      email:           string
    }>(
      `SELECT
         en.notification_id,
         en.user_id,
         en.notification_type,
         en.template_data,
         en.retry_count,
         u.email
       FROM email_notifications en
       JOIN users u ON u.user_id = en.user_id
       WHERE en.status        = 'PENDING'
         AND en.scheduled_for <= NOW()
         AND en.retry_count   <  $1
         AND u.deleted_at     IS NULL
       ORDER BY en.scheduled_for ASC
       LIMIT $2`,
      [MAX_RETRIES, MAX_BATCH]
    )

    if (pending.rows.length === 0) {
      return ok({ processed: 0, message: 'No pending notifications' })
    }

    const results = { sent: 0, failed: 0 }

    for (const notification of pending.rows) {
      const result = await sendEmail({
        to:                notification.email,
        notification_type: notification.notification_type,
        template_data:     notification.template_data ?? {},
      })

      if (result.success) {
        await db.query(
          `UPDATE email_notifications
           SET status  = 'SENT',
               sent_at = NOW()
           WHERE notification_id = $1`,
          [notification.notification_id]
        )
        results.sent++
        console.log(`[Cron] ✓ Sent ${notification.notification_type} to ${notification.email}`)

      } else {
        const newRetryCount = notification.retry_count + 1
        const newStatus     = newRetryCount >= MAX_RETRIES ? 'FAILED' : 'PENDING'

        await db.query(
          `UPDATE email_notifications
           SET retry_count   = $1,
               status        = $2,
               error_message = $3
           WHERE notification_id = $4`,
          [newRetryCount, newStatus, result.error, notification.notification_id]
        )
        results.failed++
        console.error(`[Cron] ✗ Failed ${notification.notification_type} to ${notification.email}: ${result.error}`)
      }
    }

    console.log(`[Cron] Batch complete — sent: ${results.sent}, failed: ${results.failed}`)
    return ok({
      processed: pending.rows.length,
      sent:      results.sent,
      failed:    results.failed,
    })

  } catch (error) {
    console.error('[Cron /send-emails]', error)
    return err('Internal server error', 500)
  }
}