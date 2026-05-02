/**
 * Transactional email via Resend.
 * Each helper sends a single message and returns the Resend message id.
 */

import { Resend } from 'resend';

import { debugEmail, logError } from './debug';
import { env } from './env';

const RESEND_API_KEY = env.RESEND_API_KEY;
const EMAIL_FROM = env.EMAIL_FROM;
const APP_NAME = env.NEXT_PUBLIC_APP_NAME;
const APP_URL = env.NEXT_PUBLIC_APP_URL;

let cachedClient: Resend | null = null;
function client(): Resend {
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured — emails are disabled.');
  }
  if (!cachedClient) cachedClient = new Resend(RESEND_API_KEY);
  return cachedClient;
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  idempotencyKey: string,
): Promise<{ messageId: string }> {
  const result = await client().emails.send(
    {
      from: `${APP_NAME} <${EMAIL_FROM}>`,
      to,
      subject,
      html,
    },
    { idempotencyKey },
  );

  if (result.error) {
    throw new Error(`Resend error: ${result.error.message ?? JSON.stringify(result.error)}`);
  }

  return { messageId: result.data?.id ?? '' };
}

export async function sendVerificationEmail(email: string, token: string, name: string) {
  try {
    const verificationUrl = `${APP_URL}/auth/verify-email?token=${token}`;

    debugEmail('Sending verification email', { to: email, name });

    const result = await sendEmail(
      email,
      'Verify your email address',
      `
        <h1>Welcome to ${APP_NAME}!</h1>
        <p>Hi ${name},</p>
        <p>Please verify your email address by clicking the link below:</p>
        <a href="${verificationUrl}">${verificationUrl}</a>
        <p>This link will expire in 24 hours.</p>
      `,
      `verify-${token}`,
    );

    debugEmail('Verification email sent', { messageId: result.messageId, to: email });
    return result;
  } catch (error) {
    logError(error, 'sendVerificationEmail');
    throw error;
  }
}

export async function sendPasswordResetEmail(email: string, token: string, name: string) {
  try {
    const resetUrl = `${APP_URL}/auth/reset-password?token=${token}`;

    debugEmail('Sending password reset email', { to: email, name });

    const result = await sendEmail(
      email,
      'Reset your password',
      `
        <h1>Password Reset Request</h1>
        <p>Hi ${name},</p>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
      `reset-${token}`,
    );

    debugEmail('Password reset email sent', { messageId: result.messageId, to: email });
    return result;
  } catch (error) {
    logError(error, 'sendPasswordResetEmail');
    throw error;
  }
}

export async function sendInvitationEmail(
  email: string,
  token: string,
  organizationName: string,
  inviterName: string,
) {
  try {
    const invitationUrl = `${APP_URL}/accept-invite?token=${token}`;

    debugEmail('Sending invitation email', { to: email, organizationName, inviterName });

    const result = await sendEmail(
      email,
      `You've been invited to join ${organizationName}`,
      `
        <h1>You've been invited to join ${organizationName}!</h1>
        <p>Hi there,</p>
        <p><strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> on ${APP_NAME}.</p>
        <p>Click the button below to accept the invitation:</p>
        <a href="${invitationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #A528FF; color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: bold; font-family: monospace;">Accept Invitation</a>
        <p>Or copy and paste this link into your browser:</p>
        <p><a href="${invitationUrl}">${invitationUrl}</a></p>
        <p><strong>This invitation will expire in 7 days.</strong></p>
        <p>If you don't have an account yet, you'll be able to create one when you accept the invitation.</p>
      `,
      `invite-${token}`,
    );

    debugEmail('Invitation email sent', { messageId: result.messageId, to: email });
    return result;
  } catch (error) {
    logError(error, 'sendInvitationEmail');
    throw error;
  }
}

export async function sendOwnershipTransferEmail(
  email: string,
  organizationName: string,
  newOwnerName: string,
  previousOwnerName: string,
) {
  try {
    debugEmail('Sending ownership transfer email', { to: email, organizationName });

    const result = await sendEmail(
      email,
      `You're now the owner of ${organizationName}`,
      `
        <h1>You're now the owner of ${organizationName}</h1>
        <p>Hi ${newOwnerName},</p>
        <p><strong>${previousOwnerName}</strong> has transferred ownership of <strong>${organizationName}</strong> to you.</p>
        <p>As the new owner, you now have full control of the organization.</p>
        <a href="${APP_URL}" style="display: inline-block; padding: 12px 24px; background-color: #A528FF; color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: bold; font-family: monospace;">Go to Dashboard</a>
      `,
      `transfer-${organizationName}-${newOwnerName}-${Date.now()}`,
    );

    debugEmail('Ownership transfer email sent', { messageId: result.messageId, to: email });
    return result;
  } catch (error) {
    logError(error, 'sendOwnershipTransferEmail');
    throw error;
  }
}

export async function send2FACodeEmail(email: string, code: string, name: string) {
  try {
    debugEmail('Sending 2FA code email', { to: email, name });

    const result = await sendEmail(
      email,
      `Your login verification code — ${code}`,
      `
        <h1>Your Login Verification Code</h1>
        <p>Hi ${name},</p>
        <p>Use the verification code below to complete your login:</p>
        <div style="background-color: #FFFFFF; border: 2px solid #A528FF; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
          <h2 style="margin: 0; font-size: 32px; letter-spacing: 8px; color: #A528FF; font-family: monospace;">${code}</h2>
        </div>
        <p><strong>This code will expire in 10 minutes.</strong></p>
        <p>If you didn't request this code, please ignore this email.</p>
      `,
      `2fa-${email}-${code}`,
    );

    debugEmail('2FA code email sent', { messageId: result.messageId, to: email });
    return result;
  } catch (error) {
    logError(error, 'send2FACodeEmail');
    throw error;
  }
}
