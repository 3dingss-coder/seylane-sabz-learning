export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  /** True when a real transport is configured (otherwise messages are only recorded/logged). */
  readonly enabled: boolean;
  send(msg: MailMessage): Promise<void>;
}

/** Records messages instead of sending (tests / local). */
export class RecordingMailer implements Mailer {
  readonly enabled = true;
  readonly sent: MailMessage[] = [];
  async send(msg: MailMessage) {
    this.sent.push(msg);
  }
}

/** No transport configured: email channel is skipped (in-app + push still work). */
export class DisabledMailer implements Mailer {
  readonly enabled = false;
  async send() {
    /* no-op */
  }
}
