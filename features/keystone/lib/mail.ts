'use server' 

import { createTransport, getTestMessageUrl } from "nodemailer";
import type { PasswordResetPath } from './passwordResetPath';

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

function passwordResetEmail({ url }: { url: string }): string {
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
            Please click below to reset your password
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 20px 0;">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" style="border-radius: 5px;" bgcolor="${buttonBackgroundColor}"><a href="${url}" target="_blank" style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${buttonTextColor}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${buttonBorderColor}; display: inline-block; font-weight: bold;">Reset Password</a></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            If you did not request this email you can safely ignore it.
          </td>
        </tr>
      </table>
    </body>
  `;
}

export async function sendPasswordResetEmail(resetToken: string, to: string, baseUrl?: string, resetPath: PasswordResetPath = '/account/reset'): Promise<void> {
  // Use provided baseUrl or fall back to utility function
  const frontendUrl = baseUrl || getBaseUrlForEmails();

  // email the user a token
  const info = await transport.sendMail({
    to,
    from: process.env.SMTP_FROM,
    subject: "Your password reset token!",
    html: passwordResetEmail({
      url: `${frontendUrl}${resetPath}?token=${encodeURIComponent(resetToken)}`,
    }),
  });
  if (process.env.MAIL_USER?.includes("ethereal.email")) {
    console.log(`📧 Message Sent!  Preview it at ${getTestMessageUrl(info as any)}`);
  }
}

/** Receipt for a test-drive or service request: the dealership still confirms the time. */
export async function sendRequestReceiptEmail(
  to: string,
  details: { dealershipName: string; kind: 'test_drive' | 'service'; what: string; whenLabel: string; requestNumber: string; customerName: string; url: string },
): Promise<{ sent: boolean; error?: string; messageId?: string }> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return { sent: false, error: 'not_configured' }
  const escape = (value: string) => value.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string)
  const noun = details.kind === 'test_drive' ? 'test drive' : 'service appointment'
  try {
    const info = await transport.sendMail({
      to,
      from: process.env.SMTP_FROM,
      subject: `${details.dealershipName}: we received your ${noun} request`,
      html: `<body style="font-family: Helvetica, Arial, sans-serif; color: #444;"><p>Hi ${escape(details.customerName)}, ${escape(details.dealershipName)} received your ${noun} request. We will contact you to confirm the time.</p><p><strong>${escape(details.what)}</strong><br>Requested time: ${escape(details.whenLabel)}<br>Request number: ${escape(details.requestNumber)}</p>${details.url ? `<p><a href="${escape(details.url)}" style="background:#346df1;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;">Visit ${escape(details.dealershipName)}</a></p>` : ''}</body>`,
    });
    return { sent: true, messageId: String((info as any)?.messageId || '') };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : 'send_failed' };
  }
}
