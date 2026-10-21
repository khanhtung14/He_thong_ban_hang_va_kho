# ==============================================================================
# LIGHTWEIGHT STATIC HTTP WEB SERVER IN POWERSHELL FOR NEXUS OMS (SCRUM-86 / SCRUM-15)
# Không cần cài đặt Node.js hay Python, chạy độc lập 100% trên mọi máy tính Windows!
# ==============================================================================

$port = 8085
$listener = New-Object System.Net.HttpListener
$url = "http://127.0.0.1:$port/"

try {
    $listener.Prefixes.Add($url)
    $listener.Start()
} catch {
    # Nếu port 8085 bận, thử port 8086
    $port = 8086
    $url = "http://127.0.0.1:$port/"
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add($url)
    $listener.Start()
}

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "   NEXUS OMS // FIELD SALES ORDER PRINTING & PDF EXPORT SYSTEM" -ForegroundColor Yellow
Write-Host "   SCRUM-86 / SCRUM-15: In & Xuat PDF Don Hang Xac Nhan Dai Ly" -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "Server dang chay tai dia chi: $url" -ForegroundColor White
Write-Host "Dang mo trinh duyet tu dong..." -ForegroundColor Gray

try {
    Start-Process $url -ErrorAction SilentlyContinue
} catch {}

$root = $PSScriptRoot

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $path = $request.Url.LocalPath
        if ($path -eq "/" -or [string]::IsNullOrEmpty($path)) {
            $path = "/index.html"
        }

        $localPath = Join-Path $root ($path.TrimStart('/').Replace('/', '\'))

        if (Test-Path $localPath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
            $mime = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".js"   { "application/javascript; charset=utf-8" }
                ".json" { "application/json; charset=utf-8" }
                ".png"  { "image/png" }
                ".jpg"  { "image/jpeg" }
                ".svg"  { "image/svg+xml; charset=utf-8" }
                ".pdf"  { "application/pdf" }
                Default { "application/octet-stream" }
            }

            $bytes = [System.IO.File]::ReadAllBytes($localPath)
            $response.ContentType = $mime
            $response.ContentLength64 = $bytes.Length
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.OutputStream.Write($msg, 0, $msg.Length)
        }
        $response.Close()
    } catch {
        # Bo qua loi khi client ngat ket noi
    }
}
