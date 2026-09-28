import type { Mailer, MailMessage } from './types';

/**
 * SMTP transport (spec §26: email only for the manager digest). Any free SMTP works
 * (e.g. a Gmail app password or a free-tier provider): SMTP_URL=smtps://user:pass@host:465
 */
export class SmtpMailer implements Mailer {
  readonly enabled = true;
  private transport: Promise<import('nodemailer').Transporter>;
  constructor(
    url: string,
    private from: string,
  ) {
    this.transport = import('nodemailer').then((m) => m.createTransport(url));
  }
  async send(msg: MailMessage) {
    await (await this.transport).sendMail({ from: this.from, ...msg });
  }
}
