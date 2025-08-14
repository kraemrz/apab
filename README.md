# Steg 1: Öppna Terminalen (Kommandotolken)

    Klicka på Start-menyn.

    Skriv in cmd och tryck på Enter.

    Ett svart fönster (terminalen) kommer att öppnas.

# Steg 2: Starta appen med ett enda kommando

    Kopiera hela raden nedan.

    Högerklicka i det svarta fönstret, välj "Klistra in" och tryck Enter.
    code Bash        
      docker run -p 5000:5000 --name min-apab-container kraemr/apab-app

      

# Vad händer nu?

    Docker kommer att se att du inte har avbilden ditt-användarnamn/apab-app lokalt.

    Den kommer automatiskt att ladda ner den från Docker Hub.

    När den är nedladdad kommer den att starta containern.

Appen är nu igång!

# Steg 3: Öppna appen i din webbläsare

    Öppna din vanliga webbläsare (Chrome, Edge, etc.).

    Skriv in följande adress i adressfältet och tryck Enter:
    
      http://localhost:5000