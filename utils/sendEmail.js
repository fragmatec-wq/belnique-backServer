const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  const host = process.env.SMTP_HOST || undefined;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const service = process.env.SMTP_SERVICE || undefined;
  const secure = process.env.SMTP_SECURE === 'true' || (port === 465);
  const user = process.env.SMTP_EMAIL;
  const pass = process.env.SMTP_PASSWORD;

  // Log configuration (masking password) for debugging in production
  console.log(`[Email Service] Preparing to send email to: ${options.email}`);
  console.log(`[Email Service] Config: Service=${service || 'N/A'}, Host=${host || 'smtp.gmail.com'}, Port=${port || 587}, Secure=${secure}, User=${user ? 'Set' : 'Missing'}`);

  if (!user || !pass) {
    console.error('[Email Service] Error: SMTP credentials (SMTP_EMAIL or SMTP_PASSWORD) not configured.');
    throw new Error('SMTP credentials not configured');
  }

  let transporter;
  if (service) {
    transporter = nodemailer.createTransport({
      service,
      auth: { user, pass },
      tls: { ciphers: 'TLSv1.2', rejectUnauthorized: false }
    });
  } else {
    transporter = nodemailer.createTransport({
      host: host || 'smtp.gmail.com',
      port: port || 587,
      secure,
      auth: { user, pass },
      tls: { ciphers: 'TLSv1.2', rejectUnauthorized: false }
    });
  }

  const message = {
    from: `${process.env.FROM_NAME || 'Ateliê Belnique'} <${process.env.FROM_EMAIL || process.env.SMTP_EMAIL}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html,
  };

  try {
    await transporter.verify();
    console.log('[Email Service] Transporter verified successfully.');

    const info = await transporter.sendMail(message);
    console.log('[Email Service] Message sent. ID: %s', info.messageId);
    console.log("[Email Service] E-mail enviado com sucesso.");
    return info;
  } catch (error) {
    console.error('[Email Service] Error sending email:', error);
    console.error(`[Email Service] Falha ao enviar para ${options.email}. Motivo: ${error.message}`);
    throw error;
  }
};

module.exports = sendEmail;
