@echo off
setlocal
cd /d "%~dp0"
set PORT=8090

python --version >nul 2>&1
if %errorlevel%==0 (
  echo Starting True Ortho 3D Simulator on http://localhost:%PORT% (Python HTTP Server)...
  start "" "http://localhost:%PORT%"
  python -m http.server %PORT%
  goto :eof
)

py --version >nul 2>&1
if %errorlevel%==0 (
  echo Starting True Ortho 3D Simulator on http://localhost:%PORT% (Python Launcher HTTP Server)...
  start "" "http://localhost:%PORT%"
  py -m http.server %PORT%
  goto :eof
)

node --version >nul 2>&1
if %errorlevel%==0 (
  echo Starting True Ortho 3D Simulator on http://localhost:%PORT% (Node.js HTTP Server)...
  start "" "http://localhost:%PORT%"
  node -e "const http=require('http'),fs=require('fs'),path=require('path'),root=process.cwd();const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.geojson':'application/geo+json','.tif':'image/tiff','.tiff':'image/tiff','.asc':'text/plain','.csv':'text/csv','.md':'text/markdown'};http.createServer((req,res)=>{const u=decodeURIComponent(req.url.split('?')[0]);const p=path.normalize(path.join(root,u==='/'?'index.html':u));if(!p.startsWith(root)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);return res.end('Not found');}const ext=path.extname(p).toLowerCase();res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream'});fs.createReadStream(p).pipe(res);}).listen(%PORT%,()=>console.log('Serving TrueOrtho_test at http://localhost:%PORT% (Press Ctrl+C to stop)'));"
  goto :eof
)

echo Python and Node.js were not found on PATH.
echo Opening index.html directly in your default browser (offline mode)...
start "" "%~dp0index.html"
