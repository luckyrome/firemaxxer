import nodemailer from 'nodemailer';
import { config } from '../config/env';

const transport = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  auth: {
    user: config.SMTP_USER,
    pass: config.SMTP_PASS,
  },
});

export async function sendVerificationEmail(to: string, code: string, accountId: string): Promise<void> {
  const deepLink = `${config.FRONTEND_ORIGIN}/#verify?accountId=${accountId}&code=${code}`;
  await transport.sendMail({
    from: config.FROM_EMAIL,
    to,
    subject: 'Your Firemaxxer verification code',
    text: `Your verification code is: ${code}\n\nOr click this link to verify automatically:\n${deepLink}\n\nIt expires in 3 hours. Do not share it with anyone.`,
    html: `<p>Your Firemaxxer verification code is:</p>
           <h2 style="letter-spacing:0.2em">${code}</h2>
           <p>Or <a href="${deepLink}">click here to verify automatically</a>.</p>
           <p>It expires in 3 hours. Do not share it with anyone.</p>`,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await transport.sendMail({
    from: config.FROM_EMAIL,
    to,
    subject: 'Reset your Firemaxxer password',
    text: `Click this link to reset your password:\n\n${resetUrl}\n\nThe link expires in 1 hour.`,
    html: `<p>Click the link below to reset your Firemaxxer password:</p>
           <p><a href="${resetUrl}">${resetUrl}</a></p>
           <p>The link expires in 1 hour. If you did not request a reset, you can ignore this email.</p>`,
  });
}
