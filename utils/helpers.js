// Pakistan-first: "0329 9432955", "+92 329 9432955", "3299432955" all become "923299432955".
const normalizePhone = (raw = '') => {
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '92' + d.slice(1);
  else if (d.length === 10) d = '92' + d;
  return d;
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The shade a shopper picked is only a note for the packer (no price effect), so just trim it.
const cleanShade = (s) => (s?.name
  ? { name: String(s.name).slice(0, 50), code: String(s.code || '').slice(0, 20) }
  : undefined);

module.exports = { normalizePhone, escapeRegex, cleanShade };
