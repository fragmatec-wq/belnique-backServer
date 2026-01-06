const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  const host = process.env.SMTP_HOST || undefined;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const service = process.env.SMTP_SERVICE || undefined;
  const secure = process.env.SMTP_SECURE === 'true' || (port === 465);
  const user = process.env.SMTP_EMAIL;
  const pass = process.env.SMTP_PASSWORD;

  if (!user || !pass) {
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

  await transporter.verify();
  const info = await transporter.sendMail(message);

  console.log('Message sent: %s', info.messageId);
};

module.exports = sendEmail;
