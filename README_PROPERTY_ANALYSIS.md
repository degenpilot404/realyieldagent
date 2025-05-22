# Property Link Analysis Feature

## Goal
Enable **John**, the Dubai real-estate advisor, to analyse an individual Property Finder advert that a user pastes in chat and return a concise, data-driven assessment.

## How it works
1. **User posts a Property Finder URL**  
   Example: `https://www.propertyfinder.ae/en/plp/rent/villa-for-rent-dubai-arabian-ranches-2-samara-14304293.html`

2. The new `ANALYSE_PROPERTY_LINK` action detects the URL, calls the n8n webhook
   `POST  https://realyield.app.n8n.cloud/webhook/propertyfinder` with JSON body `{ "link": "<url>" }`.

3. n8n returns a normalised JSON object:
```json
{
  "title": "Community Expert | Great Location | Vacant Soon",
  "price": 360000,
  "bedrooms": "5",
  "bathrooms": "6",
  "size": 3970,
  "furnishing": "NO",
  "location": "Samara, Arabian Ranches 2, Dubai",
  "link": "https://…",
  "image": "https://…jpg",
  "amenities": ["Maids Room", "Shared Pool", …]
}
```

4. John builds an analysis:
   * **For rentals** → rent/ft², cheque terms (if available), running cost tips, lifestyle fit.
   * **For purchases** (future) → price/ft², gross & net yield estimate (using rental_yields.csv), service-charge note, transaction cost overview.

5. John replies with a single formatted message containing:
   * A headline (e.g. *5-bed villa in Arabian Ranches 2 – AED 360 k/y*)
   * Bullet summary of key facts
   * Calculations (e.g. *AED 90 per ft²*)
   * Pros / Cons list
   * Next-step suggestion (viewing, compare, etc.)

## Files touched
* `src/plugin.ts` – new helper `fetchPropertyDetails`, new `ANALYSE_PROPERTY_LINK` action.
* `README_PROPERTY_ANALYSIS.md` – this document.

## Future Enhancements
* Support other portals.
* Cache analysed links to save API calls.
* Enrich purchase analysis with finance calculator. 