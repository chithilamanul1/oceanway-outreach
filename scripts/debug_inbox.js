import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

async function check() {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'imap.hostinger.com',
    port: parseInt(process.env.IMAP_PORT || '993', 10),
    secure: true,
    auth: {
      user: process.env.IMAP_USER || process.env.SMTP_USER,
      pass: process.env.IMAP_PASS || process.env.SMTP_PASS,
    },
    logger: false,
    tls: { rejectUnauthorized: false }
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    const status = await client.status('INBOX', { messages: true, recent: true });
    console.log('Total messages in INBOX:', status.messages);
    
    const total = status.messages;
    const startSeq = Math.max(1, total - 7);
    const range = `${startSeq}:*`;
    
    for await (const msg of client.fetch(range, { envelope: true, source: true })) {
      const parsed = await simpleParser(msg.source);
      console.log('==================================================');
      console.log('From:', parsed.from?.text);
      console.log('Subject:', parsed.subject);
      console.log('Date:', parsed.date);
      console.log('Snippet:', (parsed.text || '').substring(0, 700));
    }
  } finally {
    lock.release();
    await client.logout();
  }
}
check().catch(console.error);
