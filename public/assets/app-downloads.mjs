// Verified official listings. Never append customer data or invitation tokens.
export const APP_STORES=Object.freeze({
  apple:'https://apps.apple.com/de/app/eigenheimverwalter/id6449584443',
  android:'https://play.google.com/store/apps/details?id=com.semi.eigenheimverwalter',
});
const asset=name=>new URL(name,import.meta.url).href;
export function appDownloadPanel({openingPage=false}={}){
  return `<link rel="stylesheet" href="${asset('app-downloads.css')}"><section class="app-downloads" aria-label="eigenheimverwalter App herunterladen">
    <h2>Weiter zur eigenheimverwalter-App</h2>
    <p>Ihr Eigenheim immer dabei. Laden Sie die App für Ihr Smartphone herunter.</p>
    <div class="app-store-badges">
      <a href="${APP_STORES.apple}" rel="noreferrer noopener" referrerpolicy="no-referrer"><img src="${asset('store-badges/app-store-de.svg')}" alt="Laden im App Store" width="144" height="48"></a>
      <a href="${APP_STORES.android}" rel="noreferrer noopener" referrerpolicy="no-referrer"><img class="google-play-badge" src="${asset('store-badges/google-play-de.png')}" alt="Jetzt bei Google Play" width="186" height="72"></a>
    </div>
    ${openingPage?'<p class="muted">App schon installiert? Auf dem iPhone bietet das App-Banner in Safari „Öffnen“ an. Auf Android öffnen Sie die App über ihr Symbol oder über „Öffnen“ im Play Store.</p>':`<a class="app-open-help" href="${new URL('../app-download.html',import.meta.url).href}" rel="noreferrer" referrerpolicy="no-referrer">App bereits installiert?</a>`}
    <small>Apple und das Apple Logo sind Marken von Apple Inc. App Store ist eine Dienstleistungsmarke von Apple Inc. Google Play und das Google Play-Logo sind Marken von Google LLC.</small>
  </section>`;
}
