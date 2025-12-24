const crypto = require('crypto');

const PASSWORD_VIEW_SECRET = process.env.PASSWORD_VIEW_SECRET || process.env.JWT_SECRET;

function getPasswordViewKey() {
  if (!PASSWORD_VIEW_SECRET) return null;
  return crypto.createHash('sha256').update(String(PASSWORD_VIEW_SECRET)).digest();
}

function encryptPassword(plainText) {
  const key = getPasswordViewKey();
  if (!key || !plainText) return null;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptPassword(payload) {
  const key = getPasswordViewKey();
  if (!key || !payload) return null;

  const parts = String(payload).split('.');
  if (parts.length !== 3) return null;

  try {
    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    return null;
  }
}

module.exports = {
  encryptPassword,
  decryptPassword
};
