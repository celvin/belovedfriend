import { Resend } from "resend";

const FROM_NAME = "In Memory of Luis Ventura";

let resend: Resend | null = null;
function getResend(): { resend: Resend; fromEmail: string } {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey) throw new Error("RESEND_API_KEY is required");
  if (!fromEmail) throw new Error("RESEND_FROM_EMAIL is required");
  if (!resend) resend = new Resend(apiKey);
  return { resend, fromEmail };
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const { resend, fromEmail } = getResend();
  const { error } = await resend.emails.send({
    from: `${FROM_NAME} <${fromEmail}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}
