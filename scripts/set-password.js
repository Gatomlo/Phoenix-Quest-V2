const auth = require('../src/auth');

const password = process.argv[2];
if (!password || password.length < 6) {
  console.error('Usage : npm run set-password -- <mot_de_passe> (6 caractères minimum)');
  process.exit(1);
}

auth.setPassword(password);
console.log('Mot de passe admin mis à jour.');
