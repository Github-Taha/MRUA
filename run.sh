#!/usr/bin/sh

node index.js &
cd sites
python3 -m http.server
