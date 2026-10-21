# ===================================================================
# NEXUS OMS - Lightweight Local Web Server (PowerShell & .NET)
# Ticket: SCRUM-86 / SCRUM-9 (Credit Risk Gatekeeper)
# ===================================================================
$port = 5509
$rootPath = $PSScriptRoot

$listener = New-Object System.Net.HttpListener
$url = "http://localhost:$port/"
$listener.Prefixes.Add($url)

try {
    $listener.Start()
    Write-Host "======================================================================" -ForegroundColor Cyan
    Write-Host " [NEXUS OMS] Enterprise Credit Risk Gatekeeper & Order Lifecycle" -ForegroundColor Green
    Write-Host " Running on: $url" -ForegroundColor Yellow
    Write-Host " Web root:   $rootPath" -ForegroundColor Gray
    Write-Host " Ticket:     SCRUM-86 / SCRUM-9" -ForegroundColor Magenta
    Write-Host " Nhan Ctrl + C de dung server." -ForegroundColor DarkGray
    Write-Host "======================================================================" -ForegroundColor Cyan
    
    # Auto open browser
    Start-Process $url
}
catch {
    Write-Host "Khong the khoi dong HttpListener tren port $port. Mo file truc tiep trong trinh duyet..." -ForegroundColor Red
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
        # Silent ignore on close
    }
}
