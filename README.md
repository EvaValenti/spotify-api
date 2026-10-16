# Spotify API - TP API Spotify

Ce dépôt contient une API liée à Spotify.

## Langages
- TypeScript (64.9%)
- CSS (30.4%)
- HTML (4.7%)

---

## Prérequis
- Node.js (>= 16 recommandé) et npm ou yarn
- Git
- Un compte Spotify Developer (https://developer.spotify.com)
- Postman (https://www.postman.com)

## Installation depuis GitHub
1. Clonez le dépôt :

```bash
git clone https://github.com/EvaValenti/spotify-api.git
```

2. Placez-vous dans le dossier du projet :

```bash
cd spotify-api
```

---

## Installation et configuration depuis le terminal
1. Installez les dépendances :

```bash
# avec npm
npm install

# ou avec yarn
yarn install
```

2. Créez un fichier `.env` à la racine du projet (ne le commitez pas) et ajoutez les variables d'environnement nécessaires. Exemple :

```env
PORT=3000
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/callback
JWT_SECRET=un_secret_pour_le_jwt
NODE_ENV=development
```

3. Démarrer le serveur en mode développement (vérifiez les scripts dans `package.json`) :

```bash
# si le projet utilise un watcher (nodemon, ts-node-dev...)
npm run dev

# ou pour builder puis lancer
npm run build
npm start
```

Si un front-end est inclus et doit être compilé séparément, consultez le dossier `client`/`frontend` ou `package.json` pour les scripts correspondants (ex: `cd client && npm install && npm run build`).

---

## Récupérer les identifiants depuis Spotify
1. Ouvrez le tableau de bord Spotify Developer : https://developer.spotify.com/dashboard/
2. Connectez-vous avec votre compte Spotify.
3. Cliquez sur "Create an App" (Créer une application).
4. Donnez un nom et une description à l'application.
5. Dans les paramètres de l'application, ajoutez une Redirect URI (ex. `http://localhost:3000/callback`) et enregistrez.
6. Récupérez le "Client ID" et le "Client Secret" fournis par Spotify et copiez-les dans votre fichier `.env` (`SPOTIFY_CLIENT_ID` et `SPOTIFY_CLIENT_SECRET`).

Remarque de sécurité : gardez le Client Secret privé et ne le commitez jamais dans le dépôt.

---

## Installer et configurer Postman
1. Téléchargez et installez Postman : https://www.postman.com/downloads/
2. Créez un compte ou connectez-vous.
3. Créez un nouvel environnement (Environment) appelé `Local` ou `Dev` et ajoutez les variables utiles :
   - base_url : `http://localhost:3000` (ou le port configuré)
   - jwt : laissez vide pour l'instant
   - spotify_client_id : votre client id
   - spotify_client_secret : votre client secret
   - jwt_secret : la valeur de JWT_SECRET de votre `.env` (pour génération locale si nécessaire)

4. Importez ou créez une collection pour vos endpoints. Exemple de requête de test :
   - Méthode : GET
   - URL : `{{base_url}}/api/health` (ou l'endpoint réel de votre API)
   - Envoyez la requête et vérifiez la réponse.

---

## Obtenir un token OAuth Spotify (flow recommandé)
La plupart des appels à l'API Spotify nécessitent un token OAuth fourni par Spotify (Client Credentials ou Authorization Code).

1. Client Credentials (server-to-server, sans accès aux données utilisateur) :
   - Requête POST vers `https://accounts.spotify.com/api/token`
   - Header : `Authorization: Basic <base64(client_id:client_secret)>`
   - Body (x-www-form-urlencoded) : `grant_type=client_credentials`
   - La réponse contiendra `access_token` que vous utiliserez comme Bearer token pour appeler l'API Spotify.

2. Authorization Code (pour accéder à des données utilisateur) :
   - Redirigez l'utilisateur vers l'URL d'autorisation Spotify avec votre `client_id` et la `redirect_uri` enregistrée.
   - Après consentement, Spotify redirige vers votre `redirect_uri` avec un `code` que vous échangez contre un token via POST vers `/api/token`.

Référez-vous à la documentation officielle : https://developer.spotify.com/documentation/general/guides/authorization/

---

## Créer un JWT dans Postman
Plusieurs méthodes sont possibles selon que votre API fournit un endpoint d'authentification.

Méthode A — Via l'endpoint d'authentification de l'API
1. Si votre API expose un endpoint `POST /api/auth/login` ou `POST /api/auth/token` :
   - Méthode : POST
   - URL : `{{base_url}}/api/auth/login`
   - Body (JSON) :
     {
       "username": "votre_utilisateur",
       "password": "votre_mot_de_passe"
     }
   - La réponse devrait contenir le JWT. Copiez-le dans la variable d'environnement `jwt`.
   - Dans les requêtes suivantes, onglet Authorization -> Bearer Token -> `{{jwt}}`.

Méthode B — Générer un JWT manuellement via jwt.io
1. Allez sur https://jwt.io/, entrez le header et le payload souhaités.
2. Signez le token avec la clé `JWT_SECRET` définie dans votre `.env`.
3. Copiez le token et collez-le dans la variable `jwt` de Postman.

Méthode C — Générer automatiquement un JWT dans Postman (Pre-request Script)
1. Dans une requête Postman, onglet "Pre-request Script", collez le script suivant (exemple simple en utilisant CryptoJS fourni par Postman) :

```javascript
// Génération d'un JWT simple dans Postman (HS256)
function base64url(source) {
  // Encode en base64
  var encodedSource = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(source));
  // Remove padding and make URL-safe
  encodedSource = encodedSource.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return encodedSource;
}

var header = { alg: 'HS256', typ: 'JWT' };
var payload = {
  sub: pm.environment.get('test_user') || 'test-user',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 60 * 60 // 1 heure
};

var encodedHeader = base64url(JSON.stringify(header));
var encodedPayload = base64url(JSON.stringify(payload));
var tokenUnsigned = encodedHeader + '.' + encodedPayload;
var secret = pm.environment.get('jwt_secret') || pm.environment.get('JWT_SECRET');
var signature = CryptoJS.HmacSHA256(tokenUnsigned, secret);
var signatureBase64 = CryptoJS.enc.Base64.stringify(signature);
var encodedSignature = signatureBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
var jwt = tokenUnsigned + '.' + encodedSignature;

pm.environment.set('jwt', jwt);
console.log('JWT généré et stocké dans la variable d\'environnement `jwt`');
```

2. Exécutez la requête; le script générera un JWT et le stockera dans la variable d'environnement `jwt`.
3. Utilisez `Authorization: Bearer {{jwt}}` pour vos requêtes.

---

## Accéder et utiliser le projet depuis un navigateur
1. Assurez-vous que le serveur tourne :

```bash
npm run dev
# ou
npm start
```

2. Ouvrez votre navigateur et allez à :

```
http://localhost:3000
```

(adaptez le port si nécessaire)

3. Pour appeler des endpoints REST (GET), vous pouvez entrer l'URL directement dans le navigateur, par exemple `http://localhost:3000/api/some-endpoint`.
4. Pour tester des endpoints protégés, utilisez Postman pour ajouter l'en-tête `Authorization: Bearer <token>` ou configurez votre front-end pour envoyer le JWT dans les headers.
5. Si le projet contient un front-end servi par le back-end, la page d'accueil devrait être accessible à la racine (`/`) une fois le serveur démarré.

---

## Sécurité et bonnes pratiques
- Ne commitez jamais vos secrets (SPOTIFY_CLIENT_SECRET, JWT_SECRET) dans le dépôt.
- Pour le déploiement, utilisez des variables d'environnement sécurisées (Heroku, Vercel, Docker secrets, etc.).
- Limitez la durée de vie des tokens et implémentez un mécanisme de rafraîchissement si nécessaire.

---

## Aide supplémentaire
Si vous le souhaitez, je peux :
- Générer une collection Postman exportable (fichier JSON) avec des requêtes préconfigurées si vous me fournissez les endpoints exacts.
- Vérifier `package.json` pour adapter les instructions de démarrage au projet réel.
- Ajouter des exemples concrets d'usage pour des endpoints spécifiques.

