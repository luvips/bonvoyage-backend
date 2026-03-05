import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'Bon Voyage <noreply@bonvoyage.app>'


export type NotificationType =
  | 'WELCOME'
  | 'PASSWORD_RESET'
  | 'DRAFT_REMINDER'
  | 'ARCHIVE_WARNING'
  | 'TRIP_UPCOMING'
  | 'TRIP_CONFIRMED'

export interface SendEmailOptions {
  to:                string
  notification_type: NotificationType
  template_data:     Record<string, unknown>
}

export interface SendEmailResult {
  success:   boolean
  messageId?: string
  error?:    string
}


function baseTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bon Voyage</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:#1B2A4A;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:1px;">
                ✈️ Bon Voyage
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:40px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f4f6f9;padding:24px 40px;text-align:center;border-top:1px solid #e8ecf0;">
              <p style="margin:0;color:#8896a5;font-size:12px;">
                © 2025 Bon Voyage · Universidad Politécnica de Chiapas<br/>
                <a href="#" style="color:#4ECDC4;text-decoration:none;">Gestionar preferencias de email</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

