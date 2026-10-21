const crypto = require('crypto');

// Alphabet sans caractères ambigus (pas de 0/O, 1/I/L...) pour un code lu à
// voix haute ou recopié à la main sans erreur.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode(length) {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

// Code de session à 6 caractères (32^6 ≈ 1 milliard de combinaisons),
// tiré aléatoirement (CSPRNG) donc non énumérable séquentiellement.
function generateSessionCode(existsFn, length = 6, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    const code = randomCode(length);
    if (!existsFn(code)) return code;
  }
  throw new Error('Impossible de générer un code de session unique');
}

// Jeton d'équipe : long et aléatoire, sert d'identifiant secret pour
// authentifier les requêtes de l'app joueur sans compte utilisateur.
function generateTeamToken() {
  return crypto.randomBytes(24).toString('hex');
}

module.exports = { generateSessionCode, generateTeamToken, randomCode };
