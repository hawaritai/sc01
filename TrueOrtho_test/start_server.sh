#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
PORT="${1:-8090}"
URL="http://localhost:${PORT}"

if command -v xdg-open >/dev/null 2>&1; then
  (sleep 1 && xdg-open "${URL}") >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
  (sleep 1 && open "${URL}") >/dev/null 2>&1 &
fi

if command -v python3 >/dev/null 2>&1; then
  echo "Starting True Ortho 3D Simulator on ${URL} (python3)..."
  exec python3 -m http.server "${PORT}"
elif command -v python >/dev/null 2>&1; then
  echo "Starting True Ortho 3D Simulator on ${URL} (python)..."
  exec python -m http.server "${PORT}"
elif command -v node >/dev/null 2>&1; then
  echo "Starting True Ortho 3D Simulator on ${URL} (Node.js)..."
  exec node -e "const http=require('http'),fs=require('fs'),path=require('path'),root=process.cwd();const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.geojson':'application/geo+json','.tif':'image/tiff','.tiff':'image/tiff','.asc':'text/plain','.csv':'text/csv','.md':'text/markdown'};http.createServer((req,res)=>{const u=decodeURIComponent(req.url.split('?')[0]);const p=path.normalize(path.join(root,u==='/'?'index.html':u));if(!p.startsWith(root)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);return res.end('Not found');}const ext=path.extname(p).toLowerCase();res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream'});fs.createReadStream(p).pipe(res);}).listen(${PORT},()=>console.log('Serving at ${URL} (Ctrl+C to stop)'));"
else
  echo "Python or Node.js not found. Open index.html directly in your browser."
  exit 1
fi
