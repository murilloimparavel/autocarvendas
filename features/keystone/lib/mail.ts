'use server' 

import { createTransport, getTestMessageUrl } from "nodemailer";
import type { PasswordResetPath } from './passwordResetPath';
import type { Locale } from '@/features/i18n/messages'

// Utility function to get base URL for emails
function getBaseUrlForEmails(): string {
  if (process.env.SMTP_STORE_LINK) {
    return process.env.SMTP_STORE_LINK;
  }

  // Fallback warning - this should be set in production
  console.warn('SMTP_STORE_LINK not set. Please add SMTP_STORE_LINK to your environment variables for email links to work properly.');
  return '';
}

const transport = createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || undefined,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

function passwordResetEmail({ url, locale }: { url: string; locale: Locale }): string {
  const copy = locale === 'pt-BR'
    ? { instruction: 'Clique abaixo para redefinir sua senha.', button: 'Redefinir senha', ignore: 'Se você não solicitou esta mensagem, pode ignorá-la.' }
    : { instruction: 'Please click below to reset your password.', button: 'Reset password', ignore: 'If you did not request this email, you can safely ignore it.' }
  const backgroundColor = "#f9f9f9";
  const textColor = "#444444";
  const mainBackgroundColor = "#ffffff";
  const buttonBackgroundColor = "#346df1";
  const buttonBorderColor = "#346df1";
  const buttonTextColor = "#ffffff";

  return `
    <body style="background: ${backgroundColor};">
      <table width="100%" border="0" cellspacing="20" cellpadding="0" style="background: ${mainBackgroundColor}; max-width: 600px; margin: auto; border-radius: 10px;">
        <tr>
          <td align="center" style="padding: 10px 0px 0px 0px; font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            ${copy.instruction}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 20px 0;">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" style="border-radius: 5px;" bgcolor="${buttonBackgroundColor}"><a href="${url}" target="_blank" style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${buttonTextColor}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${buttonBorderColor}; display: inline-block; font-weight: bold;">${copy.button}</a></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            ${copy.ignore}
          </td>
        </tr>
      </table>
    </body>
  `;
}

export async function sendPasswordResetEmail(resetToken: string, to: string, baseUrl?: string, resetPath: PasswordResetPath = '/account/reset', locale: Locale = 'pt-BR'): Promise<void> {
  // Use provided baseUrl or fall back to utility function
  const frontendUrl = baseUrl || getBaseUrlForEmails();

  // email the user a token
  const info = await transport.sendMail({
    to,
    from: process.env.SMTP_FROM,
    subject: locale === 'pt-BR' ? 'Redefinição de senha' : 'Password reset',
    html: passwordResetEmail({
      url: `${frontendUrl}${resetPath}?token=${encodeURIComponent(resetToken)}`,
      locale,
    }),
  });
  if (process.env.MAIL_USER?.includes("ethereal.email")) {
    console.log(`📧 Message Sent!  Preview it at ${getTestMessageUrl(info as any)}`);
  }
}

/** Receipt for a test-drive or service request: the dealership still confirms the time. */
export async function sendRequestReceiptEmail(
  to: string,
  details: { dealershipName: string; kind: 'test_drive' | 'service'; what: string; whenLabel: string; requestNumber: string; customerName: string; url: string; locale?: Locale },
): Promise<{ sent: boolean; error?: string; messageId?: string }> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return { sent: false, error: 'not_configured' }
  const escape = (value: string) => value.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string)
  const locale = details.locale || 'pt-BR'
  const noun = locale === 'pt-BR'
    ? details.kind === 'test_drive' ? 'test-drive' : 'agendamento de serviço'
    : details.kind === 'test_drive' ? 'test drive' : 'service appointment'
  const subject = locale === 'pt-BR'
    ? `${details.dealershipName}: recebemos sua solicitação de ${noun}`
    : `${details.dealershipName}: we received your ${noun} request`
  const greeting = locale === 'pt-BR' ? 'Olá' : 'Hi'
  const followup = locale === 'pt-BR' ? 'Entraremos em contato para confirmar o horário.' : 'We will contact you to confirm the time.'
  const requestedTime = locale === 'pt-BR' ? 'Horário solicitado' : 'Requested time'
  const requestNumber = locale === 'pt-BR' ? 'Número da solicitação' : 'Request number'
  const visit = locale === 'pt-BR' ? 'Acessar a loja' : 'Visit'
  try {
    const info = await transport.sendMail({
      to,
      from: process.env.SMTP_FROM,
      subject,
      html: `<body style="font-family: Helvetica, Arial, sans-serif; color: #444;"><p>${greeting} ${escape(details.customerName)}, ${escape(details.dealershipName)} ${locale === 'pt-BR' ? `recebeu sua solicitação de ${noun}.` : `received your ${noun} request.`} ${followup}</p><p><strong>${escape(details.what)}</strong><br>${requestedTime}: ${escape(details.whenLabel)}<br>${requestNumber}: ${escape(details.requestNumber)}</p>${details.url ? `<p><a href="${escape(details.url)}" style="background:#346df1;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;">${visit} ${escape(details.dealershipName)}</a></p>` : ''}</body>`,
    });
    return { sent: true, messageId: [String((info as any)?.messageId || ''), String((info as any)?.response || '').slice(0,120)].filter(Boolean).join(' | ') };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : 'send_failed' };
  }
}

/** Deposit confirmation: names the car, the amount, that it is held, and the next step. */
export async function sendReservationConfirmationEmail(
  to: string,
  details: { dealershipName: string; customerName: string; vehicle: string; stockNumber: string; depositLabel: string; salesperson: string; phone: string; address: string; reference: string; vehicleUrl: string; accountUrl: string },
): Promise<{ sent: boolean; error?: string; messageId?: string }> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return { sent: false, error: 'not_configured' }
  const escape = (value: string) => value.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string)
  const who = details.salesperson ? `${escape(details.salesperson)} from our sales team` : 'Our sales team'
  const call = details.phone ? ` If you'd rather not wait, call us at ${escape(details.phone)}.` : ''
  const lines = [
    `<strong>${escape(details.vehicle)}</strong>`,
    details.stockNumber ? `Stock ${escape(details.stockNumber)}` : '',
    `Deposit paid: ${escape(details.depositLabel)} (refundable, counts toward your purchase)`,
    `Reference: ${escape(details.reference)}`,
  ].filter(Boolean).join('<br>')
  try {
    const info = await transport.sendMail({
      to,
      from: process.env.SMTP_FROM,
      subject: `${details.dealershipName}: your ${details.vehicle} is reserved`,
      html: `<body style="font-family: Helvetica, Arial, sans-serif; color: #444;"><p>Hi ${escape(details.customerName)}, thanks for your deposit. We've taken the ${escape(details.vehicle)} off the market for you.</p><p>${lines}</p><p><strong>What happens next:</strong> ${who} will call you shortly to confirm the details and set a time to sign and take delivery.${call}</p>${details.address ? `<p>${escape(details.dealershipName)}<br>${escape(details.address)}</p>` : ''}${details.accountUrl ? `<p><a href="${escape(details.accountUrl)}" style="background:#346df1;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;">View your reservation</a></p>` : ''}</body>`,
    });
    return { sent: true, messageId: [String((info as any)?.messageId || ''), String((info as any)?.response || '').slice(0,120)].filter(Boolean).join(' | ') };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : 'send_failed' };
  }
}
