# ===================================================================
# NEXUS WMS - Lightweight Local Static Web Server (PowerShell & .NET)
# Ticket: SCRUM-87 / SCRUM-35 (Khai báo tồn tối thiểu & Cảnh báo đứt hàng)
# ===================================================================

$port = 8035
$rootPath = $PSScriptRoot

$listener = New-Object System.Net.HttpListener
$url = "http://localhost:$port/"
$listener.Prefixes.Add($url)

try {
    $listener.Start()
    Write-Host "======================================================================" -ForegroundColor Cyan
    Write-Host " [NEXUS WMS] He Thong Quan Ly Kho & Canh Bao Ton Toi Thieu (SCRUM-35)" -ForegroundColor Green
    Write-Host " Dang chay tai: $url" -ForegroundColor Yellow
    Write-Host " Thu muc goc:   $rootPath" -ForegroundColor Gray
    Write-Host " Nhan Ctrl + C de dung server." -ForegroundColor DarkGray
    Write-Host "======================================================================" -ForegroundColor Cyan
    
    # Tu dong mo trinh duyet mac dinh
    Start-Process $url
}
catch {
    Write-Host "Khong the khoi dong HttpListener tren port $port (co the port dang duoc dung)." -ForegroundColor Red
    Write-Host "Mo file index.html truc tiep trong trinh duyet..." -ForegroundColor Yellow
    Start-Process "$rootPath\index.html"
    exit
}

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $relPath = $request.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrEmpty($relPath)) {
            $relPath = "index.html"
        }
        $relPath = $relPath -replace '/', '\'

        $filePath = Join-Path $rootPath $relPath

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
            $response.ContentType = $contentType
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $bytes.Length
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.StatusCode = 200
        }
        else {
            $response.StatusCode = 404
            $notFound = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.OutputStream.Write($notFound, 0, $notFound.Length)
        }
        $response.Close()
    }
    catch {
        # Bo qua client disconnect
    }
}
