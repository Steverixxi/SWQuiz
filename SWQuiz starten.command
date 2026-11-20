#!/bin/bash
# Doppelklick am Mac: startet SWQuiz und öffnet den Browser.
cd "$(dirname "$0")"
PORT=4321
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js fehlt. Installieren mit: brew install node"
  read -r -p "Enter zum Schließen"
  exit 1
fi
if curl -s "http://localhost:$PORT/api/dashboard" >/dev/null 2>&1; then
  open "http://localhost:$PORT"
  exit 0
fi
(sleep 1 && open "http://localhost:$PORT") &
node src/server/index.js
