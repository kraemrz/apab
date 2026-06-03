FROM python:3.11-slim

WORKDIR /app

# Installera dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Kopiera resten av projektet
COPY . .

# Ge execute-rättighet till entrypoint
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]