# Ranking farmy plemienia → BBCode (Plemiona / Tribal Wars)

Skrypt do **paska skrótów (quickbar)** świata Plemion. Po kliknięciu pyta o **tag plemienia**,
pobiera dzienny **ranking farmy** jego członków (zrabowane surowce + splądrowane wioski) oraz
**punkty** z publicznego eksportu, i generuje gotowy **kod BBCode** (tabela owinięta w spoiler)
do wklejenia na forum.

Plik: [`tw-farm-ranking.js`](tw-farm-ranking.js)

## Co generuje

```
[spoiler=TRN]
[b]Ranking farmy TRN — aktualny na dzien 07.06.2026[/b]
[table]
[**] LP [||] Ranking [||] Gracz [||] Plemie [||] Wynik [||] Spladrowane wioski [||] Punkty [||] Stosunek farma/pkt [||] Data [/**][*] [b]1[/b] [|] 1 [|] [player]TopornyPikinier[/player] [|] [ally]TRN[/ally] [|] [b]1.657.125[/b] [|] 14.911 [|] 40.707 [|] 40,7 [|] wczoraj[*] ...
[/table]
[/spoiler]
```

> **Składnia tabeli forum Plemion** (istotne): nagłówek to `[**] … [||] … [/**]` — **musi być
> zamknięty `[/**]`** (bez tego wiersze wpadają do ostatniej komórki). Wiersze danych: `[*] … [|] … `
> (komórki przez **pojedynczy** `[|]`). Linki: `[player]nick[/player]`, `[ally]TAG[/ally]`.

- Kolumny: `LP | Ranking (globalna pozycja) | Gracz | Plemię | Wynik (zrabowane surowce) |
  Splądrowane wioski | Punkty | Stosunek farma/pkt | Data`.
- „Stosunek farma/pkt" = zrabowane surowce ÷ punkty (1 miejsce po przecinku; `—` gdy brak punktów).
- Sortowanie malejąco wg **zrabowanych surowców** (domyślnie) **lub wg „stosunek farma/pkt"** —
  do wyboru w okienku; separator tysięcy = kropka.
- Uwzględnia tylko członków o **dokładnym tagu**; niefarmiących (brak rekordu) pomija.

## Wdrożenie

Repo: <https://github.com/mrgretwon/tribal_scripts>

1. **Hosting pliku.** Quickbar ładuje skrypt przez `$.getScript`, a przeglądarka wykona go tylko,
   gdy serwer poda poprawny typ `application/javascript`. Dlatego:
   - **GitHub Pages — zalecane** (włączone w *Settings → Pages*, źródło: gałąź `main`, `/root`):
     `https://mrgretwon.github.io/tribal_scripts/tw-farm-ranking.js`
     Przy każdym `push` przebudowuje się automatycznie; cache CDN tylko ~10 min.
   - **jsDelivr — zapas** (CDN ciągnący z repo):
     `https://cdn.jsdelivr.net/gh/mrgretwon/tribal_scripts@main/tw-farm-ranking.js`
     Cache `@main` do ~12 h — po zmianie wyczyść: `https://purge.jsdelivr.net/gh/mrgretwon/tribal_scripts@main/tw-farm-ranking.js`.
   - **NIE** używaj `raw.githubusercontent.com` — wysyła `nosniff`/`text/plain`, więc skrypt się nie wykona.
2. **Dodaj przycisk do paska skrótów** (*Ustawienia → Pasek skrótów*,
   `game.php?screen=settings&mode=quickbar_edit`) z adresem:
   ```
   javascript:$.getScript('https://mrgretwon.github.io/tribal_scripts/tw-farm-ranking.js');void(0);
   ```
   Nazwij go np. „Ranking farmy".
3. Gotowe — kliknięcie przycisku otwiera okienko skryptu.

> Oba hostingi serwują `application/javascript` i przechodzą CSP świata `pl228`
> (zweryfikowane na żywo przez `$.getScript`).

## Użycie

1. Kliknij przycisk w pasku skrótów (będąc zalogowanym w dowolnym ekranie gry).
2. Wpisz tag plemienia (ostatni jest zapamiętywany), wybierz **sortowanie** (Zrabowane surowce /
   Stosunek farma/pkt — też zapamiętywane) i kliknij **Generuj**.
3. Poczekaj — pasek postępu pokazuje zbieranie danych (dwie fazy: surowce, wioski).
4. W oknie wyniku kliknij **Kopiuj do schowka** i wklej na forum.

## Konfiguracja

Stałe na górze pliku (`CFG`):

| Pole | Domyślnie | Znaczenie |
|---|---|---|
| `mode` | `in_a_day` | tryb rankingu („Dzienne") |
| `typeRes` | `loot_res` | zrabowane surowce |
| `typeVil` | `loot_vil` | splądrowane wioski |
| `concurrency` | `2` | liczba równoległych zapytań (łagodnie dla serwera) |
| `delayMs` | `250` | odstęp między zapytaniami w wątku |
| `maxTries` | `4` | próby pobrania jednego wiersza (retry/backoff) |

## Uwagi

- **Read-only.** Skrypt czyta tylko publiczny eksport (`/map/*.txt`) i strony rankingu; **nie
  wykonuje żadnych akcji w grze**. Mimo to działa łagodnym tempem (mała równoległość + retry),
  aby nie obciążać serwera ani nie wywołać kontroli bota.
- **Przenośność.** Używa adresów względnych i `game_data`, więc działa na dowolnym świecie, na
  którym jest uruchomiony (rozwijany i testowany na `pl228`).
- **Łączenie danych po nazwie gracza** (id w eksporcie różni się od id w grze).
- Wartość, której nie udało się pobrać mimo prób, jest oznaczana `?` (zamiast mylącego `0`),
  a okno wyniku informuje o liczbie takich braków.
- Pamiętaj o zasadach gry dotyczących skryptów; użycie na własną odpowiedzialność.

## Projekt / specyfikacja

[`docs/superpowers/specs/2026-06-07-tw-farm-ranking-design.md`](docs/superpowers/specs/2026-06-07-tw-farm-ranking-design.md)
