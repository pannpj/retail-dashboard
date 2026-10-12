#!/bin/bash
cd "$(dirname "$0")"
export RETAIL_DB="/Users/pann/Desktop/RetailDatabaseApp/retail.db"
python3 server.py &
sleep 1
open http://localhost:5051
wait