# Ranking farmy plemienia → BBCode na forum (skrypt quickbar, pl228.plemiona.pl)

**Data:** 2026-06-07
**Status:** zaimplementowane (`tw-farm-ranking.js`), przetestowane na żywo na `pl228`/`TRN`

## Wnioski z implementacji
- Filtr `&name=` zawsze działa: nieistniejący gracz → tabela obecna, **0 wierszy** (czysty „brak
  rekordu"); dopasowanie → 1 wiersz. Dzięki temu „brak rekordu" odróżnia się od throttlingu.
- Throttling przy wielu zapytaniach zwraca stronę **bez** `#in_a_day_ranking_table` (`no_table`).
  Pierwotne `concurrency=4` gubiło dane (fałszywe `0`, brak czołowego farmera). Rozwiązanie:
  **retry z backoffem** (`maxTries=4`) na `no_table`/HTTP/bot + łagodniejsze tempo
  (`concurrency=2`, `delayMs=250`). Po poprawce: 0 ostrzeżeń, komplet 50/50 farmiących TRN.
- `generate(tag)` zwraca `{ bbcode, warnings }`; nieudane wartości renderowane jako `?`.

## 1. Cel

**Jeden samodzielny plik JavaScript** (skrypt do paska skrótów / quickbar Plemion), na wzór
`FarmGodCopy.js`. Po kliknięciu przycisku w grze skrypt pyta o **skrót plemienia**, zbiera dane
o farmieniu jego członków i pokazuje gotowy **kod BBCode** (tabela na forum, owinięta w spoiler)
w okienku do skopiowania. Skrypt **nie publikuje** niczego sam i **nie wykonuje akcji w grze** —
tylko czyta dane i formatuje tekst.

Wzorzec wyniku (ręczny odpowiednik) ma kolumny: LP, Ranking, Gracz, Plemię, Wynik (zrabowane
surowce), Data. Dodajemy: **Splądrowane wioski** oraz **Punkty**.

## 2. Wejście

- Skrót plemienia podawany w **okienku** po uruchomieniu (pole tekstowe; podpowiadany ostatnio użyty
  tag z `localStorage`).
- Dopasowanie plemienia: **dokładny tag** (warianty typu `TRN-` nie są uwzględniane).
- Skrypt działa na origin, na którym jest uruchomiony (URL-e względne), więc jest przenośny między
  światami; rozwijany/testowany na `pl228`.

## 3. Źródła danych (wszystko ten sam origin → AJAX bez CORS)

| Dane | Źródło | Uwagi |
|---|---|---|
| Lista członków plemienia, **Punkty** | `/map/ally.txt` + `/map/player.txt` | publiczny eksport, działa też zalogowanym |
| **Zrabowane surowce** (Wynik) + globalny **Ranking** + **Data** | `/game.php?screen=ranking&mode=in_a_day&type=loot_res&name=<gracz>` | wymaga sesji (skrypt działa w zalogowanej grze) |
| **Splądrowane wioski** | `/game.php?screen=ranking&mode=in_a_day&type=loot_vil&name=<gracz>` | jw. |

### Format eksportu (potwierdzony)
- `player.txt`: `id,name,ally_id,villages,points,rank` — `name` URL-encoded. **`id` z eksportu NIE jest
  tym samym co `id` gracza w grze** → dane łączymy po **nazwie** (unikalnej w świecie).
- `ally.txt`: `id,name,tag,members,villages,points,all_points,rank` — `name`/`tag` URL-encoded.

### Struktura strony rankingu (potwierdzona)
- Tabela: `#in_a_day_ranking_table`. Nagłówki: `Ranking | Nazwa | Plemię | Wynik | Data`.
- Wiersz danych — komórki `td`:
  1. Ranking (globalna pozycja), np. `551`
  2. Nazwa: `<a href="...info_player&id=...">[img] Nazwa</a>` → `textContent.trim()`
  3. Plemię: `<a href="...info_ally&id=...">TAG</a>`
  4. Wynik: `84<span class="grey">.</span>978` → `innerText` `84.978` → usuń nie-cyfry → `84978`
  5. Data: tekst (`wczoraj` / `DD.MM.YYYY`)
- Filtr `&name=<gracz>` zawęża tabelę do wiersza(y) pasujących do nazwy. Wybieramy wiersz, którego
  nazwa gracza **dokładnie** równa się szukanej (ochrona przed dopasowaniem częściowym).

## 4. Środowisko uruchomieniowe i wdrożenie

- **Czysty JavaScript przeglądarkowy** wykorzystujący środowisko gry: `jQuery` (`$`) do AJAX/parsowania,
  globalny `Dialog` (okna gry) do UI, `UI.ErrorMessage`/`UI.SuccessMessage` do komunikatów.
- Skrypt jako **IIFE** (samowykonujący się), bez zależności zewnętrznych poza tym, co daje gra.
- **Wdrożenie (po stronie użytkownika):** plik hostowany pod publicznym URL (np. GitHub Pages, jak
  `FarmGodCopy.js`). Przycisk quickbara: `javascript:$.getScript('https://<host>/tw-farm-ranking.js');void(0);`.
- **Rozwój/testy (po mojej stronie):** wstrzykiwanie i uruchamianie skryptu w zalogowanej sesji przez
  `agent-browser` (eval / $.getScript z lokalnego serwera) — agent-browser **nie** jest częścią produktu.

## 5. Przepływ (w przeglądarce, po kliknięciu)

1. Pokaż okno wejścia → pobierz tag plemienia.
2. `GET /map/ally.txt` → zdekoduj tagi → znajdź `ally_id` dla **dokładnego** tagu (brak → komunikat).
3. `GET /map/player.txt` → wybierz członków z tym `ally_id` → `{name, points}`.
4. Dla każdego członka `GET ...type=loot_res&name=` → `{ranking, wynik, data}`.
   - Brak dokładnego wiersza = brak rekordu → **pomiń** (niefarmiących nie pokazujemy).
5. Dla pozostałych `GET ...type=loot_vil&name=` → `splądrowane wioski`.
6. Połącz po nazwie; posortuj malejąco wg **zrabowanych surowców**; nadaj `LP` 1..N.
7. Złóż BBCode i pokaż w oknie wyjścia z przyciskiem „Kopiuj".

## 6. UI

- **Okno wejścia:** `Dialog` z polem tekstowym (tag, prefill z `localStorage`) i przyciskiem „Generuj".
- **Postęp:** w trakcie zbiórki pokazywany licznik, np. „Pobieram 12/40 graczy…" (+ możliwość anulowania).
- **Okno wyjścia:** `Dialog` z `<textarea readonly>` zawierającym gotowy BBCode + przycisk
  **„Kopiuj do schowka"** (`navigator.clipboard.writeText`, fallback: zaznacz + `execCommand('copy')`).
  Tekst też logowany do konsoli jako zapas.

## 7. Format wyjścia (BBCode)

Kolumny: `LP | Ranking | Gracz | Plemię | Wynik | Splądrowane wioski | Punkty | Stosunek farma/pkt | Data`.

Kolumna **Stosunek farma/pkt** = `Wynik ÷ Punkty` (1 miejsce po przecinku, przecinek dziesiętny;
`—` gdy punkty = 0). Umieszczona po `Punkty`.

**Formatowanie liczb:** separator tysięcy = **kropka** (np. `646.447`, `12.345`) dla kolumn
`Ranking`, `Wynik`, `Splądrowane wioski`, `Punkty`. `LP` bez separatora. Wewnętrznie liczby całkowite
(parsowane przez usunięcie nie-cyfr), separator dodawany przy renderowaniu. Data jak w grze.

**Spoiler:** całość (nagłówek + tabela) owinięta w `[spoiler=<TAG>]…[/spoiler]`; tytuł = tag plemienia.

**Składnia tabeli (potwierdzona na działającym poście forum):**
- nagłówek: `[**] cela [||] cela … [/**]` — komórki przez `[||]`, wiersz **zamknięty** `[/**]`
  (bez `[/**]` parser wciąga wszystkie wiersze do ostatniej komórki — błąd renderowania).
- wiersze: `[*] cela [|] cela …` — komórki przez **pojedynczy** `[|]`, wiersz zaczyna `[*]`.
- linki: `[player]nick[/player]`, `[ally]TAG[/ally]`; LP i Wynik pogrubione `[b]…[/b]`.

```
[spoiler=TRN]
[b]Ranking farmy TRN — aktualny na dzień 07.06.2026[/b]
[table]
[**] LP [||] Ranking [||] Gracz [||] Plemię [||] Wynik [||] Splądrowane wioski [||] Punkty [||] Stosunek farma/pkt [||] Data [/**][*] [b]1[/b] [|] 1 [|] [player]TopornyPikinier[/player] [|] [ally]TRN[/ally] [|] [b]1.657.125[/b] [|] 14.911 [|] 40.707 [|] 40,7 [|] wczoraj[*] [b]2[/b] [|] 4 [|] [player]Bumbalabumba[/player] [|] [ally]TRN[/ally] [|] [b]1.419.440[/b] [|] 19.540 [|] 34.521 [|] 41,1 [|] wczoraj
[/table]
[/spoiler]
```

## 8. Tempo zapytań / bezpieczeństwo

- Liczba zapytań ≈ liczba farmiących członków × 2. Aby nie obciążać serwera i nie wywołać kontroli
  bota: **mała równoległość** (np. 3–5 jednoczesnych) + **drobne opóźnienia**; sekwencyjny postęp z UI.
- Wykrycie odpowiedzi „bot/captcha" lub braku `#in_a_day_ranking_table` → zatrzymanie z czytelnym
  komunikatem.
- Skrypt jest **read-only** (żadnych akcji w grze) — zgodne z duchem zasad dot. skryptów; mimo to
  warto trzymać łagodne tempo.

## 9. Sytuacje brzegowe

- Polskie znaki/spacje w nazwach → poprawny URL-encode w `&name=` i porównanie po zdekodowanej nazwie.
- Tag nieznaleziony / 0 członków → komunikat.
- Członek bez wiersza w `loot_res` → pominięty.
- Rozbieżność `id` eksport vs gra → nieistotna (łączymy po nazwie).
- Brak sesji / wylogowanie → komunikat z instrukcją.
- Anulowanie w trakcie → przerwanie i zamknięcie okna.

## 10. Świadomie poza zakresem (YAGNI)

- Automatyczne publikowanie/edycja postu na forum.
- Inne tryby (tygodniowy/miesięczny) i typy rankingu (kill_*, conquer).
- Warianty tagu (TRN-, akademie) i wiele plemion naraz.
- Hosting pliku (robi to użytkownik) i konfiguracja quickbara.
- Cache / historia / harmonogram.

## 11. Plik i testy

- Jeden plik: `tw-farm-ranking.js` (IIFE, komentarz-nagłówek z opisem i instrukcją quickbara).
- Stałe na górze: tryb (`in_a_day`), typy (`loot_res`/`loot_vil`), równoległość, opóźnienia.
- Test deweloperski: lokalny serwer HTTP serwujący plik → `agent-browser eval` w zalogowanej sesji
  ładuje go przez `$.getScript('http://localhost:PORT/tw-farm-ranking.js')`; weryfikacja wyniku na
  realnym plemieniu (np. `TRN`/`TRN-`) i porównanie z ręcznym zestawieniem.
