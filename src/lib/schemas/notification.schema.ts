import { z } from 'zod'


export const UpdateNotificationSchema = z.object({
  status: z.enum(['CANCELLED']),
})

export const NotificationResponseSchema = z.object({
  notification_id:     z.string().uuid(),
  user_id:             z.string().uuid(),
  notification_type:   z.enum([
    'WELCOME', 'PASSWORD_RESET',
    'DRAFT_REMINDER', 'ARCHIVE_WARNING',
    'TRIP_UPCOMING', 'TRIP_CONFIRMED',
  ]),
  subject:             z.string().nullable(),
  status:              z.enum(['PENDING', 'SENT', 'FAILED', 'CANCELLED']),
  scheduled_for:       z.coerce.date().nullable(),
  sent_at:             z.coerce.date().nullable(),
  retry_count:         z.number(),
  related_entity_type: z.string().nullable(),
  related_entity_id:   z.string().uuid().nullable(),
  created_at:          z.coerce.date(),
})

export type NotificationResponse = z.infer<typeof NotificationResponseSchema>