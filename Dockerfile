# Steg 1: Använd en officiell, lättvikts-Python-runtime som basavbild
FROM python:3.11-slim

# Steg 2: Sätt arbetskatalogen inuti containern
WORKDIR /app

# Steg 3: Kopiera filen med beroenden och installera dem
# Detta steg cachas och körs bara om requirements.txt ändras
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Steg 4: Kopiera resten av applikationskoden till arbetskatalogen
# Detta inkluderar app.py, database.py, static/, templates/, etc.
COPY . .

# Steg 5: Exponera porten som Flask-appen körs på (standard är 5000)
EXPOSE 5000

# Steg 6: Definiera kommandot för att starta appen
# Vi startar Flask-servern och säger åt den att vara synlig på nätverket (host=0.0.0.0)
CMD ["flask", "run", "--host=0.0.0.0"]