# ShiftMaster — Live Zetten (Stap voor Stap)

## Wat je nodig hebt
- Een browser (Chrome)
- Een Google account
- Dat is alles. Geen Node.js nodig op je eigen PC.

---

## STAP 1: Firebase Project Aanmaken

1. Ga naar **https://console.firebase.google.com**
2. Klik op **"Add project"** (of "Project toevoegen")
3. Noem het project: `shiftmaster` (of wat je wil)
4. Google Analytics? → Maakt niet uit, mag uit
5. Klik **"Create project"** → Wacht → Klik **"Continue"**

## STAP 2: Firestore Database Aanzetten

1. In je Firebase project, klik links op **"Firestore Database"**
2. Klik **"Create database"**
3. Kies **"Start in test mode"** (we beveiligen later)
4. Kies locatie: **europe-west1** (België, dichtbij)
5. Klik **"Enable"**

## STAP 3: Firebase Config Ophalen

1. Klik links op het **tandwiel ⚙️** → **"Project settings"**
2. Scroll naar beneden naar **"Your apps"**
3. Klik op het **web-icoon** `</>`
4. App naam: `shiftmaster` → Klik **"Register app"**
5. Je ziet nu een blok code met `firebaseConfig`. **Kopieer deze waardes.**
   Het ziet er zo uit:
   ```
   apiKey: "AIzaSy...",
   authDomain: "shiftmaster-xxxxx.firebaseapp.com",
   projectId: "shiftmaster-xxxxx",
   storageBucket: "shiftmaster-xxxxx.appspot.com",
   messagingSenderId: "123456789",
   appId: "1:123456789:web:abc123"
   ```

## STAP 4: GitHub Repository Maken

1. Ga naar **https://github.com/new**
2. Repository name: `shiftmaster`
3. Private of Public → jouw keuze
4. Klik **"Create repository"**
5. **Upload ALLE bestanden** uit het project:
   - Klik **"uploading an existing file"**
   - Sleep alle bestanden en mappen uit de gedownloade zip erin
   - Klik **"Commit changes"**

## STAP 5: Firebase Config Invullen

1. Op GitHub, ga naar het bestand `src/firebase.js`
2. Klik op het **potloodje** ✏️ (Edit)
3. Vervang de `"VULT-HIER-IN"` waardes met jouw echte Firebase config
4. Klik **"Commit changes"**

5. Doe hetzelfde voor `.firebaserc`:
   - Vervang `VULT-HIER-JE-PROJECT-ID-IN` met je Firebase project ID
   (bijv. `shiftmaster-xxxxx`)

## STAP 6: Deployen via Vercel (makkelijkste optie)

1. Ga naar **https://vercel.com**
2. Klik **"Sign Up"** → Log in met je **GitHub account**
3. Klik **"Add New Project"**
4. Kies je `shiftmaster` repository
5. Framework Preset: **Vite** (wordt automatisch gedetecteerd)
6. Klik **"Deploy"**
7. Wacht 1-2 minuten...
8. 🎉 **Je krijgt een live URL!** (bijv. `shiftmaster-xxx.vercel.app`)

### Custom domein (optioneel)
- In Vercel → Settings → Domains
- Voeg je eigen domein toe als je dat hebt

---

## ALTERNATIEF: Deployen via Firebase Hosting

Als je liever Firebase Hosting gebruikt (zoals bij Digital Sommelier):

1. Ga naar **https://console.firebase.google.com** → jouw project
2. Klik links op **Hosting** → **"Get started"**
3. Je hebt Firebase CLI nodig. Geen Node.js op je PC?
   Gebruik **https://stackblitz.com** of **GitHub Codespaces**:
   - Open je repo op GitHub
   - Druk op `.` (punt) → opent een online editor
   - Open de Terminal (Ctrl+`)
   - Typ:
     ```
     npm install
     npm run build
     npx firebase-tools deploy --only hosting
     ```
   - Login met je Google account wanneer gevraagd

---

## Logins na Deploy

Bij de eerste keer laden maakt de app automatisch het Test Hotel aan:

| Rol | Login | Wachtwoord |
|-----|-------|------------|
| **Admin** | admin@shiftmaster.com | admin123 |
| **Hotel Manager** (Test) | sarah@test.com | manager1 |
| **Dept Manager** (Test) | jan@test.com | manager1 |
| **Staff** (Test) | staff | staff123 |

---

## Updates Deployen

### Via Vercel:
Gewoon pushen naar GitHub → Vercel bouwt automatisch opnieuw.
Database blijft staan in Firebase!

### Via Firebase:
```
npm run build
npx firebase-tools deploy --only hosting
```

---

## Problemen?

- **Witte pagina na deploy?** → Check browser console (F12) voor fouten
- **Login werkt niet?** → Firestore database moet "test mode" aan staan
- **Data kwijt na update?** → Kan niet! Data zit in Firebase, niet in de code
