# FutureMe — Baza de cunoștințe despre psihologie

Pune aici materialele aprobate de administrator pe care AI-ul le poate folosi pentru răspunsuri:

- psihologie generală și dezvoltare personală;
- orientare vocațională și luarea deciziilor;
- interese, valori și puncte forte;
- explicații despre metodologia și modulele FutureMe;
- întrebări frecvente și principii de comunicare cu utilizatorii.

Nu pune aici parole, chei API, date personale ale clienților sau conversații private. Pentru materiale noi, preferă fișiere `.md` sau `.txt` și adaugă sursa în document.

## Indexare

După ce adaugi fișierele, pornește serverul și încarcă-le folosind:

```bash
curl -X POST http://127.0.0.1:3000/admin/documents \
  -H "x-admin-key: $ADMIN_API_KEY" \
  -F "files=@knowledge/psychology/nume-document.md"
```

Mai multe fișiere pot fi trimise în aceeași comandă. Un fișier identic nu va fi indexat din nou.
