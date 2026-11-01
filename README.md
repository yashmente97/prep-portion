# Prep & Portion

Meal prep, portioning, food diary and weekly shopping list for two people.
Installable web app (PWA) hosted on GitHub Pages, data synced with Firebase.

## Install
- **iPhone:** open the site in Safari → Share → *Add to Home Screen*.
- **Mac:** open the site in Safari → *File → Add to Dock*.

Updates install themselves: every push to `main` is live within a minute, and the app reloads to the new version the next time it is opened.

## Files
| File | What it is |
|---|---|
| `index.html`, `style.css`, `app.js` | the app |
| `db.js`, `firebase-config.js` | sign-in and sync (Firebase) |
| `library.json` | shared ingredients, recipes and breakfasts. Bump `VERSION` in `tools/build_library.py`, rebuild, and installed apps merge the changes. Items edited in the app are never overwritten. |
| `sw.js`, `manifest.webmanifest`, `icons/` | offline use and home-screen install |
| `firestore.rules` | template for the database rules (fill in the two allowed emails in the Firebase console) |

## Release
```
python3 tools/release.py   # stamps a new version so installed apps update
git commit -am "…" && git push
```
