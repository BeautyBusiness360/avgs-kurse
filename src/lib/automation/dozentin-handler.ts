import { sendEmail } from '../email/resend';
import { onboardingTemplate } from '../email/templates';
import { log } from '../logging/logger';

export async function handleNewDozentin(dozentin: {
  id: string; first_name: string; last_name: string; email?: string; slug?: string;
}) {
  if (!dozentin.email) {
    await log('onboarding', 'warning',
      `Keine E-Mail für ${dozentin.slug ?? dozentin.id}`, { id: dozentin.id });
    return;
  }

  const { subject, html } = onboardingTemplate(dozentin);
  const sent = await sendEmail(dozentin.email, subject, html);
  await log('onboarding', sent ? 'success' : 'error',
    `Onboarding → ${dozentin.first_name} ${dozentin.last_name}`);
}
